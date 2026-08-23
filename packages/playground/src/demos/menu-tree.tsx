import type { MenuItem } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { Badge, Code, Text } from "@mantine/core";
import { useMemo } from "react";

import { makeMenus } from "../data";
import { useCopy, useLang } from "../i18n";

const copy = {
  en: {
    name: "Menu",
    kind: "Type",
    path: "Route",
    component: "Component",
    permission: "Permission",
    icon: "Icon",
    order: "Order",
    status: "Status",
    visible: "Visible",
    updatedAt: "Updated",
    enabled: "Enabled",
    disabled: "Disabled",
    shown: "Shown",
    hidden: "Hidden",
    kinds: {
      directory: "Folder",
      menu: "Menu",
      action: "Action"
    }
  },
  zh: {
    name: "菜单名称",
    kind: "类型",
    path: "路由路径",
    component: "组件",
    permission: "权限标识",
    icon: "图标",
    order: "排序",
    status: "状态",
    visible: "可见",
    updatedAt: "更新时间",
    enabled: "启用",
    disabled: "停用",
    shown: "显示",
    hidden: "隐藏",
    kinds: {
      directory: "目录",
      menu: "菜单",
      action: "按钮"
    }
  }
};

const kindColor: Record<MenuItem["kind"], string> = {
  directory: "gray",
  menu: "blue",
  action: "orange"
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

export function MenuTreeDemo() {
  const t = useCopy(copy);
  const { lang } = useLang();
  const data = useMemo(() => makeMenus(lang), [lang]);

  const columns = useMemo(() => [
    helper.accessor("name", {
      header: t.name,
      size: 240,
      meta: { filter: "text" }
    }),
    helper.accessor("kind", {
      header: t.kind,
      size: 110,
      cell: context => (
        <Badge color={kindColor[context.getValue()]} size="sm" variant="light">
          {t.kinds[context.getValue()]}
        </Badge>
      ),
      meta: {
        filter: {
          variant: "multi-select",
          options: Object.entries(t.kinds).map(([value, label]) => {
            return { value, label };
          })
        }
      }
    }),
    helper.accessor("path", {
      header: t.path,
      size: 180,
      cell: context => <CodeOrDash value={context.getValue()} />
    }),
    helper.accessor("component", {
      header: t.component,
      size: 240,
      cell: context => <CodeOrDash value={context.getValue()} />
    }),
    helper.accessor("permission", {
      header: t.permission,
      size: 210,
      cell: context => <CodeOrDash value={context.getValue()} />
    }),
    helper.accessor("icon", {
      header: t.icon,
      size: 110,
      cell: context => <CodeOrDash value={context.getValue()} />
    }),
    helper.accessor("order", {
      header: t.order,
      size: 90,
      meta: { align: "end" }
    }),
    helper.accessor("status", {
      header: t.status,
      size: 100,
      cell: context => (
        <Badge color={context.getValue() === "enabled" ? "teal" : "red"} size="sm" variant="light">
          {context.getValue() === "enabled" ? t.enabled : t.disabled}
        </Badge>
      )
    }),
    helper.accessor("visible", {
      header: t.visible,
      size: 90,
      cell: context => context.getValue()
        ? t.shown
        : (
            <Text span c="dimmed" size="sm">
              {t.hidden}
            </Text>
          )
    }),
    helper.accessor("updatedAt", {
      header: t.updatedAt,
      size: 130,
      sortDescFirst: true
    })
  ], [t]);

  return (
    <DataTable
      highlightOnHover
      tabularNums
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
