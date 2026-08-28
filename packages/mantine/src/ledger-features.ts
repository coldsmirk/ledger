import type { FilterFn, RowData } from "@tanstack/react-table";

/**
 * The canonical TanStack v9 feature set every ledger table runs on (docs/state.md). One static
 * object so `typeof ledgerFeatures` (`LedgerFeatures`) can pre-bind the `TFeatures` generic of
 * every re-exported type — consumers keep writing v8-shaped `ColumnDef<TData>` code.
 *
 * - Every stock feature is registered EXCEPT the two below.
 * - `columnResizingFeature`: ledger owns the resize interaction end to end
 * (`use-column-resize.ts`), so TanStack's drag machinery — and with it the `columnResizing`
 * state slice, `getIsResizing()`, and `getResizeHandler()` — is not registered at all.
 * Feature-gated APIs cannot lie about a pipeline that never runs.
 * - `cellSelectionFeature`: cell selection is deferred until its own design round
 * (docs/DESIGN.md), so the `cellSelection` state slice, `enableCellSelection`, and
 * `cell.getIsSelected()` are likewise absent by the same rule.
 * - Row model factories are registered statically; the `manualX` translations decide at runtime
 * whether a model actually processes rows (client mode) or passes through (server mode).
 * - Every built-in fn ships registered under its conventional name. v9 resolves string ids —
 * `'auto'` included — only against registered functions, and ledger's contract is that every
 * TanStack capability on a raw `ColumnDef` keeps working; a few KB of fns is the price of
 * that promise.
 */
import {
  aggregationFn_count,
  aggregationFn_extent,
  aggregationFn_first,
  aggregationFn_last,
  aggregationFn_max,
  aggregationFn_mean,
  aggregationFn_median,
  aggregationFn_min,
  aggregationFn_sum,
  aggregationFn_unique,
  aggregationFn_uniqueCount,
  cellSpanningFeature,
  columnFacetingFeature,
  columnFilteringFeature,
  columnGroupingFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createExpandedRowModel,
  createFacetedMinMaxValues,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createGroupedRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_arrHas,
  filterFn_arrIncludes,
  filterFn_arrIncludesAll,
  filterFn_arrIncludesSome,
  filterFn_between,
  filterFn_betweenInclusive,
  filterFn_empty,
  filterFn_endsWith,
  filterFn_equals,
  filterFn_equalsString,
  filterFn_equalsStringSensitive,
  filterFn_greaterThan,
  filterFn_greaterThanOrEqualTo,
  filterFn_includesString,
  filterFn_includesStringSensitive,
  filterFn_inDateRange,
  filterFn_inNumberRange,
  filterFn_lessThan,
  filterFn_lessThanOrEqualTo,
  filterFn_notEmpty,
  filterFn_startsWith,
  filterFn_weakEquals,
  globalFilteringFeature,
  rowAggregationFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  rowPinningFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_alphanumericCaseSensitive,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  sortFn_textCaseSensitive,
  tableFeatures,
  createColumnHelper as tanStackCreateColumnHelper
} from "@tanstack/react-table";

import { ledgerFilterFns } from "./filter-fns";

const builtInFilterFns = {
  arrHas: filterFn_arrHas,
  arrIncludes: filterFn_arrIncludes,
  arrIncludesAll: filterFn_arrIncludesAll,
  arrIncludesSome: filterFn_arrIncludesSome,
  between: filterFn_between,
  betweenInclusive: filterFn_betweenInclusive,
  empty: filterFn_empty,
  endsWith: filterFn_endsWith,
  equals: filterFn_equals,
  equalsString: filterFn_equalsString,
  equalsStringSensitive: filterFn_equalsStringSensitive,
  greaterThan: filterFn_greaterThan,
  greaterThanOrEqualTo: filterFn_greaterThanOrEqualTo,
  inDateRange: filterFn_inDateRange,
  inNumberRange: filterFn_inNumberRange,
  includesString: filterFn_includesString,
  includesStringSensitive: filterFn_includesStringSensitive,
  lessThan: filterFn_lessThan,
  lessThanOrEqualTo: filterFn_lessThanOrEqualTo,
  notEmpty: filterFn_notEmpty,
  startsWith: filterFn_startsWith,
  weakEquals: filterFn_weakEquals
};

export const ledgerFeatures = tableFeatures({
  cellSpanningFeature,
  columnFacetingFeature,
  columnFilteringFeature,
  columnGroupingFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowAggregationFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  rowPinningFeature,
  rowSelectionFeature,
  rowSortingFeature,
  expandedRowModel: createExpandedRowModel(),
  facetedMinMaxValues: createFacetedMinMaxValues(),
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  filteredRowModel: createFilteredRowModel(),
  groupedRowModel: createGroupedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  aggregationFns: {
    count: aggregationFn_count,
    extent: aggregationFn_extent,
    first: aggregationFn_first,
    last: aggregationFn_last,
    max: aggregationFn_max,
    mean: aggregationFn_mean,
    median: aggregationFn_median,
    min: aggregationFn_min,
    sum: aggregationFn_sum,
    unique: aggregationFn_unique,
    uniqueCount: aggregationFn_uniqueCount
  },
  filterFns: { ...builtInFilterFns, ...ledgerFilterFns },
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    alphanumericCaseSensitive: sortFn_alphanumericCaseSensitive,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
    textCaseSensitive: sortFn_textCaseSensitive
  }
});

export type LedgerFeatures = typeof ledgerFeatures;

/**
 * TanStack's column helper, pre-bound to the canonical feature set — consumers keep the v8
 * calling shape (`createColumnHelper<Person>()`), never managing `TFeatures` themselves.
 */
export function createColumnHelper<TData extends RowData>() {
  return tanStackCreateColumnHelper<LedgerFeatures, TData>();
}

/**
 * The per-instance feature object: the canonical set, plus the consumer's `filterFns` registry
 * merged beneath ledger's reserved ids. Read once at mount (the `features` option wires code
 * modules, not reactive state).
 */
export function buildLedgerFeatures(
  consumerFilterFns: Record<string, FilterFn<any, any>> | undefined
): LedgerFeatures {
  if (!consumerFilterFns) {
    return ledgerFeatures;
  }

  return {
    ...ledgerFeatures,
    filterFns: {
      ...builtInFilterFns,
      ...consumerFilterFns,
      ...ledgerFilterFns
    }
  };
}
