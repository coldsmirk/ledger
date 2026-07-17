import type { Person } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { Text } from "@mantine/core";
import { useMemo } from "react";

import { makePeople } from "../data";
import { StatusBadge } from "./columns";

const helper = createColumnHelper<Person>();

const columns = [
  helper.accessor("role", { header: "角色（列菜单可分组/取消）", size: 200 }),
  helper.accessor("name", {
    header: "姓名",
    size: 140,
    enableGrouping: false
  }),
  helper.accessor("status", {
    header: "状态",
    size: 120,
    enableGrouping: false,
    cell: context => <StatusBadge status={context.getValue()} />
  }),
  helper.accessor("balance", {
    header: "余额（分组求和）",
    size: 170,
    enableGrouping: false,
    aggregationFn: "sum",
    cell: context => context.getValue().toFixed(2),
    aggregatedCell: context => (
      <Text span fw={600} size="sm">
        Σ
        {" "}
        {Number(context.getValue()).toFixed(2)}
      </Text>
    ),
    meta: { align: "end" }
  })
];

export function GroupingDemo() {
  const data = useMemo(() => makePeople(60), []);

  return (
    <>
      <Text c="dimmed" size="xs">
        默认按角色分组；前两行被钉在表头下方（rowPinning）。
      </Text>

      <DataTable
        defaultExpanded
        enableGrouping
        enableRowPinning
        tabularNums
        withTableBorder
        columns={columns}
        data={data}
        defaultGrouping={["role"]}
        defaultRowPinning={{ top: ["p-1", "p-2"], bottom: [] }}
        flex={1}
        getRowId={person => person.id}
        mih={0}
      />
    </>
  );
}
