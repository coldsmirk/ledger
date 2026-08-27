import type { Product } from "../data";

import { checkboxEditor, createColumnHelper, DataTable, numberEditor, selectEditor, textEditor } from "@coldsmirk/ledger-mantine";
import { Code, Group, SegmentedControl, Text } from "@mantine/core";
import { useMemo, useState } from "react";

import { makeProducts } from "../data";
import { useCopy, useLang } from "../i18n";

const copy = {
  en: {
    sku: "SKU (read-only)",
    name: "Product (required)",
    stock: "Stock (frozen off sale)",
    warehouse: "Bin (frozen off sale)",
    listed: "On sale (commits on click)",
    price: "Price (read-only)",
    nameRequired: "Product name cannot be empty",
    trigger: "Edit trigger",
    doubleClick: "Double-click to edit",
    click: "Single click to edit",
    lastCommit: "Last commit:",
    noCommit: "nothing yet",
    hint: "The commit is delayed 500ms to mimic a server; empty the product name to see validation block it; Tab moves to the next cell; F2 starts editing from the keyboard; stock and bin are read-only on delisted rows"
  },
  zh: {
    sku: "SKU（只读）",
    name: "品名（必填）",
    stock: "库存（下架不可改）",
    warehouse: "仓位（下架不可改）",
    listed: "上架（点击即提交）",
    price: "单价（只读）",
    nameRequired: "品名不能为空",
    trigger: "编辑触发方式",
    doubleClick: "双击进入编辑",
    click: "单击进入编辑",
    lastCommit: "最近一次提交：",
    noCommit: "尚无提交",
    hint: "模拟服务端 500ms 延迟；把品名清空可看到校验拦截；Tab 移动到相邻单元格；F2 从键盘开始编辑；下架商品的库存与仓位不可编辑"
  }
};

const helper = createColumnHelper<Product>();

/**
 * Off-sale stock is frozen: a per-row gate, not a per-column one.
 */
const onSale = (row: { original: Product }) => row.original.listed;

export function EditingDemo() {
  const t = useCopy(copy);
  const { lang } = useLang();
  const [data, setData] = useState<Product[]>(() => makeProducts(lang, 30));
  const [dataLang, setDataLang] = useState(lang);
  const [lastCommit, setLastCommit] = useState<string | null>(null);

  if (dataLang !== lang) {
    // React's documented "adjust state when a prop changes" pattern. The sample rows are
    // generated per language, so switching starts the stock count over — pending edits included.
    setDataLang(lang);
    setData(makeProducts(lang, 30));
    setLastCommit(null);
  }

  const [trigger, setTrigger] = useState<"double-click" | "click">("double-click");

  const columns = useMemo(() => [
    helper.accessor("sku", { header: t.sku, size: 130 }),
    helper.accessor("name", {
      header: t.name,
      minSize: 180,
      meta: {
        edit: {
          render: textEditor(),
          validate: value => String(value).trim() === "" ? t.nameRequired : null
        }
      }
    }),
    helper.accessor("stock", {
      header: t.stock,
      size: 190,
      meta: {
        align: "end",
        edit: {
          render: numberEditor(),
          enabled: onSale
        }
      }
    }),
    helper.accessor("warehouse", {
      header: t.warehouse,
      size: 190,
      meta: {
        edit: {
          render: selectEditor(["A-01", "A-02", "B-01", "B-02", "C-01"]),
          enabled: onSale
        }
      }
    }),
    helper.accessor("listed", {
      header: t.listed,
      size: 190,
      meta: { align: "center", edit: { instant: checkboxEditor() } }
    }),
    helper.accessor("price", {
      header: t.price,
      size: 130,
      cell: context => context.getValue().toFixed(2),
      meta: { align: "end" }
    })
  ], [t]);

  return (
    <>
      <Group gap="sm">
        <SegmentedControl
          aria-label={t.trigger}
          role="radiogroup"
          size="xs"
          value={trigger}
          data={[
            {
              value: "double-click",
              label: t.doubleClick
            },
            {
              value: "click",
              label: t.click
            }
          ]}
          onChange={value => setTrigger(value as "double-click" | "click")}
        />

        <Text c="dimmed" size="xs">
          {t.lastCommit}
          <Code>{lastCommit ?? t.noCommit}</Code>
        </Text>
      </Group>

      <Text c="dimmed" size="xs">
        {t.hint}
      </Text>

      <DataTable
        enableActiveRow
        tabularNums
        columns={columns}
        data={data}
        editTrigger={trigger}
        flex={1}
        getRowId={product => product.id}
        mih={0}
        onEditCommit={async change => {
          await new Promise(resolve => {
            setTimeout(resolve, 500);
          });

          const columnId = change.column.id as keyof Product;
          setData(previous => previous.map(product => product.id === change.row.original.id
            ? { ...product, [columnId]: change.value }
            : product));
          setLastCommit(`${change.row.original.sku}.${change.column.id}: ${String(change.previousValue)} → ${String(change.value)}`);
        }}
      />
    </>
  );
}
