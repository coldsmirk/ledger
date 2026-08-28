# ledger

[![npm version](https://img.shields.io/npm/v/%40coldsmirk%2Fledger-mantine)](https://www.npmjs.com/package/@coldsmirk/ledger-mantine)
[![CI](https://github.com/coldsmirk/ledger/actions/workflows/ci.yml/badge.svg)](https://github.com/coldsmirk/ledger/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A Mantine-native `<DataTable>` built on [TanStack Table](https://tanstack.com/table) and [TanStack Virtual](https://tanstack.com/virtual).

**Live demo:** [coldsmirk.github.io/ledger](https://coldsmirk.github.io/ledger/) — one page per feature area, bilingual (EN / 简体中文), each with a view-source drawer.

Mantine deliberately ships no data grid; the community options either reimplement table logic from scratch or bury TanStack under a configuration bag. ledger takes a narrower stance: **the behavior layer speaks TanStack's language, the presentation layer speaks Mantine's** — raw `ColumnDef`s and verbatim state shapes on one side, forwarded `Table` style props, `BoxProps` sizing, and the Styles API on the other, rendered as a real `<table>` that fills whatever space its parent gives it.

> ledger is pre-1.0: the public surface is complete and documented, but minor releases may still contain breaking changes while the API settles.

## Features

- **TanStack-verbatim behavior** — columns are raw TanStack `ColumnDef`s (presentation concerns ride a typed `meta` extension); every state slice is independently controllable as `x` / `defaultX` / `onXChange`; behavior switches use TanStack's real option names (`enableSorting`, `enableColumnPinning`, …).
- **Mantine-native presentation** — forwarded `Table` style props (`striped`, `highlightOnHover`, `withTableBorder`, …), `BoxProps` sizing (`h`, `mah`, `flex`), Styles API theming, and dark mode / RTL inherited from the host theme.
- **Sorting, filtering, and pagination** — multi-sort, per-column filter variants with faceted options, global search, and a pagination bar; each with a documented server mode.
- **Rows** — selection (multi/single, shift ranges, selection bar), master–detail expansion, tree data, grouping with aggregation, row pinning, and drag or keyboard row reordering.
- **Columns** — pinning, resizing, drag reordering, visibility with a ready-made columns panel, and header groups.
- **Inline editing** — cell- and row-level editing with validation, async commits, and a full keyboard map.
- **Virtualization** — row and column virtualization on real `<table>` markup, infinite loading, and imperative `scrollToRow` / `scrollToColumn`.
- **Composition** — a sugar component for ordinary pages, a `useDataTable` hook that returns the bare TanStack `Table` instance, and compound components (`DataTable.Search`, `.ColumnsPanel`, `.Pagination`, `.SelectionBar`) for page-owned toolbars.
- **Accessibility and i18n** — an explicit ARIA table structure, announced state changes, and every user-visible string flowing through `labels` (English defaults, `zhCN` preset included).

## Quick start

### Installation

```bash
pnpm add @coldsmirk/ledger-mantine
# npm install @coldsmirk/ledger-mantine / yarn add @coldsmirk/ledger-mantine
```

Peer dependencies (provided by the host application): `@mantine/core`, `@mantine/dates`, and `@mantine/hooks` `^9.0.0`; `react` and `react-dom` `^19.2.0`; and `dayjs` as required by `@mantine/dates`. `@tanstack/react-table` and `@tanstack/react-virtual` are direct dependencies — everything a table needs (`createColumnHelper`, `flexRender`, every state type) is re-exported from the main entry.

Import the stylesheet once, after Mantine's:

```tsx
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@coldsmirk/ledger-mantine/styles.css";
```

### First table

```tsx
import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";

interface Person {
  id: string;
  name: string;
  email: string;
  age: number;
}

const helper = createColumnHelper<Person>();

const columns = [
  helper.accessor("name", { header: "Name", size: 160 }),
  helper.accessor("email", { header: "Email", meta: { truncate: true } }),
  helper.accessor("age", { header: "Age", size: 80, meta: { align: "end" } })
];

export function PeopleTable({ people }: { people: Person[] }) {
  return (
    <DataTable
      columns={columns}
      data={people}
      getRowId={person => person.id}
      highlightOnHover
      withTableBorder
    />
  );
}
```

Sorting and column pinning/hiding work out of the box; everything else (`enableRowSelection`, `enablePagination`, `virtualizedRows`, …) is one switch away. For toolbars and full control, create the instance with `useDataTable` and compose the compound components around `<DataTable table={table}>` — sugar mode degrades to hook mode with zero rewrites because both share the same options. The [getting-started guide](docs/getting-started.md) walks through both modes, sizing, and app-wide defaults.

## Documentation

Documentation lives under [`docs/`](docs/README.md); each feature guide is authoritative for its behavior.

| Document | Covers |
| --- | --- |
| [Getting started](docs/getting-started.md) | Install, stylesheet, first table, sugar vs hook mode, app-wide defaults |
| [Feature guides](docs/README.md#guides) | Sizing, columns, sorting, filtering, pagination, selection, editing, rows, grouping, pinning, virtualization, state, styling, i18n, accessibility |
| [API reference](docs/api.md) | The complete public surface: every option, prop, type, and utility, with defaults |
| [Recipes](docs/recipes.md) | Cross-feature patterns: server tables, URL sync, CSV download, fuzzy search, actions columns |
| [Architecture](docs/architecture.md) | Contributor internals: module map, invariants, testing strategy |
| [Design record](docs/DESIGN.md) | Vision, naming constitution, hard semantic rules, decision log, TanStack coverage |

## Repository layout

This is a pnpm-workspace monorepo:

| Package | Contents |
| --- | --- |
| [`@coldsmirk/ledger-mantine`](packages/mantine) | The `<DataTable>` component, `useDataTable` hook, compound components, `zhCN` locale, `toCsv`, and the layered stylesheet. |
| `ledger-playground` (private) | The [live demo](https://coldsmirk.github.io/ledger/), deployed to GitHub Pages on every release tag; `pnpm --filter ledger-playground dev` serves it against library sources. |

## Development

Node >= 24, pnpm (see `packageManager`).

```bash
pnpm install
pnpm test              # vitest, once; test:watch for the loop
pnpm typecheck         # root config files + every package
pnpm lint:check        # eslint (sealed @coldsmirk/eslint-config)
pnpm lint:css:check    # stylelint (kebab-case class contract, @coldsmirk/stylelint-config)
pnpm build             # tsdown, all packages
pnpm check:package     # publint + arethetypeswrong on the packed output
```

Releases are tag-driven — see [RELEASING.md](RELEASING.md).

## Contributing

Issues and pull requests are welcome. Before opening a PR:

- Read [docs/architecture.md](docs/architecture.md) for the module map and invariants, and [docs/DESIGN.md](docs/DESIGN.md) for the naming and API rules a change must respect.
- Run the full gate locally: `pnpm typecheck && pnpm lint:check && pnpm lint:css:check && pnpm test && pnpm build && pnpm check:package`.
- Commits follow single-line [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) (enforced by commitlint).

## License

[MIT](LICENSE)
