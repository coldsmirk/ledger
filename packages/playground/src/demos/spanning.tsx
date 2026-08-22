import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { Text } from "@mantine/core";

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
interface ReportRow {
  id: string;
  region: string;
  city: string;
  channel: string;
  revenue: number;
  growth: number;
  total?: boolean;
}

const REPORT: ReportRow[] = [
  {
    id: "1",
    region: "华东",
    city: "上海",
    channel: "线上",
    revenue: 2864.5,
    growth: 12.4
  },
  {
    id: "2",
    region: "华东",
    city: "上海",
    channel: "门店",
    revenue: 1732,
    growth: -3.1
  },
  {
    id: "3",
    region: "华东",
    city: "杭州",
    channel: "线上",
    revenue: 1955.8,
    growth: 8.9
  },
  {
    id: "4",
    region: "华东",
    city: "杭州",
    channel: "门店",
    revenue: 887.3,
    growth: 4.2
  },
  {
    id: "5",
    region: "华南",
    city: "深圳",
    channel: "线上",
    revenue: 2231.6,
    growth: 15.7
  },
  {
    id: "6",
    region: "华南",
    city: "深圳",
    channel: "门店",
    revenue: 1146.9,
    growth: 1.8
  },
  {
    id: "7",
    region: "华南",
    city: "广州",
    channel: "线上",
    revenue: 1608.2,
    growth: -1.5
  },
  {
    id: "8",
    region: "华北",
    city: "北京",
    channel: "线上",
    revenue: 2472.4,
    growth: 6.3
  },
  {
    id: "9",
    region: "华北",
    city: "北京",
    channel: "门店",
    revenue: 1385.1,
    growth: 2.6
  },
  {
    id: "total",
    region: "总计",
    city: "",
    channel: "",
    revenue: 16_283.8,
    growth: 6.8,
    total: true
  }
];

const helper = createColumnHelper<ReportRow>();

function emphasize(value: string, total: boolean | undefined) {
  return total ? <Text span fw={700} size="sm">{value}</Text> : value;
}

const columns = [
  helper.accessor("region", {
    header: "区域",
    size: 110,
    enableSorting: false,
    // Adjacent equal regions merge down; the total row instead merges ACROSS the three
    // dimension columns so its label owns the left side of the row.
    spanRows: true,
    spanColumns: ({ row }) => row.original.total ? 3 : 1,
    cell: context => emphasize(context.getValue(), context.row.original.total)
  }),
  helper.accessor("city", {
    header: "城市",
    size: 110,
    enableSorting: false,
    spanRows: true
  }),
  helper.accessor("channel", {
    header: "渠道",
    size: 100,
    enableSorting: false
  }),
  helper.accessor("revenue", {
    header: "营收（万元）",
    size: 150,
    enableSorting: false,
    cell: context => emphasize(context.getValue().toFixed(1), context.row.original.total),
    meta: { align: "end" }
  }),
  helper.accessor("growth", {
    header: "环比",
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
];

export function SpanningDemo() {
  return (
    <DataTable
      tabularNums
      withColumnBorders
      withTableBorder
      columns={columns}
      data={REPORT}
      getRowId={row => row.id}
      h="auto"
      maw={880}
    />
  );
}
