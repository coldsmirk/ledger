# Virtualization and infinite loading

Virtualization keeps the DOM small at any data size while remaining a **real `<table>`** — no div-soup grid, no absolute positioning. The two axes are independent switches: `virtualizedRows` windows the rows, `virtualizedColumns` windows the columns, and a wide-and-tall matrix turns on both.

```tsx
<DataTable
  virtualizedRows
  data={rows}                 // tens of thousands are fine
  getRowId={row => row.id}
  …
/>
```

`virtualizedRows` accepts `true` or a config object:

| Option | Default | Meaning |
| --- | --- | --- |
| `estimateHeight` | `44` | Initial row-height estimate in px (real heights are measured per row) |
| `overscan` | `8` | Extra rows rendered beyond the viewport in each direction |

## How row virtualization works

- **Spacer-row technique**: `tbody` gets a top and a bottom spacer `<tr>` sized from the virtualizer, and the windowed rows render in normal table flow. Table semantics, `colgroup` widths, and Mantine's row styling all survive; screen readers get `aria-rowcount` on the table and `aria-rowindex` per row.
- **Dynamic row heights** are measured per row (TanStack Virtual `measureElement`) — multiline cells and open detail panels need no configuration. Overestimating `estimateHeight` slightly is better than underestimating.
- **Detail panels are synthetic display rows**: an expanded row contributes `[row, panelRow]` to its top, center, or bottom display zone, so every `<tr>` is exactly one measured item. Center items virtualize; pinned data/detail pairs stay mounted and sticky together.
- **The viewport is adaptive** ([sizing.md](sizing.md)): TanStack Virtual observes the scroll element with ResizeObserver — flex reflow, drawer toggling, and window resizing re-window automatically, with **no fixed-height prerequisite**. If the viewport turns out unconstrained (its height equals the content height), virtualization is inert and a dev-mode warning says so; give the table or an ancestor a definite height.
- Pinned rows and their expanded detail rows stay mounted outside the window ([pinning.md](pinning.md)).
- Scrolling an **editing** cell out of the window commits it, never discards it. Row mode is the other way round: the draft store belongs to the controller, so an editing row that scrolls out and back keeps its pending values and commits only when asked to ([editing.md](editing.md)).
- The header lives outside the scroller ([sizing.md](sizing.md)), so deep scrolling never touches it and the scrollbar spans exactly the rows.

## Column virtualization

```tsx
<DataTable
  virtualizedColumns          // or { overscan?: number } — default 4
  virtualizedRows             // independent; combine for a wide-and-tall matrix
  columns={manyColumns}
  …
/>
```

Only the **center zone** windows — pinned columns are sticky and always mounted, the mirror of pinned rows under row virtualization. The three synced tables (header, body, footer) share one windowed `colgroup`: the hidden runs on each side collapse into two spacer `<col>`s carrying exactly the widths the missing columns add up to, and each row renders matching `aria-hidden` spacer cells, so the scrollbar, the table width, and the pinned offsets never notice the columns are gone.

- **Nothing is estimated.** The width engine already resolves every column to exact integer pixels ([sizing.md](sizing.md)), so the window is a binary search over their prefix sums — there is no `estimateSize` to tune and the horizontal scrollbar is always exact. `overscan` (columns per side, default 4) is the whole configuration.
- **Header groups work, at any depth.** One clamp rule tiles every header and footer row: a header's `colSpan` becomes the number of its leaf columns actually rendered, headers with nothing rendered vanish, and a group the window edge cuts through keeps its label over its rendered slice. A header whose rendered leaves flank a hidden run (a group spanning from a pinned column into the window) absorbs that spacer col into its own cell.
- **ARIA mirrors the row story**: the table carries `aria-colcount` (all leaf columns), and every rendered header cell and data cell carries `aria-colindex` — its position among all columns, windowed-out ones included.
- `spanRows` / `spanColumns` are ignored (with a dev warning) while `virtualizedColumns` is on, exactly as under `virtualizedRows` ([columns.md](columns.md#merged-cells)).
- An **editor** whose column leaves the window follows the same lifecycle as one whose row does: cell mode commits on unmount, row-mode drafts and instant pending state live in the controller and survive ([editing.md](editing.md)).
- **Continuous shifts render as chased React transitions; discrete leaps render synchronously.** The body scrolls on the compositor thread while the header/footer mirror runs on the main thread, so a blocking shift render would shear them apart for its whole duration; time-sliced, the mirror stays inside the frame. At most one transition is in flight — restarting per scroll event would starve it through a whole smooth scroll — and each commit re-measures and chases the live position, so the window keeps landing mid-flight. A leap larger than the visible strip (`scrollToColumn`, a scrollbar jump) applies synchronously instead — the mirror already ran ahead of it in the same event, and the landing must not be blank for even a render — and so does any shift whose target no longer overlaps the committed window: the strip is already fully blank at that point, so there is nothing left for a transition to keep responsive (this is what keeps a fast scrollbar drag showing bands instead of white). Under a fast fling the window can still fill a beat behind — the spacer cols keep the geometry exact throughout, the standard virtualization trade.
- Header **drag reordering** scans the rendered headers, so a drop target far outside the window is reached by dragging to the viewport edge and letting auto-scroll bring it in — or through the columns panel, which always lists every column.

RTL needs no configuration on either axis: the window normalizes the negative scroll offsets RTL viewports report.

## Infinite loading

`onEndReached` turns scroll position into a load trigger; it works with or without virtualization (the two just usually travel together):

```tsx
<DataTable
  virtualizedRows
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

## `scrollToRow`, `scrollToIndex` and `scrollToColumn`

The imperative handle scrolls to a row by id, to a position in the page's own row model, or to a column by id:

```tsx
const handle = useRef<DataTableHandle<Person>>(null);

<DataTable handleRef={handle} … />

handle.current?.scrollToRow("person-42", { align: "center", behavior: "smooth" });
handle.current?.scrollToIndex(0);
handle.current?.scrollToColumn("2024-06", { align: "start" });
```

Two row methods rather than one parameter accepting `string | number`: `getRowId` may well return digits, and a table whose ids read `"5"` could not say which of the two was meant.

Virtualized tables resolve the row through the **center** display-row list and delegate to the virtualizer; a top/bottom pinned target is already mounted at its edge and does not scroll. Non-virtualized tables fall back to `scrollIntoView`. `scrollToColumn` is pure width-engine math against the visible strip the pinned overlays leave, so a column the window is not rendering is still reachable; a pinned column is already in view and the call is a no-op. `align` is `"start" | "center" | "end" | "auto"` (default `"auto"`). The handle also exposes the raw ScrollArea `viewport` element ([api.md](api.md#imperative-handle)).

For the explicit ARIA table, `aria-rowcount` and `aria-rowindex` describe one logical sequence: header rows, top-pinned data/details, center data/details, bottom-pinned data/details, the infinite loader, then footer rows. A virtual window may omit center DOM rows, but every mounted row keeps its position in that complete sequence.
