/**
 * The public type surface (docs/api.md), plus the declaration merging that gives every
 * consumer typed `meta` on TanStack's `ColumnDef` and the `meta.ledger` extension point
 * (docs/state.md) without importing anything extra.
 *
 * TanStack v9 threads a `TFeatures` generic through every type; ledger pre-binds it to the
 * canonical `LedgerFeatures` set here, so the re-exported types keep their v8 arity
 * (`ColumnDef<TData, TValue>`, `Row<TData>`, …) — the feature set is an implementation
 * detail of the package, never a parameter consumers manage.
 */
import type { ComboboxData, MantineBreakpoint, TableTdProps, TableThProps } from "@mantine/core";
import type {
  CellData,
  ColumnFiltersState,
  ColumnOrderState,
  ColumnPinningState,
  ColumnSizingState,
  ColumnVisibilityState,
  ExpandedState,
  FilterFn,
  FilterFnOption,
  GroupingState,
  PaginationState,
  ReactTable,
  RowData,
  RowPinningState,
  RowSelectionState,
  SortingState,
  TableFeatures,
  Cell as TanStackCell,
  Column as TanStackColumn,
  ColumnDef as TanStackColumnDef,
  Header as TanStackHeader,
  HeaderGroup as TanStackHeaderGroup,
  Row as TanStackRow,
  TableOptions as TanStackTableOptions
} from "@tanstack/react-table";
import type { ReactNode } from "react";

import type { DataTableElementProps } from "./element-props";
import type { LedgerFeatures } from "./ledger-features";

/**
 * TanStack's table instance (the enriched React shape: `state`, `Subscribe`, `FlexRender`),
 * feature-bound and renamed so it never collides with Mantine's `Table` in consumer imports.
 */
export type TableInstance<TData extends RowData> = ReactTable<LedgerFeatures, TData>;

// Feature-bound aliases for the TanStack object types ledger re-exports (docs/api.md). The
// `enableResizing` knob is re-attached to `ColumnDef` by hand: ledger owns the resize
// interaction, so TanStack's `columnResizingFeature` — the module that normally contributes
// the option — is deliberately not registered.
export type ColumnDef<TData extends RowData, TValue extends CellData = CellData>
  = TanStackColumnDef<LedgerFeatures, TData, TValue> & { enableResizing?: boolean };
export type Column<TData extends RowData, TValue extends CellData = CellData>
  = TanStackColumn<LedgerFeatures, TData, TValue>;
export type Row<TData extends RowData> = TanStackRow<LedgerFeatures, TData>;
export type Cell<TData extends RowData, TValue extends CellData = CellData>
  = TanStackCell<LedgerFeatures, TData, TValue>;
/**
 * The subject of `meta.headerCellProps` / `meta.footerCellProps`, so it is re-exported too.
 */
export type Header<TData extends RowData, TValue extends CellData = CellData>
  = TanStackHeader<LedgerFeatures, TData, TValue>;
export type HeaderGroup<TData extends RowData> = TanStackHeaderGroup<LedgerFeatures, TData>;

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

export interface DataTableEditConfig<TData extends RowData, TValue> {
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

export interface DataTableEditContext<TData extends RowData, TValue> {
  row: Row<TData>;
  column: Column<TData, TValue>;
  value: TValue;
  setValue: (value: TValue) => void;
  /**
   * Returns whether validation and the application commit succeeded. Async commits resolve to
   * the same result; rejection is presented as an editor error rather than rethrown.
   */
  commit: () => boolean | Promise<boolean>;
  cancel: () => void;
  error: string | null;
  /**
   * A write for this editor is still out — the cell's in cell mode, the whole row's in row mode.
   * The built-in variants disable themselves for the duration; a custom editor is never disabled
   * for it, because the host cannot know what to disable, so it decides for itself
   * (docs/editing.md#custom-editors).
   */
  pending: boolean;
}

export interface DataTableEditCommit<TData extends RowData> {
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

/**
 * `"cell"` (default) edits one cell at a time, committing per cell; `"row"` opens every
 * editable cell of a row at once and commits the row atomically (docs/editing.md#row-mode).
 */
export type DataTableEditMode = "cell" | "row";

export interface DataTableRowEditCommit<TData extends RowData> {
  row: Row<TData>;
  /**
   * Current values for every editable column of the row, keyed by column id — drafts where the
   * user typed, unchanged accessor values elsewhere.
   */
  values: Record<string, unknown>;
  previousValues: Record<string, unknown>;
}

// ------------------------------------------------------------------------------------------------
// CSV export
// ----------------------------------------------------------------------------------------------

export interface DataTableExportMeta<TData extends RowData> {
  /**
   * Column title in the exported header line; defaults to the string `header` (or the id).
   */
  header?: string;
  /**
   * Cell value for the export; defaults to the accessor value. Runs before serialization, so
   * anything `toCsv` can serialize (string, number, Date, object) is a valid return.
   */
  value?: (row: Row<TData>) => unknown;
}

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

export interface UseDataTableOptions<TData extends RowData> {
  data: TData[];
  columns: Array<ColumnDef<TData, any>>;
  getRowId?: (originalRow: TData, index: number, parent?: Row<TData>) => string;

  /* Feature switches — TanStack 9.x names wherever one exists */
  enableSorting?: boolean;
  enableMultiSort?: boolean;
  enableSortingRemoval?: boolean;
  enableColumnFilters?: boolean;
  enableGlobalFilter?: boolean;
  enablePagination?: boolean;
  enableRowSelection?: boolean | ((row: Row<TData>) => boolean);
  enableMultiRowSelection?: boolean;
  /**
   * Ledger-owned switch (TanStack's name): the resize interaction is ledger's own pointer
   * session, so no TanStack option backs it (docs/sizing.md).
   */
  enableColumnResizing?: boolean;
  enableColumnPinning?: boolean;
  enableColumnOrdering?: boolean;
  enableHiding?: boolean;
  enableEditing?: boolean;
  enableGrouping?: boolean;
  enableRowPinning?: boolean;
  /**
   * Cells may merge via the defs' `spanRows` / `spanColumns` (TanStack v9
   * `cellSpanningFeature`). On by default; spanning is ignored while `virtualized` — a merged
   * cell breaks the one-`<tr>`-per-virtual-item invariant.
   */
  enableCellSpanning?: boolean;

  /* Hierarchy / master–detail */
  getSubRows?: (originalRow: TData) => TData[] | undefined;
  renderDetailPanel?: (row: Row<TData>) => ReactNode;

  /* Injected columns — ordinary defs, merged over ledger's (docs/selection.md, docs/rows.md) */
  /**
   * Overrides the injected selection column: its `cell` / `header` renderers, `size`, alignment,
   * anything a `ColumnDef` carries. The reserved `id` is not overridable — it is how ledger
   * recognizes its own column.
   */
  selectionColumn?: Partial<ColumnDef<TData, unknown>>;
  /**
   * Overrides the injected expander column, on the same terms as `selectionColumn`.
   */
  expanderColumn?: Partial<ColumnDef<TData, unknown>>;

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
  editMode?: DataTableEditMode;
  onEditCommit?: (change: DataTableEditCommit<TData>) => void | Promise<void>;
  /**
   * Row-mode atomic commit: every editable column's value, changed or not. Only consulted
   * while `editMode: "row"`.
   */
  onRowEditCommit?: (change: DataTableRowEditCommit<TData>) => void | Promise<void>;

  /**
   * A single keyboard-reachable current row (row click or ↑/↓/Home/End on the focused body;
   * Enter fires `onRowClick`), independent from checkbox selection. Off by default.
   */
  enableActiveRow?: boolean;

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
  columnVisibility?: ColumnVisibilityState;
  defaultColumnVisibility?: ColumnVisibilityState;
  onColumnVisibilityChange?: (value: ColumnVisibilityState) => void;
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
   * Non-TanStack slice (like editing); the value is the active row's id.
   */
  activeRowId?: string | null;
  defaultActiveRowId?: string | null;
  onActiveRowIdChange?: (value: string | null) => void;

  /**
   * Non-TanStack slice; editing has no meaningful default.
   */
  editingCell?: DataTableEditingCell | null;
  onEditingCellChange?: (value: DataTableEditingCell | null) => void;
  /**
   * Row-mode counterpart of `editingCell` (the editing row's id).
   */
  editingRowId?: string | null;
  onEditingRowIdChange?: (value: string | null) => void;

  /* Persistence */
  persistState?: DataTablePersistState;

  defaultColumn?: Partial<ColumnDef<TData, unknown>>;
  /**
   * Custom filter functions, registered by id on the table's feature set so their names are
   * valid `filterFn` / `globalFilterFn` strings (TanStack v9 registry slots). Merged over the
   * built-ins; ledger's two reserved ids win with a dev warning. Read once at mount — the
   * registry wires code, not reactive state.
   */
  filterFns?: Record<string, FilterFn<any, any>>;
  /**
   * Full escape hatch, merged first; ledger-managed keys override with a dev warning (docs/state.md).
   * `globalFilterFn` additionally accepts any string so ids registered through `filterFns`
   * stay usable without a cast — unregistered ids fail at runtime with TanStack's dev warning.
   */
  tableOptions?: Omit<Partial<TanStackTableOptions<LedgerFeatures, TData>>, "globalFilterFn"> & {
    globalFilterFn?: FilterFnOption<LedgerFeatures, TData> | (string & {});
  };
}

// ------------------------------------------------------------------------------------------------
// Imperative handle
// ----------------------------------------------------------------------------------------------

export interface DataTableScrollToRowOptions {
  align?: "start" | "center" | "end" | "auto";
  behavior?: "auto" | "smooth";
}

export interface DataTableHandle<TData extends RowData> {
  table: TableInstance<TData>;
  /**
   * The ScrollArea viewport element.
   */
  viewport: HTMLDivElement | null;
  scrollToRow: (rowId: string | number, options?: DataTableScrollToRowOptions) => void;
  /**
   * Cell mode requires `columnId`; row mode takes the id of any editable column to focus, or
   * none.
   */
  startEditing: (rowId: string, columnId?: string) => void;
  stopEditing: (options?: { commit?: boolean }) => void;
}

// ------------------------------------------------------------------------------------------------
// meta.ledger — ledger-private state carried on TanStack's sanctioned extension point
// ----------------------------------------------------------------------------------------------

/**
 * What a mounted cell-mode editor hands the controller. Only what is genuinely per-instance: the
 * editor holds no state of its own, so everything it shows it reads back from the session.
 */
export interface LedgerCellEditor {
  /**
   * Something the editor shows has changed in the session — draw again.
   */
  redraw: () => void;
}

/**
 * What a mounted row-mode editor hands the controller. Only what is genuinely per-instance: the
 * editor holds no state of its own, so everything else it shows it reads back from the session.
 */
export interface LedgerRowEditor {
  focus: () => void;
  /**
   * Something the editor shows has changed in the session — draw again.
   */
  redraw: () => void;
}

export interface LedgerRowEditingController {
  id: string | null;
  /**
   * Whether this row has a live editing session. The slice naming a row is not enough — its gate
   * may have shut while the application declined to close it — and the render layer asks this
   * before putting an interactive editor on screen.
   */
  active: (rowId: string) => boolean;
  /**
   * Starts editing the row; an already-editing other row is committed first (commit, never
   * discard), and the start only proceeds if that commit succeeds. `focusColumnId` marks
   * which cell's editor autofocuses.
   */
  start: (rowId: string, options?: { focusColumnId?: string }) => void;
  /**
   * Commits (default) or cancels the whole row atomically. Imperative: use `commit` when the
   * answer matters.
   */
  stop: (options?: { commit?: boolean }) => void;
  /**
   * Commits the whole row and reports whether it went through — validation and the application's
   * handler both. What a custom editor's `commit` returns (docs/editing.md#custom-editors).
   */
  commit: () => boolean | Promise<boolean>;
  /**
   * Whether this column's editor should autofocus for the current session.
   */
  shouldFocus: (columnId: string) => boolean;
  /**
   * The row's editing store. It outlives editor unmounts, so a virtualized editing row that
   * scrolls out and back keeps what was typed into it, and it is addressed by row: an editor
   * names the row it belongs to rather than trusting the controller's idea of which row is
   * current, so two rows' editors mounted at once during a switch cannot read each other's
   * values.
   */
  drafts: {
    /**
     * Whether a write for this row is still out. Editors disable themselves on it.
     */
    pending: (rowId: string) => boolean;
    /**
     * The message this column is carrying, if any: a `validate` rejection on that column, or a
     * row-level failure, which lands on the row's first editable column.
     */
    error: (rowId: string, columnId: string) => string | null;
    /**
     * What the editor should show: the pending value if there is one, else what this session has
     * already written, else `source` — the cell's own value.
     */
    read: (rowId: string, columnId: string, source: unknown) => unknown;
    write: (rowId: string, columnId: string, value: unknown) => void;
  };
  register: (columnId: string, editor: LedgerRowEditor) => () => void;
}

export interface LedgerEditingController {
  mode: DataTableEditMode;
  cell: DataTableEditingCell | null;
  /**
   * Whether this cell has a live editing session. The slice naming a cell is not enough — its
   * gate may have shut while the application declined to close it — and the render layer asks
   * this before putting an interactive editor on screen.
   */
  active: (rowId: string, columnId: string) => boolean;
  start: (cell: DataTableEditingCell) => void;
  /**
   * Commits (default) or discards what the session holds. A successful commit asks for the slice
   * to close; a failure keeps the session. Imperative — use `commit` when the answer matters.
   */
  stop: (options?: { commit?: boolean }) => void;
  /**
   * Clears the slice directly.
   */
  clear: () => void;
  /**
   * Commits or discards what the session holds. The editors call these for Enter and Escape; the
   * logic itself belongs to the session, because an editor can be unmounted at any moment.
   */
  commit: () => boolean | Promise<boolean>;
  cancel: () => void;
  /**
   * The cell session's editing store, addressed by cell for the same reason row mode's is
   * addressed by row: two editors for one cell can exist at once while React reconciles a
   * remount, and a settled write must not act on the instance that replaced the one that sent it.
   */
  drafts: {
    pending: (rowId: string, columnId: string) => boolean;
    error: (rowId: string, columnId: string) => string | null;
    /**
     * What the editor should show: the pending value if there is one, else what this session has
     * already written, else `source` — the cell's own value.
     */
    read: (rowId: string, columnId: string, source: unknown) => unknown;
    write: (rowId: string, columnId: string, value: unknown) => void;
  };
  /**
   * A mounted editor registers while it is on screen; its departure arms the unmount commit.
   */
  register: (rowId: string, columnId: string, editor: LedgerCellEditor) => () => void;
  /**
   * Row-mode surface; inert while `mode` is `"cell"`.
   */
  row: LedgerRowEditingController;
}

export interface LedgerMeta<TData extends RowData> {
  /**
   * The stable processed column definitions — the render layer's memo token. TanStack v9
   * re-resolves `table.options` on every state tick, so `options.columns` identity is not a
   * "definitions changed" signal anymore; this reference is.
   */
  columns: Array<ColumnDef<TData, any>>;
  editing: LedgerEditingController;
  filtering: {
    subscribeColumnFilters: (listener: (value: ColumnFiltersState) => void) => () => void;
    subscribeGlobalFilter: (listener: (value: string) => void) => () => void;
  };
  editTrigger: DataTableEditTrigger;
  enableEditing: boolean;
  onEditCommit?: (change: DataTableEditCommit<TData>) => void | Promise<void>;
  onRowEditCommit?: (change: DataTableRowEditCommit<TData>) => void | Promise<void>;
  renderDetailPanel?: (row: Row<TData>) => ReactNode;
  /**
   * Header checkbox scope: current page when paginated, all filtered rows otherwise (docs/selection.md).
   */
  selectAllScope: "page" | "all";
  /**
   * The active-row slice (docs/rows.md): a single keyboard-reachable current row.
   */
  activeRow: {
    enabled: boolean;
    id: string | null;
    set: (id: string | null) => void;
  };
  /**
   * Header drag-reorder affordance (ledger-owned; TanStack has state but no switch).
   */
  enableColumnOrdering: boolean;
  /**
   * Pagination master switch (ledger-owned; TanStack expresses it via row-model inclusion).
   */
  enablePagination: boolean;
  /**
   * Resize affordance switch (ledger-owned; the TanStack option belongs to the unregistered
   * `columnResizingFeature`).
   */
  enableColumnResizing: boolean;
}

declare module "@tanstack/react-table" {
  // eslint-disable-next-line unused-imports/no-unused-vars -- declaration merging requires TanStack's exact type parameter list
  interface ColumnMeta<in out TFeatures extends TableFeatures, in out TData extends RowData, TValue extends CellData = CellData> {
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
    /**
     * DOM props for this column's body cells — static, or per cell.
     */
    cellProps?: DataTableElementProps<Omit<TableTdProps, "ref">, Cell<TData, TValue>>;
    /**
     * DOM props for this column's header cell — static, or per header (group headers included).
     */
    headerCellProps?: DataTableElementProps<Omit<TableThProps, "ref">, Header<TData, TValue>>;
    /**
     * DOM props for this column's footer cell — static, or per footer.
     */
    footerCellProps?: DataTableElementProps<Omit<TableThProps, "ref">, Header<TData, TValue>>;
    /**
     * `toCsv` column control: `false` excludes the column; an object overrides the exported
     * header text or derives the exported value.
     */
    export?: false | DataTableExportMeta<TData>;
    /**
     * Removes the column at and above the breakpoint (host vocabulary: `Box.hiddenFrom`).
     * Breakpoint values follow the Mantine theme.
     */
    hiddenFrom?: MantineBreakpoint;
    /**
     * Shows the column only at and above the breakpoint (host vocabulary: `Box.visibleFrom`).
     */
    visibleFrom?: MantineBreakpoint;
  }

  // eslint-disable-next-line unused-imports/no-unused-vars -- declaration merging requires TanStack's exact type parameter list
  interface TableMeta<in out TFeatures extends TableFeatures, in out TData extends RowData> {
    ledger?: LedgerMeta<TData>;
  }
}

/**
 * Re-exported so consumers can type app-side helpers without reaching into internals.
 */

export { type DataTableLabels } from "./labels";
