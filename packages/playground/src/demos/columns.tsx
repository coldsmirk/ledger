import type { Person } from "../data";

/**
 * The column set shared by several demos, built once with the re-exported column helper.
 *
 * It is a hook rather than a module constant because the headers are translated: column defs
 * have to be rebuilt when the language changes, or the table keeps rendering the old headers.
 * `useMemo` on the copy object is the whole trick — TanStack still sees one stable array per
 * language.
 */
import { createColumnHelper } from "@coldsmirk/ledger-mantine";
import { Badge } from "@mantine/core";
import { useMemo } from "react";

import { useCopy } from "../i18n";

const copy = {
  en: {
    name: "Name",
    email: "Email",
    role: "Role",
    status: "Status",
    age: "Age",
    balance: "Balance",
    joinedAt: "Joined",
    statuses: {
      active: "Active",
      invited: "Invited",
      suspended: "Suspended"
    }
  },
  zh: {
    name: "姓名",
    email: "邮箱",
    role: "角色",
    status: "状态",
    age: "年龄",
    balance: "余额",
    joinedAt: "入职日期",
    statuses: {
      active: "活跃",
      invited: "已邀请",
      suspended: "已停用"
    }
  }
};

const color: Record<Person["status"], string> = {
  active: "teal",
  invited: "blue",
  suspended: "red"
};

export function StatusBadge({ status }: { status: Person["status"] }) {
  const t = useCopy(copy);

  return (
    <Badge color={color[status]} size="sm" variant="light">
      {t.statuses[status]}
    </Badge>
  );
}

const helper = createColumnHelper<Person>();

export function usePersonColumns() {
  const t = useCopy(copy);

  return useMemo(() => [
    helper.accessor("name", {
      header: t.name,
      size: 120,
      meta: { filter: "text" }
    }),
    helper.accessor("email", {
      header: t.email,
      meta: { truncate: true, filter: "text" }
    }),
    helper.accessor("role", {
      header: t.role,
      size: 130,
      meta: { filter: "select" }
    }),
    helper.accessor("status", {
      header: t.status,
      size: 110,
      cell: context => <StatusBadge status={context.getValue()} />,
      meta: {
        filter: {
          variant: "multi-select",
          options: Object.entries(t.statuses).map(([value, label]) => {
            return { value, label };
          })
        },
        // The CSV should carry the human label the Badge shows, not the enum value.
        export: { value: row => t.statuses[row.original.status] }
      }
    }),
    helper.accessor("age", {
      header: t.age,
      size: 90,
      meta: { align: "end", filter: "range" }
    }),
    helper.accessor("balance", {
      header: t.balance,
      size: 120,
      cell: context => context.getValue().toFixed(2),
      meta: { align: "end" }
    }),
    helper.accessor("joinedAt", {
      header: t.joinedAt,
      size: 140,
      sortDescFirst: true,
      meta: { filter: "date-range" }
    })
  ], [t]);
}
