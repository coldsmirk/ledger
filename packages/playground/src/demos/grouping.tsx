import type { Person } from "../data";

import { createColumnHelper, DataTable, useDataTable } from "@coldsmirk/ledger-mantine";
import { zhCN } from "@coldsmirk/ledger-mantine/locales";
import { Button, Group, Text } from "@mantine/core";
import { useMemo } from "react";

import { makePeople } from "../data";
import { StatusBadge } from "./columns";

const helper = createColumnHelper<Person>();

const columns = [
  helper.accessor("role", { header: "角色（列设置里可分组）", size: 200 }),
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

  const table = useDataTable({
    data,
    columns,
    getRowId: person => person.id,
    enableGrouping: true,
    enableRowPinning: true,
    defaultExpanded: true,
    defaultGrouping: ["role"],
    defaultRowPinning: { top: ["p-1", "p-2"], bottom: [] }
  });

  return (
    <>
      <Group justify="space-between" wrap="nowrap">
        <Text c="dimmed" size="xs">
          默认按角色分组；前两行被钉在表头下方（rowPinning）。分组开关在列设置面板里，只对可分组的列出现。
        </Text>

        <DataTable.ColumnsPanel labels={zhCN} table={table}>
          <Button size="xs" variant="default">
            列设置
          </Button>
        </DataTable.ColumnsPanel>
      </Group>

      <DataTable tabularNums flex={1} mih={0} table={table} />
    </>
  );
}
