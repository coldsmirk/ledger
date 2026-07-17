import type {
  BoxProps,
  ElementProps,
  Factory,
  MantineColor,
  MantineSpacing,
  StylesApiProps
} from "@mantine/core";
import type { Row, Table } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { JSX, MouseEvent, ReactNode, Ref } from "react";

import type { DataTableContextValue } from "./context";
import type { DataTableLabels } from "./labels";
import type { VirtualizationConfig } from "./table-body";
import type {
  DataTableHandle,
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
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { DataTableColumnsMenu } from "./columns-menu";
import { DataTableProvider } from "./context";
import { warnOnce } from "./env";
import { IconInbox } from "./icons";
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
    | "columnMenu"
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
  columnMenu: "ledger-column-menu",
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

// ------------------------------------------------------------------------------------------------
// Props
// ----------------------------------------------------------------------------------------------

export interface DataTableBaseProps<TData>
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

  /* State presentation */
  loading?: boolean;
  emptyState?: ReactNode;

  /* Chrome */
  withColumnMenu?: boolean;
  withPaginationBar?: boolean;
  pageSizeOptions?: number[];

  /* Row interaction */
  onRowClick?: (row: Row<TData>, event: MouseEvent) => void;
  onRowDoubleClick?: (row: Row<TData>, event: MouseEvent) => void;
  onRowContextMenu?: (row: Row<TData>, event: MouseEvent) => void;
  rowClassName?: string | ((row: Row<TData>) => string | undefined);

  labels?: Partial<DataTableLabels>;

  /**
   * Imperative handle: `{ table, viewport, scrollToRow, startEditing, stopEditing }`.
   */
  handleRef?: Ref<DataTableHandle<TData>>;
}

/**
 * Data source — a discriminated pair: a hook-mode instance XOR inline behavior options.
 */
export type DataTableProps<TData = unknown> = DataTableBaseProps<TData>
  & (
    | ({ table: TableInstance<TData> } & { data?: never; columns?: never })
    | ({ table?: never } & UseDataTableOptions<TData>)
  );

export type DataTableFactory = Factory<{
  props: DataTableProps;
  ref: HTMLDivElement;
  stylesNames: DataTableStylesNames;
  vars: DataTableCssVariables;
  signature: <TData>(props: DataTableProps<TData>) => JSX.Element;
  staticComponents: {
    Search: typeof DataTableSearch;
    ColumnsMenu: typeof DataTableColumnsMenu;
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
  withColumnMenu: true,
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
  "getSubRows",
  "renderDetailPanel",
  "sortingMode",
  "filterMode",
  "paginationMode",
  "rowCount",
  "editTrigger",
  "onEditCommit",
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
  "tableOptions"
] as const satisfies ReadonlyArray<keyof UseDataTableOptions<unknown>>;

/**
 * Compile-time exhaustiveness: adding an option without listing it above is a type error.
 */
type MissingOptionKeys = Exclude<keyof UseDataTableOptions<unknown>, (typeof OPTION_KEYS)[number]>;

type AssertNever<T extends never> = T;

// AssertNever<MissingOptionKeys> is `never` while the list is exhaustive; a forgotten key turns
// it into a constraint violation right here.
const OPTION_KEY_SET: ReadonlySet<string> = new Set<AssertNever<MissingOptionKeys> | string>(OPTION_KEYS);

// ------------------------------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------------------------

function DataTableRoot<TData>(_props: DataTableProps<TData>) {
  const props = useProps("DataTable", defaultProps as Partial<DataTableProps<TData>>, _props);

  if (props.table) {
    const { table, ...presentation } = props;

    return <DataTableCore presentation={presentation as DataTableBaseProps<TData>} table={table} />;
  }

  return <DataTableFromOptions props={props} />;
}

export const DataTable = genericFactory<DataTableFactory>(DataTableRoot);

interface RoutedProps<TData> {
  presentation: DataTableBaseProps<TData>;
  table: Table<TData>;
}

function DataTableFromOptions<TData>({ props }: { props: DataTableProps<TData> }) {
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

function DataTableCore<TData>({ presentation, table }: RoutedProps<TData>) {
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
    loading,
    emptyState,
    withColumnMenu,
    withPaginationBar,
    pageSizeOptions,
    onRowClick,
    onRowDoubleClick,
    onRowContextMenu,
    rowClassName,
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
  // Display order is pinned-aware (left + center + right) — header groups and row cells
  // already render in it, so the colgroup and every width/offset must follow the same order
  // (`getVisibleLeafColumns` alone ignores pinning). Stabilized by id signature so downstream
  // memos only recompute when the composition or order actually changes.
  const displayColumns = [
    ...table.getLeftVisibleLeafColumns(),
    ...table.getCenterVisibleLeafColumns(),
    ...table.getRightVisibleLeafColumns()
  ];
  const displayOrderSignature = displayColumns.map(column => column.id).join(",");
  // eslint-disable-next-line @eslint-react/exhaustive-deps -- the signature encodes order/composition; columns identity covers definition swaps
  const visibleLeafColumns = useMemo(() => displayColumns, [displayOrderSignature, table.options.columns]);
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
  const rowDoubleClickStable = useEventCallback(onRowDoubleClick);
  const rowContextMenuStable = useEventCallback(onRowContextMenu);

  const filterMode: "client" | "server" = table.options.manualFiltering ? "server" : "client";

  const contextValue = useMemo<DataTableContextValue>(
    () => {
      return {
        table: table as Table<unknown>,
        getStyles: stableGetStyles,
        labels,
        withColumnMenu: withColumnMenu === true,
        filterMode,
        virtualized: virtualEnabled,
        columnWidths: columnWidthsRef,
        onRowClick: onRowClick ? (rowClickStable as DataTableContextValue["onRowClick"]) : undefined,
        onRowDoubleClick: onRowDoubleClick
          ? (rowDoubleClickStable as DataTableContextValue["onRowDoubleClick"])
          : undefined,
        onRowContextMenu: onRowContextMenu
          ? (rowContextMenuStable as DataTableContextValue["onRowContextMenu"])
          : undefined,
        rowClassName: rowClassName as DataTableContextValue["rowClassName"]
      };
    },
    [
      table,
      stableGetStyles,
      labels,
      withColumnMenu,
      filterMode,
      virtualEnabled,
      onRowClick,
      onRowDoubleClick,
      onRowContextMenu,
      rowClickStable,
      rowDoubleClickStable,
      rowContextMenuStable,
      rowClassName
    ]
  );

  // ---- column geometry: the width engine resolves every column to exact integer pixels,
  // written as CSS variables (a resize updates variables, never re-renders rows) ----
  const tableState = table.getState();

  const columnVars = useMemo(() => {
    const varsMap: Record<string, string> = {};
    let leftOffset = 0;

    for (const column of visibleLeafColumns) {
      const width = columnWidths.byId[column.id] ?? 0;
      varsMap[columnWidthVar(column.id)] = `${width}px`;

      if (column.getIsPinned() === "left") {
        varsMap[columnStartVar(column.id)] = `${leftOffset}px`;
        leftOffset += width;
      }
    }

    let rightOffset = 0;

    for (let index = visibleLeafColumns.length - 1; index >= 0; index -= 1) {
      const column = visibleLeafColumns[index]!;

      if (column.getIsPinned() === "right") {
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
  const isEmpty = !loading && rowsLength === 0;
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

  useImperativeHandle(
    handleRef,
    () => {
      return {
        table,
        get viewport() {
          return viewportRef.current;
        },
        scrollToRow: (rowId, options) => {
          const { rows } = table.getRowModel();
          const id = typeof rowId === "number" ? rows[rowId]?.id : rowId;

          if (id === undefined) {
            return;
          }

          const virtualizer = virtualizerRef.current;

          if (virtualizer) {
            const withDetail = Boolean(table.options.meta?.ledger?.renderDetailPanel);
            const displayRows = buildDisplayRows(rows, withDetail);
            const index = displayRows.findIndex(displayRow => displayRow.kind === "data" && displayRow.row.id === id);

            if (index !== -1) {
              virtualizer.scrollToIndex(index, {
                align: options?.align ?? "auto",
                behavior: options?.behavior
              });
            }

            return;
          }

          const selector = `[data-row-id="${typeof CSS === "undefined" ? id.replaceAll("\"", String.raw`\"`) : CSS.escape(id)}"]`;
          const rowElement = viewportRef.current?.querySelector<HTMLElement>(selector);

          rowElement?.scrollIntoView({
            behavior: options?.behavior,
            block: options?.align === undefined || options.align === "auto" ? "nearest" : options.align
          });
        },
        startEditing: (rowId, columnId) => table.options.meta?.ledger?.editing.start({ rowId, columnId }),
        stopEditing: options => table.options.meta?.ledger?.editing.stop(options)
      };
    },
    [table]
  );

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
  const headerRowCount = table.getHeaderGroups().length;

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
          aria-rowcount={virtualEnabled ? rowsLength + headerRowCount : undefined}
          role="table"
          {...getStyles("main")}
        >
          <div ref={headerViewportRef} {...getStyles("header")}>
            <MantineTable {...sharedTableProps} {...tableStyleProps()}>
              <colgroup>{colElements}</colgroup>
              <TableHeader table={table} />
            </MantineTable>
          </div>

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
            viewportProps={{ style: { overscrollBehavior: "none" } }}
            viewportRef={assignViewport}
            styles={{
              corner: { backgroundColor: "transparent" },
              scrollbar: { backgroundColor: "transparent" }
            }}
            onScrollPositionChange={handleScrollPositionChange}
          >
            <MantineTable {...sharedTableProps} {...tableStyleProps()}>
              <colgroup>{colElements}</colgroup>

              <TableBody
                loading={loading === true}
                loadingMore={loadingMore === true}
                skeletonRowCount={skeletonRowCount}
                table={table}
                viewportRef={viewportRef}
                virtualization={virtualization}
                onVirtualizerChange={handleVirtualizerChange}
              />
            </MantineTable>

            {isEmpty && (
              <div {...getStyles("empty")}>
                {emptyState ?? (
                  <EmptyState
                    withIndicatorBackground
                    icon={<IconInbox size={22} />}
                    size="sm"
                    title={labels.empty}
                  />
                )}
              </div>
            )}
          </ScrollArea>

          {hasFooter && (
            <div ref={footerViewportRef} {...getStyles("footer")}>
              <MantineTable {...sharedTableProps} {...tableStyleProps()}>
                <colgroup>{colElements}</colgroup>
                <TableFooter table={table} />
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
DataTable.ColumnsMenu = DataTableColumnsMenu;
DataTable.Pagination = DataTablePagination;
DataTable.SelectionBar = DataTableSelectionBar;
