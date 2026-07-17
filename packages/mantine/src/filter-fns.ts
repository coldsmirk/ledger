/**
 * The mapping from `meta.filter` variants to TanStack filter functions, plus the one custom
 * function the built-ins lack. A column keeps any `filterFn` it declares itself — the variant
 * mapping only fills the gap (docs/filtering.md).
 */
import type { FilterFn } from "@tanstack/react-table";

import type { DataTableFilterVariant } from "./types";

export type DateRangeFilterValue = [string | null, string | null];

/**
 * Inclusive [from, to] match over anything `new Date()` can parse; the `to` bound covers its
 * entire day so "2026-07-16 → 2026-07-16" matches every timestamp within that date.
 */
const dateRange: FilterFn<unknown> = (row, columnId, filterValue: DateRangeFilterValue) => {
  const raw = row.getValue(columnId);

  if (raw === null || raw === undefined || raw === "") {
    return false;
  }

  const time = new Date(raw as string | number | Date).getTime();

  if (Number.isNaN(time)) {
    return false;
  }

  const [from, to] = filterValue;

  if (from) {
    const fromTime = new Date(from).getTime();

    if (!Number.isNaN(fromTime) && time < fromTime) {
      return false;
    }
  }

  if (to) {
    const toTime = new Date(to).getTime() + 86_399_999;

    if (!Number.isNaN(toTime) && time > toTime) {
      return false;
    }
  }

  return true;
};

dateRange.autoRemove = (value: DateRangeFilterValue | undefined) => !value || (!value[0] && !value[1]);

/**
 * Strict set membership for the multi-select variant. TanStack's `arrIncludesSome` expects an
 * array row value and degrades to substring matching on scalars ("active" would match
 * "inactive") — the variant's semantics are "value is one of the chosen options", exactly.
 */
const oneOf: FilterFn<unknown> = (row, columnId, filterValue: string[]) => {
  const raw = row.getValue(columnId);

  if (raw === null || raw === undefined) {
    return false;
  }

  return filterValue.includes(String(raw));
};

oneOf.autoRemove = (value: string[] | undefined) => !value || value.length === 0;

export const ledgerFilterFns = {
  "ledger-date-range": dateRange,
  "ledger-one-of": oneOf
};

declare module "@tanstack/react-table" {
  interface FilterFns {
    "ledger-date-range": FilterFn<unknown>;
    "ledger-one-of": FilterFn<unknown>;
  }
}

export type LedgerFilterFnId
  = | "includesString"
    | "equalsString"
    | "inNumberRange"
    | "ledger-one-of"
    | "ledger-date-range";

/**
 * TanStack built-in (or ledger-registered) filter function id per filter variant.
 */
export const filterFnByVariant: Record<DataTableFilterVariant, LedgerFilterFnId> = {
  text: "includesString",
  select: "equalsString",
  "multi-select": "ledger-one-of",
  range: "inNumberRange",
  "date-range": "ledger-date-range"
};
