/**
 * The public type surface (docs/api.md), plus the declaration merging that gives every
 * consumer typed `meta` on TanStack's `ColumnDef` and the `meta.ledger` extension point
 * (docs/state.md) without importing anything extra.
 */
import type { ComboboxData } from "@mantine/core";
import type {
  Cell,
  Column,
  ColumnDef,
  ColumnFiltersState,
  ColumnOrderState,
  ColumnPinningState,
  ColumnSizingState,
  ExpandedState,
  GroupingState,
  PaginationState,
  Row,
  RowData,
  RowPinningState,
  RowSelectionState,
  SortingState,
  Table,
  TableOptions,
  VisibilityState
} from "@tanstack/react-table";
import type { ReactNode } from "react";

/**
 * TanStack's `Table`, renamed so it never collides with Mantine's `Table` in consumer imports.
 */
export type TableInstance<TData> = Table<TData>;

// ------------------------------------------------------------------------------------------------
// Filtering
// ----------------------------------------------------------------------------------------------

export type DataTableFilterVariant = "text" | "select" | "multi-select" | "range" | "date-range";

export interface DataTableFilterConfig {
  variant: DataTableFilterVariant;
  /**
   * Omitted in client mode → derived from faceted values; server mode requires it.
   */
  options?: ComboboxData;
  placeholder?: string;
}

// ------------------------------------------------------------------------------------------------
// Inline editing
// ----------------------------------------------------------------------------------------------

export type DataTableEditVariant = "text" | "number" | "select" | "checkbox";

export interface DataTableEditConfig<TData, TValue> {
  variant: DataTableEditVariant;
  /**
   * `select` options.
   */
  options?: ComboboxData;
  /**
   * Per-row gate on top of the table-level `enableEditing`.
   */
  enabled?: (row: Row<TData>) => boolean;
  /**
   * A non-null message blocks the commit and is shown on the editor.
   */
  validate?: (value: TValue, row: Row<TData>) => string | null;
}

export interface DataTableEditContext<TData, TValue> {
  row: Row<TData>;
  column: Column<TData, TValue>;
  value: TValue;
  setValue: (value: TValue) => void;
  commit: () => void;
  cancel: () => void;
  error: string | null;
}

export interface DataTableEditCommit<TData> {
  row: Row<TData>;
  column: Column<TData, unknown>;
  value: unknown;
  previousValue: unknown;
}

export interface DataTableEditingCell {
  rowId: string;
  columnId: string;
}

export type DataTableEditTrigger = "double-click" | "click";

// ------------------------------------------------------------------------------------------------
// State persistence
// ----------------------------------------------------------------------------------------------

export type DataTablePersistableSlice
  = | "sorting"
    | "columnFilters"
    | "globalFilter"
    | "pagination"
    | "columnVisibility"
    | "columnPinning"
    | "columnOrder"
    | "columnSizing"
    | "grouping";

export interface DataTablePersistState {
  /**
   * Storage key; one table per key.
   */
  key: string;
  /**
   * Which slices persist; defaults to the layout set: sizing, visibility, order, pinning.
   */
  slices?: DataTablePersistableSlice[];
  /**
   * Storage backend; defaults to `localStorage` (guarded — persistence is a no-op without it).
   */
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

// ------------------------------------------------------------------------------------------------
// Behavior options — the useDataTable surface (docs/api.md)
// ----------------------------------------------------------------------------------------------

export interface UseDataTableOptions<TData> {
  data: TData[];
  columns: Array<ColumnDef<TData, any>>;
  getRowId?: (originalRow: TData, index: number, parent?: Row<TData>) => string;

  /* Feature switches — TanStack 8.x names wherever one exists */
  enableSorting?: boolean;
  enableMultiSort?: boolean;
  enableSortingRemoval?: boolean;
  enableColumnFilters?: boolean;
  enableGlobalFilter?: boolean;
  enablePagination?: boolean;
  enableRowSelection?: boolean | ((row: Row<TData>) => boolean);
  enableMultiRowSelection?: boolean;
  enableColumnResizing?: boolean;
  enableColumnPinning?: boolean;
  enableColumnOrdering?: boolean;
  enableHiding?: boolean;
  enableEditing?: boolean;
  enableGrouping?: boolean;
  enableRowPinning?: boolean;

  /* Hierarchy / master–detail */
  getSubRows?: (originalRow: TData) => TData[] | undefined;
  renderDetailPanel?: (row: Row<TData>) => ReactNode;

  /* Client/server split — all default "client" */
  sortingMode?: "client" | "server";
  filterMode?: "client" | "server";
  paginationMode?: "client" | "server";
  /**
   * Server-mode total row count; `pageCount` is derived internally.
   */
  rowCount?: number;

  /* Editing */
  editTrigger?: DataTableEditTrigger;
  onEditCommit?: (change: DataTableEditCommit<TData>) => void | Promise<void>;

  /* State — one independent trio per slice; callbacks receive resolved values */
  sorting?: SortingState;
  defaultSorting?: SortingState;
  onSortingChange?: (value: SortingState) => void;
  columnFilters?: ColumnFiltersState;
  defaultColumnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: (value: ColumnFiltersState) => void;
  globalFilter?: string;
  defaultGlobalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  pagination?: PaginationState;
  defaultPagination?: PaginationState;
  onPaginationChange?: (value: PaginationState) => void;
  rowSelection?: RowSelectionState;
  defaultRowSelection?: RowSelectionState;
  onRowSelectionChange?: (value: RowSelectionState) => void;
  expanded?: ExpandedState;
  defaultExpanded?: ExpandedState;
  onExpandedChange?: (value: ExpandedState) => void;
  columnVisibility?: VisibilityState;
  defaultColumnVisibility?: VisibilityState;
  onColumnVisibilityChange?: (value: VisibilityState) => void;
  columnPinning?: ColumnPinningState;
  defaultColumnPinning?: ColumnPinningState;
  onColumnPinningChange?: (value: ColumnPinningState) => void;
  columnOrder?: ColumnOrderState;
  defaultColumnOrder?: ColumnOrderState;
  onColumnOrderChange?: (value: ColumnOrderState) => void;
  columnSizing?: ColumnSizingState;
  defaultColumnSizing?: ColumnSizingState;
  onColumnSizingChange?: (value: ColumnSizingState) => void;
  grouping?: GroupingState;
  defaultGrouping?: GroupingState;
  onGroupingChange?: (value: GroupingState) => void;
  rowPinning?: RowPinningState;
  defaultRowPinning?: RowPinningState;
  onRowPinningChange?: (value: RowPinningState) => void;
  /**
   * The only non-TanStack slice; editing has no meaningful default.
   */
  editingCell?: DataTableEditingCell | null;
  onEditingCellChange?: (value: DataTableEditingCell | null) => void;

  /* Persistence */
  persistState?: DataTablePersistState;

  defaultColumn?: Partial<ColumnDef<TData, unknown>>;
  /**
   * Full escape hatch, merged first; ledger-managed keys override with a dev warning (docs/state.md).
   */
  tableOptions?: Partial<TableOptions<TData>>;
}

// ------------------------------------------------------------------------------------------------
// Imperative handle
// ----------------------------------------------------------------------------------------------

export interface DataTableScrollToRowOptions {
  align?: "start" | "center" | "end" | "auto";
  behavior?: "auto" | "smooth";
}

export interface DataTableHandle<TData> {
  table: TableInstance<TData>;
  /**
   * The ScrollArea viewport element.
   */
  viewport: HTMLDivElement | null;
  scrollToRow: (rowId: string | number, options?: DataTableScrollToRowOptions) => void;
  startEditing: (rowId: string, columnId: string) => void;
  stopEditing: (options?: { commit?: boolean }) => void;
}

// ------------------------------------------------------------------------------------------------
// meta.ledger — ledger-private state carried on TanStack's sanctioned extension point
// ----------------------------------------------------------------------------------------------

export interface ActiveCellEditor {
  commit: () => void;
  cancel: () => void;
}

export interface LedgerEditingController {
  cell: DataTableEditingCell | null;
  start: (cell: DataTableEditingCell) => void;
  /**
   * Delegates to the mounted editor, then clears the slice. Default `commit: true`.
   */
  stop: (options?: { commit?: boolean }) => void;
  /**
   * Clears the slice directly — called by the editor once its commit/cancel settles.
   */
  clear: () => void;
  /**
   * The active editor registers itself while mounted so `stop` can reach it.
   */
  registerEditor: (editor: ActiveCellEditor | null) => void;
}

export interface LedgerMeta<TData> {
  editing: LedgerEditingController;
  editTrigger: DataTableEditTrigger;
  enableEditing: boolean;
  onEditCommit?: (change: DataTableEditCommit<TData>) => void | Promise<void>;
  renderDetailPanel?: (row: Row<TData>) => ReactNode;
  /**
   * Header checkbox scope: current page when paginated, all filtered rows otherwise (docs/selection.md).
   */
  selectAllScope: "page" | "all";
  /**
   * Anchor row id for shift-range selection.
   */
  selectionAnchor: { current: string | null };
  /**
   * Server-mode total row count (`rowCount`) — the pagination summary's denominator.
   */
  totalRowCount?: number;
  /**
   * Header drag-reorder affordance (ledger-owned; TanStack has state but no switch).
   */
  enableColumnOrdering: boolean;
  /**
   * Pagination master switch (ledger-owned; TanStack expresses it via row-model inclusion).
   */
  enablePagination: boolean;
}

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    /**
     * Logical text alignment — RTL-correct by construction.
     */
    align?: "start" | "center" | "end";
    /**
     * Single-line truncation with a title tooltip (host vocabulary: `Text.truncate`).
     */
    truncate?: boolean;
    /**
     * Header filter UI: a variant shorthand, a config, or a fully custom renderer.
     */
    filter?:
      | DataTableFilterVariant
      | DataTableFilterConfig
      | ((column: Column<TData, TValue>) => ReactNode);
    /**
     * Inline cell editing: a variant shorthand, a config, or a fully custom editor.
     */
    edit?:
      | DataTableEditVariant
      | DataTableEditConfig<TData, TValue>
      | ((ctx: DataTableEditContext<TData, TValue>) => ReactNode);
    headerClassName?: string;
    cellClassName?: string | ((cell: Cell<TData, TValue>) => string | undefined);
  }

  interface TableMeta<TData extends RowData> {
    ledger?: LedgerMeta<TData>;
  }
}

/**
 * Re-exported so consumers can type app-side helpers without reaching into internals.
 */

export { type DataTableLabels } from "./labels";
