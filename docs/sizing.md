# Sizing

**Contract: the table fills whatever space its parent gives it; when the parent cannot give a definite size it degrades to content height; overflow only ever appears on the table's own scroller.**

There is no "fixed-height mode" versus "flow mode" — the internal structure is constant, and whether the scroller actually scrolls is purely a CSS outcome. This page is the authoritative description of that contract; the design rationale is recorded in [DESIGN.md](DESIGN.md).

## The root box

`.ledger-root` is a flex column that pre-defuses the flex/grid `min-size: auto` shrink trap and keeps all overflow internal. The header and the body render as **separate regions**: the header sits outside the vertical scroller, so the scrollbar belongs to the rows alone — it is never occluded by the header and never spans it.

```css
.ledger-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;      /* definite parent → fills exactly; indefinite parent → resolves to auto, grows with content */
  min-width: 0;
  min-height: 0;
  overflow: hidden;  /* overflow belongs to the internal scroller only */
}
.ledger-main           { flex: 1 1 auto; min-width: 0; min-height: 0; }  /* header + body frame (flex column) */
.ledger-header         { flex: none; overflow: hidden; }                 /* header viewport; mirrors body scrollLeft */
.ledger-scroller       { flex: 1 1 auto; min-height: 0; }                /* the ONLY elastic region; scrolls x and y */
.ledger-pagination-bar { flex: none; }                                   /* chrome rows are rigid */
```

The scroller is a Mantine `ScrollArea` (`scrollbars="xy"`, hover type) holding the body table; everything elastic happens inside it. Horizontal scrolling moves header and body together — the header viewport's `scrollLeft` mirrors the body's within the same frame, and a horizontal wheel over the header forwards to the body. Empty and loading states center inside the scroller region (the default empty block reserves `min-height: 12rem`).

## The four scenarios

| Scenario | Consumer CSS | Result |
| --- | --- | --- |
| Definite-height parent (app shell, `Modal`/`Drawer` body) | none | Fills it; internal scroll; fixed header |
| Flex item taking the remaining space (the common case) | `flex={1} mih={0}` | Stretches with siblings; internal scroll |
| Indefinite (content-driven) parent | none | Grows with rows; no internal vertical scroll; the page scrolls |
| Explicit constraint | Mantine style props: `h={480}`, `mah="60vh"` | A constraint, not a mode |

There are **no** `height` / `maxHeight` props. The root extends Mantine `BoxProps`, so `h` / `mah` / `mih` / `w` / `miw` / `flex` are already the sizing vocabulary — a deliberate consequence of the naming rules (Mantine owns presentation vocabulary).

### The header is always fixed

The header renders **outside** the body scroller — there is no prop, and no sticky positioning is involved: vertical scrolling simply cannot move it, it never bounces with macOS overscroll, and the scrollbar starts below it. In the degraded page-flow case the internal viewport does not scroll, so the whole table (header included) travels with the page; that is consistent with "scrollbars belong to the table": give the table (or an ancestor) a definite height and the header stays put.

## Column widths

Widths are resolved by ledger's **width engine**: every visible leaf column becomes an exact integer pixel width, the table's own `width` is their exact sum, and the same numbers drive the `<colgroup>`s of every region and the pinned sticky offsets — one number system, with nothing left for the browser to redistribute. (Header, body, and footer are separate `<table>`s under `table-layout: fixed`; engine-resolved widths are what keep them pixel-equal.)

Resolution rules, in order:

- A column with an **explicit width** — a user resize, else its `size`, else `defaultColumn.size` — is fixed at that width, clamped to its declared `minSize`/`maxSize`.
- A column **without one is a grow column** with basis `minSize ?? 80`. Container surplus distributes **proportionally to the bases** (a `minSize: 200` text column grows over twice as fast as a `minSize: 80` tag column), floored to integer pixels with the remainder assigned in display order. Columns leave the active distribution set when they reach `maxSize`, and the remaining space is redistributed over columns that can still grow. When the container is too small, every grow column falls back to its basis and the table overflows into horizontal scroll — grow columns are never crushed below their basis. **Give each table's main text column no `size` (and a `minSize` matching its content) and width adaptivity falls out.**
- With **no grow columns at all**, surplus distributes proportionally over every column — an all-`size` table still fills its viewport while any column can grow, keeping the declared ratios. A finite `maxSize` is a hard cap: if every column reaches one, the table stops short of the viewport instead of falsifying the declared maximum. This also keeps the injected selection and expander columns fixed at 40px / 36px.

The engine re-resolves on container resize (ResizeObserver on the body viewport, measured before first paint) and on any sizing/visibility/order/pinning change. A zero-basis grow set shares surplus equally, so valid `minSize: 0` definitions never produce undefined geometry. The injected selection/expander columns are always fixed (40px / 36px).

### Resizing interplay

Dragging a resize handle writes a `columnSizing` entry — from then on that column is explicit. Drags are exactly 1:1 because they start from the engine-resolved rendered width (a grow column's first drag never jumps), and everything the drag decides with — that width, the column's `minSize`/`maxSize`, and the entry Escape puts back — is the render that drew the handle's, not a later one's ([architecture.md](architecture.md#load-bearing-internals)). Double-clicking the handle autosizes the column to its **rendered content**: the header cell, every body cell currently rendered (under virtualization, the current window — unrendered rows have no boxes to measure), and the footer cell, which is content the column has to hold like any other; a footer that spans columns is skipped, since it says nothing about any one of them. That is also an explicit entry — the columns panel's width reset returns it to grow behavior. See [columns.md](columns.md#resizing).

The interaction is ledger's own pointer session end to end, so TanStack's `columnResizingFeature` is **not registered** on the feature set ([state.md](state.md#the-feature-set-and-fn-registries)). Consequences, by design: the `columnResizing` state slice, `column.getIsResizing()`, `header.getResizeHandler()`, and the `columnResizeMode` / `columnResizeDirection` options simply do not exist on the instance — feature-gated APIs cannot misreport a pipeline that never runs. `enableColumnResizing` (default `false`) is therefore a ledger-owned switch carried on `meta.ledger`, and the per-column `enableResizing` knob keeps TanStack's name on ledger's `ColumnDef` type. Commit timing is fixed to live updates (v8's `columnResizeMode: "onChange"` behavior) and drag direction follows the handle's computed CSS `direction`, so RTL resolves without an option.

### The panel's width control

With `enableColumnResizing` on, each row of the [columns panel](columns.md#the-columns-panel) also carries a width field — the same `columnSizing` entry, reached numerically instead of by drag, clamped to the column's `minSize`/`maxSize` exactly as the handle is.

The field holds the **override**, and empty means there is none: clearing it *drops* the entry rather than zeroing it, returning the column to whatever its definition prescribes. The placeholder says which that is — the author's `size`, or `labels.columnWidthAuto` (`Auto`) for a column that declares none and therefore grows. So a `size: 130` column reads `130` when unset, never a made-up "auto". The field keeps `NumberInput`'s stepper buttons at a step of 10 (typing stays free-form), and stepping an empty field starts from that same declared width (`startValue`), so the first click materializes the current default as the override rather than jumping to `minSize`.

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
