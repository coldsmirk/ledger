# Rows

Row-level interaction, master–detail panels, tree data, and the loading/empty presentation.

## Row interaction

```tsx
<DataTable
  onRowActivate={(row, event) => openDrawer(row.original)}
  onRowDoubleClick={(row, event) => …}
  onRowContextMenu={(row, event) => { event.preventDefault(); … }}
  rowProps={row => ({ className: row.original.overdue ? "row-overdue" : undefined })}
  …
/>
```

- **`onRowActivate` is the one to reach for.** It means "the user chose this row" and fires whatever the input device: a primary click, or `Enter` on the current row when `enableActiveRow` is on. Its event is therefore `MouseEvent | KeyboardEvent`.
- `onRowClick` / `onRowDoubleClick` / `onRowContextMenu` are literal pointer events and stay pointer-only — their signatures say `MouseEvent` and they never receive anything else. A click fires `onRowClick` first, then `onRowActivate`. Wiring navigation to `onRowClick` alone leaves it unreachable by keyboard.
- Handlers receive the typed TanStack `Row`. A row that responds to a click renders `data-clickable` (pointer cursor).
- **The stop-propagation covenant**: interactive things inside a row — selection checkboxes, expander chevrons, editing cells and editors, header/menu triggers — never leak their clicks to the row handlers. A `display` actions column you write yourself should follow the same rule (`event.stopPropagation()` in its buttons).
- On editable columns, the double-click that starts editing does not fire `onRowDoubleClick` ([editing.md](editing.md)).
- Anything else you need on the `<tr>` — attributes, `data-*`, hover handlers, inline styles — goes through `rowProps` ([DOM props](styling.md#dom-props)).

## Active row

`enableActiveRow` adds a single keyboard-reachable **current row**, deliberately independent from checkbox selection (a bulk-action set and a cursor are different things):

```tsx
<DataTable
  enableActiveRow
  defaultActiveRowId="42"
  onActiveRowIdChange={id => setPreviewId(id)}
  …
/>
```

- **Mouse**: clicking a row makes it current (before the row handlers fire); the injected checkbox and expander keep their stop-propagation covenant and do not move it.
- **Keyboard**: the body viewport becomes a focus stop (visible focus ring). `↑`/`↓` move the current row (scrolling it into view, virtualized included), `Home`/`End` jump to the edges, `Enter` fires `onRowActivate` for the current row, and `F2` starts editing it ([editing.md](editing.md#keyboard-and-lifecycle)).
- State rides the ledger-owned `activeRowId` trio (`activeRowId` / `defaultActiveRowId` / `onActiveRowIdChange`) — controlled works like every other slice, so a master–detail page can drive the highlight from the outside.
- Focus stays on the viewport as the current row moves, so each change is announced through a polite live region (`labels.currentRow`, naming the row by its leading visible cell); the focus stop itself is *described* by `labels.rowNavigation` ([accessibility.md](accessibility.md)).
- The current row renders `data-active` and `aria-current`, and takes the heavier of Mantine's two light steps (`--mantine-primary-color-light-hover`) while selection keeps the calmer one — exactly one row is ever current, so the cursor stays findable inside a block of selected rows without an accent bar.

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
- Row pinning preserves that pair: an expanded top/bottom row renders its panel directly after it in the same measured sticky zone ([pinning.md](pinning.md)).
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

## Loading, empty, and error states

| Prop | Presentation |
| --- | --- |
| `loading` with **no rows yet** | Skeleton rows (count follows the page size, clamped to 3–12) |
| `loading` with rows present | A blurring `LoadingOverlay` above the current rows — the data stays visible during refetches |
| `loadingMore` | A trailing loader row under the last data row ([virtualization.md](virtualization.md)) |
| `loadMoreError` | Replaces the trailing loader row with the message (`true` uses `labels.loadMoreError`; a node replaces it) plus a retry button that fires `onEndReached` again |
| Zero rows and not loading | The `emptyState` node — or the default Mantine `EmptyState` — overlaid and centered in the visible body region (`data-empty` on the root gives the region a 16rem floor under indefinite parents) |
| `error` | An error panel (warning icon; `true` uses `labels.error`, a node replaces the message; `onRetry` adds a retry button). With stale rows present it overlays them behind a body-tinted scrim; it takes precedence over the empty state |

The default empty rendering distinguishes two situations: zero rows with a column filter or global search active shows `labels.noResults` under a search icon (the data exists — nothing matched), while a genuinely empty data set shows `labels.empty` under an inbox icon. A custom `emptyState` node replaces both.

```tsx
<DataTable
  loading={query.isLoading}
  error={query.isError}
  onRetry={() => query.refetch()}
  emptyState={<EmptyIllustration onCreate={openCreateModal} />}
  …
/>
```

The root exposes `data-loading` while loading (`aria-busy` sits on the ARIA table), `data-empty` on the empty states, and `data-error` while the error panel shows; the panel itself carries `data-variant="no-data" | "no-results" | "error"`. All states center inside the elastic scroller, so they respect the adaptive sizing contract ([sizing.md](sizing.md)).
