# Styling and theming

The presentation layer is Mantine's, end to end: forwarded `Table` style props for the common knobs, the full Styles API for surgical control, CSS variables for the pipeline values, and data-attributes for every state. All library rules live in the `ledger` cascade layer and consume only Mantine CSS variables — dark mode and RTL follow the host theme with zero rules of ledger's own.

## Forwarded Mantine `Table` props

Eleven appearance props forward with Mantine's names and semantics:

`striped` (`boolean | "odd" | "even"`), `stripedColor`, `highlightOnHover`, `highlightOnHoverColor`, `withTableBorder`, `withColumnBorders`, `withRowBorders` (default `true`), `borderColor`, `verticalSpacing` / `horizontalSpacing` (default `"xs"`), `tabularNums`.

All the border and background props are rendered by ledger itself rather than Mantine:

- Stripes and hover flow through the row-background pipeline (below) instead of `:nth-of-type` rules — virtualization spacer rows would break parity, and pinned cells must cover the tint.
- `withTableBorder` draws its frame on the `main` region so it wraps the (separately rendered) header, body, and footer as one box and stays at the viewport edge under horizontal scroll. Three sides are real borders; the **bottom edge is a 1px inset overlay** (see seam ownership below).
- `withRowBorders` / `withColumnBorders` become root data-attributes and paint at **cell level** in ledger's layer: the tables are `border-collapse: separate` (inline — the host's unlayered `collapse` would win otherwise), because Chrome does not repaint collapsed borders at stuck sticky positions — cell-level borders travel with pinned rows and columns.
- **Seam ownership**: at scroll end the last row's border occupies the scroller's last pixel, so any line stacked outside it would read as one thick border. Every seam at or below the scroller's bottom edge therefore paints as an inset overlay that *coincides* with that pixel — the scroller's own `::after` (under `withRowBorders`), the frame's bottom overlay (under `withTableBorder`) — the footer separates with its trailing edge only, and the pagination bar draws its own top line only when no other edge exists (both border props off).

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

The Styles API dresses a slot; it cannot make a row carry an attribute, react to a hover, or vary per cell. That is what the DOM prop hooks are for — one per rendered element, each taking a static object or a function of the element's subject:

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
| root | `data-striped="odd" \| "even"`, `data-highlight-on-hover`, `data-loading`, `data-empty`, `data-virtualized`, `data-with-table-border`, `data-with-row-borders`, `data-with-column-borders`, `data-scrolled-start`, `data-scrolled-end` |
| header cell | `data-align`, `data-sortable`, `data-sorted` (on the indicator), `data-pinned="start" \| "end"`, `data-pinned-edge`, `data-resizing`, `data-dragging`, `data-drop-side="before" \| "after"` |
| row | `data-selected`, `data-expanded`, `data-clickable`, `data-parity="odd" \| "even"`, `data-pinned-row="top" \| "bottom"`, `data-row-id`, `data-detail-row` |
| cell | `data-align`, `data-editable`, `data-editing`, `data-leading` (its column is first in display order — DOM order cannot say so once `spanRows` drops covered cells), `data-pinned`, `data-pinned-edge`, `data-truncate` (inner span), `data-group-cell` / `data-group-count` (grouped) |
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
| `--ledger-col-width-<id>`, `--ledger-col-start-<id>`, `--ledger-col-after-<id>` | column geometry | Width and pinned offsets per column; disjoint prefixes prevent one family from shadowing another, and resizing never re-renders rows |

The column-variable `<id>` suffix is a collision-free CSS-safe encoding, not necessarily the raw
column id: ASCII letters, digits, and hyphens stay readable, while punctuation and Unicode code
points are escaped.

The `vars` resolver accepts the three variables a prop also writes — `--ledger-striped-color`,
`--ledger-hover-color`, `--ledger-border-color`:

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

Those rendered outside the table's tree sit outside its Styles API and carry static classes instead, styleable directly: `.ledger-pagination-bar`, `.ledger-selection-bar`, and the columns panel's `.ledger-columns-panel` — with `-header`, `-list`, `-zone`, `-zone-label`, `-item`, `-handle`, `-label`, `-indicators` (the dimmed rest-state marks), and `-controls` (the toolbar revealed on the hovered/focused row); the row being dragged carries `data-dragging`, a hidden column's row `data-hidden`.

## Layering, dark mode, RTL, motion

- Everything ships inside `@layer ledger`; cross-library layer order is the application's call (declare `@layer mantine, ledger;` first if you need to arbitrate).
- Colors and metrics are Mantine variables only → dark mode is automatic.
- Offsets and gradients use logical properties with explicit `[dir="rtl"]` mirrors for the pinned-edge shadows → RTL is automatic.
- Chevron rotations and columns-panel reveals respect `prefers-reduced-motion: reduce`; on devices
  without hover, columns-panel controls stay inline and clickable instead of relying on a reveal.

The kebab-case class contract is enforced mechanically by `@coldsmirk/stylelint-config` in CI — it does not rely on discipline.
