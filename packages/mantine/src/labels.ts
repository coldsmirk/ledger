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

  /* Column menu */
  columnMenu: string;
  sortAscending: string;
  sortDescending: string;
  clearSort: string;
  pinLeft: string;
  pinRight: string;
  unpin: string;
  hideColumn: string;
  groupByColumn: string;
  ungroupColumn: string;

  /* Columns visibility menu */
  columnsMenu: string;
  showAllColumns: string;

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

  columnMenu: "Column menu",
  sortAscending: "Sort ascending",
  sortDescending: "Sort descending",
  clearSort: "Clear sort",
  pinLeft: "Pin to left",
  pinRight: "Pin to right",
  unpin: "Unpin",
  hideColumn: "Hide column",
  groupByColumn: "Group by this column",
  ungroupColumn: "Ungroup",

  columnsMenu: "Columns",
  showAllColumns: "Show all columns",

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
