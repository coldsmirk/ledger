/**
 * Column preprocessing for `useDataTable`: inject the selection and expander columns (pinned
 * left, fixed width, excluded from every data feature) and derive `filterFn`s from
 * `meta.filter` variants for columns that declare none themselves.
 */
import type { Column, ColumnDef } from "@tanstack/react-table";

import { ExpanderCell, ExpanderHeaderCell } from "./expander";
import { filterFnByVariant } from "./filter-fns";
import { SelectionCell, SelectionHeaderCell } from "./selection";

export const SELECTION_COLUMN_ID = "ledger:select";
export const EXPANDER_COLUMN_ID = "ledger:expander";

export function isInternalColumn(columnId: string): boolean {
  return columnId === SELECTION_COLUMN_ID || columnId === EXPANDER_COLUMN_ID;
}

/**
 * Human-readable column title where one is statically known — menus, CSV headers.
 */
export function columnHeaderText<TData>(column: Column<TData, unknown>): string {
  const { header } = column.columnDef;

  return typeof header === "string" ? header : column.id;
}

export interface BuildColumnsInput<TData> {

  columns: Array<ColumnDef<TData, any>>;
  withSelection: boolean;
  withExpander: boolean;
}

/**
 * Author-declared sizing, snapshotted per leaf definition BEFORE TanStack merges its default
 * column def (size 150, minSize 20) into every `column.columnDef` — after that merge, "the
 * author declared no size" is indistinguishable from "the author chose 150". The width engine
 * (docs/sizing.md) reads this registry through the per-column meta clone created below.
 */
export interface RawColumnSizing {
  size: number | undefined;
  minSize: number | undefined;
  maxSize: number | undefined;
}

const rawSizingByMeta = new WeakMap<object, RawColumnSizing>();

export function rawColumnSizing(columnDef: { meta?: object }): RawColumnSizing | undefined {
  return columnDef.meta ? rawSizingByMeta.get(columnDef.meta) : undefined;
}

export function buildColumns<TData>({
  columns,
  withSelection,
  withExpander
}: BuildColumnsInput<TData>): Array<ColumnDef<TData, any>> {
  const result: Array<ColumnDef<TData, any>> = [];

  if (withSelection) {
    result.push(processLeaf({
      id: SELECTION_COLUMN_ID,
      size: 40,
      minSize: 40,
      maxSize: 40,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      enableColumnFilter: false,
      enableGlobalFilter: false,
      enableGrouping: false,
      header: ({ table }) => <SelectionHeaderCell table={table} />,
      cell: ({ row, table }) => <SelectionCell row={row} table={table} />
    }));
  }

  if (withExpander) {
    result.push(processLeaf({
      id: EXPANDER_COLUMN_ID,
      size: 36,
      minSize: 36,
      maxSize: 36,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      enableColumnFilter: false,
      enableGlobalFilter: false,
      enableGrouping: false,
      header: ({ table }) => <ExpanderHeaderCell table={table} />,
      cell: ({ row }) => <ExpanderCell row={row} />
    }));
  }

  for (const column of columns) {
    result.push(processColumn(column));
  }

  return result;
}

/**
 * Group definitions recurse so every LEAF gets processed — its raw sizing registered and its
 * `meta.filter` variant mapped.
 */
function processColumn<TData>(column: ColumnDef<TData, any>): ColumnDef<TData, any> {
  if ("columns" in column && Array.isArray(column.columns)) {
    return { ...column, columns: column.columns.map(child => processColumn(child)) };
  }

  return processLeaf(column);
}

function processLeaf<TData>(column: ColumnDef<TData, any>): ColumnDef<TData, any> {
  // A fresh meta clone per leaf keys the raw-sizing registry (and survives TanStack's merge).
  const meta = { ...column.meta };
  rawSizingByMeta.set(meta, {
    size: column.size,
    minSize: column.minSize,
    maxSize: column.maxSize
  });

  return withVariantFilterFn({ ...column, meta });
}

function withVariantFilterFn<TData>(column: ColumnDef<TData, any>): ColumnDef<TData, any> {
  const filter = column.meta?.filter;

  if (!filter || typeof filter === "function" || column.filterFn) {
    return column;
  }

  const variant = typeof filter === "string" ? filter : filter.variant;

  return { ...column, filterFn: filterFnByVariant[variant] };
}
