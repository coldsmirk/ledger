/**
 * What the editing gate is, as the predicates every path shares: how a column's `meta.edit` is
 * read, whether a cell may be edited *right now*, and how a thrown value becomes a message. Not
 * referentially pure, and the difference matters — `canEditCell` calls the application's own
 * `edit.enabled(row)`, which may answer differently with no render in between, which is why the
 * render layer, the commits and the checkbox toggle each ask again rather than cache an answer
 * (docs/architecture.md). The session controllers and the editors both need these, and a
 * controller must not depend on a view module to get them.
 */
import type { ReactNode } from "react";

import type { Cell, DataTableEditConfig, DataTableEditContext, Row } from "./types";

export type NormalizedEdit
  = | { kind: "variant"; config: DataTableEditConfig<any, unknown> }
    | { kind: "custom"; render: (ctx: DataTableEditContext<any, unknown>) => ReactNode };

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
    return { kind: "custom", render: edit };
  }

  return { kind: "variant", config: typeof edit === "string" ? { variant: edit } : edit };
}

/**
 * Whether this cell is editable right now (column meta + table switch + per-row gate).
 */
export function canEditCell(cell: Cell<any, unknown>, row: Row<any>): boolean {
  const { table } = cell.getContext();
  const ledger = table.options.meta?.ledger;

  if (!ledger?.enableEditing) {
    return false;
  }

  // The commit belongs to the application (docs/editing.md), so the handler for the live mode is
  // part of the gate: without it an edit has nowhere to go, and offering one anyway means opening
  // an editor, validating it, closing it "successfully", and writing nothing.
  if (!(ledger.editing.mode === "row" ? ledger.onRowEditCommit : ledger.onEditCommit)) {
    return false;
  }

  const edit = cell.column.columnDef.meta?.edit;

  if (!edit) {
    return false;
  }

  return !(typeof edit === "object" && edit.enabled && !edit.enabled(row));
}

export function isCheckboxEdit(cell: Cell<any, unknown>): boolean {
  const normalized = normalizeEdit(cell.column.columnDef.meta?.edit);

  return normalized?.kind === "variant" && normalized.config.variant === "checkbox";
}
