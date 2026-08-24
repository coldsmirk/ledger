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
- **Detail panels are synthetic display rows**: an expanded row contributes `[row, panelRow]` to its top, center, or bottom display zone, so every `<tr>` is exactly one measured item. Center items virtualize; pinned data/detail pairs stay mounted and sticky together.
- **The viewport is adaptive** ([sizing.md](sizing.md)): TanStack Virtual observes the scroll element with ResizeObserver — flex reflow, drawer toggling, and window resizing re-window automatically, with **no fixed-height prerequisite**. If the viewport turns out unconstrained (its height equals the content height), virtualization is inert and a dev-mode warning says so; give the table or an ancestor a definite height.
- Pinned rows and their expanded detail rows stay mounted outside the window ([pinning.md](pinning.md)); virtualization changes nothing about pinned columns.
- Scrolling an **editing** cell out of the window commits it, never discards it. Row mode is the other way round: the draft store belongs to the controller, so an editing row that scrolls out and back keeps its pending values and commits only when asked to ([editing.md](editing.md)).
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

- `onEndReached` fires once the remaining scroll distance drops inside `endReachedOffset` (default 240px), **deduplicated per `data` identity** — it will not fire again until `data` is a different array, so a slow response cannot double-fetch. Identity rather than length on purpose: a server-side filter or sort can hand back a different page of the same size, and a length guard would never re-arm for it. The probe also re-runs when a load finishes (`loading` / `loadingMore` falling back to `false`) or when an `onEndReached` handler mounts after the table, so content too short to scroll can still ask for more. Guard the call with your own `hasNext`.
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

Virtualized tables resolve the row through the **center** display-row list and delegate to the virtualizer; a top/bottom pinned target is already mounted at its edge and does not scroll. Non-virtualized tables fall back to `scrollIntoView`. `align` is `"start" | "center" | "end" | "auto"` (default `"auto"`). The handle also exposes the raw ScrollArea `viewport` element ([api.md](api.md#imperative-handle)).

For the explicit ARIA table, `aria-rowcount` and `aria-rowindex` describe one logical sequence: header rows, top-pinned data/details, center data/details, bottom-pinned data/details, the infinite loader, then footer rows. A virtual window may omit center DOM rows, but every mounted row keeps its position in that complete sequence.
