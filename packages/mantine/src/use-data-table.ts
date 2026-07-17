import type {
  ColumnFiltersState,
  ColumnOrderState,
  ColumnPinningState,
  ColumnSizingState,
  ExpandedState,
  GroupingState,
  PaginationState,
  RowPinningState,
  RowSelectionState,
  SortingState,
  Table,
  TableOptions,
  Updater
} from "@tanstack/react-table";

import type {
  ActiveCellEditor,
  DataTableEditingCell,
  LedgerMeta,
  UseDataTableOptions
} from "./types";

/**
 * The behavior core (docs/api.md): wires row models per feature switch, translates
 * `*Mode: "server"` into TanStack's manual flags, injects the selection/expander columns,
 * normalizes every state slice into the controlled/uncontrolled trio, and carries ledger-private
 * state through `table.options.meta.ledger`. Returns the bare TanStack `Table` instance.
 */
import {
  functionalUpdate,
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getGroupedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildColumns, EXPANDER_COLUMN_ID, SELECTION_COLUMN_ID } from "./build-columns";
import { isDev, warnOnce } from "./env";
import { ledgerFilterFns } from "./filter-fns";
import { readPersistedState, usePersistWriter } from "./persist";
import { useSlice } from "./use-slice";
import { useEventCallback } from "./utils";

/* Stable fallbacks — a fresh identity per render would defeat TanStack's memoization. */
const NO_SORTING: SortingState = [];
const NO_COLUMN_FILTERS: ColumnFiltersState = [];
const NO_ROW_SELECTION: RowSelectionState = {};
const NO_EXPANDED: ExpandedState = {};
const NO_VISIBILITY: Record<string, boolean> = {};
const NO_PINNING: ColumnPinningState = {};
const NO_COLUMN_ORDER: ColumnOrderState = [];
const NO_COLUMN_SIZING: ColumnSizingState = {};
const NO_GROUPING: GroupingState = [];
const NO_ROW_PINNING: RowPinningState = { top: [], bottom: [] };
const DEFAULT_PAGINATION: PaginationState = { pageIndex: 0, pageSize: 20 };

export function useDataTable<TData>(options: UseDataTableOptions<TData>): Table<TData> {
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
    getSubRows,
    renderDetailPanel,
    sortingMode = "client",
    filterMode = "client",
    paginationMode = "client",
    rowCount,
    editTrigger = "double-click",
    onEditCommit,
    persistState,
    defaultColumn,
    tableOptions
  } = options;

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
  const setNormalizedGlobalFilter = useCallback((updater: Updater<unknown>) => {
    setGlobalFilter(previous => {
      const next = functionalUpdate(updater, previous);

      return typeof next === "string" ? next : "";
    });
  }, [setGlobalFilter]);

  /* ---- editing controller (docs/editing.md) ---- */
  const activeEditorRef = useRef<ActiveCellEditor | null>(null);
  const editingCellRef = useRef(editingCell);
  const editingRequestRef = useRef(0);
  editingCellRef.current = editingCell;

  const stopEditing = useEventCallback((stopOptions?: { commit?: boolean }) => {
    editingRequestRef.current += 1;
    const editor = activeEditorRef.current;

    if (!editor) {
      setEditingCell(null);
      return;
    }

    if (stopOptions?.commit ?? true) {
      void Promise.resolve(editor.commit()).catch(() => false);
    } else {
      editor.cancel();
    }
  });

  const startEditing = useEventCallback((cell: DataTableEditingCell) => {
    const request = ++editingRequestRef.current;
    const { current } = editingCellRef;

    if (!current || (current.rowId === cell.rowId && current.columnId === cell.columnId)) {
      setEditingCell(cell);
      return;
    }

    const editor = activeEditorRef.current;

    if (!editor) {
      setEditingCell(cell);
      return;
    }

    // Only the latest navigation request may win after an async commit settles.
    const committed = editor.commit();

    if (typeof committed !== "boolean") {
      void Promise.resolve(committed).then(
        success => {
          if (success && editingRequestRef.current === request) {
            setEditingCell(cell);
          }
        },
        // Custom editors may still reject despite the boolean-result contract; stay put.
        () => false
      );
    } else if (committed && editingRequestRef.current === request) {
      setEditingCell(cell);
    }
  });

  const clearEditing = useEventCallback(() => setEditingCell(null));

  const registerEditor = useCallback((editor: ActiveCellEditor | null) => {
    activeEditorRef.current = editor;
  }, []);

  const selectionAnchor = useRef<string | null>(null);

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

  const ledger: LedgerMeta<TData> = useMemo(
    () => {
      return {
        editing: {
          cell: editingCell,
          start: startEditing,
          stop: stopEditing,
          clear: clearEditing,
          registerEditor
        },
        filtering: {
          subscribeColumnFilters,
          subscribeGlobalFilter
        },
        editTrigger,
        enableEditing,
        onEditCommit,
        renderDetailPanel,
        selectAllScope,
        selectionAnchor,
        totalRowCount: rowCount,
        enableColumnOrdering,
        enablePagination
      };
    },
    [
      editingCell,
      startEditing,
      stopEditing,
      clearEditing,
      registerEditor,
      subscribeColumnFilters,
      subscribeGlobalFilter,
      editTrigger,
      enableEditing,
      onEditCommit,
      renderDetailPanel,
      selectAllScope,
      rowCount,
      enableColumnOrdering,
      enablePagination
    ]
  );

  /* ---- columns: injected selection/expander + meta.filter variant wiring ---- */
  const withExpander = Boolean(renderDetailPanel || getSubRows);
  const processedColumns = useMemo(
    () => buildColumns({
      columns,
      withSelection: Boolean(enableRowSelection),
      withExpander
    }),
    [columns, enableRowSelection, withExpander]
  );

  /* Injected columns are always pinned left, invisibly merged over the consumer's slice. */
  const mergedColumnPinning = useMemo<ColumnPinningState>(() => {
    const internal: string[] = [];

    if (enableRowSelection) {
      internal.push(SELECTION_COLUMN_ID);
    }

    if (withExpander) {
      internal.push(EXPANDER_COLUMN_ID);
    }

    const left = (columnPinning.left ?? []).filter(id => !internal.includes(id));

    return { left: [...internal, ...left], right: columnPinning.right ?? [] };
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
  const manualPagination = paginationMode === "server";

  const pageCount
    = manualPagination && rowCount !== undefined
      ? Math.max(1, Math.ceil(rowCount / Math.max(1, pagination.pageSize)))
      : undefined;

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

    if (!manualPagination || !shouldAutoResetPageIndex || !inputsChanged) {
      return;
    }

    setPagination(previous => previous.pageIndex === 0 ? previous : { ...previous, pageIndex: 0 });
  }, [
    columnFilters,
    globalFilter,
    sorting,
    manualPagination,
    setPagination,
    shouldAutoResetPageIndex
  ]);

  // ---- reset targets ----
  // TanStack's slice reset APIs restore `table.initialState`. The live state remains fully
  // controlled; this object exists only to preserve ledger's `defaultX`/fallback contract.
  // Persisted values stay excluded so reset remains useful after hydration.
  const resetInitialState = {
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

  const mergedFilterFns = {
    ...tableOptions?.filterFns,
    ...ledgerFilterFns
  };

  /* ---- assemble: tableOptions is the base layer, ledger-managed keys override (docs/state.md) ---- */
  const managed = {
    data,
    columns: processedColumns,
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
    enableColumnResizing,
    enableColumnPinning,
    enableHiding,
    enableGrouping,
    enableRowPinning,
    enableExpanding: withExpander || enableGrouping,
    ...getSubRows && { getSubRows },
    ...renderDetailPanel && { getRowCanExpand: () => true },
    manualSorting,
    manualFiltering,
    manualPagination,
    ...(pageCount !== undefined) && { pageCount },
    ...manualPagination && {
      // `autoResetAll` outranks `autoResetPageIndex` inside TanStack. Consume it here so the
      // deterministic server reset remains authoritative, while preserving its only other
      // upstream effect through the feature-specific expansion option.
      autoResetAll: undefined,
      autoResetExpanded: tableOptions?.autoResetAll ?? tableOptions?.autoResetExpanded,
      autoResetPageIndex: false
    },
    filterFns: mergedFilterFns,
    getCoreRowModel: getCoreRowModel(),
    ...!manualSorting && { getSortedRowModel: getSortedRowModel() },
    ...!manualFiltering && {
      getFilteredRowModel: getFilteredRowModel(),
      getFacetedRowModel: getFacetedRowModel(),
      getFacetedUniqueValues: getFacetedUniqueValues(),
      getFacetedMinMaxValues: getFacetedMinMaxValues()
    },
    ...enablePagination && !manualPagination && { getPaginationRowModel: getPaginationRowModel() },
    ...(withExpander || enableGrouping) && { getExpandedRowModel: getExpandedRowModel() },
    ...enableGrouping && { getGroupedRowModel: getGroupedRowModel() },
    meta: { ...tableOptions?.meta, ledger }
  } satisfies Partial<TableOptions<TData>>;

  if (isDev && tableOptions) {
    for (const key of Object.keys(tableOptions)) {
      const isConsumedPaginationPolicy = manualPagination
        && (key === "autoResetAll" || key === "autoResetExpanded" || key === "autoResetPageIndex");

      if (key !== "meta" && key !== "filterFns" && !isConsumedPaginationPolicy && Object.hasOwn(managed, key)) {
        warnOnce(
          `tableOptions.${key}`,
          `tableOptions.${key} is managed by ledger and has been overridden — use the first-class option instead.`
        );
      }
    }

    if (tableOptions.filterFns) {
      for (const filterFnId of Object.keys(ledgerFilterFns)) {
        if (Object.hasOwn(tableOptions.filterFns, filterFnId)) {
          warnOnce(
            `tableOptions.filterFns.${filterFnId}`,
            `tableOptions.filterFns.${filterFnId} is reserved by ledger and has been overridden.`
          );
        }
      }
    }
  }

  const table = useReactTable<TData>({ ...tableOptions, ...managed } as TableOptions<TData>);

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
