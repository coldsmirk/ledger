import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";

import type { UseDataTableOptions } from "./types";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { SELECTION_COLUMN_ID } from "./build-columns";
import { DataTableColumnsPanel } from "./columns-panel";
import { useDataTable } from "./use-data-table";

interface Person {
  id: string;
  name: string;
  email: string;
  age: number;
}

const people: Person[] = [
  {
    id: "1",
    name: "Carol",
    email: "carol@x.dev",
    age: 30
  },
  {
    id: "2",
    name: "Alice",
    email: "alice@x.dev",
    age: 25
  }
];

const columns: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "Name",
    size: 130
  },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "age", header: "Age" }
];

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <MantineProvider>{children}</MantineProvider>
    </StrictMode>
  );
}

/**
 * The panel with no trigger — its primary shape, and the reason a test never has to open a
 * popover first.
 */
function Panel(options: Partial<UseDataTableOptions<Person>>) {
  const table = useDataTable({
    data: people,
    columns,
    getRowId: person => person.id,
    ...options
  } as UseDataTableOptions<Person>);

  return <DataTableColumnsPanel table={table} />;
}

const rows = () => [...document.querySelectorAll<HTMLElement>(".ledger-columns-panel-item")];

const rowFor = (title: string) => rows().find(row => row.textContent?.includes(title))!;

const visibilityBox = (title: string) => within(rowFor(title)).getByRole<HTMLInputElement>("checkbox");

const widthInput = (title: string) => within(rowFor(title)).getByLabelText<HTMLInputElement>("Width");

describe("DataTable.ColumnsPanel", () => {
  it("renders bare, keeps hidden columns listed, and never lists ledger's injected columns", () => {
    render(<Panel enableRowSelection defaultColumnVisibility={{ email: false }} />, { wrapper });

    expect(rows().map(row => row.textContent)).toEqual(["Name", "Email", "Age"]);
    expect(document.body.innerHTML).not.toContain(SELECTION_COLUMN_ID);

    // The trap door this panel exists to close: a hidden column stays listed, so it can come
    // back without a page refresh. `data-hidden` is the stylesheet's hook for dimming the name.
    expect(visibilityBox("Email").checked).toBe(false);
    expect(rowFor("Email").dataset.hidden).toBe("true");
    fireEvent.click(visibilityBox("Email"));
    expect(visibilityBox("Email").checked).toBe(true);
    expect(rowFor("Email").dataset.hidden).toBeUndefined();
  });

  it("disables the checkbox of a column that declares it cannot hide", () => {
    const fixed: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        enableHiding: false
      },
      { accessorKey: "age", header: "Age" }
    ];

    render(<Panel columns={fixed} />, { wrapper });

    expect(visibilityBox("Name").disabled).toBe(true);
    expect(visibilityBox("Age").disabled).toBe(false);
  });

  it("moves a column through the three pin states", () => {
    const onColumnPinningChange = vi.fn();

    render(<Panel onColumnPinningChange={onColumnPinningChange} />, { wrapper });

    fireEvent.click(within(rowFor("Name")).getByLabelText("Pin to left"));
    expect(onColumnPinningChange).toHaveBeenLastCalledWith({ left: ["name"], right: [] });

    fireEvent.click(within(rowFor("Name")).getByLabelText("Pin to right"));
    expect(onColumnPinningChange).toHaveBeenLastCalledWith({ left: [], right: ["name"] });

    fireEvent.click(within(rowFor("Name")).getByLabelText("Unpin"));
    expect(onColumnPinningChange).toHaveBeenLastCalledWith({ left: [], right: [] });
  });

  it("never leaks ledger's injected column ids into the pinning slice", () => {
    const onColumnPinningChange = vi.fn();

    render(<Panel enableRowSelection onColumnPinningChange={onColumnPinningChange} />, { wrapper });

    fireEvent.click(within(rowFor("Age")).getByLabelText("Pin to right"));

    // `getState().columnPinning` carries the merged `ledger:select`, so any write derived from it
    // would echo that id back to the consumer and into persisted layout.
    expect(onColumnPinningChange).toHaveBeenLastCalledWith({ left: [], right: ["age"] });
  });

  it("lists the pinned zones ahead of the centre, in the table's display order", () => {
    render(<Panel defaultColumnPinning={{ left: ["age"], right: ["name"] }} />, { wrapper });

    expect(rows().map(row => row.textContent)).toEqual(["Age", "Email", "Name"]);
  });

  it("captions the pinned zones, and shows no captions while nothing is pinned", () => {
    const flat = render(<Panel />, { wrapper });

    expect(screen.queryByText("Pinned left")).toBeNull();
    expect(screen.queryByText("Pinned right")).toBeNull();

    flat.unmount();
    render(<Panel defaultColumnPinning={{ left: ["age"], right: ["name"] }} />, { wrapper });

    expect(screen.getByText("Pinned left")).toBeTruthy();
    expect(screen.getByText("Pinned right")).toBeTruthy();
  });

  it("fixes a width and clears it back to auto", () => {
    const onColumnSizingChange = vi.fn();

    render(<Panel enableColumnResizing onColumnSizingChange={onColumnSizingChange} />, { wrapper });

    expect(widthInput("Name").value).toBe("");

    fireEvent.change(widthInput("Name"), { target: { value: "160" } });
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 160 });

    // The override also survives at rest, as the row's dimmed width mark.
    expect(within(rowFor("Name")).getByText("160")).toBeTruthy();

    // Cleared means "no override", not zero: the entry is dropped entirely, so the width engine
    // reads the column as unsized again (docs/sizing.md) — and the mark goes with it.
    fireEvent.change(widthInput("Name"), { target: { value: "" } });
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({});
    expect(within(rowFor("Name")).queryByText("160")).toBeNull();
  });

  it("shows what an unset width actually falls back to, never a blanket Auto", () => {
    render(<Panel enableColumnResizing />, { wrapper });

    // `name` declares `size: 130`, so clearing its override returns it to 130 — not to grow.
    // The placeholder has to say so, or the field lies about a fixed column.
    expect(widthInput("Name").placeholder).toBe("130");
    expect(widthInput("Email").placeholder).toBe("Auto");
  });

  it("offers width and grouping only while the table enables them", () => {
    const { rerender } = render(<Panel />, { wrapper });

    expect(within(rowFor("Name")).queryByLabelText("Width")).toBeNull();
    expect(within(rowFor("Name")).queryByLabelText("Group by this column")).toBeNull();
    expect(document.querySelectorAll(".ledger-columns-panel-handle")).toHaveLength(0);

    rerender(<Panel enableColumnOrdering enableColumnResizing enableGrouping />);

    expect(within(rowFor("Name")).getByLabelText("Width")).toBeTruthy();
    expect(within(rowFor("Name")).getByLabelText("Group by this column")).toBeTruthy();
    expect(document.querySelectorAll(".ledger-columns-panel-handle")).toHaveLength(3);
  });

  it("groups and ungroups through the panel, the only built-in trigger there is", () => {
    const onGroupingChange = vi.fn();

    render(<Panel enableGrouping onGroupingChange={onGroupingChange} />, { wrapper });

    fireEvent.click(within(rowFor("Name")).getByLabelText("Group by this column"));
    expect(onGroupingChange).toHaveBeenLastCalledWith(["name"]);

    fireEvent.click(within(rowFor("Name")).getByLabelText("Ungroup"));
    expect(onGroupingChange).toHaveBeenLastCalledWith([]);
  });

  it("resets to the layout the application declared, not to an empty one", () => {
    const onColumnPinningChange = vi.fn();

    render(
      <Panel defaultColumnPinning={{ left: ["name"], right: [] }} onColumnPinningChange={onColumnPinningChange} />,
      { wrapper }
    );

    fireEvent.click(within(rowFor("Name")).getByLabelText("Unpin"));
    expect(onColumnPinningChange).toHaveBeenLastCalledWith({ left: [], right: [] });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    // Every TanStack resetColumnX() restores `table.initialState`, which useDataTable seeds from
    // the defaultX options — without that seeding the reset would land on an empty slice.
    expect(onColumnPinningChange).toHaveBeenLastCalledWith({ left: ["name"], right: [] });
  });

  it("opens from whatever trigger it is handed, and assumes nothing about it", async () => {
    render(<PanelWithTrigger />, { wrapper });

    expect(rows()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Columns" }));

    await waitFor(() => expect(rows().map(row => row.textContent)).toEqual(["Name", "Email", "Age"]));
  });
});

function PanelWithTrigger() {
  const table = useDataTable({
    data: people,
    columns,
    getRowId: person => person.id
  });

  return (
    <DataTableColumnsPanel table={table}>
      <button type="button">Columns</button>
    </DataTableColumnsPanel>
  );
}
