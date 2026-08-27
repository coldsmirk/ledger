/**
 * Every user-visible string in the library flows through this object — components never hardcode
 * a locale. App-wide configuration is the Mantine-native mechanism (theme defaultProps, see
 * docs/i18n.md); a complete zh-CN preset ships from "./locales".
 */
export interface DataTableLabels {
  /* Pagination */
  paginationSummary: (from: number, to: number, total: number) => string;
  rowsPerPage: string;

  /* Selection */
  selectAllRows: string;
  selectRow: string;
  selectedCount: (count: number) => string;
  clearSelection: string;

  /* Expansion */
  expandRow: string;
  collapseRow: string;
  expandAll: string;
  collapseAll: string;

  /* Active row (enableActiveRow) */
  /**
   * Describes the body viewport — the keyboard focus stop — while `enableActiveRow` is on. It
   * is the only place the arrow-key row model is announced, so say what the keys do. A
   * description, never a name: that div is roleless, and `generic` prohibits a name.
   */
  rowNavigation: string;
  /**
   * Announced politely whenever the current row changes: focus stays on the viewport, so without
   * this the move is visual only.
   */
  currentRow: (row: string, index: number, count: number) => string;

  /* Columns panel */
  columnsPanel: string;
  resetColumns: string;
  /**
   * Logical positions (TanStack v9 vocabulary): start/end map to left/right in LTR layouts and
   * mirror under RTL.
   */
  pinStart: string;
  pinEnd: string;
  unpin: string;
  /**
   * Zone captions the columns panel shows above its pinned columns; nouns for the state, where
   * `pinStart` / `pinEnd` name the action.
   */
  pinnedStart: string;
  pinnedEnd: string;
  groupByColumn: string;
  ungroupColumn: string;
  columnWidth: string;
  /**
   * Width placeholder for a column whose definition declares no `size` — it grows to share the
   * leftover viewport. A column that declares one shows that number instead.
   */
  columnWidthAuto: string;

  /* Column interactions */
  resizeColumn: string;
  reorderColumn: string;

  /* Filters */
  /**
   * Names the funnel trigger and the control inside it — an unnamed control in a table of them
   * is unusable, so the column title is interpolated rather than left generic.
   */
  filterColumn: (column: string) => string;
  clearFilter: string;
  filterPlaceholder: string;
  filterRangeMin: string;
  filterRangeMax: string;

  /* Global search */
  searchPlaceholder: string;

  /* States */
  loading: string;
  empty: string;
  /**
   * Zero rows while a column filter or the global search is active — a different situation
   * than an empty data set, so it gets its own message.
   */
  noResults: string;
  loadingMore: string;
  error: string;
  retry: string;
  loadMoreError: string;

  /* Editing */
  /**
   * Names an inline editor by the column it edits.
   */
  editColumn: (column: string) => string;
  editPending: string;

  /* Row ordering (enableRowOrdering) */
  /**
   * Names every drag handle; the row a handle belongs to is evident from its position, so the
   * label states the action, matching `selectRow` / `expandRow`.
   */
  reorderRow: string;
  /**
   * Why the handles are disabled — shown as their tooltip while sorting, a filter, a search or
   * grouping controls the visible order.
   */
  rowOrderingUnavailable: string;
  /**
   * Announced when a drag lifts a row. The one place the keyboard drag model is spoken, so say
   * what the keys do.
   */
  rowReorderLifted: (row: string) => string;
  /**
   * Announced as the drop target changes; `row` names the target the same way `currentRow`
   * names rows (leading visible cell).
   */
  rowReorderTarget: (row: string, side: "before" | "after") => string;
  rowReorderDropped: (row: string) => string;
  rowReorderCanceled: string;
}

export const defaultLabels: DataTableLabels = {
  paginationSummary: (from, to, total) => `${from}–${to} of ${total}`,
  rowsPerPage: "Rows per page",

  selectAllRows: "Select all rows",
  selectRow: "Select row",
  selectedCount: count => `${count} selected`,
  clearSelection: "Clear selection",

  rowNavigation: "Table rows — use the arrow keys to move between rows",
  currentRow: (row, index, count) => `${row}, row ${index} of ${count}`,

  expandRow: "Expand row",
  collapseRow: "Collapse row",
  expandAll: "Expand all rows",
  collapseAll: "Collapse all rows",

  columnsPanel: "Columns",
  resetColumns: "Reset",
  pinStart: "Pin to start",
  pinEnd: "Pin to end",
  unpin: "Unpin",
  pinnedStart: "Pinned start",
  pinnedEnd: "Pinned end",
  groupByColumn: "Group by this column",
  ungroupColumn: "Ungroup",
  columnWidth: "Width",
  columnWidthAuto: "Auto",

  resizeColumn: "Drag to resize; double-click to fit content",
  reorderColumn: "Drag to reorder column",

  filterColumn: column => `Filter ${column}`,
  clearFilter: "Clear filter",
  filterPlaceholder: "Filter…",
  filterRangeMin: "Min",
  filterRangeMax: "Max",

  searchPlaceholder: "Search…",

  loading: "Loading",
  empty: "No data",
  noResults: "No matching records",
  loadingMore: "Loading more",
  error: "Couldn't load data",
  retry: "Retry",
  loadMoreError: "Couldn't load more rows",

  editColumn: column => `Edit ${column}`,
  editPending: "Saving",

  reorderRow: "Drag to reorder row",
  rowOrderingUnavailable: "Clear sorting, filters, and grouping to reorder rows",
  rowReorderLifted: row => `${row} lifted — use the arrow keys to move, space to drop, escape to cancel`,
  rowReorderTarget: (row, side) => side === "before" ? `Before ${row}` : `After ${row}`,
  rowReorderDropped: row => `${row} dropped`,
  rowReorderCanceled: "Reorder canceled"
};

export function resolveLabels(labels: Partial<DataTableLabels> | undefined): DataTableLabels {
  return labels ? { ...defaultLabels, ...labels } : defaultLabels;
}
