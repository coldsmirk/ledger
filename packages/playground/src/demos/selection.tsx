import { DataTable, toCsv, useDataTable } from "@coldsmirk/ledger-mantine";
import { zhCN } from "@coldsmirk/ledger-mantine/locales";
import { Button, Stack } from "@mantine/core";
import { useMemo } from "react";

import { makePeople } from "../data";
import { personColumns } from "./columns";

function downloadCsv(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function SelectionDemo() {
  const data = useMemo(() => makePeople(200), []);

  const table = useDataTable({
    data,
    columns: personColumns,
    getRowId: person => person.id,
    enableRowSelection: row => row.original.status !== "suspended",
    enablePagination: true,
    defaultPagination: { pageIndex: 0, pageSize: 20 }
  });

  return (
    <Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>
      <DataTable.SelectionBar labels={zhCN} table={table}>
        <Button
          size="compact-xs"
          variant="light"
          onClick={() => downloadCsv(toCsv(table, { scope: "selected" }), "selected.csv")}
        >
          导出所选为 CSV
        </Button>
      </DataTable.SelectionBar>

      <DataTable
        highlightOnHover
        withTableBorder
        flex={1}
        labels={zhCN}
        mih={0}
        table={table}
      />
    </Stack>
  );
}
