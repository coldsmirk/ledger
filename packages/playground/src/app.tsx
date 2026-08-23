import type { ComponentType } from "react";

import { AppShell, Burger, Group, NavLink, ScrollArea, Stack, Text, Title, useMatches } from "@mantine/core";
import { useRef, useState } from "react";

import { AppearanceDemo } from "./demos/appearance";
import { BasicDemo } from "./demos/basic";
import { EditingDemo } from "./demos/editing";
import { GroupedHeadersDemo } from "./demos/grouped-headers";
import { GroupingDemo } from "./demos/grouping";
import { HookToolbarDemo } from "./demos/hook-toolbar";
import { MasterDetailDemo } from "./demos/master-detail";
import { MenuTreeDemo } from "./demos/menu-tree";
import { OrdersDemo } from "./demos/orders";
import { PinningDemo } from "./demos/pinning";
import { RowEditingDemo } from "./demos/row-editing";
import { SelectionDemo } from "./demos/selection";
import { ServerSideDemo } from "./demos/server-side";
import { SpanningDemo } from "./demos/spanning";
import { StatesDemo } from "./demos/states";
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
        description: "员工名册：列定义 + 数据，排序与悬停，邮箱列随断点显隐",
        component: BasicDemo
      },
      {
        id: "appearance",
        label: "外观与边框",
        description: "价目表：三种边框形态、斑马纹、密度、加载与空态",
        component: AppearanceDemo
      },
      {
        id: "states",
        label: "状态与恢复",
        description: "加载、空态、无匹配、失败重试、加载更多失败",
        component: StatesDemo
      }
    ]
  },
  {
    title: "业务数据",
    demos: [
      {
        id: "orders",
        label: "订单中心",
        description: "五种列筛选、分页、合计行、活动行与键盘导航",
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
        label: "单元格编辑",
        description: "库存盘点：四种编辑器、校验、异步提交",
        component: EditingDemo
      },
      {
        id: "row-editing",
        label: "整行编辑",
        description: "员工档案：整行打开、原子提交、操作列驱动",
        component: RowEditingDemo
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
    title: "层级与报表",
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
      },
      {
        id: "spanning",
        label: "合并单元格",
        description: "营收报表：相邻同值纵向合并 + 总计行横向合并",
        component: SpanningDemo
      },
      {
        id: "grouped-headers",
        label: "多级表头",
        description: "门店季度报表：分组表头 + 合计行 + 表头/合计单元格 DOM 属性",
        component: GroupedHeadersDemo
      }
    ]
  },
  {
    title: "大规模与宽表",
    demos: [
      {
        id: "pinning",
        label: "列设置 / 钉列 / 列宽",
        description: "宽表：列设置面板、布局持久化、双击列缝自适应列宽",
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
    title: "集成与定制",
    demos: [
      {
        id: "server-side",
        label: "服务端数据",
        description: "排序 / 筛选 / 分页全部交给后端，表格只持有当前一页",
        component: ServerSideDemo
      },
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
  const [mobileNavOpened, setMobileNavOpened] = useState(false);
  const desktop = useMatches({ base: false, xs: true }, { getInitialValueInEffect: false });
  const burgerRef = useRef<HTMLButtonElement>(null);
  const active = ALL_DEMOS.find(demo => demo.id === activeId) ?? ALL_DEMOS[0]!;
  const ActiveComponent = active.component;

  const selectDemo = (id: string) => {
    setActiveId(id);
    setMobileNavOpened(false);

    if (!desktop) {
      burgerRef.current?.focus();
    }
  };

  const navSections = GROUPS.map(group => (
    <div key={group.title}>
      <Text c="dimmed" fw={600} px="sm" py={6} size="xs">
        {group.title}
      </Text>

      {group.demos.map(demo => (
        <NavLink
          key={demo.id}
          active={demo.id === activeId}
          aria-current={demo.id === activeId ? "page" : undefined}
          component="button"
          description={demo.description}
          label={demo.label}
          type="button"
          onClick={() => selectDemo(demo.id)}
        />
      ))}
    </div>
  ));

  return (
    <AppShell
      header={{ height: { base: 52, xs: 0 } }}
      padding="md"
      navbar={{
        breakpoint: "xs",
        collapsed: { mobile: !mobileNavOpened },
        width: 240
      }}
    >
      <AppShell.Header hiddenFrom="xs">
        <Group h="100%" px="md">
          <Burger
            ref={burgerRef}
            aria-controls="playground-navigation"
            aria-expanded={mobileNavOpened}
            aria-label="Toggle navigation"
            opened={mobileNavOpened}
            size="sm"
            onClick={() => setMobileNavOpened(opened => !opened)}
          />

          <Text fw={600}>ledger playground</Text>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar
        aria-hidden={!desktop && !mobileNavOpened ? true : undefined}
        id="playground-navigation"
        inert={!desktop && !mobileNavOpened}
        p="xs"
      >
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
