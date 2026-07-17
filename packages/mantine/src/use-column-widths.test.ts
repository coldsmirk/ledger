import type { ColumnDef } from "@tanstack/react-table";

import type { ColumnWidthSpec } from "./use-column-widths";

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { resolveColumnWidths, useColumnWidths } from "./use-column-widths";
import { useDataTable } from "./use-data-table";

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

  it("respects maxSize while redistributing grow-column surplus", () => {
    const widths = resolveColumnWidths(
      [
        spec("a", { minSize: 100, maxSize: 110 }),
        spec("b", { minSize: 100 }),
        spec("c", { minSize: 300 })
      ],
      {},
      1000
    );

    expect(widths.byId).toEqual({
      a: 110,
      b: 223,
      c: 667
    });
    expect(widths.total).toBe(1000);
  });

  it("never expands fixed columns past maxSize just to fill the viewport", () => {
    const widths = resolveColumnWidths(
      [
        spec("select", {
          size: 40,
          minSize: 40,
          maxSize: 40
        }),
        spec("name", { size: 160, maxSize: 240 })
      ],
      {},
      1000
    );

    expect(widths.byId).toEqual({
      select: 40,
      name: 240
    });
    expect(widths.total).toBe(280);
  });

  it("falls back to equal distribution when every grow basis is zero", () => {
    const widths = resolveColumnWidths(
      [spec("a", { minSize: 0 }), spec("b", { minSize: 0 })],
      {},
      100
    );

    expect(widths.byId).toEqual({ a: 50, b: 50 });
    expect(widths.total).toBe(100);
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

describe("useColumnWidths", () => {
  it("does not reuse geometry when delimiter-bearing column ids change", () => {
    interface RowData {
      value: string;
    }

    const firstColumns: Array<ColumnDef<RowData>> = [
      {
        id: "a",
        accessorKey: "value",
        size: 20
      },
      {
        id: "b:20,c",
        accessorKey: "value",
        size: 30
      }
    ];
    const secondColumns: Array<ColumnDef<RowData>> = [
      {
        id: "a:20,b",
        accessorKey: "value",
        size: 20
      },
      {
        id: "c",
        accessorKey: "value",
        size: 30
      }
    ];
    const { result, rerender } = renderHook(
      ({ columns }: { columns: Array<ColumnDef<RowData>> }) => {
        const table = useDataTable({ columns, data: [] });
        const displayColumns = [
          ...table.getLeftVisibleLeafColumns(),
          ...table.getCenterVisibleLeafColumns(),
          ...table.getRightVisibleLeafColumns()
        ];

        return useColumnWidths(table, displayColumns, null, undefined);
      },
      { initialProps: { columns: firstColumns } }
    );

    expect(result.current.byId).toEqual({ a: 20, "b:20,c": 30 });

    rerender({ columns: secondColumns });

    expect(result.current.byId).toEqual({ "a:20,b": 20, c: 30 });
  });
});
