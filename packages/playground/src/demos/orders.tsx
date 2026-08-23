import type { TableInstance } from "@coldsmirk/ledger-mantine";

import type { Order } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { Badge, Menu, Text } from "@mantine/core";
import { useMemo, useState } from "react";

import { makeOrders } from "../data";
import { useCopy, useLang } from "../i18n";

const copy = {
  en: {
    orderNo: "Order",
    customer: "Customer",
    channel: "Channel",
    status: "Status",
    quantity: "Items",
    amount: "Amount",
    placedAt: "Placed",
    total: (amount: string) => `Total ${amount}`,
    hint: "Hover a header for its filter and column menu (five filter variants); the total follows the filters; click the table or focus it and use ↑/↓/Home/End to move the current row, Enter to read the order number; right-click any row for its actions; cancelled orders are dimmed through rowProps and large amounts bolded through meta.cellProps.",
    current: (orderNo: string) => `Current order: ${orderNo}`,
    view: "View order",
    copyNo: "Copy order number",
    cancel: "Cancel order",
    cancelledTitle: "This order was cancelled",
    channels: {
      web: "Web",
      app: "App",
      store: "Store",
      phone: "Phone"
    },
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
    channel: "渠道",
    status: "状态",
    quantity: "件数",
    amount: "金额",
    placedAt: "下单日期",
    total: (amount: string) => `合计 ${amount}`,
    hint: "表头悬停出现筛选与列菜单（五种筛选变体）；合计随筛选联动；点击或聚焦表格后用 ↑/↓/Home/End 移动活动行，Enter 查看订单号；右键任意行打开操作菜单；已取消订单经 rowProps 变暗，大额金额经 meta.cellProps 加粗。",
    current: (orderNo: string) => `当前订单：${orderNo}`,
    view: "查看订单",
    copyNo: "复制订单号",
    cancel: "取消订单",
    cancelledTitle: "该订单已取消",
    channels: {
      web: "网页",
      app: "APP",
      store: "门店",
      phone: "电话"
    },
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

export function OrdersDemo() {
  const t = useCopy(copy);
  const { lang } = useLang();
  const data = useMemo(() => makeOrders(lang, 200), [lang]);
  const [activeOrder, setActiveOrder] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; order: Order } | null>(null);

  const columns = useMemo(() => [
    helper.accessor("orderNo", {
      header: t.orderNo,
      size: 150,
      meta: { filter: "text" }
    }),
    helper.accessor("customer", {
      header: t.customer,
      size: 130,
      meta: { filter: "text" }
    }),
    helper.accessor("channel", {
      header: t.channel,
      size: 110,
      cell: context => t.channels[context.getValue()],
      meta: {
        filter: {
          variant: "select",
          options: Object.entries(t.channels).map(([value, label]) => {
            return { value, label };
          })
        }
      }
    }),
    helper.accessor("status", {
      header: t.status,
      size: 130,
      cell: context => (
        <Badge color={statusColor[context.getValue()]} size="sm" variant="light">
          {t.statuses[context.getValue()]}
        </Badge>
      ),
      meta: {
        filter: {
          variant: "multi-select",
          options: Object.entries(t.statuses).map(([value, label]) => {
            return { value, label };
          })
        }
      }
    }),
    helper.accessor("quantity", {
      header: t.quantity,
      size: 90,
      meta: { align: "end" }
    }),
    helper.accessor("amount", {
      header: t.amount,
      size: 130,
      cell: context => context.getValue().toFixed(2),
      footer: ({ table }) => {
        const sum = (table as TableInstance<Order>)
          .getFilteredRowModel()
          .rows
          .reduce((total, row) => total + row.getValue<number>("amount"), 0);

        return t.total(sum.toFixed(2));
      },
      meta: {
        align: "end",
        filter: "range",
        // Per-cell DOM props: large orders read heavier without a custom cell renderer.
        cellProps: cell => cell.getValue<number>() >= 900 ? { style: { fontWeight: 600 } } : undefined
      }
    }),
    helper.accessor("placedAt", {
      header: t.placedAt,
      size: 150,
      sortDescFirst: true,
      meta: { filter: "date-range" }
    })
  ], [t]);

  return (
    <>
      <Text c="dimmed" size="xs">
        {activeOrder === null ? t.hint : t.current(activeOrder)}
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
            {t.view}
          </Menu.Item>

          <Menu.Item onClick={() => void navigator.clipboard?.writeText(contextMenu?.order.orderNo ?? "")}>
            {t.copyNo}
          </Menu.Item>

          <Menu.Item color="red" disabled={contextMenu?.order.status === "cancelled"}>
            {t.cancel}
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
        mih={0}
        // Per-row DOM props: a state attribute for E2E selectors plus the dimming that goes with it.
        rowProps={row => row.original.status === "cancelled"
          ? {
              "data-cancelled": true,
              style: { opacity: 0.55 },
              title: t.cancelledTitle
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
