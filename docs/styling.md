# Styling and theming

The presentation layer is Mantine's, end to end: forwarded `Table` style props for the common knobs, the full Styles API for surgical control, CSS variables for the pipeline values, and data-attributes for every state. All library rules live in the `ledger` cascade layer and consume only Mantine CSS variables — dark mode and RTL follow the host theme with zero rules of ledger's own.

## Forwarded Mantine props

Eleven `Table` appearance props forward with Mantine's names and semantics:

`striped` (`boolean | "odd" | "even"`), `stripedColor`, `highlightOnHover`, `highlightOnHoverColor`, `withTableBorder`, `withColumnBorders`, `withRowBorders` (default `true`), `borderColor`, `verticalSpacing` / `horizontalSpacing` (default: the [size](#size)'s), `tabularNums`.

One more comes from `Paper`: **`radius`** (`MantineRadius`) rounds the table box — the root and the header + body + footer frame, which clips its content to the curve — and the `withTableBorder` frame follows it, so a framed table can be its own card instead of sitting inside one. The closing line under the last row is ledger's own switch, `withBottomBorder` — see [Borders](#borders).

## Size

`size` (`MantineSize`, default `"sm"`) sets the table's density as one word, the way `size` sizes an input: the type, the cell padding, a row's natural height and the size of every control drawn in a cell — the selection checkbox, the expander and the drag handle, the filter button, the inline editors, the pagination bar's controls — move together. Rows land on Mantine's input heights, so a row reads level with an input of the same size beside it; `sm` is Mantine's own `Table` (7px over 14px type). Controls in a cell take the size one step down from `sm` up, as Mantine's composites do (a `MultiSelect`'s pills under its input), and the editing contexts carry that control size as `size` ([editing.md](editing.md#editors)).

| `size` | Type | Padding (block / inline) | Row | Controls | Injected column |
| --- | --- | --- | --- | --- | --- |
| `xs` | `--mantine-font-size-xs` | 5px / 8px | 30px | `xs` | 36px |
| `sm` | `--mantine-font-size-sm` | 7px / 10px | 36px | `xs` | 40px |
| `md` | `--mantine-font-size-md` | 8px / 12px | 42px | `sm` | 48px |
| `lg` | `--mantine-font-size-lg` | 10px / 16px | 50px | `md` | 62px |
| `xl` | `--mantine-font-size-xl` | 14px / 20px | 60px | `lg` | 76px |

`verticalSpacing` / `horizontalSpacing` override the size's padding when set (a Mantine spacing key or a number of px), and `fz` on the root overrides its type. The type rides `--ledger-font-size` on the root (a `vars`-reachable variable), the row height is the virtualizer's default estimate ([virtualization.md](virtualization.md)), and the injected columns' width follows the size unless an override sets bounds of its own ([sizing.md](sizing.md)). An application sets its default through the theme: `theme.components.DataTable` with `defaultProps: { size: "xs" }`.

All the border and background props are rendered by ledger itself rather than Mantine:

- Stripes and hover flow through the row-background pipeline (below) instead of `:nth-of-type` rules — virtualization spacer rows would break parity, and pinned cells must cover the tint.
- `withTableBorder` draws its frame on the `main` region so it wraps the (separately rendered) header, body, and footer as one box and stays at the viewport edge under horizontal scroll — four real borders, so `radius` draws continuous corners (see [Borders](#borders)).
- `withRowBorders` / `withColumnBorders` become root data-attributes and paint at **cell level** in ledger's layer: the tables are `border-collapse: separate` (inline — the host's unlayered `collapse` would win otherwise), because Chrome does not repaint collapsed borders at stuck sticky positions — cell-level borders travel with pinned rows and columns.

### Borders

Three edges, one line each — and a ledger-owned switch for the middle one, shaped like its Mantine family:

- **Row separators** (`withRowBorders`, default `true`) sit *between* rows: the header's bottom edge and every body row except the last — Mantine's `Table` rule, so a table inside a bordered container closes with the container's edge instead of doubling it. The last row carries `data-last`; a `spanRows` run that reaches it marks its anchor cell `data-last` too.
- **The closing line** (`withBottomBorder`, default `false`) is for a table that stands alone: an inset 1px seam on the scroller's last pixel (it adds no height and stays put under scroll) and, with a footer, the footer's trailing edge as well.
- **The frame** (`withTableBorder`) is four real borders around `main`, so `radius` draws continuous corners; it owns every edge, and under it the closing seam and the footer's trailing line stay off whatever `withBottomBorder` says.

A footer always separates from the body with the same seam above it while row borders are on (`data-with-footer` on the root). The pagination bar draws its own top line only when no other edge exists — no frame and no closing line.

## The Styles API

`DataTable` is a Mantine factory component: `classNames`, `styles`, `vars`, `unstyled`, and `DataTable.extend()` all work, generically typed by `DataTableFactory`. Selectors map 1:1 to kebab-case classes under the `ledger-` prefix:

| Selector | Class | Element |
| --- | --- | --- |
| `root` | `.ledger-root` | The outer flex column |
| `main` | `.ledger-main` | The header + body frame (ARIA table; carries the `withTableBorder` border) |
| `header` | `.ledger-header` | The header viewport — mirrors the body's horizontal scroll |
| `scroller` | `.ledger-scroller` | The body ScrollArea — the only elastic region |
| `footer` | `.ledger-footer` | The totals viewport below the scroller — mirrors the body's horizontal scroll |
| `table` | `.ledger-table` | Every `<table>` element (header, body, and footer tables) |
| `thead` / `tbody` / `tfoot` | `.ledger-thead` … | Table sections |
| `headerRow` / `headerCell` | `.ledger-header-row` / `.ledger-header-cell` | Header rows and `<th>`s |
| `headerLabel` | `.ledger-header-label` | The (sortable) label button |
| `headerActions` | `.ledger-header-actions` | The hover-revealed action cluster |
| `sortIndicator` | `.ledger-sort-indicator` | Chevron + multi-sort badge |
| `resizer` | `.ledger-resizer` | The resize handle |
| `filterPopover` | `.ledger-filter-popover` | The filter dropdown surface |
| `row` / `cell` | `.ledger-row` / `.ledger-cell` | Data rows and `<td>`s |
| `selectionCell` / `expanderCell` | `.ledger-selection-cell` / `.ledger-expander-cell` | Injected column cells |
| `detailPanel` | `.ledger-detail-panel` | Master–detail panel cell |
| `cellEditor` | `.ledger-cell-editor` | Inline editor host |
| `instantCell` / `instantSpinner` | `.ledger-instant-cell` / `.ledger-instant-spinner` | Instant-column host, and its out-of-flow pending loader |
| `rowDragCell` / `rowDragOverlay` | `.ledger-row-drag-cell` / `.ledger-row-drag-overlay` | Row-ordering handle cell, and the pointer ghost (a snapshot of the whole lifted row) |
| `footerRow` / `footerCell` | `.ledger-footer-row` / `.ledger-footer-cell` | Totals row |
| `empty` | `.ledger-empty` | Empty-state block |
| `loaderRow` / `loaderRowContent` | `.ledger-loader-row` / `.ledger-loader-row-content` | Infinite-loading trailing row, and the centred flex line inside its cell |
| `paginationBar` | `.ledger-pagination-bar` | The built-in bar (and the standalone compound) |

```tsx
<DataTable
  classNames={{ headerCell: "my-header" }}
  styles={{ empty: { minHeight: "8rem" } }}
  …
/>
```

## DOM props

Every channel of the Styles API — `classNames`, `styles` (object or function of the theme and props), `vars`, `attributes`, `unstyled`, and a `theme.components.DataTable` override — reaches the rows as soon as what it resolves to changes, memoized rows included. The `props` a callback receives are the component's, all of them: `<DataTable>` routes the behavior half to `useDataTable` and keeps it off the DOM, but a callback still sees `enableActiveRow`, `striped`, `data` and the rest, exactly as its type says. Passing a fresh object that resolves to the same thing, which is what writing one inline does on every render, changes nothing and re-renders nothing ([architecture.md](architecture.md#load-bearing-internals) has the mechanism).

The Styles API dresses a **slot**: `attributes` reaches every element of that slot with one resolved answer, so it cannot vary from row to row, and it is resolved from the component's props rather than from the element's own subject. That is what the DOM prop hooks are for — one per rendered element, each taking a static object or a function of the element's subject, and each merged over the Styles API's answer under the rules below:

| Prop | Element | Subject |
| --- | --- | --- |
| `rowProps` | every data `<tr>` | `Row<TData>` |
| `headerRowProps` / `footerRowProps` | every header / footer `<tr>` | `HeaderGroup<TData>` |
| `viewportProps` | the internal scroll viewport | — (static only; host vocabulary: `ScrollArea.viewportProps`) |
| `meta.cellProps` | that column's `<td>`s | `Cell<TData, TValue>` |
| `meta.headerCellProps` / `meta.footerCellProps` | that column's header / footer cell | `Header<TData, TValue>` |

```tsx
<DataTable
  rowProps={row => ({
    "data-overdue": row.original.overdue || undefined,
    "onMouseEnter": () => prefetch(row.original.id),
    "title": row.original.note
  })}
  viewportProps={{ onScroll: event => syncMinimap(event.currentTarget.scrollTop) }}
  columns={[
    { accessorKey: "amount", meta: { cellProps: cell => ({ style: { color: cell.getValue<number>() < 0 ? "red" : undefined } }) } }
  ]}
  …
/>
```

The types are Mantine's own (`TableTrProps`, `TableTdProps`, `TableThProps`), so Mantine style props (`bg`, `p`, `c`) work alongside plain DOM attributes. Four composition rules:

- **ledger's structural props win** — `role`, the `data-*` state contract below, and the ARIA indices. They are the contract the stylesheet and the accessibility tree are written against.
- **…but only where ledger sets one.** Where ledger has no opinion (a cell's `onClick` when the edit trigger is `double-click`, say) your value stands.
- **`className` and `style` compose**, yours last — an equal-specificity rule of yours wins. That includes ledger's own inline values: you *can* override a pinned cell's sticky offset, and the result is yours to own. An escape hatch that silently dropped your declaration would not be one.
- **Handlers chain**, ledger's first: its stop-propagation covenant and active-row bookkeeping run before your handler sees the event.

`ref` is excluded from all of them: these are prop hooks resolved per render — per virtual item, for rows — not component instances, and ledger owns the row ref for virtualization measurement. Synthetic rows (detail panels, loader and skeleton rows) have no subject and never receive `rowProps`.

## State is data-attributes, never state classes

Style states by attribute selector (the Mantine convention). The inventory:

| Element | Attributes |
| --- | --- |
| root | `data-size="xs" \| "sm" \| "md" \| "lg" \| "xl"`, `data-striped="odd" \| "even"`, `data-highlight-on-hover`, `data-loading`, `data-empty`, `data-virtualized-rows`, `data-virtualized-columns`, `data-with-table-border`, `data-with-row-borders`, `data-with-column-borders`, `data-with-bottom-border`, `data-with-footer`, `data-scrolled-start`, `data-scrolled-end` |
| header cell | `data-align`, `data-sortable`, `data-sorted` (on the indicator), `data-pinned="start" \| "end"`, `data-pinned-edge`, `data-resizing`, `data-dragging`, `data-drop-side="before" \| "after"` |
| row | `data-selected`, `data-expanded`, `data-clickable`, `data-parity="odd" \| "even"`, `data-pinned-row="top" \| "bottom"`, `data-row-id`, `data-detail-row`, `data-last` (the body's final row), `data-dragging` (a reorder lifted it), `data-drop-side="before" \| "after"` (the reorder drop edge) |
| cell | `data-align`, `data-editable`, `data-editing`, `data-last` (a `spanRows` anchor ending on the last row), `data-leading` (its column is first in display order — DOM order cannot say so once `spanRows` drops covered cells), `data-pinned`, `data-pinned-edge`, `data-truncate` (inner span), `data-group-cell` / `data-group-count` (grouped) |
| editor | `data-pending` |

```css
.my-app .ledger-row[data-selected] .ledger-cell { font-weight: 600; }
```

## CSS custom properties

| Variable | Written by | Purpose |
| --- | --- | --- |
| `--ledger-row-bg` | stripe / hover / selected rules | The single row-background pipeline, painted on the row's **cells** (a row-level paint would lose to the host's unlayered `tr` background); pinned cells read `--ledger-pinned-bg`, which follows it — a pinned column that fails to cover stripes or hover is unrepresentable |
| `--ledger-striped-color`, `--ledger-hover-color` | `stripedColor` / `highlightOnHoverColor` props (or your `vars`) | Tint overrides; default to `--mantine-color-default-hover` |
| `--ledger-header-bg` | you, in CSS (see below) | Header cell background; defaults to `--mantine-color-body`. Opaque by contract, not by decoration — a pinned header cell has to occlude the cells scrolling under it |
| `--ledger-border-color` | `borderColor` prop (or your `vars`) | Every ledger-painted line: the `withTableBorder` frame, row/column borders, and the seam overlays; defaults to `--mantine-color-default-border` |
| `--ledger-radius` | `radius` prop (or your `vars`) | The table box's corner radius, on the root and on the `main` frame (which clips to it); defaults to `0` |
| `--ledger-font-size` | `size` prop (or your `vars`) | The table's type, set on the root so every table under it inherits it ([Size](#size)) |
| `--ledger-color-dimmed` | the root, the pagination bar, and the columns panel (override it there) | Secondary text: the state panels' titles, the pagination words, group counts, the loading-more row, the columns panel's captions. Mantine's `--mantine-color-dimmed` pulled halfway toward `--mantine-color-text`, because `dimmed` alone is below WCAG AA's 4.5:1 for text (3.3:1 on a light body, 4.0:1 on a dark one); the half mix clears it in both schemes on the body, on stripes, and on selected rows, and follows a theme that retunes either color |
| `--ledger-col-width-<id>`, `--ledger-col-start-<id>`, `--ledger-col-after-<id>` | column geometry | Width and pinned offsets per column; disjoint prefixes prevent one family from shadowing another, and resizing never re-renders rows |

The column-variable `<id>` suffix is a collision-free CSS-safe encoding, not necessarily the raw
column id: ASCII letters, digits, and hyphens stay readable, while punctuation and Unicode code
points are escaped.

The `vars` resolver accepts the five variables a prop also writes — `--ledger-striped-color`,
`--ledger-hover-color`, `--ledger-border-color`, `--ledger-radius`, `--ledger-font-size`:

```tsx
<DataTable vars={() => ({ root: { "--ledger-striped-color": "var(--mantine-color-blue-0)" } })} … />
```

Row-background precedence (last wins within the layer): stripe → hover → selected → active.

### Tinting the header

The header ships untinted, following Mantine's own `<thead>`. `--ledger-header-bg` is the one
consumer-writable variable with no prop behind it, so it is not in the `vars` union — set it in
CSS. Give it a **pair** of values rather than one: Mantine's only scheme-aware "one step off the
body" token is `--mantine-color-default-hover`, which is already what stripes and hover resolve
to, so reusing it would make the header match its own odd rows. Use the pair Mantine itself uses
to fill a `<th>` (`Table variant="vertical"`):

```css
.app-table { --ledger-header-bg: var(--mantine-color-gray-0); }

[data-mantine-color-scheme="dark"] .app-table { --ledger-header-bg: var(--mantine-color-dark-6); }
```

A single fixed value is the trap here — `--ledger-header-bg: #f8f9fa` reads as a blown-out white
band in dark mode.

## Icons

Every glyph the chrome renders — sort and filter indicators, the expander chevron, the pin
segments, the empty/error states — comes from one registry, `DataTableIcons`, one slot per
affordance ([api.md](api.md#icons) lists them all). The defaults are Lucide glyphs with their
path data vendored into the package, so replacing none costs no dependency; `icons` replaces any
subset:

```tsx
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";

<DataTable
  icons={{ sortAsc: ArrowUpNarrowWide, sortDesc: ArrowDownWideNarrow }}
  {...rest}
/>;
```

A slot is any component accepting `DataTableIconProps` — `size` (12–16 in the controls, 40 in
the empty/error indicators) and `strokeWidth` — which `lucide-react` components satisfy as-is;
so does any icon set or hand-rolled `<svg>` that follows `currentColor`. Slot names mirror the
`DataTableLabels` key of the same affordance where one exists (`pinStart`, `retry`,
`clearSelection`, …), so the two registries read as one vocabulary.

The compound components rendered outside the table's tree take their own `icons` prop, exactly
like `labels`: `DataTable.Search` (`search`), `DataTable.ColumnsPanel` (the panel slots),
`DataTable.SelectionBar` (`clearSelection`). App-wide replacement goes through theme
`defaultProps` — the next section's mechanism.

One behavioral contract: the `expandRow` chevron is rotated open by the stylesheet (a `rotate`
on the button's `svg`), so a replacement should point right at rest.

## Theme-level defaults

```tsx
const theme = createTheme({
  components: {
    DataTable: DataTable.extend({
      defaultProps: { highlightOnHover: true, verticalSpacing: "sm", labels: zhCN },
      classNames: { root: "app-table" }
    })
  }
});
```

The compound components register their own theme keys the same way: `DataTableSearch`, `DataTableColumnsPanel`, `DataTablePagination`, `DataTableSelectionBar`.

Those rendered outside the table's tree sit outside its Styles API and carry static classes instead, styleable directly: `.ledger-pagination-bar`, `.ledger-selection-bar`, and the columns panel's `.ledger-columns-panel` — with `-header`, `-list`, `-zone`, `-zone-label`, `-item`, `-handle`, `-label`, `-indicators` (the dimmed rest-state marks), `-controls` (the toolbar revealed on the hovered/focused row), and `-width-input` (the width field on a resizable row); the row being dragged carries `data-dragging`, a hidden column's row `data-hidden`.

## Layering, dark mode, RTL, motion

- Everything ships inside `@layer ledger`; cross-library layer order is the application's call (declare `@layer mantine, ledger;` first if you need to arbitrate).
- Colors and metrics are Mantine variables only → dark mode is automatic.
- Offsets and gradients use logical properties with explicit `[dir="rtl"]` mirrors for the pinned-edge shadows → RTL is automatic.
- Chevron rotations and columns-panel reveals respect `prefers-reduced-motion: reduce`; on devices
  without hover, columns-panel controls stay inline and clickable instead of relying on a reveal.

The kebab-case class contract is enforced mechanically by `@coldsmirk/stylelint-config` in CI — it does not rely on discipline.
