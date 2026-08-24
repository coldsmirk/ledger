import type { RowData } from "@tanstack/react-table";
import type { PointerEvent as ReactPointerEvent } from "react";

import type { TableInstance } from "./types";

/**
 * Pointer-based column resizing, exact by construction: the drag starts from the width the
 * engine actually rendered (docs/sizing.md), so a grow column's first drag is 1:1 instead of
 * jumping to a default. Live updates write `columnSizing` (the CSS-variable pipeline keeps this
 * cheap); Escape and pointercancel restore the width the drag started from; direction follows
 * the computed `direction` of the handle, so RTL drags resolve correctly. A mid-drag unmount
 * releases the window listeners without touching table state.
 */
import { useEffect, useRef, useState } from "react";

export interface ColumnResize {
  resizingId: string | null;
  getResizerProps: (columnId: string) => { onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void };
}

interface ResizeSession {
  columnId: string;
  startX: number;
  startWidth: number;
  /**
   * The `columnSizing` entry before the drag — Escape restores it (absent = grow column).
   */
  previousEntry: number | undefined;
  rtl: boolean;
  cleanup: () => void;
}

export function useColumnResize<TData extends RowData>(
  table: TableInstance<TData>,
  columnWidths: Record<string, number>
): ColumnResize {
  const [resizingId, setResizingId] = useState<string | null>(null);
  const session = useRef<ResizeSession | null>(null);

  // The listeners live on window, so a mid-drag unmount must release them here.
  useEffect(() => () => {
    session.current?.cleanup();
    session.current = null;
  }, []);

  const getResizerProps: ColumnResize["getResizerProps"] = columnId => {
    return {
      onPointerDown: event => {
        if (event.button !== 0 || session.current) {
          return;
        }

        const column = table.getColumn(columnId);

        if (!column) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const { minSize, maxSize } = column.columnDef;

        const onPointerMove = (move: globalThis.PointerEvent) => {
          const { current } = session;

          if (!current) {
            return;
          }

          const delta = (move.clientX - current.startX) * (current.rtl ? -1 : 1);
          const next = Math.min(
            Math.max(Math.round(current.startWidth + delta), minSize ?? 20),
            maxSize ?? Number.MAX_SAFE_INTEGER
          );

          table.setColumnSizing(previous => previous[columnId] === next ? previous : { ...previous, [columnId]: next });
        };

        const endSession = (restore: boolean) => {
          const { current } = session;

          if (!current) {
            return;
          }

          current.cleanup();
          session.current = null;
          setResizingId(null);

          if (restore) {
            table.setColumnSizing(previous => {
              const { [columnId]: _dropped, ...rest } = previous;

              return current.previousEntry === undefined
                ? rest
                : { ...rest, [columnId]: current.previousEntry };
            });
          }
        };

        const onPointerUp = () => endSession(false);

        // The browser aborted the pointer stream (touch pan takeover, OS gesture) — no
        // pointerup will follow, so treat it like Escape and restore.
        const onPointerCancel = () => endSession(true);

        const onKeyDown = (key: globalThis.KeyboardEvent) => {
          if (key.key === "Escape") {
            endSession(true);
          }
        };

        session.current = {
          columnId,
          startX: event.clientX,
          startWidth: columnWidths[columnId] ?? column.getSize(),
          // Event-time snapshot: atoms are the blessed non-render read surface in v9.
          previousEntry: table.atoms.columnSizing.get()[columnId],
          rtl: getComputedStyle(event.currentTarget).direction === "rtl",
          cleanup: () => {
            removeEventListener("pointermove", onPointerMove);
            removeEventListener("pointerup", onPointerUp);
            removeEventListener("pointercancel", onPointerCancel);
            removeEventListener("keydown", onKeyDown);
          }
        };
        setResizingId(columnId);

        addEventListener("pointermove", onPointerMove);
        addEventListener("pointerup", onPointerUp);
        addEventListener("pointercancel", onPointerCancel);
        addEventListener("keydown", onKeyDown);
      }
    };
  };

  return {
    resizingId,
    getResizerProps
  };
}
