import type { GetStylesApi, TableTrProps } from "@mantine/core";
import type { KeyboardEvent, MouseEvent, RefObject } from "react";

import type { DataTableFactory } from "./data-table";
import type { DataTableElementProps } from "./element-props";
import type { DataTableLabels } from "./labels";
import type { HeaderGroup, Row, TableInstance } from "./types";

/**
 * Internal context for everything rendered inside the <DataTable> tree. The data generic is
 * erased at this boundary — the single deliberate erasure in the package, mirroring the family
 * convention (one documented boundary instead of casts scattered through the tree). Cells and
 * filter popovers receive their strongly-typed TanStack objects (`Row<TData>`, `Column<TData>`)
 * directly as props; the context only carries table-wide plumbing.
 */
import { createSafeContext } from "@mantine/core";

export interface DataTableContextValue {
  table: TableInstance<any>;
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
   * Engine-resolved column widths (docs/sizing.md), read at event time by resize drags.
   * A ref on purpose: width changes must never re-render every context consumer.
   */
  columnWidths: RefObject<Record<string, number>>;
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
