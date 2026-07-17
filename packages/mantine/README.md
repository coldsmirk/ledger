# @coldsmirk/ledger-mantine

A Mantine-native `<DataTable>` built on [TanStack Table](https://tanstack.com/table) and [TanStack Virtual](https://tanstack.com/virtual): sorting, filtering, pagination, row selection, column pinning/resizing/visibility, master–detail expansion, inline cell editing, and adaptive row virtualization — rendered as a real `<table>` with Mantine's table styling.

> **Status: pre-release.** The v1 API surface is frozen in [`docs/DESIGN.md`](../../docs/DESIGN.md); implementation is in progress. Nothing is published yet.

## Install

```bash
pnpm add @coldsmirk/ledger-mantine
```

```ts
import "@coldsmirk/ledger-mantine/styles.css";
```

Peer dependencies: `@mantine/core` / `@mantine/hooks` `^9`, `react` / `react-dom` `^19.2`.

## Design in one sentence

The behavior layer speaks TanStack's language (raw `ColumnDef`, verbatim state shapes, `enable*` switches), the presentation layer speaks Mantine's (forwarded `Table` style props, `BoxProps` sizing, Styles API) — see [`docs/DESIGN.md`](../../docs/DESIGN.md) for the full contract.
