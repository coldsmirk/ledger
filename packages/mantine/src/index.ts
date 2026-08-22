/**
 * `@coldsmirk/ledger-mantine` — a Mantine-native DataTable on TanStack Table + TanStack Virtual.
 *
 * The behavior layer speaks TanStack's language, the presentation layer speaks Mantine's
 * (docs/DESIGN.md). TanStack is an implementation dependency: everything a consumer needs is
 * re-exported here — never import from `@tanstack/*` directly.
 */

/* Compound components (also available as DataTable.*) */
export { DataTableColumnsPanel } from "./columns-panel";
export type { DataTableColumnsPanelProps } from "./columns-panel";
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
// TanStack surface, curated — knowledge and code transfer directly. Object types are
// pre-bound to the canonical feature set (`LedgerFeatures`), keeping their v8 arity.
export { createColumnHelper } from "./ledger-features";
export type { LedgerFeatures } from "./ledger-features";
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
  DataTableExportMeta,
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
export type { Cell, Column, ColumnDef, Row } from "./types";
export { useDataTable } from "./use-data-table";

export { flexRender } from "@tanstack/react-table";
export type {
  ColumnFiltersState,
  ColumnOrderState,
  ColumnPinningState,
  ColumnSizingState,
  ColumnVisibilityState,
  ExpandedState,
  GroupingState,
  PaginationState,
  RowData,
  RowPinningState,
  RowSelectionState,
  SortingState
} from "@tanstack/react-table";
