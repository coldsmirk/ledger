import type { ColumnDef } from "@coldsmirk/ledger-mantine";

import type { Person } from "../data";

import { DataTable } from "@coldsmirk/ledger-mantine";
import { useMemo } from "react";

import { makePeople } from "../data";
import { useCopy, useLang } from "../i18n";

const copy = {
  en: {
    name: "Name",
    summary: "Role / Email",
    role: "Role",
    email: "Email",
    age: "Age",
    joinedAt: "Joined"
  },
  zh: {
    name: "姓名",
    summary: "角色 / 邮箱",
    role: "角色",
    email: "邮箱",
    age: "年龄",
    joinedAt: "入职日期"
  }
};

/* The smallest useful table: raw TanStack column defs + data; everything else is defaults. */
export function BasicDemo() {
  const t = useCopy(copy);
  const { lang } = useLang();
  const data = useMemo(() => makePeople(lang, 30), [lang]);

  const columns = useMemo((): Array<ColumnDef<Person, any>> => [
    {
      accessorKey: "name",
      header: t.name,
      minSize: 120
    },
    {
      // The classic responsive pair: below md one column carries the summary, and from md up it
      // steps aside for the real columns. `hiddenFrom` / `visibleFrom` are Box vocabulary, and
      // the column is removed from the table rather than merely hidden with CSS.
      id: "summary",
      accessorFn: person => `${person.role} · ${person.email}`,
      header: t.summary,
      minSize: 200,
      enableSorting: false,
      meta: {
        hiddenFrom: "md",
        truncate: true
      }
    },
    {
      accessorKey: "role",
      header: t.role,
      size: 140,
      meta: { visibleFrom: "md" }
    },
    {
      accessorKey: "email",
      header: t.email,
      minSize: 200,
      meta: {
        visibleFrom: "md",
        truncate: true
      }
    },
    {
      accessorKey: "age",
      header: t.age,
      size: 100,
      meta: { align: "end" }
    },
    {
      accessorKey: "joinedAt",
      header: t.joinedAt,
      size: 140
    }
  ], [t]);

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
