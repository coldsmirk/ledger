import type { SortingState } from "@tanstack/react-table";
import type { ReactNode } from "react";

import type { ColumnDef, DataTableHandle } from "./types";

import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef, startTransition, StrictMode, Suspense, useState } from "react";
import { describe, expect, it } from "vitest";

import { DataTable } from "./data-table";

interface Person {
  id: string;
  name: string;
}

const people: Person[] = [
  { id: "1", name: "Carol" },
  { id: "2", name: "Alice" },
  { id: "3", name: "Bob" }
];

const getRowId = (person: Person) => person.id;

const columns: Array<ColumnDef<Person, any>> = [{ accessorKey: "name", header: "Name" }];

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <MantineProvider>{children}</MantineProvider>
    </StrictMode>
  );
}

function Blocker({ blocked, promise }: { blocked: boolean; promise: Promise<void> }) {
  if (blocked) {
    throw promise;
  }

  return null;
}

const viewport = () => document.querySelector("[data-scrollarea-viewport]") as HTMLElement;
const currentRowId = () => document.querySelector<HTMLElement>("[aria-current=\"true\"]")?.dataset.rowId;
const announcement = () => document.querySelector("[role=\"status\"]")?.textContent;

/**
 * A sort the table renders and then throws away, leaving the shared core holding an order
 * nobody ever saw.
 */
function SortHarness({ handleRef, wip }: { handleRef?: ReturnType<typeof createRef<DataTableHandle<Person>>>; wip: SortingState }) {
  const blocker = Promise.withResolvers<void>();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [blocked, setBlocked] = useState(false);

  return (
    <>
      <DataTable
        enableActiveRow
        columns={columns}
        data={people}
        defaultActiveRowId="1"
        getRowId={getRowId}
        handleRef={handleRef}
        sorting={sorting}
        onSortingChange={setSorting}
      />

      <button
        type="button"
        onClick={() => startTransition(() => {
          setSorting(wip);
          setBlocked(true);
        })}
      >
        wip
      </button>

      <Suspense fallback={<div>waiting</div>}>
        <Blocker blocked={blocked} promise={blocker.promise} />
      </Suspense>
    </>
  );
}

describe("active row navigation", () => {
  it("steps through the rows on screen, not through an order nobody saw", () => {
    render(<SortHarness wip={[{ desc: true, id: "name" }]} />, { wrapper });
    expect(currentRowId()).toBe("1");

    // Carol, Bob, Alice in the discarded order — so the row after "1" differs from the one
    // after it on screen.
    fireEvent.click(screen.getByRole("button", { name: "wip" }));
    expect([...document.querySelectorAll(".ledger-row")].map(row => (row as HTMLElement).dataset.rowId))
      .toEqual(["1", "2", "3"]);

    fireEvent.keyDown(viewport(), { key: "ArrowDown" });

    expect(currentRowId()).toBe("2");
  });

  it("ends at the last row on screen", () => {
    render(<SortHarness wip={[{ desc: true, id: "name" }]} />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "wip" }));
    fireEvent.keyDown(viewport(), { key: "End" });

    expect(currentRowId()).toBe("3");
  });

  it("resolves an imperative scroll index against the rows on screen", () => {
    const handle = createRef<DataTableHandle<Person>>();

    // Alice, Bob, Carol in the discarded order — index 0 is a different row there.
    render(<SortHarness handleRef={handle} wip={[{ desc: false, id: "name" }]} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "wip" }));

    // Own handlers, not `vi.spyOn`: the prototype method is already a mock, and spying on an
    // instance that inherits one hands back that same shared mock.
    const scrolled: Array<string | undefined> = [];
    const rows = [...document.querySelectorAll(".ledger-row")] as HTMLElement[];

    for (const row of rows) {
      row.scrollIntoView = () => {
        scrolled.push(row.dataset.rowId);
      };
    }

    act(() => handle.current!.scrollToIndex(0));

    expect(scrolled).toEqual(["1"]);

    // The id overload is the other half of the split: a table whose ids read as digits could not
    // say which of the two a single `string | number` parameter meant.
    act(() => handle.current!.scrollToRow("3"));

    expect(scrolled).toEqual(["1", "3"]);
  });

  it("announces the row by its position in the rows on screen", () => {
    render(<SortHarness wip={[]} />, { wrapper });
    expect(announcement()).toBe("Carol, row 1 of 3");

    fireEvent.keyDown(viewport(), { key: "End" });

    expect(currentRowId()).toBe("3");
    expect(announcement()).toBe("Bob, row 3 of 3");
  });
});
