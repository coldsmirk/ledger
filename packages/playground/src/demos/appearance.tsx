import type { Product } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { Badge, Group, SegmentedControl, Switch } from "@mantine/core";
import { useMemo, useState } from "react";

import { makeProducts } from "../data";
import { useCopy, useLang } from "../i18n";

const copy = {
  en: {
    name: "Product",
    spec: "Spec",
    warehouse: "Bin",
    price: "Price",
    stock: "Stock",
    status: "Status",
    listed: "On sale",
    delisted: "Delisted",
    borders: "Borders",
    frame: "Frame + rows",
    grid: "Grid (spreadsheet)",
    horizontal: "Row lines only",
    rounded: "Rounded",
    closingLine: "Closing line",
    striped: "Stripes",
    hover: "Hover",
    roomy: "Roomy rows",
    loading: "Loading",
    empty: "No data",
    tintedHeader: "Tinted header",
    showHeader: "Show header"
  },
  zh: {
    name: "品名",
    spec: "规格",
    warehouse: "仓位",
    price: "单价",
    stock: "库存",
    status: "状态",
    listed: "在售",
    delisted: "下架",
    borders: "边框",
    frame: "外框 + 横线",
    grid: "网格（电子表格）",
    horizontal: "纯横线",
    rounded: "圆角",
    closingLine: "收口线",
    striped: "斑马纹",
    hover: "悬停高亮",
    roomy: "宽松行距",
    loading: "加载中",
    empty: "空数据",
    tintedHeader: "表头底色",
    showHeader: "显示表头"
  }
};

const helper = createColumnHelper<Product>();

export function AppearanceDemo() {
  const t = useCopy(copy);
  const { lang } = useLang();
  const data = useMemo(() => makeProducts(lang, 40), [lang]);
  const [borders, setBorders] = useState("frame");
  const [rounded, setRounded] = useState(true);
  const [closingLine, setClosingLine] = useState(false);
  const [striped, setStriped] = useState(false);
  const [hover, setHover] = useState(true);
  const [roomy, setRoomy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [tintedHeader, setTintedHeader] = useState(false);
  const [showHeader, setShowHeader] = useState(true);

  const columns = useMemo(() => [
    helper.accessor("sku", { header: "SKU", size: 120 }),
    helper.accessor("name", { header: t.name, size: 180 }),
    helper.accessor("spec", { header: t.spec, size: 110 }),
    helper.accessor("warehouse", { header: t.warehouse, size: 100 }),
    helper.accessor("price", {
      header: t.price,
      size: 120,
      cell: context => context.getValue().toFixed(2),
      meta: { align: "end" }
    }),
    helper.accessor("stock", {
      header: t.stock,
      size: 100,
      meta: { align: "end" }
    }),
    helper.accessor("listed", {
      header: t.status,
      size: 100,
      cell: context => (
        <Badge color={context.getValue() ? "teal" : "gray"} size="sm" variant="light">
          {context.getValue() ? t.listed : t.delisted}
        </Badge>
      )
    })
  ], [t]);

  /* The three border shapes, expressed by the Mantine border props. */
  const borderPresets = [
    { value: "frame", label: t.frame },
    { value: "grid", label: t.grid },
    { value: "horizontal", label: t.horizontal }
  ];

  return (
    <>
      <Group gap="lg">
        <SegmentedControl
          aria-label={t.borders}
          data={borderPresets}
          role="radiogroup"
          size="xs"
          value={borders}
          onChange={setBorders}
        />

        <Switch
          checked={rounded}
          label={t.rounded}
          size="xs"
          onChange={event => setRounded(event.currentTarget.checked)}
        />

        <Switch
          checked={closingLine}
          label={t.closingLine}
          size="xs"
          onChange={event => setClosingLine(event.currentTarget.checked)}
        />

        <Switch
          checked={striped}
          label={t.striped}
          size="xs"
          onChange={event => setStriped(event.currentTarget.checked)}
        />

        <Switch
          checked={hover}
          label={t.hover}
          size="xs"
          onChange={event => setHover(event.currentTarget.checked)}
        />

        <Switch
          checked={roomy}
          label={t.roomy}
          size="xs"
          onChange={event => setRoomy(event.currentTarget.checked)}
        />

        <Switch
          checked={loading}
          label={t.loading}
          size="xs"
          onChange={event => setLoading(event.currentTarget.checked)}
        />

        <Switch
          checked={empty}
          label={t.empty}
          size="xs"
          onChange={event => setEmpty(event.currentTarget.checked)}
        />

        <Switch
          checked={tintedHeader}
          label={t.tintedHeader}
          size="xs"
          onChange={event => setTintedHeader(event.currentTarget.checked)}
        />

        <Switch
          checked={showHeader}
          label={t.showHeader}
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
        loading={loading}
        mih={0}
        radius={rounded ? "md" : undefined}
        striped={striped}
        verticalSpacing={roomy ? "md" : "xs"}
        withBottomBorder={closingLine}
        withColumnBorders={borders === "grid"}
        withColumnHeaders={showHeader}
        withTableBorder={borders !== "horizontal"}
      />
    </>
  );
}
