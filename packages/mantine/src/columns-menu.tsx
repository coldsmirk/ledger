import type { DataTableLabels } from "./labels";
import type { TableInstance } from "./types";

/**
 * `DataTable.ColumnsMenu` — column visibility control. Checkboxes are presentational (the menu
 * item is the click target), the menu stays open while toggling.
 */
import { Button, Checkbox, Menu, useProps } from "@mantine/core";

import { columnHeaderText, isInternalColumn } from "./build-columns";
import { IconColumns } from "./icons";
import { resolveLabels } from "./labels";

export interface DataTableColumnsMenuProps<TData> {
  table: TableInstance<TData>;
  labels?: Partial<DataTableLabels>;
}

const columnsMenuDefaultProps = {} satisfies Partial<DataTableColumnsMenuProps<unknown>>;

export function DataTableColumnsMenu<TData>(props: DataTableColumnsMenuProps<TData>) {
  const { table, labels } = useProps("DataTableColumnsMenu", columnsMenuDefaultProps, props);
  const resolved = resolveLabels(labels);

  const columns = table
    .getAllLeafColumns()
    .filter(column => column.getCanHide() && !isInternalColumn(column.id));

  if (columns.length === 0) {
    return null;
  }

  const someHidden = columns.some(column => !column.getIsVisible());

  return (
    <Menu closeOnItemClick={false} position="bottom-end" width={220}>
      <Menu.Target>
        <Button leftSection={<IconColumns />} size="xs" variant="default">
          {resolved.columnsMenu}
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        {columns.map(column => (
          <Menu.Item
            key={column.id}
            leftSection={(
              <Checkbox
                readOnly
                checked={column.getIsVisible()}
                size="xs"
                style={{ pointerEvents: "none" }}
                tabIndex={-1}
              />
            )}
            onClick={() => column.toggleVisibility()}
          >
            {columnHeaderText(column)}
          </Menu.Item>
        ))}

        {someHidden && (
          <>
            <Menu.Divider />

            <Menu.Item onClick={() => table.toggleAllColumnsVisible(true)}>
              {resolved.showAllColumns}
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
