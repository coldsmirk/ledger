import type { DataTableHandle } from "@coldsmirk/ledger-mantine";

import type { LogEntry } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { Badge, Button, Group, NumberInput, Text } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";

import { makeLogs } from "../data";
import { useCopy, useLang } from "../i18n";

const PAGE = 10_000;
const TOTAL = 50_000;

const copy = {
  en: {
    time: "Time",
    level: "Level",
    actor: "Actor",
    action: "Action",
    target: "Target",
    ip: "Source IP",
    jumpLabel: "Jump to entry number",
    jump: "Jump and reveal",
    loaded: (loaded: string, total: string) => `${loaded} entries loaded — scrolling to the bottom appends more, up to ${total}`
  },
  zh: {
    time: "时间",
    level: "级别",
    actor: "操作人",
    action: "动作",
    target: "对象",
    ip: "来源 IP",
    jumpLabel: "跳转到第几条",
    jump: "跳转并定位",
    loaded: (loaded: string, total: string) => `已加载 ${loaded} 条日志（滚动到底部自动追加，上限 ${total} 条）`
  }
};

const levelColor: Record<LogEntry["level"], string> = {
  info: "blue",
  warn: "yellow",
  error: "red"
};

const helper = createColumnHelper<LogEntry>();

export function VirtualizedDemo() {
  const t = useCopy(copy);
  const { lang } = useLang();
  // The whole stream is generated once per language (unique ids); "loading more" reveals the
  // next slice.
  const all = useMemo(() => makeLogs(lang, TOTAL), [lang]);
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lineNumber, setLineNumber] = useState<number | string>(7500);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const handle = useRef<DataTableHandle<LogEntry>>(null);

  const data = useMemo(() => all.slice(0, visibleCount), [all, visibleCount]);

  const columns = useMemo(() => [
    helper.accessor("time", {
      header: t.time,
      size: 170
    }),
    helper.accessor("level", {
      header: t.level,
      size: 90,
      cell: context => (
        <Badge color={levelColor[context.getValue()]} size="sm" variant="light">
          {context.getValue()}
        </Badge>
      )
    }),
    helper.accessor("actor", {
      header: t.actor,
      size: 130
    }),
    helper.accessor("action", {
      header: t.action,
      size: 190
    }),
    helper.accessor("target", {
      header: t.target,
      minSize: 160
    }),
    helper.accessor("ip", {
      header: t.ip,
      size: 150
    })
  ], [t]);

  const loadMore = () => {
    if (loadingMore || visibleCount >= TOTAL) {
      return;
    }

    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount(previous => Math.min(TOTAL, previous + PAGE));
      setLoadingMore(false);
    }, 600);
  };

  const jumpToLine = () => {
    const index = Math.min(Math.max(Number(lineNumber) || 1, 1), TOTAL) - 1;
    const entry = all[index];

    if (!entry) {
      return;
    }

    // A row outside the loaded slice cannot be scrolled to yet — reveal enough of the stream
    // first and let the effect below do the scrolling once the row actually exists.
    if (index >= visibleCount) {
      setVisibleCount(Math.min(TOTAL, (Math.floor(index / PAGE) + 1) * PAGE));
    }

    setActiveRowId(entry.id);
    setPendingRowId(entry.id);
  };

  useEffect(() => {
    if (pendingRowId === null || data.every(entry => entry.id !== pendingRowId)) {
      return;
    }

    handle.current?.scrollToRow(pendingRowId, { align: "start" });
    setPendingRowId(null);
  }, [pendingRowId, data]);

  return (
    <>
      <Group gap="xs">
        <NumberInput
          allowDecimal={false}
          aria-label={t.jumpLabel}
          max={TOTAL}
          min={1}
          size="xs"
          value={lineNumber}
          w={120}
          onChange={setLineNumber}
        />

        <Button size="xs" variant="default" onClick={jumpToLine}>
          {t.jump}
        </Button>

        <Text c="dimmed" size="xs">
          {t.loaded(data.length.toLocaleString(), TOTAL.toLocaleString())}
        </Text>
      </Group>

      <DataTable
        enableActiveRow
        tabularNums
        virtualized
        activeRowId={activeRowId}
        columns={columns}
        data={data}
        flex={1}
        getRowId={entry => entry.id}
        handleRef={handle}
        loadingMore={loadingMore}
        mih={0}
        onActiveRowIdChange={setActiveRowId}
        onEndReached={loadMore}
      />
    </>
  );
}
