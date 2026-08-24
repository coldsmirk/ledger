import type { ColumnSizingState, RowData } from "@tanstack/react-table";
import type { MouseEvent } from "react";

import type { SortToggleSpec } from "./toggle-fns";
import type { Header, TableInstance } from "./types";
import type { ResizerSpec } from "./use-column-resize";

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
import { ledgerCommands } from "./ledger-commands";
import { pinnedCellStyle, pinnedEdge } from "./pinning";
import { syncTruncationTitle } from "./truncate";
import { useColumnReorder } from "./use-column-reorder";
import { useColumnResize } from "./use-column-resize";

/**
 * `columnWidths` and `columnSizing` arrive as props, not through the context or the table: a drag
 * departs from the edge the user grabbed and restores what that render had, and both belong to
 * the render that drew the handle. Reaching for either at event time reaches the shared core,
 * which carries whatever render pass ran last — a discarded one included
 * (docs/architecture.md).
 */
export function TableHeader<TData extends RowData>({
  table,
  columnWidths,
  columnSizing
}: {
  table: TableInstance<TData>;
  columnWidths: Record<string, number>;
  columnSizing: ColumnSizingState;
}) {
  const {
    getStyles,
    virtualized,
    headerRowProps
  } = useDataTableContext();
  const reorder = useColumnReorder(table);
  const resize = useColumnResize(table.setColumnSizing);

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
          {headerGroup.headers.map(header => (
            <HeaderCell
              key={header.id}
              columnSizing={columnSizing}
              columnWidths={columnWidths}
              header={header}
              reorder={reorder}
              resize={resize}
              table={table}
            />
          ))}
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
  columnWidths: Record<string, number>;
  columnSizing: ColumnSizingState;
}

function HeaderCell<TData extends RowData>({
  header,
  table,
  reorder,
  resize,
  columnWidths,
  columnSizing
}: HeaderCellProps<TData>) {
  const { getStyles, labels } = useDataTableContext();
  const { column } = header;
  const { meta } = column.columnDef;
  const internal = isInternalColumn(column.id);

  const canSort = column.getCanSort();
  const sorted = column.getIsSorted();
  /**
   * The whole of what a sort click applies, resolved here. v9's own handler asks the column
   * again when the click lands — for the gate, for the direction the cycle turns to next — and
   * both of those reads go to the shared core (`toggle-fns.ts`).
   */
  const sortSpec: SortToggleSpec = {
    canMultiSort: column.getCanMultiSort(),
    columnId: column.id,
    maxMultiSortColCount: table.options.maxMultiSortColCount ?? Number.MAX_SAFE_INTEGER,
    nextOrderMulti: column.getNextSortingOrder(true),
    nextOrderSingle: column.getNextSortingOrder(false)
  };
  // v9's own default, restated: the feature's `getDefaultTableOptions` is merged into the core's
  // options, not into the wrapper's, so reading only `table.options` here would silently make
  // every click a single-sort. A consumer override through `tableOptions` still wins.
  const isMultiSortEvent = table.options.isMultiSortEvent ?? ((event: unknown) => (event as MouseEvent).shiftKey);
  const sorting = ledgerCommands(table.options.meta?.ledger)?.sorting;
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
  /**
   * Everything a drag or a fit decides with, read here, in the render that draws the handle —
   * the width on screen, the constraints this render's definition carries, the entry Escape puts
   * back, and whether the header reserves room for a filter control. The handler on the DOM then
   * needs nothing from the table at all (docs/architecture.md).
   */
  const resizerSpec: ResizerSpec = {
    columnId: column.id,
    width: columnWidths[column.id] ?? column.getSize(),
    minSize: column.columnDef.minSize ?? 20,
    maxSize: column.columnDef.maxSize ?? Number.MAX_SAFE_INTEGER,
    sizingEntry: columnSizing[column.id]
  };

  const dragged = reorder.drag.draggedId === column.id;
  const dropSide = reorder.drag.targetId === column.id ? reorder.drag.side : null;

  const ariaSort = sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined;

  const handleSortClick = (event: MouseEvent) => {
    if (reorder.consumeClickSuppression()) {
      return;
    }

    if (!canSort) {
      return;
    }

    sorting?.toggle(sortSpec, sortSpec.canMultiSort && (isMultiSortEvent?.(event) ?? false));
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
                        autosizeColumn(
                          table.setColumnSizing,
                          { ...resizerSpec, hasFilter: meta?.filter !== undefined },
                          main
                        );
                      }
                    }}
                    {...resize.getResizerProps(resizerSpec)}
                    {...getStyles("resizer")}
                  />
                )}
              </>
            )}
    </MantineTable.Th>
  );
}
