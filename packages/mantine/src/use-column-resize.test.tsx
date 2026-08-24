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

function Blocker({ blocked, promise }: { blocked: boolean; promise: Promise<void> }) {
  if (blocked) {
    throw promise;
  }

  return null;
}

const resizer = () => document.querySelector(":scope .ledger-header .ledger-resizer") as Element;

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

  it("clamps a drag to the constraints of the render on screen", () => {
    const onColumnSizingChange = vi.fn();
    const blocker = Promise.withResolvers<void>();
    const narrow: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        size: 120,
        minSize: 60,
        maxSize: 130
      },
      { accessorKey: "age", header: "Age" }
    ];

    function Harness() {
      const [defs, setDefs] = useState(() => columns);
      const [blocked, setBlocked] = useState(false);

      return (
        <>
          <DataTable
            enableColumnResizing
            columns={defs}
            data={people}
            getRowId={person => person.id}
            onColumnSizingChange={onColumnSizingChange}
          />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setDefs(narrow);
              setBlocked(true);
            })}
          >
            cap
          </button>

          <Suspense fallback={<div>waiting</div>}>
            <Blocker blocked={blocked} promise={blocker.promise} />
          </Suspense>
        </>
      );
    }

    render(<Harness />, { wrapper });

    // A maxSize nobody ever saw may not stop the drag the user is making.
    fireEvent.click(screen.getByRole("button", { name: "cap" }));

    fireEvent.pointerDown(resizer(), { button: 0, clientX: 300 });
    fireEvent.pointerMove(document, { clientX: 400 });

    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 220 });
    fireEvent.pointerUp(document);
  });

  it("restores the width on screen on Escape, not one a discarded render named", () => {
    const onColumnSizingChange = vi.fn();
    const blocker = Promise.withResolvers<void>();

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
            <Blocker blocked={blocked} promise={blocker.promise} />
          </Suspense>
        </>
      );
    }

    render(<Harness />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "widen" }));

    fireEvent.pointerDown(resizer(), { button: 0, clientX: 300 });
    fireEvent.pointerMove(document, { clientX: 340 });
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 160 });

    // Escape puts back the width the drag started from — the one the user was looking at.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 120 });
  });

  it("autosizes a column a discarded render removed", () => {
    const onColumnSizingChange = vi.fn();
    const blocker = Promise.withResolvers<void>();
    const withoutName: Array<ColumnDef<Person, any>> = [{ accessorKey: "age", header: "Age" }];

    function Harness() {
      const [defs, setDefs] = useState(() => columns);
      const [blocked, setBlocked] = useState(false);

      return (
        <>
          <DataTable
            enableColumnResizing
            columns={defs}
            data={people}
            getRowId={person => person.id}
            onColumnSizingChange={onColumnSizingChange}
          />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setDefs(withoutName);
              setBlocked(true);
            })}
          >
            drop
          </button>

          <Suspense fallback={<div>waiting</div>}>
            <Blocker blocked={blocked} promise={blocker.promise} />
          </Suspense>
        </>
      );
    }

    render(<Harness />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "drop" }));

    for (const cell of document.querySelectorAll<HTMLElement>(".ledger-tbody td[data-ledger-column-id=\"name\"]")) {
      Object.defineProperty(cell, "scrollWidth", { configurable: true, value: 252 });
    }

    fireEvent.doubleClick(resizer());

    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 260 });
  });

  it("autosizes to the footer when the footer is the widest thing rendered", () => {
    const onColumnSizingChange = vi.fn();
    const withFooter: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        footer: "Grand total across every region",
        size: 120,
        minSize: 60
      },
      { accessorKey: "age", header: "Age" }
    ];

    render(
      <DataTable
        enableColumnResizing
        columns={withFooter}
        data={people}
        getRowId={person => person.id}
        onColumnSizingChange={onColumnSizingChange}
      />,
      { wrapper }
    );

    for (const cell of document.querySelectorAll<HTMLElement>(".ledger-tbody td[data-ledger-column-id=\"name\"]")) {
      Object.defineProperty(cell, "scrollWidth", { configurable: true, value: 100 });
    }

    const footerCell = document.querySelector<HTMLElement>(".ledger-footer .ledger-footer-cell");
    expect(footerCell).toBeTruthy();
    Object.defineProperty(footerCell as HTMLElement, "scrollWidth", { configurable: true, value: 300 });

    // "Fit the rendered content" means everything rendered: a totals row is content the column
    // has to hold, and a fit that clips it is not a fit.
    fireEvent.doubleClick(resizer());

    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 308 });
  });

  it("stops writing sizing when the column it is dragging really leaves", () => {
    const onColumnSizingChange = vi.fn();
    const withoutName: Array<ColumnDef<Person, any>> = [{ accessorKey: "age", header: "Age" }];

    function Harness() {
      const [defs, setDefs] = useState(() => columns);

      return (
        <>
          <DataTable
            enableColumnResizing
            columns={defs}
            data={people}
            getRowId={person => person.id}
            onColumnSizingChange={onColumnSizingChange}
          />

          <button type="button" onClick={() => setDefs(withoutName)}>
            drop
          </button>
        </>
      );
    }

    render(<Harness />, { wrapper });

    fireEvent.pointerDown(resizer(), { button: 0, clientX: 300 });
    fireEvent.pointerMove(document, { clientX: 320 });
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 140 });

    // A real render takes the column away mid-drag. The handle is gone with it, so the pointer is
    // dragging nothing — and must not go on writing a width for a column that is not there.
    fireEvent.click(screen.getByRole("button", { name: "drop" }));
    onColumnSizingChange.mockClear();

    fireEvent.pointerMove(document, { clientX: 500 });
    expect(onColumnSizingChange).not.toHaveBeenCalled();
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
