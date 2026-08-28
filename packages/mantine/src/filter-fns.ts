/**
 * The mapping from `meta.filter` variants to TanStack filter functions, plus the one custom
 * function the built-ins lack. A column keeps any `filterFn` it declares itself — the variant
 * mapping only fills the gap (docs/filtering.md).
 *
 * The functions are registered on the canonical feature set (`ledger-features.ts`), which is
 * what makes their ids valid `filterFn` strings for consumers — v9 registry slots replace v8's
 * `FilterFns` declaration merging.
 */
import type { FilterFn } from "@tanstack/react-table";

import type { DataTableFilterVariant } from "./types";

export type DateRangeFilterValue = [string | null, string | null];

const DATE_ONLY = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/;

function localDayStart(value: string): number | undefined {
  const match = DATE_ONLY.exec(value);

  if (!match) {
    return undefined;
  }

  const year = Number(match.groups?.year);
  const month = Number(match.groups?.month) - 1;
  const day = Number(match.groups?.day);
  const date = new Date(year, month, day);

  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return undefined;
  }

  return date.getTime();
}

function dateValueTime(value: string | number | Date): number {
  if (typeof value === "string") {
    const localTime = localDayStart(value);

    if (localTime !== undefined) {
      return localTime;
    }
  }

  return new Date(value).getTime();
}

function parsedTime(value: string): number | undefined {
  const time = new Date(value).getTime();

  return Number.isNaN(time) ? undefined : time;
}

/**
 * Inclusive [from, to] match over anything `new Date()` can parse. Date-only values and bounds
 * use local calendar days; their upper bound is the next local midnight so DST days stay exact.
 * Full timestamp bounds retain their exact instant.
 */
const dateRange: FilterFn<any, any> = (row, columnId, filterValue: DateRangeFilterValue) => {
  const raw = row.getValue(columnId);

  if (raw === null || raw === undefined || raw === "") {
    return false;
  }

  if (!Array.isArray(filterValue)) {
    return false;
  }

  const time = dateValueTime(raw as string | number | Date);

  if (Number.isNaN(time)) {
    return false;
  }

  const [from, to] = filterValue;

  if (from) {
    const fromTime = localDayStart(from) ?? parsedTime(from);

    if (fromTime !== undefined && time < fromTime) {
      return false;
    }
  }

  if (to) {
    const localToTime = localDayStart(to);

    if (localToTime === undefined) {
      const toTime = parsedTime(to);

      if (toTime !== undefined && time > toTime) {
        return false;
      }
    } else {
      const nextDay = new Date(localToTime);
      nextDay.setDate(nextDay.getDate() + 1);

      if (time >= nextDay.getTime()) {
        return false;
      }
    }
  }

  return true;
};

dateRange.autoRemove = (value: DateRangeFilterValue | undefined) => !value || (!value[0] && !value[1]);

/**
 * Strict set membership for the multi-select variant. No TanStack built-in covers both cell
 * shapes exactly: `arrIncludesSome` rejects non-array row values outright, `arrHas` rejects
 * array cells, and `arrIncludes` substring-matches strings ("active" would match "inactive") —
 * the variant's semantics are exact membership for scalar and array cells.
 */
const oneOf: FilterFn<any, any> = (row, columnId, filterValue: string[]) => {
  const raw = row.getValue(columnId);

  if (raw === null || raw === undefined || !Array.isArray(filterValue)) {
    return false;
  }

  const values = Array.isArray(raw) ? raw : [raw];

  return values.some(value => value !== null && value !== undefined && filterValue.includes(String(value)));
};

oneOf.autoRemove = (value: string[] | undefined) => !value || value.length === 0;

export const ledgerFilterFns = {
  "ledger-date-range": dateRange,
  "ledger-one-of": oneOf
};

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
