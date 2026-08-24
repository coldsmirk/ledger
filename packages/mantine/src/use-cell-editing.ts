import type { RowData } from "@tanstack/react-table";
import type { RefObject } from "react";

import type {
  Cell,
  DataTableEditCommit,
  DataTableEditingCell,
  LedgerCellEditor,
  Row,
  TableInstance
} from "./types";

/**
 * The cell-mode editing session (docs/architecture.md — "Editing sessions live in the controller,
 * not in the editors"). Everything an editor for one cell shows, and everything the commit needs
 * to decide with, lives here: an editor is unmounted by a hidden column or a virtual scroll at any
 * moment, and a session is not. A mounted editor is a view of this plus a keyboard surface.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { canEditCell, editErrorMessage, normalizeEdit } from "./edit-meta";
import { isPromiseLike, useEventCallback } from "./utils";

export interface UseCellEditingInput<TData extends RowData> {
  editingCell: DataTableEditingCell | null;
  enableEditing: boolean;
  setEditingCell: (cell: DataTableEditingCell | null) => void;
  tableRef: RefObject<TableInstance<TData> | null>;
  onEditCommit: ((change: DataTableEditCommit<TData>) => void | Promise<void>) | undefined;
}

export interface CellEditingSession {
  active: (rowId: string, columnId: string) => boolean;
  start: (cell: DataTableEditingCell) => void;
  stop: (options?: { commit?: boolean }) => void;
  clear: () => void;
  commit: () => boolean | Promise<boolean>;
  cancel: () => void;
  read: (rowId: string, columnId: string, source: unknown) => unknown;
  write: (rowId: string, columnId: string, value: unknown) => void;
  pending: (rowId: string, columnId: string) => boolean;
  error: (rowId: string, columnId: string) => string | null;
  register: (rowId: string, columnId: string, editor: LedgerCellEditor) => () => void;
}

interface CellStore {
  rowId: string | null;
  columnId: string | null;
  /**
   * The pending value; null while the session holds nothing the application has not seen.
   */
  draft: { value: unknown } | null;
  /**
   * What this session wrote, against what the data read when it went out. While it stands it is
   * what the cell holds; the effect below retires it for good once the data moves past it.
   */
  written: { value: unknown; source: unknown } | null;
  error: string | null;
  /**
   * The session has sent, or discarded, what it holds. A new value reopens it.
   */
  settled: boolean;
  /**
   * Eligibility was lost during this session. It latches: a gate that reopens before an in-flight
   * write settles is the *next* session's eligibility, not a reprieve for this one.
   */
  gateLost: boolean;
  /**
   * The automatic reconciliation has already answered this session's gate closing.
   */
  reconciled: boolean;
  /**
   * The write currently out, and whether the data has moved since it left. A record is only true
   * while the data has not moved past it, and the moving can happen *during* the request —
   * including out and back again, which comparing at settle time could never see.
   */
  writing: { source: unknown; moved: boolean } | null;
}

function closedStore(): CellStore {
  return {
    columnId: null,
    draft: null,
    error: null,
    gateLost: false,
    reconciled: false,
    rowId: null,
    settled: false,
    writing: null,
    written: null
  };
}

export function useCellEditing<TData extends RowData>({
  editingCell,
  enableEditing,
  setEditingCell,
  tableRef,
  onEditCommit
}: UseCellEditingInput<TData>): CellEditingSession {
  const store = useRef<CellStore>(closedStore());
  /**
   * Bumped whenever a session starts or ends without the slice moving — a gate shutting under a
   * controlled application that declines to close it, or an explicit start on the cell already
   * named. Whether an editor may be on screen is part of the render output, so a change in it has
   * to be a change in state; a ref would leave the last render standing.
   */
  const [epoch, setEpoch] = useState(0);
  /**
   * One session, one token: a settled request may only act on the session that issued it.
   */
  const sessionRef = useRef(0);
  const pendingCommit = useRef<{ promise: Promise<boolean>; session: number } | null>(null);
  const pendingRef = useRef(false);
  /**
   * The editors on screen, each with the cell it belongs to — see `register`.
   */
  const editors = useRef(new Map<LedgerCellEditor, DataTableEditingCell>());
  /**
   * Only the latest navigation request may win after an async commit settles.
   */
  const requestRef = useRef(0);
  /**
   * The cell that actually reached the screen — see the layout effect.
   */
  const renderedRef = useRef(editingCell);
  /**
   * The armed unmount commit, with the session and cell whose departure armed it.
   */
  const unmountCommit = useRef<{
    session: number;
    target: DataTableEditingCell;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  const disarmUnmountCommit = () => {
    const armed = unmountCommit.current;

    if (armed === null) {
      return;
    }

    unmountCommit.current = null;

    if (armed.timer !== null) {
      clearTimeout(armed.timer);
    }
  };

  const redraw = useCallback(() => {
    for (const editor of editors.current.keys()) {
      editor.redraw();
    }
  }, []);

  /**
   * How many editors for `target` are on screen right now.
   */
  const mountedFor = (target: DataTableEditingCell): number => {
    let count = 0;

    for (const owner of editors.current.values()) {
      if (owner.rowId === target.rowId && owner.columnId === target.columnId) {
        count += 1;
      }
    }

    return count;
  };

  const isSession = (rowId: string, columnId: string) => store.current.rowId === rowId && store.current.columnId === columnId;
  const isSessionRef = useRef(isSession);

  const cellFor = (rowId: string, columnId: string): Cell<any, unknown> | null => {
    const tableInstance = tableRef.current;

    if (!tableInstance) {
      return null;
    }

    try {
      const erasedRow = tableInstance.getRow(rowId, true) as Row<any>;

      return erasedRow.getAllCells().find(candidate => candidate.column.id === columnId) ?? null;
    } catch {
      return null;
    }
  };

  /**
   * What the cell holds as far as the application is concerned: the value this session wrote while
   * the data has not moved past it, otherwise the data itself.
   */
  const settledValue = (source: unknown): unknown => {
    const record = store.current.written;

    return record && Object.is(record.source, source) ? record.value : source;
  };

  const settledValueRef = useRef(settledValue);

  /**
   * Whether the cell may still be edited right now — the gate, re-read.
   */
  const stillEditable = (rowId: string, columnId: string): boolean => {
    const cell = cellFor(rowId, columnId);

    return cell !== null && canEditCell(cell, cell.row);
  };

  /**
   * Asks for the session to close. Deliberately not a navigation request: a commit closing the
   * cell it just wrote is the very thing a `start` waiting on that commit is waiting *for*, and
   * cancelling the move it is about to make would strand it. Only explicit navigation — another
   * `start`, or a `stop` — invalidates a pending one.
   */
  const requestClose = useEventCallback(() => setEditingCell(null));

  /**
   * Reconciles the session with the cell that actually reached the screen. Committed in a layout
   * effect, never during render: React may throw a tree away, and a session opened for a cell
   * nobody saw would take the commits meant for the one on screen.
   */
  useLayoutEffect(() => {
    renderedRef.current = editingCell;

    const owner = store.current;
    const moved = owner.rowId !== (editingCell?.rowId ?? null) || owner.columnId !== (editingCell?.columnId ?? null);

    // Judged against what the store holds, not against a mirror of the prop: a table that renders
    // with `editingCell` already set has a session to open on its very first pass, and comparing
    // mirrors would call that "unmoved" and never key the store at all.
    if (!moved) {
      return;
    }

    // A departure that has not fired yet belongs to the session ending here, not to the one
    // starting.
    disarmUnmountCommit();
    sessionRef.current += 1;
    pendingCommit.current = null;
    pendingRef.current = false;
    store.current = editingCell === null
      ? closedStore()
      : {
          ...closedStore(),
          columnId: editingCell.columnId,
          rowId: editingCell.rowId
        };
  });

  const setError = (message: string | null) => {
    store.current.error = message;
    redraw();
  };

  const setPending = (pending: boolean) => {
    pendingRef.current = pending;
    redraw();
  };

  /**
   * Ends the session as a cancellation: what it held is discarded, and the close is requested.
   */
  const markGateLost = () => {
    if (store.current.gateLost) {
      return;
    }

    store.current.gateLost = true;
    setEpoch(token => token + 1);
  };

  /**
   * Ends a session whose eligibility is gone. Idempotent per session, which is what makes the
   * automatic path safe to reach from the effect, from a settling write, and from an editor
   * leaving the screen because the gate took it away — an application that ignores the close
   * would otherwise be asked once for each. An explicit Escape or `stopEditing` is never this: it
   * is always a fresh request.
   */
  const closeLostSession = () => {
    if (store.current.reconciled) {
      return;
    }

    store.current.reconciled = true;
    store.current.draft = null;
    store.current.error = null;
    store.current.settled = true;
    redraw();
    requestClose();
  };

  const cancel = useEventCallback(() => {
    if (pendingRef.current) {
      return;
    }

    store.current.draft = null;
    store.current.error = null;
    store.current.settled = true;
    redraw();
    requestClose();
  });

  const commit = useEventCallback((): boolean | Promise<boolean> => {
    const { rowId, columnId } = store.current;

    if (rowId === null || columnId === null) {
      return true;
    }

    const inFlight = pendingCommit.current;

    if (inFlight && inFlight.session === sessionRef.current) {
      return inFlight.promise;
    }

    if (store.current.settled) {
      if (store.current.gateLost) {
        // This session was cancelled, not finished — its close has already been asked for once,
        // and nothing waiting to move may proceed on the strength of it.
        return false;
      }

      // Nothing new to send. Still a request to leave, though: an application that ignored the
      // first one keeps this session open, and asking again is how it is closed.
      requestClose();

      return true;
    }

    const cell = cellFor(rowId, columnId);

    if (!cell) {
      // The row is not in the table — a target that has not arrived, or one the data no longer
      // holds. Nothing about that is a gate closing, so the session is not cancelled and nothing
      // it holds is discarded; but there is nothing to write either, and an explicit stop still
      // has to be able to close a session waiting on a row that never came.
      store.current.settled = true;
      requestClose();

      return true;
    }

    // Eligibility is re-read here, not trusted from when the session opened: `enableEditing` can
    // switch off, `meta.edit` can be removed, and `edit.enabled(row)` can turn false meanwhile.
    // Committing then would push a value through a gate the application has just shut — and
    // unvalidated, since a closed gate is exactly what `validate` no longer guards. The session
    // is cancelled, which is not the same as finished: nothing waiting to move may do so on it.
    if (!canEditCell(cell, cell.row)) {
      markGateLost();
      closeLostSession();

      return false;
    }

    const source = cell.getValue();
    const previousValue = settledValue(source);
    const value = store.current.draft ? store.current.draft.value : previousValue;

    if (Object.is(value, previousValue)) {
      store.current.settled = true;
      requestClose();

      return true;
    }

    const normalized = normalizeEdit(cell.column.columnDef.meta?.edit);

    try {
      if (normalized?.kind === "variant" && normalized.config.validate) {
        const validationError = normalized.config.validate(value, cell.row);

        if (validationError !== null) {
          setError(validationError);

          return false;
        }
      }
    } catch (error) {
      setError(editErrorMessage(error));

      return false;
    }

    let result: void | Promise<void>;

    try {
      result = onEditCommit?.({
        column: cell.column,
        previousValue,
        row: cell.row,
        value
      } as DataTableEditCommit<TData>);
    } catch (error) {
      setError(editErrorMessage(error));

      return false;
    }

    if (!isPromiseLike(result)) {
      store.current.written = { source, value };
      store.current.draft = null;
      store.current.settled = true;
      requestClose();

      return true;
    }

    const session = sessionRef.current;
    store.current.writing = { moved: false, source };
    setPending(true);

    // The in-flight slot is released inside the handlers rather than in a `finally`: the
    // not-carried branch below commits again, and a settled request must not still be standing
    // there for its own successor to join.
    const promise: Promise<boolean> = Promise.resolve(result).then(
      () => {
        if (session !== sessionRef.current) {
          return false;
        }

        pendingCommit.current = null;
        // A custom editor is not disabled while the request is out, so the user can type straight
        // past it. What this write carried is what the next edit departs from; a value typed since
        // is one it never carried.
        const carried = !store.current.draft || Object.is(store.current.draft.value, value);
        // Unless the data moved while the request was out — then what the application holds is
        // its own, and this write has nothing left to be true about.
        store.current.written = store.current.writing?.moved === true ? null : { source, value };
        store.current.writing = null;
        store.current.settled = carried;

        if (carried) {
          store.current.draft = null;
        }

        setPending(false);

        // The gate may have shut while this write was out — and a gate that reopened before it
        // landed does not undo that. The write stands, but the session it belonged to is over, so
        // nothing waiting to move may do so on the strength of it.
        if (store.current.gateLost || !stillEditable(rowId, columnId)) {
          markGateLost();
          closeLostSession();

          return false;
        }

        if (!carried) {
          // Still on screen: the cell does not close, and whoever was waiting to leave it is told
          // it is not safe to. Gone from the screen: nobody can commit it by hand any more, and an
          // unmount commits rather than discards (docs/editing.md), so this write — which did
          // succeed — is followed by the one it outran. That successor carries the latest value,
          // so it settles `carried` and recurses no further.
          return mountedFor({ columnId, rowId }) > 0 ? false : commit();
        }

        requestClose();

        return true;
      },
      (error: unknown) => {
        if (session !== sessionRef.current) {
          return false;
        }

        pendingCommit.current = null;
        store.current.writing = null;
        setPending(false);
        setError(editErrorMessage(error));

        // A gate that shut while the request was out is answered now that it has landed.
        if (store.current.gateLost || !stillEditable(rowId, columnId)) {
          markGateLost();
          closeLostSession();
        }

        return false;
      }
    );

    pendingCommit.current = { promise, session };

    return promise;
  }) as () => boolean | Promise<boolean>;

  /**
   * Losing eligibility mid-session cancels it, and the loss latches: reopening the gate is the
   * next session's eligibility. Automatic reconciliation is idempotent per session — an explicit
   * Escape or `stopEditing` is always a fresh request, because an application that ignored the
   * last one has to be asked again. It also retires the write record once the data moves past it,
   * permanently, so data returning to what the write departed from cannot resurrect it.
   */
  useEffect(() => {
    const { rowId, columnId } = store.current;

    if (rowId === null || columnId === null) {
      return;
    }

    // The table switch is answered first, and without a cell: a session whose row has not arrived
    // still loses its gate when editing is switched off, and must not be found waiting when it is
    // switched back on.
    if (enableEditing) {
      const cell = cellFor(rowId, columnId);

      if (cell === null) {
        // The row is not in the table: a target that has not arrived, or one the data no longer
        // holds. Neither is an application closing a gate, so the session waits for it.
        return;
      }

      const source = cell.getValue();
      const record = store.current.written;

      if (record && !Object.is(record.source, source)) {
        store.current.written = null;
        redraw();
      }

      // The same watch, for the write still out: it has no record to retire yet, so the movement
      // has to be remembered until it does.
      if (store.current.writing && !Object.is(store.current.writing.source, source)) {
        store.current.writing.moved = true;
      }

      if (canEditCell(cell, cell.row)) {
        return;
      }
    }

    markGateLost();

    // The in-flight write passed the gate before it shut; its settlement completes the cancel.
    if (pendingRef.current) {
      return;
    }

    closeLostSession();
  });

  const clear = useEventCallback(() => {
    if (renderedRef.current !== null) {
      requestClose();
    }
  });

  const stop = useEventCallback((options?: { commit?: boolean }) => {
    // An explicit stop overrules a move still waiting on a commit.
    requestRef.current += 1;

    if (options?.commit ?? true) {
      void Promise.resolve(commit()).catch(() => false);
    } else {
      cancel();
    }
  });

  const start = useEventCallback((target: DataTableEditingCell) => {
    const request = ++requestRef.current;
    const rendered = renderedRef.current;

    if (!rendered || (rendered.rowId === target.rowId && rendered.columnId === target.columnId)) {
      if (isSession(target.rowId, target.columnId) && store.current.gateLost) {
        // The session on this cell is over — its gate shut, and a controlled application declined
        // to close it. An explicit start is not that session coming back: it is the next one, so
        // it gets a new token and nothing the old one held. The slice already names this cell, so
        // no render would arrive to do it for us.
        disarmUnmountCommit();
        sessionRef.current += 1;
        store.current = {
          ...closedStore(),
          columnId: target.columnId,
          rowId: target.rowId
        };
        setEpoch(token => token + 1);
      }

      setEditingCell(target);

      return;
    }

    const committed = commit();

    if (typeof committed === "boolean") {
      if (committed && requestRef.current === request) {
        setEditingCell(target);
      }

      return;
    }

    void Promise.resolve(committed).then(
      success => {
        if (success && requestRef.current === request) {
          setEditingCell(target);
        }
      },
      // Custom editors may still reject despite the boolean-result contract; stay put.
      () => false
    );
  });

  /**
   * An editor registers while it is on screen. Its departure arms the unmount commit, deferred one
   * tick so a remount of the same cell — StrictMode's simulated unmount, or the virtualizer
   * re-mounting a row still in view — cancels it; only a real departure commits, and once nothing
   * is mounted any failure degrades to discard because there is nowhere left to report it.
   *
   * Everything here is decided per target: an editor for one cell must not cancel another cell's
   * departure, and the write that departure sends must not clear a cell that has since come back
   * on screen with something new in it.
   */
  const register = useCallback((rowId: string, columnId: string, editor: LedgerCellEditor) => {
    const target = { columnId, rowId };
    const armed = unmountCommit.current;

    if (armed && armed.session === sessionRef.current && armed.target.rowId === rowId && armed.target.columnId === columnId) {
      disarmUnmountCommit();
    }

    editors.current.set(editor, target);

    return () => {
      editors.current.delete(editor);

      if (mountedFor(target) > 0) {
        return;
      }

      // An editor the gate took off the screen did not depart — the session it belonged to ended,
      // and it has nothing left to commit on the way out.
      if (store.current.gateLost) {
        return;
      }

      const rendered = renderedRef.current;

      if (rendered?.rowId !== rowId || rendered.columnId !== columnId) {
        return;
      }

      // The record identifies itself, so a tick that fires late can only retire its own: two
      // departures in one tick would otherwise have the first one clear the second's record and
      // leave a live timer nothing can cancel.
      const record: { session: number; target: DataTableEditingCell; timer: ReturnType<typeof setTimeout> | null } = {
        session: sessionRef.current,
        target,
        timer: null
      };
      const { session } = record;

      record.timer = setTimeout(() => {
        if (unmountCommit.current === record) {
          unmountCommit.current = null;
        }

        // The tick waited, and the session may have moved on: a switch commits the cell being
        // left and opens the next one in the same render, so this departure can find a different
        // cell in its place. Read the owner *before* reaching for a commit, which always speaks
        // for whatever session is current — otherwise this closes the cell that replaced it.
        if (session !== sessionRef.current || store.current.rowId !== rowId || store.current.columnId !== columnId) {
          return;
        }

        const settle = () => {
          // Only if this is still the session that departed, and nothing has taken the cell back
          // on screen meanwhile — a remounted editor may be holding a value this write never saw,
          // and a failure it can show.
          if (session !== sessionRef.current || mountedFor(target) > 0) {
            return;
          }

          // Nothing is mounted, so a failure — a `validate` rejection, a throw, a rejected
          // promise — has nowhere left to report itself and degrades to discard
          // (docs/editing.md). Discarded rather than merely closed: an application that declines
          // the close would otherwise see the draft and the message come back with the column.
          store.current.draft = null;
          store.current.error = null;
          store.current.settled = true;
          clear();
        };

        const result = commit();

        if (isPromiseLike(result)) {
          void Promise.resolve(result).then(settle, settle);
        } else {
          settle();
        }
      }, 0);

      unmountCommit.current = record;
    };
  }, [commit, clear]);

  // Stable identities all the way out: this surface goes into `meta.ledger`, which the render
  // layer memoizes against — a fresh object or a fresh arrow here would re-render every cell in
  // the table on every render. Each of these reads nothing but refs.
  const read = useCallback((rowId: string, columnId: string, source: unknown) => {
    if (!isSessionRef.current(rowId, columnId)) {
      return source;
    }

    return store.current.draft ? store.current.draft.value : settledValueRef.current(source);
  }, []);

  const write = useCallback((rowId: string, columnId: string, value: unknown) => {
    if (!isSessionRef.current(rowId, columnId)) {
      return;
    }

    store.current.draft = { value };
    store.current.error = null;
    // A new value is a new edit: the session is only still open past a settled commit because the
    // application declined to close it, and what it holds now no write has carried.
    store.current.settled = false;
    redraw();
  }, [redraw]);

  const pending = useCallback((rowId: string, columnId: string) => isSessionRef.current(rowId, columnId) && pendingRef.current, []);

  const active = useCallback(
    // Asked during render, so a cell the store has not been keyed to yet is a session about to
    // open, which is live by definition; only the one being tracked can have lost its gate. Keyed
    // to the epoch: the answer lives in a ref, so this identity changing is what carries a
    // session starting or ending into the render layer's memo.
    (rowId: string, columnId: string) => isSessionRef.current(rowId, columnId) ? !store.current.gateLost : true,
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- the epoch is the point: see above
    [epoch]
  );
  const error = useCallback((rowId: string, columnId: string) => isSessionRef.current(rowId, columnId) ? store.current.error : null, []);

  return useMemo(
    () => {
      return {
        active,
        cancel,
        clear,
        commit,
        error,
        pending,
        read,
        register,
        start,
        stop,
        write
      };
    },
    [active, cancel, clear, commit, error, pending, read, register, start, stop, write]
  );
}
