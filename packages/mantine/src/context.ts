import type { GetStylesApi, TableTrProps } from "@mantine/core";
import type { ColumnFiltersState } from "@tanstack/react-table";
import type { KeyboardEvent, MouseEvent } from "react";

import type { DataTableFactory } from "./data-table";
import type { DataTableElementProps } from "./element-props";
import type { DataTableLabels } from "./labels";
import type { HeaderGroup, Row } from "./types";

/**
 * Internal context for everything rendered inside the <DataTable> tree. The data generic is
 * erased at this boundary — the single deliberate erasure in the package, mirroring the family
 * convention (one documented boundary instead of casts scattered through the tree). Cells and
 * filter popovers receive their strongly-typed TanStack objects (`Row<TData>`, `Column<TData>`)
 * directly as props; the context only carries table-wide plumbing.
 *
 * The table instance itself is deliberately NOT here. Anything below that rendered without the
 * root rendering with it — a filter popover redrawing from its own state, a row the virtualizer
 * put back — would read whatever pass wrote the instance last, and v9 writes the shared core
 * during render, a pass React discarded included. So the few table-wide facts the tree needs
 * arrive as their own fields, each stable enough to keep the context value itself stable
 * (docs/architecture.md).
 */
import { createSafeContext } from "@mantine/core";

export interface DataTableContextValue {
  /**
   * Stable per-instance id — what the single-select radios group themselves by.
   */
  instanceId: string;
  getStyles: GetStylesApi<DataTableFactory>;
  labels: DataTableLabels;
  filterMode: "client" | "server";
  /**
   * Row virtualization active — rows must then carry aria-rowindex (header rows included).
   */
  virtualized: boolean;
  /**
   * The header region renders — so header rows count toward every `aria-rowindex`.
   */
  withColumnHeaders: boolean;
  /**
   * The active-row slice, as its own two facts: the switch, and the stable setter that moves it.
   * Rows are memoized, so both have to reach them through the context — a prop that only
   * TableBody knows about would leave a row that did not re-render answering with the switch as
   * it stood when it last did.
   */
  activeRowEnabled: boolean;
  setActiveRow?: (rowId: string) => void;
  /**
   * Notification of every `columnFilters` set attempt, no-ops included — what a debounced filter
   * control listens to so an external reset reaches its own local value. Stable per instance.
   */
  subscribeColumnFilters?: (listener: (value: ColumnFiltersState) => void) => () => void;
  onRowClick?: (row: Row<any>, event: MouseEvent) => void;
  onRowActivate?: (row: Row<any>, event: MouseEvent | KeyboardEvent) => void;
  onRowDoubleClick?: (row: Row<any>, event: MouseEvent) => void;
  onRowContextMenu?: (row: Row<any>, event: MouseEvent) => void;
  rowProps?: DataTableElementProps<Omit<TableTrProps, "ref">, Row<any>>;
  headerRowProps?: DataTableElementProps<Omit<TableTrProps, "ref">, HeaderGroup<any>>;
  footerRowProps?: DataTableElementProps<Omit<TableTrProps, "ref">, HeaderGroup<any>>;
}

export const [DataTableProvider, useDataTableContext] = createSafeContext<DataTableContextValue>(
  "DataTable parts must be rendered inside <DataTable>"
);
