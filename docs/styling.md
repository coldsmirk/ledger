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
| `columnMenu` / `filterPopover` | `.ledger-column-menu` / `.ledger-filter-popover` | Dropdown surfaces |
| `row` / `cell` | `.ledger-row` / `.ledger-cell` | Data rows and `<td>`s |
| `selectionCell` / `expanderCell` | `.ledger-selection-cell` / `.ledger-expander-cell` | Injected column cells |
| `detailPanel` | `.ledger-detail-panel` | Master–detail panel cell |
| `cellEditor` | `.ledger-cell-editor` | Inline editor host |
| `footerRow` / `footerCell` | `.ledger-footer-row` / `.ledger-footer-cell` | Totals row |
| `empty` | `.ledger-empty` | Empty-state block |
| `loaderRow` | `.ledger-loader-row` | Infinite-loading trailing row |
| `paginationBar` | `.ledger-pagination-bar` | The built-in bar (and the standalone compound) |

```tsx
<DataTable
  classNames={{ headerCell: "my-header" }}
  styles={{ empty: { minHeight: "8rem" } }}
  …
/>
```

Per-column class hooks (`meta.headerClassName`, `meta.cellClassName`) and `rowClassName` compose with these — see [columns.md](columns.md) and [rows.md](rows.md).

## State is data-attributes, never state classes

Style states by attribute selector (the Mantine convention). The inventory:

| Element | Attributes |
| --- | --- |
| root | `data-striped="odd" \| "even"`, `data-highlight-on-hover`, `data-loading`, `data-virtualized`, `data-with-table-border`, `data-with-row-borders`, `data-with-column-borders`, `data-scrolled-start`, `data-scrolled-end` |
| header cell | `data-align`, `data-sortable`, `data-sorted` (on the indicator), `data-pinned="left" \| "right"`, `data-pinned-edge`, `data-resizing`, `data-dragging`, `data-drop-side="before" \| "after"` |
| row | `data-selected`, `data-expanded`, `data-clickable`, `data-parity="odd" \| "even"`, `data-pinned-row="top" \| "bottom"`, `data-row-id`, `data-detail-row` |
| cell | `data-align`, `data-editable`, `data-editing`, `data-pinned`, `data-pinned-edge`, `data-truncate` (inner span), `data-group-cell` / `data-group-count` (grouped) |
| editor | `data-pending` |

```css
.my-app .ledger-row[data-selected] .ledger-cell { font-weight: 600; }
```

## CSS custom properties

| Variable | Written by | Purpose |
| --- | --- | --- |
| `--ledger-row-bg` | stripe / hover / selected rules | The single row-background pipeline, painted on the row's **cells** (a row-level paint would lose to the host's unlayered `tr` background); pinned cells read `--ledger-pinned-bg`, which follows it — a pinned column that fails to cover stripes or hover is unrepresentable |
| `--ledger-striped-color`, `--ledger-hover-color` | `stripedColor` / `highlightOnHoverColor` props (or your `vars`) | Tint overrides; default to `--mantine-color-default-hover` |
| `--ledger-header-bg` | you (optional) | Header cell background; defaults to `--mantine-color-body` |
| `--ledger-border-color` | `borderColor` prop (or your `vars`) | Every ledger-painted line: the `withTableBorder` frame, row/column borders, and the seam overlays; defaults to `--mantine-color-default-border` |
| `--ledger-col-<id>`, `--ledger-col-start-<id>`, `--ledger-col-after-<id>` | column geometry | Width and pinned offsets per column; the reason resizing never re-renders rows |

The `vars` resolver accepts the two documented root variables:

```tsx
<DataTable vars={() => ({ root: { "--ledger-striped-color": "var(--mantine-color-blue-0)" } })} … />
```

Row-background precedence (last wins within the layer): stripe → hover → selected.

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

The compound components register their own theme keys the same way: `DataTableSearch`, `DataTableColumnsMenu`, `DataTablePagination`, `DataTableSelectionBar`.

## Layering, dark mode, RTL, motion

- Everything ships inside `@layer ledger`; cross-library layer order is the application's call (declare `@layer mantine, ledger;` first if you need to arbitrate).
- Colors and metrics are Mantine variables only → dark mode is automatic.
- Offsets and gradients use logical properties with explicit `[dir="rtl"]` mirrors for the pinned-edge shadows → RTL is automatic.
- Chevron rotations respect `prefers-reduced-motion: reduce`.

The kebab-case class contract is enforced mechanically by `@coldsmirk/stylelint-config` in CI — it does not rely on discipline.
