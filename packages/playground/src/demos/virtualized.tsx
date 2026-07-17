import { DataTable } from "@coldsmirk/ledger-mantine";
import { Text } from "@mantine/core";
import { useMemo, useState } from "react";

import { makePeople } from "../data";
import { personColumns } from "./columns";

const PAGE = 10_000;
const TOTAL = 50_000;

export function VirtualizedDemo() {
  // The whole set is generated once (unique ids); "loading more" reveals the next slice.
  const all = useMemo(() => makePeople(TOTAL), []);
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
        {`已加载 ${data.length.toLocaleString()} 行（滚动到底部自动追加，上限 ${TOTAL.toLocaleString()} 行）`}
      </Text>

      <DataTable
        tabularNums
        virtualized
        withTableBorder
        columns={personColumns}
        data={data}
        flex={1}
        getRowId={person => person.id}
        loadingMore={loadingMore}
        mih={0}
        onEndReached={loadMore}
      />
    </>
  );
}
