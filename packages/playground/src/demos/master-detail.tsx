import { DataTable } from "@coldsmirk/ledger-mantine";
import { Grid, Text } from "@mantine/core";
import { useMemo } from "react";

import { makePeople } from "../data";
import { personColumns } from "./columns";

export function MasterDetailDemo() {
  const data = useMemo(() => makePeople(40), []);

  return (
    <DataTable
      withTableBorder
      columns={personColumns}
      data={data}
      flex={1}
      getRowId={person => person.id}
      mih={0}
      renderDetailPanel={row => (
        <Grid>
          {Object.entries(row.original).map(([key, value]) => (
            <Grid.Col key={key} span={3}>
              <Text c="dimmed" size="xs">
                {key}
              </Text>

              <Text size="sm">{String(value)}</Text>
            </Grid.Col>
          ))}
        </Grid>
      )}
    />
  );
}
