import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataTableSearch } from "./search";
import { useDataTable } from "./use-data-table";

const rows = [{ id: "1", name: "Alice" }];
const columns = [{ accessorKey: "name", header: "Name" }];

function SearchHarness() {
  const table = useDataTable({
    data: rows,
    columns,
    getRowId: row => row.id,
    enableGlobalFilter: true
  });

  return (
    <MantineProvider>
      <DataTableSearch debounce={200} table={table} />
      <button type="button" onClick={() => table.resetGlobalFilter(true)}>External reset</button>
      <output data-testid="filter-value">{table.state.globalFilter}</output>
    </MantineProvider>
  );
}

describe("DataTable.Search", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("cancels a pending search when cleared", () => {
    render(<SearchHarness />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Alice" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    act(() => vi.advanceTimersByTime(250));

    expect(screen.getByTestId("filter-value").textContent).toBe("");
  });

  it("cancels a pending search when the filter resets externally", () => {
    render(<SearchHarness />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Alice" } });
    fireEvent.click(screen.getByRole("button", { name: "External reset" }));
    act(() => vi.advanceTimersByTime(250));

    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
    expect(screen.getByTestId("filter-value").textContent).toBe("");
  });
});
