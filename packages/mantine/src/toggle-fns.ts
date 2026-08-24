import type { ExpandedState, RowSelectionState, SortDirection, SortingState } from "@tanstack/react-table";

import type { Row } from "./types";

/**
 * The state a sort, a selection or an expansion toggle produces — TanStack v9's own updater
 * bodies, transcribed as pure functions.
 *
 * v9 computes half of each toggle *outside* the updater it hands the state setter: the next sort
 * direction, whether the row may be selected at all, whether it is currently expanded, the
 * display order a Shift range walks. Those reads go to the shared core, which carries whatever
 * render pass ran last — a pass React discarded included — while the updater's own `old` is
 * correctly the committed value. So the halves disagree, and six measured defects follow
 * (docs/architecture.md).
 *
 * The fix is the shape the resize handle already uses: what a toggle decides with is resolved by
 * the render that drew the control, and the write itself is this module plus the stable slice
 * setter. Nothing here reads `row.table` — only structural row properties (`id`, `subRows`,
 * `parentId`) and the rules its caller resolved.
 *
 * Kept verbatim on purpose, `Object.create(null)` maps included: row ids are opaque application
 * strings, and a plain object literal would let `__proto__` or `constructor` silently fail to
 * become an own key.
 */

function emptyMap<T extends object>(): T {
  return Object.create(null) as T;
}

function hasOwnId(map: Record<string, boolean>, rowId: string): boolean {
  return map[rowId] === true;
}

// ------------------------------------------------------------------------------------------------
// Sorting
// ------------------------------------------------------------------------------------------------

/**
 * Everything a sort click decides with, resolved by the render that drew the header.
 */
export interface SortToggleSpec {
  columnId: string;
  /**
   * `column.getCanMultiSort()` — whether this column may join an existing multi-sort.
   */
  canMultiSort: boolean;
  /**
   * `column.getNextSortingOrder(false)` and `column.getNextSortingOrder(true)`. Both are needed
   * because the cycle's removal step depends on `enableMultiRemove`, and whether the event is a
   * multi-sort event is only known when it arrives.
   */
  nextOrderSingle: SortDirection | false;
  nextOrderMulti: SortDirection | false;
  /**
   * `options.maxMultiSortColCount`, already defaulted.
   */
  maxMultiSortColCount: number;
}

export function nextSorting(old: SortingState, spec: SortToggleSpec, multi: boolean): SortingState {
  const {
    columnId,
    canMultiSort,
    maxMultiSortColCount
  } = spec;
  const nextSortingOrder = multi && canMultiSort ? spec.nextOrderMulti : spec.nextOrderSingle;
  const existingIndex = old.findIndex(entry => entry.id === columnId);
  const existingSorting = existingIndex === -1 ? undefined : old[existingIndex];
  const nextDesc = nextSortingOrder === "desc";
  const isMultiMode = Boolean(old.length > 0 && canMultiSort && multi);

  let sortAction: "add" | "remove" | "replace" | "toggle";

  if (isMultiMode) {
    sortAction = existingSorting ? "toggle" : "add";
  } else {
    sortAction = existingSorting ? "toggle" : "replace";
  }

  if (sortAction === "toggle" && !nextSortingOrder) {
    sortAction = "remove";
  }

  if (sortAction === "add") {
    const newSorting = [...old, { desc: nextDesc, id: columnId }];
    newSorting.splice(0, newSorting.length - maxMultiSortColCount);

    return newSorting;
  }

  if (sortAction === "toggle") {
    return isMultiMode
      ? old.map(entry => entry.id === columnId ? { ...entry, desc: nextDesc } : entry)
      : [{ desc: nextDesc, id: columnId }];
  }

  if (sortAction === "remove") {
    return isMultiMode ? old.filter(entry => entry.id !== columnId) : [];
  }

  return [{ desc: nextDesc, id: columnId }];
}

// ------------------------------------------------------------------------------------------------
// Selection
// ------------------------------------------------------------------------------------------------

/**
 * The three row predicates selection asks, resolved against the committed options rather than
 * against `row.table`. Each mirrors its v9 counterpart, `boolean | (row) => boolean` included.
 */
export interface SelectionRules {
  canSelect: (row: Row<any>) => boolean;
  canMultiSelect: (row: Row<any>) => boolean;
  canSelectSubRows: (row: Row<any>) => boolean;
}

export function mutateRowIsSelected(
  selection: RowSelectionState,
  row: Row<any>,
  value: boolean,
  rules: SelectionRules,
  /**
   * Whether the write cascades into `subRows`. Not a constant: an ordinary row toggle cascades
   * only when the row accepts company, because a single-select row clears the map before it
   * writes itself — so cascading there would leave the last descendant selected instead of the
   * row that was clicked. A range and a select-all always cascade; only their deselect half
   * differs, and that is `respectCanSelectOnDeselect`.
   */
  options: { includeChildren: boolean; respectCanSelectOnDeselect?: boolean }
): void {
  if (value) {
    if (!rules.canMultiSelect(row)) {
      for (const key of Object.keys(selection)) {
        delete selection[key];
      }
    }

    if (rules.canSelect(row)) {
      selection[row.id] = true;
    }
  } else if (!options.respectCanSelectOnDeselect || rules.canSelect(row)) {
    delete selection[row.id];
  }

  if (options.includeChildren && row.subRows.length > 0 && rules.canSelectSubRows(row)) {
    for (const subRow of row.subRows) {
      mutateRowIsSelected(selection, subRow as Row<any>, value, rules, options);
    }
  }
}

export function nextRowSelection(
  old: RowSelectionState,
  row: Row<any>,
  value: boolean,
  rules: SelectionRules
): RowSelectionState {
  const selection = Object.assign(emptyMap<RowSelectionState>(), old);
  mutateRowIsSelected(selection, row, value, rules, { includeChildren: rules.canMultiSelect(row) });

  return selection;
}

/**
 * The inclusive interval between two display-order positions. Non-selectable and
 * non-multi-selectable rows inside it are skipped, exactly as v9 skips them.
 */
export function nextRangeSelection(
  old: RowSelectionState,
  rows: Array<Row<any>>,
  range: { anchorIndex: number; rowIndex: number; value: boolean },
  rules: SelectionRules
): RowSelectionState {
  const {
    anchorIndex,
    rowIndex,
    value
  } = range;
  const selection = Object.assign(emptyMap<RowSelectionState>(), old);
  const start = Math.min(anchorIndex, rowIndex);
  const end = Math.max(anchorIndex, rowIndex);

  for (let index = start; index <= end; index += 1) {
    const rangeRow = rows[index];

    if (rangeRow && rules.canSelect(rangeRow) && rules.canMultiSelect(rangeRow)) {
      mutateRowIsSelected(selection, rangeRow, value, rules, { includeChildren: true });
    }
  }

  return selection;
}

export function nextPageSelection(
  old: RowSelectionState,
  pageRows: Array<Row<any>>,
  value: boolean,
  rules: SelectionRules
): RowSelectionState {
  const selection = Object.assign(emptyMap<RowSelectionState>(), old);

  for (const row of pageRows) {
    mutateRowIsSelected(selection, row, value, rules, { includeChildren: true, respectCanSelectOnDeselect: true });
  }

  return selection;
}

/**
 * Select-all over every row, not just the page. Descent is blocked by any ancestor whose
 * `enableSubRowSelection` says so, which is why the ancestor verdict is walked and cached per
 * pass the way v9 walks it.
 */
export function nextAllSelection(
  old: RowSelectionState,
  flatRows: Array<Row<any>>,
  rowsById: Record<string, Row<any>>,
  value: boolean,
  rules: SelectionRules
): RowSelectionState {
  const selection = Object.assign(emptyMap<RowSelectionState>(), old);

  if (!value) {
    for (const row of flatRows) {
      if (rules.canSelect(row)) {
        delete selection[row.id];
      }
    }

    return selection;
  }

  const cache = new Map<string, boolean>();

  const reachable = (row: Row<any>): boolean => {
    if (!rules.canSelect(row)) {
      return false;
    }

    const visited: string[] = [];
    let selectable = true;
    let currentId = row.parentId;

    while (currentId !== undefined) {
      const known = cache.get(currentId);

      if (known !== undefined) {
        selectable = known;

        break;
      }

      visited.push(currentId);

      const parent = rowsById[currentId];

      if (!parent || !rules.canSelectSubRows(parent)) {
        selectable = false;

        break;
      }

      currentId = parent.parentId;
    }

    for (const id of visited) {
      cache.set(id, selectable);
    }

    return selectable;
  };

  for (const row of flatRows) {
    if (reachable(row)) {
      selection[row.id] = true;
    }
  }

  return selection;
}

// ------------------------------------------------------------------------------------------------
// Expansion
// ------------------------------------------------------------------------------------------------

/**
 * `expanded` is `true` (everything) or a map. Expanding out of `true` has to materialize the map
 * first, which is why the expandable row ids are part of the call.
 */
export function nextExpanded(
  old: ExpandedState,
  rowId: string,
  targetExpanded: boolean,
  expandableRowIds: () => string[]
): ExpandedState {
  const exists = old === true ? true : hasOwnId(old, rowId);
  let oldExpanded: Record<string, boolean>;

  if (old === true) {
    oldExpanded = emptyMap<Record<string, boolean>>();

    for (const id of expandableRowIds()) {
      oldExpanded[id] = true;
    }
  } else {
    oldExpanded = Object.assign(emptyMap<Record<string, boolean>>(), old);
  }

  if (!exists && targetExpanded) {
    oldExpanded[rowId] = true;

    return oldExpanded;
  }

  if (exists && !targetExpanded) {
    const rest = emptyMap<Record<string, boolean>>();

    for (const [id, value] of Object.entries(oldExpanded)) {
      if (id !== rowId && value) {
        rest[id] = true;
      }
    }

    return rest;
  }

  return old;
}
