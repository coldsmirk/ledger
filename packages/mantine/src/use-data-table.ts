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
import { useCallback, useEffect, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { buildColumns, EXPANDER_COLUMN_ID, SELECTION_COLUMN_ID } from "./build-columns";
import { canEditCell, editErrorMessage, normalizeEdit } from "./edit-meta";
import { isDev, warnOnce } from "./env";
import { ledgerFilterFns } from "./filter-fns";
import { buildLedgerFeatures } from "./ledger-features";
import { readPersistedState, usePersistWriter } from "./persist";
import { useCellEditing } from "./use-cell-editing";
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
  // Both sessions need the live instance; the hook's table is created further down.
  const tableRef = useRef<TableInstance<TData> | null>(null);

  // The cell session lives in its own module: everything an editor shows, and everything its
  // commit decides with, has to outlive an editor that a hidden column or a virtual scroll can
  // unmount at any moment (docs/architecture.md).
  const cellSession = useCellEditing<TData>({
    editingCell,
    enableEditing,
    onEditCommit,
    setEditingCell,
    tableRef
  });

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
    /**
     * Eligibility was lost during this session. It latches: a gate that reopens before an
     * in-flight write settles is the *next* session's eligibility, not a reprieve for this one.
     */
    gateLost: boolean;
  }>({
    rowId: null,
    values: new Map(),
    baseline: new Map(),
    committed: new Map(),
    gateLost: false
  });
  const rowEditors = useRef(new Map<string, LedgerRowEditor>());
  /**
   * Bumped whenever a row session starts or ends without the slice moving — a gate shutting under
   * a controlled application that declines to close it, or an explicit start on the row already
   * named. Whether an editor may be on screen is part of the render output, so a change in it has
   * to be a change in state; a ref would leave the last render standing.
   */
  const [rowSessionEpoch, setRowSessionEpoch] = useState(0);
  /**
   * What the row's editors show that is not a value: a write still out, and the reason the last
   * one failed. Session state, not editor state — an editor is unmounted by a hidden column or a
   * virtual scroll at any moment, and one that came back knowing neither would take input during
   * a write and let the user send a second one, while a rejection arriving with no editor mounted
   * would have had nowhere to go at all.
   */
  const rowPresentation = useRef<{
    pending: boolean;
    /**
     * `columnId: null` is the row's own failure — a rejected commit belongs to no cell, and which
     * column shows it is decided when an editor renders (`rowErrorColumnId`).
     */
    error: { columnId: string | null; message: string } | null;
  }>({
    error: null,
    pending: false
  });
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
      committed: new Map(),
      gateLost: false
    };
    rowPresentation.current = { error: null, pending: false };
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
   * the data moves, it wins: it may be our write applied, normalised, or somebody else's.
   */
  const previousRowValue = (columnId: string, source: unknown): unknown => {
    const written = rowDrafts.current.committed.get(columnId);

    return written && Object.is(written.source, source) ? written.value : source;
  };

  /**
   * Takes back the pending values a write actually carried, leaving anything typed since. What it
   * carried is recorded as committed instead; a draft left standing over it would go on beating
   * the data the application feeds back — including a value it normalized on the way in.
   */
  const consumeCommittedRowDrafts = (rowId: string, sent: Record<string, unknown>) => {
    if (rowDrafts.current.rowId !== rowId) {
      return;
    }

    for (const [columnId, value] of rowDrafts.current.values) {
      if (Object.hasOwn(sent, columnId) && Object.is(value, sent[columnId])) {
        rowDrafts.current.values.delete(columnId);
      }
    }
  };

  /**
   * Records a write that went through, so the next commit departs from it rather than from data
   * that has not caught up. The entry is retired by `reconcileRowEligibility` the moment the data
   * moves — see `previousRowValue`.
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
   * Whether the row holds a value the write that just settled never carried. A custom editor is
   * not disabled while a request is out, so the user can type straight past it; leaving on that
   * write's word would drop what they typed.
   */
  const hasUncommittedRowEdits = (rowId: string, sent: Record<string, unknown>): boolean => {
    if (rowDrafts.current.rowId !== rowId) {
      return false;
    }

    for (const [columnId, value] of rowDrafts.current.values) {
      if (!Object.hasOwn(sent, columnId) || !Object.is(value, sent[columnId])) {
        return true;
      }
    }

    return false;
  };

  /**
   * Throws the whole pending edit away — what cancelling means. The mounted editors are put back
   * alongside the store because the row can stay on screen: a controlled application may decline
   * to close it, and an editor still showing a value the store no longer holds is one nothing
   * would commit. What they show once the store is empty is the store's answer again — the value
   * the session has written, or the data — so they are only asked to draw themselves anew.
   */
  const discardRowEdits = (rowId: string | null) => {
    if (rowId === null || rowDrafts.current.rowId !== rowId) {
      return;
    }

    rowDrafts.current.values.clear();
    rowPresentation.current.error = null;

    for (const editor of rowEditors.current.values()) {
      editor.redraw();
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
   * Reconciles the row being edited with the table it lives in. Three things can move under an
   * open row, and only one of them ends it:
   *
   * - the data moves past a value this session wrote — the overlay entry retires for good, so
   * data that later returns to what the write departed from cannot bring our value back with
   * it (`previousRowValue` tests the same thing, for the reads that happen before this runs);
   * - a column's gate shuts (`meta.edit` removed, `edit.enabled(row)` turning false) — its
   * pending value goes now rather than at commit time, so a gate that reopens cannot bring back
   * a draft nothing was showing;
   * - a column simply leaves the definitions, a responsive breakpoint crossing — nothing shut,
   * the layout changed, and its draft still commits against the baseline (docs/editing.md).
   *
   * So the row ends when the table switch is off, or when the gate shut on a column this session
   * was editing and none is left editable. A row the table does not hold yet has not arrived,
   * which is not the same as a row that may not be edited.
   *
   */
  const markRowGateLost = () => {
    if (rowDrafts.current.gateLost) {
      return;
    }

    rowDrafts.current.gateLost = true;
    setRowSessionEpoch(epoch => epoch + 1);
  };

  /**
   * Ends a session whose eligibility is gone, once nothing is still out on its behalf. Returns
   * whether it ended the row: a session that stops because the gate shut was cancelled, not
   * finished, so nothing waiting on a commit may move on the strength of it.
   */
  const endLostRowSession = (rowId: string): boolean => {
    if (!rowDrafts.current.gateLost) {
      return false;
    }

    // The write already out passed the gate before it shut; its settlement calls this again and
    // completes the cancel. The loss is recorded either way, so a gate reopening cannot undo it.
    if (rowPendingCommit.current) {
      return false;
    }

    discardRowEdits(rowId);
    finishRowEditing();

    return true;
  };

  const reconcileRowEligibility = useEventCallback((): boolean => {
    const rowId = editingRowRef.current;

    if (rowId === null) {
      return false;
    }

    // The table switch is answered before the row is even looked for. A session opened on a row
    // whose data has not arrived would otherwise survive the switch closing, and a switch that
    // reopened before the data landed would find the old session waiting.
    if (!enableEditing) {
      markRowGateLost();
    }

    const tableInstance = tableRef.current;
    let row: Row<TData> | undefined;

    try {
      row = tableInstance?.getRow(rowId, true);
    } catch {
      row = undefined;
    }

    if (!row) {
      // Not in the table: a row that has not arrived, or one the data no longer holds. Neither is
      // a gate closing, so the session stands — but a switch that shut above still ends it.
      return endLostRowSession(rowId);
    }

    const erasedRow = row as Row<any>;
    const { baseline } = rowDrafts.current;
    let editable = false;
    let gateShut = false;

    for (const cell of erasedRow.getAllCells()) {
      const columnId = cell.column.id;
      const written = rowDrafts.current.committed.get(columnId);

      if (written && !Object.is(written.source, cell.getValue())) {
        rowDrafts.current.committed.delete(columnId);
      }

      if (canEditCell(cell, erasedRow)) {
        editable = true;

        // The last effective previous this session saw for the column, refreshed while it is
        // here to be seen: `previousValues` means what the application last knew, and a column
        // whose definition later disappears has nothing else left to answer with. Recording it
        // on every sighting also gives the session its membership — which is how a gate shutting
        // on a column it was editing is told apart from a breakpoint taking one away.
        baseline?.set(columnId, previousRowValue(columnId, cell.getValue()));
      } else {
        gateShut ||= baseline?.has(columnId) ?? false;
        rowDrafts.current.values.delete(columnId);
      }
    }

    // What keeps a row editing: a cell it can edit now, or values it still owes a commit for a
    // column whose *definition* left — a breakpoint crossing, which shut no gate. A gate really
    // shutting on a column this session was editing ends it, and so does a session that never had
    // anything to edit at all (no `meta.edit`, or no handler for the mode).
    if (!(editable || (!gateShut && (baseline?.size ?? 0) > 0))) {
      markRowGateLost();
    }

    return endLostRowSession(rowId);
  });

  /**
   * Passive, not layout: nothing has to be keyed before the user can type, and this must not race
   * the session boundary above. No dependency array, because what it watches is `enableEditing`,
   * the column definitions and the row's own data at once — nothing a list describes.
   */
  useEffect(() => {
    reconcileRowEligibility();
  });

  /**
   * Whether the request issued under `session` still speaks for `rowId`. Sessions end the moment
   * the rendered row changes, so the two tests agree by construction; the row id is spelled out
   * because acting on another row's editors is precisely what a stale settlement must not do.
   */
  const isCurrentRowSession = (session: number, rowId: string) => rowSessionRef.current === session && editingRowRef.current === rowId;

  /**
   * The column currently showing the row's failure: the one it names, or for a row-level failure
   * the first editable column with an editor on screen, in the row's own cell order. Resolved on
   * every read rather than fixed when the failure is reported, so a message follows the screen
   * when the column under it is hidden or scrolls away.
   */
  const rowErrorColumnId = (rowId: string): string | null => {
    const { error } = rowPresentation.current;
    const tableInstance = tableRef.current;

    if (!error || !tableInstance) {
      return null;
    }

    if (error.columnId !== null) {
      return error.columnId;
    }

    try {
      const erasedRow = tableInstance.getRow(rowId, true) as Row<any>;

      return erasedRow
        .getAllCells()
        .find(cell => canEditCell(cell, erasedRow) && rowEditors.current.has(cell.column.id))
        ?.column
        .id ?? null;
    } catch {
      return null;
    }
  };

  // Stable, and reads nothing but refs — so `registerRowEditor` can close over it directly rather
  // than through a mirror written during render, which is the very thing this round forbade.
  const redrawRowEditors = useCallback(() => {
    for (const editor of rowEditors.current.values()) {
      editor.redraw();
    }
  }, []);

  /**
   * Only a row-level failure is projected onto whoever is on screen, so only that has to be
   * redrawn when the registry changes; everything else an editor shows it already reads for
   * itself as it renders.
   */
  const redrawRowLevelError = useCallback(() => {
    if (rowPresentation.current.error?.columnId === null) {
      redrawRowEditors();
    }
  }, [redrawRowEditors]);

  const setRowPending = (pending: boolean) => {
    rowPresentation.current.pending = pending;
    redrawRowEditors();
  };

  /**
   * Records a failure on the session, so it outlives the editors: one that is unmounted when the
   * message arrives shows it when it comes back. `columnId: null` is the row's own — a rejected
   * commit belongs to no cell.
   */
  const reportRowError = (rowId: string, columnId: string | null, message: string) => {
    rowPresentation.current.error = { columnId, message };
    redrawRowEditors();

    const shown = rowErrorColumnId(rowId);

    if (shown !== null) {
      rowEditors.current.get(shown)?.focus();
    }
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

    rowPresentation.current.error = null;
    redrawRowEditors();

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
        reportRowError(rowId, columnId, message);

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
      reportRowError(rowId, null, editErrorMessage(error));
      return false;
    }

    if (result && typeof result.then === "function") {
      const session = rowSessionRef.current;
      setRowPending(true);

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
          consumeCommittedRowDrafts(rowId, values);
          setRowPending(false);

          // The gate may have shut while this write was out; the test was held off until the
          // write it let through had landed. If it did shut, the row has just been cancelled —
          // it did not finish here, and a switch waiting on this commit must not open a row
          // nobody may edit.
          if (reconcileRowEligibility()) {
            return false;
          }

          if (hasUncommittedRowEdits(rowId, values)) {
            // Typed straight past the request while it was out. The write did go through, but
            // this row is not finished — and whoever was waiting to leave it must not.
            return false;
          }

          finishRowEditing();

          return true;
        },
        (error: unknown) => {
          if (!isCurrentRowSession(session, rowId)) {
            return false;
          }

          rowPendingCommit.current = null;
          setRowPending(false);
          reportRowError(rowId, null, editErrorMessage(error));
          reconcileRowEligibility();

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
    consumeCommittedRowDrafts(rowId, values);
    finishRowEditing();
    return true;
  });

  /**
   * Focuses a mounted editor of the row being edited. A column not yet on screen — hidden, or
   * scrolled out of the virtual window — is left to `shouldFocus` when its editor mounts.
   */
  const focusRowColumn = (columnId: string | undefined) => {
    if (columnId !== undefined) {
      rowEditors.current.get(columnId)?.focus();
    }
  };

  /**
   * `commitRow` through the stable wrapper, whose type admits the undefined a missing handler
   * would give — there is no missing handler here.
   */
  const commitRowResult = useCallback((): boolean | Promise<boolean> => commitRow() ?? true, [commitRow]);

  const startRowEditing = useEventCallback((rowId: string, startOptions?: { focusColumnId?: string }) => {
    if (editingRowRef.current === rowId) {
      rowFocusColumn.current = startOptions?.focusColumnId ?? rowFocusColumn.current;

      if (rowDrafts.current.gateLost) {
        // The session on this row is over — its gate shut, and a controlled application declined
        // to close it. An explicit start is not that session coming back: it is the next one, so
        // it gets a new token and a fresh baseline, and nothing the old one held survives. The
        // slice already names this row, so no render would arrive to do it for us.
        endRowSession();
        openRowDrafts(rowId);
        setRowSessionEpoch(epoch => epoch + 1);
      }

      // A live session focuses the column asked for: the editors are already mounted, and the
      // slice is not moving, so nothing else would.
      redrawRowEditors();
      focusRowColumn(startOptions?.focusColumnId);

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

  /**
   * Whether this row has a live editing session. The slice naming a row is not enough: its gate
   * may have shut while a controlled application declined to close it, and a session whose
   * eligibility is gone must not put an interactive editor back on screen when the gate reopens.
   */
  const rowSessionActive = useCallback(
    // Asked during render, so it cannot consult the committed mirror — that still names the row
    // this one is replacing. A row the store has not been keyed to yet is a session about to
    // open, which is live by definition; only the one being tracked can have lost its gate.
    //
    // Keyed to the epoch: the answer lives in a ref, so this identity changing is what carries a
    // session starting or ending into the render layer's memo.
    (rowId: string) => rowDrafts.current.rowId === rowId ? !rowDrafts.current.gateLost : true,
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- the epoch is the point: see above
    [rowSessionEpoch]
  );

  const registerRowEditor = useCallback((columnId: string, editor: LedgerRowEditor) => {
    rowEditors.current.set(columnId, editor);
    redrawRowLevelError();

    return () => {
      if (rowEditors.current.get(columnId) !== editor) {
        return;
      }

      rowEditors.current.delete(columnId);
      redrawRowLevelError();
    };
  }, [redrawRowLevelError]);

  /**
   * The store is what a row editor shows, rather than a value it copies at mount: what the row
   * holds moves under it — the application feeds a write back, normalizes it, or another writer
   * changes it — and an editor with its own copy would go on showing a value the row left behind.
   * Editors name the row they belong to instead of reading it from a shared mutable ref, because
   * two rows' editors can be on screen at once while React reconciles a switch.
   */
  const rowDraftsApi = useRef({
    pending: (rowId: string) => rowDrafts.current.rowId === rowId && rowPresentation.current.pending,
    error: (rowId: string, columnId: string) => {
      if (rowDrafts.current.rowId !== rowId || rowErrorColumnId(rowId) !== columnId) {
        return null;
      }

      return rowPresentation.current.error?.message ?? null;
    },
    read: (rowId: string, columnId: string, source: unknown) => {
      if (rowDrafts.current.rowId !== rowId) {
        return source;
      }

      return rowDrafts.current.values.has(columnId)
        ? rowDrafts.current.values.get(columnId)
        : previousRowValue(columnId, source);
    },
    write: (rowId: string, columnId: string, value: unknown) => {
      if (rowDrafts.current.rowId !== rowId) {
        return;
      }

      rowDrafts.current.values.set(columnId, value);

      // Typing answers the complaint the field is showing, and only that one: another column's
      // message is still true, and its editor is not the one being redrawn.
      if (rowErrorColumnId(rowId) === columnId) {
        rowPresentation.current.error = null;
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
          active: cellSession.active,
          start: cellSession.start,
          stop: cellSession.stop,
          clear: cellSession.clear,
          commit: cellSession.commit,
          cancel: cellSession.cancel,
          drafts: {
            error: cellSession.error,
            pending: cellSession.pending,
            read: cellSession.read,
            write: cellSession.write
          },
          register: cellSession.register,
          row: {
            id: editingRowId,
            active: rowSessionActive,
            start: startRowEditing,
            stop: stopRowEditing,
            commit: commitRowResult,
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
      cellSession,
      editMode,
      editingRowId,
      startRowEditing,
      stopRowEditing,
      commitRowResult,
      shouldFocusRowColumn,
      rowSessionActive,
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

  /**
   * The instance the editing paths reach for. v9's `useTable` returns a fresh wrapper whenever
   * options or state change — `useMemo(() => ({ ...table, options, state }))` — so this is not the
   * stable core instance, and a transition React renders and then throws away would otherwise
   * leave it holding options nothing on screen is using: a commit would then be gated by an
   * `enableEditing` the user never saw. Insertion phase, so it is in place before the layout
   * effects above read it — declaration order puts them first, and the phases do not.
   */
  useInsertionEffect(() => {
    tableRef.current = table;
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
