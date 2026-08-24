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

import type { LedgerFeatures } from "./ledger-features";
import type {
  ActiveCellEditor,
  DataTableEditingCell,
  LedgerMeta,
  LedgerRowEditor,
  Row,
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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { buildColumns, EXPANDER_COLUMN_ID, SELECTION_COLUMN_ID } from "./build-columns";
import { canEditCell, editErrorMessage, normalizeEdit } from "./cell-editor";
import { isDev, warnOnce } from "./env";
import { ledgerFilterFns } from "./filter-fns";
import { buildLedgerFeatures } from "./ledger-features";
import { readPersistedState, usePersistWriter } from "./persist";
import { useResponsiveColumns } from "./use-responsive-columns";
import { useSlice } from "./use-slice";
import { useEventCallback } from "./utils";

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

  /* ---- row editing controller (editMode: "row", docs/editing.md#row-mode) ---- */
  // Drafts live here, not in editors: a virtualized editing row that scrolls out unmounts its
  // editors, and the pending values must survive until the atomic commit.
  const rowDrafts = useRef<{
    rowId: string | null;
    values: Map<string, unknown>;
    /**
     * Every editable column's value as the row's edit began, or null while the row itself is
     * not in the table yet — see `openRowDrafts`.
     */
    baseline: Map<string, unknown> | null;
    /**
     * What this session has already written, per column, against the value the data held when
     * it went out — see `previousRowValue`.
     */
    committed: Map<string, { value: unknown; source: unknown }>;
  }>({
    rowId: null,
    values: new Map(),
    baseline: new Map(),
    committed: new Map()
  });
  const rowEditors = useRef(new Map<string, LedgerRowEditor>());
  const rowFocusColumn = useRef<string | null>(null);
  const editingRowRef = useRef(editingRowId);
  /**
   * One editing session, one token. An async commit captures it and may only act on what it
   * finds afterwards if the token still matches: cancelling the row, finishing it, or opening
   * another one all end the session, and a settled request from the previous one must not close
   * the editor that replaced it (nor report its error onto that editor's first field).
   */
  const rowSessionRef = useRef(0);
  /**
   * The in-flight row commit, so repeated `stopEditing({ commit: true })` calls wait on one
   * result instead of firing `onRowEditCommit` again — the single-flight guarantee cell mode
   * already makes (docs/editing.md). It carries its owner: a request belonging to a session
   * that has ended is not a request the next row may join, or its own write would never be sent.
   */
  const rowPendingCommit = useRef<{ session: number; rowId: string; promise: Promise<boolean> } | null>(null);
  const rowStartRequestRef = useRef(0);
  // The row commit needs the live instance; the hook's table is created further down.
  const tableRef = useRef<TableInstance<TData> | null>(null);

  /**
   * Ends the session: whatever is in flight stops owning the row, and stops speaking for it.
   */
  const endRowSession = () => {
    rowSessionRef.current += 1;
    rowPendingCommit.current = null;
  };

  /**
   * Every editable value of `rowId` as it stands now, or null while that row is not in the
   * table: an application can name the row it wants edited before the fetch carrying it lands,
   * and "this row has no previous values" is a different answer from "there is no row to ask".
   */
  const snapshotEditableValues = (rowId: string): Map<string, unknown> | null => {
    const tableInstance = tableRef.current;

    if (!tableInstance) {
      return null;
    }

    let row: Row<TData> | undefined;

    try {
      row = tableInstance.getRow(rowId, true);
    } catch {
      return null;
    }

    const baseline = new Map<string, unknown>();
    const erasedRow = row as Row<any>;

    for (const cell of erasedRow.getAllCells()) {
      if (canEditCell(cell, erasedRow)) {
        baseline.set(cell.column.id, cell.getValue());
      }
    }

    return baseline;
  };

  /**
   * Opens the draft store on a row. The baseline is snapshotted now, while every editable
   * column still exists: a responsive breakpoint removes a column from the definitions before
   * TanStack ever sees it, so by commit time its cell is gone and there is nothing left to read
   * a previous value from. A row the table does not hold yet leaves the baseline unrecorded for
   * the effect below to take once it arrives.
   */
  const openRowDrafts = (rowId: string | null) => {
    rowDrafts.current = {
      rowId,
      values: new Map(),
      baseline: rowId === null ? new Map() : snapshotEditableValues(rowId),
      committed: new Map()
    };
  };

  /**
   * The drafts held for `rowId`. A read, never a write: editors read their draft while
   * rendering, and a render can be thrown away (a transition that suspends), so re-keying the
   * store from here would let an abandoned render erase the values on screen. The effect below
   * is the store's only keyer. A caller asking about another row gets nothing, which is the
   * truth.
   */
  const draftsFor = (rowId: string | null): Map<string, unknown> => rowDrafts.current.rowId === rowId ? rowDrafts.current.values : new Map();

  /**
   * What the application last knew this column to hold — the value the row is editing away from.
   * A session can outlive its own writes: a controlled application may decline to close the row,
   * and the data it feeds back arrives whenever it arrives. Until then `source` — what the cell
   * read when the write went out — still matches, and the value written is the newer truth. Once
   * the data moves, it wins: it may be our write applied, normalized, or somebody else's.
   */
  const previousRowValue = (columnId: string, source: unknown): unknown => {
    const written = rowDrafts.current.committed.get(columnId);

    return written && Object.is(written.source, source) ? written.value : source;
  };

  /**
   * Records a write that went through, so the values it carried stop reading as pending edits
   * and the next commit departs from them rather than from data that has not caught up.
   */
  const recordRowCommit = (rowId: string, values: Record<string, unknown>, sources: Map<string, unknown>) => {
    if (rowDrafts.current.rowId !== rowId) {
      return;
    }

    for (const [columnId, value] of Object.entries(values)) {
      rowDrafts.current.committed.set(columnId, { value, source: sources.get(columnId) });
    }
  };

  /**
   * Throws the whole pending edit away — what cancelling means. The mounted editors are put back
   * alongside the store because the row can stay on screen: a controlled application may decline
   * to close it, and an editor still showing a value the store no longer holds is one nothing
   * would commit. They are put back to what the session has written, not to the data, for the
   * same reason `previousRowValue` exists.
   */
  const discardRowEdits = (rowId: string | null) => {
    if (rowId === null || rowDrafts.current.rowId !== rowId) {
      return;
    }

    rowDrafts.current.values.clear();

    const source = snapshotEditableValues(rowId) ?? rowDrafts.current.baseline ?? new Map();

    for (const [columnId, editor] of rowEditors.current) {
      editor.reset(previousRowValue(columnId, source.get(columnId)));
    }
  };

  /**
   * Asks for the row edit to end. A request, not the ending itself: `editingRowId` is a
   * controlled slice, and an application may answer `onEditingRowIdChange` by leaving the prop
   * exactly where it was. The row then stays on screen, and a row on screen is one the user can
   * still type into — so the session, its ownership of an in-flight commit, and the draft store
   * all stay with it until a render says otherwise.
   */
  const finishRowEditing = useEventCallback(() => {
    rowFocusColumn.current = null;
    setEditingRowId(null);
  });

  /**
   * Reconciles the session with the row that actually reached the screen. Every change of
   * `editingRowId` lands here, ledger's own requests included, because it is a controlled
   * slice: `startRowEditing` and `finishRowEditing` can only ask, and an application may move
   * the edit itself, answer with a different row, or decline to move it at all. Committing the
   * boundary anywhere else would leave the session speaking for a row nobody is editing.
   *
   * It is a layout effect and not a render-phase check because ending a session is a real side
   * effect — it invalidates an in-flight commit's ownership — and React may render a tree it
   * never commits (a transition that suspends). Refs are shared between the current tree and
   * the work-in-progress one, so a render for a row the user never saw would otherwise strand
   * the row still on screen: its commit disowned, its editors pending forever. Layout, not
   * passive: the drafts store has to be keyed before anything can be typed into it.
   *
   * No dependency array on purpose. The comparison is against what was committed last time,
   * which no dependency list describes.
   */
  useLayoutEffect(() => {
    const moved = editingRowRef.current !== editingRowId;

    if (moved) {
      endRowSession();

      if (editingRowId !== null) {
        // A `startRowEditing` still waiting on a commit was going to open a row, and the edit
        // has landed on a different one — that request is overruled. Landing on *no* row is the
        // ordinary end of the very commit it is waiting for, and must not cancel it.
        rowStartRequestRef.current += 1;
      }

      editingRowRef.current = editingRowId;
    }

    if (moved || rowDrafts.current.rowId !== editingRowId) {
      // The second test also catches the first pass, where the ref already agrees with the prop
      // but the store has never been keyed: a controlled row open from the very first render
      // still needs its baseline, and the table instance only exists once the hook body has run.
      openRowDrafts(editingRowId);
    } else if (editingRowId !== null && rowDrafts.current.baseline === null) {
      // The row was not in the table when the edit opened. Data arriving later is the first
      // chance to record what the user is editing away from; anything typed meanwhile stays.
      rowDrafts.current.baseline = snapshotEditableValues(editingRowId);
    }
  });

  /**
   * Whether the request issued under `session` still speaks for `rowId`. Sessions end the moment
   * the rendered row changes, so the two tests agree by construction; the row id is spelled out
   * because acting on another row's editors is precisely what a stale settlement must not do.
   */
  const isCurrentRowSession = (session: number, rowId: string) => rowSessionRef.current === session && editingRowRef.current === rowId;

  const broadcastRowPending = (pending: boolean) => {
    for (const editor of rowEditors.current.values()) {
      editor.setPending(pending);
    }
  };

  const reportRowCommitError = (error: unknown) => {
    // A row-level rejection has no single owning cell; the first mounted editor carries it.
    const first = rowEditors.current.values().next().value;
    first?.setError(editErrorMessage(error));
    first?.focus();
  };

  const commitRow = useEventCallback((): boolean | Promise<boolean> => {
    const rowId = editingRowRef.current;
    const tableInstance = tableRef.current;

    if (rowId === null || !tableInstance) {
      return true;
    }

    // Idempotent while pending: a second Enter, a blur behind it, or the application calling
    // `stopEditing` again all join the request already in flight rather than issuing another
    // write. Only the owner may join — a request left over from a row the controller has moved
    // on from would otherwise stand in for this row's write, which would then never be sent.
    const inFlight = rowPendingCommit.current;

    if (inFlight && inFlight.session === rowSessionRef.current && inFlight.rowId === rowId) {
      return inFlight.promise;
    }

    // The table-level switch outranks every per-column case below, so it is tested once here
    // rather than per cell: with `enableEditing` off nothing in this row is editable, and a
    // draft for a column that also left the definitions has no cell left to be tested against
    // (the baseline path further down reconstructs it from the snapshot alone).
    if (tableInstance.options.meta?.ledger?.enableEditing !== true) {
      finishRowEditing();

      return true;
    }

    let row: Row<TData> | undefined;

    try {
      row = tableInstance.getRow(rowId, true);
    } catch {
      row = undefined;
    }

    if (!row) {
      // The row left the data set mid-edit — there is nothing to commit onto.
      finishRowEditing();
      return true;
    }

    for (const editor of rowEditors.current.values()) {
      editor.setError(null);
    }

    // v9's `in out` generics make Cell/Row invariant in TData; the editing helpers speak the
    // erased shape (the same single-erasure convention the render layer documents).
    const erasedRow = row as Row<any>;
    // Every editable cell, not just the visible ones (docs/api.md: "every editable column,
    // drafts merged in"). Hiding a column mid-edit — the columns panel, or a responsive
    // breakpoint crossing on a window resize — must not silently drop the value typed into it,
    // still less make `changed` false and discard the whole commit.
    const allCells = erasedRow.getAllCells();
    const editableCells = allCells.filter(cell => canEditCell(cell, erasedRow));
    const presentColumnIds = new Set(allCells.map(cell => cell.column.id));
    const drafts = draftsFor(rowId);
    const values: Record<string, unknown> = {};
    const previousValues: Record<string, unknown> = {};
    // What the data itself reads, so a write that goes through can later be told apart from the
    // data catching up with it.
    const sources = new Map<string, unknown>();
    let changed = false;

    for (const cell of editableCells) {
      const columnId = cell.column.id;
      const source = cell.getValue();
      const previous = previousRowValue(columnId, source);
      const value = drafts.has(columnId) ? drafts.get(columnId) : previous;
      sources.set(columnId, source);
      values[columnId] = value;
      previousValues[columnId] = previous;
      changed ||= !Object.is(value, previous);
    }

    // Drafts whose column produced no entry above fall into two very different cases.
    for (const [columnId, value] of drafts) {
      if (Object.hasOwn(values, columnId)) {
        continue;
      }

      if (presentColumnIds.has(columnId)) {
        // The column is still here, it simply stopped being editable mid-edit — `meta.edit`
        // removed, or `edit.enabled(row)` now false for this row. (`enableEditing` cannot reach
        // this loop: the table-level switch is answered at the entry to `commitRow`.)
        // Committing that draft would push a value through a gate the application just closed,
        // and unvalidated besides (the validation pass below only walks editable cells). The
        // pending value is dropped, not promoted.
        drafts.delete(columnId);

        continue;
      }

      // The other case: the column left the definitions entirely — a responsive breakpoint
      // crossing removes it before TanStack ever sees it, so there is no cell to read. The value
      // the user typed is still theirs and commits against the baseline captured at edit start.
      // Its `validate` cannot run, because the definition that carried it is gone.
      const source = rowDrafts.current.baseline?.get(columnId);
      const previous = previousRowValue(columnId, source);
      sources.set(columnId, source);
      values[columnId] = value;
      previousValues[columnId] = previous;
      changed ||= !Object.is(value, previous);
    }

    // First validation failure focuses its editor and blocks the whole row.
    for (const cell of editableCells) {
      const columnId = cell.column.id;
      const normalized = normalizeEdit(cell.column.columnDef.meta?.edit);

      if (normalized?.kind !== "variant" || !normalized.config.validate) {
        continue;
      }

      let message: string | null;

      try {
        message = normalized.config.validate(values[columnId], erasedRow);
      } catch (error) {
        message = editErrorMessage(error);
      }

      if (message !== null) {
        const editor = rowEditors.current.get(columnId);
        editor?.setError(message);
        editor?.focus();
        return false;
      }
    }

    if (!changed) {
      finishRowEditing();
      return true;
    }

    let result: void | Promise<void>;

    try {
      result = onRowEditCommit?.({
        row,
        values,
        previousValues
      });
    } catch (error) {
      reportRowCommitError(error);
      return false;
    }

    if (result && typeof result.then === "function") {
      const session = rowSessionRef.current;
      broadcastRowPending(true);

      const pending = Promise.resolve(result).then(
        () => {
          // Everything below touches the editors on screen, so a request whose session has
          // ended stops here: its row was cancelled or replaced, and the editors it would
          // close or un-pend belong to whoever came next. It reports failure, because the
          // caller waiting on it wanted to leave *that* row and that row is already gone —
          // navigating on its word would move an edit the controller has since redirected.
          if (!isCurrentRowSession(session, rowId)) {
            return false;
          }

          rowPendingCommit.current = null;
          recordRowCommit(rowId, values, sources);
          broadcastRowPending(false);
          finishRowEditing();

          return true;
        },
        (error: unknown) => {
          if (!isCurrentRowSession(session, rowId)) {
            return false;
          }

          rowPendingCommit.current = null;
          broadcastRowPending(false);
          reportRowCommitError(error);

          return false;
        }
      );

      rowPendingCommit.current = {
        session,
        rowId,
        promise: pending
      };

      return pending;
    }

    recordRowCommit(rowId, values, sources);
    finishRowEditing();
    return true;
  });

  const startRowEditing = useEventCallback((rowId: string, startOptions?: { focusColumnId?: string }) => {
    if (editingRowRef.current === rowId) {
      rowFocusColumn.current = startOptions?.focusColumnId ?? rowFocusColumn.current;
      return;
    }

    // Like `finishRowEditing`, a request: the session boundary is taken by the effect above,
    // once a render has actually put this row on screen.
    const begin = () => {
      rowFocusColumn.current = startOptions?.focusColumnId ?? null;
      setEditingRowId(rowId);
    };

    if (editingRowRef.current === null) {
      begin();
      return;
    }

    // Another row is mid-edit: commit it first (commit, never discard); only success moves on,
    // and only the latest start request may win after an async commit settles.
    const request = ++rowStartRequestRef.current;
    // The stable wrapper's type admits undefined for a missing handler; commitRow always exists.
    const committed = commitRow() ?? true;

    if (typeof committed === "boolean") {
      if (committed) {
        begin();
      }

      return;
    }

    void committed.then(success => {
      if (success && rowStartRequestRef.current === request) {
        begin();
      }
    });
  });

  const stopRowEditing = useEventCallback((stopOptions?: { commit?: boolean }) => {
    if (stopOptions?.commit ?? true) {
      void commitRow();
    } else {
      discardRowEdits(editingRowRef.current);
      finishRowEditing();
    }
  });

  const shouldFocusRowColumn = useCallback((columnId: string) => rowFocusColumn.current === columnId, []);

  const registerRowEditor = useCallback((columnId: string, editor: LedgerRowEditor) => {
    rowEditors.current.set(columnId, editor);

    return () => {
      if (rowEditors.current.get(columnId) === editor) {
        rowEditors.current.delete(columnId);
      }
    };
  }, []);

  /**
   * Editors name the row they belong to rather than reading it from a shared mutable ref: two
   * rows' editors can be on screen at once while React reconciles a switch, and each must see
   * its own drafts or none.
   */
  const rowDraftsApi = useRef({
    has: (rowId: string, columnId: string) => rowDrafts.current.rowId === rowId && rowDrafts.current.values.has(columnId),
    get: (rowId: string, columnId: string) => rowDrafts.current.rowId === rowId ? rowDrafts.current.values.get(columnId) : undefined,
    set: (rowId: string, columnId: string, value: unknown) => {
      if (rowDrafts.current.rowId === rowId) {
        rowDrafts.current.values.set(columnId, value);
      }
    }
  }).current;

  if (isDev && editMode === "row") {
    if (options.editingCell !== undefined || options.onEditingCellChange) {
      warnOnce("row-mode-editing-cell", "editingCell is a cell-mode slice — editMode: \"row\" tracks editingRowId instead.");
    }

    if (onEditCommit) {
      warnOnce("row-mode-on-edit-commit", "onEditCommit never fires under editMode: \"row\" — use onRowEditCommit.");
    }
  }

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

  /* ---- columns: breakpoint filter + injected selection/expander + meta.filter wiring ---- */
  const responsiveColumns = useResponsiveColumns(columns);
  const withExpander = Boolean(renderDetailPanel || getSubRows);
  const processedColumns = useMemo(
    () => buildColumns({
      columns: responsiveColumns,
      withSelection: Boolean(enableRowSelection),
      withExpander,
      selectionColumn,
      expanderColumn
    }),
    [responsiveColumns, enableRowSelection, withExpander, selectionColumn, expanderColumn]
  );

  const ledger: LedgerMeta<TData> = useMemo(
    () => {
      return {
        columns: processedColumns,
        editing: {
          mode: editMode,
          cell: editingCell,
          start: startEditing,
          stop: stopEditing,
          clear: clearEditing,
          registerEditor,
          row: {
            id: editingRowId,
            start: startRowEditing,
            stop: stopRowEditing,
            shouldFocus: shouldFocusRowColumn,
            drafts: rowDraftsApi,
            register: registerRowEditor
          }
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
        enablePagination
      };
    },
    [
      processedColumns,
      editingCell,
      startEditing,
      stopEditing,
      clearEditing,
      registerEditor,
      editMode,
      editingRowId,
      startRowEditing,
      stopRowEditing,
      shouldFocusRowColumn,
      rowDraftsApi,
      registerRowEditor,
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
      enablePagination
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
  tableRef.current = table;

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
