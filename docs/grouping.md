# Grouping and aggregation

```tsx
<DataTable
  enableGrouping
  defaultGrouping={["status"]}
  columns={[
    helper.accessor("status", { header: "Status" }),
    helper.accessor("name",   { header: "Name", enableGrouping: false }),
    helper.accessor("salary", {
      header: "Salary",
      aggregationFn: "mean",
      aggregatedCell: ({ getValue }) => `Ø ${Math.round(getValue<number>())}`
    })
  ]}
  …
/>
```

`enableGrouping` (default `false`) wires TanStack's grouped + expanded row models and adds a group toggle to each eligible row of the [columns panel](columns.md#the-columns-panel) — the only built-in trigger (columns opt out with `enableGrouping: false` on their def). Page-owned triggers reach the same state through `column.toggleGrouping()`.

## Rendering

- A **grouped cell** renders an expand/collapse chevron, the group's value, and the group size — `(12)` — inside a `data-group-cell` wrapper; clicking the chevron toggles the group without touching `onRowClick`.
- **Aggregated cells** on the other columns render `aggregatedCell` (falling back to `cell`) over TanStack's aggregation pipeline — all built-in `aggregationFn`s (`count`, `extent`, `first`, `last`, `max`, `mean`, `median`, `min`, `sum`, `unique`, `uniqueCount`) and custom functions work unchanged.
- Group open/closed state rides the same `expanded` trio used by trees and detail panels.
- TanStack's default `groupedColumnMode: "reorder"` applies — the grouped column moves to the front while grouped. Override it through `tableOptions.groupedColumnMode` if the column should stay put ([state.md](state.md)).

## State

The `grouping` slice follows the standard trio (`grouping` / `defaultGrouping` / `onGroupingChange`, TanStack `GroupingState` — an ordered array of column ids). Multiple ids nest groups in order. `grouping` is a persistable slice for `persistState`, though not part of the default layout set ([state.md](state.md)).

## Boundaries

- Grouping is a client-side row pipeline; there is no `groupingMode: "server"` — server-shaped aggregation is better modeled as pre-aggregated rows with [tree data](rows.md#tree-data).
- Grouped and aggregated cells are never editable ([editing.md](editing.md) skips them), and grouped rows don't render detail panels.
- Combining grouping with row virtualization works — grouped rows are ordinary display rows. Combining it with row pinning pins data rows, not groups ([pinning.md](pinning.md)).
