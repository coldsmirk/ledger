import type { RowData } from "@tanstack/react-table";
import type { MouseEvent } from "react";

import type { Header, TableInstance } from "./types";

/**
 * The header: sortable labels (full-area button, shift for multi-sort, order badges), the
 * hover-revealed filter popover, the resize handle on the trailing edge, and drag-reorder
 * plumbing. Every state is a data-attribute; every class is a Styles API selector. Column
 * layout — order, visibility, pinning, width, grouping — belongs to `DataTable.ColumnsPanel`,
 * not to the header (docs/columns.md).
 */
import { Table as MantineTable } from "@mantine/core";
import { flexRender } from "@tanstack/react-table";

import { autosizeColumn } from "./autosize-column";
import { columnEnableResizing, isInternalColumn } from "./build-columns";
import { useDataTableContext } from "./context";
import { mergeElementProps, resolveElementProps } from "./element-props";
import { FilterPopover } from "./filter-popover";
import { IconChevronDown, IconChevronUp, IconSortable } from "./icons";
import { pinnedCellStyle, pinnedEdge } from "./pinning";
import { syncTruncationTitle } from "./truncate";
import { useColumnReorder } from "./use-column-reorder";
import { useColumnResize } from "./use-column-resize";

/**
 * `columnWidths` arrives as a prop, not through the context: a drag departs from the edge the
 * user grabbed, which is the one this render put on screen. A ref shared with a work-in-progress
 * tree would hand the pointer a width from a render nobody saw (docs/architecture.md).
 */
export function TableHeader<TData extends RowData>({
  table,
  columnWidths
}: {
  table: TableInstance<TData>;
  columnWidths: Record<string, number>;
}) {
  const {
    getStyles,
    virtualized,
    headerRowProps
  } = useDataTableContext();
  const reorder = useColumnReorder(table);
  const resize = useColumnResize(table, columnWidths);

  return (
    <MantineTable.Thead {...getStyles("thead")}>
      {table.getHeaderGroups().map((headerGroup, groupIndex) => (
        <MantineTable.Tr
          key={headerGroup.id}
          {...mergeElementProps(resolveElementProps(headerRowProps, headerGroup), {
            "aria-rowindex": virtualized ? groupIndex + 1 : undefined,
            role: "row",
            ...getStyles("headerRow")
          })}
        >
          {headerGroup.headers.map(header => <HeaderCell key={header.id} header={header} reorder={reorder} resize={resize} table={table} />)}
        </MantineTable.Tr>
      ))}
    </MantineTable.Thead>
  );
}

interface HeaderCellProps<TData extends RowData> {
  header: Header<TData, unknown>;
  table: TableInstance<TData>;
  reorder: ReturnType<typeof useColumnReorder>;
  resize: ReturnType<typeof useColumnResize>;
}

function HeaderCell<TData extends RowData>({
  header,
  table,
  reorder,
  resize
}: HeaderCellProps<TData>) {
  const { getStyles, labels } = useDataTableContext();
  const { column } = header;
  const { meta } = column.columnDef;
  const internal = isInternalColumn(column.id);

  const canSort = column.getCanSort();
  const sorted = column.getIsSorted();
  const sortCount = table.atoms.sorting.get().length;
  const sortIndex = column.getSortIndex();
  // Ledger's own gate: the TanStack `columnResizingFeature` (and its `getCanResize`) is
  // deliberately unregistered — the drag pipeline is ledger's (docs/sizing.md).
  const canResize
    = table.options.meta?.ledger?.enableColumnResizing === true
      && columnEnableResizing(column.columnDef) !== false
      // Only leaves have a width: the engine resolves and consumes leaf sizing, so a handle on
      // a group header would write a `columnSizing` entry nothing ever reads.
      && column.columns.length === 0;
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
      {...mergeElementProps(resolveElementProps(meta?.headerCellProps, header), {
        "aria-sort": canSort ? ariaSort : undefined,
        colSpan: header.colSpan,
        "data-align": internal ? "center" : meta?.align,
        "data-dragging": dragged || undefined,
        "data-drop-side": dropSide ?? undefined,
        "data-ledger-column-id": column.id,
        "data-pinned": column.getIsPinned() || undefined,
        "data-pinned-edge": pinnedEdge(column),
        "data-resizing": resizing || undefined,
        "data-sortable": canSort || undefined,
        role: "columnheader",
        ...getStyles("headerCell", { style: pinnedCellStyle(column) }),
        ...reorder.getHeaderProps(column.id)
      })}
    >
      {header.isPlaceholder
        ? null
        : internal
          // Injected headers (checkbox, expand-all) are controls, not text — the label
          // scaffolding's [data-truncate] span would clip them at the cell's content box.
          ? label
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
                        <span data-truncate onPointerEnter={syncTruncationTitle}>{label}</span>

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
                        <span data-truncate onPointerEnter={syncTruncationTitle}>{label}</span>
                      </div>
                    )}

                {meta?.filter !== undefined && (
                  <div {...getStyles("headerActions")} data-ledger-no-drag>
                    <FilterPopover column={column} />
                  </div>
                )}

                {canResize && (
                  <div
                    // A pointer-only affordance, hidden from assistive tech on purpose: it takes
                    // no focus and answers no key, and the keyboard route to the same
                    // `columnSizing` entry is the columns panel's width field
                    // (docs/accessibility.md). Announcing an inoperable control would be worse
                    // than announcing nothing; the `title` stays for the mouse.
                    aria-hidden
                    data-ledger-no-drag
                    data-ledger-resizer
                    data-resizing={resizing || undefined}
                    title={labels.resizeColumn}
                    onClick={event => event.stopPropagation()}
                    onDoubleClick={event => {
                      const main = event.currentTarget.closest<HTMLElement>(".ledger-main");

                      if (main) {
                        autosizeColumn(table, column.id, main);
                      }
                    }}
                    {...resize.getResizerProps(column.id)}
                    {...getStyles("resizer")}
                  />
                )}
              </>
            )}
    </MantineTable.Th>
  );
}
