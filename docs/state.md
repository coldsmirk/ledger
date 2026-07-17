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

`defaultX` is also what a **reset** returns to. Every TanStack slice reset API (`resetSorting()`, `resetPagination()`, `resetColumnOrder()`, …) restores `table.initialState`, which ledger seeds from that slice's `defaultX` or the fallback in the table below. So a reset lands on the state ledger or the application declared, not on TanStack's unrelated built-in defaults. Persisted values are excluded from that seeding on purpose: if a restored value became the reset target, a reset after a refresh would do nothing. `initialState` is ledger-managed and never reaches a read path (`table.getState()` returns the controlled `state` verbatim); passing your own through `tableOptions.initialState` is overridden with a dev warning, per the merge rule below — the per-slice `defaultX` trio is the way in.

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

In **client** mode TanStack's defaults stand (e.g. a filter change resets `pageIndex`). In **server** mode ledger keeps TanStack's upstream page reset disabled and performs the one equivalent deterministic reset itself: a `columnFilters`, `globalFilter`, or `sorting` change resets `pageIndex` to 0 (never on mount, including a root `StrictMode` mount, and a no-op when already 0). The deterministic reset follows `tableOptions.autoResetAll ?? tableOptions.autoResetPageIndex ?? true`: `autoResetAll` wins when present; otherwise `autoResetPageIndex: false` disables it. Because TanStack otherwise gives `autoResetAll` priority and can queue a reset to `initialState.pagination`, server mode consumes that global option and forwards its non-pagination effect through `autoResetExpanded`; ledger's zero reset therefore remains authoritative.

## `tableOptions` — the escape hatch

Everything `useReactTable` accepts can be passed through `tableOptions`. It is the **base layer**: ledger-managed keys (row models, `state`, the `on*Change` wiring, `manualX` translations, injected columns, `columnResizeMode`, …) override it, and each collision logs a dev-mode warning naming the first-class option to use instead. `manualSorting` and `sortingMode` can never silently fight — the mode wins, audibly. `filterFns` is the registry exception: consumer entries are merged, while the reserved `ledger-one-of` and `ledger-date-range` ids win with a warning if redefined.

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

`useDataTable` returns the **bare TanStack `Table<TData>`** — no wrapper type, so hook mode loses nothing and every TanStack API works. Ledger-private configuration and controllers ride `table.options.meta.ledger` (TanStack's sanctioned extension point, typed via declaration merging as `LedgerMeta<TData>`): the editing controller, filter-set subscriptions used by debounced controls, `editTrigger`, `enableEditing`, `onEditCommit`, `renderDetailPanel`, the select-all scope, the shift-selection anchor, `totalRowCount`, `enableColumnOrdering`, and `enablePagination`. Compound components and advanced consumers may read it; treat it as read-mostly plumbing.

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
- Writes are debounced (250 ms), with the latest pending value flushed on real unmount (StrictMode's simulated unmount is ignored). Storage content is treated as a trust boundary: each slice and its nested TanStack fields are shape-checked on read, and a stale or corrupt slice degrades to its default instead of crashing the table.

## Dev-mode guard rails

Warnings are development-only and fire once per session each:

| Guard | Trigger |
| --- | --- |
| `getRowId` missing | selection or expansion enabled without stable row ids |
| Column identity churn | `columns` has a new identity on almost every render |
| `tableOptions` collision | a ledger-managed key passed through the escape hatch |
| Reserved filter function | `tableOptions.filterFns` redefines `ledger-one-of` or `ledger-date-range` |
| Pagination + `onEndReached` | the two paging models configured together |
| Unconstrained virtualization | `virtualized` while the viewport cannot scroll |
| Reordering with header groups | `enableColumnOrdering` ignored under grouped headers |
| Server select-filter without options | select-family filter in server `filterMode` with no `options` |
