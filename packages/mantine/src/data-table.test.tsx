import type { ReactNode } from "react";

import type { ColumnDef, DataTableHandle } from "./types";

import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef, StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { DataTable, resolveVirtualDisplayIndex } from "./data-table";
import { defaultLabels } from "./labels";

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
    const { container, rerender } = render(
      <DataTable columns={columns} data={[]} getRowId={getRowId} />,
      { wrapper }
    );

    // The default is a rich Mantine EmptyState overlaid on the body region (data-empty scopes
    // the region's min-height floor).
    expect(container.querySelector<HTMLElement>(".ledger-root")?.dataset.empty).toBe("true");
    expect(container.querySelector(":scope .ledger-empty .mantine-EmptyState-root")).toBeTruthy();
    expect(screen.getByText("No data")).toBeTruthy();

    rerender(<DataTable columns={columns} data={[]} emptyState="nothing here" getRowId={getRowId} />);

    expect(screen.getByText("nothing here")).toBeTruthy();
    expect(container.querySelector(":scope .mantine-EmptyState-root")).toBeNull();

    rerender(<DataTable loading columns={columns} data={[]} getRowId={getRowId} />);

    expect(screen.queryByText("nothing here")).toBeNull();
    expect(document.querySelectorAll(".ledger-tbody .ledger-row").length).toBeGreaterThan(0);
  });

  it("shows no-results instead of no-data while a filter is active", () => {
    const filtered = render(
      <DataTable
        enableGlobalFilter
        columns={columns}
        data={people}
        defaultGlobalFilter="zzz-no-match"
        getRowId={getRowId}
      />,
      { wrapper }
    );

    expect(screen.getByText("No matching records")).toBeTruthy();
    filtered.unmount();

    render(<DataTable columns={columns} data={[]} getRowId={getRowId} />, { wrapper });

    expect(screen.getByText("No data")).toBeTruthy();
  });

  it("names the ARIA table itself, leaving the root wrapper anonymous", () => {
    const { container } = render(
      <DataTable aria-label="People" columns={columns} data={people} getRowId={getRowId} />,
      { wrapper }
    );

    expect(screen.getByRole("table", { name: "People" }).className).toContain("ledger-main");
    expect(container.querySelector<HTMLElement>(":scope .ledger-root")?.getAttribute("aria-label")).toBeNull();
  });

  it("renders the error panel over stale rows and wires the retry button", () => {
    const onRetry = vi.fn();
    const { container } = render(
      <DataTable error columns={columns} data={people} getRowId={getRowId} onRetry={onRetry} />,
      { wrapper }
    );

    expect(screen.getByText("Couldn't load data")).toBeTruthy();
    // Stale rows stay mounted beneath the scrim.
    expect(container.querySelectorAll(":scope .ledger-tbody .ledger-row")).toHaveLength(3);
    expect(container.querySelector(":scope .ledger-empty[data-variant=\"error\"][data-over-rows]")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("replaces the trailing loader with the load-more error row and retries onEndReached", () => {
    const onEndReached = vi.fn();
    const { container } = render(
      <DataTable
        loadMoreError
        columns={columns}
        data={people}
        getRowId={getRowId}
        onEndReached={onEndReached}
      />,
      { wrapper }
    );

    const alert = screen.getByRole("alert");

    expect(alert.textContent).toBe("Couldn't load more rows");
    // The alert rides inside the cell — announcing it must not cost the row its only cell.
    expect(container.querySelector(":scope .ledger-loader-row [role=\"cell\"]")?.contains(alert)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onEndReached).toHaveBeenCalledTimes(1);
  });

  it("tracks the active row from clicks and the viewport keyboard", () => {
    // jsdom has no scrollIntoView; the keyboard path calls it after each move.
    Element.prototype.scrollIntoView ??= () => undefined;

    const onActiveRowIdChange = vi.fn();
    const onRowActivate = vi.fn();
    const onRowClick = vi.fn();
    const { container } = render(
      <DataTable
        enableActiveRow
        columns={columns}
        data={people}
        getRowId={getRowId}
        onActiveRowIdChange={onActiveRowIdChange}
        onRowActivate={onRowActivate}
        onRowClick={onRowClick}
      />,
      { wrapper }
    );

    const rowFor = (id: string) => container.querySelector<HTMLElement>(`:scope [data-row-id="${CSS.escape(id)}"]`);

    fireEvent.click(rowFor("2")?.querySelector(":scope td") as Element);
    expect(rowFor("2")?.dataset.active).toBe("true");
    expect(onActiveRowIdChange).toHaveBeenLastCalledWith("2");
    // A click is both — the literal event and an activation.
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowActivate).toHaveBeenCalledTimes(1);

    const viewport = container.querySelector(":scope .ledger-scroller [tabindex=\"0\"]") as HTMLElement;
    expect(viewport).toBeTruthy();

    fireEvent.keyDown(viewport, { key: "ArrowDown" });
    expect(rowFor("3")?.dataset.active).toBe("true");
    expect(rowFor("2")?.dataset.active).toBeUndefined();

    fireEvent.keyDown(viewport, { key: "Home" });
    expect(rowFor("1")?.dataset.active).toBe("true");

    onRowClick.mockClear();
    onRowActivate.mockClear();
    fireEvent.keyDown(viewport, { key: "Enter" });
    expect((onRowActivate.mock.calls[0]?.[0] as { id: string }).id).toBe("1");
    // Enter is not a click: the pointer-only handler must never see a synthesized MouseEvent.
    expect(onRowClick).not.toHaveBeenCalled();
    expect((onRowActivate.mock.calls[0]?.[1] as { type: string }).type).toBe("keydown");
  });

  it("names the row-navigation focus stop and speaks each move of the current row", () => {
    const { container } = render(
      <DataTable enableActiveRow columns={columns} data={people} getRowId={getRowId} />,
      { wrapper }
    );

    // The focus stop is a roleless div: `generic` prohibits an accessible name, so the keyboard
    // model hangs off the ARIA table's description instead.
    const viewport = container.querySelector(":scope .ledger-scroller [tabindex=\"0\"]") as HTMLElement;
    expect(viewport.hasAttribute("aria-label")).toBe(false);

    const main = container.querySelector(":scope .ledger-main") as HTMLElement;
    const hintId = main.getAttribute("aria-describedby") as string;
    expect(hintId).toBeTruthy();
    expect(container.querySelector(`#${CSS.escape(hintId)}`)?.textContent).toBe(defaultLabels.rowNavigation);

    // Focus never leaves the viewport, so the live region is the only thing that reports the move.
    const announcer = container.querySelector(":scope [aria-live=\"polite\"]") as HTMLElement;
    expect(announcer).toBeTruthy();
    expect(announcer.textContent).toBe("");

    fireEvent.click(container.querySelector(":scope [data-row-id=\"2\"] td") as Element);
    expect(announcer.textContent).toBe(defaultLabels.currentRow("Alice", 2, people.length));

    fireEvent.keyDown(viewport, { key: "ArrowDown" });
    expect(announcer.textContent).toBe(defaultLabels.currentRow("Bob", 3, people.length));
  });

  it("re-speaks the current row when sorting moves it", () => {
    const { container } = render(
      <DataTable enableActiveRow columns={columns} data={people} getRowId={getRowId} />,
      { wrapper }
    );

    const announcer = container.querySelector(":scope [aria-live=\"polite\"]") as HTMLElement;

    fireEvent.click(container.querySelector(":scope [data-row-id=\"2\"] td") as Element);
    expect(announcer.textContent).toBe(defaultLabels.currentRow("Alice", 2, 3));

    // Same row, new position: an id-only dependency would leave the stale line standing.
    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(announcer.textContent).toBe(defaultLabels.currentRow("Alice", 1, 3));
  });

  it("hides the resize handle from assistive tech — the columns panel is its keyboard route", () => {
    const { container } = render(
      <DataTable enableColumnResizing columns={columns} data={people} getRowId={getRowId} />,
      { wrapper }
    );

    const resizer = container.querySelector(":scope [data-ledger-resizer]");
    expect(resizer).toBeTruthy();
    expect(resizer?.getAttribute("aria-hidden")).toBe("true");
    expect(resizer?.hasAttribute("tabindex")).toBe(false);
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

  it("drops the header region and its rows from the ARIA row numbering", () => {
    const { container } = render(
      <DataTable
        virtualized
        columns={columns}
        data={people}
        getRowId={getRowId}
        withColumnHeaders={false}
      />,
      { wrapper }
    );

    expect(container.querySelector(":scope .ledger-header")).toBeNull();
    expect(container.querySelectorAll(":scope .ledger-header-cell")).toHaveLength(0);
    // No header rows to number past, so the count is the three body rows alone.
    expect(screen.getByRole("table").getAttribute("aria-rowcount")).toBe("3");
  });

  it("names every built-in control by what it acts on", () => {
    const named: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { filter: "text", edit: "text" }
      },
      {
        accessorKey: "age",
        header: "Age",
        meta: { filter: "range" }
      }
    ];
    render(
      <DataTable
        enableEditing
        enablePagination
        enableRowSelection
        columns={named}
        data={people}
        getRowId={getRowId}
      />,
      { wrapper }
    );

    // Two funnels, two names — a shared "Filter column" would make them indistinguishable.
    expect(screen.getByLabelText("Filter Name")).toBeTruthy();
    expect(screen.getByLabelText("Filter Age")).toBeTruthy();
    expect(screen.getByLabelText("Select all rows")).toBeTruthy();

    // The page-size select points at its own visible text rather than duplicating it.
    const pageSize = screen.getByLabelText("Rows per page");

    expect(pageSize.tagName).toBe("INPUT");
    expect(pageSize.getAttribute("aria-labelledby")).toBe(screen.getByText("Rows per page").id);

    fireEvent.doubleClick(screen.getByText("Carol"));
    expect(screen.getByLabelText("Edit Name")).toBeTruthy();
  });

  it("renders radios in a shared group for single-select, and no select-all", () => {
    const { container } = render(
      <DataTable
        enableRowSelection
        columns={columns}
        data={people}
        enableMultiRowSelection={false}
        getRowId={getRowId}
      />,
      { wrapper }
    );

    const radios = container.querySelectorAll<HTMLInputElement>("input[type=\"radio\"]");

    expect(radios).toHaveLength(3);
    expect(container.querySelectorAll("input[type=\"checkbox\"]")).toHaveLength(0);
    // One group, so the platform's own arrow-key navigation applies.
    expect(new Set([...radios].map(radio => radio.name)).size).toBe(1);

    fireEvent.click(radios[0] as Element);
    fireEvent.click(radios[1] as Element);
    expect(container.querySelectorAll("[data-selected]")).toHaveLength(1);
  });

  it("merges selectionColumn and expanderColumn over the injected defaults", () => {
    const { container } = render(
      <DataTable
        enableRowSelection
        columns={columns}
        data={people}
        expanderColumn={{ size: 60 }}
        getRowId={getRowId}
        renderDetailPanel={row => <span>{row.original.name}</span>}
        selectionColumn={{
          size: 72,
          cell: ({ row }) => <button type="button">{`pick ${row.id}`}</button>
        }}
      />,
      { wrapper }
    );

    // The author's renderer replaces the checkbox…
    expect(screen.getByRole("button", { name: "pick 1" })).toBeTruthy();
    expect(container.querySelectorAll("input[type=\"checkbox\"]")).toHaveLength(1);

    // …while the reserved id, and with it the internal-column treatment, survives.
    const selectionCell = container.querySelector<HTMLElement>(":scope .ledger-selection-cell");

    expect(selectionCell?.dataset.ledgerColumnId).toBe("ledger:select");
    expect(container.querySelector<HTMLElement>(":scope .ledger-expander-cell")).toBeTruthy();
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
        defaultColumnPinning={{ start: ["age"], end: [] }}
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
    expect(colOrder).toEqual(["var(--ledger-col-width-age)", "var(--ledger-col-width-name)"]);
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

  it("skips the footer levels a grouped header mirrors but nothing fills", () => {
    // getFooterGroups() mirrors every header level. With totals only on the leaves the group
    // level came out as an empty row that still drew row and column borders under the totals.
    const grouped: Array<ColumnDef<Person, any>> = [
      {
        id: "who",
        header: "Who",
        columns: [
          {
            accessorKey: "name",
            header: "Name",
            footer: "Total"
          },
          { accessorKey: "age", header: "Age" }
        ]
      }
    ];

    const { container } = render(
      <DataTable withColumnBorders columns={grouped} data={people} getRowId={getRowId} />,
      { wrapper }
    );

    // Two header levels, but only the one footer level that carries a `footer`.
    expect(container.querySelectorAll(":scope .ledger-header .ledger-header-row")).toHaveLength(2);
    expect(container.querySelectorAll(":scope .ledger-footer .ledger-footer-row")).toHaveLength(1);
    expect(container.querySelector(":scope .ledger-footer .ledger-footer-cell")?.textContent).toBe("Total");
  });

  it("does not render a footer region when every footer-bearing column is hidden", () => {
    const withFooter: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        footer: "Total"
      },
      { accessorKey: "age", header: "Age" }
    ];

    const { container } = render(
      <DataTable
        columns={withFooter}
        data={people}
        defaultColumnVisibility={{ name: false }}
        getRowId={getRowId}
      />,
      { wrapper }
    );

    expect(container.querySelectorAll(".ledger-table")).toHaveLength(2);
    expect(container.querySelector(".ledger-footer")).toBeNull();
  });

  it("invalidates memoized rows for same-id definitions and editing option changes", () => {
    const handle = createRef<DataTableHandle<Person>>();
    const firstCommit = vi.fn();
    const secondCommit = vi.fn();
    const firstColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        cell: context => `first:${context.getValue()}`,
        meta: { edit: "text" }
      }
    ];
    const secondColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        cell: context => `second:${context.getValue()}`,
        meta: { edit: "text" }
      }
    ];

    const { rerender } = render(
      <DataTable
        columns={firstColumns}
        data={people}
        editTrigger="click"
        enableEditing={false}
        getRowId={getRowId}
        handleRef={handle}
        onEditCommit={firstCommit}
      />,
      { wrapper }
    );

    expect(screen.getByText("first:Carol")).toBeTruthy();
    fireEvent.click(screen.getByText("first:Carol"));
    expect(screen.queryByRole("textbox")).toBeNull();

    // Same ids, new renderer/meta definition: the row must not retain its old cells.
    rerender(
      <DataTable
        columns={secondColumns}
        data={people}
        editTrigger="click"
        enableEditing={false}
        getRowId={getRowId}
        handleRef={handle}
        onEditCommit={firstCommit}
      />
    );
    expect(screen.getByText("second:Carol")).toBeTruthy();

    // Keep the column definition stable from here onward so each editing option is independently
    // responsible for invalidating the memoized row.
    rerender(
      <DataTable
        enableEditing
        columns={secondColumns}
        data={people}
        editTrigger="double-click"
        getRowId={getRowId}
        handleRef={handle}
        onEditCommit={firstCommit}
      />
    );
    fireEvent.click(screen.getByText("second:Carol"));
    expect(screen.queryByRole("textbox")).toBeNull();

    rerender(
      <DataTable
        enableEditing
        columns={secondColumns}
        data={people}
        editTrigger="click"
        getRowId={getRowId}
        handleRef={handle}
        onEditCommit={firstCommit}
      />
    );
    fireEvent.click(screen.getByText("second:Carol"));
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });

    rerender(
      <DataTable
        enableEditing
        columns={secondColumns}
        data={people}
        editTrigger="click"
        getRowId={getRowId}
        handleRef={handle}
        onEditCommit={secondCommit}
      />
    );

    fireEvent.click(screen.getByText("second:Carol"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Caroline" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(firstCommit).not.toHaveBeenCalled();
    expect(secondCommit).toHaveBeenCalledTimes(1);
  });

  it("keeps memoized data rows out of column-resize renders", () => {
    const handle = createRef<DataTableHandle<Person>>();
    const renderCell = vi.fn((value: string) => value);
    const measuredColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        cell: context => renderCell(context.getValue())
      }
    ];

    render(
      <DataTable
        enableColumnResizing
        columns={measuredColumns}
        data={people}
        getRowId={getRowId}
        handleRef={handle}
      />,
      { wrapper }
    );
    const rendersBeforeResize = renderCell.mock.calls.length;

    act(() => handle.current?.table.setColumnSizing({ name: 320 }));

    expect(renderCell).toHaveBeenCalledTimes(rendersBeforeResize);
  });

  it("keeps memoized data rows out of re-renders from inline row handler props", () => {
    const renderCell = vi.fn((value: string) => value);
    const measuredColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        cell: context => renderCell(context.getValue())
      }
    ];

    const view = render(
      <DataTable columns={measuredColumns} data={people} getRowId={getRowId} onRowClick={() => undefined} />,
      { wrapper }
    );
    const rendersBeforeRerender = renderCell.mock.calls.length;

    // A fresh arrow per render is the common consumer shape — the context depends on the
    // handler's existence, and the stable wrapper absorbs the identity churn.
    view.rerender(
      <DataTable columns={measuredColumns} data={people} getRowId={getRowId} onRowClick={() => undefined} />
    );

    expect(renderCell).toHaveBeenCalledTimes(rendersBeforeRerender);
  });

  it("invalidates column geometry and rows when delimiter-bearing visible ids change", () => {
    const handle = createRef<DataTableHandle<Person>>();
    const collisionColumns: Array<ColumnDef<Person, any>> = [
      {
        id: "a",
        accessorFn: person => person.name,
        header: "A",
        cell: context => `a:${context.getValue()}`
      },
      {
        id: "b,c",
        accessorFn: person => person.name,
        header: "B,C",
        cell: context => `b,c:${context.getValue()}`
      },
      {
        id: "a,b",
        accessorFn: person => person.name,
        header: "A,B",
        cell: context => `a,b:${context.getValue()}`
      },
      {
        id: "c",
        accessorFn: person => person.name,
        header: "C",
        cell: context => `c:${context.getValue()}`
      }
    ];
    const { container } = render(
      <DataTable
        columns={collisionColumns}
        data={people}
        defaultColumnVisibility={{ "a,b": false, c: false }}
        getRowId={getRowId}
        handleRef={handle}
      />,
      { wrapper }
    );
    const firstRowText = () => [...container.querySelectorAll(":scope .ledger-tbody .ledger-row:first-child td")]
      .map(cell => cell.textContent);

    expect(firstRowText()).toEqual(["a:Carol", "b,c:Carol"]);

    act(() => handle.current?.table.setColumnVisibility({ a: false, "b,c": false }));

    expect(firstRowText()).toEqual(["a,b:Carol", "c:Carol"]);
    expect([...container.querySelectorAll<HTMLTableColElement>(":scope .ledger-header col")].map(col => col.style.width))
      .toEqual(["var(--ledger-col-width-a_2c_b)", "var(--ledger-col-width-c)"]);
  });

  it("renders tree expander toggles and the author's cell on parent rows", () => {
    interface Node {
      id: string;
      name: string;
      children?: Node[];
    }

    const treeData: Node[] = [
      {
        id: "a",
        name: "A",
        children: [{ id: "a1", name: "A1" }]
      }
    ];
    const treeColumns: Array<ColumnDef<Node, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        cell: context => `cell:${context.getValue()}`
      }
    ];

    const { container } = render(
      <DataTable
        columns={treeColumns}
        data={treeData}
        getRowId={node => node.id}
        getSubRows={node => node.children}
      />,
      { wrapper }
    );

    // Regression: TanStack's cell.getIsAggregated() is true for ANY row with subRows — a
    // grouping concept leaking into trees — and the aggregated branch swallowed the expander
    // button and bypassed the author's cell renderer on every parent row.
    expect(screen.getByText("cell:A")).toBeTruthy();

    const expander = container.querySelector(":scope .ledger-expander-cell button");
    expect(expander).toBeTruthy();

    fireEvent.click(expander as Element);
    expect(screen.getByText("cell:A1")).toBeTruthy();

    // Regression: injected headers are controls, not text — wrapped in the label scaffolding,
    // the [data-truncate] span's overflow: hidden clipped the expand-all icon.
    const headerToggle = container.querySelector(
      ":scope .ledger-header th[data-ledger-column-id=\"ledger:expander\"] button"
    );
    expect(headerToggle).toBeTruthy();
    expect(headerToggle!.closest("[data-truncate]")).toBeNull();
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

  it("renders expanded detail rows inside top and bottom pinned zones", () => {
    const { container } = render(
      <DataTable
        enableRowPinning
        columns={columns}
        data={people}
        defaultExpanded={{ 1: true, 3: true }}
        defaultRowPinning={{ top: ["1"], bottom: ["3"] }}
        getRowId={getRowId}
        renderDetailPanel={row => `detail:${row.original.name}`}
      />,
      { wrapper }
    );

    expect(screen.getByText("detail:Carol").closest("tr")?.dataset.pinnedRow).toBe("top");
    expect(screen.getByText("detail:Bob").closest("tr")?.dataset.pinnedRow).toBe("bottom");
    expect(container.querySelectorAll("[data-row-id=\"1\"]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-row-id=\"3\"]")).toHaveLength(1);
  });

  it("counts every logical virtual row and assigns continuous ARIA indexes across regions", () => {
    const ariaColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        footer: "Total"
      },
      { accessorKey: "age", header: "Age" }
    ];
    const { container } = render(
      <DataTable
        defaultExpanded
        enableRowPinning
        loadingMore
        virtualized
        columns={ariaColumns}
        data={people}
        defaultRowPinning={{ top: ["1"], bottom: ["3"] }}
        getRowId={getRowId}
        renderDetailPanel={row => `detail:${row.original.name}`}
      />,
      { wrapper }
    );

    expect(container.querySelector(".ledger-main")?.getAttribute("aria-rowcount")).toBe("9");
    expect(container.querySelector(".ledger-header-row")?.getAttribute("aria-rowindex")).toBe("1");
    expect(container.querySelector("[data-row-id=\"1\"]")?.getAttribute("aria-rowindex")).toBe("2");
    expect(screen.getByText("detail:Carol").closest("tr")?.getAttribute("aria-rowindex")).toBe("3");
    expect(container.querySelector("[data-row-id=\"3\"]")?.getAttribute("aria-rowindex")).toBe("6");
    expect(screen.getByText("detail:Bob").closest("tr")?.getAttribute("aria-rowindex")).toBe("7");
    expect(container.querySelector(".ledger-loader-row")?.getAttribute("aria-rowindex")).toBe("8");
    expect(container.querySelector(".ledger-footer-row")?.getAttribute("aria-rowindex")).toBe("9");
  });

  it("resolves virtual scroll indexes from center rows and ignores pinned targets", () => {
    const handle = createRef<DataTableHandle<Person>>();

    render(
      <DataTable
        enableRowPinning
        virtualized
        columns={columns}
        data={people}
        defaultRowPinning={{ top: ["1"], bottom: [] }}
        getRowId={getRowId}
        handleRef={handle}
      />,
      { wrapper }
    );

    expect(resolveVirtualDisplayIndex(handle.current!.table, "2", false)).toBe(0);
    expect(resolveVirtualDisplayIndex(handle.current!.table, "1", false)).toBeNull();
  });
});
