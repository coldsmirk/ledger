import type { DataTableRowReorder } from "@coldsmirk/ledger-mantine";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { Code, Text } from "@mantine/core";
import { useState } from "react";

import { useCopy } from "../i18n";

/**
 * Row ordering: the handle column lifts a row, the indicator shows where it lands, and
 * `onRowReorder` hands the application the `arrayMove` it applies to its own data — row order
 * IS data order. Sort any column to watch the handles disable (their tooltip says why), clear
 * the sort to get them back. The keyboard drives the same session: focus a handle, Space lifts,
 * ↑/↓ move, Home/End jump, Space drops, Escape cancels.
 */
const copy = {
  en: {
    step: "#",
    task: "Task",
    owner: "Owner",
    days: "Days",
    lastMove: "Last move:",
    noMove: "nothing yet",
    moved: (task: string, from: number, to: number) => `${task}: ${from + 1} → ${to + 1}`,
    hint: "Drag a handle (or focus it and press Space) to change the release order. Sorting or filtering disables the handles — the visible order stops being the data order.",
    tasks: [
      "Freeze the release branch",
      "Run the regression suite",
      "Update the changelog",
      "Build and sign the artifacts",
      "Publish to the registry",
      "Announce the release"
    ]
  },
  zh: {
    step: "#",
    task: "任务",
    owner: "负责人",
    days: "天数",
    lastMove: "最近一次移动：",
    noMove: "尚无移动",
    moved: (task: string, from: number, to: number) => `${task}：${from + 1} → ${to + 1}`,
    hint: "拖动把手（或聚焦后按 Space）调整发布顺序。排序或筛选会禁用把手——可见顺序不再是数据顺序。",
    tasks: [
      "冻结发布分支",
      "跑回归测试",
      "更新变更日志",
      "构建并签名产物",
      "发布到制品仓库",
      "发布公告"
    ]
  }
};

interface Step {
  id: string;
  /**
   * Index into the bilingual task list — the row text follows the language switch while the
   * array order stays the application's own.
   */
  taskIndex: number;
  owner: string;
  days: number;
}

const OWNERS = ["Ada", "Grace", "Linus", "Margaret", "Dennis", "Barbara"];

const INITIAL_STEPS: Step[] = copy.en.tasks.map((_, index) => {
  return {
    days: (index % 3) + 1,
    id: `step-${index + 1}`,
    owner: OWNERS[index % OWNERS.length]!,
    taskIndex: index
  };
});

const helper = createColumnHelper<Step>();

export function RowOrderingDemo() {
  const t = useCopy(copy);
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [lastMove, setLastMove] = useState<DataTableRowReorder<Step> | null>(null);

  const columns = [
    // Position is derived from the array, so it renews itself after every move.
    helper.display({
      id: "step",
      header: t.step,
      size: 48,
      meta: { align: "center" as const, label: t.step },
      cell: ({ row }) => row.index + 1
    }),
    // A resolved accessor rather than a raw field: the translated text is what sorting
    // compares, what CSV exports, and what the reorder announcements name a row by.
    helper.accessor(step => t.tasks[step.taskIndex] ?? "", { id: "task", header: t.task }),
    helper.accessor("owner", { header: t.owner, size: 140 }),
    helper.accessor("days", {
      header: t.days,
      size: 90,
      meta: { align: "end" as const }
    })
  ];

  const handleRowReorder = (reorder: DataTableRowReorder<Step>) => {
    setSteps(current => {
      const next = [...current];
      const [moved] = next.splice(reorder.fromIndex, 1);
      next.splice(reorder.toIndex, 0, moved!);

      return next;
    });
    setLastMove(reorder);
  };

  return (
    <>
      <Text size="sm">
        {t.lastMove}
        {" "}

        {lastMove
          ? <Code>{t.moved(t.tasks[lastMove.row.original.taskIndex] ?? "", lastMove.fromIndex, lastMove.toIndex)}</Code>
          : <Text c="dimmed" component="span" size="sm">{t.noMove}</Text>}
      </Text>

      <Text c="dimmed" size="xs">
        {t.hint}
      </Text>

      <DataTable
        enableRowOrdering
        withRowBorders
        columns={columns}
        data={steps}
        getRowId={step => step.id}
        onRowReorder={handleRowReorder}
      />
    </>
  );
}
