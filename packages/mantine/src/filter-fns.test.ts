import type { FilterFn, Row } from "@tanstack/react-table";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ledgerFilterFns } from "./filter-fns";

function matches(filterFn: FilterFn<unknown>, value: unknown, filterValue: unknown): boolean {
  const row = { getValue: () => value } as unknown as Row<unknown>;

  return filterFn(row, "value", filterValue, () => undefined);
}

afterEach(() => vi.unstubAllEnvs());

describe("ledger filter functions", () => {
  it("matches both scalar and array cells by strict multi-select membership", () => {
    const oneOf = ledgerFilterFns["ledger-one-of"];

    expect(matches(oneOf, "red", ["red"])).toBe(true);
    expect(matches(oneOf, "infrared", ["red"])).toBe(false);
    expect(matches(oneOf, ["red", "blue"], ["red"])).toBe(true);
    expect(matches(oneOf, ["infrared", "blue"], ["red"])).toBe(false);
  });

  it("uses local calendar-day boundaries across a DST transition", () => {
    vi.stubEnv("TZ", "America/New_York");
    const dateRange = ledgerFilterFns["ledger-date-range"];
    const selectedDay = "2026-03-08";

    expect(matches(dateRange, new Date(2026, 2, 8, 23, 30), [selectedDay, selectedDay])).toBe(true);
    expect(matches(dateRange, new Date(2026, 2, 9, 0, 30), [selectedDay, selectedDay])).toBe(false);
  });

  it("keeps full timestamp bounds exact instead of ignoring them", () => {
    const dateRange = ledgerFilterFns["ledger-date-range"];

    expect(matches(
      dateRange,
      "2026-07-10T12:00:00Z",
      ["2026-07-15T00:00:00Z", null]
    )).toBe(false);
    expect(matches(
      dateRange,
      "2026-07-16T00:00:00Z",
      [null, "2026-07-15T23:59:59Z"]
    )).toBe(false);
    expect(matches(
      dateRange,
      "2026-07-15T23:59:59Z",
      [null, "2026-07-15T23:59:59Z"]
    )).toBe(true);
  });
});
