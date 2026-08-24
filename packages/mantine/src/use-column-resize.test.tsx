import type { ReactNode } from "react";

import type { ColumnDef } from "./types";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { startTransition, StrictMode, Suspense, useState } from "react";
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
  }
];

const columns: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "Name",
    size: 120,
    minSize: 60
  },
  { accessorKey: "age", header: "Age" }
];

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <MantineProvider>{children}</MantineProvider>
    </StrictMode>
  );
}

function renderResizable() {
  const onColumnSizingChange = vi.fn();
  const utils = render(
    <DataTable
      enableColumnResizing
      columns={columns}
      data={people}
      getRowId={person => person.id}
      onColumnSizingChange={onColumnSizingChange}
    />,
    { wrapper }
  );
  const resizer = utils.container.querySelector(":scope .ledger-header .ledger-resizer");
  expect(resizer).toBeTruthy();

  return { onColumnSizingChange, resizer: resizer as Element };
}

describe("useColumnResize", () => {
  it("drags 1:1 from the engine-resolved width and clamps to minSize", () => {
    const { onColumnSizingChange, resizer } = renderResizable();

    fireEvent.pointerDown(resizer, { button: 0, clientX: 300 });

    fireEvent.pointerMove(document, { clientX: 345 });
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 165 });

    fireEvent.pointerMove(document, { clientX: -600 });
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 60 });

    fireEvent.pointerUp(document);
    onColumnSizingChange.mockClear();

    // The session ended — further movement changes nothing.
    fireEvent.pointerMove(document, { clientX: 500 });
    expect(onColumnSizingChange).not.toHaveBeenCalled();
  });

  it("drags from the width on screen, not one a discarded render named", () => {
    const onColumnSizingChange = vi.fn();
    const blocker = Promise.withResolvers<void>();

    function Blocker({ blocked }: { blocked: boolean }) {
      if (blocked) {
        throw blocker.promise;
      }

      return null;
    }

    function Harness() {
      const [sizing, setSizing] = useState<Record<string, number>>({ name: 120 });
      const [blocked, setBlocked] = useState(false);

      return (
        <>
          <DataTable
            enableColumnResizing
            columns={columns}
            columnSizing={sizing}
            data={people}
            getRowId={person => person.id}
            onColumnSizingChange={next => {
              onColumnSizingChange(next);
              setSizing(next);
            }}
          />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setSizing({ name: 400 });
              setBlocked(true);
            })}
          >
            widen
          </button>

          <Suspense fallback={<div>waiting</div>}>
            <Blocker blocked={blocked} />
          </Suspense>
        </>
      );
    }

    render(<Harness />, { wrapper });

    // The transition renders the column at 400 and is then thrown away, because a sibling
    // suspends. The column on screen is still 120 wide.
    fireEvent.click(screen.getByRole("button", { name: "widen" }));

    const resizer = document.querySelector(":scope .ledger-header .ledger-resizer") as Element;
    fireEvent.pointerDown(resizer, { button: 0, clientX: 300 });
    fireEvent.pointerMove(document, { clientX: 310 });

    // A drag is 1:1 from the edge the user grabbed, and the edge they grabbed is the one on
    // screen. Departing from 400 would jump the column the moment it is touched.
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 130 });

    fireEvent.pointerUp(document);
  });

  it("restores the pre-drag width on Escape", () => {
    const { onColumnSizingChange, resizer } = renderResizable();

    fireEvent.pointerDown(resizer, { button: 0, clientX: 300 });
    fireEvent.pointerMove(document, { clientX: 340 });
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 160 });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({});
  });

  it("autosizes the column to its rendered content on resizer double-click", () => {
    const { onColumnSizingChange, resizer } = renderResizable();

    // jsdom lays nothing out, so the rendered cells report a stubbed content width.
    const cells = document.querySelectorAll<HTMLElement>(".ledger-tbody td[data-ledger-column-id=\"name\"]");
    expect(cells.length).toBeGreaterThan(0);

    for (const cell of cells) {
      Object.defineProperty(cell, "scrollWidth", { configurable: true, value: 252 });
    }

    fireEvent.doubleClick(resizer);

    // Content width plus the breathing-room slack.
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 260 });
  });

  it("restores the pre-drag width and ends the session on pointercancel", () => {
    const { onColumnSizingChange, resizer } = renderResizable();

    fireEvent.pointerDown(resizer, { button: 0, clientX: 300 });
    fireEvent.pointerMove(document, { clientX: 340 });
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 160 });

    // A touch pan or OS gesture aborts the pointer stream without a pointerup.
    fireEvent.pointerCancel(document);
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({});

    onColumnSizingChange.mockClear();
    fireEvent.pointerMove(document, { clientX: 500 });
    expect(onColumnSizingChange).not.toHaveBeenCalled();
  });
});
