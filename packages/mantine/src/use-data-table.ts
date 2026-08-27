import type {
  ColumnFiltersState,
  ColumnOrderState,
  ColumnPinningState,
  ColumnSizingState,
  ExpandedState,
  GroupingState,
  PaginationState,
  RowData,
  RowPinningState,
  RowSelectionState,
  SortingState,
  TableOptions,
  TableState,
  Updater
} from "@tanstack/react-table";

import type { LedgerInternalMeta, LedgerSortingController } from "./ledger-commands";
import type { LedgerFeatures } from "./ledger-features";
import type {
  DataTableEditingCell,
  TableInstance,
  UseDataTableOptions
} from "./types";

/**
 * The behavior core (docs/api.md): assembles the canonical v9 feature set (plus consumer
 * `filterFns`), translates `*Mode: "server"` into TanStack's manual flags, injects the
 * selection/expander columns, normalizes every state slice into the controlled/uncontrolled
 * trio, and carries ledger-private state through `table.options.meta.ledger`. Returns the bare
 * TanStack table instance.
 */
import { functionalUpdate, useTable } from "@tanstack/react-table";
import { useCallback, useEffect, useInsertionEffect, useMemo, useRef, useState } from "react";

import { buildColumns, EXPANDER_COLUMN_ID, SELECTION_COLUMN_ID } from "./build-columns";
import { isDev, warnOnce } from "./env";
import { ledgerFilterFns } from "./filter-fns";
import { buildLedgerFeatures } from "./ledger-features";
import { readPersistedState, usePersistWriter } from "./persist";
import { nextSorting } from "./toggle-fns";
import { useCellEditing } from "./use-cell-editing";
import { useCommittedTable } from "./use-committed-table";
import { useInstantEditing } from "./use-instant-editing";
import { useResponsiveColumns } from "./use-responsive-columns";
import { useRowCommands } from "./use-row-commands";
import { useRowEditing } from "./use-row-editing";
import { useSlice } from "./use-slice";

/* Stable fallbacks — a fresh identity per render would defeat TanStack's memoization. */
const NO_SORTING: SortingState = [];
const NO_COLUMN_FILTERS: ColumnFiltersState = [];
const NO_ROW_SELECTION: RowSelectionState = {};
const NO_EXPANDED: ExpandedState = {};
const NO_VISIBILITY: Record<string, boolean> = {};
const NO_PINNING: ColumnPinningState = { start: [], end: [] };
const NO_COLUMN_ORDER: ColumnOrderState = [];
const NO_COLUMN_SIZING: ColumnSizingState = {};
const NO_GROUPING: GroupingState = [];
const NO_ROW_PINNING: RowPinningState = { top: [], bottom: [] };
const DEFAULT_PAGINATION: PaginationState = { pageIndex: 0, pageSize: 20 };

export function useDataTable<TData extends RowData>(options: UseDataTableOptions<TData>): TableInstance<TData> {
  const {
    data,
    columns,
    getRowId,
    enableSorting = true,
    enableMultiSort = true,
    enableSortingRemoval = true,
    enableColumnFilters = true,
    enableGlobalFilter = false,
    enablePagination = false,
    enableRowSelection = false,
    enableMultiRowSelection = true,
    enableColumnResizing = false,
    enableColumnPinning = true,
    enableColumnOrdering = false,
    enableHiding = true,
    enableEditing = true,
    enableGrouping = false,
    enableRowPinning = false,
    enableCellSpanning = true,
    getSubRows,
    renderDetailPanel,
    selectionColumn,
    expanderColumn,
    sortingMode = "client",
    filterMode = "client",
    paginationMode = "client",
    rowCount,
    editTrigger = "double-click",
    editMode = "cell",
    onEditCommit,
    onRowEditCommit,
    enableActiveRow = false,
    enableRowOrdering = false,
    onRowReorder,
    rowDragColumn,
    persistState,
    defaultColumn,
    tableOptions
  } = options;

  /* ---- the feature set: canonical modules + the consumer's filterFns, fixed at mount ---- */
  const [features] = useState<LedgerFeatures>(() => buildLedgerFeatures(options.filterFns));

  if (isDev && options.filterFns) {
    for (const filterFnId of Object.keys(ledgerFilterFns)) {
      if (Object.hasOwn(options.filterFns, filterFnId)) {
        warnOnce(
          `filterFns.${filterFnId}`,
          `filterFns.${filterFnId} is reserved by ledger and has been overridden.`
        );
      }
    }
  }

  /* ---- persistence hydrates uncontrolled slices, once, synchronously ---- */
  const [persisted] = useState(() => readPersistedState(persistState));
  const filterSetListeners = useRef({
    columnFilters: new Set<(value: ColumnFiltersState) => void>(),
    globalFilter: new Set<(value: string) => void>()
  });

  /* ---- state slices: controlled x / uncontrolled defaultX / observer onXChange ---- */
  const [sorting, setSorting] = useSlice({
    value: options.sorting,
    defaultValue: (persisted.sorting as SortingState | undefined) ?? options.defaultSorting,
    onChange: options.onSortingChange,
    fallback: NO_SORTING
  });
  const [columnFilters, setColumnFilters] = useSlice({
    value: options.columnFilters,
    defaultValue: (persisted.columnFilters as ColumnFiltersState | undefined) ?? options.defaultColumnFilters,
    onChange: options.onColumnFiltersChange,
    onSet: value => {
      for (const listener of filterSetListeners.current.columnFilters) {
        listener(value);
      }
    },
    fallback: NO_COLUMN_FILTERS
  });
  const [globalFilter, setGlobalFilter] = useSlice({
    value: options.globalFilter,
    defaultValue: (persisted.globalFilter as string | undefined) ?? options.defaultGlobalFilter,
    onChange: options.onGlobalFilterChange,
    onSet: value => {
      for (const listener of filterSetListeners.current.globalFilter) {
        listener(value);
      }
    },
    fallback: ""
  });
  const [pagination, setPagination] = useSlice({
    value: options.pagination,
    defaultValue: (persisted.pagination as PaginationState | undefined) ?? options.defaultPagination,
    onChange: options.onPaginationChange,
    fallback: DEFAULT_PAGINATION
  });
  const [rowSelection, setRowSelection] = useSlice({
    value: options.rowSelection,
    defaultValue: options.defaultRowSelection,
    onChange: options.onRowSelectionChange,
    fallback: NO_ROW_SELECTION
  });
  const [expanded, setExpanded] = useSlice({
    value: options.expanded,
    defaultValue: options.defaultExpanded,
    onChange: options.onExpandedChange,
    fallback: NO_EXPANDED
  });
  const [columnVisibility, setColumnVisibility] = useSlice({
    value: options.columnVisibility,
    defaultValue: (persisted.columnVisibility as Record<string, boolean> | undefined) ?? options.defaultColumnVisibility,
    onChange: options.onColumnVisibilityChange,
    fallback: NO_VISIBILITY
  });
  const [columnPinning, setColumnPinning] = useSlice({
    value: options.columnPinning,
    defaultValue: (persisted.columnPinning as ColumnPinningState | undefined) ?? options.defaultColumnPinning,
    onChange: options.onColumnPinningChange,
    fallback: NO_PINNING
  });
  const [columnOrder, setColumnOrder] = useSlice({
    value: options.columnOrder,
    defaultValue: (persisted.columnOrder as ColumnOrderState | undefined) ?? options.defaultColumnOrder,
    onChange: options.onColumnOrderChange,
    fallback: NO_COLUMN_ORDER
  });
  const [columnSizing, setColumnSizing] = useSlice({
    value: options.columnSizing,
    defaultValue: (persisted.columnSizing as ColumnSizingState | undefined) ?? options.defaultColumnSizing,
    onChange: options.onColumnSizingChange,
    fallback: NO_COLUMN_SIZING
  });
  const [grouping, setGrouping] = useSlice({
    value: options.grouping,
    defaultValue: (persisted.grouping as GroupingState | undefined) ?? options.defaultGrouping,
    onChange: options.onGroupingChange,
    fallback: NO_GROUPING
  });
  const [rowPinning, setRowPinning] = useSlice({
    value: options.rowPinning,
    defaultValue: options.defaultRowPinning,
    onChange: options.onRowPinningChange,
    fallback: NO_ROW_PINNING
  });
  const [editingCell, setEditingCell] = useSlice<DataTableEditingCell | null>({
    value: options.editingCell,
    defaultValue: undefined,
    onChange: options.onEditingCellChange,
    fallback: null
  });
  const [editingRowId, setEditingRowId] = useSlice<string | null>({
    value: options.editingRowId,
    defaultValue: undefined,
    onChange: options.onEditingRowIdChange,
    fallback: null
  });
  const [activeRowId, setActiveRowSlice] = useSlice<string | null>({
    value: options.activeRowId,
    defaultValue: options.defaultActiveRowId,
    onChange: options.onActiveRowIdChange,
    fallback: null
  });
  const setActiveRowId = useCallback(
    (id: string | null) => setActiveRowSlice(id),
    [setActiveRowSlice]
  );
  const setNormalizedGlobalFilter = useCallback((updater: Updater<unknown>) => {
    setGlobalFilter(previous => {
      const next = functionalUpdate(updater, previous);

      return typeof next === "string" ? next : "";
    });
  }, [setGlobalFilter]);

  /* ---- editing controller (docs/editing.md) ---- */
  // Rows, definitions and the gate as the render that reached the screen left them: everything the
  // editing paths decide with is resolved from here, never from the shared core, which carries
  // whatever pass ran last — a discarded one included (see `use-committed-table.ts`).
  const [committed, captureCommitted] = useCommittedTable<TData>();

  // The cell session lives in its own module: everything an editor shows, and everything its
  // commit decides with, has to outlive an editor that a hidden column or a virtual scroll can
  // unmount at any moment (docs/architecture.md).
  const cellSession = useCellEditing<TData>({
    committed,
    editingCell,
    onEditCommit,
    setEditingCell
  });

  // An instant column commits on change instead of opening an editor, but what a commit leaves
  // behind — a write still out, its failure, the value the application now holds — outlives the
  // control just as a session outlives its editor (docs/architecture.md).
  const instantSession = useInstantEditing<TData>({
    committed,
    onEditCommit
  });

  /* ---- row editing controller (editMode: "row", docs/editing.md#row-mode) ---- */
  // In its own module for the reason the other two sessions are: what the row's editors show, and
  // what its atomic commit decides with, has to outlive editors a hidden column or a virtual
  // scroll can unmount at any moment (docs/architecture.md).
  const rowSession = useRowEditing<TData>({
    committed,
    editingRowId,
    onRowEditCommit,
    setEditingRowId
  });

  if (isDev && editMode === "row") {
    if (options.editingCell !== undefined || options.onEditingCellChange) {
      warnOnce("row-mode-editing-cell", "editingCell is a cell-mode slice — editMode: \"row\" tracks editingRowId instead.");
    }

    if (onEditCommit) {
      warnOnce("row-mode-on-edit-commit", "onEditCommit never fires under editMode: \"row\" — use onRowEditCommit.");
    }
  }

  const [selectionCommands, expansionCommands, captureRows] = useRowCommands<TData>(setRowSelection, setExpanded);
  const sortingCommands = useMemo<LedgerSortingController>(
    () => {
      return {
        toggle: (spec, multi) => setSorting(previous => nextSorting(previous, spec, multi))
      };
    },
    [setSorting]
  );

  const subscribeColumnFilters = useCallback((listener: (value: ColumnFiltersState) => void) => {
    const listeners = filterSetListeners.current.columnFilters;
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, []);
  const subscribeGlobalFilter = useCallback((listener: (value: string) => void) => {
    const listeners = filterSetListeners.current.globalFilter;
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  const selectAllScope: "page" | "all"
    = enablePagination || paginationMode === "server" ? "page" : "all";

  /* ---- columns: breakpoint filter + injected row-drag/selection/expander + meta.filter wiring ---- */
  const responsiveColumns = useResponsiveColumns(columns);
  const withExpander = Boolean(renderDetailPanel || getSubRows);
  // The static row-ordering gate (docs/rows.md#row-ordering): without a handler nothing could
  // apply a move — row order is data order — and tree data has no flat order to move within.
  const withRowDrag = enableRowOrdering && onRowReorder !== undefined && !getSubRows;

  if (isDev && enableRowOrdering && getSubRows) {
    warnOnce("row-ordering-tree", "enableRowOrdering supports flat data only — getSubRows disables it (docs/rows.md#row-ordering).");
  }

  const processedColumns = useMemo(
    () => buildColumns({
      columns: responsiveColumns,
      withRowDrag,
      withSelection: Boolean(enableRowSelection),
      withExpander,
      rowDragColumn,
      selectionColumn,
      expanderColumn
    }),
    [responsiveColumns, withRowDrag, enableRowSelection, withExpander, rowDragColumn, selectionColumn, expanderColumn]
  );

  // The live half of the gate: while something else controls the visible order, a "reorder"
  // has no data-order meaning — the handles disable and say why (labels.rowOrderingUnavailable).
  const rowOrderable = withRowDrag
    && sorting.length === 0
    && columnFilters.length === 0
    && !globalFilter
    && grouping.length === 0;

  const ledger: LedgerInternalMeta<TData> = useMemo(
    () => {
      return {
        columns: processedColumns,
        sorting: sortingCommands,
        selection: selectionCommands,
        expansion: expansionCommands,
        editing: {
          mode: editMode,
          cell: editingCell,
          active: cellSession.active,
          start: cellSession.start,
          stop: cellSession.stop,
          clear: cellSession.clear,
          commit: cellSession.commit,
          cancel: cellSession.cancel,
          moveTo: cellSession.moveTo,
          drafts: {
            error: cellSession.error,
            pending: cellSession.pending,
            read: cellSession.read,
            write: cellSession.write
          },
          register: cellSession.register,
          firstEditable: cellSession.firstEditable,
          instant: instantSession,
          // The slice is the hook's, the session is the controller's — spread so the two cannot
          // drift out of the shape `LedgerRowEditingController` declares.
          row: { id: editingRowId, ...rowSession }
        },
        filtering: {
          subscribeColumnFilters,
          subscribeGlobalFilter
        },
        editTrigger,
        enableEditing,
        onEditCommit,
        onRowEditCommit,
        renderDetailPanel,
        selectAllScope,
        activeRow: {
          enabled: enableActiveRow,
          id: activeRowId,
          set: setActiveRowId
        },
        enableColumnOrdering,
        enableColumnResizing,
        enablePagination,
        rowOrdering: {
          enabled: withRowDrag,
          orderable: rowOrderable,
          onRowReorder
        }
      };
    },
    [
      sortingCommands,
      selectionCommands,
      expansionCommands,
      processedColumns,
      editingCell,
      cellSession,
      instantSession,
      editMode,
      editingRowId,
      rowSession,
      subscribeColumnFilters,
      subscribeGlobalFilter,
      editTrigger,
      enableEditing,
      onEditCommit,
      onRowEditCommit,
      renderDetailPanel,
      selectAllScope,
      enableActiveRow,
      activeRowId,
      setActiveRowId,
      enableColumnOrdering,
      enableColumnResizing,
      enablePagination,
      withRowDrag,
      rowOrderable,
      onRowReorder
    ]
  );

  /* Injected columns are always pinned to the start, invisibly merged over the consumer's slice. */
  const mergedColumnPinning = useMemo<ColumnPinningState>(() => {
    const internal: string[] = [];

    if (enableRowSelection) {
      internal.push(SELECTION_COLUMN_ID);
    }

    if (withExpander) {
      internal.push(EXPANDER_COLUMN_ID);
    }

    const start = columnPinning.start.filter(id => !internal.includes(id));

    return { start: [...internal, ...start], end: columnPinning.end };
  }, [columnPinning, enableRowSelection, withExpander]);

  /* ---- dev guard rails (docs/state.md) ---- */
  if (isDev && (enableRowSelection || withExpander) && !getRowId) {
    warnOnce(
      "missing-get-row-id",
      "Row selection/expansion is enabled without getRowId — index-based row ids corrupt state across refetches."
    );
  }

  const churn = useRef({
    renders: 0,
    columnChanges: 0,
    previousColumns: columns
  });

  if (isDev) {
    const tracker = churn.current;
    tracker.renders += 1;

    if (columns !== tracker.previousColumns) {
      tracker.columnChanges += 1;
      tracker.previousColumns = columns;
    }

    if (tracker.renders >= 10 && tracker.columnChanges >= tracker.renders - 2) {
      warnOnce(
        "columns-identity",
        "`columns` has a new identity on almost every render — memoize it, or the table re-initializes continuously."
      );
    }
  }

  /* ---- client/server translation + auto-reset policy (docs/state.md) ---- */
  const manualSorting = sortingMode === "server";
  const manualFiltering = filterMode === "server";
  const serverPagination = paginationMode === "server";
  /**
   * v9 runs the paginated row model unless the factory is absent or `manualPagination` is set
   * (`getRowModel` → `getPrePaginatedRowModel`). The factory is part of the canonical feature
   * set and features are read once at mount, so the switch that stays reactive is this one:
   * with pagination off every row has to reach the body, which is the same short-circuit the
   * server mode takes. It is inert elsewhere — `paginateExpandedRows` defaults to `true`, so
   * the expanded row model is unaffected, and the upstream page-reset default it also gates is
   * meaningless while there are no pages.
   */
  const bypassPaginatedRowModel = serverPagination || !enablePagination;

  const shouldAutoResetPageIndex
    = tableOptions?.autoResetAll ?? tableOptions?.autoResetPageIndex ?? true;
  const previousResetInputs = useRef({
    columnFilters,
    globalFilter,
    sorting
  });

  useEffect(() => {
    const previous = previousResetInputs.current;
    const inputsChanged
      = previous.columnFilters !== columnFilters
        || previous.globalFilter !== globalFilter
        || previous.sorting !== sorting;
    previousResetInputs.current = {
      columnFilters,
      globalFilter,
      sorting
    };

    if (!serverPagination || !shouldAutoResetPageIndex || !inputsChanged) {
      return;
    }

    setPagination(previous => previous.pageIndex === 0 ? previous : { ...previous, pageIndex: 0 });
  }, [
    columnFilters,
    globalFilter,
    sorting,
    serverPagination,
    setPagination,
    shouldAutoResetPageIndex
  ]);

  // ---- reset targets ----
  // TanStack's slice reset APIs restore `table.initialState`. The live state remains fully
  // controlled; this object exists only to preserve ledger's `defaultX`/fallback contract.
  // Persisted values stay excluded so reset remains useful after hydration.
  const resetInitialState: Partial<TableState<LedgerFeatures>> = {
    sorting: options.defaultSorting ?? NO_SORTING,
    columnFilters: options.defaultColumnFilters ?? NO_COLUMN_FILTERS,
    globalFilter: options.defaultGlobalFilter ?? "",
    pagination: options.defaultPagination ?? DEFAULT_PAGINATION,
    rowSelection: options.defaultRowSelection ?? NO_ROW_SELECTION,
    expanded: options.defaultExpanded ?? NO_EXPANDED,
    columnVisibility: options.defaultColumnVisibility ?? NO_VISIBILITY,
    columnPinning: options.defaultColumnPinning ?? NO_PINNING,
    columnOrder: options.defaultColumnOrder ?? NO_COLUMN_ORDER,
    columnSizing: options.defaultColumnSizing ?? NO_COLUMN_SIZING,
    grouping: options.defaultGrouping ?? NO_GROUPING,
    rowPinning: options.defaultRowPinning ?? NO_ROW_PINNING
  };

  /* ---- assemble: tableOptions is the base layer, ledger-managed keys override (docs/state.md) ---- */
  const managed = {
    data,
    columns: processedColumns,
    features,
    ...getRowId && { getRowId },
    ...defaultColumn && { defaultColumn },
    initialState: resetInitialState,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      pagination,
      rowSelection,
      expanded,
      columnVisibility,
      columnPinning: mergedColumnPinning,
      columnOrder,
      columnSizing,
      grouping,
      rowPinning
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setNormalizedGlobalFilter,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    onExpandedChange: setExpanded,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnPinningChange: setColumnPinning,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onGroupingChange: setGrouping,
    onRowPinningChange: setRowPinning,
    enableSorting,
    enableMultiSort,
    enableSortingRemoval,
    enableColumnFilters,
    enableGlobalFilter,
    enableRowSelection,
    enableMultiRowSelection,
    enableColumnPinning,
    enableHiding,
    enableGrouping,
    enableRowPinning,
    enableCellSpanning,
    enableExpanding: withExpander || enableGrouping,
    ...getSubRows && { getSubRows },
    ...renderDetailPanel && { getRowCanExpand: () => true },
    manualSorting,
    manualFiltering,
    manualPagination: bypassPaginatedRowModel,
    ...serverPagination && rowCount !== undefined && { rowCount },
    ...serverPagination && {
      // `autoResetAll` outranks `autoResetPageIndex` inside TanStack. Consume it here so the
      // deterministic server reset remains authoritative, while preserving its only other
      // upstream effects through the feature-specific options.
      autoResetAll: undefined,
      autoResetExpanded: tableOptions?.autoResetAll ?? tableOptions?.autoResetExpanded,
      autoResetSorting: tableOptions?.autoResetAll ?? tableOptions?.autoResetSorting,
      autoResetPageIndex: false
    },
    meta: { ...tableOptions?.meta, ledger }
  } satisfies Partial<TableOptions<LedgerFeatures, TData>>;

  if (isDev && tableOptions) {
    for (const key of Object.keys(tableOptions)) {
      const isConsumedPaginationPolicy = serverPagination
        && (key === "autoResetAll" || key === "autoResetExpanded" || key === "autoResetSorting" || key === "autoResetPageIndex");

      if (key !== "meta" && !isConsumedPaginationPolicy && Object.hasOwn(managed, key)) {
        warnOnce(
          `tableOptions.${key}`,
          `tableOptions.${key} is managed by ledger and has been overridden — use the first-class option instead.`
        );
      }
    }
  }

  const table = useTable<LedgerFeatures, TData>({ ...tableOptions, ...managed } as TableOptions<LedgerFeatures, TData>);

  /**
   * What the editing paths and the row commands answer from. v9's `useTable` returns a fresh
   * wrapper whenever options or state change — `useMemo(() => ({ ...table, options, state }))` —
   * so neither that wrapper nor the shared core beneath it can be read at event time: a
   * transition React renders and then throws away leaves the core holding options nothing on
   * screen is using, and a commit would then be gated by an `enableEditing` the user never saw.
   *
   * Taken in the insertion phase, which is the commit — a render React throws away never reaches
   * one, so it never gets to say what the editing paths saw — and before every layout effect, so
   * a session boundary or an editor registration already sees this render's answers.
   */
  useInsertionEffect(() => {
    captureCommitted(table, {
      enableEditing,
      hasCommitHandler: Boolean(editMode === "row" ? onRowEditCommit : onEditCommit)
    });
    captureRows(table);
  });

  usePersistWriter(persistState, {
    sorting,
    columnFilters,
    globalFilter,
    pagination,
    columnVisibility,
    columnPinning,
    columnOrder,
    columnSizing,
    grouping
  });

  return table;
}
