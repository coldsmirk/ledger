import { DataTable, useDataTable } from "@coldsmirk/ledger-mantine";
import { zhCN } from "@coldsmirk/ledger-mantine/locales";
import { Group, Stack } from "@mantine/core";
import { useMemo } from "react";

import { makePeople } from "../data";
import { personColumns } from "./columns";

export function HookToolbarDemo() {
  const data = useMemo(() => makePeople(120), []);

  const table = useDataTable({
    data,
    columns: personColumns,
    getRowId: person => person.id,
    enableGlobalFilter: true,
    enablePagination: true,
    defaultPagination: { pageIndex: 0, pageSize: 15 }
  });

  return (
    <Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>
      <Group justify="space-between">
        <DataTable.Search labels={zhCN} table={table} w={260} />
        <DataTable.ColumnsMenu labels={zhCN} table={table} />
      </Group>

      <DataTable
        striped
        withTableBorder
        flex={1}
        mih={0}
        table={table}
        withPaginationBar={false}
      />

      <DataTable.Pagination labels={zhCN} table={table} />
    </Stack>
  );
}
