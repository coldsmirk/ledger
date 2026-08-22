import type { Person } from "../data";

/**
 * The column set shared by several demos, built once with the re-exported column helper.
 */
import { createColumnHelper } from "@coldsmirk/ledger-mantine";
import { Badge } from "@mantine/core";

const color: Record<Person["status"], string> = {
  active: "teal",
  invited: "blue",
  suspended: "red"
};

const label: Record<Person["status"], string> = {
  active: "活跃",
  invited: "已邀请",
  suspended: "已停用"
};

export function StatusBadge({ status }: { status: Person["status"] }) {
  return (
    <Badge color={color[status]} size="sm" variant="light">
      {label[status]}
    </Badge>
  );
}

const helper = createColumnHelper<Person>();

export const personColumns = [
  helper.accessor("name", {
    header: "姓名",
    size: 120,
    meta: { filter: "text" }
  }),
  helper.accessor("email", {
    header: "邮箱",
    meta: { truncate: true, filter: "text" }
  }),
  helper.accessor("role", {
    header: "角色",
    size: 130,
    meta: { filter: "select" }
  }),
  helper.accessor("status", {
    header: "状态",
    size: 110,
    cell: context => <StatusBadge status={context.getValue()} />,
    meta: {
      filter: { variant: "multi-select", options: Object.entries(label).map(([value, text]) => { return { value, label: text }; }) },
      // The CSV should carry the human label the Badge shows, not the enum value.
      export: { value: row => label[row.original.status] }
    }
  }),
  helper.accessor("age", {
    header: "年龄",
    size: 90,
    meta: { align: "end", filter: "range" }
  }),
  helper.accessor("balance", {
    header: "余额",
    size: 120,
    cell: context => context.getValue().toFixed(2),
    meta: { align: "end" }
  }),
  helper.accessor("joinedAt", {
    header: "入职日期",
    size: 140,
    sortDescFirst: true,
    meta: { filter: "date-range" }
  })
];
