# @coldsmirk/ledger-mantine

A Mantine-native `<DataTable>` built on [TanStack Table](https://tanstack.com/table) and [TanStack Virtual](https://tanstack.com/virtual): sorting, filtering, pagination, row selection, column pinning/resizing/visibility, master–detail expansion, inline cell editing, and adaptive row virtualization — rendered as a real `<table>` with Mantine's table styling.

> **Status: implemented and pre-release.** The component, documentation, tests, build, and package validation gates are in place. The package has not been published to npm yet.

## Install

```bash
pnpm add @coldsmirk/ledger-mantine @mantine/core @mantine/dates @mantine/hooks dayjs react react-dom
```

Import Mantine's styles and ledger's layered stylesheet once at the application entry point:

```tsx
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@coldsmirk/ledger-mantine/styles.css";
```

Peer dependencies: `@mantine/core`, `@mantine/dates`, and `@mantine/hooks` `^9`; `react` and `react-dom` `^19.2`; and `dayjs` as required by `@mantine/dates`.

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

See the repository's [getting-started guide](https://github.com/coldsmirk/ledger/blob/main/docs/getting-started.md), [feature guides](https://github.com/coldsmirk/ledger/tree/main/docs), and [complete API reference](https://github.com/coldsmirk/ledger/blob/main/docs/api.md).
