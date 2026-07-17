# Pinning

Column pinning sticks columns to the horizontal edges; row pinning sticks rows to the vertical edges. Both are sticky-positioned within the table's own scroll regions — the layout contract of [sizing.md](sizing.md) is unaffected.

## Column pinning

`enableColumnPinning` is **on by default**: every column's menu offers "Pin to left / Pin to right / Unpin" (per-column opt-out via `enablePinning: false` on the def). State rides the `columnPinning` trio (TanStack `ColumnPinningState`, `{ left: string[], right: string[] }`):

```tsx
<DataTable
  defaultColumnPinning={{ left: ["name"], right: ["actions"] }}
  …
/>
```

Mechanics worth knowing:

- Pinned cells are `position: sticky` with offsets summed from the **engine-resolved widths** ([sizing.md](sizing.md#column-widths)) and written as CSS variables — the offsets are exact for grow columns too, and resizing shifts every pinned offset **without re-rendering rows**. Header and footer cells pin the same way inside their own viewports, so all regions stick in unison.
- The boundary cell of each pinned block renders an **edge shadow** (`data-pinned-edge`), visible only while content is actually scrolled past that edge (`data-scrolled-start` / `data-scrolled-end` on the root) — so an unscrolled table shows no phantom shadows.
- Every offset uses logical properties (`inset-inline-*`), so RTL mirrors for free.
- Pinned cells read their background from the `--ledger-row-bg` pipeline: stripes, hover, and selected tints are always covered correctly ([styling.md](styling.md)).
- The injected selection/expander columns are always pinned left, ahead of user pins, merged invisibly over the consumer's slice — they never appear in your `columnPinning` state.
- `columnPinning` belongs to the default `persistState` layout set ([state.md](state.md)).

## Row pinning

`enableRowPinning` (default `false`) renders TanStack's pinned rows sticky: top rows stick under the header, bottom rows above the lower edge.

```tsx
<DataTable
  enableRowPinning
  defaultRowPinning={{ top: ["summary-row"], bottom: [] }}
  …
/>
```

- State rides the `rowPinning` trio (TanStack `RowPinningState`, `{ top: string[], bottom: string[] }`). ledger provides the **state and the sticky rendering**; the trigger affordance is the page's call — typically an actions column calling `row.pin("top")` / `row.pin(false)`, since a universal per-row pin button would be noise.
- Offsets are **measured, not assumed**: the header lives outside the body scroller ([sizing.md](sizing.md)), so the first top-pinned row sticks at the scroller's own top edge and each following one offsets by the measured heights of the pinned rows above it (ResizeObserver-tracked); bottom rows mirror upward. Multiple pinned rows therefore stack instead of piling onto one edge, and row-height changes re-measure automatically.
- Pinned rows render outside the virtual window — always mounted, even with `virtualized` on; only center rows virtualize.
- Pinned rows are excluded from stripe parity and carry `data-pinned-row="top" | "bottom"` plus an opaque background so scrolling content passes beneath them.
- Pinned rows never render twice — the body draws the top set, the center (unpinned) rows, then the bottom set. TanStack's `keepPinnedRows` default (`true`) keeps a pinned row visible even when filtering or pagination would exclude it; pass `tableOptions={{ keepPinnedRows: false }}` to hide it with the rest ([state.md](state.md)).
