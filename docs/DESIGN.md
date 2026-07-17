# ledger — Design record

**Status: implemented (2026-07-16); split into standard documents (2026-07-16).** This is the founding design record: the vision, the naming constitution, the hard semantic rules, the decision log, and the TanStack coverage audit — the *why* behind the library. The *what* and *how* now live in the standard docs ([README.md](README.md) is the map): feature behavior in the guides, the full surface in [api.md](api.md), internals in [architecture.md](architecture.md). When a guide and this record disagree, the guide is authoritative for behavior; this record is authoritative for intent.

- [1. Vision](#1-vision)
- [2. The naming constitution](#2-the-naming-constitution)
- [3. Structural decisions](#3-structural-decisions)
- [4. Hard semantic rules](#4-hard-semantic-rules)
- [5. Non-goals](#5-non-goals)
- [6. First consumers](#6-first-consumers)
- [7. Decision log](#7-decision-log)
- [Appendix A: TanStack Table v8 feature coverage](#appendix-a-tanstack-table-v8-feature-coverage)

## 1. Vision

Mantine deliberately ships no data grid. The community fills the gap either by reimplementing table logic from scratch or by burying TanStack Table under a configuration bag. ledger takes a narrower, sharper stance:

> **The behavior layer speaks TanStack's language; the presentation layer speaks Mantine's.**

One sentence teaches the whole API. TanStack Table v8 supplies column model, state, and row pipelines — ledger does not wrap them in a second dialect. Mantine supplies the visual system — table styling, spacing tokens, Styles API, theme — and ledger's presentation surface is indistinguishable from a first-party Mantine component.

**Feature bar**: the union of what MUI DataGrid and Ant Design Table are used for in real applications — sorting, filtering, pagination, selection, pinning, resizing, visibility, master–detail, inline editing, virtualization — *without* referencing either library's API design.

**Naming**: *ledger* — the bound book of rows and columns. It joins the owner's desk-object family (abacus computes, inkstone writes, ledger records). Repo `coldsmirk/ledger`, package `@coldsmirk/ledger-mantine`, component `<DataTable>` — the project name carries the identity, the component name describes the capability.

## 2. The naming constitution

Every name in the public surface is adjudicated by this procedure, in order:

1. **The concept belongs to presentation** → Mantine vocabulary, verbatim: `value` / `defaultValue` / `onChange`-style controlled trios, `with*` structural switches, `render*` render props, state via `data-*` attributes.
2. **The concept belongs to table behavior** → TanStack v8 vocabulary, verbatim against the real 8.21 option names: `enable*` switches, state slice names and shapes, `getRowId`, `rowCount`, `defaultColumn`.
3. **Neither side has it** → adopt the widest industry precedent and record the source (`'client' | 'server'` modes: MUI DataGrid; `onEndReached`: React Native FlatList).
4. **No precedent at all** → invention is allowed only as a last resort and must be shaped like its nearest family (`enablePagination` and `enableColumnOrdering` borrow the `enable*` shape — TanStack expresses both by row-model inclusion or state-without-a-switch, so there is no name to borrow).
5. **Literal casing**: JS identifiers are camelCase; string enum values, CSS classes, CSS custom properties, and data-attributes are kebab-case (`'multi-select'`, `'double-click'`, `.ledger-header-cell`, `--ledger-row-bg`, `data-pinned`).
6. **Same name, same meaning**: a prop that shares a name with a host concept must mean exactly what the host means; otherwise it must be renamed (the table-content width floor is `tableMinWidth` because `miw` already means root min-width) — and one prop has one responsibility: no config bags, no mega `onChange(pagination, filters, sorter)`, no multi-meaning overloads.

Deliberate divergences from TanStack, each with cause:

| ledger | instead of | Why |
| --- | --- | --- |
| `sortingMode` / `filterMode` / `paginationMode`: `'client' \| 'server'` | `manualSorting` etc. | "manual" is famously opaque; client/server is the industry term. The only place rule 3 outranks rule 2. `tableOptions` conflicts are resolved by the merge rule (§4.1). |
| `onXChange(value)` receives the resolved value | TanStack `Updater<T>` | The React/Mantine ecosystem standard; functional updaters are resolved internally. |
| per-slice `defaultX` | `initialState` bag | The canonical React controlled/uncontrolled contract (`value` / `defaultValue`), Mantine-consistent, and it makes double-sourcing a slice impossible. |

### Consequences

- **Columns are raw `ColumnDef`s.** No bespoke column DSL: every column-level TanStack capability is automatically present. Presentation concerns ride the typed `meta` extension.
- **State shapes are TanStack's verbatim** (`SortingState`, `RowSelectionState`, …); knowledge and code transfer directly, and the escape-hatch instance never disagrees with the props.
- **Escape hatches are never sealed**: `tableOptions` merges through to `useReactTable`, `useDataTable` returns the bare TanStack `Table`, `flexRender` is re-exported.
- **TanStack is an implementation dependency, not a peer**: consumers import everything from `@coldsmirk/ledger-mantine` and never from `@tanstack/*`.

## 3. Structural decisions

- **Single published package** in a family-standard monorepo (`packages/*` leaves room for a future layer; none is planned — TanStack itself is the headless core).
- **Component foundation**: Mantine `genericFactory` — generic over `TData` with full Styles API support and `DataTable.extend()` for theme-level defaults.
- **Re-export policy**: `createColumnHelper`, `flexRender`, and every needed type are re-exported; `Table` is renamed `TableInstance` to avoid colliding with Mantine's `Table`. Because ledger owns the TanStack dependency, its declaration merging is a private implementation detail consumers simply receive as typed `meta`.
- **Icons**: the handful needed are inlined SVG paths — no icon-library dependency, no locked icon set.
- **Copy**: zero hardcoded strings; everything user-visible flows through `labels`, with English defaults in the package and a `zhCN` preset under `./locales`. App-wide configuration is the Mantine-native mechanism (theme `defaultProps`) — no extra provider.
- **Adaptive sizing is a founding requirement, not a feature**: the root fills its parent, degrades to content height, and overflow only ever appears on the internal scroller; there is no fixed-height mode and no height props (Mantine `BoxProps` is the sizing vocabulary). Virtualization must work inside that contract — no fixed-height prerequisite. The full contract: [sizing.md](sizing.md).
- **Real `<table>` markup, always** — virtualization uses spacer rows in normal table flow, and expanded detail panels become synthetic display rows so each `<tr>` is exactly one virtual item. Header and body render as two synced tables under one explicit ARIA table (see the decision log) — split regions, never div soup.
- **Styling contract**: kebab-case classes under `ledger-` mapped 1:1 from camelCase Styles API selectors, state as data-attributes (never state classes), `--ledger-*` custom properties, everything in the `ledger` layer, only Mantine variables consumed — enforced mechanically by stylelint, not discipline. The full contract: [styling.md](styling.md).
- **Inline editing is v1** (pulled forward by the owner): `meta.edit` symmetric with `meta.filter`; editing state is the only non-TanStack slice, carried via `table.options.meta.ledger` so `useDataTable` returns a bare `Table<TData>`.

## 4. Hard semantic rules

The behavioral contract, stated once here; each rule's mechanics are specified in its guide.

1. **`tableOptions` merge order**: `tableOptions` is the base layer; ledger-managed keys override it, and a collision on a managed key logs a dev warning. `manualSorting` and `sortingMode` can never fight — the latter wins, audibly. ([state.md](state.md))
2. **`table.options.meta.ledger`** carries ledger-private configuration and editing state (TanStack's sanctioned extension point) — no wrapper type, and hook mode loses nothing. ([state.md](state.md))
3. **Discriminated union**: `table` and `data`/`columns` are mutually exclusive at the type level.
4. **Auto-reset policy**: client mode keeps TanStack's defaults; server mode disables TanStack's auto-resets and performs the one equivalent deterministic reset itself (`columnFilters` / `globalFilter` / `sorting` → `pageIndex` 0). Overridable through `tableOptions`. ([state.md](state.md))
5. **Injected columns stop propagation**: selection checkboxes, expanders, editors, and menu triggers never reach `onRowClick`. ([rows.md](rows.md))
6. **Select-all scope**: current page when paginated, all filtered rows otherwise; predicate-disabled rows are excluded. ([selection.md](selection.md))
7. **Dev-mode guards** are part of the contract: the full list lives in [state.md](state.md#dev-mode-guard-rails).

## 5. Non-goals

- No data fetching or caching — pair with TanStack Query; no URL state sync ([recipes.md](recipes.md) documents the `onXChange` ↔ router wiring).
- No div-soup grid: a real `<table>` always, even virtualized.
- No Tailwind inside the library (Tailwind is an app-side convention; the library must be portable).
- No SSR hydration gymnastics: SPA-targeted; rendering stays SSR-safe, nothing more.
- Deferred, not rejected — each needs its own design round before any code: **column virtualization, cell selection, row editing mode**.
- Never: config-bag props, mega `onChange`, compatibility shims, legacy aliases.

## 6. First consumers

The heddle console's seven hand-rolled Mantine Table list pages (messages/dlq, flows, interfaces, systems, data-sources, custom-nodes, app-config). The messages list exercises the deep end at once: server sorting, cursor-based infinite loading, virtualization, row click → detail drawer, and a trailing action column. The console's abacus editor grids (expression / decision-table) are **out of scope** — those are editor grids and stay abacus's territory.

Because the console already depends on `@tanstack/react-table` and `@tanstack/react-virtual`, adopting ledger adds near-zero bundle weight.

## 7. Decision log

Decisions that shaped the surface, in the order they were made. Dates are build dates.

**Design round (2026-07-16).** Twelve API decisions were overturned during review before any code — the survivors above are the result. The consequential reversals: `initialState` bag → per-slice `defaultX` trios; `manualX` passthrough → `*Mode: 'client' | 'server'`; a custom column type → raw `ColumnDef` + typed `meta`; a wrapper table type → the bare instance + `meta.ledger`; height props → `BoxProps` only.

**One-pass build (2026-07-16).** The planned v1 / v1.1 / v2 phasing was collapsed by the owner's directive — everything in one pass. Shipped beyond the original v1 line: `range` / `date-range` filters (native `type="date"`, deliberately no `@mantine/dates` dependency), shift-range selection, `DataTable.SelectionBar`, tree indentation + expand-all, Tab-to-adjacent-cell editing, column drag reordering (`enableColumnOrdering`; single-row headers only — group-sibling order is ambiguous), first-class grouping rendering, row-pinning rendering (sticky under the measured header height), `persistState`, and `toCsv`.

**Amendments to the frozen surface**, each deliberate:

- **`handleRef` carries the imperative handle**; `ref` stays the root DOM element — the Mantine factory contract owns `ref`, so the original "handle on ref" line was amended.
- **`isDev` counts a missing `process` as development**: Vite dev serves library sources to the browser where `process` does not exist, and the dev guards must fire exactly there.
- **The editor's unmount-commit defers one tick** so StrictMode's simulated unmount and virtualizer row remounts cancel it; only a real departure commits. Found by a browser smoke test — the vitest wrappers now render under `StrictMode` for parity.
- **`onEndReached`'s initial probe waits a frame and ignores unlaid-out viewports** — the pre-layout viewport reads as "at the bottom" and used to trigger a phantom page load.
- **attw config** (`.attw.json`): the `styles.css` entrypoint is excluded (a stylesheet has no types) and the profile is `node16` — with `engines.node >= 24`, node10 subpath resolution is out of contract for `./locales`.

**Interactive browser pass (2026-07-16, playwright-driven, every demo).** Three defects, each fixed at the root with a regression test where jsdom can express it:

- **Filter combobox dropdowns render in-popover** (`comboboxProps={{ withinPortal: false }}`): a body-level portal read as an outside click and closed the filter popover mid-interaction.
- **`multi-select` filters via `ledger-one-of`** (strict set membership, ledger-registered): TanStack's `arrIncludesSome` degrades to substring matching on scalar row values, so choosing `active` also matched `inactive`.
- **Pinned rows stack with measured cumulative offsets** (`usePinnedRowOffsets`, ResizeObserver-backed): one shared sticky `top` piled every top-pinned row onto the same edge. jsdom has no layout — covered by the browser pass, not a unit test.

**Docs split (2026-07-16).** This document was split into the standard set ([README.md](README.md)); DESIGN.md was reduced to the design record you are reading. Rule: behavior guides win on behavior; this record wins on intent.

**Header/body split rendering (2026-07-16, owner-driven).** The original sticky-in-scroller header had structural defects no CSS patch reaches: the overlay scrollbar spanned (and hid under) the header, macOS overscroll bounced it, `border-collapse` dropped stuck borders, and every overlay renegotiated z-index with it. Replaced by the industry-standard split (MUI DataGrid / AG Grid / AntD precedent — naming-constitution rule 3 applied to architecture): the header renders in its own `overflow: hidden` viewport above the body ScrollArea, `scrollLeft`-mirrored from the body's scroll event, with horizontal wheels over the header forwarded to the body. The two classic split penalties don't apply here — column widths are already shared CSS variables (no measurement sync) and overlay scrollbars need no gutter compensation. Paid deliberately: `table-layout: fixed` always (two tables can't share auto layout; the regime switch was deleted outright), and semantics re-established via an explicit ARIA table (`main[role="table"]`, presentational native tables, `row`/`columnheader`/`cell` roles). Side effects: the `--ledger-thead-h` measurement pipeline died (pinned rows now offset from the scroller's own edge), `withTableBorder` became a frame on `main` (always visible at the viewport edge instead of scrolling with wide content), and the empty state now sits inside that frame.

**Row backgrounds paint on cells, never on `<tr>` (2026-07-16, owner-reported).** Selected/hover/striped tints appeared only on the pinned checkbox column: Mantine ships an *unlayered* `tr { background-color: transparent }`, and unlayered author styles defeat `@layer ledger` regardless of specificity — the row-level paint silently lost everywhere (stripes invisible, pinned rows transparent) while cell-level paints survived. The pipeline is unchanged (`--ledger-row-bg` still set per row); only the paint site moved to `.ledger-row > td`. Standing rule: never paint a property on an element the host styles unlayered. The same review removed the pagination bar's duplicate top border when the `withTableBorder` frame already draws that edge.

**Element Plus adoption round (2026-07-16, owner-driven).** The owner named Element Plus's table the best-executed pinning/width/fixed-row implementation and asked for its design patterns (explicitly not its naming) to be absorbed. Source studied: `table-layout.ts` (the width engine), `util.ts` (fixed offsets from engine-resolved widths), `table/style-helper.ts` (scroll sync, wheel forwarding), `table.scss`, `table.vue`. Adopted, each re-derived for TanStack + Mantine:

- **The width engine** (`use-column-widths.ts`): every visible leaf column resolves to exact integer pixels — explicit widths fixed and clamped; grow columns weighted by `minSize ?? 80` with floor + remainder-to-first; overflow at the basis floor. Improvements over EP: an all-fixed column set fills the viewport proportionally instead of leaving a dead gap, and the table's `width` is set to the exact total so the browser never redistributes. This killed a measured defect: under `width: 100%` + fixed layout the browser had been inflating *every* column ~1.2× while TanStack's `getSize()`-based pinned offsets used the specified numbers — rendered and specified disagreed systemically.
- **Fixed offsets from resolved widths** (EP's `getFixedColumnOffset` idea): pinned sticky offsets are sums of engine numbers, exact for grow columns too.
- **The footer as a third synced region** (EP's footer-wrapper): totals are always visible below the scroller.
- **Wheel dominant-axis guard** (EP's `|pixelX| >= |pixelY|`): header/footer wheel forwarding no longer hijacks vertical-leaning scrolls.
- **`border-collapse: separate` + cell-level borders** (EP uses separate on all three tables): Chrome does not repaint collapsed borders at stuck sticky positions — the separator between two stuck pinned rows was visibly missing. `withRowBorders`/`withColumnBorders` became root data-attributes painted by ledger's layer.

Rejected: EP's `background: inherit` on fixed cells (the `--ledger-row-bg` pipeline is stricter), its resize proxy-line interaction (live CSS-variable resizing feels better and costs nothing), and its naming (per the owner). Two ecosystem gotchas surfaced and fixed en route: TanStack merges `size: 150, minSize: 20` defaults into every `column.columnDef`, so author sizing must be snapshotted from raw definitions before the merge (`rawColumnSizing` registry — which also fixed `meta.filter` mapping for grouped children); and `getVisibleLeafColumns()` ignores pinning while header groups and row cells don't, so the colgroup and all width/offset math follow the `left + center + right` display order. TanStack's resize handler (which snapshots `getSize()`) was replaced by a ledger-owned pointer session starting from the resolved width — grow-column drags are 1:1, Escape restores.

**Seam ownership and region alignment (2026-07-17, owner-reported).** Three defects from live review, each fixed at its root:

- **Seam lines below the body paint as inset overlays, never as leading borders on the next region** (EP's inner-wrapper overlay technique, completing the adoption above). At scroll end the last row's `border-block-end` occupies the viewport's last pixel, so any line stacked *outside* the scroller — the frame's bottom border, the footer's top border, the pagination bar's top border — read as one thick line. Now the scroller draws its bottom seam as a 1px `::after` overlay that coincides with that pixel, the footer separates with its trailing edge only, and the `withTableBorder` frame keeps three real sides while its bottom edge is the same kind of overlay. The pagination bar draws its own line only in the fully borderless look.
- **The sort control is a native `<button>`, not Mantine `UnstyledButton`**: UnstyledButton carries an *unlayered* `font-size: var(--mantine-font-size-md)` that defeated the layered `font: inherit`, rendering sortable header labels 16px over 14px body text. Corollary to the standing unlayered-host rule: for pure-behavior elements, don't adopt a host component whose unlayered defaults fight inheritance — reset a native element in the layer instead (author rules always beat UA styles).
- **The body viewport sets `overscroll-behavior: none`**: rubber-band overscroll translates the body past the clamped scroll position the header/footer mirrors read, shearing the regions apart for the duration of the bounce. Accepted trade-off: no scroll chaining out of the table (the standard trapped-scroller behavior of data grids).

**Scrollbars float above pinned cells (2026-07-17, owner-decided).** Mantine's ScrollArea scrollbars carry no z-index, so pinned cells (z-index 2) covered them: the covered track stretch was unreachable (the pinned cell intercepts the pointer) and the thumb vanished under a pinned column exactly at the scroll extremes. Options weighed: EP raises its bar above fixed columns (fixed `+1`, bar `+2` — verified in `table.scss`) and native overlay scrollbars always paint above sticky content (MUI DataGrid / AntD inherit this); AG Grid's center-only fake scrollbar was rejected (dynamic track insets, thumb rescaling, and against native muscle memory). Resolution: `.ledger-scroller > [data-orientation] { z-index: 3 }` — Mantine's own styling hook attribute, because the sealed stylelint config (correctly) rejects the PascalCase `.mantine-*` class in a selector.

**Injected column headers are controls, not text (2026-07-17, owner-reported).** The expand-all icon rendered half-clipped: every header went through the label scaffolding, whose `[data-truncate]` span (`overflow: hidden`, for text ellipsis) cut the 22px ActionIcon at the 36px column's 16px content box — the select-all checkbox escaped only because it happens to measure exactly 16px. Internal columns now bypass the label/truncate wrapper entirely (they never sort, filter, or resize) and center through the existing `data-align` pipeline. Fourth header-scaffolding lesson: never route non-text header content through the truncating wrapper.

**Tree parents are not aggregates (2026-07-17, found building the menu demo).** Tree rows rendered no expander toggle and silently bypassed the author's cell renderer on every parent row: TanStack's `cell.getIsAggregated()` is `!grouped && !placeholder && !!row.subRows?.length` — a grouping concept that is true for every `getSubRows` parent — and the default `aggregatedCell` (`getValue().toString()`) made parent cells *look* right while dropping the expander (no accessor value) and all custom formatting. Third transferable TanStack gotcha (after the default-merge and pinned-order ones): gate aggregated rendering on `row.getIsGrouped()`, never on `getIsAggregated()` alone.

## Appendix A: TanStack Table v8 feature coverage

Audit question: *is every TanStack Table capability accounted for?* Structural answer first: because columns are **raw `ColumnDef`s** and `tableOptions` merges through to `useReactTable`, **100% of TanStack's column-level and table-level option surface is reachable**. This matrix records which capabilities get first-class treatment (props / UI / state trios) and which remain escape-hatch-only, so nothing is unaccounted for. Dispositions reflect the implemented state.

| TanStack capability | Disposition |
| --- | --- |
| Column defs: `accessorKey` / `accessorFn` / display / group | First-class — raw `ColumnDef`, `createColumnHelper` re-exported |
| Header groups & placeholder headers | First-class — rendered |
| Column footers | First-class — rendered (totals row) |
| `getRowId`, `defaultColumn`, table/column `meta` | First-class (`meta.ledger` namespace reserved) |
| Sorting: multi-sort, `sortDescFirst`, `sortUndefined`, `invertSorting`, custom `sortingFn`s | First-class; column-level knobs free via raw `ColumnDef` |
| `maxMultiSortColCount`, `isMultiSortEvent`, `sortingFns` registry | Escape hatch (`tableOptions`) — niche tuning |
| Column filtering: `filterFn`s, `enableColumnFilters` | First-class — `meta.filter` popovers (`text` / `select` / `multi-select` / `range` / `date-range`) |
| `filterFromLeafRows`, `maxLeafRowFilterDepth` | Escape hatch |
| Global filtering + `globalFilterFn` | First-class — `enableGlobalFilter` + `DataTable.Search`; custom fn via `tableOptions` |
| Fuzzy filtering (`@tanstack/match-sorter-utils`) | Recipe ([recipes.md](recipes.md)) — not bundled, keeps the dependency optional |
| Column faceting (`getFacetedUniqueValues`, `getFacetedMinMaxValues`) | First-class — auto-populates select-family options and range bounds in client mode |
| Global faceting (`getGlobalFaceted*`) | Escape hatch — no first-class UI planned |
| Pagination (client), `pageCount` / `rowCount`, `manualPagination` | First-class — `enablePagination`, `paginationMode`, `rowCount`; built-in bar + `DataTable.Pagination` |
| Auto-resets (`autoResetPageIndex`, …) | First-class policy (§4.4). *Surfaced by this audit.* |
| Row selection: multi/single, predicate, select-all | First-class — incl. shift ranges and `DataTable.SelectionBar` |
| `enableSubRowSelection` | Escape hatch (`tableOptions`). *Surfaced by this audit.* |
| Expanding: detail panels | First-class — `renderDetailPanel` (synthetic display rows under virtualization) |
| Expanding: sub-rows / tree data | First-class — `getSubRows`, indent UI, expand-all header affordance |
| `paginateExpandedRows` | Escape hatch |
| Grouping & aggregation (`getGroupedRowModel`, `aggregationFn`, `aggregatedCell`) | First-class — `enableGrouping`, menu action, grouped/aggregated cells; `groupedColumnMode` via `tableOptions` |
| Row pinning (`enableRowPinning`, `keepPinnedRows`, `getTopRows` / `getBottomRows`) | First-class state + sticky rendering; trigger UI is the page's (`row.pin()`); `keepPinnedRows` via `tableOptions` |
| Column ordering (`columnOrder`) | First-class — state trio + drag reordering (`enableColumnOrdering`) |
| Column pinning | First-class — menu actions, sticky offsets, edge shadows |
| Column sizing / resizing (`columnResizeMode`, `columnResizeDirection`) | First-class — CSS-variable pipeline; mode fixed to `onChange` (deliberate); direction follows Mantine `dir` |
| Column visibility | First-class — `enableHiding`, `ColumnsMenu`, column menu |
| Row models | First-class — wired automatically per feature switch |
| Rendering: `flexRender`, `renderFallbackValue` | `flexRender` re-exported; `renderFallbackValue` via `tableOptions` |
| Custom features API (`_features`) | Out of scope — ledger's extension lives in `meta.ledger`; `_features` remains reachable but unsupported |
| Debug options (`debugTable`, …) | Escape hatch (`tableOptions`) |
| Virtualization (TanStack Virtual — separate library) | Row virtualization first-class (spacer rows, adaptive viewport); **column virtualization deferred — needs a design round** |

Net-new obligations this audit added to the design: the auto-reset policy, the `tableOptions` collision warning, `enableSubRowSelection` recorded as escape-hatch, the expand-all affordance, and row pinning's disposition.
