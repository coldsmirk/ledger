import type { ColumnSizingState, RowData } from "@tanstack/react-table";

import type { AutosizeTarget } from "./column-autosize";
import type { Column, Row } from "./types";

/**
 * `meta.autosize` (docs/sizing.md#autosize): keeps each such column fitted to its rendered content
 * and hands the width engine the fits, which rank between a user's resize and the author's `size`.
 *
 * When a fit is taken, and what it may do:
 * - **A new view refits.** Different rows (a new page, a filter, a sort — anything that changes the
 * row ids or their order), new column definitions (a renderer, a translated header) or another
 * set of visible columns, another density, or a web font that finished loading: the content is
 * new, so the widths follow it in both directions.
 * - **The same rows again only widen.** A refetch that hands back the same rows (a poll, an
 * edit) may make a cell wider, never a column narrower — otherwise a value that alternates
 * between short and long would shake the columns on every refresh.
 * - **Content that arrives with a window only widens, once the scrolling settles.** Under
 * virtualization the rows and columns scrolled into view were never measured; fitting them on
 * every window shift would reflow the table each step of a scroll, and narrowing would move the
 * columns under the reader.
 * - **A table with no layout waits for one.** In a hidden tab or a collapsed panel every cell
 * measures zero; the fit is taken when the table is first laid out instead.
 *
 * A fit is taken in a layout effect, before the browser paints, so a refit never shows the old
 * widths for a frame; a column a user resized is left to the user's width and not measured.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { isInternalColumn } from "./build-columns";
import { measureColumnWidths } from "./column-autosize";
import { useEventCallback } from "./utils";

/**
 * How long a scroll has to rest before the content it brought into view is fitted.
 */
const SCROLL_SETTLE_MS = 150;

const NO_WIDTHS: Readonly<Record<string, number>> = {};

type FitMode = "refit" | "widen";

export interface AutosizeWidthsInput<TData extends RowData> {
  /**
   * Visible leaf columns in display order, a new array only when the definitions or the visible
   * set change.
   */
  columns: ReadonlyArray<Column<TData, unknown>>;
  columnSizing: ColumnSizingState;
  /**
   * The `.ledger-main` element the header, body and footer render in.
   */
  main: HTMLElement | null;
  /**
   * The body's scroll viewport.
   */
  viewport: HTMLElement | null;
  /**
   * The rows the body renders (the row model's) — their ids decide whether a change of data is a
   * new view.
   */
  rows: ReadonlyArray<Row<TData>>;
  /**
   * Anything else that changes what a cell looks like at the same data — the table's density.
   */
  appearance: string;
  /**
   * Rows or columns render in a window, so scrolling brings unmeasured content into view.
   */
  virtualized: boolean;
}

function autosizeTargets<TData extends RowData>(
  columns: ReadonlyArray<Column<TData, unknown>>,
  columnSizing: ColumnSizingState
): AutosizeTarget[] {
  return columns.flatMap(column => {
    const { meta } = column.columnDef;

    return meta?.autosize === true && !isInternalColumn(column.id) && columnSizing[column.id] === undefined
      ? [
          {
            columnId: column.id,
            hasFilter: meta.filter !== undefined,
            truncate: meta.truncate === true
          }
        ]
      : [];
  });
}

function sameIds(previous: readonly string[], next: readonly string[]): boolean {
  return previous.length === next.length && previous.every((id, index) => id === next[index]);
}

/**
 * The fits after a pass: a column measured takes its new width (in `widen` mode, only if wider), a
 * column with nothing rendered keeps the width it had, a column no longer fitted drops out.
 */
function mergeWidths(
  previous: Readonly<Record<string, number>>,
  measured: ReadonlyMap<string, number>,
  targets: readonly AutosizeTarget[],
  mode: FitMode
): Readonly<Record<string, number>> {
  const next: Record<string, number> = {};

  for (const { columnId } of targets) {
    const fresh = measured.get(columnId);
    const held = previous[columnId];
    const width = fresh === undefined || held === undefined ? fresh ?? held : mode === "widen" ? Math.max(held, fresh) : fresh;

    if (width !== undefined) {
      next[columnId] = width;
    }
  }

  const keys = Object.keys(next);
  const unchanged = keys.length === Object.keys(previous).length && keys.every(key => previous[key] === next[key]);

  return unchanged ? previous : next;
}

/**
 * Bumps whenever web fonts finish loading: text measured in a fallback face is the wrong width.
 */
function useFontsVersion(enabled: boolean): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    // Absent outside browsers (jsdom); a typed `FontFaceSet` everywhere else.
    if (!enabled || !("fonts" in document)) {
      return;
    }

    const bump = () => setVersion(previous => previous + 1);

    document.fonts.addEventListener("loadingdone", bump);

    return () => document.fonts.removeEventListener("loadingdone", bump);
  }, [enabled]);

  return version;
}

export function useAutosizeWidths<TData extends RowData>({
  columns,
  columnSizing,
  main,
  viewport,
  rows,
  appearance,
  virtualized
}: AutosizeWidthsInput<TData>): Readonly<Record<string, number>> {
  const targets = autosizeTargets(columns, columnSizing);
  // Most tables fit nothing: they pay for no observer, no listener and no pass over their rows.
  const enabled = targets.length > 0;
  const fontsVersion = useFontsVersion(enabled);
  const signature = JSON.stringify([targets, appearance, fontsVersion]);
  const [widths, setWidths] = useState(NO_WIDTHS);
  const view = useRef<{
    columns: ReadonlyArray<Column<TData, unknown>>;
    signature: string;
    rowIds: readonly string[];
  } | null>(null);
  /**
   * A fit was due while the table had no layout.
   */
  const awaitingLayout = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fit = useEventCallback((mode: FitMode) => {
    if (!main) {
      return;
    }

    if (main.getClientRects().length === 0) {
      awaitingLayout.current = true;

      return;
    }

    awaitingLayout.current = false;

    const measured = measureColumnWidths(main, targets);

    setWidths(previous => mergeWidths(previous, measured, targets, mode));
  });

  const fitWhenSettled = useCallback(() => {
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => fit("widen"), SCROLL_SETTLE_MS);
  }, [fit]);

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  useLayoutEffect(() => {
    if (!enabled) {
      view.current = null;
      setWidths(NO_WIDTHS);

      return;
    }

    const rowIds = rows.map(row => row.id);
    const sameView = view.current !== null
      && view.current.columns === columns
      && view.current.signature === signature
      && sameIds(view.current.rowIds, rowIds);

    view.current = {
      columns,
      signature,
      rowIds
    };
    fit(sameView ? "widen" : "refit");
  }, [enabled, main, columns, rows, signature, fit]);

  // New widths move a column window, which may bring columns into view that were never measured.
  useEffect(() => {
    if (enabled && virtualized && widths !== NO_WIDTHS) {
      fitWhenSettled();
    }
  }, [enabled, virtualized, widths, fitWhenSettled]);

  useEffect(() => {
    if (!enabled || !main) {
      return;
    }

    // A table laid out at last takes the fit it was waiting for; a resize under a window changes
    // what the window holds.
    const observer = new ResizeObserver(() => {
      if (awaitingLayout.current) {
        fit("refit");
      } else if (virtualized) {
        fitWhenSettled();
      }
    });

    observer.observe(main);

    if (!virtualized || !viewport) {
      return () => observer.disconnect();
    }

    viewport.addEventListener("scroll", fitWhenSettled, { passive: true });

    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", fitWhenSettled);
    };
  }, [enabled, main, viewport, virtualized, fit, fitWhenSettled]);

  return widths;
}
