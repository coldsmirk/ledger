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
    minSize: 120
  },
  {
    // The classic responsive pair: below md one column carries the summary, and from md up it
    // steps aside for the real columns. `hiddenFrom` / `visibleFrom` are Box vocabulary, and
    // the column is removed from the table rather than merely hidden with CSS.
    id: "summary",
    accessorFn: person => `${person.role} · ${person.email}`,
    header: "角色 / 邮箱",
    minSize: 200,
    enableSorting: false,
    meta: {
      hiddenFrom: "md",
      truncate: true
    }
  },
  {
    accessorKey: "role",
    header: "角色",
    size: 140,
    meta: { visibleFrom: "md" }
  },
  {
    accessorKey: "email",
    header: "邮箱",
    minSize: 200,
    meta: {
      visibleFrom: "md",
      truncate: true
    }
  },
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
      columns={columns}
      data={data}
      defaultSorting={[{ id: "joinedAt", desc: true }]}
      flex={1}
      getRowId={person => person.id}
      mih={0}
    />
  );
}
