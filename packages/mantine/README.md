# @coldsmirk/ledger-mantine

[![npm version](https://img.shields.io/npm/v/%40coldsmirk%2Fledger-mantine)](https://www.npmjs.com/package/@coldsmirk/ledger-mantine)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/coldsmirk/ledger/blob/main/LICENSE)

A Mantine-native `<DataTable>` built on [TanStack Table](https://tanstack.com/table) and [TanStack Virtual](https://tanstack.com/virtual): sorting, filtering, pagination, row selection, column pinning/resizing/visibility, master–detail expansion, tree data, grouping, inline editing, row reordering, and row/column virtualization — rendered as a real `<table>` with Mantine's table styling.

**Live demo:** [coldsmirk.github.io/ledger](https://coldsmirk.github.io/ledger/) — one page per feature area, each with a view-source drawer.

> Pre-1.0: the public surface is complete and documented, but minor releases may still contain breaking changes while the API settles.

## Installation

```bash
pnpm add @coldsmirk/ledger-mantine
```

Peer dependencies: `@mantine/core`, `@mantine/dates`, and `@mantine/hooks` `^9.0.0`; `react` and `react-dom` `^19.2.0`; and `dayjs` as required by `@mantine/dates`. `@tanstack/react-table` and `@tanstack/react-virtual` are direct dependencies — everything a table needs is re-exported from the main entry.

Import Mantine's styles and ledger's layered stylesheet once at the application entry point:

```tsx
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@coldsmirk/ledger-mantine/styles.css";
```

## First table

```tsx
import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";

interface Person {
  id: string;
  name: string;
  email: string;
}

const column = createColumnHelper<Person>();
const columns = [
  column.accessor("name", { header: "Name" }),
  column.accessor("email", { header: "Email", meta: { truncate: true } })
];

export function PeopleTable({ people }: { people: Person[] }) {
  return <DataTable columns={columns} data={people} getRowId={person => person.id} withTableBorder />;
}
```

## Design in one sentence

The behavior layer speaks TanStack's language (raw `ColumnDef`, verbatim state shapes, `enable*` switches), while the presentation layer speaks Mantine's (forwarded `Table` style props, `BoxProps` sizing, Styles API).

## Documentation

- [Getting started](https://github.com/coldsmirk/ledger/blob/main/docs/getting-started.md) — install, first table, sugar vs hook mode, app-wide defaults
- [Feature guides](https://github.com/coldsmirk/ledger/tree/main/docs) — one authoritative guide per feature area
- [API reference](https://github.com/coldsmirk/ledger/blob/main/docs/api.md) — the complete public surface with defaults
- [Recipes](https://github.com/coldsmirk/ledger/blob/main/docs/recipes.md) — server tables, URL sync, CSV download, and more

## License

[MIT](https://github.com/coldsmirk/ledger/blob/main/LICENSE)
