import type { RowData } from "@tanstack/react-table";

import type { ColumnDef } from "./types";

/**
 * Breakpoint-driven column presence (`meta.hiddenFrom` / `meta.visibleFrom`, the host's own
 * `Box` vocabulary): a hidden column is removed from the definitions before TanStack sees
 * them, so the width engine, the colgroup, and the columns panel all follow — column state
 * keyed by id (`columnVisibility`, persistence) is untouched and reapplies when the column
 * returns.
 *
 * Breakpoint values resolve from Mantine's published CSS variables
 * (`--mantine-breakpoint-*`), falling back to the stock scale — no theme-context dependency,
 * so hook mode works wherever `useDataTable` does. Without `matchMedia` (SSR, jsdom) every
 * column stays visible.
 */
import { useEffect, useMemo, useState } from "react";

const STOCK_BREAKPOINTS: Record<string, string> = {
  xs: "36em",
  sm: "48em",
  md: "62em",
  lg: "75em",
  xl: "88em"
};

function breakpointValue(breakpoint: string): string {
  if (typeof document !== "undefined") {
    const fromTheme = getComputedStyle(document.documentElement)
      .getPropertyValue(`--mantine-breakpoint-${breakpoint}`)
      .trim();

    if (fromTheme !== "") {
      return fromTheme;
    }
  }

  return STOCK_BREAKPOINTS[breakpoint] ?? breakpoint;
}

function collectBreakpoints<TData extends RowData>(columns: Array<ColumnDef<TData, any>>, into: Set<string>): void {
  for (const column of columns) {
    if ("columns" in column && Array.isArray(column.columns)) {
      collectBreakpoints(column.columns, into);
      continue;
    }

    if (column.meta?.hiddenFrom) {
      into.add(column.meta.hiddenFrom);
    }

    if (column.meta?.visibleFrom) {
      into.add(column.meta.visibleFrom);
    }
  }
}

function filterColumns<TData extends RowData>(
  columns: Array<ColumnDef<TData, any>>,
  matches: Record<string, boolean>
): Array<ColumnDef<TData, any>> {
  const result: Array<ColumnDef<TData, any>> = [];

  for (const column of columns) {
    if ("columns" in column && Array.isArray(column.columns)) {
      const children = filterColumns(column.columns, matches);

      // A group whose every child is off-breakpoint disappears with them.
      if (children.length > 0) {
        result.push(children === column.columns
          ? column
          // The ledger alias re-attaches `enableResizing`, which the group's TanStack-typed
          // `columns` slot does not carry — the assertion re-enters the alias.
          : { ...column, columns: children } as ColumnDef<TData, any>);
      }

      continue;
    }

    const { hiddenFrom, visibleFrom } = column.meta ?? {};

    // Host semantics: hiddenFrom hides AT AND ABOVE the breakpoint, visibleFrom shows only
    // there. An unknown match (no matchMedia) resolves to visible.
    if (hiddenFrom && matches[hiddenFrom] === true) {
      continue;
    }

    if (visibleFrom && matches[visibleFrom] === false) {
      continue;
    }

    result.push(column);
  }

  return result;
}

export function useResponsiveColumns<TData extends RowData>(
  columns: Array<ColumnDef<TData, any>>
): Array<ColumnDef<TData, any>> {
  const breakpointsKey = useMemo(() => {
    const used = new Set<string>();
    collectBreakpoints(columns, used);

    return [...used].toSorted().join(",");
  }, [columns]);

  const [matches, setMatches] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (breakpointsKey === "" || typeof matchMedia !== "function") {
      setMatches(previous => Object.keys(previous).length === 0 ? previous : {});

      return;
    }

    const queries = breakpointsKey.split(",").map(breakpoint => {
      const query = matchMedia(`(min-width: ${breakpointValue(breakpoint)})`);
      const apply = () => setMatches(previous => previous[breakpoint] === query.matches
        ? previous
        : { ...previous, [breakpoint]: query.matches });

      apply();
      query.addEventListener("change", apply);

      return { query, apply };
    });

    return () => {
      for (const { query, apply } of queries) {
        query.removeEventListener("change", apply);
      }
    };
  }, [breakpointsKey]);

  return useMemo(() => {
    if (breakpointsKey === "") {
      return columns;
    }

    const filtered = filterColumns(columns, matches);

    // Identity-preserving when nothing is filtered out, so downstream memos stay cold.
    return filtered.length === columns.length && filtered.every((column, index) => column === columns[index])
      ? columns
      : filtered;
  }, [columns, matches, breakpointsKey]);
}
