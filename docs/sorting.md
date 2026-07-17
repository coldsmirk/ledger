# Sorting

Sorting is on by default (`enableSorting`, default `true`); individual columns opt out with `enableSorting: false` on their `ColumnDef`.

## Interaction

- The whole header label is a button. Clicking cycles **unsorted → ascending → descending → unsorted** (the removal step is `enableSortingRemoval`, default `true`).
- **Shift-click appends** a column to the existing sort instead of replacing it (`enableMultiSort`, default `true`). While more than one column is sorted, each sorted header shows its 1-based order badge next to the direction chevron.
- The indicator is invisible on unsorted columns until the header is hovered or focused, then fully visible once sorted — sortable columns stay quiet until relevant.
- Sorted headers expose `aria-sort="ascending" | "descending"`.

## Per-column behavior

All of TanStack's column-level sorting knobs apply unchanged on the `ColumnDef`:

```tsx
helper.accessor("createdAt", {
  header: "Created",
  sortingFn: "datetime",
  sortDescFirst: true,     // first click sorts newest-first
  sortUndefined: "last"    // missing values sink to the bottom
});
```

`invertSorting`, custom `sortingFn` functions, and the registry (`tableOptions.sortingFns`) are equally available. Niche table-level tuning (`maxMultiSortColCount`, `isMultiSortEvent`) goes through `tableOptions` — see [state.md](state.md).

## State

The sorting slice follows the standard trio — TanStack's `SortingState` shape verbatim, callbacks receiving resolved values:

```tsx
const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);

<DataTable
  sorting={sorting}                 // controlled; or defaultSorting for uncontrolled
  onSortingChange={setSorting}
  …
/>
```

## Server mode

`sortingMode: "server"` tells the table the rows arrive pre-sorted: ledger sets TanStack's `manualSorting` and omits the client sorted-row model. The interaction and state surface are unchanged — observe `onSortingChange`, refetch, and hand back new `data`:

```tsx
<DataTable
  sortingMode="server"
  sorting={sorting}
  onSortingChange={setSorting}      // → refetch with the new order
  data={rowsFromServer}
  …
/>
```

With server pagination active, a sorting change also resets `pageIndex` to 0 — the deterministic reset policy described in [state.md](state.md).
