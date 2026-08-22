import type { MenuItem } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { Badge, Code, Text } from "@mantine/core";
import { useMemo } from "react";

import { makeMenus } from "../data";

const kindColor: Record<MenuItem["kind"], string> = {
  directory: "gray",
  menu: "blue",
  action: "orange"
};

const kindLabel: Record<MenuItem["kind"], string> = {
  directory: "目录",
  menu: "菜单",
  action: "按钮"
};

/* Directories carry no component, actions no route — a dimmed dash keeps the grid scannable. */
function CodeOrDash({ value }: { value: string | undefined }) {
  if (value === undefined) {
    return (
      <Text span c="dimmed" size="sm">
        —
      </Text>
    );
  }

  return <Code>{value}</Code>;
}

const helper = createColumnHelper<MenuItem>();

const columns = [
  helper.accessor("name", {
    header: "菜单名称",
    size: 220,
    meta: { filter: "text" }
  }),
  helper.accessor("kind", {
    header: "类型",
    size: 90,
    cell: context => (
      <Badge color={kindColor[context.getValue()]} size="sm" variant="light">
        {kindLabel[context.getValue()]}
      </Badge>
    ),
    meta: {
      filter: {
        variant: "multi-select",
        options: Object.entries(kindLabel).map(([value, text]) => {
          return { value, label: text };
        })
      }
    }
  }),
  helper.accessor("path", {
    header: "路由路径",
    size: 180,
    cell: context => <CodeOrDash value={context.getValue()} />
  }),
  helper.accessor("component", {
    header: "组件",
    size: 240,
    cell: context => <CodeOrDash value={context.getValue()} />
  }),
  helper.accessor("permission", {
    header: "权限标识",
    size: 210,
    cell: context => <CodeOrDash value={context.getValue()} />
  }),
  helper.accessor("icon", {
    header: "图标",
    size: 110,
    cell: context => <CodeOrDash value={context.getValue()} />
  }),
  helper.accessor("order", {
    header: "排序",
    size: 80,
    meta: { align: "end" }
  }),
  helper.accessor("status", {
    header: "状态",
    size: 90,
    cell: context => (
      <Badge color={context.getValue() === "enabled" ? "teal" : "red"} size="sm" variant="light">
        {context.getValue() === "enabled" ? "启用" : "停用"}
      </Badge>
    )
  }),
  helper.accessor("visible", {
    header: "可见",
    size: 90,
    cell: context => context.getValue()
      ? "显示"
      : (
          <Text span c="dimmed" size="sm">
            隐藏
          </Text>
        )
  }),
  helper.accessor("updatedAt", {
    header: "更新时间",
    size: 130,
    sortDescFirst: true
  })
];

export function MenuTreeDemo() {
  const data = useMemo(() => makeMenus(), []);

  return (
    <DataTable
      highlightOnHover
      tabularNums
      withTableBorder
      columns={columns}
      data={data}
      defaultColumnPinning={{ start: ["name"], end: [] }}
      defaultExpanded={{ system: true, "system-users": true }}
      flex={1}
      getRowId={menu => menu.id}
      getSubRows={menu => menu.children}
      mih={0}
    />
  );
}
