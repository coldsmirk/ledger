import type { RowData } from "@tanstack/react-table";

import type { EditGate } from "./edit-meta";
import type { Cell, Column, Row, TableInstance } from "./types";

/**
 * What the last committed render resolved, kept where a later render cannot rewrite it.
 *
 * TanStack v9's `useTable` calls `table_setOptions` during render (see its source), so the one
 * shared core instance carries whatever the most recent render pass wrote — including a pass React
 * threw away, which happens whenever a transition renders and a sibling suspends. Everything the
 * core derives from those options follows: `getRow` and the row models, `getAllLeafColumns` and
 * every `columnDef` on them, and `options.meta.ledger`. The wrapper `useTable` returns is safe (its
 * `options` is that render's own object), but its methods delegate to the core, so reaching through
 * one at event time reaches the last render rather than the last commit.
 *
 * So ledger resolves its own answers from here instead: rows, columns and the editing gate as the
 * render that reached the screen left them. Mirrored in an insertion effect — the commit phase, and
 * before every layout effect, so a session boundary or an editor registration already sees it.
 *
 * The boundary this does *not* claim: the TanStack objects handed to the application (`row`,
 * `column` in a commit payload) are the ones that render resolved, not reconstructions — and
 * nothing here fixes the upstream mutation itself, only ledger's own reliance on it.
 */
import { useCallback, useMemo, useRef } from "react";

import { canEditWith } from "./edit-meta";

type ColumnEdit = NonNullable<Cell<any, unknown>["column"]["columnDef"]["meta"]>["edit"];

export type CaptureCommitted<TData extends RowData> = (table: TableInstance<TData>, gate: EditGate) => void;

export interface CommittedTable {
  /**
   * The row as the committed render resolved it — `original` included, which is what a commit
   * departs from.
   */
  row: (rowId: string) => Row<any> | null;
  /**
   * That row's value for a column, through the committed accessor.
   */
  value: (rowId: string, columnId: string) => unknown;
  /**
   * The committed `meta.edit`, never `cell.column.columnDef.meta` — the core rewrites its
   * definitions on every render pass, committed or not.
   */
  edit: (columnId: string) => ColumnEdit;
  /**
   * Whether the committed definitions hold this column at all. A column that left is a layout
   * change; a column whose gate shut is an application closing one, and row mode tells them apart
   * (docs/editing.md#row-mode).
   */
  has: (columnId: string) => boolean;
  /**
   * Every leaf column of the committed definitions, in their own order — the order
   * `row.getAllCells()` walks.
   */
  columnIds: () => string[];
  canEdit: (rowId: string, columnId: string) => boolean;
  enableEditing: () => boolean;
  /**
   * The committed TanStack column, for the payload handed to the application.
   */
  column: (columnId: string) => Column<any, unknown> | null;
}

interface Snapshot {
  rows: Record<string, Row<any>>;
  coreRows: Record<string, Row<any>>;
  columns: Map<string, Column<any, unknown>>;
  columnIds: string[];
  enableEditing: boolean;
  hasCommitHandler: boolean;
}

const EMPTY: Snapshot = {
  columnIds: [],
  columns: new Map(),
  coreRows: {},
  enableEditing: false,
  hasCommitHandler: false,
  rows: {}
};

/**
 * Returns the readers and the one function that fills them. Taking the snapshot is deliberately
 * the caller's move: the table instance only exists further down `useDataTable`, while the session
 * controllers that read this are built before it — so the readers are handed out first and the
 * capture happens in the same insertion effect that mirrors the instance itself.
 */
export function useCommittedTable<TData extends RowData>(): readonly [CommittedTable, CaptureCommitted<TData>] {
  const snapshot = useRef<Snapshot>(EMPTY);

  const capture = useCallback<CaptureCommitted<TData>>((table, gate) => {
    const columns = new Map<string, Column<any, unknown>>();
    const columnIds: string[] = [];

    for (const column of table.getAllLeafColumns() as Array<Column<any, unknown>>) {
      columns.set(column.id, column);
      columnIds.push(column.id);
    }

    snapshot.current = {
      columnIds,
      columns,
      // The same two models `table_getRow(id, true)` consults, in the same order, read here where
      // the options behind them are still the ones this commit rendered from.
      coreRows: table.getCoreRowModel().rowsById as Record<string, Row<any>>,
      enableEditing: gate.enableEditing,
      hasCommitHandler: gate.hasCommitHandler,
      rows: table.getPrePaginatedRowModel().rowsById as Record<string, Row<any>>
    };
  }, []);

  // Stable identities: this goes to the session controllers, which memoize against it.
  const row = useCallback((rowId: string) => snapshot.current.rows[rowId] ?? snapshot.current.coreRows[rowId] ?? null, []);
  const column = useCallback((columnId: string) => snapshot.current.columns.get(columnId) ?? null, []);
  const has = useCallback((columnId: string) => snapshot.current.columns.has(columnId), []);
  const columnIds = useCallback(() => snapshot.current.columnIds, []);
  const edit = useCallback((columnId: string) => snapshot.current.columns.get(columnId)?.columnDef.meta?.edit, []);
  const enableEditingNow = useCallback(() => snapshot.current.enableEditing, []);

  const value = useCallback((rowId: string, columnId: string) => {
    const found = snapshot.current.rows[rowId] ?? snapshot.current.coreRows[rowId] ?? null;

    // The committed column's accessor over the committed row, rather than `row.getValue` — which
    // resolves the column through `row.table`, and that is the shared core. Upstream caches a
    // row's values after the first read, so in most orders the two agree; depending on that is
    // depending on having read the value already, which nothing here can promise.
    return found === null ? undefined : snapshot.current.columns.get(columnId)?.accessorFn?.(found.original, found.index);
  }, []);

  const canEdit = useCallback((rowId: string, columnId: string) => {
    const found = snapshot.current.rows[rowId] ?? snapshot.current.coreRows[rowId] ?? null;

    if (!found) {
      return false;
    }

    return canEditWith(found, snapshot.current.columns.get(columnId)?.columnDef.meta?.edit, {
      enableEditing: snapshot.current.enableEditing,
      hasCommitHandler: snapshot.current.hasCommitHandler
    });
  }, []);

  const committed = useMemo(
    () => {
      return {
        canEdit,
        column,
        columnIds,
        edit,
        enableEditing: enableEditingNow,
        has,
        row,
        value
      };
    },
    [canEdit, column, columnIds, edit, enableEditingNow, has, row, value]
  );

  return [committed, capture] as const;
}
