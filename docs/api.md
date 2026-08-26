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
- [Icons](#icons)
- [`meta.ledger`](#metaledger)

## Entry points and re-exports

```ts
import {
  DataTable,            // the component (+ .Search / .ColumnsPanel / .Pagination / .SelectionBar)
  useDataTable,         // options → bare TanStack Table instance
  toCsv,                // CSV export over a table instance
  defaultLabels,        // English label set
  defaultIcons,         // vendored Lucide glyph set
  createColumnHelper,   // TanStack, re-exported
  flexRender            // TanStack, re-exported
} from "@coldsmirk/ledger-mantine";

import { zhCN } from "@coldsmirk/ledger-mantine/locales";
import "@coldsmirk/ledger-mantine/styles.css";
```

Re-exported TanStack types (consumers never import `@tanstack/*`): `ColumnDef`, `Column`, `Row`, `Cell`, `Header`, `HeaderGroup` (each pre-bound to the canonical v9 feature set, keeping their v8 arity — `LedgerFeatures` is exported for advanced typing), `RowData`, `SortingState`, `ColumnFiltersState`, `PaginationState`, `RowSelectionState`, `ExpandedState`, `ColumnVisibilityState`, `ColumnPinningState` (`{ start, end }`), `ColumnOrderState`, `ColumnSizingState`, `GroupingState`, `RowPinningState`, and the table instance as **`TableInstance`** (v9's enriched React shape — `state`, `Subscribe`, `FlexRender` included; renamed to avoid the collision with Mantine's `Table`). `createColumnHelper` is ledger's feature-bound wrapper: `createColumnHelper<Person>()`, exactly the v8 calling shape. Its methods are v9's — `accessor` / `display` / `group` / **`columns`**, the last being the variadic-tuple wrapper a `group`'s children need so each keeps its own `TValue` ([columns.md](columns.md#header-groups-and-footers)).

ledger-owned types: `DataTableProps`, `DataTableBaseProps`, `UseDataTableOptions`, `DataTableHandle`, `DataTableScrollToRowOptions`, `DataTableLabels`, `DataTableIcons`, `DataTableIconProps`, `DataTableIconComponent`, `DataTableFilterVariant`, `DataTableFilterConfig`, `DataTableEditVariant`, `DataTableEditShorthand`, `DataTableEditConfig`, `DataTableEditContext`, `DataTableEditCommit`, `DataTableEditingCell`, `DataTableEditTrigger`, `DataTableEditMode`, `DataTableRowEditCommit`, `DataTableExportMeta`, `DataTablePersistState`, `DataTablePersistableSlice`, `DataTableElementProps`, `LedgerMeta`, `LedgerEditingController`, `LedgerCheckboxEditingController`, `LedgerRowEditingController`, `LedgerRowEditor`, `LedgerCellEditor`, `ToCsvOptions`, plus the Styles API types `DataTableFactory`, `DataTableStylesNames`, `DataTableCssVariables`.

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
| `selectionColumn` / `expanderColumn` | `Partial<ColumnDef<TData, unknown>>` | Merged over the injected def; `id` is reserved ([selection.md](selection.md#overriding-the-injected-column)) |

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
| `onEndReached` | `() => void` | — | Deduped per `data` identity — a new array re-arms it ([virtualization.md](virtualization.md)) |
| `endReachedOffset` | `number` | `240` | px before the bottom |
| `loadingMore` | `boolean` | `false` | Trailing loader row |
| `loadMoreError` | `boolean \| ReactNode` | — | Replaces the loader row with a message + retry ([rows.md](rows.md#loading-empty-and-error-states)) |
| `loading` | `boolean` | `false` | Skeletons (no rows) or overlay (rows present) |
| `emptyState` | `ReactNode` | Mantine `EmptyState`, `labels.empty` / `labels.noResults` | Overlaid and centered; no-results shows while filters are active |
| `error` | `boolean \| ReactNode` | — | Error panel over the body; precedence over empty ([rows.md](rows.md#loading-empty-and-error-states)) |
| `onRetry` | `() => void` | — | Adds the retry button to the error panel |
| `withColumnHeaders` | `boolean` | `true` | Renders the header region ([columns.md](columns.md#hiding-the-header)) |
| `withPaginationBar` | `boolean` | `true` | Renders only while pagination is enabled |
| `pageSizeOptions` | `number[]` | `[10, 20, 50, 100]` | |
| `onRowActivate` | `(row: Row<TData>, event: MouseEvent \| KeyboardEvent) => void` | — | Input-agnostic: click or `Enter` on the current row ([rows.md](rows.md)) |
| `onRowClick` / `onRowDoubleClick` / `onRowContextMenu` | `(row: Row<TData>, event: MouseEvent) => void` | — | Literal pointer events ([rows.md](rows.md)) |
| `rowProps` | `TableTrProps \| (row) => TableTrProps \| undefined` | — | DOM props per data row ([styling.md](styling.md#dom-props)) |
| `headerRowProps` / `footerRowProps` | `TableTrProps \| (headerGroup) => TableTrProps \| undefined` | — | DOM props per header / footer row |
| `viewportProps` | `ComponentProps<"div">` | — | DOM props for the scroll viewport (`onScroll`, …) |
| `labels` | `Partial<DataTableLabels>` | `defaultLabels` | [i18n.md](i18n.md) |
| `icons` | `Partial<DataTableIcons>` | `defaultIcons` | Per-slot glyph replacement ([Icons](#icons)) |
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
  edit?: DataTableEditShorthand | DataTableEditConfig<TData, TValue>
       | ((ctx: DataTableEditContext<TData, TValue>) => ReactNode);
  cellProps?: DataTableElementProps<TableTdProps, Cell<TData, TValue>>;
  headerCellProps?: DataTableElementProps<TableThProps, Header<TData, TValue>>;
  footerCellProps?: DataTableElementProps<TableThProps, Header<TData, TValue>>;
  export?: false | { header?: string; value?: (row: Row<TData>) => unknown };
  hiddenFrom?: MantineBreakpoint;   // removed at and above the breakpoint (Box vocabulary)
  visibleFrom?: MantineBreakpoint;  // present only at and above the breakpoint
}
```

## Editing types

```ts
type DataTableEditVariant = "text" | "number" | "select" | "checkbox";
type DataTableEditShorthand = Exclude<DataTableEditVariant, "select">;   // what a bare string may name
type DataTableEditTrigger = "double-click" | "click";
type DataTableEditMode = "cell" | "row";

interface DataTableRowEditCommit<TData> {
  row: Row<TData>;
  values: Record<string, unknown>;           // every editable column, drafts merged in
  previousValues: Record<string, unknown>;
}

// Both members also carry the shared gate and validation:
//   enabled?: (row: Row<TData>) => boolean;                        // per-row gate
//   validate?: (value: TValue, row: Row<TData>) => string | null;  // non-null blocks the commit
type DataTableEditConfig<TData, TValue> =
  | { variant: DataTableEditShorthand }
  | { variant: "select"; options: ComboboxData };   // required: an editor has no facets to derive from

interface DataTableEditContext<TData, TValue> {
  row: Row<TData>;
  column: Column<TData, TValue>;
  value: TValue;
  setValue: (value: TValue) => void;
  commit: () => boolean | Promise<boolean>;  // false = validation/application commit failed; editor stays active
  cancel: () => void;
  error: string | null;
  pending: boolean;                          // a write is still out (the cell's; in row mode the row's)
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

type DataTableFilterConfig =
  | { variant: "text"; placeholder?: string }
  | { variant: "select" | "multi-select";
      options?: ComboboxData;   // client mode derives from faceted values; server mode requires it
      placeholder?: string }
  | { variant: "range" | "date-range" };
```

Discriminated by `variant`, so each member carries exactly the keys its control reads: `options` belongs to the select family, and the bound inputs label themselves `filterRangeMin` / `filterRangeMax` rather than taking a `placeholder`. A configuration the renderer would ignore does not typecheck.

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
  scrollToRow: (rowId: string, options?: DataTableScrollToRowOptions) => void;
  scrollToIndex: (index: number, options?: DataTableScrollToRowOptions) => void;  // the page's row model
  startEditing: (rowId: string, columnId?: string) => void;   // cell mode requires columnId; row mode focuses it
  stopEditing: (options?: { commit?: boolean }) => void;   // default commit: true
}

interface DataTableScrollToRowOptions {
  align?: "start" | "center" | "end" | "auto";   // default "auto"
  behavior?: "auto" | "smooth";
}
```

Scrolling by id and scrolling by position are two methods rather than one parameter accepting both: `getRowId` may well return digits, and a table whose ids read `"5"` could not say which of the two a `string | number` meant.

## Compound components

All take the `table` instance, compose anywhere, and are individually themeable (`DataTableSearch`, `DataTableColumnsPanel`, `DataTablePagination`, `DataTableSelectionBar` theme keys):

| Component | Props | Notes |
| --- | --- | --- |
| `DataTable.Search` | `{ table, debounce?: number /* 200 */, labels?, icons? }` + every `TextInputProps` except the value trio | Global filter input; clear/external reset cancels pending input ([filtering.md](filtering.md#global-filter)) |
| `DataTable.ColumnsPanel` | `{ table, children?, popoverProps?, labels?, icons?, className?, style? }` | Order / visibility / pinning / width / grouping. `children` is the trigger and the panel opens from it in a Popover; without one it renders bare ([columns.md](columns.md#the-columns-panel)) |
| `DataTable.Pagination` | `{ table, pageSizeOptions?, labels?, className?, style? }` | Standalone bar ([pagination.md](pagination.md)) |
| `DataTable.SelectionBar` | `{ table, labels?, icons?, children?, className?, style? }` | Renders only while rows are selected; `children` = bulk actions ([selection.md](selection.md)) |

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

## Icons

```ts
interface DataTableIconProps {
  size?: number;         // 12–16 in the controls, 40 in the empty/error indicators
  strokeWidth?: number;
}
type DataTableIconComponent = ComponentType<DataTableIconProps>;

interface DataTableIcons {
  /* Header */
  sortAsc: DataTableIconComponent;
  sortDesc: DataTableIconComponent;
  sortable: DataTableIconComponent;        // neutral affordance while unsorted
  filterColumn: DataTableIconComponent;
  /* Rows — one chevron, rotated open by the stylesheet (groups and expand-all included) */
  expandRow: DataTableIconComponent;
  /* States */
  empty: DataTableIconComponent;
  noResults: DataTableIconComponent;
  error: DataTableIconComponent;
  retry: DataTableIconComponent;
  /* Global search */
  search: DataTableIconComponent;
  /* Selection */
  clearSelection: DataTableIconComponent;
  /* Columns panel */
  resetColumns: DataTableIconComponent;
  reorderColumn: DataTableIconComponent;
  groupByColumn: DataTableIconComponent;   // toggle and grouped rest-state mark
  pinStart: DataTableIconComponent;
  unpin: DataTableIconComponent;
  pinEnd: DataTableIconComponent;
}
```

`defaultIcons` is the built-in set — Lucide glyphs with their path data vendored into the package (no icon-library dependency). Slots are named for the `DataTableLabels` key of the same affordance where one exists; `icons` props take partials, merged per slot. `lucide-react` components satisfy `DataTableIconComponent` as-is — see [styling.md](styling.md#icons).

## `meta.ledger`

`table.options.meta.ledger` (typed `LedgerMeta<TData>`) carries ledger-private plumbing on TanStack's sanctioned extension point: the stable processed `columns` (the render layer's memo token — v9 re-resolves `table.options` per state tick), the `editing` controller (below), filter-set subscriptions (`subscribeColumnFilters` / `subscribeGlobalFilter`) used to cancel debounced controls even on no-op resets, `editTrigger`, `enableEditing`, `onEditCommit`, `onRowEditCommit`, `renderDetailPanel`, `selectAllScope` (`"page" | "all"`), `activeRow` (`enabled` / `id` / `set`), `enableColumnOrdering`, `enableColumnResizing`, and `enablePagination`. Compound components read it; applications normally shouldn't write it. `tableOptions.meta` is merged beneath it — only the `ledger` key is reserved.

`meta.ledger.editing` carries both modes at once; `mode` says which one is live. Both sessions live in the controller and the editors are views of them — an editor is unmounted by a hidden column or a virtual scroll at any moment, while the session is not ([architecture.md](architecture.md#load-bearing-internals)).

```ts
interface LedgerEditingController {
  mode: DataTableEditMode;                                 // "cell" | "row"
  cell: DataTableEditingCell | null;                       // cell mode: the cell being edited
  active: (rowId: string, columnId: string) => boolean;    // …and its session is still live
  start: (cell: DataTableEditingCell) => void;
  stop: (options?: { commit?: boolean }) => void;
  clear: () => void;
  commit: () => boolean | Promise<boolean>;                // the session's, not an editor's
  cancel: () => void;
  drafts: {
    pending: (rowId: string, columnId: string) => boolean;
    error: (rowId: string, columnId: string) => string | null;
    read: (rowId: string, columnId: string, source: unknown) => unknown;
    write: (rowId: string, columnId: string, value: unknown) => void;
  };
  moveTo: (backwards: boolean) => void;                    // Tab / Shift+Tab: commit, then move
  firstEditable: (rowId: string, skipCheckbox: boolean) => string | null;  // where F2 enters
  register: (rowId: string, columnId: string, editor: LedgerCellEditor) => () => void;
  checkbox: LedgerCheckboxEditingController;               // the checkbox variant's transient edits
  row: LedgerRowEditingController;                         // inert while mode is "cell"
}

interface LedgerCheckboxEditingController {
  checked: (rowId: string, columnId: string, source: unknown) => boolean;  // written, else source
  pending: (rowId: string, columnId: string) => boolean;                   // this cell's write is out
  error: (rowId: string, columnId: string) => string | null;
  toggle: (rowId: string, columnId: string) => void;                       // toggles and commits in one act
  register: (rowId: string, columnId: string, editor: LedgerCellEditor) => () => void;
}

interface LedgerCellEditor {
  redraw: () => void;                                      // something the editor shows changed
}

interface LedgerRowEditingController {
  id: string | null;                                       // the row being edited
  active: (rowId: string) => boolean;                      // and its session is still live
  start: (rowId: string, options?: { focusColumnId?: string }) => void;
  stop: (options?: { commit?: boolean }) => void;           // commits or cancels the row atomically
  commit: () => boolean | Promise<boolean>;                 // the same, with the real result
  shouldFocus: (columnId: string) => boolean;
  drafts: {
    pending: (rowId: string) => boolean;                                   // a write for the row is still out
    error: (rowId: string, columnId: string) => string | null;
    read: (rowId: string, columnId: string, source: unknown) => unknown;   // pending, else written, else source
    write: (rowId: string, columnId: string, value: unknown) => void;
  };
  register: (columnId: string, editor: LedgerRowEditor) => () => void;
}

interface LedgerRowEditor {
  focus: () => void;
  redraw: () => void;                                      // something the editor shows changed in the session
}
```

`editing.checkbox` is not a session — the checkbox variant commits on toggle, so there is nothing to open or close. What it holds is per *target* and any number can be live at once: the write still out, the failure it came back with, and the value the application now holds. It is addressed by row and column for the same reason the stores above are, and for one more: hiding the column, a breakpoint removing it, or a virtual scroll takes the control off the screen, and none of those are the write landing ([editing.md](editing.md#the-checkbox-variant)).

`moveTo` and `firstEditable` answer for the render that reached the screen rather than for the shared TanStack core, which v9 rewrites on every render pass — a discarded one included ([architecture.md](architecture.md#load-bearing-internals)). The keyboard entry points go through them, so a transition React threw away cannot decide where the caret goes, that a cell is read-only, or that the row is not there. Both read the display order (`start + center + end`), and `moveTo` picks its destination after its commit succeeds rather than when the key was pressed.

The row-mode store is addressed by row and not by column alone: two rows' editors can be mounted at once while React reconciles a switch, and each must read its own pending values or none. `read`, `pending` and `error` are what an editor renders — it holds no copy of any of them, because an editor is unmounted by a hidden column or a virtual scroll at any moment while the session is not (see [architecture.md](architecture.md#load-bearing-internals)). `id` is the row that actually rendered — `start` and `stop` request a change of the controlled `editingRowId` slice, and an application may answer with a different row or with none ([editing.md](editing.md#row-mode)).
