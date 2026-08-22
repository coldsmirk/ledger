import type { Person } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { zhCN } from "@coldsmirk/ledger-mantine/locales";
import { Code, Group, SegmentedControl, Switch, Text } from "@mantine/core";
import { useMemo, useState } from "react";

import { makePeople } from "../data";
import { StatusBadge } from "./columns";

/**
 * Every non-happy state and its recovery affordance in one place. Retrying "repairs" the
 * scenario so the retry buttons demonstrate an actual round trip, not a dead control.
 */
type Scenario = "normal" | "loading" | "empty" | "no-results" | "error" | "load-more-error";

const SCENARIOS: Array<{ value: Scenario; label: string }> = [
  { value: "normal", label: "正常" },
  { value: "loading", label: "加载中" },
  { value: "empty", label: "空数据" },
  { value: "no-results", label: "无匹配" },
  { value: "error", label: "加载失败" },
  { value: "load-more-error", label: "加载更多失败" }
];

const helper = createColumnHelper<Person>();

const columns = [
  helper.accessor("name", { header: "姓名", size: 130 }),
  helper.accessor("role", { header: "角色", size: 140 }),
  helper.accessor("status", {
    header: "状态",
    size: 110,
    cell: context => <StatusBadge status={context.getValue()} />
  }),
  helper.accessor("email", { header: "邮箱", meta: { truncate: true } })
];

export function StatesDemo() {
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [keepStale, setKeepStale] = useState(true);
  const [recoveries, setRecoveries] = useState(0);
  const data = useMemo(() => makePeople(12), []);

  const recover = () => {
    setRecoveries(count => count + 1);
    setScenario("normal");
  };

  const shownData = scenario === "empty" || (scenario === "error" && !keepStale) ? [] : data;

  return (
    <>
      <Group gap="md">
        <SegmentedControl
          data={SCENARIOS}
          size="xs"
          value={scenario}
          onChange={value => setScenario(value as Scenario)}
        />

        <Switch
          checked={keepStale}
          description="失败时旧数据留在遮罩下"
          label="保留旧数据"
          size="xs"
          onChange={event => setKeepStale(event.currentTarget.checked)}
        />

        <Text c="dimmed" size="xs">
          重试成功
          <Code>{recoveries}</Code>
          次 —— 两处「重试」都会把场景恢复为正常
        </Text>
      </Group>

      <DataTable
        enableGlobalFilter
        columns={columns}
        data={shownData}
        error={scenario === "error"}
        flex={1}
        getRowId={person => person.id}
        globalFilter={scenario === "no-results" ? "一个不存在的名字" : ""}
        labels={zhCN}
        loading={scenario === "loading"}
        loadMoreError={scenario === "load-more-error"}
        mih={0}
        onEndReached={scenario === "load-more-error" ? recover : undefined}
        onRetry={recover}
      />
    </>
  );
}
