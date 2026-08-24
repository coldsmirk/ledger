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
 * Measurement forces `white-space: nowrap` on every cell first and reads afterwards, so the
 * whole pass costs one reflow. Truncating cells clip their own overflow (the td never grows),
 * so the content width is read from the `[data-truncate]` span instead of the cell box.
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

function bodyCellWidth(cell: HTMLElement): number {
  const truncated = cell.querySelector<HTMLElement>(":scope [data-truncate]");

  return truncated
    ? truncated.scrollWidth + horizontalPadding(cell)
    : cell.scrollWidth;
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
  const bodyCells = [...main.querySelectorAll<HTMLElement>(`:scope .ledger-tbody ${selector}`)];
  // A footer cell that spans columns says nothing about the width of any one of them.
  const footerCells = [...main.querySelectorAll<HTMLElement>(`:scope .ledger-footer ${selector}`)]
    .filter(cell => (cell as HTMLTableCellElement).colSpan <= 1);
  const contentCells = [...bodyCells, ...footerCells];
  const cells = headerCell ? [headerCell, ...contentCells] : contentCells;

  if (cells.length === 0) {
    return;
  }

  // Write phase, then read phase — the forced nowrap costs one reflow for the whole column.
  const previousWhitespace = cells.map(cell => cell.style.whiteSpace);

  for (const cell of cells) {
    cell.style.whiteSpace = "nowrap";
  }

  let content = headerCell ? headerCellWidth(headerCell, hasFilter) : 0;

  for (const cell of contentCells) {
    content = Math.max(content, bodyCellWidth(cell));
  }

  for (const [index, cell] of cells.entries()) {
    cell.style.whiteSpace = previousWhitespace[index] ?? "";
  }

  const next = Math.min(Math.max(Math.round(content + AUTOSIZE_SLACK_PX), minSize), maxSize);

  setColumnSizing(previous => previous[columnId] === next ? previous : { ...previous, [columnId]: next });
}
