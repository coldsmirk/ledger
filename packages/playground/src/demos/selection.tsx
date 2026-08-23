import type { RowSelectionState } from "@coldsmirk/ledger-mantine";

import { DataTable, toCsv, useDataTable } from "@coldsmirk/ledger-mantine";
import { zhCN } from "@coldsmirk/ledger-mantine/locales";
import { Button, SegmentedControl, Stack, Text } from "@mantine/core";
import { useMemo, useState } from "react";

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

/**
 * Two selection shapes from one switch. `enableMultiRowSelection: false` turns the injected
 * column's checkboxes into a real radio group (one shared `name`), and its select-all header
 * renders nothing — "select all" means nothing when only one row can be chosen. That blank is
 * what `selectionColumn` is for here: the merge keeps ledger's cell renderer and reserved id
 * while the application supplies the heading it wants.
 */
export function SelectionDemo() {
  const data = useMemo(() => makePeople(200), []);
  const [multiple, setMultiple] = useState(true);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const table = useDataTable({
    data,
    columns: personColumns,
    getRowId: person => person.id,
    enableRowSelection: row => row.original.status !== "suspended",
    enableMultiRowSelection: multiple,
    enablePagination: true,
    defaultPagination: {
      pageIndex: 0,
      pageSize: 20
    },
    rowSelection,
    onRowSelectionChange: setRowSelection,
    selectionColumn: multiple
      ? undefined
      : {
          size: 64,
          header: () => (
            <Text c="dimmed" fw={500} size="xs">
              指派
            </Text>
          )
        }
  });

  const owner = Object.keys(rowSelection)[0];
  const ownerName = data.find(person => person.id === owner)?.name;

  return (
    <Stack
      gap="xs"
      style={{
        flex: 1,
        minHeight: 0
      }}
    >
      <SegmentedControl
        size="xs"
        value={multiple ? "multiple" : "single"}
        w={280}
        data={[
          {
            value: "multiple",
            label: "批量操作（多选）"
          },
          {
            value: "single",
            label: "指派负责人（单选）"
          }
        ]}
        onChange={value => {
          setMultiple(value === "multiple");
          // Carrying a five-row selection into single-select mode would leave five radios
          // checked at once — the mode change is a fresh question.
          setRowSelection({});
        }}
      />

      {multiple
        ? (
            <DataTable.SelectionBar labels={zhCN} table={table}>
              <Button
                size="compact-xs"
                variant="light"
                onClick={() => downloadCsv(toCsv(table, {
                  escapeFormulas: true,
                  scope: "selected"
                }), "selected.csv")}
              >
                导出所选为 CSV
              </Button>
            </DataTable.SelectionBar>
          )
        : (
            <Text c={ownerName ? undefined : "dimmed"} size="sm">
              {ownerName ? `当前负责人：${ownerName}` : "尚未指派负责人（已停用的成员不可选）"}
            </Text>
          )}

      <DataTable
        highlightOnHover
        flex={1}
        labels={zhCN}
        mih={0}
        table={table}
      />
    </Stack>
  );
}
