/**
 * Pointer-based header drag reordering — no drag-and-drop dependency. A press becomes a drag
 * after a 5px threshold, so the sortable header label keeps its click; a completed drag
 * suppresses the click that follows pointerup. Escape and pointercancel abandon the drag, and
 * a mid-drag unmount releases the window listeners. Reordering is limited to single-row
 * headers: with column groups, sibling order inside a group is ambiguous.
 */
import type { RowData } from "@tanstack/react-table";
import type { PointerEvent as ReactPointerEvent } from "react";

import type { ColumnDropTarget } from "./column-order";
import type { TableInstance } from "./types";

import { useEffect, useRef, useState } from "react";

import { isInternalColumn } from "./build-columns";
import { getColumnZone, reorderColumnWithinZone } from "./column-order";
import { warnOnce } from "./env";

const DRAG_THRESHOLD_PX = 5;

export interface ColumnDragState {
  draggedId: string | null;
  targetId: string | null;
  side: "before" | "after" | null;
}

const IDLE: ColumnDragState = {
  draggedId: null,
  targetId: null,
  side: null
};

export interface ColumnReorder {
  drag: ColumnDragState;
  getHeaderProps: (columnId: string) => { onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void };
  /**
   * True exactly once after a completed drag — the header label uses it to swallow the click.
   */
  consumeClickSuppression: () => boolean;
}

interface DragSession {
  columnId: string;
  startX: number;
  started: boolean;
  target: ColumnDropTarget | null;
  cleanup: () => void;
}

export function useColumnReorder<TData extends RowData>(table: TableInstance<TData>): ColumnReorder {
  const [drag, setDrag] = useState<ColumnDragState>(IDLE);
  const session = useRef<DragSession | null>(null);
  const suppressClick = useRef(false);

  // The listeners live on window, so a mid-drag unmount must release them here.
  useEffect(() => () => {
    session.current?.cleanup();
    session.current = null;
  }, []);

  const enabledOption = table.options.meta?.ledger?.enableColumnOrdering === true;
  const hasGroupedHeaders = table.getHeaderGroups().length > 1;

  if (enabledOption && hasGroupedHeaders) {
    warnOnce(
      "reorder-grouped-headers",
      "enableColumnOrdering is ignored for tables with header groups — sibling order inside a group is ambiguous."
    );
  }

  const enabled = enabledOption && !hasGroupedHeaders;

  const commitReorder = (draggedId: string, target: ColumnDropTarget) => {
    reorderColumnWithinZone(table, draggedId, target);
  };

  const getHeaderProps: ColumnReorder["getHeaderProps"] = columnId => {
    if (!enabled || isInternalColumn(columnId)) {
      return {};
    }

    return {
      onPointerDown: event => {
        if (
          event.button !== 0
          || session.current
          || (event.target as HTMLElement).closest("[data-ledger-no-drag]")
        ) {
          return;
        }

        const onPointerMove = (move: globalThis.PointerEvent) => {
          const { current } = session;

          if (!current) {
            return;
          }

          if (!current.started) {
            if (Math.abs(move.clientX - current.startX) < DRAG_THRESHOLD_PX) {
              return;
            }

            current.started = true;
          }

          const headerCell = document
            .elementFromPoint(move.clientX, move.clientY)
            ?.closest<HTMLElement>("[data-ledger-column-id]");
          const targetId = headerCell?.dataset.ledgerColumnId;

          let target: DragSession["target"] = null;

          if (
            headerCell
            && targetId
            && targetId !== current.columnId
            && !isInternalColumn(targetId)
            && getColumnZone(table, targetId) === getColumnZone(table, current.columnId)
          ) {
            const rect = headerCell.getBoundingClientRect();
            // `before`/`after` are logical, like the drop indicator that renders them: in RTL a
            // cell's leading half is its RIGHT half, so the physical test has to be mirrored
            // (the same reasoning the resize drag applies to its delta).
            const rtl = getComputedStyle(headerCell).direction === "rtl";
            const inLeftHalf = move.clientX < rect.left + rect.width / 2;

            target = { id: targetId, side: inLeftHalf === rtl ? "after" : "before" };
          }

          current.target = target;
          setDrag({
            draggedId: current.columnId,
            targetId: target?.id ?? null,
            side: target?.side ?? null
          });
        };

        const endSession = (commit: boolean) => {
          const { current } = session;

          if (!current) {
            return;
          }

          current.cleanup();
          session.current = null;

          if (current.started) {
            suppressClick.current = true;

            if (commit && current.target) {
              commitReorder(current.columnId, current.target);
            }
          }

          setDrag(IDLE);
        };

        const onPointerUp = () => endSession(true);

        const onPointerCancel = () => {
          const { current } = session;

          // The browser aborted the pointer stream and no click will follow, so ending the
          // session here must not arm the click suppression.
          if (current) {
            current.started = false;
          }

          endSession(false);
        };

        const onKeyDown = (key: globalThis.KeyboardEvent) => {
          if (key.key === "Escape") {
            endSession(false);
          }
        };

        session.current = {
          columnId,
          startX: event.clientX,
          started: false,
          target: null,
          cleanup: () => {
            removeEventListener("pointermove", onPointerMove);
            removeEventListener("pointerup", onPointerUp);
            removeEventListener("pointercancel", onPointerCancel);
            removeEventListener("keydown", onKeyDown);
          }
        };

        addEventListener("pointermove", onPointerMove);
        addEventListener("pointerup", onPointerUp);
        addEventListener("pointercancel", onPointerCancel);
        addEventListener("keydown", onKeyDown);
      }
    };
  };

  const consumeClickSuppression = () => {
    if (!suppressClick.current) {
      return false;
    }

    suppressClick.current = false;

    return true;
  };

  return {
    drag,
    getHeaderProps,
    consumeClickSuppression
  };
}
