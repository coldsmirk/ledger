import type { RowData } from "@tanstack/react-table";

import type { Column, Row, TableInstance } from "./types";

/**
 * CSV export over the live table instance (RFC 4180 quoting, CRLF line ends). Exports accessor
 * columns only, in their current visible order; `meta.export` excludes a column or overrides
 * its exported header/value. Scopes read the same row models the screen shows — a
 * server-paginated table can therefore only export the rows it has.
 */
import { columnHeaderText, isInternalColumn } from "./build-columns";

export interface ToCsvOptions {
  /**
   * Which rows to export:
   * - `"filtered"` (default) — everything after filters and sorting, before pagination;
   * - `"all"` — the unfiltered data set;
   * - `"page"` — the current page (identical to `"filtered"` without pagination);
   * - `"selected"` — the current selection.
   */
  scope?: "filtered" | "all" | "page" | "selected";
  delimiter?: string;
  /**
   * Include the header line. Default true.
   */
  withHeaders?: boolean;
  /**
   * Prefix text a spreadsheet would evaluate as a formula (leading `=`, `+`, `-`, `@`, tab or
   * CR — the OWASP CSV-injection set) with a `'`. Applies to header text and string-valued
   * cells; numeric cells keep their sign. Default false — the quote is data to every
   * non-spreadsheet consumer, so it is opt-in for exports that feed spreadsheets.
   */
  escapeFormulas?: boolean;
}

export function toCsv<TData extends RowData>(table: TableInstance<TData>, options: ToCsvOptions = {}): string {
  const {
    scope = "filtered",
    delimiter = ",",
    withHeaders = true,
    escapeFormulas = false
  } = options;

  const rows = rowsForScope(table, scope);

  const columns = [
    ...table.getStartVisibleLeafColumns(),
    ...table.getCenterVisibleLeafColumns(),
    ...table.getEndVisibleLeafColumns()
  ].filter(column => !isInternalColumn(column.id)
    && column.accessorFn !== undefined
    && column.columnDef.meta?.export !== false);

  const lines: string[] = [];

  if (withHeaders) {
    lines.push(
      columns
        .map(column => {
          const text = exportHeaderText(column);

          return escapeCsvValue(escapeFormulas ? defuseFormula(text) : text, delimiter);
        })
        .join(delimiter)
    );
  }

  for (const row of rows) {
    lines.push(
      columns
        .map(column => {
          const raw = exportCellValue(column, row);
          const text = serializeCsvValue(raw);

          // Only string cells can smuggle a formula; serialized numbers keep their sign.
          return escapeCsvValue(escapeFormulas && typeof raw === "string" ? defuseFormula(text) : text, delimiter);
        })
        .join(delimiter)
    );
  }

  return lines.join("\r\n");
}

function rowsForScope<TData extends RowData>(table: TableInstance<TData>, scope: NonNullable<ToCsvOptions["scope"]>) {
  switch (scope) {
    case "selected": {
      // `rows` is the selected *tree*: a row only appears there if it is selected itself, so a
      // selected child of an unselected parent is nowhere in it. `flatRows` is every selected
      // row, each once, in the order they are drawn.
      return table.getSelectedRowModel().flatRows;
    }

    case "all": {
      return table.getCoreRowModel().rows;
    }

    case "page": {
      return table.getRowModel().rows;
    }

    case "filtered": {
      return table.getPrePaginatedRowModel().rows;
    }
  }
}

function exportHeaderText<TData extends RowData>(column: Column<TData, unknown>): string {
  const exportMeta = column.columnDef.meta?.export;

  return (typeof exportMeta === "object" ? exportMeta.header : undefined) ?? columnHeaderText(column);
}

function exportCellValue<TData extends RowData>(column: Column<TData, unknown>, row: Row<TData>): unknown {
  const exportMeta = column.columnDef.meta?.export;

  return typeof exportMeta === "object" && exportMeta.value
    ? exportMeta.value(row)
    : row.getValue(column.id);
}

function serializeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

const FORMULA_LEAD = /^[=+\-@\t\r]/;

function defuseFormula(value: string): string {
  return FORMULA_LEAD.test(value) ? `'${value}` : value;
}

function escapeCsvValue(value: string, delimiter: string): string {
  if (value.includes("\"") || value.includes(delimiter) || value.includes("\n") || value.includes("\r")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }

  return value;
}
