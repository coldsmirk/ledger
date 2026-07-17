/**
 * Locale presets for `DataTableLabels`. This module is also published as the "./locales"
 * subpath so applications can import a preset without touching the main entry:
 *
 * ```ts
 * import { zhCN } from "@coldsmirk/ledger-mantine/locales";
 * theme.components.DataTable = DataTable.extend({ defaultProps: { labels: zhCN } });
 * ```
 */
import type { DataTableLabels } from "./labels";

export const zhCN: DataTableLabels = {
  paginationSummary: (from, to, total) => `第 ${from}–${to} 条，共 ${total} 条`,
  rowsPerPage: "每页行数",

  selectAllRows: "全选",
  selectRow: "选择行",
  selectedCount: count => `已选 ${count} 项`,
  clearSelection: "清除选择",

  expandRow: "展开行",
  collapseRow: "收起行",
  expandAll: "展开全部",
  collapseAll: "收起全部",

  columnMenu: "列菜单",
  sortAscending: "升序",
  sortDescending: "降序",
  clearSort: "清除排序",
  pinLeft: "固定到左侧",
  pinRight: "固定到右侧",
  unpin: "取消固定",
  hideColumn: "隐藏列",
  groupByColumn: "按此列分组",
  ungroupColumn: "取消分组",

  columnsMenu: "列设置",
  showAllColumns: "显示全部列",

  resizeColumn: "调整列宽",
  reorderColumn: "拖拽调整列顺序",

  filterColumn: "筛选",
  clearFilter: "清除筛选",
  filterPlaceholder: "筛选…",
  filterRangeMin: "最小值",
  filterRangeMax: "最大值",

  searchPlaceholder: "搜索…",

  loading: "加载中",
  empty: "暂无数据",
  loadingMore: "加载更多",

  editPending: "保存中"
};
