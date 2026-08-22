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

Re-exported TanStack types (consumers never import `@tanstack/*`): `ColumnDef`, `Column`, `Row`, `Cell` (each pre-bound to the canonical v9 feature set, keeping their v8 arity — `LedgerFeatures` is exported for advanced typing), `RowData`, `SortingState`, `ColumnFiltersState`, `PaginationState`, `RowSelectionState`, `ExpandedState`, `ColumnVisibilityState`, `ColumnPinningState` (`{ start, end }`), `ColumnOrderState`, `ColumnSizingState`, `GroupingState`, `RowPinningState`, and the table instance as **`TableInstance`** (v9's enriched React shape — `state`, `Subscribe`, `FlexRender` included; renamed to avoid the collision with Mantine's `Table`). `createColumnHelper` is ledger's feature-bound wrapper: `createColumnHelper<Person>()`, exactly the v8 calling shape.

ledger-owned types: `DataTableProps`, `DataTableBaseProps`, `UseDataTableOptions`, `DataTableHandle`, `DataTableScrollToRowOptions`, `DataTableLabels`, `DataTableFilterVariant`, `DataTableFilterConfig`, `DataTableEditVariant`, `DataTableEditConfig`, `DataTableEditContext`, `DataTableEditCommit`, `DataTableEditingCell`, `DataTableEditTrigger`, `DataTableEditMode`, `DataTableRowEditCommit`, `DataTableExportMeta`, `DataTablePersistState`, `DataTablePersistableSlice`, `LedgerMeta`, `LedgerEditingController`, `LedgerRowEditingController`, `LedgerRowEditor`, `ActiveCellEditor`, `ToCsvOptions`, plus the Styles API types `DataTableFactory`, `DataTableStylesNames`, `DataTableCssVariables`.

Package exports: `.` (dual ESM+CJS with types), `./locales`, `./styles.css`, `./package.json`. Peers: `@mantine/core` ^9, `@mantine/dates` ^9, `@mantine/hooks` ^9, `react`/`react-dom` ^19.2 (`dayjs` arrives transitively as `@mantine/dates`' own peer). Direct dependencies: `@tanstack/react-table` ^9.1 (ESM-only upstream; the CJS build relies on Node ≥ 24 `require(esm)`), `@tanstack/react-virtual` ^3.14, `@dnd-kit/react` ^0.5, `@dnd-kit/helpers` ^0.5, `clsx`.

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
| `enableColumnResizing` | `false` (ledger-owned switch; TanStack's `columnResizingFeature` is unregistered — [sizing.md](sizing.md#resizing-interplay)) | [columns.md](columns.md) |
| `enableColumnPinning` | `true` | [pinning.md](pinning.md) |
| `enableColumnOrdering` | `false` (ledger-owned name) | [columns.md](columns.md) |
| `enableHiding` | `true` | [columns.md](columns.md) |
| `enableEditing` | `true` (columns still opt in via `meta.edit`) | [editing.md](editing.md) |
| `enableActiveRow` | `false` (ledger-owned; keyboard-reachable current row) | [rows.md](rows.md#active-row) |
| `enableGrouping` | `false` | [grouping.md](grouping.md) |
| `enableRowPinning` | `false` | [pinning.md](pinning.md) |
| `enableCellSpanning` | `true` — defs opt in via `spanRows` / `spanColumns`; ignored while `virtualized` | [columns.md](columns.md#merged-cells) |

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
| `editMode` | `"cell"` (default) `\| "row"` — row-atomic editing with `onRowEditCommit` | [editing.md](editing.md#row-mode) |
| `onEditCommit` | `(change: DataTableEditCommit<TData>) => void \| Promise<void>` | [editing.md](editing.md) — cell mode |
| `onRowEditCommit` | `(change: DataTableRowEditCommit<TData>) => void \| Promise<void>` | [editing.md](editing.md#row-mode) — row mode, one call per row |

### State slices

One trio per slice — `x` (controlled) / `defaultX` (uncontrolled) / `onXChange(resolvedValue)`; shapes verbatim TanStack v9 ([state.md](state.md)): `sorting`, `columnFilters`, `globalFilter`, `pagination`, `rowSelection`, `expanded`, `columnVisibility`, `columnPinning` (`{ start, end }`), `columnOrder`, `columnSizing`, `grouping`, `rowPinning` — plus the ledger-owned `editingCell` / `onEditingCellChange` and `editingRowId` / `onEditingRowIdChange` (editing has no meaningful default, so neither slice takes a `defaultX`; the pair you use follows `editMode`, [editing.md](editing.md)) and `activeRowId` / `defaultActiveRowId` / `onActiveRowIdChange` (with `enableActiveRow`, [rows.md](rows.md#active-row)).

### Persistence and escape hatch

| Option | Type | Notes |
| --- | --- | --- |
| `persistState` | [`DataTablePersistState`](#persistence-types) | [state.md](state.md#persisted-state) |
| `filterFns` | `Record<string, FilterFn>` | First-class registry (v9 slots): ids become valid `filterFn`/`globalFilterFn` strings, merged over the built-ins, read once at mount; ledger's two ids are reserved |
| `tableOptions` | `Partial<TableOptions>` with `globalFilterFn` widened to accept any string | Base layer; managed keys (`features` included) override with a dev warning |

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
| `loadMoreError` | `boolean \| ReactNode` | — | Replaces the loader row with a message + retry ([rows.md](rows.md#loading-empty-and-error-states)) |
| `loading` | `boolean` | `false` | Skeletons (no rows) or overlay (rows present) |
| `emptyState` | `ReactNode` | Mantine `EmptyState`, `labels.empty` / `labels.noResults` | Overlaid and centered; no-results shows while filters are active |
| `error` | `boolean \| ReactNode` | — | Error panel over the body; precedence over empty ([rows.md](rows.md#loading-empty-and-error-states)) |
| `onRetry` | `() => void` | — | Adds the retry button to the error panel |
| `withPaginationBar` | `boolean` | `true` | Renders only while pagination is enabled |
| `pageSizeOptions` | `number[]` | `[10, 20, 50, 100]` | |
| `onRowClick` / `onRowDoubleClick` / `onRowContextMenu` | `(row: Row<TData>, event: MouseEvent) => void` | — | [rows.md](rows.md) |
| `rowClassName` | `string \| (row) => string \| undefined` | — | |
| `labels` | `Partial<DataTableLabels>` | `defaultLabels` | [i18n.md](i18n.md) |
| `aria-label` / `aria-labelledby` / `aria-describedby` | `string` | — | Routed to the ARIA table (`.ledger-main`), not the root wrapper |

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
  export?: false | { header?: string; value?: (row: Row<TData>) => unknown };
  hiddenFrom?: MantineBreakpoint;   // removed at and above the breakpoint (Box vocabulary)
  visibleFrom?: MantineBreakpoint;  // present only at and above the breakpoint
}
```

## Editing types

```ts
type DataTableEditVariant = "text" | "number" | "select" | "checkbox";
type DataTableEditTrigger = "double-click" | "click";
type DataTableEditMode = "cell" | "row";

interface DataTableRowEditCommit<TData> {
  row: Row<TData>;
  values: Record<string, unknown>;           // every editable column, drafts merged in
  previousValues: Record<string, unknown>;
}

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
  commit: () => boolean | Promise<boolean>;  // false = validation/application commit failed; editor stays active
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

interface ActiveCellEditor {
  commit: () => boolean | Promise<boolean>;  // true only when it is safe to leave the cell
  cancel: () => void;
}
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

Registered filter functions (usable as `filterFn` ids anywhere): every TanStack built-in under its conventional name, plus `ledger-one-of` (strict scalar/array set membership) and `ledger-date-range` (inclusive local calendar-date range) — see [filtering.md](filtering.md#variants). The first-class `filterFns` option merges custom ids beneath the two reserved implementations. Raw `ColumnDef.filterFn` retains TanStack's strict id typing (registered ids and functions typecheck; v9 replaced `FilterFns` declaration merging with registry slots).

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
  startEditing: (rowId: string, columnId?: string) => void;   // cell mode requires columnId; row mode focuses it
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
| `DataTable.Search` | `{ table, debounce?: number /* 200 */, labels? }` + every `TextInputProps` except the value trio | Global filter input; clear/external reset cancels pending input ([filtering.md](filtering.md#global-filter)) |
| `DataTable.ColumnsPanel` | `{ table, children?, popoverProps?, labels?, className?, style? }` | Order / visibility / pinning / width / grouping. `children` is the trigger and the panel opens from it in a Popover; without one it renders bare ([columns.md](columns.md#the-columns-panel)) |
| `DataTable.Pagination` | `{ table, pageSizeOptions?, labels?, className?, style? }` | Standalone bar ([pagination.md](pagination.md)) |
| `DataTable.SelectionBar` | `{ table, labels?, children?, className?, style? }` | Renders only while rows are selected; `children` = bulk actions ([selection.md](selection.md)) |

Each is also exported standalone (`DataTableSearch`, …) for tree-shaken imports.

## `toCsv`

```ts
function toCsv<TData>(table: TableInstance<TData>, options?: ToCsvOptions): string;

interface ToCsvOptions {
  scope?: "filtered" | "all" | "page" | "selected";   // default "filtered" (after filters/sorting, before pagination)
  delimiter?: string;                                 // default ","
  withHeaders?: boolean;                              // default true
  escapeFormulas?: boolean;                           // default false — OWASP formula defusal for spreadsheet-bound exports
}
```

RFC 4180 quoting, CRLF line ends. Exports accessor columns only, in their current visible order (internal columns excluded); header text comes from string `header`s, falling back to column ids. Values serialize as: `Date` → ISO string, objects → JSON, `null`/`undefined` → empty. Scopes read the live row models — a server-paginated table can only export the rows it has, and `"page"` is identical to `"filtered"` when pagination is off.

Per-column control rides `meta.export`: `false` excludes the column entirely; `{ header, value }` overrides the exported title or derives the exported value from the row (the result flows through the same serialization).

`escapeFormulas` prefixes text a spreadsheet would evaluate as a formula (leading `=`, `+`, `-`, `@`, tab or CR — the OWASP CSV-injection set) with a `'`; it applies to header text and string-valued cells, while numeric cells keep their sign. Off by default because the quote is data to every non-spreadsheet consumer — turn it on for exports of untrusted data that feed Excel or LibreOffice.

## Labels

`DataTableLabels` (all keys and defaults in [i18n.md](i18n.md)); `defaultLabels` is the English set; `zhCN` ships from `@coldsmirk/ledger-mantine/locales`; `labels` props take partials.

## `meta.ledger`

`table.options.meta.ledger` (typed `LedgerMeta<TData>`) carries ledger-private plumbing on TanStack's sanctioned extension point: the stable processed `columns` (the render layer's memo token — v9 re-resolves `table.options` per state tick), the editing controller (`cell` / `start` / `stop` / `clear` / `registerEditor`), filter-set subscriptions (`subscribeColumnFilters` / `subscribeGlobalFilter`) used to cancel debounced controls even on no-op resets, `editTrigger`, `enableEditing`, `onEditCommit`, `renderDetailPanel`, `selectAllScope` (`"page" | "all"`), `enableColumnOrdering`, `enableColumnResizing`, and `enablePagination`. Compound components read it; applications normally shouldn't write it. `tableOptions.meta` is merged beneath it — only the `ledger` key is reserved.
