import type { DataTableHandle } from "@coldsmirk/ledger-mantine";

import type { LogEntry } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { zhCN } from "@coldsmirk/ledger-mantine/locales";
import { Badge, Button, Group, NumberInput, Text } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";

import { makeLogs } from "../data";

const PAGE = 10_000;
const TOTAL = 50_000;

const levelColor: Record<LogEntry["level"], string> = {
  info: "blue",
  warn: "yellow",
  error: "red"
};

const helper = createColumnHelper<LogEntry>();

const columns = [
  helper.accessor("time", {
    header: "时间",
    size: 170
  }),
  helper.accessor("level", {
    header: "级别",
    size: 90,
    cell: context => (
      <Badge color={levelColor[context.getValue()]} size="sm" variant="light">
        {context.getValue()}
      </Badge>
    )
  }),
  helper.accessor("actor", {
    header: "操作人",
    size: 110
  }),
  helper.accessor("action", {
    header: "动作",
    size: 140
  }),
  helper.accessor("target", {
    header: "对象",
    minSize: 160
  }),
  helper.accessor("ip", {
    header: "来源 IP",
    size: 150
  })
];

export function VirtualizedDemo() {
  // The whole stream is generated once (unique ids); "loading more" reveals the next slice.
  const all = useMemo(() => makeLogs(TOTAL), []);
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lineNumber, setLineNumber] = useState<number | string>(7500);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const handle = useRef<DataTableHandle<LogEntry>>(null);

  const data = useMemo(() => all.slice(0, visibleCount), [all, visibleCount]);

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
          aria-label="跳转到第几条"
          max={TOTAL}
          min={1}
          size="xs"
          value={lineNumber}
          w={120}
          onChange={setLineNumber}
        />

        <Button size="xs" variant="default" onClick={jumpToLine}>
          跳转并定位
        </Button>

        <Text c="dimmed" size="xs">
          {`已加载 ${data.length.toLocaleString()} 条日志（滚动到底部自动追加，上限 ${TOTAL.toLocaleString()} 条）`}
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
        labels={zhCN}
        loadingMore={loadingMore}
        mih={0}
        onActiveRowIdChange={setActiveRowId}
        onEndReached={loadMore}
      />
    </>
  );
}
