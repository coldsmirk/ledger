# Recipes

Integration patterns that cross feature boundaries. Every feature's own semantics live in its guide; the runnable versions of most of these are the playground demos (`pnpm --filter ledger-playground dev`).

## A server-driven table (TanStack Query)

All three modes to `"server"`, state observed through the trios, data refetched from the observed state:

```tsx
function AuditLog() {
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });

  const query = useQuery({
    queryKey: ["audit", sorting, columnFilters, pagination],
    queryFn: () => api.listAudit({ sorting, filters: columnFilters, ...pagination }),
    placeholderData: keepPreviousData
  });

  return (
    <DataTable
      flex={1}
      mih={0}
      data={query.data?.rows ?? []}
      columns={auditColumns}
      getRowId={entry => entry.id}
      sortingMode="server"
      sorting={sorting}
      onSortingChange={setSorting}
      filterMode="server"
      columnFilters={columnFilters}
      onColumnFiltersChange={setColumnFilters}
      enablePagination
      paginationMode="server"
      rowCount={query.data?.total}
      pagination={pagination}
      onPaginationChange={setPagination}
      loading={query.isPending}
    />
  );
}
```

Notes: a filter or sorting change resets `pageIndex` to 0 for you ([state.md](state.md#the-auto-reset-policy)); select-family filters need explicit `options` in server mode; `placeholderData: keepPreviousData` pairs with the `loading` overlay so rows stay visible during refetches.

## Cursor-based infinite loading

Server data + `onEndReached` instead of pagination ([virtualization.md](virtualization.md#infinite-loading)):

```tsx
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(…);
const rows = useMemo(() => data?.pages.flatMap(page => page.rows) ?? [], [data]);

<DataTable
  virtualized
  flex={1}
  mih={0}
  data={rows}
  columns={columns}
  getRowId={row => row.id}
  sortingMode="server"
  onEndReached={() => hasNextPage && fetchNextPage()}
  loadingMore={isFetchingNextPage}
/>;
```

## Syncing state to the URL

The trios are plain controlled props, so router state slots straight in:

```tsx
const [params, setParams] = useSearchParams();
const sorting: SortingState = params.get("sort") ? JSON.parse(params.get("sort")!) : [];

<DataTable
  sorting={sorting}
  onSortingChange={next => setParams(previous => {
    const searchParams = new URLSearchParams(previous);
    if (next.length === 0) searchParams.delete("sort");
    else searchParams.set("sort", JSON.stringify(next));
    return searchParams;
  }, { replace: true })}
  …
/>;
```

The same shape works for any slice; keep URL-encoded slices controlled and let the rest stay uncontrolled.

## A CSV download button

```tsx
function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const anchor = Object.assign(document.createElement("a"), { href: url, download: filename });
  anchor.click();
  URL.revokeObjectURL(url);
}

<DataTable.SelectionBar table={table}>
  <Button size="compact-xs" variant="light" leftSection={<IconDownload size={14} />}
    onClick={() => downloadCsv("selected.csv", toCsv(table, { scope: "selected" }))}>
    导出所选
  </Button>
</DataTable.SelectionBar>;
```

(The BOM keeps Excel happy with UTF-8.) `scope: "filtered"` exports the current view; `"all"` the unfiltered set; for spreadsheet-bound exports of untrusted data add `escapeFormulas: true` — see [api.md](api.md#tocsv).

## Fuzzy global search

Register a custom filter function on the first-class registry and point the global filter at its id:

```tsx
import { rankItem } from "@tanstack/match-sorter-utils";   // app-side dependency, deliberately not bundled

<DataTable
  enableGlobalFilter
  filterFns={{
    fuzzy: (row, columnId, value, addMeta) => {
      const rank = rankItem(row.getValue(columnId), value);
      addMeta({ rank });
      return rank.passed;
    }
  }}
  tableOptions={{ globalFilterFn: "fuzzy" }}
  …
/>;
```

`filterFns` merges over the built-ins (registries wire code, so they are read once at mount); only the reserved `ledger-one-of` and `ledger-date-range` ids cannot be replaced. `tableOptions.globalFilterFn` deliberately accepts any string so a registered custom id typechecks; on a raw `ColumnDef.filterFn`, pass the function directly (v9 replaced the old `FilterFns` declaration merging with registry slots).

## A row-actions column

A `display` column, propagation-stopped like every injected control ([rows.md](rows.md#row-interaction)):

```tsx
helper.display({
  id: "actions",
  size: 56,
  enableSorting: false,
  enableHiding: false,
  cell: ({ row }) => (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon variant="subtle" size="sm" onClick={event => event.stopPropagation()}>
          <IconDots size={14} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={() => edit(row.original)}>编辑</Menu.Item>
        <Menu.Item color="red" onClick={() => remove(row.original)}>删除</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
});
```

Pin it to the end (`defaultColumnPinning={{ end: ["actions"] }}`) to keep actions visible under horizontal scroll.

## Optimistic inline editing

Commit locally first, reconcile with the server, and let a rejection put the cell back into editing ([editing.md](editing.md)):

```tsx
onEditCommit={async ({ row, column, value, previousValue }) => {
  setPeople(current => current.map(person =>
    person.id === row.original.id ? { ...person, [column.id]: value } : person));
  try {
    await api.patchPerson(row.original.id, { [column.id]: value });
  } catch (error) {
    setPeople(current => current.map(person =>
      person.id === row.original.id ? { ...person, [column.id]: previousValue } : person));
    throw error;   // rejection re-opens the editor with the message
  }
}}
```

## Playground demo map

Ordered simple → complex, each themed as a real business scene. Every page runs in English or
Simplified Chinese — the switch in the header swaps the app's own copy, the generated sample
data, and the `labels` the library renders with, so it doubles as a live [i18n](i18n.md) demo.
**View source** opens the demo's own file plus the local modules it imports; the copy for both
languages sits at the top of each file, which is also the pattern to copy — column defs must be
rebuilt (`useMemo` on the copy object) or a locale switch leaves the old headers standing.

| Demo (`packages/playground/src/demos/`) | Scene | Exercises |
| --- | --- | --- |
| `basic` | Staff roster | the minimal table: raw column defs + data, sorting, hover, a responsive column pair |
| `appearance` | Price list | the three border shapes (frame + rows / grid / horizontal-only), stripes, spacing, loading, empty state, the header tint recipe |
| `states` | Every unhappy path | loading, empty, no-results, error + retry, load-more error, a custom empty state |
| `orders` | Order desk | all five filter variants, pagination, footer totals, the active row, `onRowActivate`, `onRowContextMenu`, `rowProps` / `meta.cellProps` |
| `selection` | Bulk actions | multi-select, shift ranges, selection bar, CSV export, per-row selectability, single-select via `selectionColumn` |
| `editing` | Stock count | all four editors, validation, async commits, a per-row edit gate |
| `row-editing` | Employee records | row mode: atomic commits, an actions column driving the controller through `meta.ledger` |
| `master-detail` | Order line items | detail panels (nested line-item table) |
| `tree` | Revenue by region | sub-rows, indentation, expand-all |
| `menu-tree` | Menu administration | a business tree: many columns, pinned tree column, horizontal scroll |
| `spanning` | Revenue report | `spanRows` / `spanColumns`, a fixed-size document rather than an elastic table |
| `grouped-headers` | Quarterly store report | `helper.group` / `helper.columns`, a footer row, `headerCellProps` / `footerCellProps` |
| `pinning` | Wide table | `ColumnsPanel` (header cog + bare panel in a drawer), pinning, resize, drag reorder, `persistState` |
| `grouping` | Sales performance | grouping + aggregation, row pinning |
| `virtualized` | Audit log | 50k rows, virtualization, infinite loading, `scrollToRow`, adaptive height |
| `server-side` | Server-backed table | `sortingMode` / `filterMode` / `paginationMode` on `"server"`, `rowCount`, a race-guarded fetch |
| `hook-toolbar` | Custom toolbar | hook mode + compound components (`Search` / `ColumnsPanel` / `Pagination`) |
