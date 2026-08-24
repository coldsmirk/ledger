import type { ReactNode } from "react";

import type { ColumnDef, TableInstance } from "./types";

import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { startTransition, StrictMode, Suspense, useState } from "react";
import { describe, expect, it } from "vitest";

import { DataTable } from "./data-table";
import { useDataTable } from "./use-data-table";

interface Person {
  id: string;
  name: string;
}

const people: Person[] = [
  { id: "1", name: "Carol" },
  { id: "2", name: "Alice" },
  { id: "3", name: "Bob" }
];

const others: Person[] = [{ id: "9", name: "Dana" }];

const getRowId = (person: Person) => person.id;

const columns: Array<ColumnDef<Person, any>> = [{ accessorKey: "name", header: "Name" }];

const filterable: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { filter: "text" }
  }
];

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

const filterInput = () => document.querySelector(".ledger-filter-popover input") as HTMLInputElement;

function panelView(label: string) {
  return (
    <StrictMode>
      <MantineProvider>
        <DataTable
          defaultExpanded
          columns={columns}
          data={people}
          getRowId={getRowId}
          renderDetailPanel={row => <span data-testid="panel">{`${label}:${row.original.name}`}</span>}
        />
      </MantineProvider>
    </StrictMode>
  );
}

describe("what the tree below the root reads", () => {
  it("keeps a filter control subscribed to the table on screen when a discarded render hands it over", async () => {
    const blocker = Promise.withResolvers<void>();
    let onScreen: TableInstance<Person> | null = null;

    function Harness() {
      const first = useDataTable({
        columns: filterable,
        data: people,
        getRowId
      });
      const second = useDataTable({
        columns: filterable,
        data: others,
        getRowId
      });
      const [showSecond, setShowSecond] = useState(false);
      const [blocked, setBlocked] = useState(false);

      onScreen = first;

      return (
        <>
          <DataTable table={showSecond ? second : first} />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setShowSecond(true);
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

    render(<Harness />, { wrapper });

    fireEvent.click(screen.getByLabelText("Filter Name"));
    await waitFor(() => expect(document.querySelector(".ledger-filter-popover")).toBeTruthy());

    // The handover renders and is thrown away; the first table is still the one on screen.
    fireEvent.click(screen.getByRole("button", { name: "wip" }));
    expect(document.querySelectorAll(".ledger-tbody .ledger-row")).toHaveLength(3);

    // Typing redraws this control alone — a render the table root has no part in.
    fireEvent.change(filterInput(), { target: { value: "zz" } });
    expect(filterInput().value).toBe("zz");

    // An external reset to the value already committed: nothing re-renders, so the set
    // notification is the only way back to the control (docs/filtering.md).
    act(() => onScreen!.setColumnFilters([]));

    expect(filterInput().value).toBe("");
  });

  it("carries the active-row switch to rows that did not re-render", () => {
    const { rerender } = render(
      <DataTable columns={columns} data={people} enableActiveRow={false} getRowId={getRowId} />,
      { wrapper }
    );

    // Nothing a row is memoized on moves: no current row before or after, same columns, same
    // pinning. What changed is a table-wide switch the rows have to hear about anyway.
    rerender(
      <StrictMode>
        <MantineProvider>
          <DataTable enableActiveRow columns={columns} data={people} getRowId={getRowId} />
        </MantineProvider>
      </StrictMode>
    );

    fireEvent.click(document.querySelectorAll(".ledger-row")[1] as Element);

    expect(document.querySelector<HTMLElement>("[aria-current=\"true\"]")?.dataset.rowId).toBe("2");
  });

  it("draws a detail panel with the renderer of the render that drew the row", () => {
    const { rerender } = render(panelView("first"));
    expect(screen.getAllByTestId("panel")[0]?.textContent).toBe("first:Carol");

    rerender(panelView("second"));
    expect(screen.getAllByTestId("panel")[0]?.textContent).toBe("second:Carol");
  });
});
