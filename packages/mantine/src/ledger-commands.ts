import type { RowData } from "@tanstack/react-table";

import type { SortToggleSpec } from "./toggle-fns";
import type { LedgerMeta } from "./types";
import type { LedgerExpansionController, LedgerSelectionController } from "./use-row-commands";

/**
 * The row-state toggles, kept off the public `LedgerMeta`.
 *
 * `LedgerMeta` is exported and documented (docs/api.md) — it is what an application reads when it
 * reaches into `table.options.meta.ledger`. These controllers are ledger's own plumbing between
 * the hook and its controls, so they ride the same object without being part of that contract:
 * `useDataTable` builds a `LedgerInternalMeta`, and the few internal readers ask for them by way
 * of `ledgerCommands`.
 */

export interface LedgerSortingController {
  toggle: (spec: SortToggleSpec, multi: boolean) => void;
}

export interface LedgerCommands {
  sorting: LedgerSortingController;
  selection: LedgerSelectionController;
  expansion: LedgerExpansionController;
}

export type LedgerInternalMeta<TData extends RowData> = LedgerCommands & LedgerMeta<TData>;

export function ledgerCommands(meta: LedgerMeta<any> | undefined): LedgerCommands | undefined {
  return meta as LedgerInternalMeta<any> | undefined;
}
