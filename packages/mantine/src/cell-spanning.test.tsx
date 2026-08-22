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
        virtualized
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
