import type { TableInstance } from "@coldsmirk/ledger-mantine";

import type { Order } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { zhCN } from "@coldsmirk/ledger-mantine/locales";
import { Badge, Menu, Text } from "@mantine/core";
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
    meta: {
      align: "end",
      filter: "range",
      // Per-cell DOM props: large orders read heavier without a custom cell renderer.
      cellProps: cell => cell.getValue<number>() >= 900 ? { style: { fontWeight: 600 } } : undefined
    }
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; order: Order } | null>(null);

  return (
    <>
      <Text c="dimmed" size="xs">
        {activeOrder === null
          ? "表头悬停出现筛选与列菜单（五种筛选变体）；合计随筛选联动；点击或聚焦表格后用 ↑/↓/Home/End 移动活动行，Enter 查看订单号；右键任意行打开操作菜单；已取消订单经 rowProps 变暗，大额金额经 meta.cellProps 加粗。"
          : `当前订单：${activeOrder}`}
      </Text>

      {/* `onRowContextMenu` is the literal pointer event, so the app owns preventDefault and the
          menu's placement — ledger neither renders a menu nor assumes you want one. */}
      <Menu
        withinPortal
        opened={contextMenu !== null}
        position="bottom-start"
        shadow="md"
        width={180}
        onClose={() => setContextMenu(null)}
      >
        <Menu.Target>
          <div style={{
            position: "fixed",
            left: contextMenu?.x ?? 0,
            top: contextMenu?.y ?? 0,
            width: 1,
            height: 1
          }}
          />
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Label>{contextMenu?.order.orderNo}</Menu.Label>

          <Menu.Item onClick={() => setActiveOrder(contextMenu?.order.orderNo ?? null)}>
            查看订单
          </Menu.Item>

          <Menu.Item onClick={() => void navigator.clipboard?.writeText(contextMenu?.order.orderNo ?? "")}>
            复制订单号
          </Menu.Item>

          <Menu.Item color="red" disabled={contextMenu?.order.status === "cancelled"}>
            取消订单
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <DataTable
        enableActiveRow
        enablePagination
        striped
        tabularNums
        columns={columns}
        data={data}
        defaultPagination={{ pageIndex: 0, pageSize: 20 }}
        defaultSorting={[{ id: "placedAt", desc: true }]}
        flex={1}
        getRowId={order => order.id}
        labels={zhCN}
        mih={0}
        // Per-row DOM props: a state attribute for E2E selectors plus the dimming that goes with it.
        rowProps={row => row.original.status === "cancelled"
          ? {
              "data-cancelled": true,
              style: { opacity: 0.55 },
              title: "该订单已取消"
            }
          : undefined}
        onRowActivate={row => setActiveOrder(row.original.orderNo)}
        onRowContextMenu={(row, event) => {
          event.preventDefault();
          setContextMenu({
            x: event.clientX,
            y: event.clientY,
            order: row.original
          });
        }}
      />
    </>
  );
}
