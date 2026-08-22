import type { RowData } from "@tanstack/react-table";
import type { MouseEvent } from "react";

import type { Row, TableInstance } from "./types";

/**
 * The injected selection column's header and body cells. Both stop propagation so selection
 * never triggers `onRowClick` (docs/rows.md). Shift-range selection is TanStack v9's own
 * `getToggleSelectedHandler()` behavior (`enableRowRangeSelection`, on by default): an ordinary
 * click sets the anchor, a Shift-click applies the display-order range, `getCanSelect()` rows
 * excluded — the click event is handed to the handler so it can read the modifier.
 */
import { Checkbox, Radio } from "@mantine/core";

import { useDataTableContext } from "./context";

function noop() {
  // Selection is applied in onClick (where shiftKey exists); the controlled checkbox still
  // needs an onChange to satisfy React's controlled-input contract.
}

export function SelectionHeaderCell<TData extends RowData>({ table }: { table: TableInstance<TData> }) {
  const { labels } = useDataTableContext();

  if (table.options.enableMultiRowSelection === false) {
    return null;
  }

  const scope = table.options.meta?.ledger?.selectAllScope ?? "all";
  const allSelected = scope === "page" ? table.getIsAllPageRowsSelected() : table.getIsAllRowsSelected();
  // v9 semantics: "some" means "at least one" and stays true at full selection — the
  // indeterminate glyph must therefore be gated on the matching all-selected check.
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

export function SelectionCell<TData extends RowData>({ row }: { row: Row<TData> }) {
  const { labels, instanceId } = useDataTableContext();
  const selected = row.getIsSelected();

  const select = (event: MouseEvent<HTMLInputElement>) => {
    event.stopPropagation();
    row.getToggleSelectedHandler()(event);
  };

  // Single-select is a radio group, not a lone checkbox: one choice at a time is what a radio
  // means, and the shared name makes the rendered rows one group for the platform. (Under
  // virtualization only the mounted window is in that group — the same boundary as autosize.)
  if (row.getCanMultiSelect() === false) {
    return (
      <Radio
        aria-label={labels.selectRow}
        checked={selected}
        disabled={!row.getCanSelect()}
        name={`${instanceId}-selection`}
        size="xs"
        onChange={noop}
        onClick={select}
      />
    );
  }

  return (
    <Checkbox
      aria-label={labels.selectRow}
      checked={selected}
      disabled={!row.getCanSelect()}
      // Sub-row selection (escape hatch `enableSubRowSelection`): a parent with a partly
      // selected subtree reads as indeterminate.
      indeterminate={!selected && row.getIsSomeSelected()}
      size="xs"
      onChange={noop}
      onClick={select}
    />
  );
}
