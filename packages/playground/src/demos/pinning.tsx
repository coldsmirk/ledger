import type { TableInstance } from "@coldsmirk/ledger-mantine";

import type { Person } from "../data";

import { createColumnHelper, DataTable, useDataTable } from "@coldsmirk/ledger-mantine";
import { ActionIcon, Button, Drawer, Group, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";

import { makePeople } from "../data";
import { useCopy, useLang } from "../i18n";
import { StatusBadge, usePersonColumns } from "./columns";

const copy = {
  en: {
    statusCopy: "Status (copy)",
    actions: "Actions",
    columns: "Columns",
    barePanel: "The bare panel in a drawer",
    hint: "The ⚙ in the last header opens the columns panel: drag to reorder, tick to show or hide, pin to either side, type a width (clear it to go back to auto), reset. Header cells themselves also drag to reorder and resize from their right edge (double-click to fit). The layout is written to localStorage and survives a reload."
  },
  zh: {
    statusCopy: "状态（副本列）",
    actions: "操作",
    columns: "列设置",
    barePanel: "抽屉里的裸面板",
    hint: "表头右上角 ⚙ 打开列设置：拖拽改序、勾选显隐、三态钉列、填宽度（清空即回自适应）、重置。列头本身也能拖着重排、拖右缘改宽（双击复位）。布局写入 localStorage，刷新后保留。"
  }
};

const helper = createColumnHelper<Person>();

// The panel ships no trigger of its own, so the demo brings the gear: Lucide's `settings`
// glyph, vendored verbatim (lucide-static v1.34.0, ISC) — the same source and stroke language
// as the library's built-in icons.
function CogIcon() {
  return (
    <svg
      aria-hidden
      fill="none"
      height={16}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={16}
    >
      <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function PinningDemo() {
  const t = useCopy(copy);
  const { lang } = useLang();
  const data = useMemo(() => makePeople(lang, 80), [lang]);
  const personColumns = usePersonColumns();
  const [drawerOpened, drawer] = useDisclosure(false);

  const columns = useMemo(() => [
    ...personColumns,
    helper.accessor("status", {
      id: "status-copy",
      header: t.statusCopy,
      size: 150,
      cell: context => <StatusBadge status={context.getValue()} />
    }),
    helper.display({
      id: "actions",
      size: 92,
      enableHiding: false,
      // The header below is a render function, so plain-text surfaces (the columns panel) read
      // the column's name from meta.label instead of falling back to the raw id.
      meta: { label: t.actions },
      // A display column can never sort, so its header renders as a plain box — the one place a
      // trigger can live, since a sortable header IS a button and would end up nesting one. The
      // cell needs room for the title AND the cog: the label scaffolding clips its content.
      header: ({ table }) => (
        <Group gap={2} justify="center" wrap="nowrap">
          {t.actions}

          <DataTable.ColumnsPanel table={table as TableInstance<Person>}>
            <ActionIcon aria-label={t.columns} color="gray" size="sm" variant="subtle">
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
  ], [personColumns, t]);

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
          {t.hint}
        </Text>

        <Button size="xs" variant="default" onClick={drawer.open}>
          {t.barePanel}
        </Button>
      </Group>

      <DataTable flex={1} mih={0} table={table} tableMinWidth={1280} />

      {/* The very same component, no trigger: it assumes nothing about what hosts it. The panel
          brings its own heading, so the drawer does not add a second one. */}
      <Drawer opened={drawerOpened} padding={0} position="right" size="sm" onClose={drawer.close}>
        <DataTable.ColumnsPanel table={table} />
      </Drawer>
    </>
  );
}
