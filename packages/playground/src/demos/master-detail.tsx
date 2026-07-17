import type { Order } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { Badge, Table, Text } from "@mantine/core";
import { useMemo } from "react";

import { makeOrders } from "../data";

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

const helper = createColumnHelper<Order>();

const columns = [
  helper.accessor("orderNo", { header: "订单号", size: 160 }),
  helper.accessor("customer", { header: "客户", size: 130 }),
  helper.accessor("status", {
    header: "状态",
    size: 120,
    cell: context => (
      <Badge color={statusColor[context.getValue()]} size="sm" variant="light">
        {statusLabel[context.getValue()]}
      </Badge>
    )
  }),
  helper.accessor("quantity", {
    header: "件数",
    size: 100,
    meta: { align: "end" }
  }),
  helper.accessor("amount", {
    header: "金额",
    size: 140,
    cell: context => context.getValue().toFixed(2),
    meta: { align: "end" }
  }),
  helper.accessor("placedAt", { header: "下单日期", size: 140 })
];

function OrderItems({ order }: { order: Order }) {
  return (
    <>
      <Table horizontalSpacing="md" verticalSpacing={4} w="60%">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>商品</Table.Th>
            <Table.Th ta="end">单价</Table.Th>
            <Table.Th ta="end">数量</Table.Th>
            <Table.Th ta="end">小计</Table.Th>
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
        {`共 ${order.items.length} 项，合计 ${order.amount.toFixed(2)}`}
      </Text>
    </>
  );
}

export function MasterDetailDemo() {
  const data = useMemo(() => makeOrders(40, 53), []);

  return (
    <DataTable
      tabularNums
      withTableBorder
      columns={columns}
      data={data}
      flex={1}
      getRowId={order => order.id}
      mih={0}
      renderDetailPanel={row => <OrderItems order={row.original} />}
    />
  );
}
