# Sizing

**Contract: the table fills whatever space its parent gives it; when the parent cannot give a definite size it degrades to content height; overflow only ever appears on the table's own scroller.**

There is no "fixed-height mode" versus "flow mode" — the internal structure is constant, and whether the scroller actually scrolls is purely a CSS outcome. This page is the authoritative description of that contract; the design rationale is recorded in [DESIGN.md](DESIGN.md).

## The root box

`.ledger-root` is a one-column grid — the elastic row, then the pagination bar — that pre-defuses the flex/grid `min-size: auto` shrink trap and keeps all overflow internal. A grid rather than a flex column because of the max-height case: a grid resolves its `1fr` row against a `max-height` (CSS Grid §12.7.1), so the region stretched into it has a definite height to scroll in, where a flex column's would stay indefinite and grow with its content. The header and the body render as **separate regions**: the header sits outside the vertical scroller, so the scrollbar belongs to the rows alone — it is never occluded by the header and never spans it.

```css
.ledger-root {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;   /* the elastic row, then the pagination bar */
  grid-template-columns: minmax(0, 1fr);
  width: 100%;
  height: 100%;      /* definite parent → fills exactly; indefinite parent → resolves to auto, grows with content */
  min-width: 0;
  min-height: 0;
  overflow: hidden;  /* overflow belongs to the internal scroller only */
}
.ledger-main           { min-width: 0; min-height: 0; }                  /* header + body frame (flex column) */
.ledger-header         { flex: none; overflow: hidden; }                 /* header viewport; mirrors body scrollLeft */
.ledger-scroller       { flex: 1 1 auto; min-height: 0; }                /* the ONLY elastic region; scrolls x and y */
.ledger-pagination-bar { flex: none; }                                   /* chrome rows are rigid */
```

The scroller is a Mantine `ScrollArea` (`scrollbars="xy"`, hover type) holding the body table; everything elastic happens inside it. Horizontal scrolling moves header and body together — the header viewport's `scrollLeft` mirrors the body's within the same frame, and a horizontal wheel over the header forwards to the body. Empty and error states are overlaid on the scroller region and centered in its visible area (an empty or errored body puts a `min-height: 16rem` floor on the scroller itself, keyed by `data-empty` / `data-error` on the root; the overlaid state block adds no height of its own). Loading is different: with no rows it renders skeleton rows in the body, and over existing rows it is a `LoadingOverlay` spanning the root.

## The four scenarios

| Scenario | Consumer CSS | Result |
| --- | --- | --- |
| Definite-height parent (app shell, `Modal`/`Drawer` body) | none | Fills it; internal scroll; fixed header |
| Flex item taking the remaining space (the common case) | `flex={1} mih={0}` | Stretches with siblings; internal scroll |
| Indefinite (content-driven) parent | none | Grows with rows; no internal vertical scroll; the page scrolls |
| Explicit constraint | Mantine style props: `h={480}`, `mah="60vh"` | A constraint, not a mode: under `mah` the table grows with its rows up to the cap, then scrolls inside it |

There are **no** `height` / `maxHeight` props. The root extends Mantine `BoxProps`, so `h` / `mah` / `mih` / `w` / `miw` / `flex` are already the sizing vocabulary — a deliberate consequence of the naming rules (Mantine owns presentation vocabulary).

### The header is always fixed

The header renders **outside** the body scroller — there is no prop, and no sticky positioning is involved: vertical scrolling simply cannot move it, it never bounces with macOS overscroll, and the scrollbar starts below it. In the degraded page-flow case the internal viewport does not scroll, so the whole table (header included) travels with the page, and a wheel over it scrolls the page — the body holds overscroll only on an axis it scrolls; that is consistent with "scrollbars belong to the table": give the table (or an ancestor) a definite height and the header stays put.

## Column widths

Widths are resolved by ledger's **width engine**: every visible leaf column becomes an exact integer pixel width, the table's own `width` is their exact sum, and the same numbers drive the `<colgroup>`s of every region and the pinned sticky offsets — one number system, with nothing left for the browser to redistribute. (Header, body, and footer are separate `<table>`s under `table-layout: fixed`; engine-resolved widths are what keep them pixel-equal.)

Resolution rules, in order:

- A column with an **explicit width** — a user resize, else its fitted content width under [`meta.autosize`](#autosize), else its `size`, else `defaultColumn.size` — is fixed at that width, clamped to its declared `minSize`/`maxSize`.
- A column **without one is a grow column** with basis `minSize ?? 80`. Container surplus distributes **proportionally to the bases** (a `minSize: 200` text column grows over twice as fast as a `minSize: 80` tag column), floored to integer pixels with the remainder assigned in display order. Columns leave the active distribution set when they reach `maxSize`, and the remaining space is redistributed over columns that can still grow. When the container is too small, every grow column falls back to its basis and the table overflows into horizontal scroll — grow columns are never crushed below their basis. **Give each table's main text column no `size` (and a `minSize` matching its content) and width adaptivity falls out.**
- With **no grow columns at all**, surplus distributes proportionally over every column — an all-`size` table still fills its viewport while any column can grow, keeping the declared ratios. A finite `maxSize` is a hard cap: if every column reaches one, the table stops short of the viewport instead of falsifying the declared maximum. The injected columns (selection, expander, drag handle) are fixed at the width the table's `size` gives them (40px at `sm`, [styling.md](styling.md#size)); an override that sets bounds of its own wins, bound by bound ([selection.md](selection.md#overriding-the-injected-column)).

The engine re-resolves on container resize (ResizeObserver on the body viewport, measured before first paint) and on any sizing/visibility/order/pinning change. A zero-basis grow set shares surplus equally, so valid `minSize: 0` definitions never produce undefined geometry. The injected columns stay fixed at the size's width unless an override sets bounds of its own.

### Autosize

`meta.autosize: true` fits a column to its rendered content and keeps it fitted as the content changes — the declarative form of the resizer's double-click, with the same measurement behind both:

```tsx
helper.accessor("status", {
  header: "Status",
  cell: info => <Badge>{info.getValue()}</Badge>,
  meta: { autosize: true }
});
```

**What a fit holds.** The header (its label, the sort mark, and room for the filter button's hover overlay), every rendered body cell and the footer cell, each measured at its content's own width out of the table's layout, plus 8px of slack. Cells that span columns and cells holding an editor are not measured — they say nothing about the column's own content. A column that does not truncate fits its widest cell: with nothing to say what was cut, a clipped badge or figure is information lost. A [`truncate`](columns.md#the-meta-extension) column fits its **typical** content instead — its body cells within Tukey's upper fence (Q3 + 1.5 × IQR, MUI X's `outliersFactor` default), the outliers left to the ellipsis and its tooltip — while its header and footer are still held whole: one cell each, never a crowd to find outliers in.

**Where a fit ranks.** The fit is the column's width: it ranks below a user's resize — a resized column is left at the user's width and not measured — and above `size`, which holds the place until the first fit (and stays the width where nothing can be measured, as in jsdom). `minSize`/`maxSize` bound it like any explicit width; a `maxSize` is how a column of long text says how far it may go. Being explicit, a fitted column does not take a share of the container's surplus while the table has grow columns; with none, the fill rule above spreads the surplus over every column, fitted ones included, in proportion to their fits. When the fits add up to more than the container, the table scrolls horizontally rather than clip.

**When a fit is taken:**

| Change | Fit |
| --- | --- |
| New rows — the row ids or their order changed: a page, a filter, a sort, new data | Refit, in both directions |
| The same rows again — a refetch, a poll, an edit | Widen only, so a value alternating between short and long does not shake the columns |
| New column definitions (a renderer, a translated header) or another set of visible or fitted columns, another `size`, a web font finished loading | Refit |
| A row or column window scrolled into view (virtualization) | Widen only, once the scroll has rested for 150ms |
| The table has no layout yet (a hidden tab, a collapsed panel) | Waits, and fits when the table is first laid out |

Fits are taken before the browser paints, all fitted columns in a single reflow, so a refit never shows the old widths for a frame. Under virtualization only rendered content is measured, as for the double-click; the widen-on-settle rule is what keeps content that arrives later from being clipped, without moving columns under the reader mid-scroll.

`meta.autosize` is per column. TanStack's `defaultColumn` merges definitions shallowly, so a `defaultColumn.meta` is replaced by any column's own `meta` and cannot serve as a table-wide default.

### Resizing interplay

Dragging a resize handle writes a `columnSizing` entry — from then on that column is explicit. Drags are exactly 1:1 because they start from the engine-resolved rendered width (a grow column's first drag never jumps), and everything the drag decides with — that width, the column's `minSize`/`maxSize`, and the entry Escape puts back — is the render that drew the handle's, not a later one's ([architecture.md](architecture.md#load-bearing-internals)). Double-clicking the handle fits the column to its **rendered content** once, measured exactly as [Autosize](#autosize) describes: the header cell, every body cell currently rendered (under virtualization, the current window — unrendered rows have no boxes to measure) and the footer cell, each at its content's own width out of the table's layout, so the fit narrows a column as readily as it widens one. The fit is written as the column's `columnSizing` entry, and so is explicit — the columns panel's width reset returns the column to its definition: fitted again under `meta.autosize`, else its `size`, else growing. See [columns.md](columns.md#resizing).

The interaction is ledger's own pointer session end to end, so TanStack's `columnResizingFeature` is **not registered** on the feature set ([state.md](state.md#the-feature-set-and-fn-registries)). Consequences, by design: the `columnResizing` state slice, `column.getIsResizing()`, `header.getResizeHandler()`, and the `columnResizeMode` / `columnResizeDirection` options simply do not exist on the instance — feature-gated APIs cannot misreport a pipeline that never runs. `enableColumnResizing` (default `false`) is therefore a ledger-owned switch carried on `meta.ledger`, and the per-column `enableResizing` knob keeps TanStack's name on ledger's `ColumnDef` type. Commit timing is fixed to live updates (v8's `columnResizeMode: "onChange"` behavior) and drag direction follows the handle's computed CSS `direction`, so RTL resolves without an option.

### The panel's width control

With `enableColumnResizing` on, each row of the [columns panel](columns.md#the-columns-panel) also carries a width field — the same `columnSizing` entry, reached numerically instead of by drag, clamped to the column's `minSize`/`maxSize` exactly as the handle is.

The field holds the **override**, and empty means there is none: clearing it *drops* the entry rather than zeroing it, returning the column to whatever its definition prescribes. The placeholder says which that is — `labels.columnWidthFit` (`Fit`) for a column under `meta.autosize`, else the author's `size`, else `labels.columnWidthAuto` (`Auto`) for a column that declares none and therefore grows. So a `size: 130` column reads `130` when unset, never a made-up "auto". The field keeps `NumberInput`'s stepper buttons at a step of 10 (typing stays free-form), and stepping an empty field starts from that same declared width (`startValue`), so the first click materializes the current default as the override rather than jumping to `minSize`.

### `tableMinWidth`

`tableMinWidth` (same semantic as Mantine `Table.ScrollContainer`'s `minWidth`) sets a floor on the distribution width, so narrow containers produce a horizontal scrollbar at that point rather than compressing grow columns toward their bases:

```tsx
<DataTable tableMinWidth={720} … />
```

Per-column `minSize` usually expresses this better; keep `tableMinWidth` for table-level floors.

## Virtualization follows the viewport

Virtualization has **no fixed-height prerequisite**: TanStack Virtual observes the scroll element with ResizeObserver, so flex reflow, drawer toggling, and window resizing re-window automatically. If `virtualizedRows` is set while the viewport is effectively unconstrained (viewport height ≈ content height), virtualization is inert — a dev-mode warning explains that the fix is a definite height on the table or an ancestor. See [virtualization.md](virtualization.md).

## Recipes

Inside a Modal or Drawer, constrain the table rather than the modal body:

```tsx
<Modal opened={opened} onClose={close} size="xl">
  <DataTable h="min(60vh, 40rem)" … />
</Modal>
```

Two tables sharing one column:

```tsx
<Stack h="100%">
  <DataTable flex={2} mih={0} … />
  <DataTable flex={1} mih={0} … />
</Stack>
```
