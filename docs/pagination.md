# Pagination

`enablePagination` (default `false`) turns on pagination and, by default, the built-in pagination bar. The name is ledger-owned by necessity: TanStack expresses "pagination on/off" through row-model inclusion, so there is no upstream name to borrow.

```tsx
<DataTable
  enablePagination
  defaultPagination={{ pageIndex: 0, pageSize: 20 }}
  pageSizeOptions={[10, 20, 50, 100]}
  …
/>
```

## The pagination bar

Rendered at the root's bottom edge (a rigid flex row outside the scroller) whenever pagination is enabled and `withPaginationBar` is `true` (its default):

- **Summary** on the start side: `1–20 of 138`, localized through `labels.paginationSummary`.
- **Rows per page** select (`pageSizeOptions`, default `[10, 20, 50, 100]`).
- **Mantine `Pagination`** page controls. TanStack's 0-based `pageIndex` converts to Mantine's 1-based `value` inside the bar and nowhere else.

To place the controls elsewhere, opt out and use the standalone compound:

```tsx
<DataTable table={table} withPaginationBar={false} … />
<Group justify="flex-end">
  <DataTable.Pagination table={table} pageSizeOptions={[25, 50]} />
</Group>
```

`DataTable.Pagination` takes `table`, optional `pageSizeOptions` / `labels` / `className` / `style`, and is themeable app-wide via `DataTablePagination` `defaultProps`.

## State

The `pagination` slice follows the standard trio with TanStack's `PaginationState` shape (`{ pageIndex, pageSize }`); the uncontrolled default is `{ pageIndex: 0, pageSize: 20 }`. All TanStack navigation APIs work on the instance (`table.nextPage()`, `table.setPageSize(50)`, …).

## Server mode

```tsx
<DataTable
  enablePagination
  paginationMode="server"
  rowCount={total}                       // the server's total row count
  pagination={pagination}
  onPaginationChange={setPagination}     // → refetch page
  data={pageRows}
  …
/>
```

- `paginationMode: "server"` sets TanStack's `manualPagination` and omits the client pagination row model — `data` is exactly one page.
- `rowCount` is the total; `pageCount` is derived internally (`ceil(rowCount / pageSize)`, floor 1) and the bar's summary uses `rowCount` as its denominator.
- **Deterministic reset**: ledger keeps TanStack's upstream page reset disabled and performs the server-safe equivalent itself — a `columnFilters`, `globalFilter`, or `sorting` change sets `pageIndex` back to 0 (skipped on mount, including root `StrictMode`; a no-op when already there). It honors `tableOptions.autoResetAll ?? tableOptions.autoResetPageIndex ?? true`. In server pagination, ledger consumes the global option for this policy and forwards its non-pagination effects through `autoResetExpanded` and `autoResetSorting`, so an upstream queued reset cannot restore a nonzero `defaultPagination`. Policy details in [state.md](state.md).

### The two switches are independent

`enablePagination` governs the built-in bar and whether the client row model paginates; `paginationMode` governs the row-model bypass, the deterministic page reset, `rowCount`, and the select-all scope. They are ordinarily set together, but `paginationMode: "server"` on its own is a legitimate configuration — the server has already sliced the page, and the application renders `DataTable.Pagination` (or nothing at all) wherever it likes. That is why neither combination warns.

## Interactions with other features

- **Select-all scope**: while pagination is active (either `enablePagination` or `paginationMode: "server"`), the header checkbox selects the current page, not the whole result set — see [selection.md](selection.md).
- **Infinite loading is the alternative, not a companion**: configuring `onEndReached` together with pagination logs a dev-mode warning — pick one ([virtualization.md](virtualization.md)).
- `pagination` is a persistable slice (`persistState`), though layout slices are the default set.
