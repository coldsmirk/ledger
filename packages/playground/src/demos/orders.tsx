import type { TableInstance } from "@coldsmirk/ledger-mantine";

import type { Order } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { zhCN } from "@coldsmirk/ledger-mantine/locales";
import { Badge, Text } from "@mantine/core";
import { useMemo, useState } from "react";

import { makeOrders } from "../data";

const channelLabel: Record<Order["channel"], string> = {
  web: "网页",
  app: "APP",
  store: "门店",
  phone: "电话"
};

const statusColor: Record<Order["status"], string> = {
  pending: "yellow",
  paid: "blue",
  shipped: "violet",
  completed: "teal",
  cancelled: "gray"
};

const statusLabel: Record<Order["status"], string> = {
  pending: "待支付",
  paid: "已支付",
  shipped: "已发货",
  completed: "已完成",
  cancelled: "已取消"
};

function amountTotal(table: TableInstance<Order>) {
  const total = table
    .getFilteredRowModel()
    .rows
    .reduce((sum, row) => sum + row.getValue<number>("amount"), 0);

  return `合计 ${total.toFixed(2)}`;
}

const helper = createColumnHelper<Order>();

const columns = [
  helper.accessor("orderNo", {
    header: "订单号",
    size: 150,
    meta: { filter: "text" }
  }),
  helper.accessor("customer", {
    header: "客户",
    size: 110,
    meta: { filter: "text" }
  }),
  helper.accessor("channel", {
    header: "渠道",
    size: 100,
    cell: context => channelLabel[context.getValue()],
    meta: {
      filter: {
        variant: "select",
        options: Object.entries(channelLabel).map(([value, text]) => {
          return { value, label: text };
        })
      }
    }
  }),
  helper.accessor("status", {
    header: "状态",
    size: 110,
    cell: context => (
      <Badge color={statusColor[context.getValue()]} size="sm" variant="light">
        {statusLabel[context.getValue()]}
      </Badge>
    ),
    meta: {
      filter: {
        variant: "multi-select",
        options: Object.entries(statusLabel).map(([value, text]) => {
          return { value, label: text };
        })
      }
    }
  }),
  helper.accessor("quantity", {
    header: "件数",
    size: 90,
    meta: { align: "end" }
  }),
  helper.accessor("amount", {
    header: "金额",
    size: 130,
    cell: context => context.getValue().toFixed(2),
    footer: ({ table }) => amountTotal(table as TableInstance<Order>),
    meta: { align: "end", filter: "range" }
  }),
  helper.accessor("placedAt", {
    header: "下单日期",
    size: 150,
    sortDescFirst: true,
    meta: { filter: "date-range" }
  })
];

export function OrdersDemo() {
  const data = useMemo(() => makeOrders(200), []);
  const [activeOrder, setActiveOrder] = useState<string | null>(null);

  return (
    <>
      <Text c="dimmed" size="xs">
        {activeOrder === null
          ? "表头悬停出现筛选与列菜单（五种筛选变体）；合计随筛选联动；点击行查看订单号。"
          : `最近点击：${activeOrder}`}
      </Text>

      <DataTable
        enablePagination
        striped
        tabularNums
        withTableBorder
        columns={columns}
        data={data}
        defaultPagination={{ pageIndex: 0, pageSize: 20 }}
        defaultSorting={[{ id: "placedAt", desc: true }]}
        flex={1}
        getRowId={order => order.id}
        labels={zhCN}
        mih={0}
        onRowClick={row => setActiveOrder(row.original.orderNo)}
      />
    </>
  );
}
