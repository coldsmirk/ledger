import type { Product } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { Code, Text } from "@mantine/core";
import { useState } from "react";

import { makeProducts } from "../data";

const helper = createColumnHelper<Product>();

const columns = [
  helper.accessor("sku", { header: "SKU（只读）", size: 130 }),
  helper.accessor("name", {
    header: "品名（双击编辑，必填）",
    size: 200,
    meta: {
      edit: {
        variant: "text",
        validate: value => String(value).trim() === "" ? "品名不能为空" : null
      }
    }
  }),
  helper.accessor("stock", {
    header: "库存（数字）",
    size: 140,
    meta: { align: "end", edit: "number" }
  }),
  helper.accessor("warehouse", {
    header: "仓位（下拉即提交）",
    size: 170,
    meta: { edit: { variant: "select", options: ["A-01", "A-02", "B-01", "B-02", "C-01"] } }
  }),
  helper.accessor("listed", {
    header: "上架（点击即提交）",
    size: 150,
    meta: { align: "center", edit: "checkbox" }
  }),
  helper.accessor("price", {
    header: "单价（只读）",
    size: 120,
    cell: context => context.getValue().toFixed(2),
    meta: { align: "end" }
  })
];

export function EditingDemo() {
  const [data, setData] = useState<Product[]>(() => makeProducts(30));
  const [lastCommit, setLastCommit] = useState("尚无提交");

  return (
    <>
      <Text c="dimmed" size="xs">
        最近一次提交：
        <Code>{lastCommit}</Code>
        （模拟服务端 500ms 延迟；把品名清空可看到校验拦截；Tab 移动到相邻单元格）
      </Text>

      <DataTable
        tabularNums
        columns={columns}
        data={data}
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
