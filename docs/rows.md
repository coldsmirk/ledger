# Rows

Row-level interaction, master–detail panels, tree data, and the loading/empty presentation.

## Row interaction

```tsx
<DataTable
  onRowClick={(row, event) => openDrawer(row.original)}
  onRowDoubleClick={(row, event) => …}
  onRowContextMenu={(row, event) => { event.preventDefault(); … }}
  rowClassName={row => (row.original.overdue ? "row-overdue" : undefined)}
  …
/>
```

- Handlers receive the typed TanStack `Row` and the React mouse event. When `onRowClick` is set, rows render `data-clickable` (pointer cursor).
- **The stop-propagation covenant**: interactive things inside a row — selection checkboxes, expander chevrons, editing cells and editors, header/menu triggers — never leak their clicks to the row handlers. A `display` actions column you write yourself should follow the same rule (`event.stopPropagation()` in its buttons).
- On editable columns, the double-click that starts editing does not fire `onRowDoubleClick` ([editing.md](editing.md)).
- `rowClassName` (string or per-row function) lands on the `<tr>` alongside the Styles API classes.

## Master–detail panels

```tsx
<DataTable
  renderDetailPanel={row => <PersonDetail person={row.original} />}
  getRowId={person => person.id}
  …
/>
```

- Declaring `renderDetailPanel` injects the expander column and makes every row expandable; the chevron toggles a full-width panel row (`<td colSpan={…}>` with the `detailPanel` selector) directly beneath its row.
- Expansion state rides the `expanded` trio (TanStack `ExpandedState`); pair it with `getRowId` so panels survive refetches.
- Under virtualization each open panel is a **synthetic display row** — exactly one `<tr>` per virtual item, so dynamic-height measurement stays correct ([virtualization.md](virtualization.md)).
- There is deliberately no expand-all affordance for detail panels — a master–detail table opens panels one at a time; expand-all belongs to trees.

## Tree data

```tsx
<DataTable
  getSubRows={node => node.children}
  getRowId={node => node.id}
  …
/>
```

- `getSubRows` wires TanStack's sub-row model: child rows render beneath their parent, indented 20px per depth level on the first data cell.
- The injected expander column shows a chevron on rows that can expand, and its **header** carries an expand-all / collapse-all toggle (trees only).
- Expansion rides the same `expanded` trio as detail panels. `renderDetailPanel` and `getSubRows` can coexist — the expander is shared and an expanded row shows both its children and its panel.
- Sorting and filtering apply TanStack's default tree semantics; the deep-tuning knobs (`filterFromLeafRows`, `maxLeafRowFilterDepth`, `paginateExpandedRows`, `enableSubRowSelection`) pass through `tableOptions` ([state.md](state.md)).

## Loading and empty states

| Prop | Presentation |
| --- | --- |
| `loading` with **no rows yet** | Skeleton rows (count follows the page size, clamped to 3–12) |
| `loading` with rows present | A blurring `LoadingOverlay` above the current rows — the data stays visible during refetches |
| `loadingMore` | A trailing loader row under the last data row ([virtualization.md](virtualization.md)) |
| Zero rows and not loading | The `emptyState` node — or the default Mantine `EmptyState` (inbox icon + `labels.empty`) — overlaid and centered in the visible body region (`data-empty` on the root gives the region a 16rem floor under indefinite parents) |

```tsx
<DataTable
  loading={query.isLoading}
  emptyState={<EmptyIllustration onCreate={openCreateModal} />}
  …
/>
```

The root exposes `data-loading` and `aria-busy` while loading. Empty states center inside the elastic scroller, so they respect the adaptive sizing contract ([sizing.md](sizing.md)).
