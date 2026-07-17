# Virtualization and infinite loading

Row virtualization keeps the DOM small at any data size while remaining a **real `<table>`** — no div-soup grid, no absolute positioning.

```tsx
<DataTable
  virtualized
  data={rows}                 // tens of thousands are fine
  getRowId={row => row.id}
  …
/>
```

`virtualized` accepts `true` or a config object:

| Option | Default | Meaning |
| --- | --- | --- |
| `estimateRowHeight` | `44` | Initial row-height estimate in px (real heights are measured per row) |
| `overscan` | `8` | Extra rows rendered beyond the viewport in each direction |

## How it works

- **Spacer-row technique**: `tbody` gets a top and a bottom spacer `<tr>` sized from the virtualizer, and the windowed rows render in normal table flow. Table semantics, `colgroup` widths, and Mantine's row styling all survive; screen readers get `aria-rowcount` on the table and `aria-rowindex` per row.
- **Dynamic row heights** are measured per row (TanStack Virtual `measureElement`) — multiline cells and open detail panels need no configuration. Overestimating `estimateRowHeight` slightly is better than underestimating.
- **Detail panels are synthetic display rows**: an expanded row contributes `[row, panelRow]` to the list the virtualizer counts, so every `<tr>` is exactly one virtual item and measurement stays trivially correct.
- **The viewport is adaptive** ([sizing.md](sizing.md)): TanStack Virtual observes the scroll element with ResizeObserver — flex reflow, drawer toggling, and window resizing re-window automatically, with **no fixed-height prerequisite**. If the viewport turns out unconstrained (its height equals the content height), virtualization is inert and a dev-mode warning says so; give the table or an ancestor a definite height.
- Pinned rows stay mounted outside the window ([pinning.md](pinning.md)); virtualization changes nothing about pinned columns.
- Scrolling an **editing** row out of the window commits the edit, never discards it ([editing.md](editing.md)).
- The header lives outside the scroller ([sizing.md](sizing.md)), so deep scrolling never touches it and the scrollbar spans exactly the rows.

## Infinite loading

`onEndReached` turns scroll position into a load trigger; it works with or without virtualization (the two just usually travel together):

```tsx
<DataTable
  virtualized
  data={pages.flat()}
  onEndReached={() => hasNext && fetchNextPage()}
  endReachedOffset={240}
  loadingMore={isFetchingNextPage}
  …
/>
```

- `onEndReached` fires once the remaining scroll distance drops inside `endReachedOffset` (default 240px), **deduplicated per data length** — it will not fire again until `data` has grown (or shrunk), so a slow response cannot double-fetch. Guard the call with your own `hasNext`.
- If the content is shorter than the viewport (or on first mount), the probe runs one frame after layout settles and skips unlaid-out viewports — so an initial short page still triggers exactly one load, and never a phantom one.
- While `loading` or `loadingMore` is set, the trigger holds.
- `loadingMore` renders a trailing loader row (`labels.loadingMore`).
- Pagination and infinite loading are mutually exclusive; configuring both logs a dev-mode warning ([pagination.md](pagination.md)).

## `scrollToRow`

The imperative handle scrolls to a row by id (or row-model index):

```tsx
const handle = useRef<DataTableHandle<Person>>(null);

<DataTable handleRef={handle} … />

handle.current?.scrollToRow("person-42", { align: "center", behavior: "smooth" });
```

Virtualized tables resolve the row through the display-row list and delegate to the virtualizer; non-virtualized tables fall back to `scrollIntoView`. `align` is `"start" | "center" | "end" | "auto"` (default `"auto"`). The handle also exposes the raw ScrollArea `viewport` element ([api.md](api.md#imperative-handle)).
