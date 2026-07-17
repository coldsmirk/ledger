import type { Cell, Row, Table } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { MouseEvent, ReactNode, RefObject } from "react";

/**
 * The body: display-row synthesis (detail panels become synthetic rows so every <tr> is exactly
 * one virtual item), spacer-row virtualization in normal table flow, sticky pinned rows, grouped
 * and aggregated cells, tree indentation, skeleton and loader rows. Rows are memoized on
 * explicit volatile props — resizing never re-renders them (widths and pinned offsets are CSS
 * variables).
 */
import { ActionIcon, Loader, Table as MantineTable, Skeleton } from "@mantine/core";
import { flexRender } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useEffect, useId, useMemo, useRef, useState } from "react";

import { EXPANDER_COLUMN_ID, isInternalColumn, SELECTION_COLUMN_ID } from "./build-columns";
import { canEditCell, CellEditor } from "./cell-editor";
import { useDataTableContext } from "./context";
import { IconChevronRight } from "./icons";
import { pinnedCellStyle, pinnedEdge } from "./pinning";
import { usePinnedRowOffsets } from "./use-pinned-row-offsets";

const TREE_INDENT_PX = 20;
const DEFAULT_ESTIMATED_ROW_HEIGHT = 44;
const DEFAULT_OVERSCAN = 8;

export interface VirtualizationConfig {
  estimateRowHeight: number;
  overscan: number;
}

export type DisplayRow<TData>
  = | { kind: "data"; key: string; row: Row<TData>; dataIndex: number }
    | { kind: "detail"; key: string; row: Row<TData> };

export function buildDisplayRows<TData>(rows: Array<Row<TData>>, withDetailPanels: boolean): Array<DisplayRow<TData>> {
  const display: Array<DisplayRow<TData>> = [];
  let dataIndex = 0;

  for (const row of rows) {
    display.push({
      kind: "data",
      key: row.id,
      row,
      dataIndex
    });
    dataIndex += 1;

    if (withDetailPanels && row.getIsExpanded()) {
      display.push({
        kind: "detail",
        key: `${row.id}:detail`,
        row
      });
    }
  }

  return display;
}

// ------------------------------------------------------------------------------------------------
// Cells
// ------------------------------------------------------------------------------------------------

function cellTitle<TData>(cell: Cell<TData, unknown>): string | undefined {
  const value = cell.getValue();

  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

/**
 * Grouped cell: expander, the grouped value, and the group size.
 */
function GroupCell<TData>({ cell }: { cell: Cell<TData, unknown> }) {
  const { labels } = useDataTableContext();
  const { row } = cell;
  const expandedGroup = row.getIsExpanded();

  return (
    <span data-group-cell>
      <ActionIcon
        aria-expanded={expandedGroup}
        aria-label={expandedGroup ? labels.collapseRow : labels.expandRow}
        data-expanded={expandedGroup || undefined}
        size="xs"
        variant="subtle"
        onClick={event => {
          event.stopPropagation();
          row.toggleExpanded();
        }}
      >
        <IconChevronRight size={12} />
      </ActionIcon>

      {flexRender(cell.column.columnDef.cell, cell.getContext())}

      <span data-group-count>
        (
        {row.subRows.length}
        )
      </span>
    </span>
  );
}

/**
 * The checkbox edit variant never enters edit mode — toggling commits immediately (docs/editing.md).
 */
function CheckboxCell<TData>({ cell }: { cell: Cell<TData, unknown> }) {
  const { labels } = useDataTableContext();
  const { table } = cell.getContext();
  const ledger = table.options.meta?.ledger;
  const checked = Boolean(cell.getValue());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const errorId = useId();

  const commitToggle = () => {
    if (!ledger?.onEditCommit || pendingRef.current) {
      return;
    }

    setError(null);

    const edit = cell.column.columnDef.meta?.edit;

    try {
      if (typeof edit === "object" && edit.validate) {
        const validationError = edit.validate(!checked, cell.row);

        if (validationError !== null) {
          setError(validationError);

          return;
        }
      }
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : String(validationError));

      return;
    }

    let result: void | Promise<void>;

    try {
      result = ledger.onEditCommit({
        row: cell.row,
        column: cell.column,
        value: !checked,
        previousValue: checked
      });
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : String(commitError));

      return;
    }

    if (result && typeof result.then === "function") {
      pendingRef.current = true;
      setPending(true);

      void Promise.resolve(result).then(
        () => {
          pendingRef.current = false;
          setPending(false);
        },
        (commitError: unknown) => {
          pendingRef.current = false;
          setPending(false);
          setError(commitError instanceof Error ? commitError.message : String(commitError));
        }
      );
    }
  };

  return (
    <>
      <input
        aria-busy={pending || undefined}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        checked={checked}
        disabled={pending}
        type="checkbox"
        onChange={commitToggle}
        onClick={event => event.stopPropagation()}
        onDoubleClick={event => event.stopPropagation()}
      />

      {pending && <Loader aria-label={labels.editPending} size={12} />}
      {error && <span id={errorId} role="alert">{error}</span>}
    </>
  );
}

interface DataCellProps<TData> {
  cell: Cell<TData, unknown>;
  editing: boolean;
  isFirstDataCell: boolean;
  depth: number;
}

function DataCell<TData>({
  cell,
  editing,
  isFirstDataCell,
  depth
}: DataCellProps<TData>) {
  const { getStyles } = useDataTableContext();
  const { column, row } = cell;
  const { table } = cell.getContext();
  const ledger = table.options.meta?.ledger;
  const { meta } = column.columnDef;

  const grouped = cell.getIsGrouped();
  // getIsAggregated() is true for ANY row with subRows — a grouping concept that leaks into
  // trees (getSubRows) and would swallow the expander button and the author's cell renderer
  // on every parent row. Aggregated rendering only exists on real grouping rows.
  const aggregated = cell.getIsAggregated() && row.getIsGrouped();
  const placeholder = cell.getIsPlaceholder();
  const editable = !editing && !grouped && !aggregated && !placeholder && canEditCell(cell, row);
  const checkboxVariant = meta?.edit === "checkbox" || (typeof meta?.edit === "object" && meta.edit.variant === "checkbox");

  let content: ReactNode;

  if (grouped) {
    content = <GroupCell cell={cell} />;
  } else if (aggregated) {
    content = flexRender(column.columnDef.aggregatedCell ?? column.columnDef.cell, cell.getContext());
  } else if (placeholder) {
    content = null;
  } else if (editing) {
    content = <CellEditor cell={cell} />;
  } else if (editable && checkboxVariant) {
    content = <CheckboxCell cell={cell} />;
  } else {
    content = flexRender(column.columnDef.cell, cell.getContext());

    if (meta?.truncate) {
      content = (
        <span data-truncate title={cellTitle(cell)}>
          {content}
        </span>
      );
    }
  }

  const startEditing
    = editable && !checkboxVariant && ledger
      ? (event: MouseEvent) => {
          event.stopPropagation();
          ledger.editing.start({ rowId: row.id, columnId: column.id });
        }
      : undefined;

  const cellClassName
    = typeof meta?.cellClassName === "function" ? meta.cellClassName(cell) : meta?.cellClassName;

  if (isFirstDataCell && depth > 0) {
    content = <div style={{ paddingInlineStart: depth * TREE_INDENT_PX }}>{content}</div>;
  }

  const selector
    = column.id === SELECTION_COLUMN_ID
      ? "selectionCell"
      : column.id === EXPANDER_COLUMN_ID
        ? "expanderCell"
        : "cell";

  return (
    <MantineTable.Td
      data-align={meta?.align}
      data-editable={editable || undefined}
      data-editing={editing || undefined}
      data-pinned={column.getIsPinned() || undefined}
      data-pinned-edge={pinnedEdge(column)}
      role="cell"
      onClick={ledger?.editTrigger === "click" ? startEditing : undefined}
      onDoubleClick={ledger?.editTrigger === "double-click" ? startEditing : undefined}
      {...getStyles(selector, { className: cellClassName, style: pinnedCellStyle(column) })}
    >
      {content}
    </MantineTable.Td>
  );
}

// ------------------------------------------------------------------------------------------------
// Rows
// ------------------------------------------------------------------------------------------------

interface DataRowProps<TData> {
  row: Row<TData>;
  dataIndex: number;
  editingColumnId: string | null;
  selected: boolean;
  expanded: boolean;
  depth: number;
  pinKey: string;
  columnsKey: string;
  /**
   * Stable memo token for column definitions and editing behavior that cells read indirectly
   * through the stable TanStack table instance.
   */
  renderVersion: object;
  pinnedPosition?: "top" | "bottom";
  /**
   * Sticky offset for pinned rows — measured cumulative height of the pinned rows before it.
   */
  pinnedOffset?: number;
  virtualIndex?: number;
  measureRef?: (element: Element | null) => void;
  ariaRowIndex?: number;
}

function DataRowImpl<TData>({
  row,
  dataIndex,
  editingColumnId,
  selected,
  expanded,
  depth,
  pinnedPosition,
  pinnedOffset,
  virtualIndex,
  measureRef,
  ariaRowIndex
}: DataRowProps<TData>) {
  const {
    getStyles,
    onRowClick,
    onRowDoubleClick,
    onRowContextMenu,
    rowClassName
  } = useDataTableContext();

  const cells = row.getVisibleCells();
  const firstDataCellIndex = cells.findIndex(cell => !isInternalColumn(cell.column.id));
  const resolvedRowClassName = typeof rowClassName === "function" ? rowClassName(row) : rowClassName;

  /* The body scroller holds no header, so top offsets start at the scroller's own edge. */
  const pinnedStyle
    = pinnedPosition === "top"
      ? { top: `${pinnedOffset ?? 0}px` }
      : pinnedPosition === "bottom"
        ? { bottom: `${pinnedOffset ?? 0}px` }
        : undefined;

  const handler = (callback?: (row: Row<TData>, event: MouseEvent) => void) => callback ? (event: MouseEvent) => callback(row, event) : undefined;

  return (
    <MantineTable.Tr
      ref={measureRef}
      aria-rowindex={ariaRowIndex}
      aria-selected={selected || undefined}
      data-clickable={onRowClick ? true : undefined}
      data-expanded={expanded || undefined}
      data-index={virtualIndex}
      data-parity={dataIndex >= 0 ? dataIndex % 2 === 0 ? "odd" : "even" : undefined}
      data-pinned-row={pinnedPosition}
      data-row-id={row.id}
      data-selected={selected || undefined}
      role="row"
      onClick={handler(onRowClick)}
      onContextMenu={handler(onRowContextMenu)}
      onDoubleClick={handler(onRowDoubleClick)}
      {...getStyles("row", { className: resolvedRowClassName, style: pinnedStyle })}
    >
      {cells.map((cell, index) => (
        <DataCell
          key={cell.id}
          cell={cell}
          depth={depth}
          editing={editingColumnId === cell.column.id}
          isFirstDataCell={index === firstDataCellIndex}
        />
      ))}
    </MantineTable.Tr>
  );
}

const DataRow = memo(DataRowImpl) as typeof DataRowImpl;

interface DetailRowProps<TData> {
  row: Row<TData>;
  colSpan: number;
  pinnedPosition?: "top" | "bottom";
  pinnedOffset?: number;
  virtualIndex?: number;
  measureRef?: (element: Element | null) => void;
  ariaRowIndex?: number;
}

function DetailRow<TData>({
  row,
  colSpan,
  pinnedPosition,
  pinnedOffset,
  virtualIndex,
  measureRef,
  ariaRowIndex
}: DetailRowProps<TData>) {
  const { table, getStyles } = useDataTableContext();
  const renderDetailPanel = table.options.meta?.ledger?.renderDetailPanel;
  const pinnedStyle
    = pinnedPosition === "top"
      ? { top: `${pinnedOffset ?? 0}px` }
      : pinnedPosition === "bottom"
        ? { bottom: `${pinnedOffset ?? 0}px` }
        : undefined;

  return (
    <MantineTable.Tr
      ref={measureRef}
      data-detail-row
      aria-rowindex={ariaRowIndex}
      data-index={virtualIndex}
      data-pinned-row={pinnedPosition}
      role="row"
      {...getStyles("row", { style: pinnedStyle })}
    >
      <MantineTable.Td colSpan={colSpan} role="cell" {...getStyles("detailPanel")}>
        {renderDetailPanel?.(row)}
      </MantineTable.Td>
    </MantineTable.Tr>
  );
}

// ------------------------------------------------------------------------------------------------
// Loading rows
// ------------------------------------------------------------------------------------------------

function SkeletonRows({
  rowCount,
  columnCount,
  ariaRowIndexStart
}: {
  rowCount: number;
  columnCount: number;
  ariaRowIndexStart?: number;
}) {
  const { getStyles } = useDataTableContext();

  return (
    <>
      {Array.from({ length: rowCount }, (_, rowIndex) => (
        <MantineTable.Tr
          key={rowIndex}
          aria-rowindex={ariaRowIndexStart === undefined ? undefined : ariaRowIndexStart + rowIndex}
          role="row"
          {...getStyles("row")}
        >
          {Array.from({ length: columnCount }, (_, columnIndex) => (
            <MantineTable.Td key={columnIndex} role="cell" {...getStyles("cell")}>
              <Skeleton height={10} radius="sm" />
            </MantineTable.Td>
          ))}
        </MantineTable.Tr>
      ))}
    </>
  );
}

function LoaderRow({ colSpan, ariaRowIndex }: { colSpan: number; ariaRowIndex?: number }) {
  const { getStyles, labels } = useDataTableContext();

  return (
    <MantineTable.Tr aria-rowindex={ariaRowIndex} role="row" {...getStyles("loaderRow")}>
      <MantineTable.Td colSpan={colSpan} role="cell">
        <Loader size="xs" />
        <span>{labels.loadingMore}</span>
      </MantineTable.Td>
    </MantineTable.Tr>
  );
}

// ------------------------------------------------------------------------------------------------
// Body
// ------------------------------------------------------------------------------------------------

export interface TableBodyProps<TData> {
  table: Table<TData>;
  virtualization: VirtualizationConfig | null;
  viewportRef: RefObject<HTMLDivElement | null>;
  loading: boolean;
  loadingMore: boolean;
  skeletonRowCount: number;
  onVirtualizerChange: (virtualizer: Virtualizer<HTMLDivElement, Element> | null) => void;
}

export function TableBody<TData>({
  table,
  virtualization,
  viewportRef,
  loading,
  loadingMore,
  skeletonRowCount,
  onVirtualizerChange
}: TableBodyProps<TData>) {
  const { getStyles } = useDataTableContext();
  const ledger = table.options.meta?.ledger;

  const withDetailPanels = Boolean(ledger?.renderDetailPanel);
  const rowPinningActive = table.options.enableRowPinning === true;
  const topRows = rowPinningActive ? table.getTopRows() : [];
  const bottomRows = rowPinningActive ? table.getBottomRows() : [];
  const centerRows = rowPinningActive ? table.getCenterRows() : table.getRowModel().rows;

  // Every zone uses the same synthesis: an expanded pinned row owns a detail item just like a
  // center row, and the sticky offset engine measures both items independently.
  const topDisplayRows = buildDisplayRows(topRows, withDetailPanels);
  const centerDisplayRows = buildDisplayRows(centerRows, withDetailPanels);
  const bottomDisplayRows = buildDisplayRows(bottomRows, withDetailPanels);
  const pinnedRowOffsets = usePinnedRowOffsets(topDisplayRows.length, bottomDisplayRows.length);

  /* aria-rowindex numbers header rows first (docs/virtualization.md). */
  const headerRowCount = table.getHeaderGroups().length;

  const virtualizer = useVirtualizer({
    count: centerDisplayRows.length,
    enabled: virtualization !== null,
    estimateSize: () => virtualization?.estimateRowHeight ?? DEFAULT_ESTIMATED_ROW_HEIGHT,
    getItemKey: index => centerDisplayRows[index]?.key ?? index,
    getScrollElement: () => viewportRef.current,
    overscan: virtualization?.overscan ?? DEFAULT_OVERSCAN
  });

  const virtualEnabled = virtualization !== null;

  useEffect(() => {
    onVirtualizerChange(virtualEnabled ? virtualizer : null);

    return () => onVirtualizerChange(null);
  }, [virtualEnabled, virtualizer, onVirtualizerChange]);

  const leafColumnCount = table.getVisibleLeafColumns().length;
  const totalDisplayRowCount = topDisplayRows.length + centerDisplayRows.length + bottomDisplayRows.length;
  const renderVersion = useMemo(
    () => {
      return {
        columns: table.options.columns,
        editTrigger: ledger?.editTrigger,
        enableEditing: ledger?.enableEditing,
        onEditCommit: ledger?.onEditCommit
      };
    },
    [table.options.columns, ledger?.enableEditing, ledger?.editTrigger, ledger?.onEditCommit]
  );

  if (loading && totalDisplayRowCount === 0) {
    return (
      <MantineTable.Tbody {...getStyles("tbody")}>
        <SkeletonRows
          ariaRowIndexStart={virtualEnabled ? headerRowCount + 1 : undefined}
          columnCount={leafColumnCount}
          rowCount={skeletonRowCount}
        />
      </MantineTable.Tbody>
    );
  }

  /* Memo-busting signatures: rows re-render when pinning or the visible column set changes. */
  const pinning = table.getState().columnPinning;
  const pinKey = JSON.stringify([pinning.left ?? [], pinning.right ?? []]);
  const columnsKey = JSON.stringify(table.getVisibleLeafColumns().map(column => column.id));
  const editingCell = ledger?.editing.cell ?? null;

  interface DisplayRowRenderOptions {
    displayIndex: number;
    pinnedPosition?: "top" | "bottom";
    pinnedOffset?: number;
    virtualIndex?: number;
    measureRef?: (element: Element | null) => void;
  }

  const renderDisplayRow = (
    displayRow: DisplayRow<TData>,
    options: DisplayRowRenderOptions
  ): ReactNode => {
    const zoneStart
      = options.pinnedPosition === "top"
        ? headerRowCount
        : options.pinnedPosition === "bottom"
          ? headerRowCount + topDisplayRows.length + centerDisplayRows.length
          : headerRowCount + topDisplayRows.length;
    const ariaRowIndex = virtualEnabled ? zoneStart + options.displayIndex + 1 : undefined;

    if (displayRow.kind === "detail") {
      return (
        <DetailRow
          key={displayRow.key}
          ariaRowIndex={ariaRowIndex}
          colSpan={leafColumnCount}
          measureRef={options.measureRef}
          pinnedOffset={options.pinnedOffset}
          pinnedPosition={options.pinnedPosition}
          row={displayRow.row}
          virtualIndex={options.virtualIndex}
        />
      );
    }

    const { row, dataIndex } = displayRow;

    return (
      <DataRow
        key={displayRow.key}
        ariaRowIndex={ariaRowIndex}
        columnsKey={columnsKey}
        dataIndex={options.pinnedPosition ? -1 : dataIndex}
        depth={row.depth}
        editingColumnId={editingCell?.rowId === row.id ? editingCell.columnId : null}
        expanded={row.getIsExpanded()}
        measureRef={options.measureRef}
        pinKey={pinKey}
        pinnedOffset={options.pinnedOffset}
        pinnedPosition={options.pinnedPosition}
        renderVersion={renderVersion}
        row={row}
        selected={row.getIsSelected()}
        virtualIndex={options.virtualIndex}
      />
    );
  };

  let center: ReactNode;

  if (virtualEnabled) {
    const items = virtualizer.getVirtualItems();
    const firstItem = items[0];
    const lastItem = items.at(-1);
    const topSpace = firstItem ? firstItem.start : 0;
    const bottomSpace = lastItem ? virtualizer.getTotalSize() - lastItem.end : 0;

    center = (
      <>
        {topSpace > 0 && <tr aria-hidden data-ledger-spacer style={{ height: topSpace }} />}

        {items.map(item => {
          const displayRow = centerDisplayRows[item.index];

          return displayRow
            ? renderDisplayRow(displayRow, {
                displayIndex: item.index,
                virtualIndex: item.index,
                measureRef: virtualizer.measureElement
              })
            : null;
        })}

        {bottomSpace > 0 && <tr aria-hidden data-ledger-spacer style={{ height: bottomSpace }} />}
      </>
    );
  } else {
    center = centerDisplayRows.map((displayRow, displayIndex) => renderDisplayRow(displayRow, { displayIndex }));
  }

  return (
    <MantineTable.Tbody {...getStyles("tbody")}>
      {topDisplayRows.map((displayRow, displayIndex) => renderDisplayRow(displayRow, {
        displayIndex,
        measureRef: pinnedRowOffsets.registerTopRow(displayIndex),
        pinnedOffset: pinnedRowOffsets.offsets.top[displayIndex],
        pinnedPosition: "top"
      }))}

      {center}

      {bottomDisplayRows.map((displayRow, displayIndex) => renderDisplayRow(displayRow, {
        displayIndex,
        measureRef: pinnedRowOffsets.registerBottomRow(displayIndex),
        pinnedOffset: pinnedRowOffsets.offsets.bottom[displayIndex],
        pinnedPosition: "bottom"
      }))}

      {loadingMore && (
        <LoaderRow
          ariaRowIndex={virtualEnabled ? headerRowCount + totalDisplayRowCount + 1 : undefined}
          colSpan={leafColumnCount}
        />
      )}
    </MantineTable.Tbody>
  );
}
