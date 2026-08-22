import type {
  BoxProps,
  ElementProps,
  Factory,
  MantineColor,
  MantineSpacing,
  StylesApiProps,
  TableTrProps
} from "@mantine/core";
import type { RowData } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { ComponentProps, JSX, MouseEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, Ref } from "react";

import type { DataTableContextValue } from "./context";
import type { DataAttributes, DataTableElementProps } from "./element-props";
import type { DataTableLabels } from "./labels";
import type { VirtualizationConfig } from "./table-body";
import type {
  DataTableHandle,
  DataTableScrollToRowOptions,
  HeaderGroup,
  Row,
  TableInstance,
  UseDataTableOptions
} from "./types";

/**
 * The root component (docs/api.md): a generic Mantine factory with full Styles API,
 * adaptive sizing (the root is a flex column that fills its parent; the ScrollArea is the only
 * elastic region), CSS-variable column geometry, infinite loading, pinned-edge shadows, the
 * built-in pagination bar, and the imperative handle.
 *
 * Sugar mode (`data`/`columns` inline) and hook mode (`table`) render through the same core;
 * the split components below keep the hook call unconditional.
 */
import {
  Box,
  Button,
  createVarsResolver,
  EmptyState,
  genericFactory,
  getThemeColor,
  LoadingOverlay,
  Table as MantineTable,
  ScrollArea,
  useProps,
  useStyles
} from "@mantine/core";
import { useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";

import { canEditCell, isCheckboxEdit } from "./cell-editor";
import { DataTableColumnsPanel } from "./columns-panel";
import { DataTableProvider } from "./context";
import { mergeElementProps } from "./element-props";
import { warnOnce } from "./env";
import { IconAlertTriangle, IconInbox, IconSearch } from "./icons";
import { resolveLabels } from "./labels";
import { DataTablePagination, DEFAULT_PAGE_SIZE_OPTIONS, PaginationBar } from "./pagination-bar";
import { DataTableSearch } from "./search";
import { DataTableSelectionBar } from "./selection-bar";
import { buildDisplayRows, TableBody } from "./table-body";
import { TableFooter, tableHasFooter } from "./table-footer";
import { TableHeader } from "./table-header";
import { useColumnWidths } from "./use-column-widths";
import { useDataTable } from "./use-data-table";
import { columnAfterVar, columnStartVar, columnWidthVar, toPx, useEventCallback } from "./utils";

// ------------------------------------------------------------------------------------------------
// Styles API surface
// ----------------------------------------------------------------------------------------------

export type DataTableStylesNames
  = | "root"
    | "main"
    | "header"
    | "scroller"
    | "footer"
    | "table"
    | "thead"
    | "tbody"
    | "tfoot"
    | "headerRow"
    | "headerCell"
    | "headerLabel"
    | "headerActions"
    | "sortIndicator"
    | "resizer"
    | "filterPopover"
    | "row"
    | "cell"
    | "selectionCell"
    | "expanderCell"
    | "detailPanel"
    | "cellEditor"
    | "footerRow"
    | "footerCell"
    | "empty"
    | "loaderRow"
    | "paginationBar";

export interface DataTableCssVariables {
  root: "--ledger-striped-color" | "--ledger-hover-color" | "--ledger-border-color";
}

/**
 * Static kebab-case classes — the styling contract's public selector map (docs/styling.md).
 */
const classes: Record<DataTableStylesNames, string> = {
  root: "ledger-root",
  main: "ledger-main",
  header: "ledger-header",
  scroller: "ledger-scroller",
  footer: "ledger-footer",
  table: "ledger-table",
  thead: "ledger-thead",
  tbody: "ledger-tbody",
  tfoot: "ledger-tfoot",
  headerRow: "ledger-header-row",
  headerCell: "ledger-header-cell",
  headerLabel: "ledger-header-label",
  headerActions: "ledger-header-actions",
  sortIndicator: "ledger-sort-indicator",
  resizer: "ledger-resizer",
  filterPopover: "ledger-filter-popover",
  row: "ledger-row",
  cell: "ledger-cell",
  selectionCell: "ledger-selection-cell",
  expanderCell: "ledger-expander-cell",
  detailPanel: "ledger-detail-panel",
  cellEditor: "ledger-cell-editor",
  footerRow: "ledger-footer-row",
  footerCell: "ledger-footer-cell",
  empty: "ledger-empty",
  loaderRow: "ledger-loader-row",
  paginationBar: "ledger-pagination-bar"
};

// Mantine styles the EmptyState title as a headline (bright, 600) for full-page empties with
// description and actions; a bare table caption reads better dimmed.
const EMPTY_STATE_STYLES = {
  title: { color: "var(--mantine-color-dimmed)", fontWeight: 500 }
} as const;

// ------------------------------------------------------------------------------------------------
// Props
// ----------------------------------------------------------------------------------------------

export interface DataTableBaseProps<TData extends RowData>
  extends BoxProps,
  StylesApiProps<DataTableFactory>,
  ElementProps<"div"> {
  /**
   * Root element ref (React 19 ref-as-prop; genericFactory components receive it here).
   */
  ref?: Ref<HTMLDivElement>;

  // Mantine Table appearance (forwarded names; striped/hover are rendered by ledger itself
  // through the --ledger-row-bg pipeline so pinned cells always cover them)
  striped?: boolean | "odd" | "even";
  stripedColor?: MantineColor;
  highlightOnHover?: boolean;
  highlightOnHoverColor?: MantineColor;
  withTableBorder?: boolean;
  withColumnBorders?: boolean;
  withRowBorders?: boolean;
  borderColor?: MantineColor;
  verticalSpacing?: MantineSpacing;
  horizontalSpacing?: MantineSpacing;
  tabularNums?: boolean;

  /* Layout */
  tableMinWidth?: number | string;

  /* Scale */
  virtualized?: boolean | { estimateRowHeight?: number; overscan?: number };
  onEndReached?: () => void;
  endReachedOffset?: number;
  loadingMore?: boolean;
  /**
   * The last `onEndReached` load failed — replaces the trailing loader row with the message
   * (`true` uses `labels.loadMoreError`) and a retry button that fires `onEndReached` again.
   */
  loadMoreError?: boolean | ReactNode;

  /* State presentation */
  loading?: boolean;
  emptyState?: ReactNode;
  /**
   * Loading the data failed — shows an error panel over the body (`true` uses `labels.error`;
   * a node replaces the message). Takes precedence over the empty state.
   */
  error?: boolean | ReactNode;
  /**
   * Renders a retry button in the error panel.
   */
  onRetry?: () => void;

  /* Chrome */
  /**
   * Renders the column header region. Turning it off takes the header's own affordances with
   * it — sort controls, filter popovers, resize handles, drag reordering — so name the table
   * some other way ([accessibility.md](../docs/accessibility.md)).
   */
  withColumnHeaders?: boolean;
  withPaginationBar?: boolean;
  pageSizeOptions?: number[];

  /* Row interaction */
  /**
   * A literal primary click on the row. Pointer-only by definition — reach for `onRowActivate`
   * when the intent is "the user chose this row", so the keyboard reaches it too.
   */
  onRowClick?: (row: Row<TData>, event: MouseEvent) => void;
  /**
   * The row was activated, whatever the input device: a primary click, or `Enter` on the
   * current row while `enableActiveRow` is on ([rows.md](../docs/rows.md#active-row)).
   */
  onRowActivate?: (row: Row<TData>, event: MouseEvent | ReactKeyboardEvent) => void;
  onRowDoubleClick?: (row: Row<TData>, event: MouseEvent) => void;
  onRowContextMenu?: (row: Row<TData>, event: MouseEvent) => void;

  /* DOM escape hatches (docs/styling.md#dom-props) */
  /**
   * DOM props for every data row — static, or per row. Synthetic rows (detail panels, loader
   * and skeleton rows) have no `Row` subject and never receive them.
   */
  rowProps?: DataTableElementProps<Omit<TableTrProps, "ref">, Row<TData>>;
  /**
   * DOM props for every header row — static, or per header group (grouped columns render one
   * row per level).
   */
  headerRowProps?: DataTableElementProps<Omit<TableTrProps, "ref">, HeaderGroup<TData>>;
  /**
   * DOM props for every footer row — static, or per footer group.
   */
  footerRowProps?: DataTableElementProps<Omit<TableTrProps, "ref">, HeaderGroup<TData>>;
  /**
   * DOM props for the internal scroll viewport — `onScroll`, `data-*`, extra styles. Host
   * vocabulary: `ScrollArea.viewportProps`. ledger owns its scroll listener, its overscroll
   * behavior and (with `enableActiveRow`) its keyboard handling; those compose rather than
   * being replaced.
   */
  viewportProps?: Omit<ComponentProps<"div">, "ref"> & DataAttributes;

  labels?: Partial<DataTableLabels>;

  /**
   * Imperative handle: `{ table, viewport, scrollToRow, startEditing, stopEditing }`.
   */
  handleRef?: Ref<DataTableHandle<TData>>;
}

/**
 * Data source — a discriminated pair: a hook-mode instance XOR inline behavior options.
 */
export type DataTableProps<TData extends RowData = RowData> = DataTableBaseProps<TData>
  & (
    | ({ table: TableInstance<TData> } & { data?: never; columns?: never })
    | ({ table?: never } & UseDataTableOptions<TData>)
  );

export type DataTableFactory = Factory<{
  props: DataTableProps;
  ref: HTMLDivElement;
  stylesNames: DataTableStylesNames;
  vars: DataTableCssVariables;
  signature: <TData extends RowData>(props: DataTableProps<TData>) => JSX.Element;
  staticComponents: {
    Search: typeof DataTableSearch;
    ColumnsPanel: typeof DataTableColumnsPanel;
    Pagination: typeof DataTablePagination;
    SelectionBar: typeof DataTableSelectionBar;
  };
}>;

const defaultProps = {
  striped: false,
  highlightOnHover: false,
  withTableBorder: false,
  withColumnBorders: false,
  withRowBorders: true,
  verticalSpacing: "xs",
  horizontalSpacing: "xs",
  tabularNums: false,
  virtualized: false,
  endReachedOffset: 240,
  loadingMore: false,
  loading: false,
  withColumnHeaders: true,
  withPaginationBar: true,
  pageSizeOptions: DEFAULT_PAGE_SIZE_OPTIONS
} satisfies Partial<DataTableProps>;

const varsResolver = createVarsResolver<DataTableFactory>(
  (theme, {
    stripedColor,
    highlightOnHoverColor,
    borderColor
  }) => {
    return {
      root: {
        "--ledger-striped-color": stripedColor ? getThemeColor(stripedColor, theme) : undefined,
        "--ledger-hover-color": highlightOnHoverColor
          ? getThemeColor(highlightOnHoverColor, theme)
          : undefined,
        // The frame border around header + body lives outside both tables (docs/styling.md).
        "--ledger-border-color": borderColor ? getThemeColor(borderColor, theme) : undefined
      }
    };
  }
);

// ------------------------------------------------------------------------------------------------
// Option-key partition — sugar mode splits behavior options from presentation props
// ----------------------------------------------------------------------------------------------

const OPTION_KEYS = [
  "data",
  "columns",
  "getRowId",
  "enableSorting",
  "enableMultiSort",
  "enableSortingRemoval",
  "enableColumnFilters",
  "enableGlobalFilter",
  "enablePagination",
  "enableRowSelection",
  "enableMultiRowSelection",
  "enableColumnResizing",
  "enableColumnPinning",
  "enableColumnOrdering",
  "enableHiding",
  "enableEditing",
  "enableGrouping",
  "enableRowPinning",
  "enableCellSpanning",
  "getSubRows",
  "renderDetailPanel",
  "selectionColumn",
  "expanderColumn",
  "sortingMode",
  "filterMode",
  "paginationMode",
  "rowCount",
  "editTrigger",
  "editMode",
  "onEditCommit",
  "onRowEditCommit",
  "editingRowId",
  "onEditingRowIdChange",
  "enableActiveRow",
  "activeRowId",
  "defaultActiveRowId",
  "onActiveRowIdChange",
  "sorting",
  "defaultSorting",
  "onSortingChange",
  "columnFilters",
  "defaultColumnFilters",
  "onColumnFiltersChange",
  "globalFilter",
  "defaultGlobalFilter",
  "onGlobalFilterChange",
  "pagination",
  "defaultPagination",
  "onPaginationChange",
  "rowSelection",
  "defaultRowSelection",
  "onRowSelectionChange",
  "expanded",
  "defaultExpanded",
  "onExpandedChange",
  "columnVisibility",
  "defaultColumnVisibility",
  "onColumnVisibilityChange",
  "columnPinning",
  "defaultColumnPinning",
  "onColumnPinningChange",
  "columnOrder",
  "defaultColumnOrder",
  "onColumnOrderChange",
  "columnSizing",
  "defaultColumnSizing",
  "onColumnSizingChange",
  "grouping",
  "defaultGrouping",
  "onGroupingChange",
  "rowPinning",
  "defaultRowPinning",
  "onRowPinningChange",
  "editingCell",
  "onEditingCellChange",
  "persistState",
  "defaultColumn",
  "filterFns",
  "tableOptions"
] as const satisfies ReadonlyArray<keyof UseDataTableOptions<RowData>>;

/**
 * Compile-time exhaustiveness: adding an option without listing it above is a type error.
 */
type MissingOptionKeys = Exclude<keyof UseDataTableOptions<RowData>, (typeof OPTION_KEYS)[number]>;

type AssertNever<T extends never> = T;

// AssertNever<MissingOptionKeys> is `never` while the list is exhaustive; a forgotten key turns
// it into a constraint violation right here.
const OPTION_KEY_SET: ReadonlySet<string> = new Set<AssertNever<MissingOptionKeys> | string>(OPTION_KEYS);

// ------------------------------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------------------------

function DataTableRoot<TData extends RowData>(_props: DataTableProps<TData>) {
  const props = useProps("DataTable", defaultProps as Partial<DataTableProps<TData>>, _props);

  if (props.table) {
    const { table, ...presentation } = props;

    return <DataTableCore presentation={presentation as DataTableBaseProps<TData>} table={table} />;
  }

  return <DataTableFromOptions props={props} />;
}

export const DataTable = genericFactory<DataTableFactory>(DataTableRoot);

interface RoutedProps<TData extends RowData> {
  presentation: DataTableBaseProps<TData>;
  table: TableInstance<TData>;
}

/**
 * Resolve a row against the exact list owned by the virtualizer. Pinned rows are mounted outside
 * that list, so they deliberately have no scroll index.
 */
export function resolveVirtualDisplayIndex<TData extends RowData>(
  table: TableInstance<TData>,
  rowId: string,
  withDetailPanels: boolean
): number | null {
  const rowPinningActive = table.options.enableRowPinning === true;

  if (rowPinningActive) {
    const pinned = [...table.getTopRows(), ...table.getBottomRows()].some(row => row.id === rowId);

    if (pinned) {
      return null;
    }
  }

  const rows = rowPinningActive ? table.getCenterRows() : table.getRowModel().rows;
  const index = buildDisplayRows(rows, withDetailPanels)
    .findIndex(displayRow => displayRow.kind === "data" && displayRow.row.id === rowId);

  return index === -1 ? null : index;
}

function DataTableFromOptions<TData extends RowData>({ props }: { props: DataTableProps<TData> }) {
  const options: Record<string, unknown> = {};
  const presentation: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(props)) {
    (OPTION_KEY_SET.has(key) ? options : presentation)[key] = value;
  }

  // The partition is exhaustive by construction (see the AssertNever check above).
  const table = useDataTable(options as unknown as UseDataTableOptions<TData>);

  return (
    <DataTableCore presentation={presentation as DataTableBaseProps<TData>} table={table} />
  );
}

function DataTableCore<TData extends RowData>({ presentation, table }: RoutedProps<TData>) {
  const {
    striped,
    // Consumed by varsResolver from raw props; destructured only to keep them off the DOM node.
    stripedColor: _stripedColor,
    highlightOnHover,
    highlightOnHoverColor: _highlightOnHoverColor,
    withTableBorder,
    withColumnBorders,
    withRowBorders,
    borderColor: _borderColor,
    verticalSpacing,
    horizontalSpacing,
    tabularNums,
    tableMinWidth,
    virtualized,
    onEndReached,
    endReachedOffset,
    loadingMore,
    loadMoreError,
    loading,
    emptyState,
    error,
    onRetry,
    withColumnHeaders,
    withPaginationBar,
    pageSizeOptions,
    onRowClick,
    onRowActivate,
    onRowDoubleClick,
    onRowContextMenu,
    rowProps,
    headerRowProps,
    footerRowProps,
    viewportProps,
    labels: labelsProp,
    handleRef,
    ref: rootRef,
    classNames,
    styles,
    unstyled,
    vars,
    className,
    style,
    attributes,
    // The ARIA table is `main`, not the root — a name left on the root would describe a
    // roleless wrapper and never reach the table. Routed below, never duplicated.
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": ariaDescribedBy,
    ...others
  } = presentation;

  const getStyles = useStyles<DataTableFactory>({
    name: "DataTable",
    classes,
    props: presentation as DataTableProps,
    className,
    style,
    classNames,
    styles,
    unstyled,
    vars,
    attributes,
    varsResolver
  });

  /* Stable getStyles identity so the memoized context value never churns per render. */
  const getStylesRef = useRef(getStyles);
  getStylesRef.current = getStyles;
  const stableGetStyles = useCallback<typeof getStyles>(
    (...args: Parameters<typeof getStyles>) => getStylesRef.current(...args),
    []
  );

  const labels = useMemo(() => resolveLabels(labelsProp), [labelsProp]);

  /* ---- viewport ---- */
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const assignViewport = useCallback((element: HTMLDivElement | null) => {
    viewportRef.current = element;
    setViewport(element);
  }, []);

  // ---- the width engine (docs/sizing.md) ----
  // Display order is pinned-aware (start + center + end) — header groups and row cells
  // already render in it, so the colgroup and every width/offset must follow the same order
  // (`getVisibleLeafColumns` alone ignores pinning). Stabilized by id signature so downstream
  // memos only recompute when the composition or order actually changes.
  const displayColumns = [
    ...table.getStartVisibleLeafColumns(),
    ...table.getCenterVisibleLeafColumns(),
    ...table.getEndVisibleLeafColumns()
  ];
  const displayOrderSignature = JSON.stringify(displayColumns.map(column => column.id));
  const ledgerColumns = table.options.meta?.ledger?.columns;
  // eslint-disable-next-line @eslint-react/exhaustive-deps -- the signature encodes order/composition; meta.ledger.columns identity covers definition swaps (options.columns re-resolves per v9 state tick)
  const visibleLeafColumns = useMemo(() => displayColumns, [displayOrderSignature, ledgerColumns]);
  const columnWidths = useColumnWidths(table, visibleLeafColumns, viewport, tableMinWidth);

  /* Live drags read the rendered width through this ref — stable identity, no context churn. */
  const columnWidthsRef = useRef<Record<string, number>>({});
  columnWidthsRef.current = columnWidths.byId;

  /* ---- virtualization config ---- */
  const virtualization: VirtualizationConfig | null = virtualized
    ? {
        estimateRowHeight:
          typeof virtualized === "object" && virtualized.estimateRowHeight !== undefined
            ? virtualized.estimateRowHeight
            : 44,
        overscan: typeof virtualized === "object" && virtualized.overscan !== undefined ? virtualized.overscan : 8
      }
    : null;
  const virtualEnabled = virtualization !== null;

  /* ---- row interaction handlers with stable identities ---- */
  const rowClickStable = useEventCallback(onRowClick);
  const rowActivateStable = useEventCallback(onRowActivate);
  const rowDoubleClickStable = useEventCallback(onRowDoubleClick);
  const rowContextMenuStable = useEventCallback(onRowContextMenu);

  // The context depends on each handler's EXISTENCE, never its identity — the stable wrappers
  // absorb per-render inline arrows, so a fresh `onRowClick` prop must not rebuild the context
  // value (and with it every memoized row). The `*Props` hooks stay raw below: their return
  // values feed the render, so identity is their honest dependency.
  const contextRowClick = onRowClick ? (rowClickStable as DataTableContextValue["onRowClick"]) : undefined;
  const contextRowActivate = onRowActivate
    ? (rowActivateStable as DataTableContextValue["onRowActivate"])
    : undefined;
  const contextRowDoubleClick = onRowDoubleClick
    ? (rowDoubleClickStable as DataTableContextValue["onRowDoubleClick"])
    : undefined;
  const contextRowContextMenu = onRowContextMenu
    ? (rowContextMenuStable as DataTableContextValue["onRowContextMenu"])
    : undefined;

  const filterMode: "client" | "server" = table.options.manualFiltering ? "server" : "client";

  /* The documented single TData erasure (context.ts) — the render layer below is `any`-bound. */
  const erasedTable = table as TableInstance<any>;

  // v9's useTable returns a fresh `{...core, options, state}` wrapper on every state tick.
  // Holding that identity in the context value would rebuild the context each tick and
  // re-render every consumer straight through the row memos. The context therefore exposes
  // the CURRENT wrapper through a ref-backed getter: identity-stable, reads always fresh.
  const tableBoxRef = useRef(erasedTable);
  tableBoxRef.current = erasedTable;

  const instanceId = useId();

  const contextValue = useMemo<DataTableContextValue>(
    () => {
      return {
        get table() {
          return tableBoxRef.current;
        },
        instanceId,
        getStyles: stableGetStyles,
        labels,
        filterMode,
        virtualized: virtualEnabled,
        withColumnHeaders: withColumnHeaders !== false,
        columnWidths: columnWidthsRef,
        onRowClick: contextRowClick,
        onRowActivate: contextRowActivate,
        onRowDoubleClick: contextRowDoubleClick,
        onRowContextMenu: contextRowContextMenu,
        rowProps: rowProps as DataTableContextValue["rowProps"],
        headerRowProps: headerRowProps as DataTableContextValue["headerRowProps"],
        footerRowProps: footerRowProps as DataTableContextValue["footerRowProps"]
      };
    },
    [
      instanceId,
      stableGetStyles,
      labels,
      filterMode,
      virtualEnabled,
      withColumnHeaders,
      contextRowClick,
      contextRowActivate,
      contextRowDoubleClick,
      contextRowContextMenu,
      rowProps,
      headerRowProps,
      footerRowProps
    ]
  );

  // ---- column geometry: the width engine resolves every column to exact integer pixels,
  // written as CSS variables (a resize updates variables, never re-renders rows) ----
  const tableState = table.state;

  const columnVars = useMemo(() => {
    const varsMap: Record<string, string> = {};
    let leftOffset = 0;

    for (const column of visibleLeafColumns) {
      const width = columnWidths.byId[column.id] ?? 0;
      varsMap[columnWidthVar(column.id)] = `${width}px`;

      if (column.getIsPinned() === "start") {
        varsMap[columnStartVar(column.id)] = `${leftOffset}px`;
        leftOffset += width;
      }
    }

    let rightOffset = 0;

    for (let index = visibleLeafColumns.length - 1; index >= 0; index -= 1) {
      const column = visibleLeafColumns[index]!;

      if (column.getIsPinned() === "end") {
        varsMap[columnAfterVar(column.id)] = `${rightOffset}px`;
        rightOffset += columnWidths.byId[column.id] ?? 0;
      }
    }

    return varsMap;
    // getIsPinned reads the pinning slice — columnPinning is its identity in the deps.
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- see comment above
  }, [visibleLeafColumns, columnWidths, tableState.columnPinning]);

  const colElements = visibleLeafColumns.map(column => <col key={column.id} style={{ width: `var(${columnWidthVar(column.id)})` }} />);

  /* ---- data flags ---- */
  const rowsLength = table.getRowModel().rows.length;
  const errorActive = Boolean(error) && !loading;
  const isEmpty = !loading && !errorActive && rowsLength === 0;
  // Zero rows with an active filter is "nothing matched", not "no data" — a different message.
  const filtersActive = tableState.columnFilters.length > 0 || tableState.globalFilter !== "";
  const paginationEnabled = table.options.meta?.ledger?.enablePagination === true;
  const skeletonRowCount = Math.min(Math.max(tableState.pagination.pageSize, 3), 12);
  const dataLength = table.options.data.length;

  /* ---- infinite loading ---- */
  const lastEndReachedLength = useRef(-1);

  const maybeFireEndReached = useEventCallback(() => {
    const element = viewportRef.current;

    // clientHeight 0 = not laid out yet; distance math would fire a phantom page load.
    if (!element || element.clientHeight === 0 || !onEndReached || loading || loadingMore) {
      return;
    }

    if (lastEndReachedLength.current === dataLength) {
      return;
    }

    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;

    if (distance <= (endReachedOffset ?? 240)) {
      lastEndReachedLength.current = dataLength;
      onEndReached();
    }
  });

  useEffect(() => {
    // Next frame: the virtualizer's first measurement commit must settle before the
    // "content shorter than the viewport" check can mean anything.
    const frame = requestAnimationFrame(() => maybeFireEndReached());

    return () => cancelAnimationFrame(frame);
  }, [dataLength, viewport, maybeFireEndReached]);

  // Retry re-arms the once-per-data-length guard — the failed attempt consumed it.
  const retryLoadMore = useEventCallback(() => {
    lastEndReachedLength.current = -1;
    onEndReached?.();
  });

  /* ---- pinned-edge shadows ---- */
  const [scrollEdges, setScrollEdges] = useState({ start: false, end: false });

  const updateScrollEdges = useEventCallback(() => {
    const element = viewportRef.current;

    if (!element) {
      return;
    }

    const max = element.scrollWidth - element.clientWidth;
    const offset = Math.abs(element.scrollLeft);
    const next = { start: offset > 1, end: max > 1 && offset < max - 1 };

    setScrollEdges(previous => previous.start === next.start && previous.end === next.end ? previous : next);
  });

  /* ---- the header and footer viewports mirror the body's horizontal scroll ---- */
  const headerViewportRef = useRef<HTMLDivElement | null>(null);
  const footerViewportRef = useRef<HTMLDivElement | null>(null);
  const hasFooter = tableHasFooter(table);
  // No header region means no header rows — every aria-rowindex downstream counts from 0.
  const headerRowCount = withColumnHeaders ? table.getHeaderGroups().length : 0;
  const withDetailPanels = Boolean(table.options.meta?.ledger?.renderDetailPanel);
  const rowPinningActive = table.options.enableRowPinning === true;
  const logicalDisplayRowCount
    = rowPinningActive
      ? buildDisplayRows(table.getTopRows(), withDetailPanels).length
      + buildDisplayRows(table.getCenterRows(), withDetailPanels).length
      + buildDisplayRows(table.getBottomRows(), withDetailPanels).length
      : buildDisplayRows(table.getRowModel().rows, withDetailPanels).length;
  const bodyAriaRowCount
    = loading && logicalDisplayRowCount === 0
      ? skeletonRowCount
      : logicalDisplayRowCount + (loadMoreError || loadingMore ? 1 : 0);
  const footerRowCount = hasFooter ? table.getFooterGroups().length : 0;
  const ariaRowCount = headerRowCount + bodyAriaRowCount + footerRowCount;
  const footerAriaRowIndexStart = headerRowCount + bodyAriaRowCount + 1;

  const mirrorBodyScrollLeft = useEventCallback(() => {
    const element = viewportRef.current;

    if (!element) {
      return;
    }

    for (const mirror of [headerViewportRef.current, footerViewportRef.current]) {
      if (mirror && mirror.scrollLeft !== element.scrollLeft) {
        // Assigned inside the scroll event, before paint — all regions move in the same frame.
        mirror.scrollLeft = element.scrollLeft;
      }
    }
  });

  useEffect(() => {
    updateScrollEdges();
    mirrorBodyScrollLeft();
  }, [viewport, columnVars, hasFooter, updateScrollEdges, mirrorBodyScrollLeft]);

  // A dominantly horizontal wheel over the header or footer belongs to the body scroller;
  // vertical-leaning wheels bubble on so the page keeps scrolling naturally.
  useEffect(() => {
    const regions = [headerViewportRef.current, footerViewportRef.current].filter(
      (region): region is HTMLDivElement => region !== null
    );

    if (regions.length === 0) {
      return;
    }

    const forwardWheel = (event: WheelEvent) => {
      const element = viewportRef.current;

      if (!element || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
        return;
      }

      element.scrollLeft += event.deltaX;
      // Consumed — without this the delta would also scroll a horizontal ancestor.
      event.preventDefault();
    };

    // React root wheel listeners are passive; preventDefault needs native non-passive ones.
    for (const region of regions) {
      region.addEventListener("wheel", forwardWheel, { passive: false });
    }

    return () => {
      for (const region of regions) {
        region.removeEventListener("wheel", forwardWheel);
      }
    };
  }, [hasFooter]);

  const handleScrollPositionChange = useEventCallback(() => {
    mirrorBodyScrollLeft();
    maybeFireEndReached();
    updateScrollEdges();
  });

  /* ---- imperative handle ---- */
  const virtualizerRef = useRef<Virtualizer<HTMLDivElement, Element> | null>(null);
  const handleVirtualizerChange = useCallback(
    (virtualizer: Virtualizer<HTMLDivElement, Element> | null) => {
      virtualizerRef.current = virtualizer;
    },
    []
  );

  const scrollRowIntoView = useEventCallback(
    (rowId: string | number, options?: DataTableScrollToRowOptions) => {
      const { rows } = table.getRowModel();
      const id = typeof rowId === "number" ? rows[rowId]?.id : rowId;

      if (id === undefined) {
        return;
      }

      const virtualizer = virtualizerRef.current;

      if (virtualizer) {
        const withDetail = Boolean(table.options.meta?.ledger?.renderDetailPanel);
        const index = resolveVirtualDisplayIndex(table, id, withDetail);

        if (index !== null) {
          virtualizer.scrollToIndex(index, {
            align: options?.align ?? "auto",
            behavior: options?.behavior
          });
        }

        return;
      }

      const selector = `[data-row-id="${typeof CSS === "undefined" ? id.replaceAll("\"", String.raw`\"`) : CSS.escape(id)}"]`;
      const rowElement = viewportRef.current?.querySelector<HTMLElement>(`:scope ${selector}`);

      rowElement?.scrollIntoView({
        behavior: options?.behavior,
        block: options?.align === undefined || options.align === "auto" ? "nearest" : options.align
      });
    }
  );

  useImperativeHandle(
    handleRef,
    () => {
      return {
        table,
        get viewport() {
          return viewportRef.current;
        },
        scrollToRow: scrollRowIntoView,
        startEditing: (rowId, columnId) => {
          const editing = table.options.meta?.ledger?.editing;

          if (!editing) {
            return;
          }

          if (editing.mode === "row") {
            editing.row.start(rowId, columnId === undefined ? undefined : { focusColumnId: columnId });
          } else if (columnId === undefined) {
            warnOnce("start-editing-column", "startEditing needs a columnId in cell mode.");
          } else {
            editing.start({ rowId, columnId });
          }
        },
        stopEditing: options => {
          const editing = table.options.meta?.ledger?.editing;

          if (editing?.mode === "row") {
            editing.row.stop(options);
          } else {
            editing?.stop(options);
          }
        }
      };
    },
    [table, scrollRowIntoView]
  );

  /* ---- active row keyboard (docs/rows.md): the body viewport is the focus stop ---- */
  const activeRowEnabled = table.options.meta?.ledger?.activeRow.enabled === true;

  const handleActiveRowKeyDown = useEventCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const activeRow = table.options.meta?.ledger?.activeRow;

    if (!activeRow?.enabled) {
      return;
    }

    // Keys inside an interactive child (an editor, a checkbox, the retry button) belong to it.
    if ((event.target as HTMLElement).closest("input, button, select, textarea, a, [contenteditable]")) {
      return;
    }

    const pinningActive = table.options.enableRowPinning === true;
    const rows = pinningActive
      ? [...table.getTopRows(), ...table.getCenterRows(), ...table.getBottomRows()]
      : table.getRowModel().rows;

    if (rows.length === 0) {
      return;
    }

    const currentIndex = activeRow.id === null ? -1 : rows.findIndex(row => row.id === activeRow.id);

    const moveTo = (index: number) => {
      const row = rows[Math.min(Math.max(index, 0), rows.length - 1)];

      if (row) {
        activeRow.set(row.id);
        scrollRowIntoView(row.id);
      }
    };

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        moveTo(currentIndex + 1);

        break;
      }

      case "ArrowUp": {
        event.preventDefault();
        moveTo(currentIndex - 1);

        break;
      }

      case "Home": {
        event.preventDefault();
        moveTo(0);

        break;
      }

      case "End": {
        event.preventDefault();
        moveTo(rows.length - 1);

        break;
      }

      case "Enter": {
        const row = currentIndex >= 0 ? rows[currentIndex] : null;

        // Only `onRowActivate` is input-agnostic. `onRowClick` stays literal — synthesizing a
        // MouseEvent for it would make its own type signature a lie.
        if (row && onRowActivate) {
          event.preventDefault();
          onRowActivate(row as Row<TData>, event);
        }

        break;
      }

      // The WAI-APG grid pattern's dedicated edit key. Enter is spoken for here (it activates
      // the row), which is exactly the overload F2 exists to resolve.
      case "F2": {
        const row = currentIndex >= 0 ? rows[currentIndex] : null;
        const editing = table.options.meta?.ledger?.editing;

        if (!row || !editing) {
          break;
        }

        if (editing.mode === "row") {
          event.preventDefault();
          editing.row.start(row.id);

          break;
        }

        // Cell mode has no cell cursor, so the row's first editable cell is the entry point.
        // Checkbox columns are skipped: they commit on toggle and never host an editor.
        // v9's `in out` generics make Cell/Row invariant in TData; the editing predicates take
        // the erased shape, the same boundary the row-editing controller crosses.
        const erasedRow = row as Row<any>;
        const target = erasedRow
          .getVisibleCells()
          .find(cell => canEditCell(cell, erasedRow) && !isCheckboxEdit(cell));

        if (target) {
          event.preventDefault();
          editing.start({ rowId: row.id, columnId: target.column.id });
        }

        break;
      }
      // No default
    }
  });

  /* ---- dev guard rails ---- */
  if (paginationEnabled && onEndReached) {
    warnOnce(
      "pagination-and-end-reached",
      "enablePagination and onEndReached are configured together — pagination and infinite loading are mutually exclusive."
    );
  }

  useEffect(() => {
    if (!virtualEnabled || !viewport || rowsLength <= 50) {
      return;
    }

    // Next frame: judged only after the virtualizer's first measurement commit has painted,
    // otherwise the still-empty tbody reads as "content fits" and false-alarms.
    const frame = requestAnimationFrame(() => {
      if (viewport.clientHeight > 0 && viewport.scrollHeight <= viewport.clientHeight + 4) {
        warnOnce(
          "virtualized-unconstrained",
          "virtualized is set but the viewport is unconstrained (its height equals the content height) — give the table or an ancestor a definite height."
        );
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [virtualEnabled, viewport, rowsLength]);

  /* ---- render ---- */
  const stripedMode = striped === true ? "odd" : striped || undefined;

  // Header and body render as separate tables so the vertical scroller owns only the body:
  // identical props, colgroup, and root-level column variables keep their layouts pixel-equal.
  // Semantics come from the ARIA table on `main` — the native tables are presentational.
  // Row/column borders are ledger-owned at cell level (docs/styling.md), so the border props
  // become root data-attributes instead of Mantine Table props.
  const sharedTableProps = {
    horizontalSpacing,
    layout: "fixed" as const,
    role: "presentation" as const,
    tabularNums,
    verticalSpacing
  };
  // Exact table width (the engine's total) — the browser never redistributes column widths;
  // `border-collapse: separate` is inline because the host's unlayered `collapse` would win,
  // and collapse drops borders on stuck sticky cells (docs/styling.md).
  const tableStyleProps = () => getStyles("table", {
    style: {
      width: columnWidths.total > 0 ? columnWidths.total : undefined,
      minWidth: toPx(tableMinWidth),
      borderCollapse: "separate" as const,
      borderSpacing: 0
    }
  });

  return (
    <DataTableProvider value={contextValue}>
      <Box
        ref={rootRef}
        aria-busy={loading || undefined}
        data-empty={isEmpty || undefined}
        data-error={errorActive || undefined}
        data-highlight-on-hover={highlightOnHover || undefined}
        data-loading={loading || undefined}
        data-scrolled-end={scrollEdges.end || undefined}
        data-scrolled-start={scrollEdges.start || undefined}
        data-striped={stripedMode}
        data-virtualized={virtualEnabled || undefined}
        data-with-column-borders={withColumnBorders || undefined}
        data-with-row-borders={withRowBorders || undefined}
        data-with-table-border={withTableBorder || undefined}
        {...getStyles("root", { style: columnVars })}
        {...others}
      >
        <div
          aria-describedby={ariaDescribedBy}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-rowcount={virtualEnabled ? ariaRowCount : undefined}
          role="table"
          {...getStyles("main")}
        >
          {withColumnHeaders && (
            <div ref={headerViewportRef} {...getStyles("header")}>
              <MantineTable {...sharedTableProps} {...tableStyleProps()}>
                <colgroup>{colElements}</colgroup>
                <TableHeader table={erasedTable} />
              </MantineTable>
            </div>
          )}

          {/* overscroll-behavior: none — rubber-band overscroll translates the body past its
              clamped scroll position, which the mirrored header/footer can never follow; the
              regions shear apart for the duration of the bounce.
              Transparent track/corner — Mantine tints them on hover through unlayered rules
              that defeat any layered override, so inline is the only seat that wins; the thumb
              is its own element and keeps its background. */}
          <ScrollArea
            {...getStyles("scroller")}
            scrollbars="xy"
            type="hover"
            viewportRef={assignViewport}
            styles={{
              corner: { backgroundColor: "transparent" },
              scrollbar: { backgroundColor: "transparent" }
            }}
            viewportProps={mergeElementProps(viewportProps, {
              style: { overscrollBehavior: "none" as const },
              // With the active row on, the body viewport is the keyboard focus stop.
              ...activeRowEnabled && { tabIndex: 0, onKeyDown: handleActiveRowKeyDown }
            })}
            onScrollPositionChange={handleScrollPositionChange}
          >
            <MantineTable {...sharedTableProps} {...tableStyleProps()}>
              <colgroup>{colElements}</colgroup>

              <TableBody
                loading={loading === true}
                loadingMore={loadingMore === true}
                loadMoreError={loadMoreError ?? false}
                skeletonRowCount={skeletonRowCount}
                table={erasedTable}
                viewportRef={viewportRef}
                virtualization={virtualization}
                onLoadMoreRetry={onEndReached ? retryLoadMore : undefined}
                onVirtualizerChange={handleVirtualizerChange}
              />
            </MantineTable>

            {isEmpty && (
              // Polite, not assertive: filtering a table down to nothing is worth announcing,
              // but it must not interrupt the typing that caused it.
              <div
                {...getStyles("empty")}
                data-variant={filtersActive ? "no-results" : "no-data"}
                role="status"
              >
                {emptyState ?? (
                  <EmptyState
                    withIndicatorBackground
                    size="sm"
                    styles={EMPTY_STATE_STYLES}
                    title={filtersActive ? labels.noResults : labels.empty}
                    // The indicator forces the svg to 1em (40px at `sm`), so the stroke is set for
                    // that scale — the Icon default (1.5, drawn for 16px glyphs) turns chunky here.
                    icon={filtersActive
                      ? <IconSearch size={40} strokeWidth={1} />
                      : <IconInbox size={40} strokeWidth={1} />}
                  />
                )}
              </div>
            )}

            {errorActive && (
              <div
                {...getStyles("empty")}
                data-over-rows={rowsLength > 0 || undefined}
                data-variant="error"
                role="alert"
              >
                <EmptyState
                  withIndicatorBackground
                  icon={<IconAlertTriangle size={40} strokeWidth={1} />}
                  size="sm"
                  styles={EMPTY_STATE_STYLES}
                  title={error === true ? labels.error : error}
                >
                  {onRetry && (
                    <Button size="xs" variant="light" onClick={onRetry}>
                      {labels.retry}
                    </Button>
                  )}
                </EmptyState>
              </div>
            )}
          </ScrollArea>

          {hasFooter && (
            <div ref={footerViewportRef} {...getStyles("footer")}>
              <MantineTable {...sharedTableProps} {...tableStyleProps()}>
                <colgroup>{colElements}</colgroup>

                <TableFooter
                  ariaRowIndexStart={virtualEnabled ? footerAriaRowIndexStart : undefined}
                  table={erasedTable}
                />
              </MantineTable>
            </div>
          )}
        </div>

        {loading && rowsLength > 0 && <LoadingOverlay visible overlayProps={{ blur: 1 }} zIndex={20} />}

        {paginationEnabled && withPaginationBar
          && <PaginationBar pageSizeOptions={pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS} table={table} />}
      </Box>
    </DataTableProvider>
  );
}

DataTable.displayName = "@coldsmirk/ledger-mantine/DataTable";
DataTable.classes = classes;
DataTable.Search = DataTableSearch;
DataTable.ColumnsPanel = DataTableColumnsPanel;
DataTable.Pagination = DataTablePagination;
DataTable.SelectionBar = DataTableSelectionBar;
