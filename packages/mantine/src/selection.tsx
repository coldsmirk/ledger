import type { Row, Table } from "@tanstack/react-table";
import type { MouseEvent } from "react";

/**
 * The injected selection column's header and body cells. Both stop propagation so selection
 * never triggers `onRowClick` (docs/rows.md); the body cell implements shift-range
 * selection against the anchor stored in `meta.ledger`.
 */
import { Checkbox } from "@mantine/core";

import { useDataTableContext } from "./context";

function noop() {
  // Selection is applied in onClick (where shiftKey exists); the controlled checkbox still
  // needs an onChange to satisfy React's controlled-input contract.
}

export function SelectionHeaderCell<TData>({ table }: { table: Table<TData> }) {
  const { labels } = useDataTableContext();

  if (table.options.enableMultiRowSelection === false) {
    return null;
  }

  const scope = table.options.meta?.ledger?.selectAllScope ?? "all";
  const allSelected = scope === "page" ? table.getIsAllPageRowsSelected() : table.getIsAllRowsSelected();
  const someSelected = scope === "page" ? table.getIsSomePageRowsSelected() : table.getIsSomeRowsSelected();

  const toggleAll = () => {
    if (scope === "page") {
      table.toggleAllPageRowsSelected(!allSelected);
    } else {
      table.toggleAllRowsSelected(!allSelected);
    }
  };

  return (
    <Checkbox
      aria-label={labels.selectAllRows}
      checked={allSelected}
      indeterminate={!allSelected && someSelected}
      size="xs"
      onChange={noop}
      onClick={(event: MouseEvent<HTMLInputElement>) => {
        event.stopPropagation();
        toggleAll();
      }}
    />
  );
}

export function SelectionCell<TData>({ row, table }: { row: Row<TData>; table: Table<TData> }) {
  const { labels } = useDataTableContext();
  const anchor = table.options.meta?.ledger?.selectionAnchor;
  const multiSelect = table.options.enableMultiRowSelection !== false;

  const selectRange = (anchorId: string) => {
    const { rows } = table.getRowModel();
    const anchorIndex = rows.findIndex(candidate => candidate.id === anchorId);
    const targetIndex = rows.findIndex(candidate => candidate.id === row.id);

    if (anchorIndex === -1 || targetIndex === -1) {
      return false;
    }

    const [from, to] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
    const patch: Record<string, boolean> = {};

    for (let index = from; index <= to; index += 1) {
      const candidate = rows[index];

      if (candidate?.getCanSelect()) {
        patch[candidate.id] = true;
      }
    }

    table.setRowSelection(previous => {
      return { ...previous, ...patch };
    });

    return true;
  };

  return (
    <Checkbox
      aria-label={labels.selectRow}
      checked={row.getIsSelected()}
      disabled={!row.getCanSelect()}
      size="xs"
      onChange={noop}
      onClick={(event: MouseEvent<HTMLInputElement>) => {
        event.stopPropagation();

        if (multiSelect && event.shiftKey && anchor?.current && selectRange(anchor.current)) {
          return;
        }

        row.toggleSelected();

        if (anchor) {
          anchor.current = row.id;
        }
      }}
    />
  );
}
