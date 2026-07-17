# API reference

The complete public surface of `@coldsmirk/ledger-mantine`, as implemented. Feature semantics live in the guides; this page is the lookup table.

- [Entry points and re-exports](#entry-points-and-re-exports)
- [`UseDataTableOptions`](#usedatatableoptionstdata) (behavior — hook mode and sugar mode alike)
- [`DataTableProps`](#datatablepropstdata) (presentation)
- [Column `meta`](#column-meta)
- [Editing types](#editing-types)
- [Filter types](#filter-types)
- [Persistence types](#persistence-types)
- [Imperative handle](#imperative-handle)
- [Compound components](#compound-components)
- [`toCsv`](#tocsv)
- [Labels](#labels)
- [`meta.ledger`](#metaledger)

## Entry points and re-exports

```ts
import {
  DataTable,            // the component (+ .Search / .ColumnsPanel / .Pagination / .SelectionBar)
  useDataTable,         // options → bare TanStack Table instance
  toCsv,                // CSV export over a table instance
  defaultLabels,        // English label set
  createColumnHelper,   // TanStack, re-exported
  flexRender            // TanStack, re-exported
} from "@coldsmirk/ledger-mantine";

import { zhCN } from "@coldsmirk/ledger-mantine/locales";
import "@coldsmirk/ledger-mantine/styles.css";
```

Re-exported TanStack types (consumers never import `@tanstack/*`): `ColumnDef`, `Column`, `Row`, `Cell`, `SortingState`, `ColumnFiltersState`, `PaginationState`, `RowSelectionState`, `ExpandedState`, `VisibilityState`, `ColumnPinningState`, `ColumnOrderState`, `ColumnSizingState`, `GroupingState`, `RowPinningState`, and `Table` renamed to **`TableInstance`** (avoiding the collision with Mantine's `Table`).

ledger-owned types: `DataTableProps`, `DataTableBaseProps`, `UseDataTableOptions`, `DataTableHandle`, `DataTableScrollToRowOptions`, `DataTableLabels`, `DataTableFilterVariant`, `DataTableFilterConfig`, `DataTableEditVariant`, `DataTableEditConfig`, `DataTableEditContext`, `DataTableEditCommit`, `DataTableEditingCell`, `DataTableEditTrigger`, `DataTablePersistState`, `DataTablePersistableSlice`, `LedgerMeta`, `LedgerEditingController`, `ActiveCellEditor`, `ToCsvOptions`, plus the Styles API types `DataTableFactory`, `DataTableStylesNames`, `DataTableCssVariables`.

Package exports: `.` (dual ESM+CJS with types), `./locales`, `./styles.css`, `./package.json`. Peers: `@mantine/core` ^9, `@mantine/hooks` ^9, `react`/`react-dom` ^19.2. Direct dependencies: `@tanstack/react-table` ^8.21, `@tanstack/react-virtual` ^3.14, `@dnd-kit/react` ^0.5, `@dnd-kit/helpers` ^0.5, `clsx`.

## `UseDataTableOptions<TData>`

Accepted by `useDataTable(options)` and, flattened, by `<DataTable …>` in sugar mode. `table` and `data`/`columns` are mutually exclusive at the type level.

### Data

| Option | Type | Notes |
| --- | --- | --- |
| `data` | `TData[]` | Keep the identity stable per snapshot |
| `columns` | `ColumnDef<TData, any>[]` | Raw TanStack defs; keep the identity stable |
| `getRowId` | `(row, index, parent?) => string` | Stable ids — required in practice for selection/expansion/editing |
| `defaultColumn` | `Partial<ColumnDef<TData, unknown>>` | TanStack's column defaults |

### Feature switches

| Option | Default | Guide |
| --- | --- | --- |
| `enableSorting` | `true` | [sorting.md](sorting.md) |
| `enableMultiSort` | `true` (shift-click appends) | [sorting.md](sorting.md) |
| `enableSortingRemoval` | `true` (third click clears) | [sorting.md](sorting.md) |
| `enableColumnFilters` | `true` | [filtering.md](filtering.md) |
| `enableGlobalFilter` | `false` | [filtering.md](filtering.md) |
| `enablePagination` | `false` | [pagination.md](pagination.md) |
| `enableRowSelection` | `false` — `boolean \| (row) => boolean` | [selection.md](selection.md) |
| `enableMultiRowSelection` | `true`; `false` = single-select | [selection.md](selection.md) |
| `enableColumnResizing` | `false` | [columns.md](columns.md) |
| `enableColumnPinning` | `true` | [pinning.md](pinning.md) |
| `enableColumnOrdering` | `false` (ledger-owned name) | [columns.md](columns.md) |
| `enableHiding` | `true` | [columns.md](columns.md) |
| `enableEditing` | `true` (columns still opt in via `meta.edit`) | [editing.md](editing.md) |
| `enableGrouping` | `false` | [grouping.md](grouping.md) |
| `enableRowPinning` | `false` | [pinning.md](pinning.md) |

### Hierarchy and master–detail

| Option | Type | Guide |
| --- | --- | --- |
| `getSubRows` | `(row: TData) => TData[] \| undefined` | [rows.md](rows.md) |
| `renderDetailPanel` | `(row: Row<TData>) => ReactNode` | [rows.md](rows.md) |

### Client/server split

| Option | Type / default | Guide |
| --- | --- | --- |
| `sortingMode` / `filterMode` / `paginationMode` | `"client" \| "server"`, default `"client"` | [state.md](state.md) |
| `rowCount` | `number` — server-mode total; `pageCount` derived | [pagination.md](pagination.md) |

### Editing

| Option | Type / default | Guide |
| --- | --- | --- |
| `editTrigger` | `"double-click"` (default) `\| "click"` | [editing.md](editing.md) |
| `onEditCommit` | `(change: DataTableEditCommit<TData>) => void \| Promise<void>` | [editing.md](editing.md) |

### State slices

One trio per slice — `x` (controlled) / `defaultX` (uncontrolled) / `onXChange(resolvedValue)`; shapes verbatim TanStack ([state.md](state.md)): `sorting`, `columnFilters`, `globalFilter`, `pagination`, `rowSelection`, `expanded`, `columnVisibility`, `columnPinning`, `columnOrder`, `columnSizing`, `grouping`, `rowPinning` — plus the ledger-owned `editingCell` / `onEditingCellChange` (no default form).

### Persistence and escape hatch

| Option | Type | Notes |
| --- | --- | --- |
| `persistState` | [`DataTablePersistState`](#persistence-types) | [state.md](state.md#persisted-state) |
| `tableOptions` | `Partial<TableOptions<TData>>` | Base layer; managed keys override with a dev warning |

## `DataTableProps<TData>`

`DataTableBaseProps` extends Mantine `BoxProps` (all sizing/spacing style props), `StylesApiProps<DataTableFactory>` (`classNames` / `styles` / `vars` / `unstyled` / `attributes`), and `ElementProps<"div">`. Combined with either `{ table }` or the flattened behavior options above.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `table` | `TableInstance<TData>` | — | Hook mode; excludes inline options |
| `ref` | `Ref<HTMLDivElement>` | — | Root element (React 19 ref-as-prop) |
| `handleRef` | `Ref<DataTableHandle<TData>>` | — | [Imperative handle](#imperative-handle) |
| `striped` | `boolean \| "odd" \| "even"` | `false` | `true` = `"odd"` |
| `stripedColor` | `MantineColor` | theme hover color | |
| `highlightOnHover` | `boolean` | `false` | |
| `highlightOnHoverColor` | `MantineColor` | theme hover color | |
| `withTableBorder` | `boolean` | `false` | |
| `withColumnBorders` | `boolean` | `false` | |
| `withRowBorders` | `boolean` | `true` | |
| `borderColor` | `MantineColor` | theme default border | |
| `verticalSpacing` | `MantineSpacing` | `"xs"` | |
| `horizontalSpacing` | `MantineSpacing` | `"xs"` | |
| `tabularNums` | `boolean` | `false` | |
| `tableMinWidth` | `number \| string` | — | Content-width floor ([sizing.md](sizing.md)) |
| `virtualized` | `boolean \| { estimateRowHeight?: number; overscan?: number }` | `false` | Object defaults: 44 / 8 ([virtualization.md](virtualization.md)) |
| `onEndReached` | `() => void` | — | Deduped per data length |
| `endReachedOffset` | `number` | `240` | px before the bottom |
| `loadingMore` | `boolean` | `false` | Trailing loader row |
| `loading` | `boolean` | `false` | Skeletons (no rows) or overlay (rows present) |
| `emptyState` | `ReactNode` | Mantine `EmptyState` titled `labels.empty` | Overlaid and centered in the visible body region |
| `withPaginationBar` | `boolean` | `true` | Renders only while pagination is enabled |
| `pageSizeOptions` | `number[]` | `[10, 20, 50, 100]` | |
| `onRowClick` / `onRowDoubleClick` / `onRowContextMenu` | `(row: Row<TData>, event: MouseEvent) => void` | — | [rows.md](rows.md) |
| `rowClassName` | `string \| (row) => string \| undefined` | — | |
| `labels` | `Partial<DataTableLabels>` | `defaultLabels` | [i18n.md](i18n.md) |

Styles API selector names (`DataTableStylesNames`) and the `vars` surface (`DataTableCssVariables`: root `--ledger-striped-color` / `--ledger-hover-color` / `--ledger-border-color`) are catalogued in [styling.md](styling.md).

## Column `meta`

Declaration-merged into TanStack's `ColumnMeta` — see [columns.md](columns.md#the-meta-extension) for semantics:

```ts
interface ColumnMeta<TData, TValue> {
  align?: "start" | "center" | "end";
  truncate?: boolean;
  filter?: DataTableFilterVariant | DataTableFilterConfig
         | ((column: Column<TData, TValue>) => ReactNode);
  edit?: DataTableEditVariant | DataTableEditConfig<TData, TValue>
       | ((ctx: DataTableEditContext<TData, TValue>) => ReactNode);
  headerClassName?: string;
  cellClassName?: string | ((cell: Cell<TData, TValue>) => string | undefined);
}
```

## Editing types

```ts
type DataTableEditVariant = "text" | "number" | "select" | "checkbox";
type DataTableEditTrigger = "double-click" | "click";

interface DataTableEditConfig<TData, TValue> {
  variant: DataTableEditVariant;
  options?: ComboboxData;                                        // select
  enabled?: (row: Row<TData>) => boolean;                        // per-row gate
  validate?: (value: TValue, row: Row<TData>) => string | null;  // non-null blocks the commit
}

interface DataTableEditContext<TData, TValue> {
  row: Row<TData>;
  column: Column<TData, TValue>;
  value: TValue;
  setValue: (value: TValue) => void;
  commit: () => void;
  cancel: () => void;
  error: string | null;
}

interface DataTableEditCommit<TData> {
  row: Row<TData>;
  column: Column<TData, unknown>;
  value: unknown;
  previousValue: unknown;
}

interface DataTableEditingCell { rowId: string; columnId: string }
```

## Filter types

```ts
type DataTableFilterVariant = "text" | "select" | "multi-select" | "range" | "date-range";

interface DataTableFilterConfig {
  variant: DataTableFilterVariant;
  options?: ComboboxData;   // client mode derives from faceted values; server mode requires it
  placeholder?: string;
}
```

Registered filter functions (usable as `filterFn` ids anywhere): `ledger-one-of` (strict set membership) and `ledger-date-range` (inclusive ISO date range) — see [filtering.md](filtering.md#variants).

## Persistence types

```ts
type DataTablePersistableSlice
  = "sorting" | "columnFilters" | "globalFilter" | "pagination"
  | "columnVisibility" | "columnPinning" | "columnOrder" | "columnSizing" | "grouping";

interface DataTablePersistState {
  key: string;                                                   // one table per key ("ledger:<key>")
  slices?: DataTablePersistableSlice[];                          // default: sizing, visibility, order, pinning
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">; // default: localStorage (guarded)
}
```

## Imperative handle

Received through `handleRef` (`ref` stays the root element — the Mantine factory contract owns it):

```ts
interface DataTableHandle<TData> {
  table: TableInstance<TData>;
  viewport: HTMLDivElement | null;   // the ScrollArea viewport
  scrollToRow: (rowId: string | number, options?: DataTableScrollToRowOptions) => void;
  startEditing: (rowId: string, columnId: string) => void;
  stopEditing: (options?: { commit?: boolean }) => void;   // default commit: true
}

interface DataTableScrollToRowOptions {
  align?: "start" | "center" | "end" | "auto";   // default "auto"
  behavior?: "auto" | "smooth";
}
```

## Compound components

All take the `table` instance, compose anywhere, and are individually themeable (`DataTableSearch`, `DataTableColumnsPanel`, `DataTablePagination`, `DataTableSelectionBar` theme keys):

| Component | Props | Notes |
| --- | --- | --- |
| `DataTable.Search` | `{ table, debounce?: number /* 200 */, labels? }` + every `TextInputProps` except the value trio | Global filter input ([filtering.md](filtering.md#global-filter)) |
| `DataTable.ColumnsPanel` | `{ table, children?, popoverProps?, labels?, className?, style? }` | Order / visibility / pinning / width / grouping. `children` is the trigger and the panel opens from it in a Popover; without one it renders bare ([columns.md](columns.md#the-columns-panel)) |
| `DataTable.Pagination` | `{ table, pageSizeOptions?, labels?, className?, style? }` | Standalone bar ([pagination.md](pagination.md)) |
| `DataTable.SelectionBar` | `{ table, labels?, children?, className?, style? }` | Renders only while rows are selected; `children` = bulk actions ([selection.md](selection.md)) |

Each is also exported standalone (`DataTableSearch`, …) for tree-shaken imports.

## `toCsv`

```ts
function toCsv<TData>(table: TableInstance<TData>, options?: ToCsvOptions): string;

interface ToCsvOptions {
  scope?: "filtered" | "all" | "selected";   // default "filtered" (after filters/sorting, before pagination)
  delimiter?: string;                        // default ","
  withHeaders?: boolean;                     // default true
}
```

RFC 4180 quoting, CRLF line ends. Exports accessor columns only, in their current visible order (internal columns excluded); header text comes from string `header`s, falling back to column ids. Values serialize as: `Date` → ISO string, objects → JSON, `null`/`undefined` → empty. Scopes read the live row models — a server-paginated table can only export the rows it has.

## Labels

`DataTableLabels` (all keys and defaults in [i18n.md](i18n.md)); `defaultLabels` is the English set; `zhCN` ships from `@coldsmirk/ledger-mantine/locales`; `labels` props take partials.

## `meta.ledger`

`table.options.meta.ledger` (typed `LedgerMeta<TData>`) carries ledger-private plumbing on TanStack's sanctioned extension point: the editing controller (`cell` / `start` / `stop` / `clear` / `registerEditor`), `editTrigger`, `enableEditing`, `onEditCommit`, `renderDetailPanel`, `selectAllScope` (`"page" | "all"`), the shift-selection `selectionAnchor`, `totalRowCount`, `enableColumnOrdering`, and `enablePagination`. Compound components read it; applications normally shouldn't write it. `tableOptions.meta` is merged beneath it — only the `ledger` key is reserved.
