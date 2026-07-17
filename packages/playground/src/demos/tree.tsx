import type { Region } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { useMemo } from "react";

import { makeRegions } from "../data";

const helper = createColumnHelper<Region>();

const columns = [
  helper.accessor("name", { header: "区域（表头可展开全部）" }),
  helper.accessor("revenue", {
    header: "营收",
    size: 140,
    cell: context => context.getValue().toLocaleString(),
    meta: { align: "end" }
  })
];

export function TreeDemo() {
  const data = useMemo(() => makeRegions(), []);

  return (
    <DataTable
      tabularNums
      withTableBorder
      columns={columns}
      data={data}
      defaultExpanded={{ "r-1": true }}
      flex={1}
      getRowId={region => region.id}
      getSubRows={region => region.children}
      mih={0}
    />
  );
}
