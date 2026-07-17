import type { ColumnDef } from "@coldsmirk/ledger-mantine";

import type { Person } from "../data";

import { DataTable } from "@coldsmirk/ledger-mantine";
import { useMemo } from "react";

import { makePeople } from "../data";

/* The smallest useful table: raw TanStack column defs + data; everything else is defaults. */
const columns: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "姓名",
    size: 140
  },
  {
    accessorKey: "role",
    header: "角色",
    size: 140
  },
  { accessorKey: "email", header: "邮箱" },
  {
    accessorKey: "age",
    header: "年龄",
    size: 100,
    meta: { align: "end" }
  },
  {
    accessorKey: "joinedAt",
    header: "入职日期",
    size: 140
  }
];

export function BasicDemo() {
  const data = useMemo(() => makePeople(30), []);

  return (
    <DataTable
      highlightOnHover
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
