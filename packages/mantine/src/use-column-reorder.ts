/**
 * Pointer-based header drag reordering — no drag-and-drop dependency. A press becomes a drag
 * after a 5px threshold, so the sortable header label keeps its click; a completed drag
 * suppresses the click that follows pointerup. Escape cancels. Reordering is limited to
 * single-row headers: with column groups, sibling order inside a group is ambiguous.
 */
import type { Table } from "@tanstack/react-table";
import type { PointerEvent as ReactPointerEvent } from "react";

import { useRef, useState } from "react";

import { isInternalColumn } from "./build-columns";
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
  target: { id: string; side: "before" | "after" } | null;
  cleanup: () => void;
}

export function useColumnReorder<TData>(table: Table<TData>): ColumnReorder {
  const [drag, setDrag] = useState<ColumnDragState>(IDLE);
  const session = useRef<DragSession | null>(null);
  const suppressClick = useRef(false);

  const enabledOption = table.options.meta?.ledger?.enableColumnOrdering === true;
  const hasGroupedHeaders = table.getHeaderGroups().length > 1;

  if (enabledOption && hasGroupedHeaders) {
    warnOnce(
      "reorder-grouped-headers",
      "enableColumnOrdering is ignored for tables with header groups — sibling order inside a group is ambiguous."
    );
  }

  const enabled = enabledOption && !hasGroupedHeaders;

  const commitReorder = (draggedId: string, target: { id: string; side: "before" | "after" }) => {
    const leafIds = table.getAllLeafColumns().map(column => column.id);
    const stateOrder = table.getState().columnOrder;
    const base = stateOrder.length > 0
      ? [...stateOrder.filter(id => leafIds.includes(id)), ...leafIds.filter(id => !stateOrder.includes(id))]
      : leafIds;

    const withoutDragged = base.filter(id => id !== draggedId);
    const targetIndex = withoutDragged.indexOf(target.id);

    if (targetIndex === -1) {
      return;
    }

    const insertAt = target.side === "before" ? targetIndex : targetIndex + 1;
    const next = [...withoutDragged.slice(0, insertAt), draggedId, ...withoutDragged.slice(insertAt)];

    table.setColumnOrder(next);
  };

  const getHeaderProps: ColumnReorder["getHeaderProps"] = columnId => {
    if (!enabled || isInternalColumn(columnId)) {
      return {};
    }

    return {
      onPointerDown: event => {
        if (event.button !== 0 || (event.target as HTMLElement).closest("[data-ledger-no-drag]")) {
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

          if (headerCell && targetId && targetId !== current.columnId && !isInternalColumn(targetId)) {
            const rect = headerCell.getBoundingClientRect();
            target = { id: targetId, side: move.clientX < rect.left + rect.width / 2 ? "before" : "after" };
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
            removeEventListener("keydown", onKeyDown);
          }
        };

        addEventListener("pointermove", onPointerMove);
        addEventListener("pointerup", onPointerUp);
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
