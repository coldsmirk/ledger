# Row selection

```tsx
<DataTable
  enableRowSelection
  getRowId={row => row.id}
  defaultRowSelection={{}}
  onRowSelectionChange={setSelection}
  …
/>
```

`enableRowSelection` (default `false`) injects a pinned checkbox column (see [columns.md](columns.md)) and accepts either a boolean or a **predicate** `(row) => boolean` — rows failing the predicate render a disabled checkbox and are excluded from every bulk operation:

```tsx
enableRowSelection={row => row.original.status !== "archived"}
```

**Always pair selection with `getRowId`.** `RowSelectionState` is keyed by row id; index-based ids silently corrupt the selection when rows are refetched, sorted, or filtered. A dev-mode warning fires when selection (or expansion) is enabled without it.

## Semantics

- **Multi-select** is the default. `enableMultiRowSelection={false}` switches to single-select — toggling a row replaces the previous selection, and the header checkbox disappears (select-all is meaningless there).
- **Shift-click range**: clicking a checkbox with Shift held selects the contiguous range between the last plainly-toggled row (the anchor) and the target, in the current view order (after sorting/filtering). The range respects the selection predicate — disabled rows inside it are skipped — and merges into the existing selection. The anchor survives range clicks, so successive Shift-clicks re-extend from the same origin.
- **Select-all scope**: the header checkbox covers the **current page** while pagination is active (`enablePagination` or `paginationMode: "server"`), and **all filtered rows** otherwise. It shows an indeterminate state while partially selected.
- **Selection survives view changes**: because state is id-keyed, paging, sorting, and filtering never drop selected rows — a row selected on page 1 stays selected while you browse page 3. Render `DataTable.SelectionBar` so the running total stays visible.
- Checkbox clicks stop propagation — selecting never triggers `onRowClick`.

## The selection bar

`DataTable.SelectionBar` renders only while something is selected: the count, a clear action, and whatever bulk actions the page passes as children.

```tsx
<DataTable.SelectionBar table={table}>
  <Button
    size="compact-xs"
    variant="light"
    leftSection={<IconDownload size={14} />}
    onClick={() => download("people.csv", toCsv(table, { scope: "selected" }))}
  >
    导出所选
  </Button>
</DataTable.SelectionBar>
```

The count comes from the full selection state (not just the visible page). `table.resetRowSelection()` backs the clear button; `toCsv(table, { scope: "selected" })` exports exactly the selected rows ([api.md](api.md#tocsv)).

## State and instance API

The `rowSelection` slice follows the standard trio with TanStack's `RowSelectionState` shape (`Record<rowId, true>`); the full TanStack selection API is available on the instance — `table.getSelectedRowModel().rows`, `row.getIsSelected()`, `row.toggleSelected()`, `table.toggleAllRowsSelected(false)`, and so on.

Sub-row selection cascading for tree data (`enableSubRowSelection`) is not surfaced as a first-class option; it passes through `tableOptions` untouched ([state.md](state.md)).
