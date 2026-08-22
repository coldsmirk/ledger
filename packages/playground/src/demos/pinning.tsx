import type { TableInstance } from "@coldsmirk/ledger-mantine";

import type { Person } from "../data";

import { createColumnHelper, DataTable, useDataTable } from "@coldsmirk/ledger-mantine";
import { zhCN } from "@coldsmirk/ledger-mantine/locales";
import { ActionIcon, Button, Drawer, Group, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";

import { makePeople } from "../data";
import { personColumns, StatusBadge } from "./columns";

const helper = createColumnHelper<Person>();

// The panel ships no trigger of its own, so the demo draws its cog: a toothed ring (a dashed
// stroke — eight dashes, eight gaps) around a hub, in the same primitive-stroke language as the
// library's built-in glyphs.
function CogIcon() {
  return (
    <svg
      aria-hidden
      fill="none"
      height={16}
      stroke="currentColor"
      viewBox="0 0 16 16"
      width={16}
    >
      <circle cx="8" cy="8" r="2" strokeWidth={1.5} />
      <circle cx="8" cy="8" r="5.25" strokeDasharray="2.47 1.65" strokeWidth={2} />
    </svg>
  );
}

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
    size: 92,
    enableHiding: false,
    // A display column can never sort, so its header renders as a plain box — the one place a
    // trigger can live, since a sortable header IS a button and would end up nesting one. The
    // cell needs room for the title AND the cog: the label scaffolding clips its content.
    header: ({ table }) => (
      <Group gap={2} justify="center" wrap="nowrap">
        操作
        <DataTable.ColumnsPanel labels={zhCN} table={table as TableInstance<Person>}>
          <ActionIcon aria-label="列设置" color="gray" size="sm" variant="subtle">
            <CogIcon />
          </ActionIcon>
        </DataTable.ColumnsPanel>
      </Group>
    ),
    cell: () => (
      <ActionIcon size="sm" variant="subtle" onClick={event => event.stopPropagation()}>
        …
      </ActionIcon>
    )
  })
];

export function PinningDemo() {
  const data = useMemo(() => makePeople(80), []);
  const [drawerOpened, drawer] = useDisclosure(false);

  const table = useDataTable({
    data,
    columns,
    getRowId: person => person.id,
    enableColumnOrdering: true,
    enableColumnResizing: true,
    defaultColumnPinning: { start: ["name"], end: ["actions"] },
    persistState: { key: "playground-pinning" }
  });

  return (
    <>
      <Group justify="space-between" wrap="nowrap">
        <Text c="dimmed" size="xs">
          表头右上角 ⚙ 打开列设置：拖拽改序、勾选显隐、三态钉列、填宽度（清空即回自适应）、重置。
          列头本身也能拖着重排、拖右缘改宽（双击复位）。布局写入 localStorage，刷新后保留。
        </Text>

        <Button size="xs" variant="default" onClick={drawer.open}>
          抽屉里的裸面板
        </Button>
      </Group>

      <DataTable flex={1} mih={0} table={table} tableMinWidth={1280} />

      {/* The very same component, no trigger: it assumes nothing about what hosts it. The panel
          brings its own heading, so the drawer does not add a second one. */}
      <Drawer opened={drawerOpened} padding={0} position="right" size="sm" onClose={drawer.close}>
        <DataTable.ColumnsPanel labels={zhCN} table={table} />
      </Drawer>
    </>
  );
}
