import type { RowData } from "@tanstack/react-table";

import type { TableInstance } from "./types";

/**
 * Column footers (totals row). Rendered only when at least one leaf column declares a `footer`;
 * pinned columns keep their sticky offsets so the totals track their columns.
 */
import { Table as MantineTable } from "@mantine/core";
import { flexRender } from "@tanstack/react-table";

import { useDataTableContext } from "./context";
import { mergeElementProps, resolveElementProps } from "./element-props";
import { pinnedCellStyle, pinnedEdge } from "./pinning";

export function tableHasFooter<TData extends RowData>(table: TableInstance<TData>): boolean {
  return table.getVisibleLeafColumns().some(column => column.columnDef.footer !== undefined);
}

export function TableFooter<TData extends RowData>({
  table,
  ariaRowIndexStart
}: {
  table: TableInstance<TData>;
  ariaRowIndexStart?: number;
}) {
  const { getStyles, footerRowProps } = useDataTableContext();

  return (
    <MantineTable.Tfoot {...getStyles("tfoot")}>
      {table.getFooterGroups().map((footerGroup, groupIndex) => (
        <MantineTable.Tr
          key={footerGroup.id}
          {...mergeElementProps(resolveElementProps(footerRowProps, footerGroup), {
            "aria-rowindex": ariaRowIndexStart === undefined ? undefined : ariaRowIndexStart + groupIndex,
            role: "row",
            ...getStyles("footerRow")
          })}
        >
          {footerGroup.headers.map(footer => (
            <MantineTable.Th
              key={footer.id}
              {...mergeElementProps(resolveElementProps(footer.column.columnDef.meta?.footerCellProps, footer), {
                colSpan: footer.colSpan,
                "data-align": footer.column.columnDef.meta?.align,
                "data-pinned": footer.column.getIsPinned() || undefined,
                "data-pinned-edge": pinnedEdge(footer.column),
                // Totals are data, not headers — under the ARIA table they are plain cells.
                role: "cell",
                ...getStyles("footerCell", { style: pinnedCellStyle(footer.column) })
              })}
            >
              {footer.isPlaceholder
                ? null
                : flexRender(footer.column.columnDef.footer, footer.getContext())}
            </MantineTable.Th>
          ))}
        </MantineTable.Tr>
      ))}
    </MantineTable.Tfoot>
  );
}
