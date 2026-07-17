import type { ColumnDef } from "@tanstack/react-table";

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
      defaultColumnPinning: { right: ["customer"] }
    }));

    expect(toCsv(result.current).split("\r\n", 1)[0]).toBe("Total,Customer");
  });
});
