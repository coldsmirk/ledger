import type { ComponentType } from "react";

import { AppShell, NavLink, ScrollArea, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";

import { BasicDemo } from "./demos/basic";
import { EditingDemo } from "./demos/editing";
import { GroupingDemo } from "./demos/grouping";
import { HookToolbarDemo } from "./demos/hook-toolbar";
import { MasterDetailDemo } from "./demos/master-detail";
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

const DEMOS: Demo[] = [
  {
    id: "basic",
    label: "基础表格",
    description: "排序、筛选、列菜单、斑马纹",
    component: BasicDemo
  },
  {
    id: "virtualized",
    label: "虚拟滚动",
    description: "一万行 + 无限加载 + 自适应高度",
    component: VirtualizedDemo
  },
  {
    id: "selection",
    label: "行选择",
    description: "多选、Shift 范围、批量栏、CSV 导出",
    component: SelectionDemo
  },
  {
    id: "editing",
    label: "行内编辑",
    description: "四种编辑器、校验、异步提交",
    component: EditingDemo
  },
  {
    id: "master-detail",
    label: "主从明细",
    description: "行展开 detail panel",
    component: MasterDetailDemo
  },
  {
    id: "tree",
    label: "树形数据",
    description: "子行缩进 + 展开全部",
    component: TreeDemo
  },
  {
    id: "pinning",
    label: "钉列 / 列宽 / 重排",
    description: "拖拽改宽、拖拽排序、布局持久化",
    component: PinningDemo
  },
  {
    id: "grouping",
    label: "分组聚合 + 钉行",
    description: "按列分组、聚合单元格、置顶行",
    component: GroupingDemo
  },
  {
    id: "hook-toolbar",
    label: "Hook 模式工具栏",
    description: "useDataTable + 复合组件自由组合",
    component: HookToolbarDemo
  }
];

export function App() {
  const [activeId, setActiveId] = useState("basic");
  const active = DEMOS.find(demo => demo.id === activeId) ?? DEMOS[0]!;
  const ActiveComponent = active.component;

  const navLinks = DEMOS.map(demo => (
    <NavLink
      key={demo.id}
      active={demo.id === activeId}
      description={demo.description}
      label={demo.label}
      onClick={() => setActiveId(demo.id)}
    />
  ));

  return (
    <AppShell navbar={{ width: 240, breakpoint: "xs" }} padding="md">
      <AppShell.Navbar p="xs">
        <Stack gap={4}>
          <Title order={4} px="sm" py="xs">
            ledger playground
          </Title>

          <ScrollArea style={{ flex: 1 }}>{navLinks}</ScrollArea>
        </Stack>
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
