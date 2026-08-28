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

- **Multi-select** is the default. `enableMultiRowSelection={false}` switches to single-select — cells render a **radio** (one choice at a time is what a radio means), all rendered rows share one group name so the platform's arrow-key navigation applies, toggling a row replaces the previous selection, and the header control disappears (select-all is meaningless there). Under virtualization only the mounted window is in that group.
- **Shift-click range** is TanStack v9's own `getToggleSelectedHandler()` behavior (`enableRowRangeSelection`, default `true`; opt out via `tableOptions`): an ordinary click sets the anchor, a Shift-click selects or deselects the contiguous range to the target in the current view order (after sorting/filtering). The range respects the selection predicate — disabled rows inside it are skipped.
- **Select-all scope**: the header checkbox covers the **current page** while pagination is active (`enablePagination` or `paginationMode: "server"`), and **all filtered rows** otherwise. It shows an indeterminate state while partially selected.
- **Selection survives view changes**: because state is id-keyed, paging, sorting, and filtering never drop selected rows — a row selected on page 1 stays selected while you browse page 3. Render `DataTable.SelectionBar` so the running total stays visible.
- Checkbox clicks stop propagation — selecting never triggers `onRowClick`.

## Overriding the injected column

The selection column is an ordinary `ColumnDef`, so `selectionColumn` merges over it — a wider column, a custom cell (a tooltip explaining why a row is disabled, say), a different header. The injected def fixes `size` / `minSize` / `maxSize` at 40, so a `size` override alone is clamped straight back to 40 — raise `maxSize` alongside it to widen. Only `id` is reserved: it is how ledger recognizes its own column and keeps the centered layout, the stop-propagation covenant, and the exclusions from CSV export and the columns panel.

```tsx
<DataTable
  enableRowSelection={row => row.original.status !== "archived"}
  selectionColumn={{
    maxSize: 56,
    size: 56,
    cell: ({ row }) => (
      <Tooltip disabled={row.getCanSelect()} label="Archived rows cannot be selected">
        <span>
          <Checkbox
            aria-label="Select row"
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            size="xs"
            onChange={event => row.toggleSelected(event.currentTarget.checked)}
          />
        </span>
      </Tooltip>
    )
  }}
  …
/>
```

A replacement `cell` builds its control from the public row API, as above. What the reserved `id` carries survives the swap — the centered layout, the stop-propagation covenant, the CSV and columns-panel exclusions — but the built-in control's own behavior does not: shift-click ranges, the single-select radio under `enableMultiRowSelection={false}`, the sub-row indeterminate state, and the `labels.selectRow` wiring all live in ledger's default cell, so a custom cell re-provides what it needs.

`expanderColumn` does the same for the expander column ([rows.md](rows.md#masterdetail-panels)) — a different chevron, a wider gutter (its bounds are fixed at 36 the same way: raise `maxSize` alongside `size`), an "expand all" header of your own.

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

The count comes from the full selection state, not from `getSelectedRowModel()` — deliberately, because that model resolves the state against the rows the table actually holds, which under server pagination is a single page. Counting it would drop everything selected on pages that are no longer loaded, and surviving exactly that is the point of id-keyed state. The corollary is that an id the data no longer holds still counts, which is one more reason selection requires a stable `getRowId`. `table.resetRowSelection()` backs the clear button; `toCsv(table, { scope: "selected" })` exports the selected rows the table has ([api.md](api.md#tocsv)).

## State and instance API

The `rowSelection` slice follows the standard trio with TanStack's `RowSelectionState` shape (`Record<rowId, true>`); the full TanStack selection API is available on the instance — `table.getSelectedRowModel().rows`, `row.getIsSelected()`, `row.toggleSelected()`, `table.toggleAllRowsSelected(false)`, and so on.

Sub-row selection cascading for tree data (`enableSubRowSelection`) is not surfaced as a first-class option; it passes through `tableOptions` untouched ([state.md](state.md)) — the injected checkbox does render the indeterminate state for a parent whose subtree is partially selected. Note the v9 semantics of `getIsSomeRowsSelected()` / `getIsSomePageRowsSelected()`: they now mean "at least one" and stay `true` at full selection.
