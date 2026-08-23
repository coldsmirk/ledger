import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { zhCN } from "@coldsmirk/ledger-mantine/locales";
import { Text } from "@mantine/core";

/**
 * Multi-level headers: `helper.group` nests leaf columns under a shared banner, and TanStack
 * resolves the spans — the header renders one `<tr>` per level, with `colSpan` on the group
 * cells and placeholder cells above ungrouped leaves. Nothing about grouping is ledger's own
 * vocabulary; the width engine simply sizes the leaves and the banners follow.
 *
 * Column borders are on for the same reason as the merged-cell report: a banner is only legible
 * if you can see which leaves it covers. And like that report this is a fixed-size document, so
 * `maw` / `h="auto"` size it to its content — stretched over a wide page the totals row would
 * float half a screen below the last store it totals.
 */

interface StoreQuarter {
  id: string;
  store: string;
  city: string;
  q1Revenue: number;
  q1Cost: number;
  q2Revenue: number;
  q2Cost: number;
}

const STORES: StoreQuarter[] = [
  {
    id: "s-1",
    store: "南京东路旗舰店",
    city: "上海",
    q1Revenue: 1284.6,
    q1Cost: 802.4,
    q2Revenue: 1436.2,
    q2Cost: 861.1
  },
  {
    id: "s-2",
    store: "陆家嘴店",
    city: "上海",
    q1Revenue: 962.3,
    q1Cost: 640.8,
    q2Revenue: 1015.7,
    q2Cost: 655.2
  },
  {
    id: "s-3",
    store: "西湖文化广场店",
    city: "杭州",
    q1Revenue: 733.9,
    q1Cost: 512.6,
    q2Revenue: 812.4,
    q2Cost: 548.9
  },
  {
    id: "s-4",
    store: "钱江新城店",
    city: "杭州",
    q1Revenue: 548.2,
    q1Cost: 402.7,
    q2Revenue: 521.5,
    q2Cost: 398.3
  },
  {
    id: "s-5",
    store: "天河城店",
    city: "广州",
    q1Revenue: 1102.8,
    q1Cost: 706.5,
    q2Revenue: 1188.3,
    q2Cost: 742
  },
  {
    id: "s-6",
    store: "珠江新城店",
    city: "广州",
    q1Revenue: 689.4,
    q1Cost: 498.1,
    q2Revenue: 726.8,
    q2Cost: 505.7
  },
  {
    id: "s-7",
    store: "国贸店",
    city: "北京",
    q1Revenue: 1421.5,
    q1Cost: 880.2,
    q2Revenue: 1502.9,
    q2Cost: 902.6
  },
  {
    id: "s-8",
    store: "中关村店",
    city: "北京",
    q1Revenue: 812.7,
    q1Cost: 596.3,
    q2Revenue: 774.1,
    q2Cost: 588.4
  }
];

const helper = createColumnHelper<StoreQuarter>();

const money = (value: number) => value.toFixed(1);

function sum(key: keyof StoreQuarter) {
  return STORES.reduce((total, store) => total + (store[key] as number), 0);
}

/**
 * Totals live in the footer, so they are computed from the same source the cells read.
 */
const TOTALS = {
  q1Revenue: sum("q1Revenue"),
  q1Cost: sum("q1Cost"),
  q2Revenue: sum("q2Revenue"),
  q2Cost: sum("q2Cost")
};

/**
 * Every numeric leaf shares one shape; declaring it once keeps the two quarters symmetrical.
 */
function metric(
  accessor: "q1Revenue" | "q1Cost" | "q2Revenue" | "q2Cost",
  header: string
) {
  return helper.accessor(accessor, {
    header,
    size: 104,
    cell: context => money(context.getValue()),
    footer: () => money(TOTALS[accessor]),
    meta: {
      align: "end",
      footerCellProps: { "data-total": "true" }
    }
  });
}

function marginColumn(id: string, revenue: keyof StoreQuarter, cost: keyof StoreQuarter) {
  return helper.display({
    id,
    header: "毛利率",
    size: 96,
    cell: context => {
      const row = context.row.original;
      const value = (row[revenue] as number) - (row[cost] as number);
      const rate = value / (row[revenue] as number);

      return (
        <Text c={rate >= 0.32 ? "teal.7" : "orange.7"} fw={500} size="sm">
          {(rate * 100).toFixed(1)}
          %
        </Text>
      );
    },
    footer: () => {
      const rate = (TOTALS[revenue as keyof typeof TOTALS] - TOTALS[cost as keyof typeof TOTALS])
        / TOTALS[revenue as keyof typeof TOTALS];

      return `${(rate * 100).toFixed(1)}%`;
    },
    meta: {
      align: "end",
      // The Styles API dresses the slot; only a DOM prop can explain the metric on hover.
      headerCellProps: { title: "毛利率 =（收入 − 成本）/ 收入" },
      footerCellProps: { "data-total": "true" }
    }
  });
}

const columns = [
  helper.accessor("store", {
    header: "门店",
    minSize: 160,
    footer: "合计"
  }),
  helper.accessor("city", {
    header: "城市",
    size: 90,
    meta: { filter: "select" }
  }),
  helper.group({
    id: "q1",
    header: "第一季度",
    meta: { align: "center" },
    // `helper.columns` is v9's variadic-tuple wrapper: it preserves each child's own TValue,
    // which `group`'s `unknown`-valued signature would otherwise reject.
    columns: helper.columns([
      metric("q1Revenue", "收入"),
      metric("q1Cost", "成本"),
      marginColumn("q1Margin", "q1Revenue", "q1Cost")
    ])
  }),
  helper.group({
    id: "q2",
    header: "第二季度",
    meta: { align: "center" },
    columns: helper.columns([
      metric("q2Revenue", "收入"),
      metric("q2Cost", "成本"),
      marginColumn("q2Margin", "q2Revenue", "q2Cost")
    ])
  }),
  helper.display({
    id: "half",
    header: "半年收入",
    size: 116,
    cell: context => money(context.row.original.q1Revenue + context.row.original.q2Revenue),
    footer: () => money(TOTALS.q1Revenue + TOTALS.q2Revenue),
    meta: {
      align: "end",
      footerCellProps: { "data-total": "true" }
    }
  })
];

export function GroupedHeadersDemo() {
  return (
    <DataTable
      highlightOnHover
      tabularNums
      withColumnBorders
      columns={columns}
      data={STORES}
      getRowId={store => store.id}
      h="auto"
      labels={zhCN}
      maw={1060}
    />
  );
}
