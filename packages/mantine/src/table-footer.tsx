import type { RowData } from "@tanstack/react-table";

import type { Header, TableInstance } from "./types";
import type { ColumnWindowView } from "./use-column-window";

/**
 * Column footers (totals row). Rendered only when at least one leaf column declares a `footer`;
 * pinned columns keep their sticky offsets so the totals track their columns.
 */
import { Table as MantineTable } from "@mantine/core";
import { flexRender } from "@tanstack/react-table";

import { useDataTableContext } from "./context";
import { mergeElementProps, resolveElementProps } from "./element-props";
import { pinnedCellStyle, pinnedEdge } from "./pinning";
import { windowHeaderCells } from "./use-column-window";

/**
 * The footer rows that actually render. `getFooterGroups()` mirrors *every* header level, so a
 * grouped header whose totals live on the leaves yields a trailing group row holding nothing —
 * dead space that still draws row and column borders. A level earns its row by carrying a
 * `footer` of its own, which also lets a group column declare one (previously the leaf-only
 * test dropped the whole region in that case).
 */
export function visibleFooterGroups<TData extends RowData>(table: TableInstance<TData>) {
  return table.getFooterGroups().filter(footerGroup => footerGroup.headers.some(
    footer => !footer.isPlaceholder && footer.column.columnDef.footer !== undefined
  ));
}

export function tableHasFooter<TData extends RowData>(table: TableInstance<TData>): boolean {
  return visibleFooterGroups(table).length > 0;
}

export function TableFooter<TData extends RowData>({
  table,
  ariaRowIndexStart,
  columnWindow
}: {
  table: TableInstance<TData>;
  ariaRowIndexStart?: number;
  columnWindow: ColumnWindowView | null;
}) {
  const { getStyles, footerRowProps } = useDataTableContext();

  const renderCell = (
    footer: Header<TData, unknown>,
    colSpan: number | undefined,
    ariaColIndex: number | undefined
  ) => (
    <MantineTable.Th
      key={footer.id}
      {...mergeElementProps(resolveElementProps(footer.column.columnDef.meta?.footerCellProps, footer), {
        "aria-colindex": ariaColIndex,
        colSpan: colSpan ?? footer.colSpan,
        "data-align": footer.column.columnDef.meta?.align,
        // Autosize measures the footer like every other rendered cell, and finds it the
        // same way (docs/sizing.md).
        "data-ledger-column-id": footer.column.id,
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
  );

  return (
    <MantineTable.Tfoot {...getStyles("tfoot")}>
      {visibleFooterGroups(table).map((footerGroup, groupIndex) => (
        <MantineTable.Tr
          key={footerGroup.id}
          {...mergeElementProps(resolveElementProps(footerRowProps, footerGroup), {
            "aria-rowindex": ariaRowIndexStart === undefined ? undefined : ariaRowIndexStart + groupIndex,
            role: "row",
            ...getStyles("footerRow")
          })}
        >
          {/* Footer groups mirror header groups, so the same clamp rule tiles them
            (docs/virtualization.md#column-virtualization). */}
          {columnWindow === null
            ? footerGroup.headers.map(footer => renderCell(footer, undefined, undefined))
            : windowHeaderCells(footerGroup.headers, columnWindow).map(cell => cell.kind === "spacer"
                ? <th key={`ledger:spacer-${cell.edge}`} aria-hidden data-ledger-spacer />
                : renderCell(cell.header, cell.colSpan, cell.ariaColIndex))}
        </MantineTable.Tr>
      ))}
    </MantineTable.Tfoot>
  );
}
