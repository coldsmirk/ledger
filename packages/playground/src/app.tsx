import type { ComponentType } from "react";

import type { Copy, Lang } from "./i18n";

import { AppShell, Burger, Button, Group, NavLink, ScrollArea, SegmentedControl, Stack, Text, Title, useMatches } from "@mantine/core";
import { useRef, useState } from "react";

import { AppearanceDemo } from "./demos/appearance";
import { BasicDemo } from "./demos/basic";
import { ColumnVirtualizationDemo } from "./demos/column-virtualization";
import { EditingDemo } from "./demos/editing";
import { GroupedHeadersDemo } from "./demos/grouped-headers";
import { GroupingDemo } from "./demos/grouping";
import { HookToolbarDemo } from "./demos/hook-toolbar";
import { MasterDetailDemo } from "./demos/master-detail";
import { MenuTreeDemo } from "./demos/menu-tree";
import { OrdersDemo } from "./demos/orders";
import { PinningDemo } from "./demos/pinning";
import { RowEditingDemo } from "./demos/row-editing";
import { RowOrderingDemo } from "./demos/row-ordering";
import { SelectionDemo } from "./demos/selection";
import { ServerSideDemo } from "./demos/server-side";
import { SpanningDemo } from "./demos/spanning";
import { StatesDemo } from "./demos/states";
import { TreeDemo } from "./demos/tree";
import { VirtualizedDemo } from "./demos/virtualized";
import { useCopy, useLang } from "./i18n";
import { SourceDrawer } from "./source-drawer";

const en = {
  shell: {
    title: "ledger playground",
    language: "Language",
    toggleNavigation: "Toggle navigation",
    viewSource: "View source"
  },
  groups: {
    start: "Getting started",
    business: "Business data",
    hierarchy: "Hierarchy and reports",
    scale: "Scale and wide tables",
    integration: "Integration"
  },
  demos: {
    basic: {
      label: "Basic table",
      description: "A staff roster: column defs plus data, sorting and hover, an email column that comes and goes with the breakpoint"
    },
    appearance: {
      label: "Borders and density",
      description: "A price list: three border shapes, stripes, density, loading and empty"
    },
    states: {
      label: "States and recovery",
      description: "Loading, empty, no results, failure with retry, and a failed load-more"
    },
    orders: {
      label: "Order desk",
      description: "Five column filters, pagination, a totals row, the active row and its keyboard"
    },
    selection: {
      label: "Bulk actions",
      description: "Multi-select, Shift ranges, the selection bar, CSV export"
    },
    editing: {
      label: "Cell editing",
      description: "Stock count: four editors, validation, async commits"
    },
    "row-editing": {
      label: "Row editing",
      description: "Employee records: the whole row opens, commits atomically, driven from an actions column"
    },
    "row-ordering": {
      label: "Row ordering",
      description: "A release checklist: drag the handle or lift with Space, sorting disables the handles"
    },
    "master-detail": {
      label: "Master–detail",
      description: "Expand an order to read its line items"
    },
    tree: {
      label: "Tree data",
      description: "Revenue by region: indented sub-rows and expand-all"
    },
    "menu-tree": {
      label: "Menu administration",
      description: "A tree in a real screen: many columns, a pinned tree column, horizontal scrolling"
    },
    spanning: {
      label: "Spanning cells",
      description: "A revenue report: equal neighbours merge down, the totals row merges across"
    },
    "grouped-headers": {
      label: "Grouped headers",
      description: "Quarterly store report: header groups, a footer row, DOM props on header and footer cells"
    },
    pinning: {
      label: "Columns, pinning, widths",
      description: "A wide table: the columns panel, a persisted layout, double-click a column edge to fit"
    },
    grouping: {
      label: "Grouping and pinned rows",
      description: "Sales grouped by role, aggregated sums, rows pinned to the top"
    },
    virtualized: {
      label: "Virtual scrolling",
      description: "An audit log: fifty thousand rows with infinite loading"
    },
    "column-virtualization": {
      label: "Column virtualization",
      description: "A year of daily sales: 361 columns windowed on both axes, month groups clamping as you scroll"
    },
    "server-side": {
      label: "Server-side data",
      description: "Sorting, filtering and pagination all belong to the backend; the table holds one page"
    },
    "hook-toolbar": {
      label: "Hook mode toolbar",
      description: "useDataTable plus the compound components, assembled by hand"
    }
  }
};

type AppCopy = typeof en;

type DemoId = keyof AppCopy["demos"];

type GroupId = keyof AppCopy["groups"];

const copy: Copy<AppCopy> = {
  en,
  zh: {
    shell: {
      title: "ledger playground",
      language: "语言",
      toggleNavigation: "切换导航",
      viewSource: "查看源码"
    },
    groups: {
      start: "入门",
      business: "业务数据",
      hierarchy: "层级与报表",
      scale: "大规模与宽表",
      integration: "集成与定制"
    },
    demos: {
      basic: {
        label: "基础表格",
        description: "员工名册：列定义 + 数据，排序与悬停，邮箱列随断点显隐"
      },
      appearance: {
        label: "外观与边框",
        description: "价目表：三种边框形态、斑马纹、密度、加载与空态"
      },
      states: {
        label: "状态与恢复",
        description: "加载、空态、无匹配、失败重试、加载更多失败"
      },
      orders: {
        label: "订单中心",
        description: "五种列筛选、分页、合计行、活动行与键盘导航"
      },
      selection: {
        label: "批量操作",
        description: "多选、Shift 范围、批量栏、CSV 导出"
      },
      editing: {
        label: "单元格编辑",
        description: "库存盘点：四种编辑器、校验、异步提交"
      },
      "row-editing": {
        label: "整行编辑",
        description: "员工档案：整行打开、原子提交、操作列驱动"
      },
      "row-ordering": {
        label: "行拖拽排序",
        description: "发布清单：拖把手或 Space 拿起调整顺序，排序时把手禁用"
      },
      "master-detail": {
        label: "主从明细",
        description: "订单行展开查看商品明细"
      },
      tree: {
        label: "树形数据",
        description: "区域营收：子行缩进 + 展开全部"
      },
      "menu-tree": {
        label: "菜单管理",
        description: "树形业务示例：多列、钉住树列、横向滚动"
      },
      spanning: {
        label: "合并单元格",
        description: "营收报表：相邻同值纵向合并 + 总计行横向合并"
      },
      "grouped-headers": {
        label: "多级表头",
        description: "门店季度报表：分组表头 + 合计行 + 表头/合计单元格 DOM 属性"
      },
      pinning: {
        label: "列设置 / 钉列 / 列宽",
        description: "宽表：列设置面板、布局持久化、双击列缝自适应列宽"
      },
      grouping: {
        label: "分组聚合 + 钉行",
        description: "销售业绩按角色分组、聚合求和、置顶行"
      },
      virtualized: {
        label: "虚拟滚动",
        description: "操作日志：五万条 + 无限加载"
      },
      "column-virtualization": {
        label: "列虚拟化",
        description: "全年每日销售：361 列双轴虚拟化，月份分组随滚动钳制"
      },
      "server-side": {
        label: "服务端数据",
        description: "排序 / 筛选 / 分页全部交给后端，表格只持有当前一页"
      },
      "hook-toolbar": {
        label: "Hook 模式工具栏",
        description: "useDataTable + 复合组件自由组合"
      }
    }
  }
};

interface DemoGroup {
  id: GroupId;
  demos: Array<{ id: DemoId; component: ComponentType }>;
}

/* Simple → complex: plain rendering, then data browsing, then structure, then scale. */
const GROUPS: DemoGroup[] = [
  {
    id: "start",
    demos: [
      { id: "basic", component: BasicDemo },
      { id: "appearance", component: AppearanceDemo },
      { id: "states", component: StatesDemo }
    ]
  },
  {
    id: "business",
    demos: [
      { id: "orders", component: OrdersDemo },
      { id: "selection", component: SelectionDemo },
      { id: "editing", component: EditingDemo },
      { id: "row-editing", component: RowEditingDemo },
      { id: "row-ordering", component: RowOrderingDemo },
      { id: "master-detail", component: MasterDetailDemo }
    ]
  },
  {
    id: "hierarchy",
    demos: [
      { id: "tree", component: TreeDemo },
      { id: "menu-tree", component: MenuTreeDemo },
      { id: "spanning", component: SpanningDemo },
      { id: "grouped-headers", component: GroupedHeadersDemo }
    ]
  },
  {
    id: "scale",
    demos: [
      { id: "pinning", component: PinningDemo },
      { id: "grouping", component: GroupingDemo },
      { id: "virtualized", component: VirtualizedDemo },
      { id: "column-virtualization", component: ColumnVirtualizationDemo }
    ]
  },
  {
    id: "integration",
    demos: [
      { id: "server-side", component: ServerSideDemo },
      { id: "hook-toolbar", component: HookToolbarDemo }
    ]
  }
];

const ALL_DEMOS = GROUPS.flatMap(group => group.demos);

const LANGUAGE_OPTIONS: Array<{ value: Lang; label: string }> = [
  { value: "en", label: "EN" },
  { value: "zh", label: "中文" }
];

export function App() {
  const t = useCopy(copy);
  const { lang, setLang } = useLang();
  const [activeId, setActiveId] = useState<DemoId>("basic");
  const [mobileNavOpened, setMobileNavOpened] = useState(false);
  const [sourceOpened, setSourceOpened] = useState(false);
  const desktop = useMatches({ base: false, xs: true }, { getInitialValueInEffect: false });
  const burgerRef = useRef<HTMLButtonElement>(null);
  const active = ALL_DEMOS.find(demo => demo.id === activeId) ?? ALL_DEMOS[0]!;
  const ActiveComponent = active.component;
  const activeCopy = t.demos[active.id];

  const selectDemo = (id: DemoId) => {
    setActiveId(id);
    setMobileNavOpened(false);

    if (!desktop) {
      burgerRef.current?.focus();
    }
  };

  const navSections = GROUPS.map(group => (
    <div key={group.id}>
      <Text c="dimmed" fw={600} px="sm" py={6} size="xs">
        {t.groups[group.id]}
      </Text>

      {group.demos.map(demo => (
        <NavLink
          key={demo.id}
          active={demo.id === activeId}
          aria-current={demo.id === activeId ? "page" : undefined}
          component="button"
          description={t.demos[demo.id].description}
          label={t.demos[demo.id].label}
          type="button"
          onClick={() => selectDemo(demo.id)}
        />
      ))}
    </div>
  ));

  return (
    <AppShell
      header={{ height: 52 }}
      padding="md"
      navbar={{
        breakpoint: "xs",
        collapsed: { mobile: !mobileNavOpened },
        width: 240
      }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" wrap="nowrap">
          <Burger
            ref={burgerRef}
            aria-controls="playground-navigation"
            aria-expanded={mobileNavOpened}
            aria-label={t.shell.toggleNavigation}
            hiddenFrom="xs"
            opened={mobileNavOpened}
            size="sm"
            onClick={() => setMobileNavOpened(opened => !opened)}
          />

          <Text fw={600}>{t.shell.title}</Text>

          {/* SegmentedControl renders radios; the wrapper needs the role for the group to be
              named at all. */}
          <SegmentedControl
            aria-label={t.shell.language}
            data={LANGUAGE_OPTIONS}
            ml="auto"
            role="radiogroup"
            size="xs"
            value={lang}
            onChange={next => setLang(next)}
          />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar
        aria-hidden={!desktop && !mobileNavOpened ? true : undefined}
        id="playground-navigation"
        inert={!desktop && !mobileNavOpened}
        p="xs"
      >
        {/* The navbar is a flex column; the list owns the leftover height and scrolls. */}
        <ScrollArea style={{ flex: 1, minHeight: 0 }}>{navSections}</ScrollArea>
      </AppShell.Navbar>

      {/* A definite height caps the page: every demo scrolls inside its own table. */}
      <AppShell.Main style={{
        display: "flex",
        height: "calc(100dvh - var(--app-shell-header-offset, 0rem))",
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
          <Group align="flex-start" gap="sm" justify="space-between" wrap="nowrap">
            {/* The description is the elastic half: minWidth 0 lets it wrap instead of pushing
                the button off the row, and the button never shrinks below its own label. */}
            <div style={{ minWidth: 0 }}>
              <Title order={3}>{activeCopy.label}</Title>

              <Text c="dimmed" size="sm">
                {activeCopy.description}
              </Text>
            </div>

            <Button
              size="xs"
              style={{ flexShrink: 0 }}
              variant="default"
              onClick={() => setSourceOpened(true)}
            >
              {t.shell.viewSource}
            </Button>
          </Group>

          <ActiveComponent />
        </Stack>
      </AppShell.Main>

      <SourceDrawer demoId={active.id} opened={sourceOpened} onClose={() => setSourceOpened(false)} />
    </AppShell>
  );
}
