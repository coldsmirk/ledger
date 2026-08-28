# ledger documentation

`@coldsmirk/ledger-mantine` — a Mantine-native `<DataTable>` on TanStack Table v9 and TanStack Virtual v3. One sentence teaches the whole API: **the behavior layer speaks TanStack's language, the presentation layer speaks Mantine's.**

Start with [getting-started.md](getting-started.md); the guides are grounded in the implemented behavior and each one is authoritative for its feature.

## Guides

| Doc | Covers |
| --- | --- |
| [getting-started.md](getting-started.md) | Install, stylesheet, first table, sugar vs hook mode, app-wide defaults |
| [sizing.md](sizing.md) | The adaptive sizing contract, the header/body split, column width model, `tableMinWidth` |
| [columns.md](columns.md) | `ColumnDef`s, the `meta` extension, header groups/footers, resizing, drag reordering, visibility, the columns panel, injected columns |
| [sorting.md](sorting.md) | Sort cycle, multi-sort, per-column knobs, server mode |
| [filtering.md](filtering.md) | Filter variants, faceted options, custom filter functions and UIs, global search, server mode |
| [pagination.md](pagination.md) | The pagination bar, standalone compound, server mode and the reset policy |
| [selection.md](selection.md) | Multi/single select, predicates, shift ranges, select-all scope, the selection bar |
| [editing.md](editing.md) | Inline editing: variants, validation, async commits, keyboard map, custom editors |
| [rows.md](rows.md) | Row interaction, master–detail panels, tree data, loading and empty states |
| [grouping.md](grouping.md) | Grouping and aggregation |
| [pinning.md](pinning.md) | Column pinning and row pinning |
| [virtualization.md](virtualization.md) | Row and column virtualization, infinite loading, `scrollToRow` / `scrollToColumn` |
| [state.md](state.md) | The slice trios, client/server modes, `tableOptions`, `meta.ledger`, the handle, `persistState`, dev guards |
| [styling.md](styling.md) | Forwarded props, Styles API selectors, DOM prop hooks, data-attributes, CSS variables, theming, dark/RTL |
| [i18n.md](i18n.md) | The label catalog and locales |
| [accessibility.md](accessibility.md) | The ARIA structure, naming the table, keyboard model, announced states, and the stated boundaries |

## Reference

| Doc | Covers |
| --- | --- |
| [api.md](api.md) | The complete public surface: every option, prop, type, and utility, with defaults |
| [recipes.md](recipes.md) | Cross-feature patterns: server tables, URL sync, CSV download, fuzzy search, actions columns — plus the playground demo map |

## Internal

| Doc | Covers |
| --- | --- |
| [architecture.md](architecture.md) | Contributor internals: module map, load-bearing pipelines and invariants, testing strategy, gates |
| [DESIGN.md](DESIGN.md) | The founding design record: vision, the naming constitution, hard semantic rules, decision log, TanStack coverage matrix |

Runnable examples live in `packages/playground` (`pnpm --filter ledger-playground dev`) — one demo page per feature area, resolving the library from TypeScript source. Each page runs in English or Simplified Chinese and shows its own source; see the [demo map](recipes.md#playground-demo-map).
