import type { ColumnSizingState } from "@tanstack/react-table";
import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Pointer-based column resizing, exact by construction: the drag starts from the width the
 * engine actually rendered (docs/sizing.md), so a grow column's first drag is 1:1 instead of
 * jumping to a default. Live updates write `columnSizing` (the CSS-variable pipeline keeps this
 * cheap); Escape and pointercancel restore the width the drag started from; direction follows
 * the computed `direction` of the handle, so RTL drags resolve correctly. A mid-drag unmount
 * releases the window listeners without touching table state.
 *
 * Nothing here reaches for the table at event time. Everything a drag decides with — the column,
 * the width on screen, the constraints, the entry to restore — arrives as a `ResizerSpec` from the
 * render that put the handle on screen, because the shared TanStack core carries whatever render
 * pass ran last, a discarded one included (docs/architecture.md).
 */
import { useEffect, useRef, useState } from "react";

export interface ResizerSpec {
  columnId: string;
  /**
   * The engine-resolved width this render drew — the edge the user is grabbing.
   */
  width: number;
  minSize: number;
  maxSize: number;
  /**
   * This render's `columnSizing` entry. Escape restores it; absent means a grow column, which
   * Escape returns to having no entry at all.
   */
  sizingEntry: number | undefined;
}

export interface ColumnResize {
  resizingId: string | null;
  getResizerProps: (spec: ResizerSpec) => { onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void };
}

interface ResizeSession {
  startX: number;
  rtl: boolean;
  /**
   * Whether the handle for this column is still on screen. Asked of the document rather than of a
   * captured node — the node is replaced whenever the header re-renders, which a live drag does on
   * every move — and it is the only signal a window-level pointer stream gets that a real render
   * has taken its column away.
   */
  onScreen: () => boolean;
  cleanup: () => void;
}

export function useColumnResize(
  setColumnSizing: (updater: (previous: ColumnSizingState) => ColumnSizingState) => void
): ColumnResize {
  const [resizingId, setResizingId] = useState<string | null>(null);
  const session = useRef<ResizeSession | null>(null);

  // The listeners live on window, so a mid-drag unmount must release them here.
  useEffect(() => () => {
    session.current?.cleanup();
    session.current = null;
  }, []);

  const getResizerProps: ColumnResize["getResizerProps"] = ({
    columnId,
    width,
    minSize,
    maxSize,
    sizingEntry
  }) => {
    return {
      onPointerDown: event => {
        if (event.button !== 0 || session.current) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        // Captured now: React clears `currentTarget` once the dispatch returns, and the handlers
        // below outlive it.
        const handle = event.currentTarget;
        const { ownerDocument } = handle;
        const rtl = getComputedStyle(handle).direction === "rtl";
        const handleSelector = `.ledger-header [data-ledger-column-id="${CSS.escape(columnId)}"] [data-ledger-resizer]`;

        const endSession = (restore: boolean) => {
          const { current } = session;

          if (!current) {
            return;
          }

          current.cleanup();
          session.current = null;
          setResizingId(null);

          if (restore) {
            setColumnSizing(previous => {
              const { [columnId]: _dropped, ...rest } = previous;

              return sizingEntry === undefined ? rest : { ...rest, [columnId]: sizingEntry };
            });
          }
        };

        const onPointerMove = (move: globalThis.PointerEvent) => {
          const { current } = session;

          if (!current) {
            return;
          }

          // The column really left the screen mid-drag. There is nothing under the pointer to
          // resize any more, and writing a width for a column the table no longer has is worse
          // than stopping — restoring would be too, since the entry it would restore is for a
          // column that is gone.
          if (!current.onScreen()) {
            endSession(false);

            return;
          }

          const delta = (move.clientX - current.startX) * (current.rtl ? -1 : 1);
          const next = Math.min(Math.max(Math.round(width + delta), minSize), maxSize);

          setColumnSizing(previous => previous[columnId] === next ? previous : { ...previous, [columnId]: next });
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
          startX: event.clientX,
          rtl,
          onScreen: () => ownerDocument.querySelector(handleSelector) !== null,
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
