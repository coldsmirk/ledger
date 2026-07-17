import type { LogEntry } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { Badge, Text } from "@mantine/core";
import { useMemo, useState } from "react";

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
  helper.accessor("time", { header: "时间", size: 170 }),
  helper.accessor("level", {
    header: "级别",
    size: 90,
    cell: context => (
      <Badge color={levelColor[context.getValue()]} size="sm" variant="light">
        {context.getValue()}
      </Badge>
    )
  }),
  helper.accessor("actor", { header: "操作人", size: 110 }),
  helper.accessor("action", { header: "动作", size: 140 }),
  helper.accessor("target", { header: "对象", size: 140 }),
  helper.accessor("ip", { header: "来源 IP", size: 140 })
];

export function VirtualizedDemo() {
  // The whole stream is generated once (unique ids); "loading more" reveals the next slice.
  const all = useMemo(() => makeLogs(TOTAL), []);
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [loadingMore, setLoadingMore] = useState(false);

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

  return (
    <>
      <Text c="dimmed" size="xs">
        {`已加载 ${data.length.toLocaleString()} 条日志（滚动到底部自动追加，上限 ${TOTAL.toLocaleString()} 条）`}
      </Text>

      <DataTable
        tabularNums
        virtualized
        withTableBorder
        columns={columns}
        data={data}
        flex={1}
        getRowId={entry => entry.id}
        loadingMore={loadingMore}
        mih={0}
        onEndReached={loadMore}
      />
    </>
  );
}
