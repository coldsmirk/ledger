import type { Order } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { Badge, Table, Text } from "@mantine/core";
import { useMemo } from "react";

import { makeOrders } from "../data";
import { useCopy, useLang } from "../i18n";

const copy = {
  en: {
    orderNo: "Order",
    customer: "Customer",
    status: "Status",
    quantity: "Items",
    amount: "Amount",
    placedAt: "Placed",
    product: "Product",
    unitPrice: "Unit price",
    lineQuantity: "Qty",
    subtotal: "Subtotal",
    total: (count: number, amount: string) => `${count} line items, ${amount} in total`,
    statuses: {
      pending: "Pending",
      paid: "Paid",
      shipped: "Shipped",
      completed: "Completed",
      cancelled: "Cancelled"
    }
  },
  zh: {
    orderNo: "订单号",
    customer: "客户",
    status: "状态",
    quantity: "件数",
    amount: "金额",
    placedAt: "下单日期",
    product: "商品",
    unitPrice: "单价",
    lineQuantity: "数量",
    subtotal: "小计",
    total: (count: number, amount: string) => `共 ${count} 项，合计 ${amount}`,
    statuses: {
      pending: "待支付",
      paid: "已支付",
      shipped: "已发货",
      completed: "已完成",
      cancelled: "已取消"
    }
  }
};

const statusColor: Record<Order["status"], string> = {
  pending: "yellow",
  paid: "blue",
  shipped: "violet",
  completed: "teal",
  cancelled: "gray"
};

const helper = createColumnHelper<Order>();

function OrderItems({ order }: { order: Order }) {
  const t = useCopy(copy);

  return (
    <>
      <Table horizontalSpacing="md" verticalSpacing={4} w="60%">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t.product}</Table.Th>
            <Table.Th ta="end">{t.unitPrice}</Table.Th>
            <Table.Th ta="end">{t.lineQuantity}</Table.Th>
            <Table.Th ta="end">{t.subtotal}</Table.Th>
          </Table.Tr>
        </Table.Thead>

        <Table.Tbody>
          {order.items.map(item => (
            <Table.Tr key={item.id}>
              <Table.Td>{item.product}</Table.Td>
              <Table.Td ta="end">{item.unitPrice.toFixed(2)}</Table.Td>
              <Table.Td ta="end">{item.quantity}</Table.Td>
              <Table.Td ta="end">{(item.unitPrice * item.quantity).toFixed(2)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Text fw={600} mt="xs" size="sm">
        {t.total(order.items.length, order.amount.toFixed(2))}
      </Text>
    </>
  );
}

export function MasterDetailDemo() {
  const t = useCopy(copy);
  const { lang } = useLang();
  const data = useMemo(() => makeOrders(lang, 40, 53), [lang]);

  const columns = useMemo(() => [
    helper.accessor("orderNo", { header: t.orderNo, size: 160 }),
    helper.accessor("customer", { header: t.customer, size: 130 }),
    helper.accessor("status", {
      header: t.status,
      size: 120,
      cell: context => (
        <Badge color={statusColor[context.getValue()]} size="sm" variant="light">
          {t.statuses[context.getValue()]}
        </Badge>
      )
    }),
    helper.accessor("quantity", {
      header: t.quantity,
      size: 100,
      meta: { align: "end" }
    }),
    helper.accessor("amount", {
      header: t.amount,
      size: 140,
      cell: context => context.getValue().toFixed(2),
      meta: { align: "end" }
    }),
    helper.accessor("placedAt", { header: t.placedAt, size: 140 })
  ], [t]);

  return (
    <DataTable
      tabularNums
      columns={columns}
      data={data}
      flex={1}
      getRowId={order => order.id}
      mih={0}
      renderDetailPanel={row => <OrderItems order={row.original} />}
    />
  );
}
