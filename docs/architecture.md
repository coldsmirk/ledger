# Architecture

Contributor-facing: how the package is built, the internal pipelines, and the invariants that must survive changes. The user-facing contracts these implement live in the guides; the design rationale is [DESIGN.md](DESIGN.md).

## Module map (`packages/mantine/src`)

| Module | Responsibility |
| --- | --- |
| `types.ts` | Public type surface + the `ColumnMeta` / `TableMeta` declaration merging |
| `use-data-table.ts` | The behavior core: slices, mode translation, row-model wiring, `meta.ledger`, `tableOptions` merge |
| `use-slice.ts` | One state slice: `useUncontrolled` + TanStack `functionalUpdate`, resolved-value callbacks |
| `data-table.tsx` | The factory component: option/presentation partition, Styles API, the header/body split (two synced tables), column CSS variables, infinite loading, scroll edges, imperative handle |
| `build-columns.tsx` | Injected selection/expander columns; `meta.filter` → `filterFn` gap-filling |
| `table-header.tsx` / `table-body.tsx` / `table-footer.tsx` | Renderers: header (sort/actions/resize/reorder), body (display rows, virtualization, pinned rows, group cells, skeletons), footer |
| `cell-editor.tsx` | Editing host: draft, validation, async commit lifecycle, keyboard map, deferred unmount-commit |
| `column-menu.tsx` / `columns-menu.tsx` / `filter-popover.tsx` | Header dropdown surfaces |
| `search.tsx` / `pagination-bar.tsx` / `selection-bar.tsx` | Compound components |
| `selection.tsx` / `expander.tsx` | Injected column cells (stop-propagation covenant, shift ranges, expand-all) |
| `use-column-widths.ts` | The width engine: raw sizing specs → exact integer pixel widths (weighted grow, proportional fill) |
| `use-column-resize.ts` | Pointer-based column resizing (1:1 from resolved widths, Escape restore, RTL-aware) |
| `use-column-reorder.ts` | Pointer-based header drag (threshold, click suppression, Escape) |
| `use-pinned-row-offsets.ts` | Measured cumulative sticky offsets for pinned rows |
| `pinning.ts` / `utils.ts` | Pinned-cell geometry; CSS-variable names; `useEventCallback`; `toPx` |
| `filter-fns.ts` | `ledger-one-of`, `ledger-date-range`, variant → filterFn map |
| `persist.ts` | `persistState`: guarded synchronous hydration, debounced writes, per-slice shape guards |
| `labels.ts` / `locales.ts` | Label catalog + `zhCN` (published as `./locales`) |
| `context.ts` | The one deliberate `TData` erasure boundary (see below) |
| `env.ts` | `isDev` + `warnOnce` — dependency-free on purpose |
| `styles.css` | The entire stylesheet, `@layer ledger` |
| `icons.tsx` | Inlined SVG paths — no icon-library dependency |

## Load-bearing internals

**Option partition with compile-time exhaustiveness.** Sugar mode splits props into behavior options vs presentation by the `OPTION_KEYS` list; `AssertNever<MissingOptionKeys>` makes *forgetting to list a new `UseDataTableOptions` key* a type error at the `Set` construction site. Add an option → add it to `OPTION_KEYS` or the build fails.

**One erasure boundary.** `context.ts` erases `TData` (`Table<any>`) for table-wide plumbing (styles getter, labels, row handlers); cells and menus receive their strongly-typed TanStack objects as props. Any new cast belongs *at that boundary*, not scattered through the tree.

**Header, body, and footer are separate tables under one ARIA table.** The header (and, when any column declares a `footer`, the totals region) sits in an `overflow: hidden` viewport outside the body ScrollArea, so the vertical scrollbar spans exactly the rows (never occluded, never bounced by overscroll) and totals stay visible. Three invariants keep the tables pixel-equal: identical Mantine props, identical `<colgroup>`s, and the shared root-level column variables — which requires `table-layout: fixed` on all, always (auto layout would distribute each table independently). Horizontal sync is one assignment — the body's scroll event mirrors `scrollLeft` onto the header and footer viewports in the same frame; native non-passive wheel listeners forward **dominantly horizontal** deltas (`|deltaX| > |deltaY|`, so vertical-leaning wheels keep scrolling the page) from those regions to the body. The body viewport is `overscroll-behavior: none` (inline via `viewportProps`): rubber-band overscroll translates the body past the clamped scroll position the mirrors read, shearing the regions apart for the duration of the bounce. Because the native tables would split the semantics, all are `role="presentation"` and the explicit ARIA table lives on `main` with `row` / `columnheader` / `cell` roles on the parts — keep those roles when adding new row kinds.

**Seam lines at and below the scroller's bottom edge are inset overlays** (EP's inner-wrapper technique): at scroll end the last row's border occupies the viewport's last pixel, so a real border on the next region (frame bottom, footer top, pagination top) stacks into one thick line. The scroller's `::after` owns the bottom seam, the footer separates with its trailing edge only, and the `withTableBorder` frame draws three real sides plus an overlay bottom — all coinciding on the same pixel instead of adding one below. Never give a region below the body a leading (`border-block-start`) separator. The ScrollArea scrollbars (the `[data-orientation]` children) get `z-index: 3` — above pinned cells (2), like every native overlay scrollbar — or the covered track stretch is unreachable and the thumb vanishes under a pinned column at the scroll extremes.

**Column geometry is CSS variables, and the numbers come from the width engine.** `use-column-widths.ts` resolves every visible leaf column to exact integer pixels (docs/sizing.md); widths (`--ledger-col-<id>`) and pinned offsets (`--ledger-col-start/after-<id>`, summed from the same resolved numbers) are written once at root level; `<col>` elements (in every region's table) and pinned cells reference them; the tables' own `width` is the exact total. A resize drag re-renders the header and one memoized style object — `DataRow` is `React.memo`ed and untouched. Column ids pass through `cssSafeColumnId` before becoming variable names. Three engine invariants:

- **Author sizing is read from the raw-definition registry** (`rawColumnSizing` in `build-columns.tsx`), never from `column.columnDef` — TanStack merges `size: 150, minSize: 20` defaults into every resolved definition, which makes "the author declared no size" unrepresentable after the merge. The registry keys off the per-leaf meta clone created during preprocessing.
- **Display order is pinned-aware everywhere**: header groups and `row.getVisibleCells()` render pinned columns first, but `getVisibleLeafColumns()` ignores pinning — the colgroup, the width specs, and the offset sums all use the `left + center + right` concatenation, or a mid-table pinned column drifts onto its neighbor's `<col>`.
- **Resize drags start from the resolved width** (via a stable ref in context — never the widths themselves, which would re-render every context consumer): TanStack's own resize handler snapshots `getSize()`, which is wrong for grow columns, so `use-column-resize.ts` owns the whole pointer session.

**Row backgrounds flow through one pipeline — painted on cells, never on `<tr>`.** Stripe (parity computed from the data index — `:nth-of-type` would count spacer rows), hover, and selected each set `--ledger-row-bg` on the row; the paint site is `.ledger-row > td`, and pinned cells read `--ledger-pinned-bg`, which follows it. The classic "pinned column doesn't cover stripes/hover" defect is unrepresentable. The cell-level paint is load-bearing: Mantine ships an **unlayered** `tr { background-color: transparent }`, and unlayered author styles defeat anything in `@layer ledger` regardless of specificity — a row-level paint silently loses under the default (unlayered) Mantine stylesheet. Keep any new row tint inside this pipeline, and never paint a property on an element the host styles unlayered. Corollary for pure-behavior elements: don't reach for a host component whose unlayered defaults fight inheritance — the sort control is a native `<button>` reset inside the layer (author rules always beat UA styles), because Mantine's `UnstyledButton` ships an unlayered `font-size` that overrode the layered `font: inherit` on header labels.

**Display rows.** `buildDisplayRows` interleaves data rows and expanded detail-panel rows into one list; the virtualizer counts that list, so every `<tr>` is exactly one virtual item and `measureElement` heights stay correct. Virtualization renders top/bottom spacer `<tr>`s (geometry only, `data-ledger-spacer`) around the window — never absolute positioning, so the real-`<table>` guarantee holds.

**Pinned rows measure, never assume.** Sticky offsets are the measured cumulative heights of preceding pinned rows, ResizeObserver-tracked (`use-pinned-row-offsets.ts`); the header lives outside the scroller, so top offsets start at 0. A shared `top` stacks every pinned row onto one edge — found by the interactive browser pass; jsdom cannot express it.

**Editing lifecycle.** `use-data-table.ts` owns the controller (start commits any cell being left; stop delegates to the mounted editor); the mounted editor registers `{ commit, cancel }` via `registerEditor`. The **unmount-commit defers one tick** so a remount of the same cell — React StrictMode's simulated unmount, or the virtualizer re-mounting a row still in view — cancels it; only a real departure commits. Do not "simplify" this into a synchronous unmount commit; StrictMode self-destructs the editor.

**`isDev` counts a missing `process` as development** (`env.ts`). Vite dev serves library sources to the browser, where `process` does not exist — that is precisely where the guards must fire; production app builds always define `NODE_ENV`. `env.ts` stays dependency-free so its test can stub `process` without re-evaluating React. `warnOnce` keys the once-per-session dev warnings ([state.md](state.md#dev-mode-guard-rails)).

**Infinite loading and layout races.** `onEndReached`'s probe and the unconstrained-virtualization warning both run one `requestAnimationFrame` after commit and ignore unlaid-out viewports (`clientHeight === 0`) — the pre-layout frame reads as "at the bottom" and used to fire phantom loads.

**Popover-nested comboboxes never portal.** Inside the filter popover, `Select`/`MultiSelect` render with `comboboxProps={{ withinPortal: false }}` — a body-level portal reads as an outside click and closes the popover mid-pick.

## Testing strategy

Vitest 4 + jsdom + Testing Library; specs colocated as `<name>.test.{ts,tsx}`; component wrappers render under **`StrictMode`** (its simulated unmounts caught a live editor bug that plain jsdom tests missed). Behavior tests drive the public API — sorting cycles, slice contracts, selection semantics, editing commit/cancel/validate, merge-order warnings — plus regression tests for every browser-found bug jsdom can express (strict `ledger-one-of` matching, the popover-stays-open flow, the deferred unmount-commit, the zero-height `onEndReached` guard, `isDev` without `process`).

What jsdom cannot express — real geometry (pinned-row stacking, scroll windows, adaptive resize, edge shadows) — is verified interactively in the playground with a real browser. When touching those areas, run the relevant playground demo and scroll/drag it.

Gates (all must stay green): `pnpm test`, `pnpm typecheck`, `pnpm lint:check`, `pnpm lint:css:check` (mechanical kebab-case enforcement), `pnpm build`, `pnpm check:package` (publint + attw on the packed output; `.attw.json` excludes the typeless `styles.css` entrypoint and pins the `node16` profile). Tests run against TS source via the `source` export condition — a green suite does not prove the build; the last two gates do.

## Build and release

Family-standard: tsdown (dual ESM+CJS, dts, `"use client"` banner, `styles.css` copied verbatim), `sideEffects: ["*.css"]`, exports map with a `source` condition (dev-time and playground resolution), lockstep versioning via `pnpm version:*`, tag-driven releases (`RELEASING.md`).
