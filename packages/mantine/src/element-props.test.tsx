import type { ReactNode } from "react";

import type { ColumnDef } from "./types";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "./data-table";
import { mergeElementProps, resolveElementProps } from "./element-props";

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

const getRowId = (person: Person) => person.id;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <MantineProvider>{children}</MantineProvider>
    </StrictMode>
  );
}

describe("mergeElementProps", () => {
  it("lets ledger's structural props win while className and style compose", () => {
    const merged: Record<string, unknown> = mergeElementProps(
      {
        role: "presentation",
        className: "app-row",
        style: {
          color: "red",
          margin: 4
        },
        "data-app": "yes"
      },
      {
        role: "row",
        className: "ledger-row",
        style: {
          color: "blue",
          padding: 8
        },
        "data-row-id": "1"
      }
    );

    expect(merged.role).toBe("row");
    expect(merged.className).toBe("ledger-row app-row");
    expect(merged.style).toEqual({
      color: "red",
      margin: 4,
      padding: 8
    });
    expect(merged["data-app"]).toBe("yes");
    expect(merged["data-row-id"]).toBe("1");
  });

  it("chains a handler both sides declare, ledger's first", () => {
    const order: string[] = [];
    const merged = mergeElementProps(
      { onClick: () => { order.push("consumer"); } },
      { onClick: () => { order.push("ledger"); } }
    );

    merged.onClick();
    expect(order).toEqual(["ledger", "consumer"]);
  });

  it("keeps the consumer's value where ledger's own prop is undefined", () => {
    const onClick = vi.fn();
    const merged: Record<string, unknown> = mergeElementProps(
      { onClick },
      { onClick: undefined, role: "cell" }
    );

    (merged.onClick as () => void)();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("passes ledger's own props straight through when there are none to merge", () => {
    const owned = { role: "row" };

    expect(mergeElementProps(undefined, owned)).toBe(owned);
  });

  it("leaves className undefined when neither side sets one", () => {
    const merged: Record<string, unknown> = mergeElementProps({ "data-app": "yes" }, { role: "row" });

    expect(merged.className).toBeUndefined();
  });

  it("resolves the static and per-subject forms alike", () => {
    expect(resolveElementProps<{ id: string }, string>({ id: "static" }, "subject"))
      .toEqual({ id: "static" });
    expect(resolveElementProps<{ id: string }, string>(
      subject => {
        return { id: subject };
      },
      "subject"
    )).toEqual({ id: "subject" });
    expect(resolveElementProps(undefined, "subject")).toBeUndefined();
  });
});

describe("DOM prop escape hatches", () => {
  it("applies rowProps per row without displacing the state contract", () => {
    const onRowClick = vi.fn();
    const onRowMouseEnter = vi.fn();
    const columns: Array<ColumnDef<Person, any>> = [{ accessorKey: "name", header: "Name" }];
    const { container } = render(
      <DataTable
        columns={columns}
        data={people}
        getRowId={getRowId}
        rowProps={row => {
          return {
            className: row.original.age > 28 ? "senior" : undefined,
            "data-testid": `row-${row.id}`,
            onMouseEnter: onRowMouseEnter,
            style: { opacity: 0.5 }
          };
        }}
        onRowClick={onRowClick}
      />,
      { wrapper }
    );

    const first = container.querySelector<HTMLElement>(":scope [data-row-id=\"1\"]");

    expect(first?.className).toContain("ledger-row");
    expect(first?.className).toContain("senior");
    expect(first?.dataset.testid).toBe("row-1");
    expect(first?.style.opacity).toBe("0.5");
    expect(first?.getAttribute("role")).toBe("row");
    expect(container.querySelector<HTMLElement>(":scope [data-row-id=\"2\"]")?.className).not.toContain("senior");

    fireEvent.mouseEnter(first as Element);
    expect(onRowMouseEnter).toHaveBeenCalledTimes(1);

    // The consumer handler composes with ledger's own rather than replacing it.
    fireEvent.click(first?.querySelector(":scope td") as Element);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("applies meta.cellProps, meta.headerCellProps, and meta.footerCellProps", () => {
    const onCellClick = vi.fn();
    const columns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        footer: "Total",
        meta: {
          cellProps: cell => {
            return {
              "data-testid": `cell-${cell.row.id}`,
              onClick: onCellClick
            };
          },
          headerCellProps: { "data-testid": "name-header" },
          footerCellProps: { "data-testid": "name-footer" }
        }
      }
    ];
    const { container } = render(
      <DataTable columns={columns} data={people} getRowId={getRowId} />,
      { wrapper }
    );

    const cell = container.querySelector<HTMLElement>(":scope [data-testid=\"cell-1\"]");

    expect(cell?.getAttribute("role")).toBe("cell");
    expect(cell?.dataset.ledgerColumnId).toBe("name");
    expect(container.querySelector<HTMLElement>(":scope [data-testid=\"name-header\"]")?.getAttribute("role"))
      .toBe("columnheader");
    expect(container.querySelector<HTMLElement>(":scope [data-testid=\"name-footer\"]")?.getAttribute("role"))
      .toBe("cell");

    fireEvent.click(cell as Element);
    expect(onCellClick).toHaveBeenCalledTimes(1);
  });

  it("composes headerRowProps, footerRowProps, and viewportProps", () => {
    const onScroll = vi.fn();
    const columns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        footer: "Total"
      }
    ];
    const { container } = render(
      <DataTable
        columns={columns}
        data={people}
        footerRowProps={{ "data-testid": "footer-row" }}
        getRowId={getRowId}
        headerRowProps={group => { return { "data-testid": `header-row-${group.depth}` }; }}
        viewportProps={{ "data-testid": "viewport", onScroll }}
      />,
      { wrapper }
    );

    expect(container.querySelector<HTMLElement>(":scope [data-testid=\"header-row-0\"]")?.getAttribute("role"))
      .toBe("row");
    expect(container.querySelector<HTMLElement>(":scope [data-testid=\"footer-row\"]")?.getAttribute("role"))
      .toBe("row");

    const viewport = container.querySelector<HTMLElement>(":scope [data-testid=\"viewport\"]");

    // ledger's own viewport styling survives the merge.
    expect(viewport?.style.overscrollBehavior).toBe("none");

    fireEvent.scroll(viewport as Element);
    expect(onScroll).toHaveBeenCalledTimes(1);
  });
});
