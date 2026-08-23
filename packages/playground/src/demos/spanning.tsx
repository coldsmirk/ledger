import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { Text } from "@mantine/core";
import { useMemo } from "react";

import { useCopy } from "../i18n";

/**
 * The classic report shape: adjacent equal cells merge vertically (`spanRows`), and the total
 * row merges its label across the dimension columns (`spanColumns`). Both switches live on the
 * raw TanStack defs. Deliberately no stripes — a merged cell paints one background across its
 * run, so the frame comes from row and column borders instead; this is the one demo whose
 * subject needs the grid, since the borders are what make a span's extent readable.
 *
 * Every column declares a `size`, so there is no grow column and the width engine spreads any
 * surplus over all five (docs/sizing.md#column-widths) — across a full-width page that inflates
 * a two-character dimension column past 300px. A fixed report is not an elastic table: `maw`
 * and `h="auto"` state its real size, and the frame then hugs it instead of stretching to the
 * page. Both are plain Mantine `BoxProps` — a constraint, not a mode.
 */
const copy = {
  en: {
    region: "Region",
    city: "City",
    channel: "Channel",
    revenue: "Revenue (10k CNY)",
    growth: "MoM",
    grandTotal: "Total",
    regions: {
      east: "East",
      south: "South",
      north: "North"
    },
    cities: {
      shanghai: "Shanghai",
      hangzhou: "Hangzhou",
      shenzhen: "Shenzhen",
      guangzhou: "Guangzhou",
      beijing: "Beijing"
    },
    channels: {
      online: "Online",
      store: "Store"
    }
  },
  zh: {
    region: "区域",
    city: "城市",
    channel: "渠道",
    revenue: "营收（万元）",
    growth: "环比",
    grandTotal: "总计",
    regions: {
      east: "华东",
      south: "华南",
      north: "华北"
    },
    cities: {
      shanghai: "上海",
      hangzhou: "杭州",
      shenzhen: "深圳",
      guangzhou: "广州",
      beijing: "北京"
    },
    channels: {
      online: "线上",
      store: "门店"
    }
  }
};

type RegionKey = keyof typeof copy.en.regions;

type CityKey = keyof typeof copy.en.cities;

type ChannelKey = keyof typeof copy.en.channels;

/**
 * The figures are the report; the place and channel names are looked up per language.
 */
interface ReportFact {
  id: string;
  region: RegionKey;
  city: CityKey;
  channel: ChannelKey;
  revenue: number;
  growth: number;
}

const FACTS: ReportFact[] = [
  {
    id: "1",
    region: "east",
    city: "shanghai",
    channel: "online",
    revenue: 2864.5,
    growth: 12.4
  },
  {
    id: "2",
    region: "east",
    city: "shanghai",
    channel: "store",
    revenue: 1732,
    growth: -3.1
  },
  {
    id: "3",
    region: "east",
    city: "hangzhou",
    channel: "online",
    revenue: 1955.8,
    growth: 8.9
  },
  {
    id: "4",
    region: "east",
    city: "hangzhou",
    channel: "store",
    revenue: 887.3,
    growth: 4.2
  },
  {
    id: "5",
    region: "south",
    city: "shenzhen",
    channel: "online",
    revenue: 2231.6,
    growth: 15.7
  },
  {
    id: "6",
    region: "south",
    city: "shenzhen",
    channel: "store",
    revenue: 1146.9,
    growth: 1.8
  },
  {
    id: "7",
    region: "south",
    city: "guangzhou",
    channel: "online",
    revenue: 1608.2,
    growth: -1.5
  },
  {
    id: "8",
    region: "north",
    city: "beijing",
    channel: "online",
    revenue: 2472.4,
    growth: 6.3
  },
  {
    id: "9",
    region: "north",
    city: "beijing",
    channel: "store",
    revenue: 1385.1,
    growth: 2.6
  }
];

interface ReportRow {
  id: string;
  region: string;
  city: string;
  channel: string;
  revenue: number;
  growth: number;
  total?: boolean;
}

const helper = createColumnHelper<ReportRow>();

function emphasize(value: string, total: boolean | undefined) {
  return total ? <Text span fw={700} size="sm">{value}</Text> : value;
}

export function SpanningDemo() {
  const t = useCopy(copy);

  const data = useMemo((): ReportRow[] => [
    ...FACTS.map(fact => {
      return {
        id: fact.id,
        region: t.regions[fact.region],
        city: t.cities[fact.city],
        channel: t.channels[fact.channel],
        revenue: fact.revenue,
        growth: fact.growth
      };
    }),
    {
      id: "total",
      region: t.grandTotal,
      city: "",
      channel: "",
      revenue: 16_283.8,
      growth: 6.8,
      total: true
    }
  ], [t]);

  const columns = useMemo(() => [
    helper.accessor("region", {
      header: t.region,
      size: 110,
      enableSorting: false,
      // Adjacent equal regions merge down; the total row instead merges ACROSS the three
      // dimension columns so its label owns the left side of the row.
      spanRows: true,
      spanColumns: ({ row }) => row.original.total ? 3 : 1,
      cell: context => emphasize(context.getValue(), context.row.original.total)
    }),
    helper.accessor("city", {
      header: t.city,
      size: 120,
      enableSorting: false,
      spanRows: true
    }),
    helper.accessor("channel", {
      header: t.channel,
      size: 100,
      enableSorting: false
    }),
    helper.accessor("revenue", {
      header: t.revenue,
      size: 180,
      enableSorting: false,
      cell: context => emphasize(context.getValue().toFixed(1), context.row.original.total),
      meta: { align: "end" }
    }),
    helper.accessor("growth", {
      header: t.growth,
      size: 110,
      enableSorting: false,
      cell: context => {
        const value = context.getValue();

        return (
          <Text span c={value >= 0 ? "teal.7" : "red.7"} fw={context.row.original.total ? 700 : undefined} size="sm">
            {value >= 0 ? "+" : ""}
            {value.toFixed(1)}
            %
          </Text>
        );
      },
      meta: { align: "end" }
    })
  ], [t]);

  return (
    <DataTable
      tabularNums
      withColumnBorders
      withTableBorder
      columns={columns}
      data={data}
      getRowId={row => row.id}
      h="auto"
      maw={880}
    />
  );
}
