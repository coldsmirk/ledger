import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { Text } from "@mantine/core";
import { useMemo } from "react";

import { useCopy } from "../i18n";

/**
 * Multi-level headers: `helper.group` nests leaf columns under a shared banner, and TanStack
 * resolves the spans — the header renders one `<tr>` per level, with `colSpan` on the group
 * cells and placeholder cells above ungrouped leaves. Nothing about grouping is ledger's own
 * vocabulary; the width engine simply sizes the leaves and the banners follow.
 *
 * Column borders are on for the same reason as the merged-cell report: a banner is only legible
 * if you can see which leaves it covers — and they come with the frame, because a grid whose
 * verticals run off into open space reads as an unfinished border, not as a deliberate one. And
 * like that report this is a fixed-size document, so
 * `maw` / `h="auto"` size it to its content — stretched over a wide page the totals row would
 * float half a screen below the last store it totals.
 */
const copy = {
  en: {
    store: "Store",
    city: "City",
    q1: "Q1",
    q2: "Q2",
    revenue: "Revenue",
    cost: "Cost",
    margin: "Margin",
    marginHint: "Margin = (revenue − cost) / revenue",
    half: "H1 revenue",
    total: "Total",
    stores: {
      "s-1": "Nanjing Road Flagship",
      "s-2": "Lujiazui",
      "s-3": "West Lake Plaza",
      "s-4": "Qianjiang New Town",
      "s-5": "Teemall",
      "s-6": "Zhujiang New Town",
      "s-7": "China World",
      "s-8": "Zhongguancun"
    },
    cities: {
      shanghai: "Shanghai",
      hangzhou: "Hangzhou",
      guangzhou: "Guangzhou",
      beijing: "Beijing"
    }
  },
  zh: {
    store: "门店",
    city: "城市",
    q1: "第一季度",
    q2: "第二季度",
    revenue: "收入",
    cost: "成本",
    margin: "毛利率",
    marginHint: "毛利率 =（收入 − 成本）/ 收入",
    half: "半年收入",
    total: "合计",
    stores: {
      "s-1": "南京东路旗舰店",
      "s-2": "陆家嘴店",
      "s-3": "西湖文化广场店",
      "s-4": "钱江新城店",
      "s-5": "天河城店",
      "s-6": "珠江新城店",
      "s-7": "国贸店",
      "s-8": "中关村店"
    },
    cities: {
      shanghai: "上海",
      hangzhou: "杭州",
      guangzhou: "广州",
      beijing: "北京"
    }
  }
};

type StoreId = keyof typeof copy.en.stores;

type CityKey = keyof typeof copy.en.cities;

/**
 * The figures are the report; store and city names are looked up per language.
 */
interface StoreFact {
  id: StoreId;
  city: CityKey;
  q1Revenue: number;
  q1Cost: number;
  q2Revenue: number;
  q2Cost: number;
}

const FACTS: StoreFact[] = [
  {
    id: "s-1",
    city: "shanghai",
    q1Revenue: 1284.6,
    q1Cost: 802.4,
    q2Revenue: 1436.2,
    q2Cost: 861.1
  },
  {
    id: "s-2",
    city: "shanghai",
    q1Revenue: 962.3,
    q1Cost: 640.8,
    q2Revenue: 1015.7,
    q2Cost: 655.2
  },
  {
    id: "s-3",
    city: "hangzhou",
    q1Revenue: 733.9,
    q1Cost: 512.6,
    q2Revenue: 812.4,
    q2Cost: 548.9
  },
  {
    id: "s-4",
    city: "hangzhou",
    q1Revenue: 548.2,
    q1Cost: 402.7,
    q2Revenue: 521.5,
    q2Cost: 398.3
  },
  {
    id: "s-5",
    city: "guangzhou",
    q1Revenue: 1102.8,
    q1Cost: 706.5,
    q2Revenue: 1188.3,
    q2Cost: 742
  },
  {
    id: "s-6",
    city: "guangzhou",
    q1Revenue: 689.4,
    q1Cost: 498.1,
    q2Revenue: 726.8,
    q2Cost: 505.7
  },
  {
    id: "s-7",
    city: "beijing",
    q1Revenue: 1421.5,
    q1Cost: 880.2,
    q2Revenue: 1502.9,
    q2Cost: 902.6
  },
  {
    id: "s-8",
    city: "beijing",
    q1Revenue: 812.7,
    q1Cost: 596.3,
    q2Revenue: 774.1,
    q2Cost: 588.4
  }
];

type Metric = "q1Revenue" | "q1Cost" | "q2Revenue" | "q2Cost";

interface StoreQuarter extends Record<Metric, number> {
  id: string;
  store: string;
  city: string;
}

/**
 * Totals live in the footer, so they are computed from the same source the cells read.
 */
const TOTALS: Record<Metric, number> = {
  q1Revenue: FACTS.reduce((total, fact) => total + fact.q1Revenue, 0),
  q1Cost: FACTS.reduce((total, fact) => total + fact.q1Cost, 0),
  q2Revenue: FACTS.reduce((total, fact) => total + fact.q2Revenue, 0),
  q2Cost: FACTS.reduce((total, fact) => total + fact.q2Cost, 0)
};

const helper = createColumnHelper<StoreQuarter>();

const money = (value: number) => value.toFixed(1);

/**
 * Every numeric leaf shares one shape; declaring it once keeps the two quarters symmetrical.
 */
function metric(accessor: Metric, header: string) {
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

function marginColumn(id: string, revenue: Metric, cost: Metric, header: string, hint: string) {
  return helper.display({
    id,
    header,
    size: 96,
    cell: context => {
      const row = context.row.original;
      const rate = (row[revenue] - row[cost]) / row[revenue];

      return (
        <Text c={rate >= 0.32 ? "teal.7" : "orange.7"} fw={500} size="sm">
          {(rate * 100).toFixed(1)}
          %
        </Text>
      );
    },
    footer: () => {
      const rate = (TOTALS[revenue] - TOTALS[cost]) / TOTALS[revenue];

      return `${(rate * 100).toFixed(1)}%`;
    },
    meta: {
      align: "end",
      // The Styles API dresses the slot; only a DOM prop can explain the metric on hover.
      headerCellProps: { title: hint },
      footerCellProps: { "data-total": "true" }
    }
  });
}

export function GroupedHeadersDemo() {
  const t = useCopy(copy);

  const data = useMemo((): StoreQuarter[] => FACTS.map(fact => {
    return {
      ...fact,
      store: t.stores[fact.id],
      city: t.cities[fact.city]
    };
  }), [t]);

  const columns = useMemo(() => [
    helper.accessor("store", {
      header: t.store,
      minSize: 190,
      footer: t.total
    }),
    helper.accessor("city", {
      header: t.city,
      size: 110,
      meta: { filter: "select" }
    }),
    helper.group({
      id: "q1",
      header: t.q1,
      meta: { align: "center" },
      // `helper.columns` is v9's variadic-tuple wrapper: it preserves each child's own TValue,
      // which `group`'s `unknown`-valued signature would otherwise reject.
      columns: helper.columns([
        metric("q1Revenue", t.revenue),
        metric("q1Cost", t.cost),
        marginColumn("q1Margin", "q1Revenue", "q1Cost", t.margin, t.marginHint)
      ])
    }),
    helper.group({
      id: "q2",
      header: t.q2,
      meta: { align: "center" },
      columns: helper.columns([
        metric("q2Revenue", t.revenue),
        metric("q2Cost", t.cost),
        marginColumn("q2Margin", "q2Revenue", "q2Cost", t.margin, t.marginHint)
      ])
    }),
    helper.display({
      id: "half",
      header: t.half,
      size: 130,
      cell: context => money(context.row.original.q1Revenue + context.row.original.q2Revenue),
      footer: () => money(TOTALS.q1Revenue + TOTALS.q2Revenue),
      meta: {
        align: "end",
        footerCellProps: { "data-total": "true" }
      }
    })
  ], [t]);

  return (
    <DataTable
      highlightOnHover
      tabularNums
      withColumnBorders
      withTableBorder
      columns={columns}
      data={data}
      getRowId={store => store.id}
      h="auto"
      maw={1100}
    />
  );
}
