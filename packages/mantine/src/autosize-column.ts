import type { ColumnSizingState } from "@tanstack/react-table";

import type { ResizerSpec } from "./use-column-resize";

/**
 * Fit a column to its rendered content (the resizer's double-click). Measures the header cell,
 * every RENDERED body cell of the column — under virtualization that is the current window, which
 * is the industry contract for autosize (unrendered rows have no boxes to measure) — and the
 * footer cell, which is rendered content the column has to hold like any other. Writes the result
 * through `columnSizing`, clamped like an interactive resize.
 *
 * The column, its constraints and whether it carries a filter all arrive from the render that put
 * the handle on screen, for the reason `use-column-resize.ts` gives.
 *
 * A content cell is measured out of the table's layout: for the pass it is a block as wide as its
 * content (`display: block; width: max-content`, no wrapping), so its width is the content's, in
 * whichever direction that lies. Read in place, a cell is never narrower than its column — a fixed
 * table lays every cell at the column's width, and a truncating span clips at it — so a fit could
 * only ever widen a column. Every cell is switched first and read afterwards, so the whole pass
 * costs one reflow, and each gets its own inline styles back before anything paints.
 */

/**
 * Breathing room over the tightest fit — content flush against the column edge reads clipped.
 */
const AUTOSIZE_SLACK_PX = 8;

/**
 * Reserved for the hover-revealed header actions overlay (the filter button) so autosize does
 * not park the drag line underneath it.
 */
const HEADER_ACTIONS_ALLOWANCE_PX = 28;

/**
 * Computed lengths always resolve to `Npx`; strip the unit before coercing.
 */
function asPx(value: string): number {
  return Number(value.replace("px", "")) || 0;
}

function horizontalPadding(element: HTMLElement): number {
  const style = getComputedStyle(element);

  return asPx(style.paddingInlineStart) + asPx(style.paddingInlineEnd);
}

function headerCellWidth(th: HTMLElement, hasFilter: boolean): number {
  // The label's truncate span clips its own overflow, so the th box never reports the full
  // text — read the span, then re-add the chrome around it.
  const labelText = th.querySelector<HTMLElement>(":scope .ledger-header-label [data-truncate]");

  if (!labelText) {
    return th.scrollWidth;
  }

  const indicator = th.querySelector<HTMLElement>(":scope .ledger-sort-indicator");
  const indicatorWidth = indicator ? indicator.offsetWidth + 6 : 0;

  return labelText.scrollWidth
    + indicatorWidth
    + horizontalPadding(th)
    + (hasFilter ? HEADER_ACTIONS_ALLOWANCE_PX : 0);
}

export interface AutosizeSpec extends Pick<ResizerSpec, "columnId" | "minSize" | "maxSize"> {
  /**
   * The column carries a filter control, so the header reserves room for the hover overlay.
   */
  hasFilter: boolean;
}

export function autosizeColumn(
  setColumnSizing: (updater: (previous: ColumnSizingState) => ColumnSizingState) => void,
  {
    columnId,
    minSize,
    maxSize,
    hasFilter
  }: AutosizeSpec,
  main: HTMLElement
): void {
  const selector = `[data-ledger-column-id="${CSS.escape(columnId)}"]`;
  const headerCell = main.querySelector<HTMLElement>(`:scope .ledger-header ${selector}`);
  // A cell that spans columns — a merged body cell, a footer total — says nothing about the width
  // of any one of them.
  const contentCells = [...main.querySelectorAll<HTMLTableCellElement>(`:scope :is(.ledger-tbody, .ledger-footer) ${selector}`)]
    .filter(cell => cell.colSpan <= 1);
  const cells = headerCell ? [headerCell, ...contentCells] : contentCells;

  if (cells.length === 0) {
    return;
  }

  // Write phase, then read phase — the whole column costs one reflow.
  const previous = cells.map(cell => {
    return {
      display: cell.style.display,
      whiteSpace: cell.style.whiteSpace,
      width: cell.style.width
    };
  });

  for (const cell of cells) {
    cell.style.whiteSpace = "nowrap";
  }

  for (const cell of contentCells) {
    cell.style.display = "block";
    cell.style.width = "max-content";
  }

  let content = headerCell ? headerCellWidth(headerCell, hasFilter) : 0;

  for (const cell of contentCells) {
    content = Math.max(content, cell.scrollWidth);
  }

  for (const [index, cell] of cells.entries()) {
    const styles = previous[index];

    cell.style.display = styles?.display ?? "";
    cell.style.whiteSpace = styles?.whiteSpace ?? "";
    cell.style.width = styles?.width ?? "";
  }

  const next = Math.min(Math.max(Math.round(content + AUTOSIZE_SLACK_PX), minSize), maxSize);

  setColumnSizing(previous => previous[columnId] === next ? previous : { ...previous, [columnId]: next });
}
