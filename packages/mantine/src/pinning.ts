/**
 * Pinned-column geometry. Offsets are referenced as CSS variables (written table-level next to
 * the width variables), so a resize drag updates one style object and never re-renders rows;
 * logical insets make RTL mirror for free.
 */
import type { Column } from "@tanstack/react-table";
import type { CSSProperties } from "react";

import { columnAfterVar, columnStartVar } from "./utils";

export function pinnedCellStyle<TData>(column: Column<TData, unknown>): CSSProperties | undefined {
  const pinned = column.getIsPinned();

  if (pinned === "left") {
    return { insetInlineStart: `var(${columnStartVar(column.id)})` };
  }

  if (pinned === "right") {
    return { insetInlineEnd: `var(${columnAfterVar(column.id)})` };
  }

  return undefined;
}

/**
 * The boundary cell of a pinned block — where the scroll shadow renders.
 */
export function pinnedEdge<TData>(column: Column<TData, unknown>): "left" | "right" | undefined {
  if (column.getIsPinned() === "left" && column.getIsLastColumn("left")) {
    return "left";
  }

  if (column.getIsPinned() === "right" && column.getIsFirstColumn("right")) {
    return "right";
  }

  return undefined;
}
