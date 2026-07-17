import type { Person } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { ActionIcon, Text } from "@mantine/core";
import { useMemo } from "react";

import { makePeople } from "../data";
import { personColumns, StatusBadge } from "./columns";

const helper = createColumnHelper<Person>();

const columns = [
  ...personColumns,
  helper.accessor("status", {
    id: "status-copy",
    header: "状态（副本列）",
    size: 130,
    cell: context => <StatusBadge status={context.getValue()} />
  }),
  helper.display({
    id: "actions",
    header: "",
    size: 56,
    enableHiding: false,
    cell: () => (
      <ActionIcon size="sm" variant="subtle" onClick={event => event.stopPropagation()}>
        …
      </ActionIcon>
    )
  })
];

export function PinningDemo() {
  const data = useMemo(() => makePeople(80), []);

  return (
    <>
      <Text c="dimmed" size="xs">
        姓名钉左、操作列钉右；拖表头重排、拖右缘改宽（双击复位）；列布局写入 localStorage（刷新后保留）。
      </Text>

      <DataTable
        enableColumnOrdering
        enableColumnResizing
        withTableBorder
        columns={columns}
        data={data}
        defaultColumnPinning={{ left: ["name"], right: ["actions"] }}
        flex={1}
        getRowId={person => person.id}
        mih={0}
        persistState={{ key: "playground-pinning" }}
        tableMinWidth={1280}
      />
    </>
  );
}
