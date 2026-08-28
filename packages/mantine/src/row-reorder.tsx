import type { PointerSensorOptions } from "@dnd-kit/dom";
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from "@dnd-kit/react";
/**
 * Row drag reordering (docs/rows.md#row-ordering). Row order IS data order — there is no order
 * state — so ledger owns the interaction (the handle column, the session, the drop indicator,
 * the announcements) and hands the completed move to `onRowReorder`; the application reorders
 * `data`.
 *
 * Two input channels feed one session:
 *
 * - Pointer drags ride dnd-kit — the columns panel's dependency — for what is expensive to
 * hand-roll: activation constraints, edge auto-scrolling, cursor and selection suppression.
 * The drop target is ledger's own math over the rendered rows, not droppables: per-row
 * droppables would re-register on every virtualizer round-trip, and the sortable plugin's
 * optimistic DOM moves would break the one-`<tr>`-per-virtual-item invariant. The Feedback
 * and Accessibility plugins stay out for the same reason — the row ghost and the live
 * region are ledger's, fed from `labels`.
 * - The keyboard steps the insertion index directly (Space lifts, ↑/↓ move, Home/End jump,
 * Space drops, Escape cancels; blur abandons) — exact positions, not synthetic pixels.
 *
 * Session state lives up in `DataTable`, so the affected rows re-render through their own
 * memoized props; the row ghost and the live region are written imperatively — a pointer
 * move never re-renders the table.
 */
import type { RowData } from "@tanstack/react-table";
import type { KeyboardEvent, ReactNode, RefObject } from "react";

import type { DataTableRowReorder, Row, TableInstance } from "./types";

import { AutoScroller, Cursor, PointerActivationConstraints, PreventSelection } from "@dnd-kit/dom";
import {
  DragDropProvider,
  PointerSensor,
  useDraggable

} from "@dnd-kit/react";
import { ActionIcon, Portal, Tooltip, VisuallyHidden } from "@mantine/core";
import { useMemo, useRef, useState } from "react";

import { useDataTableContext } from "./context";
import { useEventCallback } from "./utils";

/**
 * The 5px house threshold (use-column-reorder.ts) keeps a plain click from lifting the row —
 * a lift is announced, and a click should say nothing. Touch keeps the press-and-hold delay
 * that separates dragging from scrolling.
 */
const activationConstraints: PointerSensorOptions["activationConstraints"] = event => event.pointerType === "touch"
  ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 })]
  : [new PointerActivationConstraints.Distance({ value: 5 })];

export const ROW_REORDER_SENSORS = [PointerSensor.configure({ activationConstraints })];
export const ROW_REORDER_PLUGINS = [AutoScroller, Cursor, PreventSelection];

export interface RowReorderTarget {
  rowId: string;
  side: "before" | "after";
}

/**
 * The keyboard half of the session, handed to the handle cells through the render context. The
 * handlers are stable event callbacks; `active` reads the live session, so a handle can answer
 * "do the keys belong to me" in the render that draws it.
 */
export interface RowReorderKeyboard {
  lift: (rowId: string) => void;
  move: (delta: 1 | -1) => void;
  moveToEdge: (edge: "start" | "end") => void;
  drop: () => void;
  cancel: () => void;
  active: (rowId: string) => boolean;
}

export interface RowReorderSession {
  /**
   * The row a live drag lifted, either channel. Rows render `data-dragging` from it.
   */
  sourceId: string | null;
  /**
   * Where the lifted row would land — `null` while the drop would change nothing. The target
   * row renders the indicator (`data-drop-side`).
   */
  target: RowReorderTarget | null;
  providerProps: {
    onDragStart: (event: DragStartEvent) => void;
    onDragMove: (event: DragMoveEvent) => void;
    onDragEnd: (event: DragEndEvent) => void;
  };
  keyboard: RowReorderKeyboard;
  /**
   * True once a pointer drag has actually moved — the overlay mounts the ghost from it, and
   * its late start is also what keeps a bare click silent.
   */
  ghostActive: boolean;
  attachGhost: (element: HTMLDivElement | null) => void;
  announcerRef: RefObject<HTMLSpanElement | null>;
}

export interface RowReorderInput<TData extends RowData> {
  onRowReorder: ((reorder: DataTableRowReorder<TData>) => void) | undefined;
  labels: {
    rowReorderLifted: (row: string) => string;
    rowReorderTarget: (row: string, side: "before" | "after") => string;
    rowReorderDropped: (row: string) => string;
    rowReorderCanceled: string;
  };
  /**
   * The body scroll viewport — the element whose rendered `<tr>`s the pointer math reads.
   */
  viewportRef: RefObject<HTMLElement | null>;
  /**
   * The center rows of the committed display, in display order (pinned rows are not part of a
   * data-order move). Read once per lift into the session snapshot.
   */
  getCenterRows: () => Array<Row<TData>>;
  /**
   * Names a row the way the active-row announcements do — its leading visible cell.
   */
  nameRow: (row: Row<TData>) => string;
  /**
   * Keeps the keyboard target on screen, virtualized included.
   */
  scrollToRow: (rowId: string) => void;
}

interface DragSnapshot<TData extends RowData> {
  via: "pointer" | "keyboard";
  sourceId: string;
  sourceName: string;
  fromIndex: number;
  /**
   * Keyboard stepping position in `toIndex` space; `fromIndex` means "at rest".
   */
  toIndex: number;
  rows: Array<Row<TData>>;
  rowsById: Map<string, Row<TData>>;
}

export function useRowReorder<TData extends RowData>({
  onRowReorder,
  labels,
  viewportRef,
  getCenterRows,
  nameRow,
  scrollToRow
}: RowReorderInput<TData>): RowReorderSession {
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [target, setTargetState] = useState<RowReorderTarget | null>(null);
  const [ghostActive, setGhostActive] = useState(false);

  const snapshot = useRef<DragSnapshot<TData> | null>(null);
  const targetRef = useRef<RowReorderTarget | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const ghostPosition = useRef({ x: 0, y: 0 });
  const ghostOrigin = useRef({ x: 0, y: 0 });
  const announcerRef = useRef<HTMLSpanElement | null>(null);

  const announce = useEventCallback((message: string) => {
    if (announcerRef.current) {
      announcerRef.current.textContent = message;
    }
  });

  /**
   * `arrayMove` semantics: the final index of the moved row once the drop lands `side` of the
   * target. `null` when the move would change nothing.
   */
  const resolveToIndex = (targetRow: Row<TData>, side: "before" | "after"): number | null => {
    const session = snapshot.current;

    if (!session) {
      return null;
    }

    const raw = targetRow.index + (side === "after" ? 1 : 0);
    const toIndex = raw > session.fromIndex ? raw - 1 : raw;

    return toIndex === session.fromIndex ? null : toIndex;
  };

  const setTarget = (next: RowReorderTarget | null) => {
    const { current } = targetRef;

    if (current?.rowId === next?.rowId && current?.side === next?.side) {
      return;
    }

    targetRef.current = next;
    setTargetState(next);

    if (next) {
      const row = snapshot.current?.rowsById.get(next.rowId);

      if (row) {
        announce(labels.rowReorderTarget(nameRow(row), next.side));
      }
    }
  };

  const begin = (via: "pointer" | "keyboard", rowId: string): DragSnapshot<TData> | null => {
    const rows = getCenterRows();
    const row = rows.find(candidate => candidate.id === rowId);

    if (!row) {
      return null;
    }

    const session: DragSnapshot<TData> = {
      via,
      sourceId: rowId,
      sourceName: nameRow(row),
      fromIndex: row.index,
      toIndex: row.index,
      rows,
      rowsById: new Map(rows.map(candidate => [candidate.id, candidate]))
    };
    snapshot.current = session;
    setSourceId(rowId);

    return session;
  };

  const finish = (canceled: boolean) => {
    const session = snapshot.current;
    const finalTarget = targetRef.current;

    if (session && !canceled) {
      if (finalTarget) {
        const row = session.rowsById.get(session.sourceId);
        const targetRow = session.rowsById.get(finalTarget.rowId);
        const toIndex = targetRow ? resolveToIndex(targetRow, finalTarget.side) : null;

        if (row && toIndex !== null) {
          onRowReorder?.({
            row,
            fromIndex: session.fromIndex,
            toIndex
          });
        }
      }

      announce(labels.rowReorderDropped(session.sourceName));
    } else if (session) {
      announce(labels.rowReorderCanceled);
    }

    snapshot.current = null;
    targetRef.current = null;
    setSourceId(null);
    setTargetState(null);
    setGhostActive(false);
  };

  /* ---- pointer channel (dnd-kit) ---- */

  const onDragStart = useEventCallback((event: DragStartEvent) => {
    const id = event.operation.source?.id;

    if (typeof id !== "string" || snapshot.current) {
      return;
    }

    begin("pointer", id);
  });

  /**
   * The rendered center rows, read where they are drawn: virtualization renders a window, and
   * the rows that exist are exactly the ones a pointer can be over. Pinned rows are sticky
   * overlays of the same scroller, so a pointer inside their bands must not read as "over the
   * row beneath" — they bound the scan instead of joining it.
   */
  const pointerTarget = (y: number): RowReorderTarget | null => {
    const viewport = viewportRef.current;
    const session = snapshot.current;

    if (!viewport || !session) {
      return null;
    }

    const rows = viewport.querySelectorAll<HTMLTableRowElement>("tr[data-row-id]:not([data-pinned-row])");
    const nearest = pointerDropEdge(rows, element => element.getBoundingClientRect(), y);

    if (!nearest) {
      return null;
    }

    const { rowId } = nearest.row.dataset;
    const row = rowId === undefined ? undefined : session.rowsById.get(rowId);

    if (rowId === undefined || !row || resolveToIndex(row, nearest.side) === null) {
      return null;
    }

    return { rowId, side: nearest.side };
  };

  const onDragMove = useEventCallback((event: DragMoveEvent) => {
    const session = snapshot.current;

    if (session?.via !== "pointer") {
      return;
    }

    const position = event.operation.position.current;
    ghostPosition.current = position;

    if (ghostRef.current) {
      ghostRef.current.style.transform = ghostTransform(position, ghostOrigin.current);
    }

    // The lift is announced here, on the first real move, so a plain click stays silent.
    if (!ghostActive) {
      setGhostActive(true);
      announce(labels.rowReorderLifted(session.sourceName));
    }

    setTarget(pointerTarget(position.y));
  });

  const onDragEnd = useEventCallback((event: DragEndEvent) => {
    if (snapshot.current?.via !== "pointer") {
      return;
    }

    finish(event.canceled);
  });

  /* ---- keyboard channel (index stepping) ---- */

  const step = (session: DragSnapshot<TData>, candidate: number) => {
    const last = session.rows.length - 1;
    const toIndex = Math.max(0, Math.min(last, candidate));

    if (toIndex === session.fromIndex || toIndex === session.toIndex) {
      return;
    }

    // Map the landing index back to the row that shows the indicator: landing below the source
    // means "after that row" (every row in between has shifted one up), above means "before".
    const row = session.rows[toIndex];

    if (!row) {
      return;
    }

    session.toIndex = toIndex;
    setTarget({ rowId: row.id, side: toIndex > session.fromIndex ? "after" : "before" });
    scrollToRow(row.id);
  };

  const lift = useEventCallback((rowId: string) => {
    if (snapshot.current) {
      return;
    }

    const session = begin("keyboard", rowId);

    if (session) {
      announce(labels.rowReorderLifted(session.sourceName));
    }
  });

  const move = useEventCallback((delta: 1 | -1) => {
    const session = snapshot.current;

    if (session?.via !== "keyboard") {
      return;
    }

    // Skip over the at-rest position — stepping back onto it would show nothing; Escape is how
    // a lift returns home.
    let candidate = session.toIndex + delta;

    if (candidate === session.fromIndex) {
      candidate += delta;
    }

    step(session, candidate);
  });

  const moveToEdge = useEventCallback((edge: "start" | "end") => {
    const session = snapshot.current;

    if (session?.via !== "keyboard") {
      return;
    }

    step(session, edge === "start" ? 0 : session.rows.length - 1);
  });

  const drop = useEventCallback(() => {
    if (snapshot.current?.via === "keyboard") {
      finish(false);
    }
  });

  const cancel = useEventCallback(() => {
    if (snapshot.current?.via === "keyboard") {
      finish(true);
    }
  });

  const keyboardActive = useEventCallback(
    (rowId: string) => snapshot.current?.via === "keyboard" && snapshot.current.sourceId === rowId
  );

  const attachGhost = useEventCallback((element: HTMLDivElement | null) => {
    ghostRef.current = element;

    if (!element) {
      return;
    }

    // Built once per lift: the ghost is a DOM snapshot of the whole source row — the source
    // table's shell around the cloned `<tr>`, under per-column pixel widths read from the live
    // cells (the width variables live on the ledger root and cannot reach the portal) — so a
    // pointer move stays a pure transform write and no live cell ever renders twice.
    const session = snapshot.current;
    const source = session
      ? viewportRef.current?.querySelector<HTMLTableRowElement>(
          `tr[data-row-id="${CSS.escape(session.sourceId)}"]`
        )
      : null;
    const sourceTable = source?.closest("table");

    if (source && sourceTable) {
      const ghostTable = sourceTable.cloneNode(false) as HTMLTableElement;
      ghostTable.style.width = `${sourceTable.getBoundingClientRect().width}px`;

      const colgroup = document.createElement("colgroup");

      for (const cell of source.cells) {
        const col = document.createElement("col");
        col.style.width = `${cell.getBoundingClientRect().width}px`;
        colgroup.append(col);
      }

      const body = document.createElement("tbody");
      const rowClone = source.cloneNode(true) as HTMLTableRowElement;
      delete rowClone.dataset.dragging;
      body.append(rowClone);
      ghostTable.append(colgroup, body);
      element.replaceChildren(ghostTable);

      // Anchored to where the row was lifted from, so the ghost reads as the row itself
      // coming off the table under the pointer's grab point.
      const rowRect = source.getBoundingClientRect();
      ghostOrigin.current = {
        x: rowRect.left - ghostPosition.current.x,
        y: rowRect.top - ghostPosition.current.y
      };
    }

    // Positioned before its first paint — a ghost that mounts at the portal origin and then
    // jumps to the pointer is exactly the drift the imperative transform exists to avoid.
    element.style.transform = ghostTransform(ghostPosition.current, ghostOrigin.current);
  });

  // Stable — every handler is an event callback — so the render context carrying it holds.
  const keyboard = useMemo<RowReorderKeyboard>(
    () => {
      return {
        active: keyboardActive,
        cancel,
        drop,
        lift,
        move,
        moveToEdge
      };
    },
    [keyboardActive, cancel, drop, lift, move, moveToEdge]
  );

  return {
    sourceId,
    target,
    providerProps: {
      onDragEnd,
      onDragMove,
      onDragStart
    },
    keyboard,
    ghostActive,
    attachGhost,
    announcerRef
  };
}

/**
 * The drop edge a pointer at `y` indicates, scanned top to bottom over the rendered rows: above
 * every row reads "before" the first, inside a row splits at its midline, the gap between two
 * rows belongs to the row above, and below every row reads "after" the last. Zero-height rows
 * never claim the pointer. Pure over `measure` — the session feeds it live rects, and reads
 * lazily so the scan still stops at the row under the pointer.
 */
export function pointerDropEdge<T>(
  rows: Iterable<T>,
  measure: (row: T) => { top: number; bottom: number },
  y: number
): { row: T; side: "before" | "after" } | null {
  let nearest: { row: T; side: "before" | "after" } | null = null;

  for (const row of rows) {
    const { top, bottom } = measure(row);

    if (bottom <= top) {
      continue;
    }

    if (y < top) {
      nearest ??= { row, side: "before" };

      break;
    }

    nearest = { row, side: y < (top + bottom) / 2 ? "before" : "after" };

    if (y <= bottom) {
      break;
    }
  }

  return nearest;
}

function ghostTransform(
  { x, y }: { x: number; y: number },
  origin: { x: number; y: number }
): string {
  return `translate(${Math.round(x + origin.x)}px, ${Math.round(y + origin.y)}px)`;
}

/**
 * Mounts the pointer channel around the table when the gate is on: dnd-kit's provider (context
 * for the handles' draggables), the session's handlers, and the overlay. Renders no DOM of its
 * own, so the table markup is byte-identical either way.
 */
export function RowReorderScope({ session, children }: { session: RowReorderSession | null; children: ReactNode }) {
  if (!session) {
    return children;
  }

  return (
    <DragDropProvider plugins={ROW_REORDER_PLUGINS} sensors={ROW_REORDER_SENSORS} {...session.providerProps}>
      {children}
      <RowReorderOverlay session={session} />
    </DragDropProvider>
  );
}

/**
 * The pointer ghost and the live region, portaled out of the ARIA table (a `role="table"` may
 * only own rows; a fixed-position ghost inside the scroller would clip and shear under sticky
 * transforms). The ghost's content is the row snapshot `attachGhost` clones in, and it is
 * `aria-hidden`: the live region already narrates the drag.
 */
function RowReorderOverlay({ session }: { session: RowReorderSession }) {
  const { getStyles } = useDataTableContext();

  return (
    <Portal>
      <VisuallyHidden ref={session.announcerRef} aria-live="polite" role="status" />
      {session.ghostActive && <div ref={session.attachGhost} aria-hidden {...getStyles("rowDragOverlay")} />}
    </Portal>
  );
}

/**
 * The injected handle cell. The pointer half hands the button to dnd-kit as the draggable;
 * the keyboard half drives the session's index stepping directly. Disabled — visually and for
 * both channels — while something else controls the visible order, with the tooltip saying
 * why (docs/rows.md#row-ordering).
 */
export function RowDragCell<TData extends RowData>({ row, table }: { row: Row<TData>; table: TableInstance<TData> }) {
  const {
    labels,
    icons,
    rowReorderKeyboard
  } = useDataTableContext();
  const orderable = table.options.meta?.ledger?.rowOrdering.orderable === true;

  // No Feedback plugin runs (ROW_REORDER_PLUGINS): the handle stays put and the session's own
  // row ghost is the drag's visual.
  const { ref, isDragSource } = useDraggable({
    id: row.id,
    disabled: !orderable
  });

  const lifted = rowReorderKeyboard?.active(row.id) === true;

  const handleKeyDown = (event: KeyboardEvent) => {
    const keyboard = rowReorderKeyboard;

    if (!keyboard || !orderable) {
      return;
    }

    const { key } = event;

    if (key === " " || key === "Enter") {
      event.preventDefault();
      event.stopPropagation();

      if (lifted) {
        keyboard.drop();
      } else {
        keyboard.lift(row.id);
      }

      return;
    }

    // The remaining keys belong to a live lift alone — an idle handle leaves them to the page.
    if (!lifted) {
      return;
    }

    switch (key) {
      case "ArrowUp": {
        event.preventDefault();
        event.stopPropagation();
        keyboard.move(-1);

        break;
      }

      case "ArrowDown": {
        event.preventDefault();
        event.stopPropagation();
        keyboard.move(1);

        break;
      }

      case "Home": {
        event.preventDefault();
        event.stopPropagation();
        keyboard.moveToEdge("start");

        break;
      }

      case "End": {
        event.preventDefault();
        event.stopPropagation();
        keyboard.moveToEdge("end");

        break;
      }

      case "Escape": {
        event.preventDefault();
        event.stopPropagation();
        keyboard.cancel();

        break;
      }
    // No default
    }
  };

  return (
    <Tooltip disabled={isDragSource || lifted} label={orderable ? labels.reorderRow : labels.rowOrderingUnavailable} openDelay={500}>
      <ActionIcon
        ref={ref}
        aria-disabled={!orderable || undefined}
        aria-label={labels.reorderRow}
        aria-pressed={lifted || undefined}
        color="gray"
        size="sm"
        variant="subtle"
        onBlur={() => {
          // A keyboard lift is bound to the handle that owns the keys — focus leaving it would
          // strand a session nothing can reach.
          if (lifted) {
            rowReorderKeyboard?.cancel();
          }
        }}
        onKeyDown={handleKeyDown}
      >
        <icons.reorderRow size={14} />
      </ActionIcon>
    </Tooltip>
  );
}
