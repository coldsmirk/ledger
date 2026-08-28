/**
 * `@coldsmirk/ledger-mantine` — a Mantine-native DataTable on TanStack Table + TanStack Virtual.
 *
 * The behavior layer speaks TanStack's language, the presentation layer speaks Mantine's
 * (docs/DESIGN.md). TanStack is an implementation dependency: everything a consumer needs is
 * re-exported here — never import from `@tanstack/*` directly.
 */

// Ordered by module path, which is what the lint rule sorts on — grouping the exports by concept
// is not available here, so the concepts are catalogued in docs/api.md instead.
export { DataTableColumnsPanel } from "./columns-panel";
export type { DataTableColumnsPanelProps } from "./columns-panel";
export { toCsv } from "./csv";

export type { ToCsvOptions } from "./csv";
export { DataTable } from "./data-table";
export type {
  DataTableBaseProps,
  DataTableCssVariables,
  DataTableFactory,
  DataTableProps,
  DataTableStylesNames
} from "./data-table";
export { checkboxEditor, numberEditor, selectEditor, textEditor } from "./editors";
export type { DataTableElementProps } from "./element-props";
export { defaultIcons } from "./icons";
export type { DataTableIconComponent, DataTableIconProps, DataTableIcons } from "./icons";
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

export type {
  DataTableEditCommit,
  DataTableEditConfig,
  DataTableEditContext,
  DataTableEditingCell,
  DataTableEditMode,
  DataTableEditRenderer,
  DataTableEditTrigger,
  DataTableExportMeta,
  DataTableFilterConfig,
  DataTableFilterVariant,
  DataTableHandle,
  DataTableInstantEditConfig,
  DataTableInstantEditContext,
  DataTableInstantEditRenderer,
  DataTablePersistableSlice,
  DataTablePersistState,
  DataTableRowEditCommit,
  DataTableRowReorder,
  DataTableScrollOptions,
  LedgerCellEditor,
  LedgerEditingController,
  LedgerInstantEditingController,
  LedgerMeta,
  LedgerRowEditingController,
  LedgerRowEditor,
  TableInstance,
  UseDataTableOptions
} from "./types";
export type { Cell, Column, ColumnDef, Header, HeaderGroup, Row } from "./types";
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
