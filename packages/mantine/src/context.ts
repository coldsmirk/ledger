import type { GetStylesApi } from "@mantine/core";
import type { Row, Table } from "@tanstack/react-table";
import type { MouseEvent, RefObject } from "react";

import type { DataTableFactory } from "./data-table";
import type { DataTableLabels } from "./labels";

/**
 * Internal context for everything rendered inside the <DataTable> tree. The data generic is
 * erased at this boundary — the single deliberate erasure in the package, mirroring the family
 * convention (one documented boundary instead of casts scattered through the tree). Cells and
 * menus receive their strongly-typed TanStack objects (`Row<TData>`, `Column<TData>`) directly
 * as props; the context only carries table-wide plumbing.
 */
import { createSafeContext } from "@mantine/core";

export interface DataTableContextValue {
  table: Table<any>;
  getStyles: GetStylesApi<DataTableFactory>;
  labels: DataTableLabels;
  withColumnMenu: boolean;
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
  onRowDoubleClick?: (row: Row<any>, event: MouseEvent) => void;
  onRowContextMenu?: (row: Row<any>, event: MouseEvent) => void;
  rowClassName?: string | ((row: Row<any>) => string | undefined);
}

export const [DataTableProvider, useDataTableContext] = createSafeContext<DataTableContextValue>(
  "DataTable parts must be rendered inside <DataTable>"
);
