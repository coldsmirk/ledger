import type { ComponentType } from "react";

import { AppShell, NavLink, ScrollArea, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";

import { AppearanceDemo } from "./demos/appearance";
import { BasicDemo } from "./demos/basic";
import { EditingDemo } from "./demos/editing";
import { GroupingDemo } from "./demos/grouping";
import { HookToolbarDemo } from "./demos/hook-toolbar";
import { MasterDetailDemo } from "./demos/master-detail";
import { MenuTreeDemo } from "./demos/menu-tree";
import { OrdersDemo } from "./demos/orders";
import { PinningDemo } from "./demos/pinning";
import { SelectionDemo } from "./demos/selection";
import { TreeDemo } from "./demos/tree";
import { VirtualizedDemo } from "./demos/virtualized";

interface Demo {
  id: string;
  label: string;
  description: string;
  component: ComponentType;
}

interface DemoGroup {
  title: string;
  demos: Demo[];
}

/* Simple → complex: plain rendering, then data browsing, then structure, then scale. */
const GROUPS: DemoGroup[] = [
  {
    title: "入门",
    demos: [
      {
        id: "basic",
        label: "基础表格",
        description: "员工名册：列定义 + 数据，排序与悬停",
        component: BasicDemo
      },
      {
        id: "appearance",
        label: "外观与边框",
        description: "价目表：三种边框形态、斑马纹、密度、加载与空态",
        component: AppearanceDemo
      }
    ]
  },
  {
    title: "业务数据",
    demos: [
      {
        id: "orders",
        label: "订单中心",
        description: "五种列筛选、分页、合计行、行点击",
        component: OrdersDemo
      },
      {
        id: "selection",
        label: "批量操作",
        description: "多选、Shift 范围、批量栏、CSV 导出",
        component: SelectionDemo
      },
      {
        id: "editing",
        label: "行内编辑",
        description: "库存盘点：四种编辑器、校验、异步提交",
        component: EditingDemo
      },
      {
        id: "master-detail",
        label: "主从明细",
        description: "订单行展开查看商品明细",
        component: MasterDetailDemo
      }
    ]
  },
  {
    title: "层级结构",
    demos: [
      {
        id: "tree",
        label: "树形数据",
        description: "区域营收：子行缩进 + 展开全部",
        component: TreeDemo
      },
      {
        id: "menu-tree",
        label: "菜单管理",
        description: "树形业务示例：多列、钉住树列、横向滚动",
        component: MenuTreeDemo
      }
    ]
  },
  {
    title: "大规模与宽表",
    demos: [
      {
        id: "pinning",
        label: "列设置 / 钉列 / 列宽",
        description: "宽表：表头齿轮开列设置面板、抽屉里的裸面板、布局持久化",
        component: PinningDemo
      },
      {
        id: "grouping",
        label: "分组聚合 + 钉行",
        description: "销售业绩按角色分组、聚合求和、置顶行",
        component: GroupingDemo
      },
      {
        id: "virtualized",
        label: "虚拟滚动",
        description: "操作日志：五万条 + 无限加载",
        component: VirtualizedDemo
      }
    ]
  },
  {
    title: "深度定制",
    demos: [
      {
        id: "hook-toolbar",
        label: "Hook 模式工具栏",
        description: "useDataTable + 复合组件自由组合",
        component: HookToolbarDemo
      }
    ]
  }
];

const ALL_DEMOS = GROUPS.flatMap(group => group.demos);

export function App() {
  const [activeId, setActiveId] = useState("basic");
  const active = ALL_DEMOS.find(demo => demo.id === activeId) ?? ALL_DEMOS[0]!;
  const ActiveComponent = active.component;

  const navSections = GROUPS.map(group => (
    <div key={group.title}>
      <Text c="dimmed" fw={600} px="sm" py={6} size="xs">
        {group.title}
      </Text>

      {group.demos.map(demo => (
        <NavLink
          key={demo.id}
          active={demo.id === activeId}
          description={demo.description}
          label={demo.label}
          onClick={() => setActiveId(demo.id)}
        />
      ))}
    </div>
  ));

  return (
    <AppShell navbar={{ width: 240, breakpoint: "xs" }} padding="md">
      <AppShell.Navbar p="xs">
        <Title order={4} px="sm" py="xs">
          ledger playground
        </Title>

        {/* The navbar is a flex column; the list owns the leftover height and scrolls. */}
        <ScrollArea style={{ flex: 1, minHeight: 0 }}>{navSections}</ScrollArea>
      </AppShell.Navbar>

      {/* A definite height caps the page: every demo scrolls inside its own table. */}
      <AppShell.Main style={{
        display: "flex",
        height: "100dvh",
        overflow: "hidden"
      }}
      >
        <Stack
          gap="sm"
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0
          }}
        >
          <div>
            <Title order={3}>{active.label}</Title>

            <Text c="dimmed" size="sm">
              {active.description}
            </Text>
          </div>

          <ActiveComponent />
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
