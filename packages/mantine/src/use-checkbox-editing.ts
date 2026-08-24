import type { RowData } from "@tanstack/react-table";

import type { DataTableEditCommit, LedgerCellEditor } from "./types";
import type { CommittedTable } from "./use-committed-table";

/**
 * The checkbox variant's transient edits (docs/editing.md). A checkbox never enters edit mode —
 * toggling *is* the commit — so there is no session to open, hold a draft in, or close. What a
 * toggle leaves behind still outlives the control that sent it: a write still out, the failure it
 * came back with, and the value the application now holds. Hiding the column, a responsive
 * breakpoint, or a virtual scroll unmounts that control at any moment, and none of those are the
 * write landing — so it lives here, and the checkbox is a view of it.
 *
 * Addressed by target rather than by session: unlike cell mode, any number of checkboxes can have
 * a write out at once, and each one's pending, failure and record are its own. Nested by row and
 * then column, never a joined key: row and column ids are opaque application strings, and any
 * separator is one an id may contain.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";

import { editErrorMessage, normalizeEdit } from "./edit-meta";
import { isPromiseLike, useEventCallback } from "./utils";

export interface UseCheckboxEditingInput<TData extends RowData> {
  /**
   * Rows, definitions and the gate as the render that reached the screen left them — never the
   * cell's own table, which is the shared core (see `use-committed-table.ts`).
   */
  committed: CommittedTable;
  onEditCommit: ((change: DataTableEditCommit<TData>) => void | Promise<void>) | undefined;
}

export interface CheckboxEditingSession {
  /**
   * What the checkbox shows: the value this target has written while the data has not moved past
   * it, else the data's own.
   */
  checked: (rowId: string, columnId: string, source: unknown) => boolean;
  pending: (rowId: string, columnId: string) => boolean;
  error: (rowId: string, columnId: string) => string | null;
  toggle: (rowId: string, columnId: string) => void;
  register: (rowId: string, columnId: string, editor: LedgerCellEditor) => () => void;
}

interface CheckboxTarget {
  /**
   * The write currently out. `moved` records that the data left what the write departed from
   * while it was still in flight — including leaving and coming back, which comparing once at
   * settle time could never see. `lost` records that the gate shut behind it: the write passed
   * before that and will still land, but the failure it may come back with has nowhere left to be
   * shown, and a gate that reopens is not a reprieve for it.
   */
  request: { token: number; value: boolean; source: unknown; moved: boolean; lost: boolean } | null;
  /**
   * What this target wrote, against what the data read when it went out. While it stands it is
   * what the cell holds — which is what the next toggle departs from, so an application whose
   * data has not caught up is not asked to make the same change twice.
   */
  written: { value: boolean; source: unknown } | null;
  error: string | null;
  editors: Set<LedgerCellEditor>;
}

type TargetStore = Map<string, Map<string, CheckboxTarget>>;

function findTarget(store: TargetStore, rowId: string, columnId: string): CheckboxTarget | undefined {
  return store.get(rowId)?.get(columnId);
}

/**
 * The gate has shut on this target. There is no session to cancel — a toggle is over the moment
 * it is sent — but the failure it was showing has nowhere left to be shown, and a write still out
 * must not bring one back when the gate reopens. Reports whether anything a control shows changed.
 */
function loseGate(target: CheckboxTarget): boolean {
  let touched = false;

  if (target.error !== null) {
    target.error = null;
    touched = true;
  }

  if (target.request) {
    target.request.lost = true;
  }

  return touched;
}

function redraw(target: CheckboxTarget): void {
  for (const editor of target.editors) {
    editor.redraw();
  }
}

/**
 * What the cell holds as far as the application is concerned.
 */
function effectiveValue(target: CheckboxTarget | undefined, source: unknown): boolean {
  const record = target?.written;

  return record && Object.is(record.source, source) ? record.value : Boolean(source);
}

export function useCheckboxEditing<TData extends RowData>({
  committed,
  onEditCommit
}: UseCheckboxEditingInput<TData>): CheckboxEditingSession {
  const targets = useRef<TargetStore>(new Map());
  /**
   * One write, one token: only the request still standing for a target may act on it.
   */
  const tokenRef = useRef(0);

  const openTarget = (rowId: string, columnId: string): CheckboxTarget => {
    let columns = targets.current.get(rowId);

    if (!columns) {
      columns = new Map();
      targets.current.set(rowId, columns);
    }

    let target = columns.get(columnId);

    if (!target) {
      target = {
        editors: new Set(),
        error: null,
        request: null,
        written: null
      };
      columns.set(columnId, target);
    }

    return target;
  };

  /**
   * A target that has nothing left to remember and nothing on screen is not a target.
   */
  const dropIfEmpty = (rowId: string, columnId: string, target: CheckboxTarget) => {
    if (target.editors.size > 0 || target.request || target.written || target.error !== null) {
      return;
    }

    const columns = targets.current.get(rowId);

    columns?.delete(columnId);

    if (columns?.size === 0) {
      targets.current.delete(rowId);
    }
  };

  const settle = (rowId: string, columnId: string, token: number, message: string | null) => {
    const target = findTarget(targets.current, rowId, columnId);
    const request = target?.request;

    // Only the request still standing here may act: anything else was superseded, or belongs to a
    // target the data no longer holds.
    if (!target || !request || request.token !== token) {
      return;
    }

    target.request = null;

    if (message === null) {
      // Unless the data moved while the request was out — then what the application holds is its
      // own, and this write has nothing left to be true about.
      if (!request.moved) {
        target.written = { source: request.source, value: request.value };
      }
    } else if (!request.lost) {
      target.error = message;
    }

    redraw(target);
    dropIfEmpty(rowId, columnId, target);
  };

  const toggle = useEventCallback((rowId: string, columnId: string) => {
    const row = committed.row(rowId);

    if (!row) {
      return;
    }

    // Eligibility is re-read here, not trusted from the render that put this control on screen:
    // `edit.enabled` is application code, and nothing makes it answer the same way twice, so a
    // click can be the first thing to learn that the gate is shut. Both editing modes' commits
    // re-read it for exactly this reason (docs/architecture.md) — a toggle is a commit, and the
    // one path that skipped the check would write through a gate the application had closed, and
    // unvalidated besides, since a closed gate is what `validate` no longer guards. Asked before
    // anything is opened, so that a click which does not pass leaves nothing behind at all.
    if (!committed.canEdit(rowId, columnId)) {
      const shut = findTarget(targets.current, rowId, columnId);

      if (shut) {
        if (loseGate(shut)) {
          redraw(shut);
        }

        dropIfEmpty(rowId, columnId, shut);
      }

      return;
    }

    const target = openTarget(rowId, columnId);

    // One write at a time per target: the control is disabled while its own is out, and a second
    // request would race the first to describe the same cell. Other targets are unaffected —
    // there is no shared session for them to join.
    if (target.request) {
      return;
    }

    const source = committed.value(rowId, columnId);
    // What the application last knew, which after a write it has not fed back is that write —
    // not the data, which would ask it to make the same change twice.
    const previousValue = effectiveValue(target, source);
    const value = !previousValue;

    target.error = null;

    const normalized = normalizeEdit(committed.edit(columnId));

    try {
      if (normalized?.kind === "variant" && normalized.config.validate) {
        const validationError = normalized.config.validate(value, row);

        if (validationError !== null) {
          target.error = validationError;
          redraw(target);

          return;
        }
      }
    } catch (error) {
      target.error = editErrorMessage(error);
      redraw(target);

      return;
    }

    let result: void | Promise<void>;

    try {
      result = onEditCommit?.({
        column: committed.column(columnId),
        previousValue,
        row,
        value
      } as DataTableEditCommit<TData>);
    } catch (error) {
      target.error = editErrorMessage(error);
      redraw(target);

      return;
    }

    if (!isPromiseLike(result)) {
      target.written = { source, value };
      redraw(target);

      return;
    }

    const token = ++tokenRef.current;
    target.request = {
      lost: false,
      moved: false,
      source,
      token,
      value
    };
    redraw(target);

    void Promise.resolve(result).then(
      () => settle(rowId, columnId, token, null),
      (error: unknown) => settle(rowId, columnId, token, editErrorMessage(error))
    );
  });

  /**
   * Reconciles every target with the table it lives in. Two things move under a transient edit:
   * the data can leave what a write departed from — the record retires for good, so data that
   * later returns to it cannot bring the value back with it — and the gate can shut, which takes
   * the control off the screen and with it any failure it was showing.
   *
   * Passive, not layout: nothing has to be keyed before a checkbox can be clicked. No dependency
   * array, because what it watches is `enableEditing`, the column definitions and every target's
   * own data at once — nothing a list describes.
   */
  useEffect(() => {
    // Iterated live: `dropIfEmpty` deletes from these maps as it goes, which a Map iterator is
    // defined to tolerate — an entry removed before it is reached is simply not visited.
    for (const [rowId, columns] of targets.current) {
      for (const [columnId, target] of columns) {
        const row = committed.row(rowId);
        let touched = false;

        if (row) {
          const source = committed.value(rowId, columnId);

          if (target.written && !Object.is(target.written.source, source)) {
            target.written = null;
            touched = true;
          }

          // The same watch, for the write still out: it has no record to retire yet, so the
          // movement has to be remembered until it does.
          if (target.request && !Object.is(target.request.source, source)) {
            target.request.moved = true;
          }
        }

        // A row the table does not hold has not arrived, or the data no longer holds it. Neither
        // is an application shutting a gate; the table-level one — the switch and the mode's
        // commit handler — is, either way, and is answered without needing the row at all.
        const eligible = committed.tableGate() && (row === null || committed.canEdit(rowId, columnId));

        if (!eligible) {
          touched = loseGate(target) || touched;
        }

        if (touched) {
          redraw(target);
        }

        dropIfEmpty(rowId, columnId, target);
      }
    }
  });

  // Stable identities all the way out: this surface goes into `meta.ledger`, which the render
  // layer memoizes against. Each of these reads nothing but refs.
  const checked = useCallback(
    (rowId: string, columnId: string, source: unknown) => effectiveValue(findTarget(targets.current, rowId, columnId), source),
    []
  );
  const pending = useCallback((rowId: string, columnId: string) => Boolean(findTarget(targets.current, rowId, columnId)?.request), []);
  const error = useCallback((rowId: string, columnId: string) => findTarget(targets.current, rowId, columnId)?.error ?? null, []);

  /**
   * A checkbox registers while it is on screen, so the target it belongs to can tell it to draw
   * what it now holds. Bound to the controller and the cell, not to the component's lifetime: in
   * hook mode the table can be swapped for another instance while React keeps this control.
   */
  const register = useCallback((rowId: string, columnId: string, editor: LedgerCellEditor) => {
    openTarget(rowId, columnId).editors.add(editor);

    return () => {
      const target = findTarget(targets.current, rowId, columnId);

      if (!target) {
        return;
      }

      target.editors.delete(editor);
      dropIfEmpty(rowId, columnId, target);
    };
  }, []);

  return useMemo(
    () => {
      return {
        checked,
        error,
        pending,
        register,
        toggle
      };
    },
    [checked, error, pending, register, toggle]
  );
}
