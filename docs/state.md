# State management

ledger's state model is TanStack's state, exposed the React way. Shapes are TanStack's **verbatim** (`SortingState`, `RowSelectionState`, …); the wiring follows the canonical controlled/uncontrolled contract instead of TanStack's `initialState` bag and `Updater` callbacks.

## The slice trio

Every state slice is independently controllable through three props:

```
x            — controlled value: the prop is the state; the table renders it and never diverges
defaultX     — uncontrolled initial value: the table owns the state from there on
onXChange(v) — observer: receives the RESOLVED next value (never an updater function)
```

Controlled and uncontrolled cannot be double-sourced — `x` wins whenever present, exactly like `value` / `defaultValue` on an input. Internally TanStack's functional updaters are resolved before your callback sees them, and chained updates within one event resolve against fresh state.

`defaultX` is also what a **reset** returns to. TanStack's `table.resetColumnOrder()` / `resetColumnVisibility()` / `resetColumnPinning()` / `resetColumnSizing()` — the four the [columns panel](columns.md#the-columns-panel)'s reset button calls — restore `table.initialState`, which ledger seeds from these four `defaultX` options. So a reset lands on the layout your application declared, not on an empty slice. Persisted values are excluded from that seeding on purpose: if a restored layout became the reset target, a reset after a refresh would do nothing. `initialState` is ledger-managed and never reaches a read path (`table.getState()` returns the controlled `state` verbatim); passing your own through `tableOptions.initialState` is overridden with a dev warning, per the merge rule below — the per-slice `defaultX` trio is the way in.

### The slices

| Slice | Shape (TanStack) | Uncontrolled fallback |
| --- | --- | --- |
| `sorting` | `SortingState` | `[]` |
| `columnFilters` | `ColumnFiltersState` | `[]` |
| `globalFilter` | `string` | `""` |
| `pagination` | `PaginationState` | `{ pageIndex: 0, pageSize: 20 }` |
| `rowSelection` | `RowSelectionState` | `{}` |
| `expanded` | `ExpandedState` | `{}` |
| `columnVisibility` | `VisibilityState` | `{}` |
| `columnPinning` | `ColumnPinningState` | `{}` |
| `columnOrder` | `ColumnOrderState` | `[]` |
| `columnSizing` | `ColumnSizingState` | `{}` |
| `grouping` | `GroupingState` | `[]` |
| `rowPinning` | `RowPinningState` | `{ top: [], bottom: [] }` |
| `editingCell` | `DataTableEditingCell \| null` (ledger-owned) | `null` — and no `defaultEditingCell`: a default editing cell is meaningless |

## Client/server modes

`sortingMode` / `filterMode` / `paginationMode` (each `"client" | "server"`, default `"client"`) replace TanStack's opaque `manualX` flags with the industry terms:

| Mode set to `"server"` | ledger does | You do |
| --- | --- | --- |
| `sortingMode` | sets `manualSorting`, omits the sorted row model | observe `onSortingChange`, refetch |
| `filterMode` | sets `manualFiltering`, omits the filtered **and faceted** row models | observe filter callbacks, refetch; provide explicit `options` on select-family filters |
| `paginationMode` | sets `manualPagination`, derives `pageCount` from `rowCount` | observe `onPaginationChange`, refetch the page, pass `rowCount` |

### The auto-reset policy

In **client** mode TanStack's defaults stand (e.g. a filter change resets `pageIndex`). In **server** mode those auto-resets misfire around manual row models, so ledger disables `autoResetPageIndex` and performs the one equivalent deterministic reset itself: a `columnFilters`, `globalFilter`, or `sorting` change resets `pageIndex` to 0 (never on mount, and a no-op when already 0). Override either side through `tableOptions`.

## `tableOptions` — the escape hatch

Everything `useReactTable` accepts can be passed through `tableOptions`. It is the **base layer**: ledger-managed keys (row models, `state`, the `on*Change` wiring, `manualX` translations, injected columns, `columnResizeMode`, `filterFns`, …) override it, and each collision logs a dev-mode warning naming the first-class option to use instead. `manualSorting` and `sortingMode` can never silently fight — the mode wins, audibly.

```tsx
tableOptions={{
  sortingFns: { byPriority: (a, b, id) => … },
  groupedColumnMode: false,
  keepPinnedRows: false,
  autoResetAll: false
}}
```

`tableOptions.meta` is honored — ledger merges its own namespace on top, reserving only `meta.ledger`.

## `meta.ledger` and the bare instance

`useDataTable` returns the **bare TanStack `Table<TData>`** — no wrapper type, so hook mode loses nothing and every TanStack API works. Ledger-private configuration and the editing controller ride `table.options.meta.ledger` (TanStack's sanctioned extension point, typed via declaration merging as `LedgerMeta<TData>`): the editing controller, `editTrigger`, `enableEditing`, `onEditCommit`, `renderDetailPanel`, the select-all scope, the shift-selection anchor, `totalRowCount`, `enableColumnOrdering`, and `enablePagination`. Compound components and advanced consumers may read it; treat it as read-mostly plumbing.

## The imperative handle

`handleRef` (not `ref`, which stays the root DOM element per the Mantine factory contract) receives a `DataTableHandle`:

```tsx
const handle = useRef<DataTableHandle<Person>>(null);
<DataTable handleRef={handle} … />
```

`{ table, viewport, scrollToRow(rowId, options), startEditing(rowId, columnId), stopEditing({ commit? }) }` — see [api.md](api.md#imperative-handle).

## Persisted state

`persistState` snapshots chosen slices to storage and restores them on mount:

```tsx
<DataTable
  persistState={{ key: "people-table" }}                     // layout set: sizing, visibility, order, pinning
  …
/>

<DataTable
  persistState={{
    key: "audit-table",
    slices: ["sorting", "columnFilters", "pagination", "columnVisibility"],
    storage: sessionStorage
  }}
  …
/>
```

- `key` namespaces one table per entry (`ledger:<key>`); `storage` defaults to `localStorage` (guarded — persistence degrades to a no-op where storage is unavailable or throws).
- Persistable slices: `sorting`, `columnFilters`, `globalFilter`, `pagination`, `columnVisibility`, `columnPinning`, `columnOrder`, `columnSizing`, `grouping`. The default set is the **layout** four: `columnSizing`, `columnVisibility`, `columnOrder`, `columnPinning`.
- Hydration happens once, synchronously, feeding the **uncontrolled** side — the first render already shows the restored layout, restored values outrank `defaultX`, and a controlled slice always wins over both.
- Writes are debounced (250 ms). Storage content is treated as a trust boundary: each slice is shape-checked on read, and a stale or corrupt entry degrades to defaults instead of crashing the table.

## Dev-mode guard rails

Warnings are development-only and fire once per session each:

| Guard | Trigger |
| --- | --- |
| `getRowId` missing | selection or expansion enabled without stable row ids |
| Column identity churn | `columns` has a new identity on almost every render |
| `tableOptions` collision | a ledger-managed key passed through the escape hatch |
| Pagination + `onEndReached` | the two paging models configured together |
| Unconstrained virtualization | `virtualized` while the viewport cannot scroll |
| Reordering with header groups | `enableColumnOrdering` ignored under grouped headers |
| Server select-filter without options | select-family filter in server `filterMode` with no `options` |
