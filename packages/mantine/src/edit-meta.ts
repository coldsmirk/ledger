/**
 * What the editing gate is, as the predicates every path shares: how a column's `meta.edit` is
 * read, whether a cell may be edited *right now*, and how a thrown value becomes a message. Not
 * referentially pure, and the difference matters — `canEditCell` calls the application's own
 * `edit.enabled(row)`, which may answer differently with no render in between, which is why the
 * render layer, the commits and the checkbox toggle each ask again rather than cache an answer
 * (docs/architecture.md). The session controllers and the editors both need these, and a
 * controller must not depend on a view module to get them.
 */
import type { Cell, DataTableEditRenderer, DataTableInstantEditRenderer, Row } from "./types";

/**
 * One shape for every `meta.edit` form: which interaction model the column declared, its
 * renderer, and the gates. `validate` and `enabled` ride any kind — they are the session's
 * gate and gatekeeper, not properties of the control being rendered.
 */
export type NormalizedEdit
  = | {
    kind: "session";
    render: DataTableEditRenderer<any, unknown>;
    enabled?: (row: Row<any>) => boolean;
    validate?: (value: unknown, row: Row<any>) => string | null;
  }
  | {
    kind: "instant";
    render: DataTableInstantEditRenderer<any, unknown>;
    enabled?: (row: Row<any>) => boolean;
    validate?: (value: unknown, row: Row<any>) => string | null;
  };

export function editErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeEdit(
  edit: NonNullable<Cell<any, unknown>["column"]["columnDef"]["meta"]>["edit"]
): NormalizedEdit | null {
  if (!edit) {
    return null;
  }

  if (typeof edit === "function") {
    return { kind: "session", render: edit };
  }

  if ("instant" in edit) {
    return {
      kind: "instant",
      render: edit.instant,
      enabled: edit.enabled,
      validate: edit.validate
    };
  }

  return {
    kind: "session",
    render: edit.render,
    enabled: edit.enabled,
    validate: edit.validate as NormalizedEdit["validate"]
  };
}

/**
 * The value the cell of *this* render holds, through its own column's accessor.
 *
 * Not `cell.getValue()`: upstream caches a row's values on the row object, and that cache is only
 * rebuilt when `data` changes — so a column whose `accessorFn` changed under the same data would
 * go on answering with the accessor it had before, and an editor drawing from it would show a
 * value the table has stopped holding. Resolving here also means a redraw between renders cannot
 * pick up a definition from a render pass that never reached the screen.
 */
export function cellValue(cell: Cell<any, unknown>): unknown {
  return cell.column.accessorFn?.(cell.row.original, cell.row.index);
}

export interface EditGate {
  enableEditing: boolean;
  /**
   * The commit belongs to the application (docs/editing.md), so the handler for the live mode is
   * part of the gate: without it an edit has nowhere to go, and offering one anyway means opening
   * an editor, validating it, closing it "successfully", and writing nothing.
   */
  hasCommitHandler: boolean;
}

/**
 * The gate itself, over values the caller supplies: the switch and handler of one render, the
 * column's `meta.edit` as that render defined it, and the row it resolved. Every caller decides
 * which render that is — the one being drawn, or the one that reached the screen — because the
 * core they would otherwise read it from carries whichever pass ran last, committed or not
 * (see `use-committed-table.ts`).
 */
export function canEditWith(
  row: Row<any>,
  edit: NonNullable<Cell<any, unknown>["column"]["columnDef"]["meta"]>["edit"],
  gate: EditGate
): boolean {
  if (!gate.enableEditing || !gate.hasCommitHandler) {
    return false;
  }

  if (!edit) {
    return false;
  }

  return !(typeof edit === "object" && edit.enabled && !edit.enabled(row));
}

/**
 * Whether this cell is editable in the render being drawn. Render-phase only: it reads the
 * definitions and switches through the cell's own table, which is the core — correct while a
 * render is in progress, and a trap at event time.
 */
export function canEditCell(cell: Cell<any, unknown>, row: Row<any>): boolean {
  const { table } = cell.getContext();
  const ledger = table.options.meta?.ledger;

  return canEditWith(row, cell.column.columnDef.meta?.edit, {
    enableEditing: ledger?.enableEditing ?? false,
    hasCommitHandler: Boolean(ledger && (ledger.editing.mode === "row" ? ledger.onRowEditCommit : ledger.onEditCommit))
  });
}
