import type { ColumnDef } from "./types";

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { toCsv } from "./csv";
import { useDataTable } from "./use-data-table";

interface Order {
  id: string;
  customer: string;
  total: number;
}

const orders: Order[] = [
  {
    id: "1",
    customer: "Says \"hi\", ok",
    total: 12.5
  },
  {
    id: "2",
    customer: "Plain",
    total: 3
  }
];

const columns: Array<ColumnDef<Order, any>> = [
  { accessorKey: "customer", header: "Customer" },
  { accessorKey: "total", header: "Total" },
  { id: "actions", cell: () => null }
];

describe("toCsv", () => {
  it("exports accessor columns with RFC 4180 quoting and skips display columns", () => {
    const { result } = renderHook(() => useDataTable({
      data: orders,
      columns,
      getRowId: order => order.id
    }));

    const csv = toCsv(result.current);

    expect(csv).toBe(
      ["Customer,Total", "\"Says \"\"hi\"\", ok\",12.5", "Plain,3"].join("\r\n")
    );
  });

  it("honors the selected scope and a custom delimiter", () => {
    const { result } = renderHook(() => useDataTable({
      data: orders,
      columns,
      getRowId: order => order.id,
      enableRowSelection: true
    }));

    act(() => result.current.setRowSelection({ 2: true }));

    const csv = toCsv(result.current, {
      scope: "selected",
      delimiter: ";",
      withHeaders: false
    });

    expect(csv).toBe("Plain;3");
  });

  it("exports columns in pinned-aware display order", () => {
    const { result } = renderHook(() => useDataTable({
      data: orders,
      columns,
      getRowId: order => order.id,
      defaultColumnPinning: { start: [], end: ["customer"] }
    }));

    expect(toCsv(result.current).split("\r\n", 1)[0]).toBe("Total,Customer");
  });

  it("defuses formula-leading text only under escapeFormulas", () => {
    const risky: Order[] = [
      {
        id: "1",
        customer: "=SUM(A1:A9)",
        total: -5
      },
      {
        id: "2",
        customer: "+86 555 0100",
        total: 3
      }
    ];

    const { result } = renderHook(() => useDataTable({
      data: risky,
      columns,
      getRowId: order => order.id
    }));

    // Off by default — the prefix quote is data to every non-spreadsheet consumer.
    expect(toCsv(result.current)).toBe(
      ["Customer,Total", "=SUM(A1:A9),-5", "+86 555 0100,3"].join("\r\n")
    );

    // On: string cells gain the OWASP `'` prefix; the numeric -5 keeps its sign.
    expect(toCsv(result.current, { escapeFormulas: true })).toBe(
      ["Customer,Total", "'=SUM(A1:A9),-5", "'+86 555 0100,3"].join("\r\n")
    );
  });

  it("defuses formula-leading header text and quotes after defusing", () => {
    const trapColumns: Array<ColumnDef<Order, any>> = [
      { accessorKey: "customer", header: "=Customer" },
      { accessorKey: "total", header: "Total" }
    ];
    const risky: Order[] = [
      {
        id: "1",
        customer: "@cmd, run",
        total: 1
      }
    ];

    const { result } = renderHook(() => useDataTable({
      data: risky,
      columns: trapColumns,
      getRowId: order => order.id
    }));

    expect(toCsv(result.current, { escapeFormulas: true })).toBe(
      ["'=Customer,Total", "\"'@cmd, run\",1"].join("\r\n")
    );
  });
});
