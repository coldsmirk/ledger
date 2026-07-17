import type { ColumnDef, TableInstance } from "@coldsmirk/ledger-mantine";

import type { Person } from "../data";

import { DataTable } from "@coldsmirk/ledger-mantine";
import { useMemo } from "react";

import { makePeople } from "../data";
import { personColumns } from "./columns";

function balanceTotal(table: TableInstance<Person>) {
  const total = table
    .getFilteredRowModel()
    .rows
    .reduce((sum, row) => sum + row.getValue<number>("balance"), 0);

  return `合计 ${total.toFixed(2)}`;
}

export function BasicDemo() {
  const data = useMemo(() => makePeople(60), []);

  // The totals row renders in the always-visible footer region below the scroller.
  const columns = useMemo<Array<ColumnDef<Person, any>>>(
    () => personColumns.map(column => "accessorKey" in column && column.accessorKey === "balance"
      ? { ...column, footer: ({ table }) => balanceTotal(table) }
      : column),
    []
  );

  return (
    <DataTable
      striped
      tabularNums
      withTableBorder
      columns={columns}
      data={data}
      defaultSorting={[{ id: "joinedAt", desc: true }]}
      flex={1}
      getRowId={person => person.id}
      mih={0}
    />
  );
}
