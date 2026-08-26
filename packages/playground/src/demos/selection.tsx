import type { RowSelectionState } from "@coldsmirk/ledger-mantine";

import { DataTable, toCsv, useDataTable } from "@coldsmirk/ledger-mantine";
import { Button, SegmentedControl, Stack, Text } from "@mantine/core";
import { useMemo, useState } from "react";

import { makePeople } from "../data";
import { useCopy, useLang } from "../i18n";
import { usePersonColumns } from "./columns";

const copy = {
  en: {
    mode: "Selection mode",
    multiple: "Bulk actions (multi)",
    single: "Assign an owner (single)",
    exportCsv: "Export selected as CSV",
    owner: (name: string) => `Current owner: ${name}`,
    noOwner: "No owner assigned yet (suspended members cannot be picked)"
  },
  zh: {
    mode: "选择模式",
    multiple: "批量操作（多选）",
    single: "指派负责人（单选）",
    exportCsv: "导出所选为 CSV",
    owner: (name: string) => `当前负责人：${name}`,
    noOwner: "尚未指派负责人（已停用的成员不可选）"
  }
};

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
 * renders nothing — "select all" means nothing when only one row can be chosen.
 */
export function SelectionDemo() {
  const t = useCopy(copy);
  const { lang } = useLang();
  const data = useMemo(() => makePeople(lang, 200), [lang]);
  const columns = usePersonColumns();
  const [multiple, setMultiple] = useState(true);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const table = useDataTable({
    data,
    columns,
    getRowId: person => person.id,
    enableRowSelection: row => row.original.status !== "suspended",
    enableMultiRowSelection: multiple,
    enablePagination: true,
    defaultPagination: {
      pageIndex: 0,
      pageSize: 20
    },
    rowSelection,
    onRowSelectionChange: setRowSelection
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
        aria-label={t.mode}
        role="radiogroup"
        size="xs"
        value={multiple ? "multiple" : "single"}
        w={280}
        data={[
          {
            value: "multiple",
            label: t.multiple
          },
          {
            value: "single",
            label: t.single
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
            <DataTable.SelectionBar table={table}>
              <Button
                size="compact-xs"
                variant="light"
                onClick={() => downloadCsv(toCsv(table, {
                  escapeFormulas: true,
                  scope: "selected"
                }), "selected.csv")}
              >
                {t.exportCsv}
              </Button>
            </DataTable.SelectionBar>
          )
        : (
            <Text c={ownerName ? undefined : "dimmed"} size="sm">
              {ownerName ? t.owner(ownerName) : t.noOwner}
            </Text>
          )}

      <DataTable
        highlightOnHover
        flex={1}
        mih={0}
        table={table}
      />
    </Stack>
  );
}
