import type { ColumnDef, DataTableHandle } from "@coldsmirk/ledger-mantine";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { Group, Select, Text } from "@mantine/core";
import { useMemo, useRef, useState } from "react";

import { useCopy } from "../i18n";

/**
 * Column virtualization: a year of daily sales across 300 stores — 361 leaf columns, both axes
 * windowed. The month groups clamp to their rendered days as the window slides through them,
 * the pinned store column never leaves, and the month picker reaches an unrendered column
 * through `scrollToColumn`.
 */
const MONTH_DAYS = 30;
const STORE_COUNT = 300;

const copy = {
  en: {
    store: "Store",
    storeName: (index: number) => `Store ${String(index + 1).padStart(3, "0")}`,
    month: (month: number) => `M${month + 1}`,
    monthLong: (month: number) => `Month ${month + 1}`,
    day: (day: number) => `D${day + 1}`,
    jumpLabel: "Jump to month",
    matrix: (columns: string, rows: string) => `${columns} columns × ${rows} rows — only the visible window of each axis is in the DOM`
  },
  zh: {
    store: "门店",
    storeName: (index: number) => `门店 ${String(index + 1).padStart(3, "0")}`,
    month: (month: number) => `${month + 1} 月`,
    monthLong: (month: number) => `${month + 1} 月`,
    day: (day: number) => `${day + 1} 日`,
    jumpLabel: "跳转到月份",
    matrix: (columns: string, rows: string) => `${columns} 列 × ${rows} 行——两个轴都只有可见窗口在 DOM 里`
  }
};

interface Store {
  id: string;
  index: number;
}

const STORES: Store[] = Array.from({ length: STORE_COUNT }, (_, index) => {
  return {
    id: `store-${index + 1}`,
    index
  };
});

/* Deterministic figures — the demo re-renders identically in both languages. */
function salesOf(store: number, month: number, day: number) {
  return ((store * 31 + month * 97 + day * 13) % 900) + 100;
}

const helper = createColumnHelper<Store>();

export function ColumnVirtualizationDemo() {
  const t = useCopy(copy);
  const handle = useRef<DataTableHandle<Store>>(null);
  const [month, setMonth] = useState<string | null>(null);

  const columns = useMemo<Array<ColumnDef<Store, any>>>(() => [
    helper.accessor(store => t.storeName(store.index), {
      id: "store",
      header: t.store,
      size: 120
    }),
    ...Array.from({ length: 12 }, (_, monthIndex) => helper.group({
      id: `m${monthIndex}`,
      header: t.month(monthIndex),
      columns: helper.columns(Array.from({ length: MONTH_DAYS }, (_, dayIndex) => helper.accessor(
        store => salesOf(store.index, monthIndex, dayIndex),
        {
          id: `m${monthIndex}-d${dayIndex}`,
          header: t.day(dayIndex),
          size: 76,
          meta: { align: "end" as const }
        }
      )))
    }))
  ], [t]);

  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => {
      return {
        label: t.monthLong(index),
        value: String(index)
      };
    }),
    [t]
  );

  const jumpToMonth = (value: string | null) => {
    setMonth(value);

    if (value !== null) {
      // An instant jump: a discrete leap renders its window synchronously, so the month is
      // there the moment it lands — smooth-scrolling twenty thousand pixels through windows
      // that render behind the animation is theater with a blank stage.
      handle.current?.scrollToColumn(`m${value}-d0`, { align: "start" });
    }
  };

  return (
    <>
      <Group gap="xs">
        <Select
          aria-label={t.jumpLabel}
          data={monthOptions}
          placeholder={t.jumpLabel}
          size="xs"
          value={month}
          w={140}
          onChange={jumpToMonth}
        />

        <Text c="dimmed" size="xs">
          {t.matrix((12 * MONTH_DAYS + 1).toLocaleString(), STORE_COUNT.toLocaleString())}
        </Text>
      </Group>

      <DataTable
        tabularNums
        virtualizedColumns
        virtualizedRows
        columns={columns}
        data={STORES}
        defaultColumnPinning={{ end: [], start: ["store"] }}
        flex={1}
        getRowId={store => store.id}
        handleRef={handle}
        mih={0}
      />
    </>
  );
}
