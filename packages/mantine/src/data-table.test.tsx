import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
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

// StrictMode mirrors real applications: its simulated unmounts caught a live editor bug once.
function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <MantineProvider>{children}</MantineProvider>
    </StrictMode>
  );
}

describe("DataTable", () => {
  it("renders rows under the kebab-case class contract with parity attributes", () => {
    const { container } = render(
      <DataTable striped columns={columns} data={people} getRowId={getRowId} />,
      { wrapper }
    );

    expect(container.querySelector(".ledger-root")).toBeTruthy();
    expect(container.querySelector<HTMLElement>(".ledger-root")?.dataset.striped).toBe("odd");
    expect(container.querySelectorAll(":scope .ledger-tbody .ledger-row")).toHaveLength(3);
    expect(container.querySelector<HTMLElement>("[data-row-id=\"1\"]")?.dataset.parity).toBe("odd");
    expect(container.querySelector<HTMLElement>("[data-row-id=\"2\"]")?.dataset.parity).toBe("even");
  });

  it("cycles aria-sort through header clicks", () => {
    const { container } = render(<DataTable columns={columns} data={people} getRowId={getRowId} />, {
      wrapper
    });

    const headerButton = screen.getByRole("button", { name: "Name" });
    const th = container.querySelector("[data-ledger-column-id=\"name\"]");

    // Regression: the sort control must be a NATIVE button — Mantine's UnstyledButton carries
    // an unlayered font-size that defeats the layered `font: inherit` on the header label.
    expect(headerButton.className).not.toContain("mantine-focus-auto");

    fireEvent.click(headerButton);
    expect(th?.getAttribute("aria-sort")).toBe("ascending");

    fireEvent.click(headerButton);
    expect(th?.getAttribute("aria-sort")).toBe("descending");

    fireEvent.click(headerButton);
    expect(th?.getAttribute("aria-sort")).toBeNull();
  });

  it("shows the empty state and the loading skeletons", () => {
    const { rerender } = render(
      <DataTable columns={columns} data={[]} emptyState="nothing here" getRowId={getRowId} />,
      { wrapper }
    );

    expect(screen.getByText("nothing here")).toBeTruthy();

    rerender(<DataTable loading columns={columns} data={[]} getRowId={getRowId} />);

    expect(screen.queryByText("nothing here")).toBeNull();
    expect(document.querySelectorAll(".ledger-tbody .ledger-row").length).toBeGreaterThan(0);
  });

  it("fires onRowClick with the row, but not from the selection checkbox", () => {
    const onRowClick = vi.fn();
    const { container } = render(
      <DataTable
        enableRowSelection
        columns={columns}
        data={people}
        getRowId={getRowId}
        onRowClick={onRowClick}
      />,
      { wrapper }
    );

    fireEvent.click(screen.getByText("Carol"));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0]?.[0]?.original).toEqual(people[0]);

    const rowCheckbox = container.querySelectorAll("input[type=\"checkbox\"]")[1];
    expect(rowCheckbox).toBeTruthy();
    fireEvent.click(rowCheckbox as Element);

    // The covenant (§10.5): selection never triggers onRowClick.
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLElement>("[data-row-id=\"1\"]")?.dataset.selected).toBe("true");
  });

  it("select-all covers the page and clears back", () => {
    const { container } = render(
      <DataTable enableRowSelection columns={columns} data={people} getRowId={getRowId} />,
      { wrapper }
    );

    const headerCheckbox = container.querySelector("input[type=\"checkbox\"]");
    fireEvent.click(headerCheckbox as Element);

    expect(container.querySelectorAll("[data-selected]")).toHaveLength(3);

    fireEvent.click(headerCheckbox as Element);
    expect(container.querySelectorAll("[data-selected]")).toHaveLength(0);
  });

  it("renders the pagination bar with the summary and page-size control", () => {
    render(
      <DataTable
        enablePagination
        columns={columns}
        data={people}
        defaultPagination={{ pageIndex: 0, pageSize: 2 }}
        getRowId={getRowId}
      />,
      { wrapper }
    );

    expect(screen.getByText("1–2 of 3")).toBeTruthy();
    expect(document.querySelectorAll(".ledger-tbody .ledger-row")).toHaveLength(2);
  });

  it("never fires onEndReached from an unlaid-out (zero-height) viewport", async () => {
    // Regression: a viewport that has not been laid out reads as distance 0 from the bottom
    // and used to trigger a phantom page load on mount.
    const onEndReached = vi.fn();

    render(
      <DataTable columns={columns} data={people} getRowId={getRowId} onEndReached={onEndReached} />,
      { wrapper }
    );

    await new Promise(resolve => {
      setTimeout(resolve, 40);
    });

    expect(onEndReached).not.toHaveBeenCalled();
  });

  it("renders header and body as separate presentational tables under one ARIA table", () => {
    const { container } = render(
      <DataTable withTableBorder columns={columns} data={people} getRowId={getRowId} />,
      { wrapper }
    );

    expect(container.querySelector(".ledger-main")?.getAttribute("role")).toBe("table");

    const tables = container.querySelectorAll(".ledger-table");
    expect(tables).toHaveLength(2);
    expect([...tables].every(table => table.getAttribute("role") === "presentation")).toBe(true);

    // The header table holds the thead, the body table the tbody — the scroller owns only the body.
    expect(container.querySelector(":scope .ledger-header .ledger-thead")).toBeTruthy();
    expect(container.querySelector(":scope .ledger-header .ledger-tbody")).toBeNull();
    expect(container.querySelector(":scope .ledger-scroller .ledger-tbody")).toBeTruthy();
    expect(container.querySelector(":scope .ledger-scroller .ledger-thead")).toBeNull();

    // Identical colgroups keep the two layouts pixel-equal.
    const colCounts = [...tables].map(table => table.querySelectorAll("col").length);
    expect(colCounts[0]).toBe(colCounts[1]);

    // Explicit roles restore the semantics the presentational tables gave up.
    expect(container.querySelectorAll("[role=\"columnheader\"]")).toHaveLength(2);
    expect(container.querySelectorAll(":scope .ledger-tbody [role=\"row\"]")).toHaveLength(3);
  });

  it("mirrors the body's horizontal scroll onto the header and forwards header wheel", () => {
    // Regression: a sticky in-scroller header made the vertical scrollbar span (and hide
    // under) the header; the split keeps the regions aligned through a scrollLeft mirror.
    const { container } = render(
      <DataTable columns={columns} data={people} getRowId={getRowId} tableMinWidth={2000} />,
      { wrapper }
    );

    const header = container.querySelector<HTMLElement>(".ledger-header");
    const viewport = container.querySelector<HTMLElement>(".mantine-ScrollArea-viewport");
    expect(header).toBeTruthy();
    expect(viewport).toBeTruthy();

    // Rubber-band overscroll would translate the body past the clamped scroll position the
    // mirror reads — the regions shear apart — so the viewport must not bounce.
    expect(viewport!.style.overscrollBehavior).toBe("none");

    viewport!.scrollLeft = 120;
    fireEvent.scroll(viewport!);
    expect(header!.scrollLeft).toBe(120);

    fireEvent.wheel(header!, { deltaX: 50 });
    expect(viewport!.scrollLeft).toBe(170);

    // Dominant-axis guard: a vertical-leaning wheel is not hijacked.
    fireEvent.wheel(header!, { deltaX: 5, deltaY: 100 });
    expect(viewport!.scrollLeft).toBe(170);
  });

  it("keeps the colgroup in pinned-aware display order", () => {
    // Regression: header cells and row cells render pinned columns first, but
    // getVisibleLeafColumns ignores pinning — a mid-table pinned column drifted onto its
    // neighbor's <col> width until the colgroup followed the same display order.
    const { container } = render(
      <DataTable
        columns={columns}
        data={people}
        defaultColumnPinning={{ left: ["age"] }}
        getRowId={getRowId}
      />,
      { wrapper }
    );

    const headerOrder = [...container.querySelectorAll<HTMLElement>(":scope .ledger-header th")].map(
      th => th.dataset.ledgerColumnId
    );
    expect(headerOrder).toEqual(["age", "name"]);

    const colOrder = [...container.querySelectorAll<HTMLTableColElement>(":scope .ledger-header col")].map(
      col => col.style.width
    );
    expect(colOrder).toEqual(["var(--ledger-col-age)", "var(--ledger-col-name)"]);
  });

  it("renders column footers in an always-visible region outside the scroller", () => {
    const withFooter: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        footer: "Total"
      },
      { accessorKey: "age", header: "Age" }
    ];

    const { container } = render(
      <DataTable columns={withFooter} data={people} getRowId={getRowId} />,
      { wrapper }
    );

    expect(container.querySelectorAll(".ledger-table")).toHaveLength(3);
    expect(container.querySelector(":scope .ledger-footer .ledger-tfoot")).toBeTruthy();
    expect(container.querySelector(":scope .ledger-scroller .ledger-tfoot")).toBeNull();

    const footerCell = container.querySelector(":scope .ledger-footer .ledger-footer-cell");
    expect(footerCell?.textContent).toBe("Total");
    expect(footerCell?.getAttribute("role")).toBe("cell");
  });

  it("expands a detail panel as its own row", () => {
    const { container } = render(
      <DataTable
        columns={columns}
        data={people}
        getRowId={getRowId}
        renderDetailPanel={row => <div>{`detail:${row.original.name}`}</div>}
      />,
      { wrapper }
    );

    const expander = container.querySelector(":scope .ledger-expander-cell button");
    expect(expander).toBeTruthy();
    fireEvent.click(expander as Element);

    expect(screen.getByText("detail:Carol")).toBeTruthy();
    expect(container.querySelector("[data-detail-row]")).toBeTruthy();
  });
});
