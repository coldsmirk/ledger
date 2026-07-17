# Getting started

`@coldsmirk/ledger-mantine` renders a Mantine-native `<DataTable>` on top of TanStack Table v8 (behavior) and TanStack Virtual v3 (row virtualization). One sentence teaches the whole API: **the behavior layer speaks TanStack's language, the presentation layer speaks Mantine's.**

## Installation

```bash
pnpm add @coldsmirk/ledger-mantine
```

Peer dependencies (the host application provides them):

| Peer | Range |
| --- | --- |
| `@mantine/core` | `^9.0.0` |
| `@mantine/dates` | `^9.0.0` (+ its own `dayjs` peer) — powers the `date-range` filter calendar |
| `@mantine/hooks` | `^9.0.0` |
| `react` / `react-dom` | `^19.2.0` (Mantine 9's own floor) |

`@tanstack/react-table` and `@tanstack/react-virtual` are **direct dependencies**, not peers — consumers import everything from `@coldsmirk/ledger-mantine` and never from `@tanstack/*`. Everything a table needs (`createColumnHelper`, `flexRender`, every state type) is re-exported from the main entry.

## Stylesheet

Import the stylesheet once, after Mantine's:

```tsx
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@coldsmirk/ledger-mantine/styles.css";
```

All rules live in the `ledger` [cascade layer](https://developer.mozilla.org/en-US/docs/Web/CSS/@layer) and consume only Mantine CSS variables, so dark mode and RTL follow the host theme automatically. See [styling.md](styling.md).

## First table

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

Three things worth noticing:

- **Columns are raw TanStack `ColumnDef`s** — every TanStack column capability works unchanged. Presentation concerns (`align`, `truncate`, filter and editor wiring) ride the typed `meta` extension. See [columns.md](columns.md).
- **`getRowId` should return a stable id** whenever rows carry state (selection, expansion, editing). Index-based ids corrupt state across refetches; a dev-mode warning fires if selection or expansion is enabled without it.
- **`data` and `columns` need stable identities.** A fresh array on every render re-initializes the table continuously (the classic TanStack pitfall); memoize them, or define columns at module scope. A dev-mode warning detects per-render column churn.

Sorting, the per-column menu, and column pinning/hiding are enabled out of the box; everything else (`enableRowSelection`, `enablePagination`, `virtualized`, …) is one switch away. Defaults are catalogued in [api.md](api.md).

## Sizing: give it a place, not a height

The root fills whatever space its parent gives it and scrolls internally — it behaves like a well-mannered flex item, not a fixed-height widget:

```tsx
<Stack h="100vh">
  <Toolbar />                       {/* rigid */}
  <DataTable flex={1} mih={0} … />  {/* takes the remaining space, scrolls inside */}
</Stack>
```

There are no `height`/`maxHeight` props — the root extends Mantine `BoxProps`, so `h`, `mah`, `mih`, `w`, and `flex` are already the sizing vocabulary. The full contract (including content-height degradation and column width rules) is in [sizing.md](sizing.md).

## Two usage modes

**Sugar mode** — pass behavior options and presentation props to the component; it calls `useDataTable` internally. This is the default for ordinary pages.

**Hook mode** — create the instance yourself, then hand it to `<DataTable table={…}>` and compose the compound components anywhere. ledger deliberately ships no toolbar: toolbars are the page's territory.

```tsx
import { DataTable, useDataTable } from "@coldsmirk/ledger-mantine";

function PeoplePage({ people }: { people: Person[] }) {
  const table = useDataTable({
    data: people,
    columns,
    getRowId: person => person.id,
    enableGlobalFilter: true,
    enablePagination: true
  });

  return (
    <Stack flex={1} mih={0}>
      <Group justify="space-between">
        <DataTable.Search table={table} w={260} />
        <DataTable.ColumnsMenu table={table} />
      </Group>

      <DataTable table={table} flex={1} mih={0} withPaginationBar={false} />

      <DataTable.Pagination table={table} />
    </Stack>
  );
}
```

`table` and `data`/`columns` are mutually exclusive at the type level; sugar mode degrades to hook mode with zero rewrites because both share the same options. `useDataTable` returns the **bare TanStack `Table` instance** (exported as `TableInstance`) — the full TanStack API is available on it, and the escape hatch never disagrees with the props.

## App-wide defaults and locale

Configuration is the Mantine-native mechanism — theme `defaultProps` via `DataTable.extend()`, no extra provider:

```tsx
import { DataTable } from "@coldsmirk/ledger-mantine";
import { zhCN } from "@coldsmirk/ledger-mantine/locales";
import { createTheme } from "@mantine/core";

const theme = createTheme({
  components: {
    DataTable: DataTable.extend({
      defaultProps: { labels: zhCN, highlightOnHover: true, verticalSpacing: "sm" }
    })
  }
});
```

Every user-visible string flows through `labels` (English defaults, complete `zhCN` preset). See [i18n.md](i18n.md).

## Where to go next

- Feature guides: [columns](columns.md), [sorting](sorting.md), [filtering](filtering.md), [pagination](pagination.md), [selection](selection.md), [editing](editing.md), [rows](rows.md), [grouping](grouping.md), [pinning](pinning.md), [virtualization](virtualization.md)
- The state model, server modes, and escape hatches: [state.md](state.md)
- Styling and theming: [styling.md](styling.md)
- The complete prop/type reference: [api.md](api.md)
- Runnable demos: `packages/playground` (`pnpm --filter ledger-playground dev`), one page per feature area
