import type { ExpandedState, RowData, RowSelectionState } from "@tanstack/react-table";

import type { SelectionRules } from "./toggle-fns";
import type { Row, TableInstance } from "./types";
import type { SliceSetter } from "./use-slice";

/**
 * Selection and expansion, answered from the render that reached the screen.
 *
 * Both features decide half of a toggle outside the updater they hand the state setter, and that
 * half reads the shared core (`toggle-fns.ts`). So the controls call these controllers instead:
 * the row objects, the display order and the rules all come from a snapshot taken in an
 * **insertion effect** — the commit phase — and the write goes through the stable slice setter,
 * whose own updater still resolves against the committed value.
 *
 * The controllers are stable for the life of the instance, which is what lets a cell reach one
 * through whatever route it has (a context field, `meta.ledger`) without that route deciding
 * anything.
 */
import { useCallback, useMemo, useRef } from "react";

import {
  nextAllSelection,
  nextExpanded,
  nextPageSelection,
  nextRangeSelection,
  nextRowSelection
} from "./toggle-fns";

export interface LedgerSelectionController {
  /**
   * One checkbox. `range` is the modifier the event carried — a Shift range departs from the
   * last row this table toggled and covers the display order on screen.
   */
  toggle: (row: Row<any>, checked: boolean, range: boolean) => void;
  toggleAll: (scope: "page" | "all", value: boolean) => void;
}

export interface LedgerExpansionController {
  /**
   * `expanded` and `canExpand` are the drawing render's answers — what the chevron shows is what
   * clicking it departs from.
   */
  toggle: (rowId: string, expanded: boolean, canExpand: boolean) => void;
  toggleAll: (value: boolean, canSomeExpand: boolean) => void;
}

interface RowSnapshot {
  /**
   * `getRowsInDisplayOrder()` — what a Shift range walks and what `getDisplayIndex` counts.
   */
  displayOrder: Array<Row<any>>;
  pageRows: Array<Row<any>>;
  /**
   * The pre-grouped flat rows a select-all over every row visits.
   */
  flatRows: Array<Row<any>>;
  rowsById: Record<string, Row<any>>;
  /**
   * Resolved on demand: only an `expanded === true` table has to materialize the map, and a
   * per-commit walk of every row would be O(rows) on a table sized for virtualization.
   */
  expandableRowIds: () => string[];
  rules: SelectionRules;
  rangeEnabled: boolean;
}

const ALWAYS = () => true;

const EMPTY: RowSnapshot = {
  displayOrder: [],
  expandableRowIds: () => [],
  flatRows: [],
  pageRows: [],
  rangeEnabled: true,
  rowsById: {},
  rules: {
    canMultiSelect: ALWAYS,
    canSelect: ALWAYS,
    canSelectSubRows: ALWAYS
  }
};

/**
 * `boolean | (row) => boolean | undefined`, resolved once against the committed options.
 */
function rule(option: unknown): (row: Row<any>) => boolean {
  if (typeof option === "function") {
    return row => (option as (row: Row<any>) => boolean)(row) === true;
  }

  return () => option !== false;
}

export type CaptureRows<TData extends RowData> = (table: TableInstance<TData>) => void;

export function useRowCommands<TData extends RowData>(
  setRowSelection: SliceSetter<RowSelectionState>,
  setExpanded: SliceSetter<ExpandedState>
): readonly [LedgerSelectionController, LedgerExpansionController, CaptureRows<TData>] {
  const snapshot = useRef<RowSnapshot>(EMPTY);
  /**
   * The Shift anchor. v9 keeps it on the core instance (`_lastSelectedRowId`), which is the one
   * object a discarded render also writes.
   */
  const anchorId = useRef<string | null>(null);

  const capture = useCallback<CaptureRows<TData>>(table => {
    const { options } = table;
    const canExpand = (row: Row<any>): boolean => options.getRowCanExpand?.(row as never) ?? ((options.enableExpanding ?? true) && row.subRows.length > 0);
    const rowModelRows = table.getRowModel().rowsById as Record<string, Row<any>>;

    // Every read here is an identity check on a memoized answer, so a commit costs O(1). The
    // display order in particular is memoized upstream on the three things that move it — the
    // pre-paginated rows, `paginateExpandedRows`, and `expanded` in the mode that interleaves
    // descendants — so an unrelated state tick never walks the rows (a guardrail test pins it).
    snapshot.current = {
      displayOrder: table.getRowsInDisplayOrder() as Array<Row<any>>,
      expandableRowIds: () => Object.values(rowModelRows).filter(row => canExpand(row)).map(row => row.id),
      flatRows: table.getPreGroupedRowModel().flatRows as Array<Row<any>>,
      pageRows: table.getRowModel().rows as Array<Row<any>>,
      rangeEnabled: options.enableRowRangeSelection !== false,
      rowsById: table.getCoreRowModel().rowsById as Record<string, Row<any>>,
      rules: {
        canMultiSelect: rule(options.enableMultiRowSelection),
        canSelect: rule(options.enableRowSelection),
        canSelectSubRows: rule(options.enableSubRowSelection)
      }
    };
  }, []);

  const selection = useMemo<LedgerSelectionController>(
    () => {
      return {
        toggle: (row, checked, range) => {
          const {
            displayOrder,
            rules,
            rangeEnabled
          } = snapshot.current;

          if (!rules.canSelect(row)) {
            return;
          }

          const anchor = anchorId.current;
          const anchorIndex = anchor === null ? -1 : displayOrder.findIndex(candidate => candidate.id === anchor);
          const rowIndex = displayOrder.findIndex(candidate => candidate.id === row.id);
          const rangeRow = displayOrder[rowIndex];

          // Both endpoints must still be in the order on screen and both must accept company,
          // or the interaction falls back to an ordinary toggle — v9's own conditions.
          const asRange
            = range
              && rangeEnabled
              && anchorIndex !== -1
              && rowIndex !== -1
              && rangeRow !== undefined
              && rules.canMultiSelect(displayOrder[anchorIndex] as Row<any>)
              && rules.canMultiSelect(row);

          if (asRange) {
            setRowSelection(previous => nextRangeSelection(
              previous,
              displayOrder,
              {
                anchorIndex,
                rowIndex,
                value: checked
              },
              rules
            ));
          } else {
            setRowSelection(previous => nextRowSelection(previous, row, checked, rules));
          }

          anchorId.current = row.id;
        },
        toggleAll: (scope, value) => {
          const {
            pageRows,
            flatRows,
            rowsById,
            rules
          } = snapshot.current;
          anchorId.current = null;

          setRowSelection(previous => scope === "page"
            ? nextPageSelection(previous, pageRows, value, rules)
            : nextAllSelection(previous, flatRows, rowsById, value, rules));
        }
      };
    },
    [setRowSelection]
  );

  const expansion = useMemo<LedgerExpansionController>(
    () => {
      return {
        toggle: (rowId, expanded, canExpand) => {
          const target = !expanded;

          if (target && !canExpand) {
            return;
          }

          setExpanded(previous => nextExpanded(previous, rowId, target, snapshot.current.expandableRowIds));
        },
        toggleAll: (value, canSomeExpand) => {
          if (value && !canSomeExpand) {
            return;
          }

          setExpanded(() => value ? true : Object.create(null) as ExpandedState);
        }
      };
    },
    [setExpanded]
  );

  return [selection, expansion, capture] as const;
}
