import type { RowData } from "@tanstack/react-table";

import type { TableInstance } from "./types";

/**
 * CSV export over the live table instance (RFC 4180 quoting, CRLF line ends). Exports accessor
 * columns only, in their current visible order; `selected`/`filtered` scopes read the same row
 * models the screen shows — a server-paginated table can therefore only export the rows it has.
 */
import { columnHeaderText, isInternalColumn } from "./build-columns";

export interface ToCsvOptions {
  /**
   * Which rows to export:
   * - `"filtered"` (default) — everything after filters and sorting, before pagination;
   * - `"all"` — the unfiltered data set;
   * - `"selected"` — the current selection.
   */
  scope?: "filtered" | "all" | "selected";
  delimiter?: string;
  /**
   * Include the header line. Default true.
   */
  withHeaders?: boolean;
}

export function toCsv<TData extends RowData>(table: TableInstance<TData>, options: ToCsvOptions = {}): string {
  const {
    scope = "filtered",
    delimiter = ",",
    withHeaders = true
  } = options;

  const rows = rowsForScope(table, scope);

  const columns = [
    ...table.getStartVisibleLeafColumns(),
    ...table.getCenterVisibleLeafColumns(),
    ...table.getEndVisibleLeafColumns()
  ].filter(column => !isInternalColumn(column.id) && column.accessorFn !== undefined);

  const lines: string[] = [];

  if (withHeaders) {
    lines.push(columns.map(column => escapeCsvValue(columnHeaderText(column), delimiter)).join(delimiter));
  }

  for (const row of rows) {
    lines.push(
      columns
        .map(column => escapeCsvValue(serializeCsvValue(row.getValue(column.id)), delimiter))
        .join(delimiter)
    );
  }

  return lines.join("\r\n");
}

function rowsForScope<TData extends RowData>(table: TableInstance<TData>, scope: NonNullable<ToCsvOptions["scope"]>) {
  switch (scope) {
    case "selected": {
      return table.getSelectedRowModel().rows;
    }

    case "all": {
      return table.getCoreRowModel().rows;
    }

    case "filtered": {
      return table.getPrePaginatedRowModel().rows;
    }
  }
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

function escapeCsvValue(value: string, delimiter: string): string {
  if (value.includes("\"") || value.includes(delimiter) || value.includes("\n") || value.includes("\r")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }

  return value;
}
