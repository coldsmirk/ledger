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
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useReducer } from "react";

import { columnHeaderText, EXPANDER_COLUMN_ID, isInternalColumn, SELECTION_COLUMN_ID } from "./build-columns";
import { canEditCell, CellEditor, RowCellEditor } from "./cell-editor";
import { useDataTableContext } from "./context";
import { mergeElementProps, resolveElementProps } from "./element-props";
import { warnOnce } from "./env";
import { IconChevronRight, IconRefresh } from "./icons";
import { pinnedCellStyle, pinnedEdge } from "./pinning";
import { syncTruncationTitle } from "./truncate";
import { usePinnedRowOffsets } from "./use-pinned-row-offsets";
import { useEventCallback } from "./utils";

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

/**
 * One stable identity for an unoccupied pinned zone, so the display-row memos can hold.
 */
const NO_ROWS: Array<Row<any>> = [];

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

    // A grouped row's expansion reveals its children, not a panel — `renderDetailPanel` speaks
    // about a data row (docs/grouping.md#boundaries).
    if (withDetailPanels && row.getIsExpanded() && !row.getIsGrouped()) {
      display.push({
        kind: "detail",
        key: `${row.id}:detail`,
        row
      });
    }
  }

  return display;
}

/**
 * The same count without the array. `aria-rowcount` needs the number, not the rows, and building
 * three throwaway `DisplayRow[]`s per render is O(N) allocation the virtualizer then repeats on
 * every scroll range change.
 */
export function countDisplayRows<TData extends RowData>(rows: Array<Row<TData>>, withDetailPanels: boolean): number {
  if (!withDetailPanels) {
    return rows.length;
  }

  let count = rows.length;

  for (const row of rows) {
    if (row.getIsExpanded() && !row.getIsGrouped()) {
      count += 1;
    }
  }

  return count;
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
 * The cell-mode checkbox (docs/editing.md): toggling *is* the commit, so it never enters edit
 * mode. A view of its target in the controller, like the editor hosts are views of their session
 * — what a toggle leaves behind must survive the column being hidden, a breakpoint removing it,
 * or a virtual scroll taking the row off screen, none of which are the write landing.
 */
function CheckboxCell({ cell }: { cell: Cell<any, unknown> }) {
  const { labels } = useDataTableContext();
  const { table } = cell.getContext();
  const checkbox = table.options.meta?.ledger?.editing.checkbox;
  const rowId = cell.row.id;
  const columnId = cell.column.id;
  const errorId = useId();

  const [, redraw] = useReducer((token: number) => token + 1, 0);
  const redrawFromTarget = useEventCallback(() => redraw());
  const register = checkbox?.register;

  // Layout, not passive: the registry is what "on screen right now" means to the target, and a
  // toggle that unmounts this control is followed by microtasks — a settling write among them.
  useLayoutEffect(
    () => register?.(rowId, columnId, { redraw: redrawFromTarget }),
    [register, rowId, columnId, redrawFromTarget]
  );

  if (!checkbox) {
    return null;
  }

  const checked = checkbox.checked(rowId, columnId, cell.getValue());
  const pending = checkbox.pending(rowId, columnId);
  const error = checkbox.error(rowId, columnId);

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
        onChange={() => checkbox.toggle(cell)}
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
  // The gate, asked in the render that has to answer it. Ending a session whose eligibility is
  // gone is a side effect, so reconciliation runs after the paint — but whether an editor is on
  // the screen is this render's own question, and this render already knows the gate is shut. Ask
  // it later and the commit that shuts the gate still paints a live editor for one frame, which
  // is a frame the user can type into.
  const gateOpen = !grouped && !aggregated && !placeholder && canEditCell(cell, row);
  const editable = !editing && gateOpen;
  // `editing` / `rowEditing` are the other half: they already mean a live *session*, not merely a
  // slice that names this target — a gate that shut ends the session even when a controlled
  // application declines to close it, and neither editor may become interactive again if that
  // gate reopens (docs/architecture.md).
  const cellEditorActive = editing && gateOpen;
  const rowEditorActive = rowEditing && gateOpen;
  const checkboxVariant = meta?.edit === "checkbox" || (typeof meta?.edit === "object" && meta.edit.variant === "checkbox");

  let content: ReactNode;

  if (grouped) {
    content = <GroupCell cell={cell} />;
  } else if (aggregated) {
    content = flexRender(column.columnDef.aggregatedCell ?? column.columnDef.cell, cell.getContext());
  } else if (placeholder) {
    content = null;
  } else if (cellEditorActive) {
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
        "data-editing": cellEditorActive || rowEditorActive || undefined,
        "data-leading": column.getIsFirstColumn() || undefined,
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
        <div {...getStyles("loaderRowContent")}>
          <Loader size="xs" />
          <span>{labels.loadingMore}</span>
        </div>
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
        <div {...getStyles("loaderRowContent")}>
          <span role="alert">{message === true ? labels.loadMoreError : message}</span>

          {onRetry && (
            <Button
              color="gray"
              leftSection={<IconRefresh size={14} />}
              size="compact-xs"
              variant="subtle"
              onClick={onRetry}
            >
              {labels.retry}
            </Button>
          )}
        </div>
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

  const withDetailPanels = Boolean(ledger?.renderDetailPanel);
  const spanningDeclared = useMemo(() => hasSpanningColumns(ledger?.columns), [ledger?.columns]);
  const spanningActive
    = spanningDeclared
      && virtualization === null
      && !withDetailPanels
      && table.options.enableCellSpanning !== false;

  if (spanningDeclared && virtualization !== null) {
    warnOnce(
      "spanning-virtualized",
      "spanRows/spanColumns are ignored while virtualized — a merged cell breaks the one-<tr>-per-virtual-item invariant."
    );
  }

  if (spanningDeclared && withDetailPanels) {
    // Spans are computed over data rows only, but a detail panel inserts a synthetic <tr>
    // between them: an unmodified rowSpan would reach across the panel while the covered cell
    // below it is still dropped, tearing the column structure apart.
    warnOnce(
      "spanning-detail-panel",
      "spanRows/spanColumns are ignored while renderDetailPanel is set — a detail row lands inside the span a merged cell would reach across."
    );
  }

  const rowPinningActive = table.options.enableRowPinning === true;
  // A fresh `[]` per render would defeat the memos below; the empty zone is one stable array.
  const topRows = rowPinningActive ? table.getTopRows() : NO_ROWS;
  const bottomRows = rowPinningActive ? table.getBottomRows() : NO_ROWS;
  const centerRows = rowPinningActive ? table.getCenterRows() : table.getRowModel().rows;

  // Every zone uses the same synthesis: an expanded pinned row owns a detail item just like a
  // center row, and the sticky offset engine measures both items independently. Memoized because
  // the virtualizer re-renders this component on every scroll range change: rebuilding the
  // display rows there would make each scroll step O(rows) in a table sized for virtualization.
  // The row arrays are a sufficient key even though the synthesis reads `row.getIsExpanded()`:
  // v9's expanded row model returns the pre-expanded array while nothing is expanded and a
  // freshly built one as soon as something is, so every `expanded` transition changes identity.
  const topDisplayRows = useMemo(() => buildDisplayRows(topRows, withDetailPanels), [topRows, withDetailPanels]);
  const centerDisplayRows = useMemo(() => buildDisplayRows(centerRows, withDetailPanels), [centerRows, withDetailPanels]);
  const bottomDisplayRows = useMemo(() => buildDisplayRows(bottomRows, withDetailPanels), [bottomRows, withDetailPanels]);
  const pinnedRowOffsets = usePinnedRowOffsets(topDisplayRows.length, bottomDisplayRows.length);

  /* aria-rowindex numbers header rows first (docs/virtualization.md) — none when they are off. */
  const headerRowCount = withColumnHeaders ? table.getHeaderGroups().length : 0;

  /**
   * `getItemKey` sits in virtual-core's `getMeasurementOptions` memo **by reference**, and that
   * memo feeds `getMeasurements`. A fresh closure per render therefore invalidates the whole
   * measurement pass, which then walks every item from index 0 — an O(rows) sweep on each of
   * the re-renders the virtualizer itself triggers while scrolling. It stays stable for as long
   * as the display rows do, which is exactly when the measurements are still valid.
   */
  const getItemKey = useCallback(
    (index: number) => centerDisplayRows[index]?.key ?? index,
    [centerDisplayRows]
  );
  const estimateRowHeight = virtualization?.estimateRowHeight ?? DEFAULT_ESTIMATED_ROW_HEIGHT;
  const estimateSize = useCallback(() => estimateRowHeight, [estimateRowHeight]);

  const virtualizer = useVirtualizer({
    count: centerDisplayRows.length,
    enabled: virtualization !== null,
    estimateSize,
    getItemKey,
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
  // Presence, never identity: what a row's cells read from the commit handlers is whether the
  // live mode has one at all — that is the whole of their part in `canEditCell`, and the write
  // itself goes through the controllers, whose event callbacks always reach the latest. An
  // application that writes its handler inline (the ordinary way to write one) hands `meta` a new
  // function on every render, and taking its identity here would put a new token on every row and
  // leave nothing memoized at all.
  const canCommitCell = Boolean(ledger?.onEditCommit);
  const canCommitRow = Boolean(ledger?.onRowEditCommit);
  const renderVersion = useMemo(
    () => {
      return {
        // meta.ledger.columns, never options.columns: v9 re-resolves options per state tick,
        // so the options-side identity would bust the row memo on every state change.
        columns: ledger?.columns,
        editTrigger: ledger?.editTrigger,
        editMode: ledger?.editing.mode,
        enableEditing: ledger?.enableEditing,
        canCommitCell,
        canCommitRow
      };
    },
    [ledger?.columns, ledger?.enableEditing, ledger?.editTrigger, ledger?.editing.mode, canCommitCell, canCommitRow]
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
        editingRow={editingRowId === row.id && (ledger?.editing.row.active(row.id) ?? false)}
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
        editingColumnId={editingCell?.rowId === row.id && (ledger?.editing.active(row.id, editingCell.columnId) ?? false)
          ? editingCell.columnId
          : null}
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
