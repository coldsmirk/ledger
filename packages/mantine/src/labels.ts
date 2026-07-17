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

  /* Columns panel */
  columnsPanel: string;
  resetColumns: string;
  pinLeft: string;
  pinRight: string;
  unpin: string;
  /**
   * Zone captions the columns panel shows above its pinned columns; nouns for the state, where
   * `pinLeft` / `pinRight` name the action.
   */
  pinnedLeft: string;
  pinnedRight: string;
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
  filterColumn: string;
  clearFilter: string;
  filterPlaceholder: string;
  filterRangeMin: string;
  filterRangeMax: string;

  /* Global search */
  searchPlaceholder: string;

  /* States */
  loading: string;
  empty: string;
  loadingMore: string;

  /* Editing */
  editPending: string;
}

export const defaultLabels: DataTableLabels = {
  paginationSummary: (from, to, total) => `${from}–${to} of ${total}`,
  rowsPerPage: "Rows per page",

  selectAllRows: "Select all rows",
  selectRow: "Select row",
  selectedCount: count => `${count} selected`,
  clearSelection: "Clear selection",

  expandRow: "Expand row",
  collapseRow: "Collapse row",
  expandAll: "Expand all rows",
  collapseAll: "Collapse all rows",

  columnsPanel: "Columns",
  resetColumns: "Reset",
  pinLeft: "Pin to left",
  pinRight: "Pin to right",
  unpin: "Unpin",
  pinnedLeft: "Pinned left",
  pinnedRight: "Pinned right",
  groupByColumn: "Group by this column",
  ungroupColumn: "Ungroup",
  columnWidth: "Width",
  columnWidthAuto: "Auto",

  resizeColumn: "Resize column",
  reorderColumn: "Drag to reorder column",

  filterColumn: "Filter column",
  clearFilter: "Clear filter",
  filterPlaceholder: "Filter…",
  filterRangeMin: "Min",
  filterRangeMax: "Max",

  searchPlaceholder: "Search…",

  loading: "Loading",
  empty: "No data",
  loadingMore: "Loading more",

  editPending: "Saving"
};

export function resolveLabels(labels: Partial<DataTableLabels> | undefined): DataTableLabels {
  return labels ? { ...defaultLabels, ...labels } : defaultLabels;
}
