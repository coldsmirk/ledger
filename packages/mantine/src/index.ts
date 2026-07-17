/**
 * `@coldsmirk/ledger-mantine` — a Mantine-native DataTable on TanStack Table + TanStack Virtual.
 *
 * The behavior layer speaks TanStack's language, the presentation layer speaks Mantine's
 * (docs/DESIGN.md). TanStack is an implementation dependency: everything a consumer needs is
 * re-exported here — never import from `@tanstack/*` directly.
 */

/* Compound components (also available as DataTable.*) */
export { DataTableColumnsMenu } from "./columns-menu";
export type { DataTableColumnsMenuProps } from "./columns-menu";
/* Utilities */
export { toCsv } from "./csv";

export type { ToCsvOptions } from "./csv";
/* Component + hook */
export { DataTable } from "./data-table";
export type {
  DataTableBaseProps,
  DataTableCssVariables,
  DataTableFactory,
  DataTableProps,
  DataTableStylesNames
} from "./data-table";
export { defaultLabels } from "./labels";
export type { DataTableLabels } from "./labels";
export { DataTablePagination } from "./pagination-bar";
export type { DataTablePaginationProps } from "./pagination-bar";
export { DataTableSearch } from "./search";

export type { DataTableSearchProps } from "./search";
export { DataTableSelectionBar } from "./selection-bar";
export type { DataTableSelectionBarProps } from "./selection-bar";
/* Public types (docs/api.md) */
export type {
  ActiveCellEditor,
  DataTableEditCommit,
  DataTableEditConfig,
  DataTableEditContext,
  DataTableEditingCell,
  DataTableEditTrigger,
  DataTableEditVariant,
  DataTableFilterConfig,
  DataTableFilterVariant,
  DataTableHandle,
  DataTablePersistableSlice,
  DataTablePersistState,
  DataTableScrollToRowOptions,
  LedgerEditingController,
  LedgerMeta,
  TableInstance,
  UseDataTableOptions
} from "./types";

export { useDataTable } from "./use-data-table";

/* TanStack surface, curated — knowledge and code transfer directly */
export { createColumnHelper, flexRender } from "@tanstack/react-table";
export type {
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
  RowPinningState,
  RowSelectionState,
  SortingState,
  VisibilityState
} from "@tanstack/react-table";
