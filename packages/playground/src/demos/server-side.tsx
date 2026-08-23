import type { ColumnFiltersState, PaginationState, SortingState } from "@coldsmirk/ledger-mantine";

import type { Person } from "../data";

import { createColumnHelper, DataTable, useDataTable } from "@coldsmirk/ledger-mantine";
import { zhCN } from "@coldsmirk/ledger-mantine/locales";
import { Badge, Code, Group, Stack, Text } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";

import { makePeople } from "../data";
import { StatusBadge } from "./columns";

/**
 * The server-backed shape: ledger owns the controls and the state, the backend owns the rows.
 * `sortingMode` / `filterMode` / `paginationMode` are `"server"`, so the matching row models do
 * not run — `data` is exactly one page as the API returned it, and `rowCount` is the total the
 * pager needs. Every state slice is controlled, which is what makes the request derivable.
 */

interface PeopleQuery {
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  globalFilter: string;
  pageIndex: number;
  pageSize: number;
}

interface PeoplePage {
  rows: Person[];
  total: number;
}

const ROLE_OPTIONS = ["工程师", "设计师", "产品经理", "运营", "测试"];

const STATUS_OPTIONS = [
  {
    value: "active",
    label: "活跃"
  },
  {
    value: "invited",
    label: "已邀请"
  },
  {
    value: "suspended",
    label: "已停用"
  }
];

/**
 * Stands in for the backend: the whole dataset lives here and never reaches the table.
 */
const DATASET = makePeople(437);

function matchesFilters(person: Person, filters: ColumnFiltersState): boolean {
  return filters.every(filter => {
    const value = person[filter.id as keyof Person];

    if (Array.isArray(filter.value)) {
      return filter.value.length === 0 || filter.value.includes(value as never);
    }

    return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
  });
}

function compare(a: Person, b: Person, id: string): number {
  const left = a[id as keyof Person];
  const right = b[id as keyof Person];

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right), "zh-CN");
}

async function fetchPeople(query: PeopleQuery): Promise<PeoplePage> {
  await new Promise(resolve => {
    setTimeout(resolve, 420);
  });

  const term = query.globalFilter.trim().toLowerCase();
  const matched = DATASET.filter(person => {
    const hitsTerm = term === ""
      || person.name.toLowerCase().includes(term)
      || person.email.toLowerCase().includes(term);

    return hitsTerm && matchesFilters(person, query.columnFilters);
  });

  const sorted = query.sorting.length === 0
    ? matched
    : matched.toSorted((a, b) => {
        for (const rule of query.sorting) {
          const result = compare(a, b, rule.id);

          if (result !== 0) {
            return rule.desc ? -result : result;
          }
        }

        return 0;
      });

  const start = query.pageIndex * query.pageSize;

  return {
    rows: sorted.slice(start, start + query.pageSize),
    total: sorted.length
  };
}

const helper = createColumnHelper<Person>();

const columns = [
  helper.accessor("name", {
    header: "姓名",
    minSize: 120,
    meta: { filter: "text" }
  }),
  helper.accessor("email", {
    header: "邮箱",
    minSize: 200,
    enableSorting: false,
    meta: { truncate: true }
  }),
  helper.accessor("role", {
    header: "角色",
    size: 130,
    // Client mode derives select options from the loaded rows; a server page holds one slice of
    // them, so the options have to be declared.
    meta: {
      filter: {
        variant: "select",
        options: ROLE_OPTIONS
      }
    }
  }),
  helper.accessor("status", {
    header: "状态",
    size: 120,
    enableSorting: false,
    cell: context => <StatusBadge status={context.getValue()} />,
    meta: {
      filter: {
        variant: "multi-select",
        options: STATUS_OPTIONS
      }
    }
  }),
  helper.accessor("balance", {
    header: "余额",
    size: 120,
    cell: context => context.getValue().toFixed(2),
    meta: { align: "end" }
  }),
  helper.accessor("joinedAt", {
    header: "入职日期",
    size: 130,
    sortDescFirst: true
  })
];

export function ServerSideDemo() {
  const [sorting, setSorting] = useState<SortingState>([
    {
      id: "joinedAt",
      desc: true
    }
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10
  });
  const [page, setPage] = useState<PeoplePage>({
    rows: [],
    total: 0
  });
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);

    void fetchPeople({
      sorting,
      columnFilters,
      globalFilter,
      pageIndex: pagination.pageIndex,
      pageSize: pagination.pageSize
    }).then(result => {
      // The guard is the point: filters race each other, and the last request must win.
      if (cancelled) {
        return;
      }

      setPage(result);
      setLoading(false);
      setRequests(count => count + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [sorting, columnFilters, globalFilter, pagination]);

  const table = useDataTable({
    data: page.rows,
    columns,
    getRowId: person => person.id,
    sortingMode: "server",
    filterMode: "server",
    paginationMode: "server",
    rowCount: page.total,
    enableGlobalFilter: true,
    enablePagination: true,
    sorting,
    onSortingChange: setSorting,
    columnFilters,
    onColumnFiltersChange: setColumnFilters,
    globalFilter,
    onGlobalFilterChange: setGlobalFilter,
    // No page-reset wiring here on purpose: a narrowed result set has fewer pages, and ledger
    // already sends `pageIndex` back to 0 on any sorting / column-filter / global-filter change
    // — deterministically, in server mode too, where TanStack's own auto-reset is off
    // (docs/state.md#the-client-server-split). Doing it again here would just fight it.
    pagination,
    onPaginationChange: setPagination
  });

  const queryLine = useMemo(() => {
    const parts = [
      `page=${pagination.pageIndex + 1}`,
      `size=${pagination.pageSize}`,
      sorting.length > 0 ? `sort=${sorting.map(rule => `${rule.id}:${rule.desc ? "desc" : "asc"}`).join(",")}` : null,
      globalFilter.trim() === "" ? null : `q=${globalFilter.trim()}`,
      ...columnFilters.map(filter => `${filter.id}=${Array.isArray(filter.value) ? filter.value.join("|") : String(filter.value)}`)
    ];

    return `GET /api/people?${parts.filter(Boolean).join("&")}`;
  }, [pagination, sorting, globalFilter, columnFilters]);

  return (
    <Stack
      gap="xs"
      style={{
        flex: 1,
        minHeight: 0
      }}
    >
      <Group gap="sm">
        <DataTable.Search labels={zhCN} placeholder="搜索姓名或邮箱" table={table} w={240} />

        <Badge color={loading ? "yellow" : "teal"} variant="light">
          {loading ? "请求中" : `${page.total} 条 · 已发起 ${requests} 次`}
        </Badge>
      </Group>

      {/* What the table's state resolves to on the wire: sorting, filtering and paging are
          nothing but query parameters once the row models stop running. */}
      <Code block>{queryLine}</Code>

      <DataTable
        striped
        tabularNums
        flex={1}
        labels={zhCN}
        loading={loading}
        mih={0}
        table={table}
      />

      <Text c="dimmed" size="xs">
        整个数据集有
        {" "}
        {DATASET.length}
        {" "}
        条，表格任何时刻只持有当前一页；合计数来自 rowCount。
      </Text>
    </Stack>
  );
}
