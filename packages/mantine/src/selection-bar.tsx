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
