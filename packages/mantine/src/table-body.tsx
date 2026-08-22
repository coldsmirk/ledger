import type { RowData } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { MouseEvent, ReactNode, RefObject } from "react";

import type { Cell, ColumnDef, Row, TableInstance } from "./types";

/**
 * The body: display-row synthesis (detail panels become synthetic rows so every <tr> is exactly
 * one virtual item), spacer-row virtualization in normal table flow, sticky pinned rows, grouped
 * and aggregated cells, tree indentation, skeleton and loader rows. Rows are memoized on
 * explicit volatile props — resizing never re-renders them (widths and pinned offsets are CSS
 * variables).
 */
import { ActionIcon, Button, Loader, Table as MantineTable, Skeleton } from "@mantine/core";
import { flexRender } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useEffect, useId, useMemo, useRef, useState } from "react";

import { columnHeaderText, EXPANDER_COLUMN_ID, isInternalColumn, SELECTION_COLUMN_ID } from "./build-columns";
import { canEditCell, CellEditor, RowCellEditor } from "./cell-editor";
import { useDataTableContext } from "./context";
import { mergeElementProps, resolveElementProps } from "./element-props";
import { warnOnce } from "./env";
import { IconChevronRight } from "./icons";
import { pinnedCellStyle, pinnedEdge } from "./pinning";
import { syncTruncationTitle } from "./truncate";
import { usePinnedRowOffsets } from "./use-pinned-row-offsets";

const TREE_INDENT_PX = 20;
const DEFAULT_ESTIMATED_ROW_HEIGHT = 44;
const DEFAULT_OVERSCAN = 8;

export interface VirtualizationConfig {
  estimateRowHeight: number;
  overscan: number;
}

export type DisplayRow<TData extends RowData>
  = | { kind: "data"; key: string; row: Row<TData>; dataIndex: number }
    | { kind: "detail"; key: string; row: Row<TData> };

/**
 * Whether any leaf definition declares a merge — the gate that keeps span-index reads (and the
 * per-row span signature) entirely out of tables that never span.
 */
function hasSpanningColumns(columns: Array<ColumnDef<any, any>> | undefined): boolean {
  if (!columns) {
    return false;
  }

  return columns.some(column => "columns" in column && Array.isArray(column.columns)
    ? hasSpanningColumns(column.columns)
    : column.spanRows !== undefined || column.spanColumns !== undefined);
}

export function buildDisplayRows<TData extends RowData>(rows: Array<Row<TData>>, withDetailPanels: boolean): Array<DisplayRow<TData>> {
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

/**
 * Grouped cell: expander, the grouped value, and the group size.
 */
function GroupCell({ cell }: { cell: Cell<any, unknown> }) {
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
function CheckboxCell({ cell }: { cell: Cell<any, unknown> }) {
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
        aria-label={labels.editColumn(columnHeaderText(cell.column))}
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

interface DataCellProps {
  cell: Cell<any, unknown>;
  editing: boolean;
  /**
   * The whole row is in row-mode editing — every editable cell hosts its editor.
   */
  rowEditing: boolean;
  isFirstDataCell: boolean;
  depth: number;
  /**
   * Merged-cell extents (1 = no span); covered cells are skipped by the row, never rendered.
   */
  rowSpan: number;
  colSpan: number;
}

function DataCell({
  cell,
  editing,
  rowEditing,
  isFirstDataCell,
  depth,
  rowSpan,
  colSpan
}: DataCellProps) {
  const { getStyles } = useDataTableContext();
  const { column, row } = cell;
  const { table } = cell.getContext();
  const ledger = table.options.meta?.ledger;
  const editMode = ledger?.editing.mode ?? "cell";
  const { meta } = column.columnDef;

  const grouped = cell.getIsGrouped();
  // getIsAggregated() is true for ANY row with subRows — a grouping concept that leaks into
  // trees (getSubRows) and would swallow the expander button and the author's cell renderer
  // on every parent row. Aggregated rendering only exists on real grouping rows.
  const aggregated = cell.getIsAggregated() && row.getIsGrouped();
  const placeholder = cell.getIsPlaceholder();
  const editable = !editing && !grouped && !aggregated && !placeholder && canEditCell(cell, row);
  const rowEditorActive = rowEditing && !grouped && !aggregated && !placeholder && canEditCell(cell, row);
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
  } else if (rowEditorActive) {
    content = <RowCellEditor cell={cell} />;
  } else if (editable && checkboxVariant && editMode === "cell") {
    content = <CheckboxCell cell={cell} />;
  } else {
    content = flexRender(column.columnDef.cell, cell.getContext());

    if (meta?.truncate) {
      content = (
        <span data-truncate onPointerEnter={syncTruncationTitle}>
          {content}
        </span>
      );
    }
  }

  const startEditing
    = editable && !rowEditorActive && (editMode === "row" || !checkboxVariant) && ledger
      ? (event: MouseEvent) => {
          event.stopPropagation();

          if (editMode === "row") {
            ledger.editing.row.start(row.id, { focusColumnId: column.id });
          } else {
            ledger.editing.start({ rowId: row.id, columnId: column.id });
          }
        }
      : undefined;

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
      {...mergeElementProps(resolveElementProps(meta?.cellProps, cell), {
        "aria-colspan": colSpan > 1 ? colSpan : undefined,
        "aria-rowspan": rowSpan > 1 ? rowSpan : undefined,
        colSpan: colSpan > 1 ? colSpan : undefined,
        "data-align": meta?.align,
        "data-editable": editable || undefined,
        "data-editing": editing || rowEditorActive || undefined,
        "data-ledger-column-id": column.id,
        "data-pinned": column.getIsPinned() || undefined,
        "data-pinned-edge": pinnedEdge(column),
        role: "cell",
        rowSpan: rowSpan > 1 ? rowSpan : undefined,
        onClick: ledger?.editTrigger === "click" ? startEditing : undefined,
        onDoubleClick: ledger?.editTrigger === "double-click" ? startEditing : undefined,
        ...getStyles(selector, { style: pinnedCellStyle(column) })
      })}
    >
      {content}
    </MantineTable.Td>
  );
}

// ------------------------------------------------------------------------------------------------
// Rows
// ------------------------------------------------------------------------------------------------

interface DataRowProps {
  row: Row<any>;
  dataIndex: number;
  editingColumnId: string | null;
  /**
   * Row-mode editing targets this row — every editable cell mounts its editor.
   */
  editingRow: boolean;
  selected: boolean;
  active: boolean;
  expanded: boolean;
  depth: number;
  pinKey: string;
  columnsKey: string;
  /**
   * Merged cells active for this table (never under virtualization).
   */
  spanning: boolean;
  /**
   * Per-row span signature — spans depend on NEIGHBOR rows, which this row's own props cannot
   * see, so the signature busts the memo when an adjacent change reshapes the merge.
   */
  spanKey: string;
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

function DataRowImpl({
  row,
  dataIndex,
  editingColumnId,
  editingRow,
  selected,
  active,
  expanded,
  depth,
  spanning,
  pinnedPosition,
  pinnedOffset,
  virtualIndex,
  measureRef,
  ariaRowIndex
}: DataRowProps) {
  const {
    table,
    getStyles,
    onRowClick,
    onRowActivate,
    onRowDoubleClick,
    onRowContextMenu,
    rowProps
  } = useDataTableContext();
  const activeRow = table.options.meta?.ledger?.activeRow;

  const cells = row.getVisibleCells();
  const firstDataCellIndex = cells.findIndex(cell => !isInternalColumn(cell.column.id));

  /* The body scroller holds no header, so top offsets start at the scroller's own edge. */
  const pinnedStyle
    = pinnedPosition === "top"
      ? { top: `${pinnedOffset ?? 0}px` }
      : pinnedPosition === "bottom"
        ? { bottom: `${pinnedOffset ?? 0}px` }
        : undefined;

  const handler = (callback?: (row: Row<any>, event: MouseEvent) => void) => callback ? (event: MouseEvent) => callback(row, event) : undefined;

  // A click makes the row current before the consumer's own handlers see it. A click is also an
  // activation, so both fire here — `onRowClick` first, as the more specific of the two.
  const handleClick = onRowClick || onRowActivate || activeRow?.enabled
    ? (event: MouseEvent) => {
        if (activeRow?.enabled) {
          activeRow.set(row.id);
        }

        onRowClick?.(row, event);
        onRowActivate?.(row, event);
      }
    : undefined;

  return (
    <MantineTable.Tr
      ref={measureRef}
      {...mergeElementProps(resolveElementProps(rowProps, row), {
        "aria-current": active || undefined,
        "aria-rowindex": ariaRowIndex,
        "aria-selected": selected || undefined,
        "data-active": active || undefined,
        "data-clickable": handleClick ? true : undefined,
        "data-editing-row": editingRow || undefined,
        "data-expanded": expanded || undefined,
        "data-index": virtualIndex,
        "data-parity": dataIndex >= 0 ? dataIndex % 2 === 0 ? "odd" : "even" : undefined,
        "data-pinned-row": pinnedPosition,
        "data-row-id": row.id,
        "data-selected": selected || undefined,
        role: "row",
        onClick: handleClick,
        onContextMenu: handler(onRowContextMenu),
        onDoubleClick: handler(onRowDoubleClick),
        ...getStyles("row", { style: pinnedStyle })
      })}
    >
      {cells.map((cell, index) => {
        if (spanning && cell.getIsCovered()) {
          return null;
        }

        return (
          <DataCell
            key={cell.id}
            cell={cell}
            colSpan={spanning ? cell.getColSpan() : 1}
            depth={depth}
            editing={editingColumnId === cell.column.id}
            isFirstDataCell={index === firstDataCellIndex}
            rowEditing={editingRow}
            rowSpan={spanning ? cell.getRowSpan() : 1}
          />
        );
      })}
    </MantineTable.Tr>
  );
}

const DataRow = memo(DataRowImpl) as typeof DataRowImpl;

interface DetailRowProps {
  row: Row<any>;
  colSpan: number;
  pinnedPosition?: "top" | "bottom";
  pinnedOffset?: number;
  virtualIndex?: number;
  measureRef?: (element: Element | null) => void;
  ariaRowIndex?: number;
}

function DetailRow({
  row,
  colSpan,
  pinnedPosition,
  pinnedOffset,
  virtualIndex,
  measureRef,
  ariaRowIndex
}: DetailRowProps) {
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

function LoadMoreErrorRow({
  colSpan,
  message,
  ariaRowIndex,
  onRetry
}: {
  colSpan: number;
  message: ReactNode;
  ariaRowIndex?: number;
  onRetry?: () => void;
}) {
  const { getStyles, labels } = useDataTableContext();

  return (
    <MantineTable.Tr data-error aria-rowindex={ariaRowIndex} role="row" {...getStyles("loaderRow")}>
      {/* The alert lives on the message, never on the cell: `role="alert"` would replace
          `role="cell"` and leave the row with no cell in the accessibility tree. */}
      <MantineTable.Td colSpan={colSpan} role="cell">
        <span role="alert">{message === true ? labels.loadMoreError : message}</span>

        {onRetry && (
          <Button color="gray" size="compact-xs" variant="subtle" onClick={onRetry}>
            {labels.retry}
          </Button>
        )}
      </MantineTable.Td>
    </MantineTable.Tr>
  );
}

// ------------------------------------------------------------------------------------------------
// Body
// ------------------------------------------------------------------------------------------------

export interface TableBodyProps {
  table: TableInstance<any>;
  virtualization: VirtualizationConfig | null;
  viewportRef: RefObject<HTMLDivElement | null>;
  loading: boolean;
  loadingMore: boolean;
  loadMoreError: boolean | ReactNode;
  onLoadMoreRetry?: () => void;
  skeletonRowCount: number;
  onVirtualizerChange: (virtualizer: Virtualizer<HTMLDivElement, Element> | null) => void;
}

export function TableBody({
  table,
  virtualization,
  viewportRef,
  loading,
  loadingMore,
  loadMoreError,
  onLoadMoreRetry,
  skeletonRowCount,
  onVirtualizerChange
}: TableBodyProps) {
  const { getStyles, withColumnHeaders } = useDataTableContext();
  const ledger = table.options.meta?.ledger;

  const spanningDeclared = useMemo(() => hasSpanningColumns(ledger?.columns), [ledger?.columns]);
  const spanningActive = spanningDeclared && virtualization === null && table.options.enableCellSpanning !== false;

  if (spanningDeclared && virtualization !== null) {
    warnOnce(
      "spanning-virtualized",
      "spanRows/spanColumns are ignored while virtualized — a merged cell breaks the one-<tr>-per-virtual-item invariant."
    );
  }

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

  /* aria-rowindex numbers header rows first (docs/virtualization.md) — none when they are off. */
  const headerRowCount = withColumnHeaders ? table.getHeaderGroups().length : 0;

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
        // meta.ledger.columns, never options.columns: v9 re-resolves options per state tick,
        // so the options-side identity would bust the row memo on every state change.
        columns: ledger?.columns,
        editTrigger: ledger?.editTrigger,
        editMode: ledger?.editing.mode,
        enableEditing: ledger?.enableEditing,
        onEditCommit: ledger?.onEditCommit,
        onRowEditCommit: ledger?.onRowEditCommit
      };
    },
    [ledger?.columns, ledger?.enableEditing, ledger?.editTrigger, ledger?.editing.mode, ledger?.onEditCommit, ledger?.onRowEditCommit]
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
  const pinning = table.atoms.columnPinning.get();
  const pinKey = JSON.stringify([pinning.start, pinning.end]);
  const columnsKey = JSON.stringify(table.getVisibleLeafColumns().map(column => column.id));
  const editingCell = ledger?.editing.cell ?? null;
  const editingRowId = ledger?.editing.mode === "row" ? ledger.editing.row.id : null;
  const activeRowId = ledger?.activeRow.enabled ? ledger.activeRow.id : null;

  interface DisplayRowRenderOptions {
    displayIndex: number;
    pinnedPosition?: "top" | "bottom";
    pinnedOffset?: number;
    virtualIndex?: number;
    measureRef?: (element: Element | null) => void;
  }

  const renderDisplayRow = (
    displayRow: DisplayRow<any>,
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
    const spanKey = spanningActive
      ? row.getVisibleCells()
          .map(cell => cell.getIsCovered() ? "x" : `${cell.getRowSpan()}:${cell.getColSpan()}`)
          .join(" ")
      : "";

    return (
      <DataRow
        key={displayRow.key}
        active={activeRowId === row.id}
        ariaRowIndex={ariaRowIndex}
        columnsKey={columnsKey}
        dataIndex={options.pinnedPosition ? -1 : dataIndex}
        depth={row.depth}
        editingColumnId={editingCell?.rowId === row.id ? editingCell.columnId : null}
        editingRow={editingRowId === row.id}
        expanded={row.getIsExpanded()}
        measureRef={options.measureRef}
        pinKey={pinKey}
        pinnedOffset={options.pinnedOffset}
        pinnedPosition={options.pinnedPosition}
        renderVersion={renderVersion}
        row={row}
        selected={row.getIsSelected()}
        spanKey={spanKey}
        spanning={spanningActive}
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

      {loadMoreError
        ? (
            <LoadMoreErrorRow
              ariaRowIndex={virtualEnabled ? headerRowCount + totalDisplayRowCount + 1 : undefined}
              colSpan={leafColumnCount}
              message={loadMoreError}
              onRetry={onLoadMoreRetry}
            />
          )
        : loadingMore && (
          <LoaderRow
            ariaRowIndex={virtualEnabled ? headerRowCount + totalDisplayRowCount + 1 : undefined}
            colSpan={leafColumnCount}
          />
        )}
    </MantineTable.Tbody>
  );
}
