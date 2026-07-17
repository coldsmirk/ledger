import type { Table } from "@tanstack/react-table";

/**
 * Pure edits over TanStack's flat `columnOrder` array, shared by the two affordances that
 * reorder columns: the header drag (`use-column-reorder.ts`) and the columns panel
 * (`columns-panel.tsx`).
 *
 * The flat array is the ONLY thing `columnOrder` governs — a pinned column's position comes from
 * its index inside `columnPinning.left` / `.right` instead (TanStack's `getLeftLeafColumns` maps
 * over that array, while `getCenterLeafColumns` filters the `columnOrder`-sorted leaf list). So
 * reordering the center zone edits `columnOrder`, and reordering a pinned zone edits
 * `columnPinning` — never both.
 */

/**
 * The flat order to edit from: the state order stripped of ids the table no longer defines, with
 * any column it never mentioned appended in definition order. An empty slice means "definition
 * order", which is exactly `getAllLeafColumns()`.
 */
export function resolveColumnOrder<TData>(table: Table<TData>): string[] {
  const leafIds = table.getAllLeafColumns().map(column => column.id);
  const { columnOrder } = table.getState();

  if (columnOrder.length === 0) {
    return leafIds;
  }

  return [
    ...columnOrder.filter(id => leafIds.includes(id)),
    ...leafIds.filter(id => !columnOrder.includes(id))
  ];
}

export interface ColumnDropTarget {
  id: string;
  side: "before" | "after";
}

/**
 * Move `columnId` to sit immediately before or after `target.id`. Returns the input untouched
 * when the target is no longer part of the order.
 */
export function moveColumnBeside(order: string[], columnId: string, target: ColumnDropTarget): string[] {
  const without = order.filter(id => id !== columnId);
  const targetIndex = without.indexOf(target.id);

  if (targetIndex === -1) {
    return order;
  }

  const insertAt = target.side === "before" ? targetIndex : targetIndex + 1;

  return [...without.slice(0, insertAt), columnId, ...without.slice(insertAt)];
}

/**
 * Rewrite the flat order so the center columns read `nextCenterIds`, leaving every pinned column
 * in the slot it already occupies: each center slot takes the next id off the new sequence.
 * Pinned ids keep their flat positions because those positions are inert — a pinned column
 * renders from its `columnPinning` index, not from here.
 */
export function applyCenterOrder(order: string[], nextCenterIds: string[]): string[] {
  const centerIds = new Set(nextCenterIds);
  const queue = [...nextCenterIds];

  return order.map(id => centerIds.has(id) ? queue.shift()! : id);
}
