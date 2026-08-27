import type { ColumnDef, DataTableRowReorder } from "./types";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "./data-table";

interface Item {
  id: string;
  name: string;
  stock: number;
}

const items: Item[] = [
  {
    id: "1",
    name: "Wireless Mouse",
    stock: 10
  },
  {
    id: "2",
    name: "Projector",
    stock: 20
  },
  {
    id: "3",
    name: "Webcam",
    stock: 30
  }
];

const getRowId = (item: Item) => item.id;

const columns: Array<ColumnDef<Item, any>> = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "stock", header: "Stock" }
];

function view(options: {
  onRowReorder?: (reorder: DataTableRowReorder<Item>) => void;
  enableRowOrdering?: boolean;
  defaultSorting?: Array<{ id: string; desc: boolean }>;
  getSubRows?: (item: Item) => Item[] | undefined;
}) {
  return (
    <StrictMode>
      <MantineProvider>
        <DataTable
          columns={columns}
          data={items}
          getRowId={getRowId}
          {...options}
          enableRowOrdering={options.enableRowOrdering ?? true}
        />
      </MantineProvider>
    </StrictMode>
  );
}

const handles = () => screen.queryAllByLabelText("Drag to reorder row") as HTMLButtonElement[];
const handle = (index: number) => handles()[index] as HTMLButtonElement;
const announcer = () => document.querySelector("[role=\"status\"]") as HTMLElement;
const rowOf = (element: HTMLElement) => element.closest("tr") as HTMLTableRowElement;

Element.prototype.scrollIntoView ??= () => undefined;

describe("row ordering gate", () => {
  it("injects one handle per row when the switch and the handler are both present", () => {
    render(view({ onRowReorder: vi.fn() }));

    expect(handles()).toHaveLength(3);
  });

  it("injects nothing without the handler — there is nowhere for a move to land", () => {
    render(view({}));

    expect(handles()).toHaveLength(0);
  });

  it("injects nothing while the switch is off", () => {
    render(view({ enableRowOrdering: false, onRowReorder: vi.fn() }));

    expect(handles()).toHaveLength(0);
  });

  it("injects nothing for tree data", () => {
    render(view({ getSubRows: () => undefined, onRowReorder: vi.fn() }));

    expect(handles()).toHaveLength(0);
  });

  it("disables the handles while sorting controls the visible order", () => {
    const onRowReorder = vi.fn();
    render(view({ defaultSorting: [{ desc: false, id: "name" }], onRowReorder }));

    const first = handle(0);
    expect(first.getAttribute("aria-disabled")).toBe("true");

    fireEvent.keyDown(first, { key: " " });
    expect(first.hasAttribute("aria-pressed")).toBe(false);
    fireEvent.keyDown(first, { key: " " });
    expect(onRowReorder).not.toHaveBeenCalled();
  });
});

describe("keyboard reordering", () => {
  it("lifts, steps, announces, and commits arrayMove indexes", () => {
    const onRowReorder = vi.fn();
    render(view({ onRowReorder }));

    const first = handle(0);
    fireEvent.keyDown(first, { key: " " });

    expect(first.getAttribute("aria-pressed")).toBe("true");
    expect(announcer().textContent).toContain("Wireless Mouse lifted");

    fireEvent.keyDown(first, { key: "ArrowDown" });

    // From rest the first step skips the no-op position: the row would land at index 1, shown
    // as "after Projector".
    expect(rowOf(handle(1)).dataset.dropSide).toBe("after");
    expect(announcer().textContent).toBe("After Projector");

    fireEvent.keyDown(first, { key: " " });

    expect(onRowReorder).toHaveBeenCalledTimes(1);
    const reorder = onRowReorder.mock.calls[0]![0] as DataTableRowReorder<Item>;
    expect(reorder.fromIndex).toBe(0);
    expect(reorder.toIndex).toBe(1);
    expect(reorder.row.id).toBe("1");
    expect(first.hasAttribute("aria-pressed")).toBe(false);
    expect(announcer().textContent).toBe("Wireless Mouse dropped");
  });

  it("jumps to the edges with Home and End", () => {
    const onRowReorder = vi.fn();
    render(view({ onRowReorder }));

    const middle = handle(1);
    fireEvent.keyDown(middle, { key: " " });
    fireEvent.keyDown(middle, { key: "End" });

    expect(rowOf(handle(2)).dataset.dropSide).toBe("after");
    expect(announcer().textContent).toBe("After Webcam");

    fireEvent.keyDown(middle, { key: "Home" });

    expect(rowOf(handle(0)).dataset.dropSide).toBe("before");
    expect(announcer().textContent).toBe("Before Wireless Mouse");

    fireEvent.keyDown(middle, { key: " " });

    const reorder = onRowReorder.mock.calls[0]![0] as DataTableRowReorder<Item>;
    expect(reorder.fromIndex).toBe(1);
    expect(reorder.toIndex).toBe(0);
  });

  it("stepping into the wall from the first row shows no target", () => {
    const onRowReorder = vi.fn();
    render(view({ onRowReorder }));

    const first = handle(0);
    fireEvent.keyDown(first, { key: " " });
    fireEvent.keyDown(first, { key: "ArrowUp" });

    expect(document.querySelector("[data-drop-side]")).toBeNull();

    // Dropping without a target is a drop back in place — announced, never committed.
    fireEvent.keyDown(first, { key: " " });
    expect(onRowReorder).not.toHaveBeenCalled();
    expect(announcer().textContent).toBe("Wireless Mouse dropped");
  });

  it("Escape cancels the lift without committing", () => {
    const onRowReorder = vi.fn();
    render(view({ onRowReorder }));

    const first = handle(0);
    fireEvent.keyDown(first, { key: " " });
    fireEvent.keyDown(first, { key: "ArrowDown" });
    fireEvent.keyDown(first, { key: "Escape" });

    expect(onRowReorder).not.toHaveBeenCalled();
    expect(document.querySelector("[data-drop-side]")).toBeNull();
    expect(first.hasAttribute("aria-pressed")).toBe(false);
    expect(announcer().textContent).toBe("Reorder canceled");
  });

  it("focus leaving the handle abandons the lift", () => {
    const onRowReorder = vi.fn();
    render(view({ onRowReorder }));

    const first = handle(0);
    fireEvent.keyDown(first, { key: " " });
    fireEvent.blur(first);

    expect(onRowReorder).not.toHaveBeenCalled();
    expect(first.hasAttribute("aria-pressed")).toBe(false);
    expect(announcer().textContent).toBe("Reorder canceled");
  });

  it("the lifted row dims in place through data-dragging", () => {
    render(view({ onRowReorder: vi.fn() }));

    const first = handle(0);
    fireEvent.keyDown(first, { key: " " });

    expect(Object.hasOwn(rowOf(first).dataset, "dragging")).toBe(true);

    fireEvent.keyDown(first, { key: "Escape" });

    expect(Object.hasOwn(rowOf(first).dataset, "dragging")).toBe(false);
  });
});
