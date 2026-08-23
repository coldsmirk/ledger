import type { Product } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { zhCN } from "@coldsmirk/ledger-mantine/locales";
import { Badge, Group, SegmentedControl, Switch } from "@mantine/core";
import { useMemo, useState } from "react";

import { makeProducts } from "../data";

const helper = createColumnHelper<Product>();

const columns = [
  helper.accessor("sku", { header: "SKU", size: 120 }),
  helper.accessor("name", { header: "品名", size: 150 }),
  helper.accessor("spec", { header: "规格", size: 110 }),
  helper.accessor("warehouse", { header: "仓位", size: 100 }),
  helper.accessor("price", {
    header: "单价",
    size: 120,
    cell: context => context.getValue().toFixed(2),
    meta: { align: "end" }
  }),
  helper.accessor("stock", {
    header: "库存",
    size: 100,
    meta: { align: "end" }
  }),
  helper.accessor("listed", {
    header: "状态",
    size: 100,
    cell: context => (
      <Badge color={context.getValue() ? "teal" : "gray"} size="sm" variant="light">
        {context.getValue() ? "在售" : "下架"}
      </Badge>
    )
  })
];

/* The three border shapes EP ships as table variants, expressed by the Mantine border props. */
const BORDER_PRESETS = [
  { value: "frame", label: "外框 + 横线" },
  { value: "grid", label: "网格（电子表格）" },
  { value: "horizontal", label: "纯横线" }
];

export function AppearanceDemo() {
  const data = useMemo(() => makeProducts(40), []);
  const [borders, setBorders] = useState("frame");
  const [striped, setStriped] = useState(false);
  const [hover, setHover] = useState(true);
  const [roomy, setRoomy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [tintedHeader, setTintedHeader] = useState(false);
  const [showHeader, setShowHeader] = useState(true);

  return (
    <>
      <Group gap="lg">
        <SegmentedControl data={BORDER_PRESETS} size="xs" value={borders} onChange={setBorders} />

        <Switch
          checked={striped}
          label="斑马纹"
          size="xs"
          onChange={event => setStriped(event.currentTarget.checked)}
        />

        <Switch
          checked={hover}
          label="悬停高亮"
          size="xs"
          onChange={event => setHover(event.currentTarget.checked)}
        />

        <Switch
          checked={roomy}
          label="宽松行距"
          size="xs"
          onChange={event => setRoomy(event.currentTarget.checked)}
        />

        <Switch
          checked={loading}
          label="加载中"
          size="xs"
          onChange={event => setLoading(event.currentTarget.checked)}
        />

        <Switch
          checked={empty}
          label="空数据"
          size="xs"
          onChange={event => setEmpty(event.currentTarget.checked)}
        />

        <Switch
          checked={tintedHeader}
          label="表头底色"
          size="xs"
          onChange={event => setTintedHeader(event.currentTarget.checked)}
        />

        <Switch
          checked={showHeader}
          label="显示表头"
          size="xs"
          onChange={event => setShowHeader(event.currentTarget.checked)}
        />
      </Group>

      <DataTable
        tabularNums
        // The header tint has no prop by design (it would not match Mantine's own bare
        // `<thead>`); it is a CSS variable an application sets, reached here through the
        // Styles API's root slot. See app.css.
        classNames={{ root: tintedHeader ? "app-tinted-header" : "" }}
        columns={columns}
        data={empty ? [] : data}
        flex={1}
        getRowId={product => product.id}
        highlightOnHover={hover}
        labels={zhCN}
        loading={loading}
        mih={0}
        striped={striped}
        verticalSpacing={roomy ? "md" : "xs"}
        withColumnBorders={borders === "grid"}
        withColumnHeaders={showHeader}
        withTableBorder={borders !== "horizontal"}
      />
    </>
  );
}
