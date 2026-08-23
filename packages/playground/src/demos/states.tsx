import type { Person } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { Button, Group, SegmentedControl, Stack, Switch, Text } from "@mantine/core";
import { useMemo, useState } from "react";

import { makePeople } from "../data";
import { useCopy, useLang } from "../i18n";
import { StatusBadge } from "./columns";

/**
 * Every non-happy state and its recovery affordance in one place. Retrying "repairs" the
 * scenario so the retry buttons demonstrate an actual round trip, not a dead control.
 */
type Scenario = "normal" | "loading" | "empty" | "no-results" | "error" | "load-more-error";

const copy = {
  en: {
    name: "Name",
    role: "Role",
    status: "Status",
    email: "Email",
    joinedAt: "Joined",
    scenario: "Scenario",
    scenarios: {
      normal: "Normal",
      loading: "Loading",
      empty: "No data",
      "no-results": "No results",
      error: "Load failed",
      "load-more-error": "Load-more failed"
    },
    keepStale: "Keep stale rows",
    keepStaleHint: "On failure the old rows stay under the scrim",
    customEmpty: "Custom empty state",
    customEmptyHint: "The empty state is a ReactNode, not a string",
    recovered: (count: number) => `${count} successful retries — both "Retry" buttons put the scenario back to normal`,
    noMatch: "a name that does not exist",
    emptyTitle: "No members yet",
    emptyBody: "Invite a colleague and they will show up here.",
    emptyAction: "Invite a member"
  },
  zh: {
    name: "姓名",
    role: "角色",
    status: "状态",
    email: "邮箱",
    joinedAt: "入职日期",
    scenario: "场景",
    scenarios: {
      normal: "正常",
      loading: "加载中",
      empty: "空数据",
      "no-results": "无匹配",
      error: "加载失败",
      "load-more-error": "加载更多失败"
    },
    keepStale: "保留旧数据",
    keepStaleHint: "失败时旧数据留在遮罩下",
    customEmpty: "自定义空态",
    customEmptyHint: "空态是一块 ReactNode，不是一串文案",
    recovered: (count: number) => `重试成功 ${count} 次 —— 两处「重试」都会把场景恢复为正常`,
    noMatch: "一个不存在的名字",
    emptyTitle: "还没有成员",
    emptyBody: "邀请同事加入后，他们会出现在这里。",
    emptyAction: "邀请成员"
  }
};

const SCENARIOS: Scenario[] = ["normal", "loading", "empty", "no-results", "error", "load-more-error"];

const helper = createColumnHelper<Person>();

export function StatesDemo() {
  const t = useCopy(copy);
  const { lang } = useLang();
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [keepStale, setKeepStale] = useState(true);
  const [customEmpty, setCustomEmpty] = useState(false);
  const [recoveries, setRecoveries] = useState(0);
  const data = useMemo(() => makePeople(lang, 12), [lang]);

  const columns = useMemo(() => [
    // Two grow columns rather than one: a lone grow column absorbs the entire surplus, which on
    // a wide page turns an e-mail cell into half the table.
    helper.accessor("name", {
      header: t.name,
      minSize: 110
    }),
    helper.accessor("role", {
      header: t.role,
      size: 140
    }),
    helper.accessor("status", {
      header: t.status,
      size: 110,
      cell: context => <StatusBadge status={context.getValue()} />
    }),
    helper.accessor("email", {
      header: t.email,
      minSize: 200,
      meta: { truncate: true }
    }),
    helper.accessor("joinedAt", {
      header: t.joinedAt,
      size: 130
    })
  ], [t]);

  const recover = () => {
    setRecoveries(count => count + 1);
    setScenario("normal");
  };

  const shownData = scenario === "empty" || (scenario === "error" && !keepStale) ? [] : data;

  return (
    <>
      <Group gap="md">
        <SegmentedControl
          aria-label={t.scenario}
          role="radiogroup"
          size="xs"
          value={scenario}
          data={SCENARIOS.map(value => {
            return { value, label: t.scenarios[value] };
          })}
          onChange={value => setScenario(value as Scenario)}
        />

        <Switch
          checked={keepStale}
          description={t.keepStaleHint}
          label={t.keepStale}
          size="xs"
          onChange={event => setKeepStale(event.currentTarget.checked)}
        />

        <Switch
          checked={customEmpty}
          description={t.customEmptyHint}
          label={t.customEmpty}
          size="xs"
          onChange={event => setCustomEmpty(event.currentTarget.checked)}
        />

        <Text c="dimmed" size="xs">
          {t.recovered(recoveries)}
        </Text>
      </Group>

      <DataTable
        enableGlobalFilter
        columns={columns}
        data={shownData}
        error={scenario === "error"}
        flex={1}
        getRowId={person => person.id}
        globalFilter={scenario === "no-results" ? t.noMatch : ""}
        loading={scenario === "loading"}
        loadMoreError={scenario === "load-more-error"}
        mih={0}
        emptyState={customEmpty
          ? (
              <Stack align="center" gap="xs" py="xl">
                <Text fw={600}>{t.emptyTitle}</Text>

                <Text c="dimmed" size="sm">
                  {t.emptyBody}
                </Text>

                <Button size="xs" variant="light" onClick={recover}>
                  {t.emptyAction}
                </Button>
              </Stack>
            )
          : undefined}
        onEndReached={scenario === "load-more-error" ? recover : undefined}
        onRetry={recover}
      />
    </>
  );
}
