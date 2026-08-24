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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import { canEditCell, editErrorMessage, normalizeEdit } from "./edit-meta";
import { isPromiseLike, useEventCallback } from "./utils";

export interface UseCellEditingInput<TData extends RowData> {
  editingCell: DataTableEditingCell | null;
  setEditingCell: (cell: DataTableEditingCell | null) => void;
  tableRef: RefObject<TableInstance<TData> | null>;
  onEditCommit: ((change: DataTableEditCommit<TData>) => void | Promise<void>) | undefined;
}

export interface CellEditingSession {
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
    written: null
  };
}

export function useCellEditing<TData extends RowData>({
  editingCell,
  setEditingCell,
  tableRef,
  onEditCommit
}: UseCellEditingInput<TData>): CellEditingSession {
  const store = useRef<CellStore>(closedStore());
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
   * The armed unmount commit, and the cell whose departure armed it.
   */
  const unmountCommit = useRef<{ target: DataTableEditingCell; timer: ReturnType<typeof setTimeout> } | null>(null);

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
   * Asks for the session to close. Deliberately not a navigation request: a commit closing the
   * cell it just wrote is the very thing a `start` waiting on that commit is waiting *for*, and
   * cancelling the move it is about to make would strand it. Only explicit navigation — another
   * `start`, or a `stop` — invalidates a pending one.
   */
  /**
   * Whether the cell may still be edited right now — the gate, re-read.
   */
  const stillEditable = (rowId: string, columnId: string): boolean => {
    const cell = cellFor(rowId, columnId);

    return cell !== null && canEditCell(cell, cell.row);
  };

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
      // Nothing new to send. Still a request to leave, though: an application that ignored the
      // first one keeps this session open, and asking again is how it is closed.
      requestClose();

      return true;
    }

    const cell = cellFor(rowId, columnId);

    // Eligibility is re-read here, not trusted from when the session opened: `enableEditing` can
    // switch off, `meta.edit` can be removed, and `edit.enabled(row)` can turn false meanwhile.
    // Committing then would push a value through a gate the application has just shut — and
    // unvalidated, since a closed gate is exactly what `validate` no longer guards.
    if (!cell || !canEditCell(cell, cell.row)) {
      store.current.draft = null;
      store.current.settled = true;
      store.current.gateLost = true;
      requestClose();

      return true;
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
        store.current.written = { source, value };
        store.current.settled = carried;

        if (carried) {
          store.current.draft = null;
        }

        setPending(false);

        // The gate may have shut while this write was out — and a gate that reopened before it
        // landed does not undo that. The write stands, but the session it belonged to is over, so
        // nothing waiting to move may do so on the strength of it.
        if (store.current.gateLost || !stillEditable(rowId, columnId)) {
          store.current.draft = null;
          store.current.settled = true;
          store.current.gateLost = true;
          store.current.reconciled = true;
          redraw();
          requestClose();

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
        setPending(false);
        setError(editErrorMessage(error));

        // A gate that shut while the request was out is answered now that it has landed.
        if (store.current.gateLost || !stillEditable(rowId, columnId)) {
          store.current.draft = null;
          store.current.error = null;
          store.current.settled = true;
          store.current.reconciled = true;
          redraw();
          requestClose();
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

    const cell = cellFor(rowId, columnId);
    const record = store.current.written;

    if (cell && record && !Object.is(record.source, cell.getValue())) {
      store.current.written = null;
      redraw();
    }

    if (cell && canEditCell(cell, cell.row)) {
      return;
    }

    store.current.gateLost = true;

    // The in-flight write passed the gate before it shut; its settlement completes the cancel.
    if (pendingRef.current || store.current.reconciled) {
      return;
    }

    store.current.reconciled = true;
    cancel();
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

    if (armed && armed.target.rowId === rowId && armed.target.columnId === columnId) {
      clearTimeout(armed.timer);
      unmountCommit.current = null;
    }

    editors.current.set(editor, target);

    return () => {
      editors.current.delete(editor);

      if (mountedFor(target) > 0) {
        return;
      }

      const rendered = renderedRef.current;

      if (rendered?.rowId !== rowId || rendered.columnId !== columnId) {
        return;
      }

      const timer = setTimeout(() => {
        unmountCommit.current = null;
        const session = sessionRef.current;

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

      unmountCommit.current = { target, timer };
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
  const error = useCallback((rowId: string, columnId: string) => isSessionRef.current(rowId, columnId) ? store.current.error : null, []);

  return useMemo(
    () => {
      return {
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
    [cancel, clear, commit, error, pending, read, register, start, stop, write]
  );
}
