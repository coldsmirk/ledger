import type { ReactNode } from "react";

import type { DataTableProps } from "./data-table";
import type { ColumnDef } from "./types";

import { Button, MantineProvider } from "@mantine/core";
import { render } from "@testing-library/react";
import axe from "axe-core";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "./data-table";

interface Person {
  id: string;
  name: string;
  age: number;
}

const people: Person[] = [
  {
    id: "1",
    name: "Carol",
    age: 30
  },
  {
    id: "2",
    name: "Alice",
    age: 25
  }
];

const columns: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "Name",
    footer: "Total"
  },
  { accessorKey: "age", header: "Age" }
];

/**
 * The inline-options arm of the props: what a case may change on the table it renders.
 */
type Case = Partial<Extract<DataTableProps<Person>, { table?: never }>>;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <MantineProvider>{children}</MantineProvider>
    </StrictMode>
  );
}

/**
 * axe-core's WCAG A and AA rules over one table. jsdom has no layout, so what this proves is
 * the structure (which roles own which), not contrast or focus visibility.
 */
async function violations(props: Case): Promise<string[]> {
  const { container } = render(
    <>
      <DataTable aria-label="People" columns={columns} data={people} getRowId={person => person.id} {...props} />
      <span id="consumer-hint">Rows open on Enter</span>
    </>,
    { wrapper }
  );
  const results = await axe.run(container, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });

  return results.violations.flatMap(violation => violation.nodes.map(node => `${violation.id} at ${node.target.join(" ")}: ${node.failureSummary ?? ""}`));
}

describe("the ARIA table", () => {
  it.each<[string, Case]>([
    ["with rows", {}],
    ["with the active row", { enableActiveRow: true }],
    ["with a described viewport", { viewportProps: { "aria-describedby": "consumer-hint" } }],
    ["empty", { data: [] }],
    ["empty with the active row", { data: [], enableActiveRow: true }],
    ["empty with a custom state holding a control", { data: [], emptyState: <Button>Invite</Button> }],
    ["with no results", { enableGlobalFilter: true, defaultGlobalFilter: "zzz" }],
    [
      "failed with a retry",
      {
        data: [],
        error: true,
        onRetry: vi.fn()
      }
    ],
    ["failed over stale rows", { error: true, onRetry: vi.fn() }],
    ["failed over virtualized rows", { error: true, virtualizedRows: true }],
    ["loading", { data: [], loading: true }],
    ["loading over rows", { loading: true }],
    ["failing to load more", { loadMoreError: true, onEndReached: vi.fn() }]
  ])("owns only rows and row groups %s", async (_state, props) => {
    expect(await violations(props)).toEqual([]);
  });
});
