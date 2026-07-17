import type { ColumnDef, SortingState } from "@tanstack/react-table";

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EXPANDER_COLUMN_ID, SELECTION_COLUMN_ID } from "./build-columns";
import { useDataTable } from "./use-data-table";

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
  },
  {
    id: "3",
    name: "Bob",
    age: 40
  }
];

const columns: Array<ColumnDef<Person, any>> = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "age", header: "Age" }
];

const getRowId = (person: Person) => person.id;

describe("useDataTable", () => {
  it("sorts client-side through the full asc → desc → cleared cycle", () => {
    const { result } = renderHook(() => useDataTable({
      data: people,
      columns,
      getRowId
    }));

    const names = () => result.current.getRowModel().rows.map(row => row.getValue("name"));

    act(() => result.current.getColumn("name")?.toggleSorting(false));
    expect(names()).toEqual(["Alice", "Bob", "Carol"]);

    act(() => result.current.getColumn("name")?.toggleSorting(true));
    expect(names()).toEqual(["Carol", "Bob", "Alice"]);

    act(() => result.current.getColumn("name")?.clearSorting());
    expect(names()).toEqual(["Carol", "Alice", "Bob"]);
  });

  it("keeps a controlled slice pinned to the prop and reports resolved values", () => {
    const onSortingChange = vi.fn();
    const sorting: SortingState = [];
    const { result } = renderHook(() => useDataTable({
      data: people,
      columns,
      getRowId,
      sorting,
      onSortingChange
    }));

    act(() => result.current.getColumn("age")?.toggleSorting(false));

    expect(onSortingChange).toHaveBeenCalledWith([{ id: "age", desc: false }]);
    // Controlled: the instance still renders the prop's (empty) sorting.
    expect(result.current.getState().sorting).toEqual([]);
  });

  it("injects the selection and expander columns pinned to the left", () => {
    const { result } = renderHook(() => useDataTable({
      data: people,
      columns,
      getRowId,
      enableRowSelection: true,
      renderDetailPanel: () => null
    }));

    const leafIds = result.current.getAllLeafColumns().map(column => column.id);

    expect(leafIds.slice(0, 2)).toEqual([SELECTION_COLUMN_ID, EXPANDER_COLUMN_ID]);
    expect(result.current.getState().columnPinning.left?.slice(0, 2)).toEqual([
      SELECTION_COLUMN_ID,
      EXPANDER_COLUMN_ID
    ]);
  });

  it("wires filter variants from meta.filter for columns without their own filterFn", () => {
    const { result } = renderHook(() => useDataTable({
      data: people,
      columns: [
        {
          accessorKey: "name",
          header: "Name",
          meta: { filter: "multi-select" }
        }
      ],
      getRowId
    }));

    act(() => result.current.getColumn("name")?.setFilterValue(["Alice", "Bob"]));

    expect(result.current.getRowModel().rows).toHaveLength(2);
  });

  it("multi-select filtering is strict set membership, never substring matching", () => {
    // Regression: TanStack's arrIncludesSome degrades to String.includes on scalar values,
    // so choosing "active" also matched "inactive" rows.
    interface Account {
      id: string;
      state: string;
    }

    const accounts: Account[] = [
      { id: "1", state: "active" },
      { id: "2", state: "inactive" }
    ];

    const { result } = renderHook(() => useDataTable({
      data: accounts,
      columns: [
        {
          accessorKey: "state",
          header: "State",
          meta: { filter: "multi-select" }
        }
      ],
      getRowId: account => account.id
    }));

    act(() => result.current.getColumn("state")?.setFilterValue(["active"]));

    const { rows } = result.current.getRowModel();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.getValue("state")).toBe("active");
  });

  it("translates server pagination mode and resets pageIndex when inputs change", () => {
    const { result } = renderHook(() => useDataTable({
      data: people,
      columns,
      getRowId,
      enablePagination: true,
      paginationMode: "server",
      rowCount: 100,
      defaultPagination: { pageIndex: 3, pageSize: 10 }
    }));

    expect(result.current.options.manualPagination).toBe(true);
    expect(result.current.getPageCount()).toBe(10);
    expect(result.current.getState().pagination.pageIndex).toBe(3);

    act(() => result.current.setGlobalFilter("ali"));

    // §10.4: in server mode ledger performs the deterministic reset itself.
    expect(result.current.getState().pagination.pageIndex).toBe(0);
  });

  it("lets tableOptions through as the base layer but overrides managed keys with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { result } = renderHook(() => useDataTable({
      data: people,
      columns,
      getRowId,
      sortingMode: "client",
      tableOptions: { manualSorting: true, autoResetAll: false }
    }));

    // The managed translation wins over the escape hatch…
    expect(result.current.options.manualSorting).toBe(false);
    // …while unmanaged keys pass through untouched.
    expect(result.current.options.autoResetAll).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("tableOptions.manualSorting"));

    warn.mockRestore();
  });

  it("warns when selection is enabled without getRowId", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    renderHook(() => useDataTable({
      data: people,
      columns,
      enableRowSelection: true
    }));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("getRowId"));

    warn.mockRestore();
  });
});
