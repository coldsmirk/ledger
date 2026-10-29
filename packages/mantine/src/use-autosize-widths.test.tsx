import type { ReactNode } from "react";

import type { ColumnDef } from "./types";

import { MantineProvider } from "@mantine/core";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataTable } from "./data-table";

const ResizeObserverOriginal = ResizeObserver;

interface Payment {
  id: string;
  status: string;
}

let laidOut = true;
let observers: Array<() => void> = [];

/**
 * jsdom lays nothing out. Every element here reports ten pixels per character of its text as its
 * content width, and a box only while `laidOut` says the table has one.
 */
class LaidOutElement extends HTMLElement {
  override get scrollWidth(): number {
    return (this.textContent ?? "").length * 10;
  }

  override getClientRects(): DOMRectList {
    return (laidOut ? [this.getBoundingClientRect()] : []) as unknown as DOMRectList;
  }
}

class ObservedResize {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor(callback: () => void) {
    observers.push(callback);
  }
}

const layout = Object.getOwnPropertyDescriptors(LaidOutElement.prototype);

beforeEach(() => {
  laidOut = true;
  observers = [];
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(layout.scrollWidth!.get!);
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(layout.getClientRects!.value as () => DOMRectList);
  vi.stubGlobal("ResizeObserver", ObservedResize);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("ResizeObserver", ResizeObserverOriginal);
});

const columns: Array<ColumnDef<Payment, any>> = [
  {
    accessorKey: "status",
    header: "State",
    size: 140,
    enableSorting: false,
    meta: { autosize: true }
  }
];

function wrapper({ children }: { children: ReactNode }) {
  return <MantineProvider>{children}</MantineProvider>;
}

function payments(...statuses: string[]): Payment[] {
  return statuses.map((status, index) => {
    return { id: String(index), status };
  });
}

function table(data: Payment[]) {
  return <DataTable columns={columns} data={data} getRowId={row => row.id} />;
}

function translated(statuses: Record<string, string>) {
  return (
    <DataTable
      columns={[{ ...columns[0]!, cell: info => statuses[info.getValue<string>()] }]}
      data={payments("paid", "refunded")}
      getRowId={row => row.id}
    />
  );
}

function statusWidth(container: HTMLElement): string {
  return container.querySelector<HTMLElement>(":scope .ledger-root")!.style.getPropertyValue("--ledger-col-width-status");
}

describe("meta.autosize", () => {
  it("fits the column to its widest cell before the first paint", () => {
    const { container } = render(<DataTable columns={columns} data={payments("Paid", "Refunded")} getRowId={row => row.id} />, { wrapper });

    // "Refunded" is 80 wide, the header 50; the fit adds the 8px slack.
    expect(statusWidth(container)).toBe("88px");
  });

  it("only widens when the same rows come back, and refits when the rows change", () => {
    const { container, rerender } = render(table(payments("Paid", "Refunded")), { wrapper });

    // A refetch of the same rows with shorter values leaves the column where it was…
    rerender(table(payments("Paid", "Paid")));
    expect(statusWidth(container)).toBe("88px");

    // …a longer value widens it…
    rerender(table(payments("Paid", "Partially refunded")));
    expect(statusWidth(container)).toBe("188px");

    // …and different rows are a new view, fitted afresh in both directions.
    rerender(table([{ id: "9", status: "Paid" }]));
    expect(statusWidth(container)).toBe("58px");
  });

  it("refits when the column definitions change under the same rows", () => {
    const { container, rerender } = render(translated({ paid: "Paid", refunded: "Refunded" }), { wrapper });

    expect(statusWidth(container)).toBe("88px");

    // A new language is new content, not a refresh: the column narrows to it.
    rerender(translated({ paid: "已付", refunded: "已退" }));
    expect(statusWidth(container)).toBe("58px");
  });

  it("leaves a column the user resized at the user's width", () => {
    const { container } = render(
      <DataTable columns={columns} columnSizing={{ status: 200 }} data={payments("Paid")} getRowId={row => row.id} />,
      { wrapper }
    );

    expect(statusWidth(container)).toBe("200px");
  });

  it("waits for a table with no layout to be laid out before it fits", () => {
    laidOut = false;

    const { container } = render(<DataTable columns={columns} data={payments("Refunded")} getRowId={row => row.id} />, { wrapper });

    // Hidden, every cell would measure zero: the column keeps its size meanwhile.
    expect(statusWidth(container)).toBe("140px");

    laidOut = true;
    act(() => {
      for (const observe of observers) {
        observe();
      }
    });

    expect(statusWidth(container)).toBe("88px");
  });

  it("is the user's fit to take when the column does not ask for one", () => {
    const { container } = render(
      <DataTable columns={[{ ...columns[0]!, meta: {} }]} data={payments("Refunded")} getRowId={row => row.id} />,
      { wrapper }
    );

    expect(statusWidth(container)).toBe("140px");
  });
});
