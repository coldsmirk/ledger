import type { Person } from "../data";

import { createColumnHelper, DataTable, useDataTable } from "@coldsmirk/ledger-mantine";
import { Button, Group, Text } from "@mantine/core";
import { useMemo } from "react";

import { makePeople } from "../data";
import { useCopy, useLang } from "../i18n";
import { StatusBadge } from "./columns";

const copy = {
  en: {
    role: "Role (groupable from the panel)",
    name: "Name",
    status: "Status",
    balance: "Balance (summed per group)",
    columns: "Columns",
    hint: "Grouped by role to start with; the first two rows are pinned under the header (rowPinning). The grouping switch lives in the columns panel and only appears for columns that allow it."
  },
  zh: {
    role: "角色（列设置里可分组）",
    name: "姓名",
    status: "状态",
    balance: "余额（分组求和）",
    columns: "列设置",
    hint: "默认按角色分组；前两行被钉在表头下方（rowPinning）。分组开关在列设置面板里，只对可分组的列出现。"
  }
};

const helper = createColumnHelper<Person>();

export function GroupingDemo() {
  const t = useCopy(copy);
  const { lang } = useLang();
  const data = useMemo(() => makePeople(lang, 60), [lang]);

  const columns = useMemo(() => [
    helper.accessor("role", { header: t.role, size: 240 }),
    helper.accessor("name", {
      header: t.name,
      size: 140,
      enableGrouping: false
    }),
    helper.accessor("status", {
      header: t.status,
      size: 120,
      enableGrouping: false,
      cell: context => <StatusBadge status={context.getValue()} />
    }),
    helper.accessor("balance", {
      header: t.balance,
      size: 200,
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
  ], [t]);

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
          {t.hint}
        </Text>

        <DataTable.ColumnsPanel table={table}>
          <Button size="xs" variant="default">
            {t.columns}
          </Button>
        </DataTable.ColumnsPanel>
      </Group>

      <DataTable tabularNums flex={1} mih={0} table={table} />
    </>
  );
}
