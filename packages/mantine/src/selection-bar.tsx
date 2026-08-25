import type { RowData } from "@tanstack/react-table";
import type { CSSProperties, ReactNode } from "react";

import type { DataTableLabels } from "./labels";
import type { TableInstance } from "./types";

/**
 * `DataTable.SelectionBar` — renders only while rows are selected: the count, a clear action,
 * and whatever bulk actions the page passes as children.
 */
import { Button, Group, Text, useProps } from "@mantine/core";
import clsx from "clsx";

import { IconX } from "./icons";
import { resolveLabels } from "./labels";

export interface DataTableSelectionBarProps<TData extends RowData> {
  table: TableInstance<TData>;
  labels?: Partial<DataTableLabels>;
  /**
   * Bulk actions, rendered after the count and clear control.
   */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const selectionBarDefaultProps = {} satisfies Partial<DataTableSelectionBarProps<RowData>>;

export function DataTableSelectionBar<TData extends RowData>(props: DataTableSelectionBarProps<TData>) {
  const {
    table,
    labels,
    children,
    className,
    style
  } = useProps(
    "DataTableSelectionBar",
    selectionBarDefaultProps,
    props
  );

  const resolved = resolveLabels(labels);
  // The selection state's own count, deliberately — not `getSelectedRowModel().flatRows.length`.
  // That model resolves the state against the rows the table actually holds, which under server
  // pagination is one page: a bar counting it would drop everything selected on the pages that
  // are no longer loaded, and the id-keyed state is precisely what survives paging
  // (docs/selection.md). The corollary is that ids the data no longer holds still count, which is
  // the same reason selection requires a stable `getRowId`.
  const count = Object.values(table.atoms.rowSelection.get()).filter(Boolean).length;

  if (count === 0) {
    return null;
  }

  return (
    <Group className={clsx("ledger-selection-bar", className)} gap="sm" style={style}>
      <Text fw={500} size="sm">
        {resolved.selectedCount(count)}
      </Text>

      <Button
        leftSection={<IconX />}
        size="compact-xs"
        variant="subtle"
        onClick={() => table.resetRowSelection()}
      >
        {resolved.clearSelection}
      </Button>

      {children}
    </Group>
  );
}
