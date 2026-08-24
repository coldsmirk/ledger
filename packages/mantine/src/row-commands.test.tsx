import type { ColumnFiltersState, ExpandedState, RowSelectionState, SortingState } from "@tanstack/react-table";
import type { ReactNode } from "react";

import type { ColumnDef, DataTableHandle } from "./types";

import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef, startTransition, StrictMode, Suspense, useState } from "react";
import { describe, expect, it } from "vitest";

import { DataTable } from "./data-table";

interface Person {
  id: string;
  name: string;
}

const people: Person[] = [
  { id: "1", name: "Carol" },
  { id: "2", name: "Alice" },
  { id: "3", name: "Bob" }
];

const getRowId = (person: Person) => person.id;
const columns: Array<ColumnDef<Person, any>> = [{ accessorKey: "name", header: "Name" }];

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <MantineProvider>{children}</MantineProvider>
    </StrictMode>
  );
}

function Blocker({ blocked, promise }: { blocked: boolean; promise: Promise<void> }) {
  if (blocked) {
    throw promise;
  }

  return null;
}

interface Node {
  id: string;
  name: string;
  children?: Node[];
}

const tree: Node[] = [
  {
    children: [{ id: "1a", name: "Ann" }, { id: "1b", name: "Ben" }],
    id: "1",
    name: "Carol"
  },
  { id: "2", name: "Alice" }
];

const treeColumns: Array<ColumnDef<Node, any>> = [{ accessorKey: "name", header: "Name" }];
const getNodeId = (node: Node) => node.id;

const names = () => [...document.querySelectorAll(".ledger-row .ledger-cell")].map(cell => cell.textContent);
const rowIds = () => [...document.querySelectorAll(".ledger-row")].map(row => (row as HTMLElement).dataset.rowId);
const selectedIds = () => [...document.querySelectorAll("[data-selected]")].map(row => (row as HTMLElement).dataset.rowId);
const rowBoxes = () => [...document.querySelectorAll(".ledger-row input[type=\"checkbox\"]")] as HTMLInputElement[];
const sortButton = (index: number) => document.querySelectorAll(".ledger-header-cell button")[index] as HTMLElement;
const sortState = () => [...document.querySelectorAll(".ledger-header-cell")].map(cell => cell.getAttribute("aria-sort"));

describe("row-state toggles against a discarded render", () => {
  it("sorting: direction comes from the state on screen", () => {
    const blocker = Promise.withResolvers<void>();

    function Harness() {
      const [sorting, setSorting] = useState<SortingState>([]);
      const [blocked, setBlocked] = useState(false);

      return (
        <>
          <DataTable columns={columns} data={people} getRowId={getRowId} sorting={sorting} onSortingChange={setSorting} />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setSorting([{ desc: false, id: "name" }]);
              setBlocked(true);
            })}
          >
            wip
          </button>

          <Suspense fallback={<div>waiting</div>}>
            <Blocker blocked={blocked} promise={blocker.promise} />
          </Suspense>
        </>
      );
    }

    render(<Harness />, { wrapper });
    expect(names()).toEqual(["Carol", "Alice", "Bob"]);

    fireEvent.click(screen.getByRole("button", { name: "wip" }));
    expect(names()).toEqual(["Carol", "Alice", "Bob"]);

    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(names()).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("sorting: the gate comes from the render on screen", () => {
    const blocker = Promise.withResolvers<void>();

    function Harness() {
      const [enabled, setEnabled] = useState(true);
      const [sorting, setSorting] = useState<SortingState>([]);
      const [blocked, setBlocked] = useState(false);

      return (
        <>
          <DataTable
            columns={columns}
            data={people}
            enableSorting={enabled}
            getRowId={getRowId}
            sorting={sorting}
            onSortingChange={setSorting}
          />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setEnabled(false);
              setBlocked(true);
            })}
          >
            wip
          </button>

          <Suspense fallback={<div>waiting</div>}>
            <Blocker blocked={blocked} promise={blocker.promise} />
          </Suspense>
        </>
      );
    }

    render(<Harness />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "wip" }));

    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(names()).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("selection: the gate comes from the render on screen", () => {
    const blocker = Promise.withResolvers<void>();

    function Harness() {
      const [enabled, setEnabled] = useState(true);
      const [blocked, setBlocked] = useState(false);

      return (
        <>
          <DataTable
            columns={columns}
            data={people}
            enableRowSelection={enabled}
            getRowId={getRowId}
          />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setEnabled(false);
              setBlocked(true);
            })}
          >
            wip
          </button>

          <Suspense fallback={<div>waiting</div>}>
            <Blocker blocked={blocked} promise={blocker.promise} />
          </Suspense>
        </>
      );
    }

    render(<Harness />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "wip" }));

    const boxes = document.querySelectorAll(".ledger-row input[type=\"checkbox\"]");
    fireEvent.click(boxes[0] as Element);

    expect(document.querySelectorAll("[data-selected]")).toHaveLength(1);
  });

  it("selection: a shift range covers the rows on screen", () => {
    const blocker = Promise.withResolvers<void>();
    const filtered: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { filter: "text" }
      }
    ];

    function Harness() {
      const [filters, setFilters] = useState<ColumnFiltersState>([]);
      const [selection, setSelection] = useState<RowSelectionState>({});
      const [blocked, setBlocked] = useState(false);

      return (
        <>
          <DataTable
            enableRowSelection
            columnFilters={filters}
            columns={filtered}
            data={people}
            getRowId={getRowId}
            rowSelection={selection}
            onColumnFiltersChange={setFilters}
            onRowSelectionChange={setSelection}
          />

          <button
            type="button"
            onClick={() => startTransition(() => {
              // Drops the middle row from the work-in-progress order.
              setFilters([{ id: "name", value: "o" }]);
              setBlocked(true);
            })}
          >
            wip
          </button>

          <Suspense fallback={<div>waiting</div>}>
            <Blocker blocked={blocked} promise={blocker.promise} />
          </Suspense>
        </>
      );
    }

    render(<Harness />, { wrapper });
    expect(rowIds()).toEqual(["1", "2", "3"]);

    fireEvent.click(screen.getByRole("button", { name: "wip" }));
    expect(rowIds()).toEqual(["1", "2", "3"]);

    const boxes = document.querySelectorAll(".ledger-row input[type=\"checkbox\"]");
    fireEvent.click(boxes[0] as Element);
    fireEvent.click(boxes[2] as Element, { shiftKey: true });

    expect([...document.querySelectorAll("[data-selected]")].map(row => (row as HTMLElement).dataset.rowId))
      .toEqual(["1", "2", "3"]);
  });

  it("selection: select-all covers the page on screen", () => {
    const blocker = Promise.withResolvers<void>();
    const filtered: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { filter: "text" }
      }
    ];

    function Harness() {
      const [filters, setFilters] = useState<ColumnFiltersState>([]);
      const [blocked, setBlocked] = useState(false);

      return (
        <>
          <DataTable
            enableRowSelection
            columnFilters={filters}
            columns={filtered}
            data={people}
            getRowId={getRowId}
            onColumnFiltersChange={setFilters}
          />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setFilters([{ id: "name", value: "o" }]);
              setBlocked(true);
            })}
          >
            wip
          </button>

          <Suspense fallback={<div>waiting</div>}>
            <Blocker blocked={blocked} promise={blocker.promise} />
          </Suspense>
        </>
      );
    }

    render(<Harness />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "wip" }));

    fireEvent.click(document.querySelector(".ledger-header input[type=\"checkbox\"]") as Element);

    expect(document.querySelectorAll("[data-selected]")).toHaveLength(3);
  });

  it("expansion: a toggle departs from the state on screen", () => {
    const blocker = Promise.withResolvers<void>();

    function Harness() {
      const [expanded, setExpanded] = useState<ExpandedState>({});
      const [blocked, setBlocked] = useState(false);

      return (
        <>
          <DataTable
            columns={columns}
            data={people}
            expanded={expanded}
            getRowId={getRowId}
            renderDetailPanel={row => <span data-testid="panel">{row.original.name}</span>}
            onExpandedChange={setExpanded}
          />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setExpanded({ 1: true });
              setBlocked(true);
            })}
          >
            wip
          </button>

          <Suspense fallback={<div>waiting</div>}>
            <Blocker blocked={blocked} promise={blocker.promise} />
          </Suspense>
        </>
      );
    }

    render(<Harness />, { wrapper });
    expect(screen.queryByTestId("panel")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "wip" }));
    expect(screen.queryByTestId("panel")).toBeNull();

    fireEvent.click(document.querySelector(".ledger-row button") as Element);
    expect(screen.getByTestId("panel").textContent).toBe("Carol");
  });
});

describe("row-state toggles keep TanStack's own semantics", () => {
  const twoColumns: Array<ColumnDef<Person, any>> = [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "id", header: "Id" }
  ];

  it("cycles a column through ascending, descending and unsorted", () => {
    render(<DataTable columns={columns} data={people} getRowId={getRowId} />, { wrapper });

    fireEvent.click(sortButton(0));
    expect(names()).toEqual(["Alice", "Bob", "Carol"]);

    fireEvent.click(sortButton(0));
    expect(names()).toEqual(["Carol", "Bob", "Alice"]);

    // Removal is on by default, so the third click drops the column out of `sorting`.
    fireEvent.click(sortButton(0));
    expect(names()).toEqual(["Carol", "Alice", "Bob"]);
    expect(sortState()).toEqual([null]);
  });

  it("adds a column to the sort on a multi-sort event and drops it again", () => {
    render(<DataTable columns={twoColumns} data={people} getRowId={getRowId} />, { wrapper });

    fireEvent.click(sortButton(0));
    fireEvent.click(sortButton(1), { shiftKey: true });

    expect(sortState()).toEqual(["ascending", "ascending"]);

    // The second column keeps cycling on its own while the first stays put.
    fireEvent.click(sortButton(1), { shiftKey: true });
    expect(sortState()).toEqual(["ascending", "descending"]);

    fireEvent.click(sortButton(1), { shiftKey: true });
    expect(sortState()).toEqual(["ascending", null]);
  });

  it("caps a multi-sort at maxMultiSortColCount", () => {
    render(
      <DataTable columns={twoColumns} data={people} getRowId={getRowId} tableOptions={{ maxMultiSortColCount: 1 }} />,
      { wrapper }
    );

    fireEvent.click(sortButton(0));
    fireEvent.click(sortButton(1), { shiftKey: true });

    expect(sortState()).toEqual([null, "ascending"]);
  });

  it("selects a parent with its children, and a child on its own", () => {
    render(
      <DataTable
        defaultExpanded
        enableRowSelection
        columns={treeColumns}
        data={tree}
        getRowId={getNodeId}
        getSubRows={node => node.children}
      />,
      { wrapper }
    );
    expect(rowIds()).toEqual(["1", "1a", "1b", "2"]);

    // A child alone: the parent is not implied.
    fireEvent.click(rowBoxes()[1] as Element);
    expect(selectedIds()).toEqual(["1a"]);

    fireEvent.click(rowBoxes()[1] as Element);
    // The parent cascades into its subtree, and nothing is counted twice.
    fireEvent.click(rowBoxes()[0] as Element);
    expect(selectedIds()).toEqual(["1", "1a", "1b"]);
  });

  it("covers a shift range across a tree without duplicating a cascaded child", () => {
    render(
      <DataTable
        defaultExpanded
        enableRowSelection
        columns={treeColumns}
        data={tree}
        getRowId={getNodeId}
        getSubRows={node => node.children}
      />,
      { wrapper }
    );

    fireEvent.click(rowBoxes()[0] as Element);
    fireEvent.click(rowBoxes()[3] as Element, { shiftKey: true });

    expect(selectedIds()).toEqual(["1", "1a", "1b", "2"]);
  });

  it("leaves a row the selection predicate refuses out of a range", () => {
    render(
      <DataTable
        columns={columns}
        data={people}
        enableRowSelection={row => row.id !== "2"}
        getRowId={getRowId}
      />,
      { wrapper }
    );

    const boxes = rowBoxes();
    fireEvent.click(boxes[0] as Element);
    fireEvent.click(boxes[2] as Element, { shiftKey: true });

    expect(selectedIds()).toEqual(["1", "3"]);
  });

  it("expands and collapses a whole tree from the header", () => {
    render(
      <DataTable
        columns={treeColumns}
        data={tree}
        getRowId={getNodeId}
        getSubRows={node => node.children}
      />,
      { wrapper }
    );
    expect(rowIds()).toEqual(["1", "2"]);

    fireEvent.click(screen.getByLabelText("Expand all rows"));
    expect(rowIds()).toEqual(["1", "1a", "1b", "2"]);

    fireEvent.click(screen.getByLabelText("Collapse all rows"));
    expect(rowIds()).toEqual(["1", "2"]);
  });

  it("selects one row of a tree when the table is single-select", () => {
    render(
      <DataTable
        defaultExpanded
        enableRowSelection
        columns={treeColumns}
        data={tree}
        enableMultiRowSelection={false}
        getRowId={getNodeId}
        getSubRows={node => node.children}
      />,
      { wrapper }
    );

    // A single-select row clears the map before it writes itself. Cascading into its subtree
    // would leave the last descendant selected instead of the row that was clicked.
    // Single-select renders radios, not checkboxes — one choice at a time is what a radio means.
    fireEvent.click(document.querySelector(".ledger-row input[type=\"radio\"]") as Element);

    expect(selectedIds()).toEqual(["1"]);
  });

  it("does not walk the display order again for an unrelated state change", () => {
    const handle = createRef<DataTableHandle<Person>>();
    render(
      <DataTable enableRowSelection columns={columns} data={people} getRowId={getRowId} handleRef={handle} />,
      { wrapper }
    );

    // Building the display order walks every pre-paginated row and stamps its
    // `_displayIndexCache`, so a rebuild is observable on the rows themselves. Upstream memoizes
    // that answer on the rows, `paginateExpandedRows` and `expanded`; this pins that the
    // committed snapshot rides that memo rather than forcing a walk per commit.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- TanStack's own field name
    const rows = handle.current!.table.getPrePaginatedRowModel().rows as Array<{ _displayIndexCache: number }>;

    const stamp = () => {
      for (const row of rows) {
        row._displayIndexCache = -99;
      }
    };

    const walked = () => rows.some(row => row._displayIndexCache !== -99);

    stamp();
    act(() => handle.current!.table.setColumnSizing({ name: 120 }));
    expect(walked()).toBe(false);

    // And again for a burst of them, which is what a resize drag is.
    act(() => handle.current!.table.setColumnSizing({ name: 121 }));
    act(() => handle.current!.table.setColumnSizing({ name: 122 }));
    expect(walked()).toBe(false);

    // A real change to the order does rebuild it.
    act(() => handle.current!.table.setSorting([{ desc: true, id: "name" }]));
    expect(handle.current!.table.getPrePaginatedRowModel().rows).not.toBe(rows);
  });
});
