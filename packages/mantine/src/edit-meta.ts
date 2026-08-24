/**
 * What the editing gate is, in pure functions: how a column's `meta.edit` is read, whether a cell
 * may be edited right now, and how a thrown value becomes a message. The session controllers and
 * the editors both need these, and a controller must not depend on a view module to get them.
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

/**
 * The inline cell editor host (docs/editing.md). A view of the cell session and a keyboard
 * surface — nothing it shows is its own, because a hidden column or a virtual scroll can unmount
 * it at any moment while the session goes on (docs/architecture.md). Editors are unstyled Mantine
 * inputs filling the cell: a boxed input inside a table cell is visual noise.
 */
