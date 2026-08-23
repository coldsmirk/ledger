import type { ColumnFiltersState, PaginationState, SortingState } from "@coldsmirk/ledger-mantine";

import type { Person } from "../data";
import type { Lang } from "../i18n";

import { createColumnHelper, DataTable, useDataTable } from "@coldsmirk/ledger-mantine";
import { Badge, Code, Group, Stack, Text } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";

import { makePeople, roleOptions } from "../data";
import { useCopy, useLang } from "../i18n";
import { StatusBadge } from "./columns";

/**
 * The server-backed shape: ledger owns the controls and the state, the backend owns the rows.
 * `sortingMode` / `filterMode` / `paginationMode` are `"server"`, so the matching row models do
 * not run — `data` is exactly one page as the API returned it, and `rowCount` is the total the
 * pager needs. Every state slice is controlled, which is what makes the request derivable.
 */
const copy = {
  en: {
    name: "Name",
    email: "Email",
    role: "Role",
    status: "Status",
    balance: "Balance",
    joinedAt: "Joined",
    searchPlaceholder: "Search name or email",
    pending: "Requesting",
    result: (total: number, requests: number) => `${total} rows · ${requests} requests so far`,
    footnote: (total: number) => `The whole data set holds ${total} people; the table never holds more than the current page, and the total comes from rowCount.`,
    statuses: {
      active: "Active",
      invited: "Invited",
      suspended: "Suspended"
    }
  },
  zh: {
    name: "姓名",
    email: "邮箱",
    role: "角色",
    status: "状态",
    balance: "余额",
    joinedAt: "入职日期",
    searchPlaceholder: "搜索姓名或邮箱",
    pending: "请求中",
    result: (total: number, requests: number) => `${total} 条 · 已发起 ${requests} 次`,
    footnote: (total: number) => `整个数据集有 ${total} 条，表格任何时刻只持有当前一页；合计数来自 rowCount。`,
    statuses: {
      active: "活跃",
      invited: "已邀请",
      suspended: "已停用"
    }
  }
};

const COLLATION: Record<Lang, string> = {
  en: "en",
  zh: "zh-CN"
};

interface PeopleQuery {
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  globalFilter: string;
  pageIndex: number;
  pageSize: number;
  collation: string;
}

interface PeoplePage {
  rows: Person[];
  total: number;
}

function matchesFilters(person: Person, filters: ColumnFiltersState): boolean {
  return filters.every(filter => {
    const value = person[filter.id as keyof Person];

    if (Array.isArray(filter.value)) {
      return filter.value.length === 0 || filter.value.includes(value as never);
    }

    return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
  });
}

function compare(a: Person, b: Person, id: string, collation: string): number {
  const left = a[id as keyof Person];
  const right = b[id as keyof Person];

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right), collation);
}

/**
 * Stands in for the backend: `dataset` is the store, and only one page of it is ever returned.
 */
async function fetchPeople(dataset: Person[], query: PeopleQuery): Promise<PeoplePage> {
  await new Promise(resolve => {
    setTimeout(resolve, 420);
  });

  const term = query.globalFilter.trim().toLowerCase();
  const matched = dataset.filter(person => {
    const hitsTerm = term === ""
      || person.name.toLowerCase().includes(term)
      || person.email.toLowerCase().includes(term);

    return hitsTerm && matchesFilters(person, query.columnFilters);
  });

  const sorted = query.sorting.length === 0
    ? matched
    : matched.toSorted((a, b) => {
        for (const rule of query.sorting) {
          const result = compare(a, b, rule.id, query.collation);

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

export function ServerSideDemo() {
  const t = useCopy(copy);
  const { lang } = useLang();
  const dataset = useMemo(() => makePeople(lang, 437), [lang]);
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

  const columns = useMemo(() => [
    helper.accessor("name", {
      header: t.name,
      minSize: 120,
      meta: { filter: "text" }
    }),
    helper.accessor("email", {
      header: t.email,
      minSize: 200,
      enableSorting: false,
      meta: { truncate: true }
    }),
    helper.accessor("role", {
      header: t.role,
      size: 150,
      // Client mode derives select options from the loaded rows; a server page holds one slice
      // of them, so the options have to be declared.
      meta: {
        filter: {
          variant: "select",
          options: roleOptions(lang)
        }
      }
    }),
    helper.accessor("status", {
      header: t.status,
      size: 120,
      enableSorting: false,
      cell: context => <StatusBadge status={context.getValue()} />,
      meta: {
        filter: {
          variant: "multi-select",
          options: Object.entries(t.statuses).map(([value, label]) => {
            return { value, label };
          })
        }
      }
    }),
    helper.accessor("balance", {
      header: t.balance,
      size: 120,
      cell: context => context.getValue().toFixed(2),
      meta: { align: "end" }
    }),
    helper.accessor("joinedAt", {
      header: t.joinedAt,
      size: 130,
      sortDescFirst: true
    })
  ], [t, lang]);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);

    void fetchPeople(dataset, {
      sorting,
      columnFilters,
      globalFilter,
      pageIndex: pagination.pageIndex,
      pageSize: pagination.pageSize,
      collation: COLLATION[lang]
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
  }, [dataset, lang, sorting, columnFilters, globalFilter, pagination]);

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
        <DataTable.Search placeholder={t.searchPlaceholder} table={table} w={240} />

        <Badge color={loading ? "yellow" : "teal"} variant="light">
          {loading ? t.pending : t.result(page.total, requests)}
        </Badge>
      </Group>

      {/* What the table's state resolves to on the wire: sorting, filtering and paging are
          nothing but query parameters once the row models stop running. */}
      <Code block>{queryLine}</Code>

      <DataTable
        striped
        tabularNums
        flex={1}
        loading={loading}
        mih={0}
        table={table}
      />

      <Text c="dimmed" size="xs">
        {t.footnote(dataset.length)}
      </Text>
    </Stack>
  );
}
