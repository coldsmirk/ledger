import type { ColumnWidthSpec } from "./use-column-widths";

import { describe, expect, it } from "vitest";

import { resolveColumnWidths } from "./use-column-widths";

function spec(id: string, sizing: { size?: number; minSize?: number; maxSize?: number } = {}): ColumnWidthSpec {
  return {
    id,
    size: sizing.size,
    minSize: sizing.minSize,
    maxSize: sizing.maxSize
  };
}

describe("resolveColumnWidths", () => {
  it("distributes surplus to grow columns proportionally to their bases", () => {
    // fixed 100; grow bases 100 + 300; available 1000 → surplus 500 split 1:3.
    const widths = resolveColumnWidths(
      [spec("a", { size: 100 }), spec("b", { minSize: 100 }), spec("c", { minSize: 300 })],
      {},
      1000
    );

    expect(widths.byId).toEqual({
      a: 100,
      b: 225,
      c: 675
    });
    expect(widths.total).toBe(1000);
  });

  it("gives the first grow column the integer remainder so the total is exact", () => {
    // surplus 100 over bases 80+80+80: floor shares 33/33, first absorbs 34.
    const widths = resolveColumnWidths([spec("a"), spec("b"), spec("c")], {}, 340);

    expect(widths.byId).toEqual({
      a: 114,
      b: 113,
      c: 113
    });
    expect(widths.total).toBe(340);
  });

  it("falls back to bases and overflows when the container is too small", () => {
    const widths = resolveColumnWidths(
      [spec("a", { size: 200 }), spec("b", { minSize: 120 })],
      {},
      250
    );

    expect(widths.byId).toEqual({
      a: 200,
      b: 120
    });
    expect(widths.total).toBe(320);
  });

  it("fills the container proportionally when every column is fixed", () => {
    // No grow columns: 100+300 into 800 keeps the 1:3 ratio instead of leaving a gap.
    const widths = resolveColumnWidths(
      [spec("a", { size: 100 }), spec("b", { size: 300 })],
      {},
      800
    );

    expect(widths.byId).toEqual({
      a: 200,
      b: 600
    });
    expect(widths.total).toBe(800);
  });

  it("lets columnSizing entries override the definition and clamps to min/max", () => {
    const widths = resolveColumnWidths(
      [
        spec("a", {
          size: 100,
          minSize: 80,
          maxSize: 160
        }),
        spec("b", { size: 50, minSize: 60 })
      ],
      { a: 500 },
      0
    );

    expect(widths.byId).toEqual({
      a: 160,
      b: 60
    });
  });

  it("resolves to bases in unmeasured environments (available width 0)", () => {
    const widths = resolveColumnWidths([spec("a"), spec("b", { minSize: 200 })], {}, 0);

    expect(widths.byId).toEqual({
      a: 80,
      b: 200
    });
    expect(widths.total).toBe(280);
  });
});
