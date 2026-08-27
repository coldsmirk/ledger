import type { KeyboardEvent } from "react";

import type { Cell } from "./types";

/**
 * The editor hosts, for both modes. Each is a view of its session plus a keyboard surface: the
 * draft, the validation, the in-flight commit and the failure all belong to the controller, so
 * that a hidden column or a virtual scroll unmounting an editor takes nothing with it
 * (docs/architecture.md). The host renders no control of its own — the renderer the column
 * declared does (docs/editing.md#editors) — it supplies the context, the keyboard map, the blur
 * commit, and the pending presentation around it.
 */
import { Loader } from "@mantine/core";
import { useLayoutEffect, useReducer, useRef } from "react";

import { columnHeaderText } from "./build-columns";
import { useDataTableContext } from "./context";
import { cellValue, normalizeEdit } from "./edit-meta";
import { useEventCallback } from "./utils";

export { canEditCell } from "./edit-meta";

export function CellEditor({ cell }: { cell: Cell<any, unknown> }) {
  const { labels, getStyles } = useDataTableContext();
  const { table } = cell.getContext();
  const editing = table.options.meta?.ledger?.editing;
  const normalized = normalizeEdit(cell.column.columnDef.meta?.edit);
  const rowId = cell.row.id;
  const columnId = cell.column.id;

  const [, redraw] = useReducer((token: number) => token + 1, 0);
  const redrawFromSession = useEventCallback(() => redraw());

  // Layout, not passive: the registry is what "on screen right now" means to the session, and a
  // commit that unmounts this editor is followed by microtasks — a settling write among them —
  // long before a passive cleanup would run.
  const register = editing?.register;

  // Bound to the controller and the cell, not to this component's lifetime: in hook mode the
  // table can be swapped for another instance while React keeps this editor, and a registration
  // left with the controller that is gone means the one now in charge cannot reach it.
  useLayoutEffect(
    () => register?.(rowId, columnId, { redraw: redrawFromSession }),
    [register, rowId, columnId, redrawFromSession]
  );

  // An instant column has no session for this host to draw — a change in the cell is the commit
  // (docs/editing.md#instant-editing) — so a programmatic `startEditing` on one renders nothing.
  if (!normalized || normalized.kind === "instant" || !editing) {
    return null;
  }

  const draft = editing.drafts.read(rowId, columnId, cellValue(cell));
  const editError = editing.drafts.error(rowId, columnId);
  const pending = editing.drafts.pending(rowId, columnId);

  const setValue = (value: unknown) => {
    editing.drafts.write(rowId, columnId, value);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case "Enter": {
        event.preventDefault();
        void editing.commit();

        break;
      }

      case "Escape": {
        event.preventDefault();
        event.stopPropagation();
        editing.cancel();

        break;
      }

      case "Tab": {
        event.preventDefault();
        // The session owns the move: where the caret goes next depends on the row as the screen
        // has it, and this editor could only ask the shared core (docs/architecture.md).
        editing.moveTo(event.shiftKey);

        break;
      }
    // No default
    }
  };

  const editor = normalized.render({
    row: cell.row,
    column: cell.column,
    value: draft,
    setValue,
    commit: () => editing.commit(),
    cancel: () => editing.cancel(),
    error: editError,
    pending,
    mode: "cell",
    autoFocus: true,
    label: labels.editColumn(columnHeaderText(cell.column))
  });

  return (
    <div
      aria-busy={pending || undefined}
      aria-label={pending ? labels.editPending : undefined}
      data-pending={pending || undefined}
      onBlur={event => {
        // Blur commits — unless focus moved elsewhere inside the editor (e.g. a select option).
        if (!event.currentTarget.contains(event.relatedTarget)) {
          editing.commit();
        }
      }}
      onClick={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      {...getStyles("cellEditor")}
    >
      {editor}
      {pending && <Loader size={12} />}
    </div>
  );
}

/**
 * The row-mode editor host (docs/editing.md#row-mode): one per editable cell of the editing
 * row, all mounted at once. Drafts write through to the controller's store (they must survive
 * a virtualized unmount), blur never commits, and Enter/Escape commit or cancel the whole row.
 */
export function RowCellEditor({ cell }: { cell: Cell<any, unknown> }) {
  const { labels, getStyles } = useDataTableContext();
  const { table } = cell.getContext();
  const editing = table.options.meta?.ledger?.editing;
  const rowApi = editing?.row;
  const normalized = normalizeEdit(cell.column.columnDef.meta?.edit);
  const columnId = cell.column.id;
  const rowId = cell.row.id;

  // The store is the value, not a copy of it: what the row holds moves under an open editor —
  // the application feeds a write back, normalizes it, or the controller throws the edit away —
  // and local state would go on showing a value the row had already left behind. Rendering is
  // the only thing left to ask for.
  const [, redraw] = useReducer((token: number) => token + 1, 0);
  const draft = rowApi ? rowApi.drafts.read(rowId, columnId, cellValue(cell)) : cellValue(cell);
  const editError = rowApi?.drafts.error(rowId, columnId) ?? null;
  const pending = rowApi?.drafts.pending(rowId) ?? false;
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Ref-read, not consumed — StrictMode's remount and virtualizer round-trips keep the focus.
  const autoFocus = rowApi?.shouldFocus(columnId) ?? false;

  const setValue = useEventCallback((value: unknown) => {
    rowApi?.drafts.write(rowId, columnId, value);
    redraw();
  });

  /**
   * Everything this editor shows lives in the session, so a change there is answered by drawing
   * again — there is nothing here to put back.
   */
  const redrawFromSession = useEventCallback(() => redraw());

  const focusEditor = useEventCallback(() => {
    containerRef.current
      ?.querySelector<HTMLElement>(":scope input, :scope select, :scope textarea, :scope button")
      ?.focus();
  });
  const register = rowApi?.register;

  // Layout, not passive: the registry is what "on screen right now" means to the session, and a
  // commit that unmounts this editor is followed by microtasks — a settling write among them —
  // long before a passive cleanup would have run. A registration that outlives its DOM would put
  // a failure on a column nobody can see. Bound to the controller and the column, not to this
  // component's lifetime: in hook mode the table can be swapped for another instance while React
  // keeps this editor, and a registration left with the controller that is gone means the one
  // now in charge cannot reach it.
  useLayoutEffect(() => register?.(columnId, { focus: focusEditor, redraw: redrawFromSession }), [register, columnId, focusEditor, redrawFromSession]);

  if (!normalized || !editing) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    // An inner control that consumed the key (a select picking its option) keeps it.
    if (event.defaultPrevented) {
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      editing.row.stop({ commit: true });
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      editing.row.stop({ commit: false });
    }
  };

  const label = labels.editColumn(columnHeaderText(cell.column));

  const editor
    = normalized.kind === "instant"
      ? normalized.render({
          row: cell.row,
          column: cell.column,
          value: draft,
          // In row mode an instant control joins the row like any other editor: its commit
          // stages the value in the row draft, and the atomic row commit owns the write
          // (docs/editing.md#instant-editing).
          commit: (value: unknown) => {
            setValue(value);

            return true;
          },
          error: editError,
          pending,
          label
        })
      : normalized.render({
          row: cell.row,
          column: cell.column,
          value: draft,
          setValue,
          // Row mode: commit/cancel operate on the whole row, matching the keyboard map. The
          // result is the row's real one — validation across every editable column, and the
          // application's handler — not an acknowledgement that the request was made.
          commit: () => editing.row.commit(),
          cancel: () => editing.row.stop({ commit: false }),
          error: editError,
          pending,
          mode: "row",
          autoFocus,
          label
        });

  return (
    <div
      ref={containerRef}
      aria-busy={pending || undefined}
      aria-label={pending ? labels.editPending : undefined}
      data-pending={pending || undefined}
      onClick={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      {...getStyles("cellEditor")}
    >
      {editor}
      {pending && <Loader size={12} />}
    </div>
  );
}
