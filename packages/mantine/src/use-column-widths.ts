import type { Column, Table } from "@tanstack/react-table";

/**
 * The width engine (docs/sizing.md): every visible leaf column resolves to an exact integer
 * pixel width, so the rendered width, the specified width, and the pinned-offset basis are one
 * number system — the browser never redistributes anything.
 *
 * Rules, in order:
 * - a column with an explicit width (user-resized `columnSizing` entry, else the author's
 * `size`, else `defaultColumn.size`) is fixed at that width, clamped to its declared min/max;
 * - a column without one is a grow column with basis `minSize ?? 80`; container surplus is
 * distributed proportionally to the bases (integer floor, remainder to the first grow
 * column), and when the container is too small every grow column falls back to its basis
 * and the table overflows into horizontal scroll;
 * - with no grow columns at all, surplus distributes proportionally over every column, so the
 * table still fills its viewport exactly.
 *
 * Author sizing comes from the raw-definition registry (`rawColumnSizing`), never from
 * `column.columnDef` — TanStack merges `size: 150, minSize: 20` defaults into every resolved
 * definition, which would make "unsized" unrepresentable.
 */
import { useCallback, useLayoutEffect, useMemo, useState } from "react";

import { rawColumnSizing } from "./build-columns";

/**
 * Grow basis for columns that declare neither `size` nor `minSize`.
 */
const DEFAULT_FLEX_BASIS = 80;

export interface ColumnWidthSpec {
  id: string;
  size: number | undefined;
  minSize: number | undefined;
  maxSize: number | undefined;
}

export interface ColumnWidths {
  /**
   * Resolved width per visible leaf column id, integer pixels.
   */
  byId: Record<string, number>;
  /**
   * Sum of all resolved widths — the exact table width.
   */
  total: number;
}

function clampWidth(value: number, min: number | undefined, max: number | undefined): number {
  return Math.min(Math.max(value, min ?? 0), max ?? Number.MAX_SAFE_INTEGER);
}

export function resolveColumnWidths(
  columns: ColumnWidthSpec[],
  columnSizing: Record<string, number>,
  availableWidth: number
): ColumnWidths {
  const byId: Record<string, number> = {};
  const growColumns: Array<{ id: string; basis: number }> = [];
  let fixedTotal = 0;
  let basisTotal = 0;

  for (const column of columns) {
    const sized = columnSizing[column.id] ?? column.size;

    if (sized === undefined) {
      const basis = Math.round(column.minSize ?? DEFAULT_FLEX_BASIS);
      growColumns.push({ id: column.id, basis });
      basisTotal += basis;
    } else {
      const fixed = clampWidth(Math.round(sized), column.minSize, column.maxSize);
      byId[column.id] = fixed;
      fixedTotal += fixed;
    }
  }

  const surplus = availableWidth - fixedTotal - basisTotal;

  if (growColumns.length > 0) {
    if (surplus > 0) {
      // Weighted distribution; the first grow column absorbs the integer remainder.
      let distributed = 0;

      for (const [index, grow] of growColumns.entries()) {
        if (index === 0) {
          continue;
        }

        const share = Math.floor((surplus * grow.basis) / basisTotal);
        byId[grow.id] = grow.basis + share;
        distributed += share;
      }

      const first = growColumns[0]!;
      byId[first.id] = first.basis + surplus - distributed;
    } else {
      for (const grow of growColumns) {
        byId[grow.id] = grow.basis;
      }
    }
  } else if (surplus > 0 && fixedTotal > 0) {
    // No grow columns: spread the surplus proportionally so the table still fills exactly,
    // instead of leaving a dead gap (all-fixed sets keep their ratios).
    let distributed = 0;
    let firstId: string | null = null;

    for (const column of columns) {
      if (firstId === null) {
        firstId = column.id;
        continue;
      }

      const share = Math.floor((surplus * byId[column.id]!) / fixedTotal);
      byId[column.id]! += share;
      distributed += share;
    }

    if (firstId !== null) {
      byId[firstId]! += surplus - distributed;
    }
  }

  let total = 0;

  for (const column of columns) {
    total += byId[column.id] ?? 0;
  }

  return { byId, total };
}

/**
 * Resolve `tableMinWidth` to pixels. Numbers are pixels; strings are resolved through the
 * body table's computed style (the browser turns rem/em into px there).
 */
function minWidthPx(tableMinWidth: number | string | undefined, viewport: HTMLElement | null): number {
  if (tableMinWidth === undefined) {
    return 0;
  }

  if (typeof tableMinWidth === "number") {
    return tableMinWidth;
  }

  const tableElement = viewport?.querySelector("table");

  if (!tableElement) {
    // eslint-disable-next-line unicorn/prefer-number-coercion -- parses CSS lengths ("60rem"); Number() would yield NaN
    return Number.parseFloat(tableMinWidth) || 0;
  }

  // eslint-disable-next-line unicorn/prefer-number-coercion -- parses the computed "123px" string; Number() would yield NaN
  return Number.parseFloat(getComputedStyle(tableElement).minWidth) || 0;
}

export function useColumnWidths<TData>(
  table: Table<TData>,
  /**
   * Visible leaf columns in DISPLAY order (pinned-aware) — the same order the colgroup renders.
   */
  columns: Array<Column<TData, unknown>>,
  viewport: HTMLDivElement | null,
  tableMinWidth: number | string | undefined
): ColumnWidths {
  const [availableWidth, setAvailableWidth] = useState(0);

  const measure = useCallback(() => {
    if (!viewport) {
      return;
    }

    const next = Math.max(viewport.clientWidth, minWidthPx(tableMinWidth, viewport));
    setAvailableWidth(previous => previous === next ? previous : next);
  }, [viewport, tableMinWidth]);

  /* Pre-paint measurement: the corrected widths land before the first frame is shown. */
  useLayoutEffect(() => {
    measure();

    if (!viewport) {
      return;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);

    return () => observer.disconnect();
  }, [viewport, measure]);

  const { columnSizing } = table.getState();
  const { defaultColumn } = table.options;

  const resolved = useMemo(
    () => {
      const specs = columns.map<ColumnWidthSpec>(column => {
        const raw = rawColumnSizing(column.columnDef);

        return {
          id: column.id,
          size: raw ? raw.size ?? defaultColumn?.size : column.columnDef.size,
          minSize: raw ? raw.minSize ?? defaultColumn?.minSize : column.columnDef.minSize,
          maxSize: raw ? raw.maxSize ?? defaultColumn?.maxSize : column.columnDef.maxSize
        };
      });

      return resolveColumnWidths(specs, columnSizing, availableWidth);
    },
    [columns, columnSizing, availableWidth, defaultColumn]
  );

  /* Stable identity while the numbers are unchanged — downstream memos depend on it. */
  const signature = `${resolved.total}|${Object.entries(resolved.byId)
    .map(([id, width]) => `${id}:${width}`)
    .join(",")}`;

  // eslint-disable-next-line @eslint-react/exhaustive-deps -- `signature` fully encodes `resolved`
  return useMemo(() => resolved, [signature]);
}
