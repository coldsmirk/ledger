import type { ReactNode } from "react";

import type { ColumnDef } from "./types";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";

import { DataTable } from "./data-table";

interface Person {
  id: string;
  name: string;
  tags: string[];
}

const people: Person[] = [
  {
    id: "1",
    name: "Carol",
    tags: ["alpha", "beta"]
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

/**
 * jsdom reports 0 for both scrollWidth and clientWidth, so overflow is simulated by defining
 * them on the element under test.
 */
function setOverflow(element: HTMLElement, overflowing: boolean) {
  Object.defineProperties(element, {
    scrollWidth: {
      configurable: true,
      value: overflowing ? 200 : 100
    },
    clientWidth: {
      configurable: true,
      value: 100
    }
  });
}

describe("truncation tooltip", () => {
  const columns: Array<ColumnDef<Person, any>> = [
    {
      accessorKey: "tags",
      header: "Tags",
      // A custom renderer: the accessor value is an array, so the old title was always absent.
      cell: context => context.getValue<string[]>().join(" · "),
      meta: { truncate: true }
    }
  ];

  it("titles a clipped cell with its rendered text, not the accessor value", () => {
    const { container } = render(
      <DataTable columns={columns} data={people} getRowId={getRowId} />,
      { wrapper }
    );
    const span = container.querySelector<HTMLElement>(":scope .ledger-cell [data-truncate]");

    expect(span).toBeTruthy();
    // Nothing is measured until the pointer arrives.
    expect(span?.getAttribute("title")).toBeNull();

    setOverflow(span as HTMLElement, true);
    fireEvent.pointerEnter(span as Element);
    expect(span?.getAttribute("title")).toBe("alpha · beta");
  });

  it("leaves text that fits untitled, and clears a title that no longer applies", () => {
    const { container } = render(
      <DataTable columns={columns} data={people} getRowId={getRowId} />,
      { wrapper }
    );
    const span = container.querySelector<HTMLElement>(":scope .ledger-cell [data-truncate]") as HTMLElement;

    setOverflow(span, false);
    fireEvent.pointerEnter(span);
    expect(span.getAttribute("title")).toBeNull();

    setOverflow(span, true);
    fireEvent.pointerEnter(span);
    expect(span.getAttribute("title")).toBe("alpha · beta");

    setOverflow(span, false);
    fireEvent.pointerEnter(span);
    expect(span.getAttribute("title")).toBeNull();
  });

  it("titles a clipped header label too", () => {
    const { container } = render(
      <DataTable columns={columns} data={people} getRowId={getRowId} />,
      { wrapper }
    );
    const span = container.querySelector<HTMLElement>(":scope .ledger-header-cell [data-truncate]") as HTMLElement;

    setOverflow(span, true);
    fireEvent.pointerEnter(span);
    expect(span.getAttribute("title")).toBe("Tags");
  });
});
