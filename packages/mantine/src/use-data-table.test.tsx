import type { ColumnDef, FilterFn, SortingState } from "@tanstack/react-table";

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EXPANDER_COLUMN_ID, SELECTION_COLUMN_ID } from "./build-columns";
import { ledgerFilterFns } from "./filter-fns";
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
const startsWithFilter: FilterFn<Person> = (row, columnId, value: string) => String(row.getValue(columnId)).startsWith(value);
const rejectFilter: FilterFn<Person> = () => false;

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

  it("does not reset server pagination during a root StrictMode mount", () => {
    const { result } = renderHook(() => useDataTable({
      data: people,
      columns,
      getRowId,
      paginationMode: "server",
      rowCount: 100,
      defaultPagination: { pageIndex: 3, pageSize: 10 }
    }), { reactStrictMode: true });

    expect(result.current.getState().pagination).toEqual({ pageIndex: 3, pageSize: 10 });
  });

  it.each([
    { autoResetAll: false },
    { autoResetPageIndex: false },
    { autoResetAll: false, autoResetPageIndex: true }
  ])("respects the server pagination reset policy %#", resetPolicy => {
    const { result } = renderHook(() => useDataTable({
      data: people,
      columns,
      getRowId,
      paginationMode: "server",
      rowCount: 100,
      defaultPagination: { pageIndex: 3, pageSize: 10 },
      tableOptions: resetPolicy
    }));

    act(() => result.current.setGlobalFilter("ali"));

    expect(result.current.getState().pagination.pageIndex).toBe(3);
  });

  it("keeps the deterministic zero reset authoritative when autoResetAll is true", async () => {
    const { result } = renderHook(() => useDataTable({
      data: people,
      columns,
      getRowId,
      paginationMode: "server",
      rowCount: 100,
      defaultPagination: { pageIndex: 3, pageSize: 10 },
      tableOptions: { autoResetAll: true }
    }));

    result.current.getRowModel();
    act(() => result.current.setGlobalFilter("ali"));
    result.current.getRowModel();

    await act(() => new Promise<void>(resolve => {
      queueMicrotask(resolve);
    }));

    expect(result.current.getState().pagination.pageIndex).toBe(0);
    expect(result.current.options.autoResetAll).toBeUndefined();
    expect(result.current.options.autoResetPageIndex).toBe(false);
    expect(result.current.options.autoResetExpanded).toBe(true);
  });

  it("merges custom filter functions while keeping ledger filter ids reserved", () => {
    const filterFns = {
      fuzzy: startsWithFilter,
      "ledger-one-of": rejectFilter
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { result } = renderHook(() => useDataTable({
      data: people,
      columns,
      getRowId,
      enableGlobalFilter: true,
      tableOptions: {
        filterFns,
        globalFilterFn: "fuzzy"
      }
    }));

    act(() => result.current.setGlobalFilter("Ali"));

    expect(result.current.getRowModel().rows.map(row => row.original.name)).toEqual(["Alice"]);
    expect(result.current.options.filterFns?.["ledger-one-of"]).toBe(ledgerFilterFns["ledger-one-of"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ledger-one-of"));

    warn.mockRestore();
  });

  it("resets every state slice to its declared default", () => {
    const defaults = {
      sorting: [{ id: "age", desc: true }],
      columnFilters: [{ id: "name", value: "a" }],
      globalFilter: "a",
      pagination: { pageIndex: 2, pageSize: 1 },
      rowSelection: { 2: true },
      expanded: { 2: true },
      columnVisibility: { age: false },
      columnPinning: { left: ["name"] },
      columnOrder: ["age", "name"],
      columnSizing: { name: 240 },
      grouping: ["name"],
      rowPinning: { top: ["2"], bottom: [] }
    };
    const { result } = renderHook(() => useDataTable({
      data: people,
      columns,
      getRowId,
      defaultSorting: defaults.sorting,
      defaultColumnFilters: defaults.columnFilters,
      defaultGlobalFilter: defaults.globalFilter,
      defaultPagination: defaults.pagination,
      defaultRowSelection: defaults.rowSelection,
      defaultExpanded: defaults.expanded,
      defaultColumnVisibility: defaults.columnVisibility,
      defaultColumnPinning: defaults.columnPinning,
      defaultColumnOrder: defaults.columnOrder,
      defaultColumnSizing: defaults.columnSizing,
      defaultGrouping: defaults.grouping,
      defaultRowPinning: defaults.rowPinning
    }));

    act(() => {
      result.current.setSorting([]);
      result.current.setColumnFilters([]);
      result.current.setGlobalFilter("");
      result.current.setPagination({ pageIndex: 0, pageSize: 20 });
      result.current.setRowSelection({});
      result.current.setExpanded({});
      result.current.setColumnVisibility({});
      result.current.setColumnPinning({});
      result.current.setColumnOrder([]);
      result.current.setColumnSizing({});
      result.current.setGrouping([]);
      result.current.setRowPinning({ top: [], bottom: [] });
    });
    act(() => {
      result.current.resetSorting();
      result.current.resetColumnFilters();
      result.current.resetGlobalFilter();
      result.current.resetPagination();
      result.current.resetRowSelection();
      result.current.resetExpanded();
      result.current.resetColumnVisibility();
      result.current.resetColumnPinning();
      result.current.resetColumnOrder();
      result.current.resetColumnSizing();
      result.current.resetGrouping();
      result.current.resetRowPinning();
    });

    expect(result.current.getState()).toMatchObject(defaults);
  });

  it("resets pagination and global filtering to ledger fallbacks", () => {
    const { result } = renderHook(() => useDataTable({
      data: people,
      columns,
      getRowId
    }));

    act(() => {
      result.current.setPagination({ pageIndex: 4, pageSize: 50 });
      result.current.setGlobalFilter("alice");
    });
    act(() => {
      result.current.resetPagination();
      result.current.resetGlobalFilter(true);
    });

    expect(result.current.getState().pagination).toEqual({ pageIndex: 0, pageSize: 20 });
    expect(result.current.getState().globalFilter).toBe("");
  });

  it("keeps the current editor active when commit rejects navigation", () => {
    const { result } = renderHook(() => useDataTable({
      data: people,
      columns,
      getRowId
    }));
    const editing = () => result.current.options.meta?.ledger?.editing;

    act(() => editing()?.start({ rowId: "1", columnId: "name" }));
    act(() => editing()?.registerEditor({ commit: () => false, cancel: vi.fn() }));
    act(() => editing()?.start({ rowId: "2", columnId: "age" }));

    expect(editing()?.cell).toEqual({ rowId: "1", columnId: "name" });

    act(() => editing()?.stop({ commit: true }));

    expect(editing()?.cell).toEqual({ rowId: "1", columnId: "name" });
  });

  it("lets only the latest navigation request win after an async commit", async () => {
    const { promise: pendingCommit, resolve: resolveCommit } = Promise.withResolvers<boolean>();
    const foreignCommit = {
      then: pendingCommit.then.bind(pendingCommit)
    } as Promise<boolean>;
    const { result } = renderHook(() => useDataTable({
      data: people,
      columns,
      getRowId
    }));
    const editing = () => result.current.options.meta?.ledger?.editing;

    expect(foreignCommit).not.toBeInstanceOf(Promise);
    act(() => editing()?.start({ rowId: "1", columnId: "name" }));
    act(() => editing()?.registerEditor({ commit: () => foreignCommit, cancel: vi.fn() }));
    act(() => {
      editing()?.start({ rowId: "2", columnId: "name" });
      editing()?.start({ rowId: "3", columnId: "age" });
    });

    await act(async () => {
      resolveCommit(true);
      await pendingCommit;
    });

    expect(editing()?.cell).toEqual({ rowId: "3", columnId: "age" });
  });

  it("keeps the current editor active when a custom commit promise rejects", async () => {
    const rejectedCommit = Promise.reject(new Error("commit failed"));
    const { result } = renderHook(() => useDataTable({
      data: people,
      columns,
      getRowId
    }));
    const editing = () => result.current.options.meta?.ledger?.editing;

    act(() => editing()?.start({ rowId: "1", columnId: "name" }));
    act(() => editing()?.registerEditor({ commit: () => rejectedCommit, cancel: vi.fn() }));
    await act(async () => {
      editing()?.start({ rowId: "2", columnId: "age" });
      await rejectedCommit.catch(() => undefined);
    });

    expect(editing()?.cell).toEqual({ rowId: "1", columnId: "name" });
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
