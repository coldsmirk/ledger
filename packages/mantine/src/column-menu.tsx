import type { Column, Table } from "@tanstack/react-table";

/**
 * The per-column menu behind the hover-revealed dots trigger: sort, pin, group, hide — each item
 * appears only when the column can actually do it. The trigger stops propagation so opening the
 * menu never toggles the header sort.
 */
import { ActionIcon, Menu } from "@mantine/core";

import { useDataTableContext } from "./context";
import {
  IconChevronDown,
  IconChevronUp,
  IconDots,
  IconEyeOff,
  IconGroup,
  IconPin,
  IconPinOff,
  IconX
} from "./icons";

export interface ColumnMenuProps<TData> {
  column: Column<TData, unknown>;
  table: Table<TData>;
}

export function ColumnMenu<TData>({ column, table }: ColumnMenuProps<TData>) {
  const { labels, getStyles } = useDataTableContext();

  const canSort = column.getCanSort();
  const canPin = column.getCanPin();
  const canHide = column.getCanHide();
  const canGroup = table.options.enableGrouping === true && column.getCanGroup();

  if (!canSort && !canPin && !canHide && !canGroup) {
    return null;
  }

  const sorted = column.getIsSorted();
  const pinned = column.getIsPinned();
  const grouped = column.getIsGrouped();

  return (
    <Menu position="bottom-end" width={200}>
      <Menu.Target>
        <ActionIcon
          aria-label={labels.columnMenu}
          size="sm"
          variant="subtle"
          onClick={event => event.stopPropagation()}
        >
          <IconDots />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown {...getStyles("columnMenu")}>
        {canSort && (
          <>
            <Menu.Item
              disabled={sorted === "asc"}
              leftSection={<IconChevronUp />}
              onClick={() => column.toggleSorting(false)}
            >
              {labels.sortAscending}
            </Menu.Item>

            <Menu.Item
              disabled={sorted === "desc"}
              leftSection={<IconChevronDown />}
              onClick={() => column.toggleSorting(true)}
            >
              {labels.sortDescending}
            </Menu.Item>

            {sorted !== false && (
              <Menu.Item leftSection={<IconX />} onClick={() => column.clearSorting()}>
                {labels.clearSort}
              </Menu.Item>
            )}
          </>
        )}

        {canPin && (
          <>
            {canSort && <Menu.Divider />}

            <Menu.Item
              disabled={pinned === "left"}
              leftSection={<IconPin />}
              onClick={() => column.pin("left")}
            >
              {labels.pinLeft}
            </Menu.Item>

            <Menu.Item
              disabled={pinned === "right"}
              leftSection={<IconPin style={{ transform: "scaleX(-1)" }} />}
              onClick={() => column.pin("right")}
            >
              {labels.pinRight}
            </Menu.Item>

            {pinned !== false && (
              <Menu.Item leftSection={<IconPinOff />} onClick={() => column.pin(false)}>
                {labels.unpin}
              </Menu.Item>
            )}
          </>
        )}

        {canGroup && (
          <>
            {(canSort || canPin) && <Menu.Divider />}

            <Menu.Item leftSection={<IconGroup />} onClick={() => column.toggleGrouping()}>
              {grouped ? labels.ungroupColumn : labels.groupByColumn}
            </Menu.Item>
          </>
        )}

        {canHide && (
          <>
            {(canSort || canPin || canGroup) && <Menu.Divider />}

            <Menu.Item leftSection={<IconEyeOff />} onClick={() => column.toggleVisibility(false)}>
              {labels.hideColumn}
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
