import { DataTable, useDataTable } from "@coldsmirk/ledger-mantine";
import { Button, Group, Stack } from "@mantine/core";
import { useMemo } from "react";

import { makePeople } from "../data";
import { useCopy, useLang } from "../i18n";
import { usePersonColumns } from "./columns";

const copy = {
  en: { columns: "Columns" },
  zh: { columns: "列设置" }
};

export function HookToolbarDemo() {
  const t = useCopy(copy);
  const { lang } = useLang();
  const data = useMemo(() => makePeople(lang, 120), [lang]);
  const columns = usePersonColumns();

  const table = useDataTable({
    data,
    columns,
    getRowId: person => person.id,
    enableGlobalFilter: true,
    enablePagination: true,
    defaultPagination: { pageIndex: 0, pageSize: 15 }
  });

  return (
    <Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>
      <Group justify="space-between">
        {/* No `labels` here: every compound component has its own theme key, and the app sets
            them all in one place (src/main.tsx). */}
        <DataTable.Search table={table} w={260} />

        {/* children IS the trigger — the panel never assumes what opens it. */}
        <DataTable.ColumnsPanel table={table}>
          <Button size="xs" variant="default">
            {t.columns}
          </Button>
        </DataTable.ColumnsPanel>
      </Group>

      <DataTable
        striped
        flex={1}
        mih={0}
        table={table}
        withPaginationBar={false}
      />

      <DataTable.Pagination table={table} />
    </Stack>
  );
}
