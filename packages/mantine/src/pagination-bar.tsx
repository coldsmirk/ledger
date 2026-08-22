import type { RowData } from "@tanstack/react-table";
import type { CSSProperties } from "react";

import type { DataTableLabels } from "./labels";
import type { TableInstance } from "./types";

/**
 * The pagination bar: summary on the start side, rows-per-page and page controls on the end
 * side. One core rendering, two skins — the built-in bar (inside <DataTable>, styled through the
 * Styles API) and the standalone `DataTable.Pagination` compound for custom placement.
 * TanStack's 0-based `pageIndex` converts to Mantine `Pagination`'s 1-based `value` here and
 * nowhere else.
 */
import { Group, Pagination, Select, Text, useProps } from "@mantine/core";
import clsx from "clsx";

import { useDataTableContext } from "./context";
import { resolveLabels } from "./labels";

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

interface PaginationBarCoreProps<TData extends RowData> {
  table: TableInstance<TData>;
  labels: DataTableLabels;
  pageSizeOptions: number[];
  className?: string;
  style?: CSSProperties;
}

function PaginationBarCore<TData extends RowData>({
  table,
  labels,
  pageSizeOptions,
  className,
  style
}: PaginationBarCoreProps<TData>) {
  const { pageIndex, pageSize } = table.atoms.pagination.get();
  // `options.rowCount` (server mode) wins inside TanStack; client mode counts pre-paginated rows.
  const total = table.getRowCount();
  const pageCount = Math.max(1, table.getPageCount());
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);

  return (
    <Group className={className} gap="md" justify="space-between" style={style} wrap="wrap">
      <Text c="dimmed" size="sm">
        {labels.paginationSummary(from, to, total)}
      </Text>

      <Group gap="md" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <Text c="dimmed" size="sm">
            {labels.rowsPerPage}
          </Text>

          <Select
            allowDeselect={false}
            data={pageSizeOptions.map(String)}
            size="xs"
            value={String(pageSize)}
            w={84}
            onChange={value => value !== null && table.setPageSize(Number(value))}
          />
        </Group>

        <Pagination
          size="sm"
          total={pageCount}
          value={pageIndex + 1}
          onChange={page => table.setPageIndex(page - 1)}
        />
      </Group>
    </Group>
  );
}

/**
 * The built-in bar rendered by <DataTable> (context-styled).
 */
export function PaginationBar<TData extends RowData>({ table, pageSizeOptions }: { table: TableInstance<TData>; pageSizeOptions: number[] }) {
  const { labels, getStyles } = useDataTableContext();
  const { className, style } = getStyles("paginationBar");

  return (
    <PaginationBarCore
      className={className}
      labels={labels}
      pageSizeOptions={pageSizeOptions}
      style={style}
      table={table}
    />
  );
}

export interface DataTablePaginationProps<TData extends RowData> {
  table: TableInstance<TData>;
  pageSizeOptions?: number[];
  labels?: Partial<DataTableLabels>;
  className?: string;
  style?: CSSProperties;
}

const paginationDefaultProps = {} satisfies Partial<DataTablePaginationProps<RowData>>;

/**
 * Standalone compound (`DataTable.Pagination`) — place it anywhere, theme it via defaultProps.
 */
export function DataTablePagination<TData extends RowData>(props: DataTablePaginationProps<TData>) {
  const {
    table,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    labels,
    className,
    style
  } = useProps("DataTablePagination", paginationDefaultProps, props);

  return (
    <PaginationBarCore
      className={clsx("ledger-pagination-bar", className)}
      labels={resolveLabels(labels)}
      pageSizeOptions={pageSizeOptions}
      style={style}
      table={table}
    />
  );
}
