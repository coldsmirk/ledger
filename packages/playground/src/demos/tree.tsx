import type { Region } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-mantine";
import { useMemo } from "react";

import { makeRegions } from "../data";
import { useCopy, useLang } from "../i18n";

const copy = {
  en: {
    region: "Region (the header expands everything)",
    revenue: "Revenue",
    share: "Share of region"
  },
  zh: {
    region: "区域（表头可展开全部）",
    revenue: "营收",
    share: "占本区域"
  }
};

const helper = createColumnHelper<Region>();

/**
 * Every node's share is read against its own top-level region, so children sum to 100%.
 */
function shareOfRoot(row: { id: string; original: Region }, roots: Region[]): number {
  const rootId = row.id.split(".", 1)[0];
  const root = roots[Number(rootId)] ?? roots[0];

  return root && root.revenue > 0 ? row.original.revenue / root.revenue : 0;
}

export function TreeDemo() {
  const t = useCopy(copy);
  const { lang } = useLang();
  const data = useMemo(() => makeRegions(lang), [lang]);

  const columns = useMemo(() => [
    helper.accessor("name", {
      header: t.region,
      minSize: 200
    }),
    helper.accessor("revenue", {
      header: t.revenue,
      size: 140,
      cell: context => context.getValue().toLocaleString(),
      meta: { align: "end" }
    }),
    helper.display({
      id: "share",
      header: t.share,
      size: 120,
      cell: context => `${(shareOfRoot(context.row, data) * 100).toFixed(1)}%`,
      meta: { align: "end" }
    })
  ], [t, data]);

  return (
    <DataTable
      tabularNums
      columns={columns}
      data={data}
      defaultExpanded={{ "r-1": true }}
      flex={1}
      getRowId={region => region.id}
      getSubRows={region => region.children}
      // A three-column tree is a compact document, not an elastic list: without a cap the one
      // grow column (the tree itself) would swallow ~850px of an empty wide page.
      maw={760}
      mih={0}
    />
  );
}
