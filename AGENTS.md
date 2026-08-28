# AGENTS.md

Single canonical source of agent guidance for this repository. `CLAUDE.md` imports it via `@AGENTS.md` (Claude Code reads `CLAUDE.md`, not `AGENTS.md`), so every agent shares one document — make all edits here, not in `CLAUDE.md`.

## Project Overview

ledger is a Mantine-native `<DataTable>` built on TanStack Table v9 (headless table logic) and TanStack Virtual v3 (row virtualization). It is a pnpm-workspace monorepo (Node >= 24, `pnpm@11.6.0`) on TypeScript; the root is `private`, and one package publishes to npm:

- `@coldsmirk/ledger-mantine` (`packages/mantine`) — the `<DataTable>` component, the `useDataTable` hook, compound components (`DataTable.Search` / `.ColumnsPanel` / `.Pagination` / `.SelectionBar`), curated TanStack re-exports, the `zhCN` locale (`./locales`), the `toCsv` utility, and the layered `styles.css`.
- `ledger-playground` (`packages/playground`, private) — a Vite demo app with one page per feature area, resolving the library straight from TypeScript source (no build step in the loop). `pnpm --filter ledger-playground dev`. Every page is bilingual (English default, `zhCN` one click away — see `src/i18n.tsx`) and carries a **View source** drawer, so a demo file is read as much as it is run: keep each one self-contained and idiomatic, with its two-language copy block at the top.

**Status: implemented; docs split into the standard set.** `docs/README.md` maps the documentation: per-feature guides (authoritative for behavior), `docs/api.md` (the complete public surface with defaults), `docs/recipes.md`, `docs/architecture.md` (contributor internals and testing strategy), and `docs/DESIGN.md` (the founding design record — vision, naming constitution, hard semantic rules, decision log, TanStack coverage matrix; authoritative for intent). **Any change to the public surface must update `docs/api.md` and the relevant feature guide in the same commit**; a design-level reversal also lands in DESIGN.md's decision log. Cell selection is deliberately unimplemented — it needs a design round first.

## Commands

- `pnpm test` — whole Vitest suite once (`vitest run`); `pnpm test:watch` is the iteration loop; `pnpm test:coverage` for coverage. Component specs render under `StrictMode` (parity with real apps — its simulated unmounts caught a live editor bug once).
- `pnpm typecheck` — root `tsc --noEmit` plus per-package typechecks
- `pnpm lint:check` / `pnpm lint` — ESLint verify / autofix (sealed `@coldsmirk/eslint-config`, `{ type: "lib", react: true }`, no per-repo overrides)
- `pnpm lint:css:check` / `pnpm lint:css` — Stylelint on `packages/*/src/**/*.css` (sealed `@coldsmirk/stylelint-config`; mechanically enforces the kebab-case class contract)
- `pnpm build` — all packages via tsdown; `pnpm clean` removes `dist`
- `pnpm check:package` — publish hygiene (`publint` + `@arethetypeswrong/cli`) against the packed output
- `pnpm version:patch|minor|major` — bump root + packages to one shared version (lockstep; never hand-edit a single manifest). Release = push an annotated `v*` tag; `release.yml` re-runs the gates and publishes.

## Design Doctrine (digest — the full text is docs/DESIGN.md)

**The behavior layer speaks TanStack's language; the presentation layer speaks Mantine's.**

- Columns are raw TanStack `ColumnDef`s — never a bespoke column DSL. Presentation concerns ride the typed `meta` extension (`align`, `truncate`, `filter`, `edit`, …). v9's `TFeatures` generic is pre-bound to the canonical feature set (`ledger-features.ts`); consumers never see it.
- State shapes are TanStack's verbatim; every slice is independently controllable as `x` / `defaultX` / `onXChange(resolvedValue)` — no `initialState` bag, no updater functions in consumer-facing callbacks.
- Behavior switches use TanStack's real option names (`enableSorting`, `enableColumnPinning`, …); presentation props use Mantine's (`striped`, `withTableBorder`, `highlightOnHover`, …). Sizing is Mantine `BoxProps` (`h`, `mah`, `flex`) — no custom height props.
- Naming adjudication order: Mantine vocabulary → TanStack vocabulary → widest industry precedent (recorded) → invention only as a last resort, shaped like its nearest family. Same name must mean the same thing as the host's; otherwise rename (`tableMinWidth`, not `minWidth`).
- Token casing: JS identifiers camelCase; string enum values, CSS classes, CSS custom properties, and data-attributes kebab-case (`'multi-select'`, `.ledger-header-cell`, `--ledger-row-bg`, `data-pinned`).
- No config-bag props, no mega `onChange`, no AntD-style naming. Escape hatches are never sealed: `tableOptions` merges through (ledger-managed keys win, with a dev warning), `useDataTable` returns the bare TanStack `Table` instance.

## Key Patterns

- **Real `<table>` markup, always** — virtualization uses top/bottom spacer rows, not absolute positioning; expanded detail panels become synthetic display rows so each `<tr>` is exactly one virtual item. Header, body, and footer are **synced tables** (header/footer viewports outside the body scroller, `scrollLeft`-mirrored; identical colgroups + shared column variables + `table-layout: fixed` keep them pixel-equal) under one explicit ARIA table on `.ledger-main` — the native tables are presentational, so every row/cell carries its ARIA role.
- **The width engine owns every column width** (`use-column-widths.ts`, docs/sizing.md): exact integer pixels per column, weighted grow distribution, table `width` = exact total, pinned offsets summed from the same numbers. Author sizing is snapshotted from RAW defs (`rawColumnSizing`) — TanStack merges `size: 150, minSize: 20` defaults into `column.columnDef`, so never read sizing from there; and all column iteration follows the pinned-aware `start + center + end` display order (v9's logical positions), never bare `getVisibleLeafColumns()`.
- **Adaptive sizing** — `.ledger-root` fills the parent (`width/height: 100%`, `min-width/min-height: 0`, `overflow: hidden`) and degrades to content height under indefinite parents; the internal ScrollArea is the only elastic region and owns all overflow. Never require a fixed pixel height for anything, virtualization included (TanStack Virtual tracks the scroll element with ResizeObserver).
- **Layered stylesheet** (`packages/mantine/src/styles.css`): everything in the `ledger` layer, consuming only Mantine CSS variables (dark mode and RTL come from the host theme). Classes are kebab-case under `ledger-`; state is data-attributes, never state classes; row background flows through `--ledger-row-bg` so pinned cells cover stripes/hover correctly.
- **ledger-private config and editing state ride `table.options.meta.ledger`** (TanStack's sanctioned extension point) — `useDataTable` has no wrapper type, and hook mode loses nothing. Internal state reads go through `table.atoms.<slice>.get()`, never `table.state` (which exists only on the hook's wrapper, not on the core instance header renderers receive).
- **All UI copy goes through `labels`** (English defaults; the `zhCN` preset ships from `./locales`); never hardcode a locale string in a component. Chrome glyphs follow the same rule through the `icons` registry (`icons.tsx`, vendored Lucide defaults) — never render a glyph component directly.
- **Injected columns (selection checkbox, expander) stop propagation** so they never trigger `onRowClick`.

## Conventions

- Commits: single-line Conventional Commits, enforced by commitlint (`@coldsmirk/commitlint-config`); hooks installed by husky on `pnpm install`.
- Pre-1.0 with no external consumers: prefer breaking changes that fix bad shapes over compatibility shims; never leave technical debt behind.
- Testing: Vitest 4 + jsdom + Testing Library; specs colocated as `<name>.test.{ts,tsx}` next to their source; tests run against TS source via the `source` export condition — a green suite does not prove the tsdown build, `pnpm build` + `pnpm check:package` are separate gates.
- Language: all in-repo text (code, comments, docs, commits) is English.
