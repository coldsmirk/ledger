import type { RowData } from "@tanstack/react-table";

import type { Row, TableInstance } from "./types";

/**
 * The injected expander column: a per-row chevron (detail panels and sub-row trees share it)
 * and an expand-all header affordance for trees. Clicks never reach `onRowClick`.
 */
import { ActionIcon } from "@mantine/core";

import { useDataTableContext } from "./context";
import { IconChevronRight } from "./icons";

export function ExpanderHeaderCell<TData extends RowData>({ table }: { table: TableInstance<TData> }) {
  const { labels } = useDataTableContext();

  // Expand-all only makes sense over a tree; a master–detail table opens panels one at a time.
  if (!table.options.getSubRows) {
    return null;
  }

  const allExpanded = table.getIsAllRowsExpanded();

  return (
    <ActionIcon
      aria-label={allExpanded ? labels.collapseAll : labels.expandAll}
      data-expanded={allExpanded || undefined}
      size="sm"
      variant="subtle"
      onClick={event => {
        event.stopPropagation();
        table.toggleAllRowsExpanded(!allExpanded);
      }}
    >
      <IconChevronRight />
    </ActionIcon>
  );
}

export function ExpanderCell<TData extends RowData>({ row }: { row: Row<TData> }) {
  const { labels } = useDataTableContext();

  if (!row.getCanExpand()) {
    return null;
  }

  const expanded = row.getIsExpanded();

  return (
    <ActionIcon
      aria-expanded={expanded}
      aria-label={expanded ? labels.collapseRow : labels.expandRow}
      data-expanded={expanded || undefined}
      size="sm"
      variant="subtle"
      onClick={event => {
        event.stopPropagation();
        row.toggleExpanded();
      }}
    >
      <IconChevronRight />
    </ActionIcon>
  );
}
