/**
 * Pinned-column geometry. Offsets are referenced as CSS variables (written table-level next to
 * the width variables), so a resize drag updates one style object and never re-renders rows;
 * TanStack v9's logical `start`/`end` positions pair with logical insets, so RTL mirrors for
 * free.
 */
import type { RowData } from "@tanstack/react-table";
import type { CSSProperties } from "react";

import type { Column } from "./types";

import { columnAfterVar, columnStartVar } from "./utils";

export function pinnedCellStyle<TData extends RowData>(column: Column<TData, unknown>): CSSProperties | undefined {
  const pinned = column.getIsPinned();

  if (pinned === "start") {
    return { insetInlineStart: `var(${columnStartVar(column.id)})` };
  }

  if (pinned === "end") {
    return { insetInlineEnd: `var(${columnAfterVar(column.id)})` };
  }

  return undefined;
}

/**
 * The boundary cell of a pinned block — where the scroll shadow renders.
 */
export function pinnedEdge<TData extends RowData>(column: Column<TData, unknown>): "start" | "end" | undefined {
  if (column.getIsPinned() === "start" && column.getIsLastColumn("start")) {
    return "start";
  }

  if (column.getIsPinned() === "end" && column.getIsFirstColumn("end")) {
    return "end";
  }

  return undefined;
}
