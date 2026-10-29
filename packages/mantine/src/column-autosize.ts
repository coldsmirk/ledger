import type { ColumnSizingState } from "@tanstack/react-table";

import type { ResizerSpec } from "./use-column-resize";

/**
 * Fitting columns to their rendered content (docs/sizing.md#autosize) — one measurement behind
 * both of its uses: the resizer's double-click, which writes the fit as a `columnSizing` entry,
 * and `meta.autosize`, which keeps a column fitted as its content changes (`use-autosize-widths.ts`).
 *
 * What is measured is what the column has to hold: the header cell, every RENDERED body cell —
 * under virtualization that is the current window, the industry contract for autosize (unrendered
 * rows have no boxes to measure) — and the footer cell, which is rendered content like any other.
 * A cell that spans columns (a merged body cell, a footer total, a detail panel) says nothing about
 * the width of any one of them, and a cell holding an editor is as wide as the editor makes
 * itself, not as its value; neither is measured.
 *
 * A content cell is measured out of the table's layout: for the pass it is a block as wide as its
 * content (`display: block; width: max-content`, no wrapping), so its width is the content's, in
 * whichever direction that lies. Read in place, a cell is never narrower than its column — a fixed
 * table lays every cell at the column's width, and a truncating span clips at it — so a fit could
 * only ever widen a column. Every cell of every column is switched first and read afterwards, so a
 * pass costs one reflow however many columns it fits, and each cell gets its own inline styles back
 * before anything paints.
 */

/**
 * Breathing room over the tightest fit — content flush against the column edge reads clipped.
 */
const AUTOSIZE_SLACK_PX = 8;

/**
 * Reserved for the hover-revealed header actions overlay (the filter button) so a fit does not
 * park the drag line underneath it.
 */
const HEADER_ACTIONS_ALLOWANCE_PX = 28;

/**
 * Tukey's fence: a value past the third quartile by more than this many interquartile ranges is an
 * outlier. 1.5 is Tukey's own constant and MUI X's `outliersFactor` default.
 */
const OUTLIER_FACTOR = 1.5;

export interface AutosizeTarget {
  columnId: string;
  /**
   * The column carries a filter control, so the header reserves room for the hover overlay.
   */
  hasFilter: boolean;
  /**
   * The column clips with an ellipsis and a tooltip (`meta.truncate`), so its body fits its typical
   * content and leaves the outliers to the ellipsis. Every other column fits its widest cell: with
   * nothing to say what was cut, a clipped badge or figure is information lost.
   */
  truncate: boolean;
}

/**
 * Linear interpolation between closest ranks (Hyndman–Fan type 7, the spreadsheet and NumPy
 * default) over ascending `sorted`.
 */
function quantile(sorted: readonly number[], p: number): number {
  const rank = (sorted.length - 1) * p;
  const lower = Math.floor(rank);
  const below = sorted[lower]!;
  const above = sorted[Math.min(lower + 1, sorted.length - 1)]!;

  return below + (rank - lower) * (above - below);
}

/**
 * The widest of `values` within Tukey's upper fence (Q3 + 1.5 × IQR) — the width that holds every
 * value but the outliers. A set too uniform to have any (IQR 0) fences at its common value, so a
 * single long value among identical ones is still the outlier it reads as.
 */
export function fencedMax(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = values.toSorted((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const fence = q3 + OUTLIER_FACTOR * (q3 - q1);

  return sorted.findLast(value => value <= fence) ?? sorted[0]!;
}

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

interface MeasuredCells {
  target: AutosizeTarget;
  header: HTMLElement | null;
  body: HTMLTableCellElement[];
  footer: HTMLTableCellElement[];
}

function contentCells(main: HTMLElement, region: string, selector: string): HTMLTableCellElement[] {
  return [...main.querySelectorAll<HTMLTableCellElement>(`:scope ${region} ${selector}`)]
    .filter(cell => cell.colSpan <= 1 && !Object.hasOwn(cell.dataset, "editing"));
}

/**
 * The width each target's rendered content needs, slack included, in integer pixels — before the
 * column's own `minSize`/`maxSize`, which are the caller's to apply. A column with nothing rendered
 * (one a column window left out) has no entry.
 */
export function measureColumnWidths(main: HTMLElement, targets: readonly AutosizeTarget[]): Map<string, number> {
  const columns: MeasuredCells[] = targets.map(target => {
    const selector = `[data-ledger-column-id="${CSS.escape(target.columnId)}"]`;

    return {
      target,
      header: main.querySelector<HTMLElement>(`:scope .ledger-header ${selector}`),
      body: contentCells(main, ".ledger-tbody", selector),
      footer: contentCells(main, ".ledger-footer", selector)
    };
  });
  const headers = columns.map(column => column.header).filter(header => header !== null);
  const contents = columns.flatMap(column => [...column.body, ...column.footer]);
  const cells = [...headers, ...contents];

  // Write phase, then read phase — the whole pass costs one reflow.
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

  for (const cell of contents) {
    cell.style.display = "block";
    cell.style.width = "max-content";
  }

  const widths = new Map<string, number>();

  for (const {
    target,
    header,
    body,
    footer
  } of columns) {
    if (!header && body.length === 0 && footer.length === 0) {
      continue;
    }

    const bodyWidths = body.map(cell => cell.scrollWidth);
    // The header and the footer are one cell each, never a crowd to find outliers in: a fit that
    // clips either is no fit.
    const content = Math.max(
      header ? headerCellWidth(header, target.hasFilter) : 0,
      ...footer.map(cell => cell.scrollWidth),
      target.truncate ? fencedMax(bodyWidths) : Math.max(0, ...bodyWidths)
    );

    widths.set(target.columnId, Math.round(content) + AUTOSIZE_SLACK_PX);
  }

  for (const [index, cell] of cells.entries()) {
    const styles = previous[index];

    cell.style.display = styles?.display ?? "";
    cell.style.whiteSpace = styles?.whiteSpace ?? "";
    cell.style.width = styles?.width ?? "";
  }

  return widths;
}

export interface AutosizeSpec extends AutosizeTarget, Pick<ResizerSpec, "minSize" | "maxSize"> {}

/**
 * The resizer's double-click: fit the column once and write the fit through `columnSizing`, clamped
 * like an interactive resize. The column, its constraints and whether it carries a filter all
 * arrive from the render that put the handle on screen, for the reason `use-column-resize.ts` gives.
 */
export function autosizeColumn(
  setColumnSizing: (updater: (previous: ColumnSizingState) => ColumnSizingState) => void,
  {
    minSize,
    maxSize,
    ...target
  }: AutosizeSpec,
  main: HTMLElement
): void {
  const fitted = measureColumnWidths(main, [target]).get(target.columnId);

  if (fitted === undefined) {
    return;
  }

  const next = Math.min(Math.max(fitted, minSize), maxSize);

  setColumnSizing(previous => previous[target.columnId] === next ? previous : { ...previous, [target.columnId]: next });
}
