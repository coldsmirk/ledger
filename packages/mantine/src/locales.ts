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

  columnsPanel: "列设置",
  resetColumns: "重置",
  pinStart: "固定到左侧",
  pinEnd: "固定到右侧",
  unpin: "取消固定",
  pinnedStart: "左侧固定",
  pinnedEnd: "右侧固定",
  groupByColumn: "按此列分组",
  ungroupColumn: "取消分组",
  columnWidth: "宽度",
  columnWidthAuto: "自适应",

  resizeColumn: "拖动调整列宽；双击自适应内容",
  reorderColumn: "拖拽调整列顺序",

  filterColumn: column => `筛选${column}`,
  clearFilter: "清除筛选",
  filterPlaceholder: "筛选…",
  filterRangeMin: "最小值",
  filterRangeMax: "最大值",

  searchPlaceholder: "搜索…",

  loading: "加载中",
  empty: "暂无数据",
  noResults: "没有匹配的记录",
  loadingMore: "加载更多",
  error: "数据加载失败",
  retry: "重试",
  loadMoreError: "加载更多失败",

  editColumn: column => `编辑${column}`,
  editPending: "保存中"
};
