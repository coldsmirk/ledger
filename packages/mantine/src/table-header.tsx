import type { Header, Table } from "@tanstack/react-table";
import type { MouseEvent } from "react";

/**
 * The header: sortable labels (full-area button, shift for multi-sort, order badges), the
 * hover-revealed actions (filter popover, column menu), the resize handle on the trailing edge,
 * and drag-reorder plumbing. Every state is a data-attribute; every class is a Styles API
 * selector.
 */
import { Table as MantineTable } from "@mantine/core";
import { flexRender } from "@tanstack/react-table";

import { isInternalColumn } from "./build-columns";
import { ColumnMenu } from "./column-menu";
import { useDataTableContext } from "./context";
import { FilterPopover } from "./filter-popover";
import { IconChevronDown, IconChevronUp, IconSortable } from "./icons";
import { pinnedCellStyle, pinnedEdge } from "./pinning";
import { useColumnReorder } from "./use-column-reorder";
import { useColumnResize } from "./use-column-resize";

export function TableHeader<TData>({ table }: { table: Table<TData> }) {
  const {
    getStyles,
    virtualized,
    columnWidths
  } = useDataTableContext();
  const reorder = useColumnReorder(table);
  const resize = useColumnResize(table, columnWidths);

  return (
    <MantineTable.Thead {...getStyles("thead")}>
      {table.getHeaderGroups().map((headerGroup, groupIndex) => (
        <MantineTable.Tr
          key={headerGroup.id}
          aria-rowindex={virtualized ? groupIndex + 1 : undefined}
          role="row"
          {...getStyles("headerRow")}
        >
          {headerGroup.headers.map(header => <HeaderCell key={header.id} header={header} reorder={reorder} resize={resize} table={table} />)}
        </MantineTable.Tr>
      ))}
    </MantineTable.Thead>
  );
}

interface HeaderCellProps<TData> {
  header: Header<TData, unknown>;
  table: Table<TData>;
  reorder: ReturnType<typeof useColumnReorder>;
  resize: ReturnType<typeof useColumnResize>;
}

function HeaderCell<TData>({
  header,
  table,
  reorder,
  resize
}: HeaderCellProps<TData>) {
  const {
    getStyles,
    labels,
    withColumnMenu
  } = useDataTableContext();
  const { column } = header;
  const { meta } = column.columnDef;
  const internal = isInternalColumn(column.id);

  const canSort = column.getCanSort();
  const sorted = column.getIsSorted();
  const sortCount = table.getState().sorting.length;
  const sortIndex = column.getSortIndex();
  const canResize = column.getCanResize() && table.options.enableColumnResizing === true;
  const resizing = resize.resizingId === column.id;

  const dragged = reorder.drag.draggedId === column.id;
  const dropSide = reorder.drag.targetId === column.id ? reorder.drag.side : null;

  const ariaSort = sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined;

  const handleSortClick = (event: MouseEvent) => {
    if (reorder.consumeClickSuppression()) {
      return;
    }

    column.getToggleSortingHandler()?.(event);
  };

  const label = header.isPlaceholder
    ? null
    : flexRender(column.columnDef.header, header.getContext());

  return (
    <MantineTable.Th
      aria-sort={canSort ? ariaSort : undefined}
      colSpan={header.colSpan}
      data-align={meta?.align}
      data-dragging={dragged || undefined}
      data-drop-side={dropSide ?? undefined}
      data-ledger-column-id={column.id}
      data-pinned={column.getIsPinned() || undefined}
      data-pinned-edge={pinnedEdge(column)}
      data-resizing={resizing || undefined}
      data-sortable={canSort || undefined}
      role="columnheader"
      {...getStyles("headerCell", { className: meta?.headerClassName, style: pinnedCellStyle(column) })}
      {...reorder.getHeaderProps(column.id)}
    >
      {header.isPlaceholder
        ? null
        : (
            <>
              {canSort
                ? (
                    // A NATIVE button, reset in ledger's layer: Mantine's UnstyledButton ships an
                    // unlayered font-size that defeats the layered `font: inherit` (styling.md).
                    <button
                      type="button"
                      onClick={handleSortClick}
                      {...getStyles("headerLabel")}
                      data-align={meta?.align}
                    >
                      <span data-truncate>{label}</span>

                      <span {...getStyles("sortIndicator")} data-sorted={sorted || undefined}>
                        {sorted === "asc" && <IconChevronUp size={14} />}
                        {sorted === "desc" && <IconChevronDown size={14} />}
                        {sorted === false && <IconSortable size={14} />}
                        {sorted !== false && sortCount > 1 && sortIndex >= 0 && <sup>{sortIndex + 1}</sup>}
                      </span>
                    </button>
                  )
                : (
                    <div {...getStyles("headerLabel")} data-align={meta?.align}>
                      <span data-truncate>{label}</span>
                    </div>
                  )}

              {(meta?.filter !== undefined || (withColumnMenu && !internal)) && (
                <div {...getStyles("headerActions")} data-ledger-no-drag>
                  {meta?.filter !== undefined && <FilterPopover column={column} />}
                  {withColumnMenu && !internal && <ColumnMenu column={column} table={table} />}
                </div>
              )}

              {canResize && (
                <div
                  data-ledger-no-drag
                  data-ledger-resizer
                  data-resizing={resizing || undefined}
                  title={labels.resizeColumn}
                  onClick={event => event.stopPropagation()}
                  onDoubleClick={() => column.resetSize()}
                  {...resize.getResizerProps(column.id)}
                  {...getStyles("resizer")}
                />
              )}
            </>
          )}
    </MantineTable.Th>
  );
}
