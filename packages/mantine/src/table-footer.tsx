import type { Table } from "@tanstack/react-table";

/**
 * Column footers (totals row). Rendered only when at least one leaf column declares a `footer`;
 * pinned columns keep their sticky offsets so the totals track their columns.
 */
import { Table as MantineTable } from "@mantine/core";
import { flexRender } from "@tanstack/react-table";

import { useDataTableContext } from "./context";
import { pinnedCellStyle, pinnedEdge } from "./pinning";

export function tableHasFooter<TData>(table: Table<TData>): boolean {
  return table.getVisibleLeafColumns().some(column => column.columnDef.footer !== undefined);
}

export function TableFooter<TData>({
  table,
  ariaRowIndexStart
}: {
  table: Table<TData>;
  ariaRowIndexStart?: number;
}) {
  const { getStyles } = useDataTableContext();

  return (
    <MantineTable.Tfoot {...getStyles("tfoot")}>
      {table.getFooterGroups().map((footerGroup, groupIndex) => (
        <MantineTable.Tr
          key={footerGroup.id}
          aria-rowindex={ariaRowIndexStart === undefined ? undefined : ariaRowIndexStart + groupIndex}
          role="row"
          {...getStyles("footerRow")}
        >
          {footerGroup.headers.map(footer => (
            <MantineTable.Th
              key={footer.id}
              colSpan={footer.colSpan}
              data-align={footer.column.columnDef.meta?.align}
              data-pinned={footer.column.getIsPinned() || undefined}
              data-pinned-edge={pinnedEdge(footer.column)}
              // Totals are data, not headers — under the ARIA table they are plain cells.
              role="cell"
              {...getStyles("footerCell", { style: pinnedCellStyle(footer.column) })}
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
