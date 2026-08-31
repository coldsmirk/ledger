import type { ReactNode } from "react";

import type { ColumnDef } from "./types";

import { MantineProvider } from "@mantine/core";
import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";

import { DataTable } from "./data-table";

interface Entry {
  id: string;
  dept: string;
  name: string;
}

const entries: Entry[] = [
  {
    id: "1",
    dept: "Design",
    name: "Carol"
  },
  {
    id: "2",
    dept: "Design",
    name: "Alice"
  },
  {
    id: "3",
    dept: "Ops",
    name: "Bob"
  }
];

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <MantineProvider>{children}</MantineProvider>
    </StrictMode>
  );
}

const rowsOf = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>(":scope .ledger-tbody .ledger-row")];

describe("cell spanning", () => {
  it("marks a run that reaches the last row as the body's bottom edge", () => {
    const columns: Array<ColumnDef<Entry, any>> = [
      {
        accessorKey: "dept",
        header: "Department",
        spanRows: true
      },
      { accessorKey: "name", header: "Name" }
    ];
    const data: Entry[] = [
      {
        id: "1",
        dept: "Design",
        name: "Carol"
      },
      {
        id: "2",
        dept: "Ops",
        name: "Alice"
      },
      {
        id: "3",
        dept: "Ops",
        name: "Bob"
      }
    ];

    const { container } = render(
      <DataTable columns={columns} data={data} getRowId={entry => entry.id} />,
      { wrapper }
    );

    const rows = rowsOf(container);
    const dept = (index: number) => rows[index]?.querySelector<HTMLTableCellElement>(":scope td[data-ledger-column-id=\"dept\"]");

    // The Ops run anchors on the middle row and ends on the last: its anchor shares the bottom
    // edge, while the row it sits on is not itself last.
    expect(dept(1)?.rowSpan).toBe(2);
    expect(dept(1)?.hasAttribute("data-last")).toBe(true);
    expect(rows[1]?.hasAttribute("data-last")).toBe(false);
    expect(rows[2]?.hasAttribute("data-last")).toBe(true);
    // A single-row cell above keeps its separator.
    expect(dept(0)?.hasAttribute("data-last")).toBe(false);
  });

  it("merges adjacent equal cells into one row-spanning cell and skips the covered ones", () => {
    const columns: Array<ColumnDef<Entry, any>> = [
      {
        accessorKey: "dept",
        header: "Department",
        spanRows: true
      },
      { accessorKey: "name", header: "Name" }
    ];

    const { container } = render(
      <DataTable columns={columns} data={entries} getRowId={entry => entry.id} />,
      { wrapper }
    );

    const rows = rowsOf(container);
    expect(rows).toHaveLength(3);

    const firstDept = rows[0]?.querySelector<HTMLTableCellElement>(":scope td[data-ledger-column-id=\"dept\"]");
    expect(firstDept?.rowSpan).toBe(2);
    expect(firstDept?.getAttribute("aria-rowspan")).toBe("2");

    // The covered cell renders nothing — the anchor's rowSpan owns the grid slot.
    expect(rows[1]?.querySelectorAll(":scope td")).toHaveLength(1);
    expect(rows[2]?.querySelectorAll(":scope td")).toHaveLength(2);
  });

  it("marks the leading column by display position, not by DOM position", () => {
    // A covered cell renders nothing, so the next cell in the row becomes `:first-child` while
    // sitting in the middle of the table. Column borders key on `data-leading` because of it —
    // otherwise every row under a merged run loses a border it should have.
    const columns: Array<ColumnDef<Entry, any>> = [
      {
        accessorKey: "dept",
        header: "Department",
        spanRows: true
      },
      { accessorKey: "name", header: "Name" }
    ];

    const { container } = render(
      <DataTable withColumnBorders columns={columns} data={entries} getRowId={entry => entry.id} />,
      { wrapper }
    );

    const rows = rowsOf(container);
    const covered = rows[1]?.querySelector<HTMLElement>(":scope td");

    // Row 2 renders only "name": first in the DOM, second in the table.
    expect(covered?.dataset.ledgerColumnId).toBe("name");
    expect(covered?.matches(":first-child")).toBe(true);
    expect(covered?.hasAttribute("data-leading")).toBe(false);

    // The real leading column keeps the marker wherever it renders.
    expect(rows[0]?.querySelector(":scope td[data-ledger-column-id=\"dept\"]")?.hasAttribute("data-leading")).toBe(true);
    expect(rows[0]?.querySelector(":scope td[data-ledger-column-id=\"name\"]")?.hasAttribute("data-leading")).toBe(false);
  });

  it("spans columns per row and drops the covered trailing cells", () => {
    const columns: Array<ColumnDef<Entry, any>> = [
      {
        accessorKey: "dept",
        header: "Department",
        spanColumns: ({ row }) => row.original.name === "Bob" ? Infinity : 1
      },
      { accessorKey: "name", header: "Name" }
    ];

    const { container } = render(
      <DataTable columns={columns} data={entries} getRowId={entry => entry.id} />,
      { wrapper }
    );

    const rows = rowsOf(container);
    const summaryCells = rows[2]?.querySelectorAll<HTMLTableCellElement>(":scope td");

    expect(summaryCells).toHaveLength(1);
    expect(summaryCells?.[0]?.colSpan).toBe(2);
    expect(rows[0]?.querySelectorAll(":scope td")).toHaveLength(2);
  });

  it("ignores spanning while virtualized", () => {
    const columns: Array<ColumnDef<Entry, any>> = [
      {
        accessorKey: "dept",
        header: "Department",
        spanRows: true
      },
      { accessorKey: "name", header: "Name" }
    ];

    const { container } = render(
      <DataTable
        virtualizedRows
        columns={columns}
        data={entries}
        getRowId={entry => entry.id}
      />,
      { wrapper }
    );

    for (const row of rowsOf(container)) {
      expect(row.querySelectorAll(":scope td")).toHaveLength(2);
    }

    expect(container.querySelector(":scope td[rowspan]")).toBeNull();
  });
});
