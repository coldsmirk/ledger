# ledger

A Mantine-native `<DataTable>` built on [TanStack Table](https://tanstack.com/table) and [TanStack Virtual](https://tanstack.com/virtual).

Mantine deliberately ships no data grid; the community options either reimplement table logic from scratch or bury TanStack under a configuration bag. ledger takes a narrower stance: **the behavior layer speaks TanStack's language, the presentation layer speaks Mantine's** — raw `ColumnDef`s and verbatim state shapes on one side, forwarded `Table` style props, `BoxProps` sizing, and the Styles API on the other, rendered as a real `<table>` that fills whatever space its parent gives it.

> **Status: implemented, pre-release.** Documentation lives under [`docs/`](docs/README.md): [getting started](docs/getting-started.md), per-feature guides, the complete [API reference](docs/api.md), [recipes](docs/recipes.md), and [architecture notes](docs/architecture.md) for contributors. The founding design record — vision, naming constitution, hard semantic rules, decision log, TanStack coverage — is [`docs/DESIGN.md`](docs/DESIGN.md).

## Packages

| Package | Contents |
| --- | --- |
| [`@coldsmirk/ledger-mantine`](packages/mantine) | The `<DataTable>` component, `useDataTable` hook, compound components, `zhCN` locale, `toCsv`, and the layered stylesheet. |
| `ledger-playground` (private) | One demo page per feature area; `pnpm --filter ledger-playground dev` serves it against library sources. |

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
