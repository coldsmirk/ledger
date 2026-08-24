import type { ReactNode } from "react";

import type { ColumnDef, DataTableEditingCell, DataTableHandle } from "./types";

import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, startTransition, StrictMode, Suspense, useLayoutEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "./data-table";
import { useDataTable } from "./use-data-table";

interface Person {
  id: string;
  name: string;
  active: boolean;
}

const people: Person[] = [
  {
    id: "1",
    name: "Carol",
    active: true
  },
  {
    id: "2",
    name: "Alice",
    active: false
  }
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

function nameColumn(validate?: (value: unknown) => string | null): Array<ColumnDef<Person, any>> {
  return [
    {
      accessorKey: "name",
      header: "Name",
      meta: {
        edit: validate
          ? { variant: "text", validate: value => validate(value) }
          : "text"
      }
    }
  ];
}

function gatedNameColumn(enabled: boolean): Array<ColumnDef<Person, any>> {
  return [
    {
      accessorKey: "name",
      header: "Name",
      meta: { edit: { variant: "text", enabled: () => enabled } }
    }
  ];
}

/**
 * A controlled cell whose owner ignores the close, over one row whose name the test moves.
 */
function namedPerson(name: string): Person[] {
  return [
    {
      active: true,
      id: "1",
      name
    },
    people[1] as Person
  ];
}

function fixedCellView(rows: Person[]) {
  return (
    <StrictMode>
      <MantineProvider>
        <DataTable
          columns={nameColumn()}
          data={rows}
          editingCell={{ columnId: "name", rowId: "1" }}
          getRowId={getRowId}
          onEditCommit={vi.fn()}
          onEditingCellChange={vi.fn()}
        />
      </MantineProvider>
    </StrictMode>
  );
}

const editableColumns: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { edit: "text" }
  },
  {
    accessorKey: "id",
    header: "Id",
    meta: { edit: "text" }
  }
];

const customNameColumn: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "Name",
    meta: {
      edit: ({
        value,
        setValue,
        error
      }) => (
        <>
          <input
            aria-label="Edit Name"
            value={value === null || value === undefined ? "" : String(value)}
            onChange={event => setValue(event.currentTarget.value)}
          />

          {error === null ? null : <span>{error}</span>}
        </>
      )
    }
  }
];

/**
 * A controlled cell naming a row the data may not hold yet.
 */
function pendingRowView(rows: Person[]) {
  return (
    <StrictMode>
      <MantineProvider>
        <DataTable
          columns={customNameColumn}
          data={rows}
          editingCell={{ columnId: "name", rowId: "1" }}
          getRowId={getRowId}
          onEditCommit={vi.fn()}
          onEditingCellChange={vi.fn()}
        />
      </MantineProvider>
    </StrictMode>
  );
}

/**
 * Reads the DOM in the layout phase, which is the frame as it will be painted: React mutates the
 * whole commit's DOM before any layout effect runs, and passive effects — where reconciliation
 * lives — run after the paint. Rendered after the table, so anything the table's own layout
 * effects put right still counts as put right.
 */
function LayoutProbe({ observe }: { observe: () => void }) {
  useLayoutEffect(observe);

  return null;
}

function SwappableTable() {
  const [second, setSecond] = useState(false);
  const options = {
    columns: customNameColumn,
    data: people,
    editingCell: { columnId: "name", rowId: "1" },
    getRowId,
    onEditCommit: vi.fn(),
    onEditingCellChange: vi.fn()
  };
  const first = useDataTable<Person>(options);
  const other = useDataTable<Person>(options);

  return (
    <>
      <button type="button" onClick={() => setSecond(true)}>
        swap
      </button>

      <DataTable table={second ? other : first} />
    </>
  );
}

describe("inline editing", () => {
  it("enters on double-click, commits on Enter with value and previousValue", () => {
    const onEditCommit = vi.fn();
    render(
      <DataTable
        columns={nameColumn()}
        data={people}
        getRowId={getRowId}
        onEditCommit={onEditCommit}
      />,
      { wrapper }
    );

    fireEvent.doubleClick(screen.getByText("Carol"));

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Caroline" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onEditCommit).toHaveBeenCalledTimes(1);
    expect(onEditCommit.mock.calls[0]?.[0]).toMatchObject({
      value: "Caroline",
      previousValue: "Carol"
    });
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("cancels on Escape without committing", () => {
    const onEditCommit = vi.fn();
    render(
      <DataTable
        columns={nameColumn()}
        data={people}
        getRowId={getRowId}
        onEditCommit={onEditCommit}
      />,
      { wrapper }
    );

    fireEvent.doubleClick(screen.getByText("Carol"));

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Nope" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onEditCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("closes the open editor when the table switch shuts under it, without committing", () => {
    const onEditCommit = vi.fn();
    const view = (editingEnabled: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={nameColumn()}
            data={people}
            enableEditing={editingEnabled}
            getRowId={getRowId}
            onEditCommit={onEditCommit}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(true));

    fireEvent.doubleClick(screen.getByText("Carol"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Drafted" } });

    rerender(view(false));

    // The gate the application just shut is the whole point: the editor leaves and the draft
    // goes with it, rather than being pushed through on the next Enter or blur.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onEditCommit).not.toHaveBeenCalled();
    expect(screen.getByText("Carol")).toBeTruthy();
  });

  it("drops the draft when the row's own edit gate turns false mid-edit", () => {
    const onEditCommit = vi.fn();

    const view = (enabled: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={gatedNameColumn(enabled)}
            data={people}
            getRowId={getRowId}
            onEditCommit={onEditCommit}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(true));

    fireEvent.doubleClick(screen.getByText("Carol"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Drafted" } });

    rerender(view(false));

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onEditCommit).not.toHaveBeenCalled();
  });

  it("cancels an ineligible editor once the request that refused the cancel rejects", async () => {
    const inFlight = Promise.withResolvers<void>();
    const onEditCommit = vi.fn(() => inFlight.promise);
    const view = (editingEnabled: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={nameColumn()}
            data={people}
            enableEditing={editingEnabled}
            getRowId={getRowId}
            onEditCommit={onEditCommit}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(true));

    fireEvent.doubleClick(screen.getByText("Carol"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Drafted" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onEditCommit).toHaveBeenCalledTimes(1);

    // The switch closes while the write is in flight. The editor goes at once — nothing under a
    // closed gate may be typed into — while the write itself is left to finish, because that
    // value passed the gate before it shut.
    rerender(view(false));
    expect(screen.queryByRole("textbox")).toBeNull();

    await act(async () => {
      inFlight.reject(new Error("nope"));
      await inFlight.promise.catch(() => undefined);
    });

    // A rejection normally returns the cell to editing. Under a closed switch there is nothing
    // to return to: eligibility is re-asked and the editor leaves instead.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText("nope")).toBeNull();
    expect(onEditCommit).toHaveBeenCalledTimes(1);
  });

  it("commits again after the application declines to close the controlled cell", () => {
    const onEditCommit = vi.fn();
    // A controlled slice whose owner ignores the change keeps this editor on screen, and an
    // editor on screen is a live one: the next value typed into it is a second edit.
    const onEditingCellChange = vi.fn();

    render(
      <DataTable
        columns={nameColumn()}
        data={people}
        editingCell={{ columnId: "name", rowId: "1" }}
        getRowId={getRowId}
        onEditCommit={onEditCommit}
        onEditingCellChange={onEditingCellChange}
      />,
      { wrapper }
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "First" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(onEditCommit).toHaveBeenCalledTimes(1);
    expect(onEditingCellChange).toHaveBeenCalledWith(null);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Second" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(onEditCommit).toHaveBeenCalledTimes(2);
    expect(onEditCommit.mock.calls[1]?.[0]).toMatchObject({
      previousValue: "First",
      value: "Second"
    });
  });

  it("tells a custom editor that its write is still out", async () => {
    const inFlight = Promise.withResolvers<void>();
    // The host never disables a custom editor — it cannot know what to disable — so the flag has
    // to reach the editor for it to decide anything at all.
    const customName: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: {
          edit: ({
            value,
            setValue,
            pending
          }) => (
            <input
              aria-label="Edit Name"
              disabled={pending}
              value={value === null || value === undefined ? "" : String(value)}
              onChange={event => setValue(event.currentTarget.value)}
            />
          )
        }
      }
    ];

    render(
      <DataTable
        columns={customName}
        data={people}
        editingCell={{ columnId: "name", rowId: "1" }}
        getRowId={getRowId}
        onEditCommit={() => inFlight.promise}
        onEditingCellChange={vi.fn()}
      />,
      { wrapper }
    );

    expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(false);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "First" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(true);

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });

    // The owner declined to close the cell, so the editor is still here — and no longer waiting.
    expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(false);
  });

  it("still commits a value typed while an async cell commit was in flight", async () => {
    const inFlight = Promise.withResolvers<void>();
    const committed: unknown[] = [];
    // A custom editor is never disabled by the pending state, so typing while the write is out
    // is ordinary rather than exotic.
    const customName: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: {
          edit: ({ value, setValue }) => (
            <input
              aria-label="Edit Name"
              value={value === null || value === undefined ? "" : String(value)}
              onChange={event => setValue(event.currentTarget.value)}
            />
          )
        }
      }
    ];

    render(
      <DataTable
        columns={customName}
        data={people}
        editingCell={{ columnId: "name", rowId: "1" }}
        getRowId={getRowId}
        onEditCommit={({ value }) => {
          committed.push(value);

          return committed.length === 1 ? inFlight.promise : undefined;
        }}
        onEditingCellChange={vi.fn()}
      />,
      { wrapper }
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "First" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(committed).toEqual(["First"]);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Second" } });

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(committed).toEqual(["First", "Second"]);
  });

  it("keeps an uncontrolled cell open when its commit settles behind a newer draft", async () => {
    const inFlight = Promise.withResolvers<void>();
    const committed: unknown[] = [];
    const customName: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: {
          edit: ({ value, setValue }) => (
            <input
              aria-label="Edit Name"
              value={value === null || value === undefined ? "" : String(value)}
              onChange={event => setValue(event.currentTarget.value)}
            />
          )
        }
      }
    ];

    // No `editingCell` prop: the ordinary uncontrolled slice, which closes the cell itself.
    render(
      <DataTable
        columns={customName}
        data={people}
        getRowId={getRowId}
        onEditCommit={({ value }) => {
          committed.push(value);

          return committed.length === 1 ? inFlight.promise : undefined;
        }}
      />,
      { wrapper }
    );

    fireEvent.doubleClick(screen.getByText("Carol"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "First" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(committed).toEqual(["First"]);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Second" } });

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });

    // The write that settled never carried "Second", so closing now would drop it.
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Second");
    expect(document.querySelector("[data-pending]")).toBeNull();

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(committed).toEqual(["First", "Second"]);
  });

  it("commits the value that outran an async request when the cell is unmounted", async () => {
    const inFlight = Promise.withResolvers<void>();
    const committed: unknown[] = [];
    const customName: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: {
          edit: ({ value, setValue }) => (
            <input
              aria-label="Edit Name"
              value={value === null || value === undefined ? "" : String(value)}
              onChange={event => setValue(event.currentTarget.value)}
            />
          )
        }
      }
    ];

    const { unmount } = render(
      <DataTable
        columns={customName}
        data={people}
        getRowId={getRowId}
        onEditCommit={({ value }) => {
          committed.push(value);

          return committed.length === 1 ? inFlight.promise : undefined;
        }}
      />,
      { wrapper }
    );

    fireEvent.doubleClick(screen.getByText("Carol"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "First" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Second" } });

    // Scrolled out of the virtual window while the first write was still out. Nobody can commit
    // "Second" by hand anymore, and unmount commits rather than discards.
    unmount();

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });
    await act(async () => {
      await new Promise(resolve => {
        setTimeout(resolve, 0);
      });
    });

    expect(committed).toEqual(["First", "Second"]);
  });

  it("keeps the cell on screen when a transition to another one never commits", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const blocker = Promise.withResolvers<void>();
    let unblocked = false;
    const onEditCommit = vi.fn();

    function Blocker({ blocked }: { blocked: boolean }) {
      if (blocked && !unblocked) {
        // Suspends the transition's render, so React throws that tree away and keeps the one
        // already on screen — the cell the user is still editing.
        throw blocker.promise;
      }

      return null;
    }

    function Harness() {
      const [cell, setCell] = useState<DataTableEditingCell | null>({ columnId: "name", rowId: "1" });
      const [blocked, setBlocked] = useState(false);

      return (
        <>
          <DataTable
            columns={nameColumn()}
            data={people}
            editingCell={cell}
            getRowId={getRowId}
            handleRef={handle}
            onEditCommit={onEditCommit}
            onEditingCellChange={setCell}
          />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setCell({ columnId: "name", rowId: "2" });
              setBlocked(true);
            })}
          >
            switch
          </button>

          <Suspense fallback={<div>waiting</div>}>
            <Blocker blocked={blocked} />
          </Suspense>
        </>
      );
    }

    render(<Harness />, { wrapper });

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Drafted" } });
    fireEvent.click(screen.getByRole("button", { name: "switch" }));

    // Nothing reached the screen: Carol's cell is still the one being edited.
    expect(screen.getByRole("textbox")).toBeTruthy();

    // Asking for the row the abandoned render named must still commit the editor on screen —
    // a session that believed it was already there would drop what was typed.
    act(() => handle.current?.startEditing("2", "name"));

    expect(onEditCommit).toHaveBeenCalledTimes(1);
    expect(onEditCommit.mock.calls[0]?.[0]).toMatchObject({ previousValue: "Carol", value: "Drafted" });

    await act(async () => {
      unblocked = true;
      blocker.resolve();
      await blocker.promise;
    });
  });

  it("does not authorize a move when the gate shuts under a pending commit", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();
    const onEditingCellChange = vi.fn();

    const view = (enableEditing: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={nameColumn()}
            data={people}
            editingCell={{ columnId: "name", rowId: "1" }}
            enableEditing={enableEditing}
            getRowId={getRowId}
            handleRef={handle}
            onEditCommit={() => inFlight.promise}
            onEditingCellChange={onEditingCellChange}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(true));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Drafted" } });

    // Asking for Alice's cell commits this one first and waits on that write.
    act(() => handle.current?.startEditing("2", "name"));
    onEditingCellChange.mockClear();

    rerender(view(false));

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });

    // The gate shut, so this session is over — but nothing may be opened on the strength of a
    // write whose editor was cancelled, and the ending is requested once.
    expect(onEditingCellChange).not.toHaveBeenCalledWith({ columnId: "name", rowId: "2" });
    expect(onEditingCellChange.mock.calls.filter(call => call[0] === null)).toHaveLength(1);
  });

  it("can still be closed after a commit the controlled owner declined to act on", () => {
    const onEditCommit = vi.fn();
    const onEditingCellChange = vi.fn();

    render(
      <DataTable
        columns={nameColumn()}
        data={people}
        editingCell={{ columnId: "name", rowId: "1" }}
        getRowId={getRowId}
        onEditCommit={onEditCommit}
        onEditingCellChange={onEditingCellChange}
      />,
      { wrapper }
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "First" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onEditCommit).toHaveBeenCalledTimes(1);

    onEditingCellChange.mockClear();

    // The owner ignored the first request, so the editor is still here. Escape is a new request
    // to close it, not a repeat of one already answered.
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(onEditingCellChange).toHaveBeenCalledWith(null);

    onEditingCellChange.mockClear();

    // And so is Enter — which has nothing new to send, so it sends nothing.
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onEditingCellChange).toHaveBeenCalledWith(null);
    expect(onEditCommit).toHaveBeenCalledTimes(1);
  });

  it("follows the data past the value it acknowledged, when the owner keeps it open", () => {
    const committed: Array<{ previousValue: unknown; value: unknown }> = [];

    const view = (rows: Person[]) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={nameColumn()}
            data={rows}
            editingCell={{ columnId: "name", rowId: "1" }}
            getRowId={getRowId}
            onEditCommit={change => {
              committed.push({ previousValue: change.previousValue, value: change.value });
            }}
            onEditingCellChange={vi.fn()}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(people));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "First" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(committed).toEqual([{ previousValue: "Carol", value: "First" }]);

    // The owner ignored the close and fed back a normalized value. That is what the cell holds
    // now, and what the editor still on screen has to show.
    rerender(view([
      {
        active: true,
        id: "1",
        name: "FIRST"
      },
      people[1] as Person
    ]));

    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("FIRST");

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Second" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(committed[1]).toEqual({ previousValue: "FIRST", value: "Second" });
  });

  it("does not bring a written value back when the data returns to what it departed from", () => {
    const { rerender } = render(fixedCellView(namedPerson("Carol")));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "First" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    // The write lands in the data...
    rerender(fixedCellView(namedPerson("First")));
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("First");

    // ...and is then reverted by somebody else. That is the data's own value now, not ours
    // resurfacing because it happens to match what the write departed from.
    rerender(fixedCellView(namedPerson("Carol")));

    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Carol");
  });

  it("hands a remounted editor the session it belongs to", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();
    const committed: Array<{ previousValue: unknown; value: unknown }> = [];

    render(
      <DataTable
        columns={customNameColumn}
        data={people}
        getRowId={getRowId}
        handleRef={handle}
        onEditCommit={change => {
          committed.push({ previousValue: change.previousValue, value: change.value });

          return committed.length === 1 ? inFlight.promise : undefined;
        }}
      />,
      { wrapper }
    );

    fireEvent.doubleClick(screen.getByText("Carol"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "First" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(committed).toEqual([{ previousValue: "Carol", value: "First" }]);
    expect(document.querySelector("[data-pending]")).toBeTruthy();

    // The row scrolls out and back while the write is still out — a real unmount and a new editor
    // for the same cell, not StrictMode replaying an effect.
    act(() => handle.current?.table.getColumn("name")?.toggleVisibility(false));
    expect(screen.queryByRole("textbox")).toBeNull();
    act(() => handle.current?.table.getColumn("name")?.toggleVisibility(true));
    expect(await screen.findByRole("textbox")).toBeTruthy();

    // What the editor shows and what it may do both belong to the session, not to the instance
    // that started it: the value it sent is still what the cell holds, and the write is still out.
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("First");
    expect(document.querySelector("[data-pending]")).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Second" } });

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });

    // The settle never carried "Second", so it cannot close the editor holding it.
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Second");

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    // And the second write departs from what the first one wrote, not from the data behind it.
    expect(committed).toEqual([
      { previousValue: "Carol", value: "First" },
      { previousValue: "First", value: "Second" }
    ]);
  });

  it("shows a rejection to the editor that came back for it", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();

    render(
      <DataTable
        columns={customNameColumn}
        data={people}
        getRowId={getRowId}
        handleRef={handle}
        onEditCommit={() => inFlight.promise}
      />,
      { wrapper }
    );

    fireEvent.doubleClick(screen.getByText("Carol"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "First" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    act(() => handle.current?.table.getColumn("name")?.toggleVisibility(false));
    act(() => handle.current?.table.getColumn("name")?.toggleVisibility(true));
    expect(await screen.findByRole("textbox")).toBeTruthy();

    await act(async () => {
      inFlight.reject(new Error("Server said no"));
      await inFlight.promise.catch(() => undefined);
    });

    // The failure belongs to the session, so the instance that replaced the sender shows it — and
    // the value that failed is still there to fix.
    expect(await screen.findByText("Server said no")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("First");
  });

  it("does not un-cancel a session when the gate reopens before its write lands", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();

    const view = (enableEditing: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={nameColumn()}
            data={people}
            enableEditing={enableEditing}
            getRowId={getRowId}
            handleRef={handle}
            onEditCommit={() => inFlight.promise}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(true));

    fireEvent.doubleClick(screen.getByText("Carol"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "First" } });

    // Asking for Alice's cell commits this one first and waits on the write.
    act(() => handle.current?.startEditing("2", "name"));

    // The gate shuts while the write is out, and reopens before it lands.
    rerender(view(false));
    rerender(view(true));

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });

    // Losing eligibility ended that session. A gate reopening is the next session's eligibility,
    // not a reprieve for the one that was cancelled — so nothing opens on its behalf.
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("does not let a departing cell's tick commit the one that replaced it", () => {
    vi.useFakeTimers();

    try {
      const handle = createRef<DataTableHandle<Person>>();
      const onEditCommit = vi.fn();

      render(
        <DataTable
          columns={editableColumns}
          data={people}
          getRowId={getRowId}
          handleRef={handle}
          onEditCommit={onEditCommit}
        />,
        { wrapper }
      );

      fireEvent.doubleClick(screen.getByText("Carol"));
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "First" } });

      // Moving to Alice's cell commits Carol's and opens Alice's in the same commit, so Carol's
      // editor departs with the slice already pointing elsewhere.
      act(() => handle.current?.startEditing("2", "name"));
      expect(onEditCommit).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("textbox")).toBeTruthy();

      // A second switch in the same breath: now two departures are outstanding at once.
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "Second" } });
      act(() => handle.current?.startEditing("1", "id"));
      expect(onEditCommit).toHaveBeenCalledTimes(2);

      // Both departure ticks land afterwards. Each belongs to a session that is over.
      act(() => vi.advanceTimersByTime(1));

      expect(screen.getAllByRole("textbox")).toHaveLength(1);
      expect(onEditCommit).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is read-only when the mode has no commit handler", () => {
    const handle = createRef<DataTableHandle<Person>>();
    const checkboxColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { edit: "text" }
      },
      {
        accessorKey: "active",
        header: "Active",
        meta: { edit: "checkbox" }
      }
    ];

    render(
      <DataTable
        columns={checkboxColumns}
        data={people}
        getRowId={getRowId}
        handleRef={handle}
      />,
      { wrapper }
    );

    // The commit belongs to the application. With no `onEditCommit` there is nowhere for an edit
    // to go, so the cells are read-only rather than editable-and-then-silently-lost.
    fireEvent.doubleClick(screen.getByText("Carol"));
    expect(screen.queryByRole("textbox")).toBeNull();

    act(() => handle.current?.startEditing("1", "name"));
    expect(screen.queryByRole("textbox")).toBeNull();

    // The checkbox variant is a live control, and it went the same way.
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("keeps a cell whose gate shut from rendering an editor again", async () => {
    const handle = createRef<DataTableHandle<Person>>();

    const view = (enableEditing: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={customNameColumn}
            data={people}
            editingCell={{ columnId: "name", rowId: "1" }}
            enableEditing={enableEditing}
            getRowId={getRowId}
            handleRef={handle}
            onEditCommit={vi.fn()}
            onEditingCellChange={vi.fn()}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(true));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Drafted" } });

    // The gate shuts. A custom editor is never disabled by anything the host does, so the only
    // way it stops being interactive is by not being there.
    rerender(view(false));
    expect(screen.queryByRole("textbox")).toBeNull();

    // The owner declined to clear the slice, so it still names this cell. The gate reopening is
    // the next session's eligibility, not a reprieve for the one that was cancelled.
    rerender(view(true));
    expect(screen.queryByRole("textbox")).toBeNull();

    // An explicit start on the same target is that next session — and nothing the old one held
    // comes back with it.
    act(() => handle.current?.startEditing("1", "name"));

    const input = await screen.findByRole("textbox");
    expect((input as HTMLInputElement).value).toBe("Carol");
  });

  it("does not carry a cancelled session's pending commit into the one restarting it", () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();
    const onEditCommit = vi.fn(() => inFlight.promise);

    const view = (enableEditing: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={nameColumn()}
            data={people}
            editingCell={{ columnId: "name", rowId: "1" }}
            enableEditing={enableEditing}
            getRowId={getRowId}
            handleRef={handle}
            onEditCommit={onEditCommit}
            onEditingCellChange={vi.fn()}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(true));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "First" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(true);

    // The gate shuts while that write is still out, and reopens. The session is cancelled either
    // way, and the owner declined to close it, so the slice still names this cell.
    rerender(view(false));
    rerender(view(true));
    expect(screen.queryByRole("textbox")).toBeNull();

    // The next session opens on the same cell. Nothing the cancelled one held may come with it —
    // least of all a write whose settlement will find a token that no longer matches, and so will
    // never clear the flag it set.
    act(() => handle.current?.startEditing("1", "name"));

    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.disabled).toBe(false);
    expect(input.value).toBe("Carol");
    expect(document.querySelector("[data-pending]")).toBeNull();

    // And what a live session can do, this one can do: type, and cancel.
    fireEvent.change(input, { target: { value: "Second" } });
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Second");

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Carol");
  });

  it("takes an editor off the screen in the same commit its gate shuts", () => {
    const editorsAtLayout: number[] = [];

    const observe = () => {
      editorsAtLayout.push(document.querySelectorAll(".ledger-cell-editor input").length);
    };

    const view = (enableEditing: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={customNameColumn}
            data={people}
            editingCell={{ columnId: "name", rowId: "1" }}
            enableEditing={enableEditing}
            getRowId={getRowId}
            onEditCommit={vi.fn()}
            onEditingCellChange={vi.fn()}
          />

          <LayoutProbe observe={observe} />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(true));
    expect(editorsAtLayout.at(-1)).toBe(1);
    editorsAtLayout.length = 0;

    // The gate shuts. Ending the *session* is a side effect and belongs to reconciliation, which
    // runs after the paint — but whether an editor is on the screen is a question this render can
    // answer for itself, and this render already knows the gate is shut. A frame with a live
    // editor behind a closed gate is one the user can type into.
    rerender(view(false));

    expect(editorsAtLayout).not.toContain(1);
  });

  it("keeps a controlled session waiting for a row that has not arrived", async () => {
    const { rerender } = render(pendingRowView([]));
    expect(screen.queryByRole("textbox")).toBeNull();

    // A row the data does not hold yet is a target that has not arrived — not an application
    // closing the editing gate. The session waits for it.
    rerender(pendingRowView(people));

    const input = await screen.findByRole("textbox");
    expect((input as HTMLInputElement).value).toBe("Carol");
  });

  it("does not record a write the data moved out from under while it was in flight", async () => {
    const inFlight = Promise.withResolvers<void>();
    const committed: Array<{ previousValue: unknown; value: unknown }> = [];
    const view = (rows: Person[]) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={customNameColumn}
            data={rows}
            editingCell={{ columnId: "name", rowId: "1" }}
            getRowId={getRowId}
            onEditCommit={change => {
              committed.push({ previousValue: change.previousValue, value: change.value });

              return committed.length === 1 ? inFlight.promise : undefined;
            }}
            onEditingCellChange={vi.fn()}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(namedPerson("Carol")));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "First" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    // While the write is out, somebody else moves the row — and then moves it back. The data did
    // move, even though where it landed is where the write departed from.
    rerender(view(namedPerson("Caroline")));
    rerender(view(namedPerson("Carol")));

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });

    // So there is nothing for the write to still be true about: the data is what the cell holds.
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Carol");

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Second" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(committed[1]).toEqual({ previousValue: "Carol", value: "Second" });
  });

  it("re-registers its editors when the table it belongs to is replaced", () => {
    render(<SwappableTable />, { wrapper });

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Drafted" } });
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Drafted");

    // The table is replaced under an editor React keeps: same cell, same element, same instance.
    // Its registration belonged to the controller that is gone.
    fireEvent.click(screen.getByRole("button", { name: "swap" }));

    // Typing reaches the new controller's store, and the new controller has to be able to tell
    // this editor to draw what it now holds.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Second" } });

    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Second");
  });

  it("does not authorize a move when the commit itself finds the gate shut", () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onEditingCellChange = vi.fn();
    // `edit.enabled` is application code, and nothing makes it answer the same way twice — so a
    // commit can be the first thing to learn that the gate is shut, with no render in between.
    let gateOpen = true;
    const gated: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: {
          edit: {
            enabled: () => gateOpen,
            variant: "text"
          }
        }
      }
    ];

    render(
      <DataTable
        columns={gated}
        data={people}
        editingCell={{ columnId: "name", rowId: "1" }}
        getRowId={getRowId}
        handleRef={handle}
        onEditCommit={vi.fn()}
        onEditingCellChange={onEditingCellChange}
      />,
      { wrapper }
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Drafted" } });
    onEditingCellChange.mockClear();

    act(() => {
      gateOpen = false;
      handle.current?.startEditing("2", "name");
    });

    // A session cancelled by its gate did not finish, so nothing opens on its behalf — and the
    // one close it needed was asked for once.
    expect(onEditingCellChange).not.toHaveBeenCalledWith({ columnId: "name", rowId: "2" });
    expect(onEditingCellChange.mock.calls).toEqual([[null]]);
  });

  it("asks again to close a cancelled session when an explicit stop commits it", () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onEditingCellChange = vi.fn();

    const view = (enableEditing: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={customNameColumn}
            data={people}
            editingCell={{ columnId: "name", rowId: "1" }}
            enableEditing={enableEditing}
            getRowId={getRowId}
            handleRef={handle}
            onEditCommit={vi.fn()}
            onEditingCellChange={onEditingCellChange}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(true));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Drafted" } });
    onEditingCellChange.mockClear();

    // The gate shuts. Reconciliation cancels the session and asks once; the owner declines, so
    // the slice goes on naming this cell — and reconciliation will not ask again.
    rerender(view(false));
    expect(onEditingCellChange.mock.calls).toEqual([[null]]);

    rerender(view(false));
    expect(onEditingCellChange.mock.calls).toEqual([[null]]);

    // An explicit stop is a command, and a command is always a new request — whichever way it is
    // spelled. `commit: true` has nothing left to send, but it still wants the cell closed.
    act(() => handle.current?.stopEditing({ commit: true }));
    expect(onEditingCellChange.mock.calls).toEqual([[null], [null]]);

    act(() => handle.current?.stopEditing({ commit: false }));
    expect(onEditingCellChange.mock.calls).toEqual([[null], [null], [null]]);
  });

  it("closes a session whose target never arrived when asked to", () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onEditingCellChange = vi.fn();

    render(
      <DataTable
        columns={customNameColumn}
        data={[]}
        editingCell={{ columnId: "name", rowId: "late" }}
        getRowId={getRowId}
        handleRef={handle}
        onEditCommit={vi.fn()}
        onEditingCellChange={onEditingCellChange}
      />,
      { wrapper }
    );

    // Nothing to commit — but an explicit stop is still a request to leave, and a session waiting
    // for a row that never came has to be closable.
    act(() => handle.current?.stopEditing());
    expect(onEditingCellChange.mock.calls).toEqual([[null]]);

    // The owner ignored it, so asking again is a new request, not the same one repeated.
    onEditingCellChange.mockClear();
    act(() => handle.current?.stopEditing());
    expect(onEditingCellChange.mock.calls).toEqual([[null]]);
  });

  it("commits through the handler as it is now, not as the row last saw it", () => {
    const seen: number[] = [];

    function Host() {
      const [tick, setTick] = useState(0);

      return (
        <>
          <button type="button" onClick={() => setTick(value => value + 1)}>
            tick
          </button>

          <DataTable
            columns={nameColumn()}
            data={people}
            editingCell={{ columnId: "name", rowId: "1" }}
            getRowId={getRowId}
            onEditCommit={() => {
              seen.push(tick);
            }}
            onEditingCellChange={vi.fn()}
          />
        </>
      );
    }

    render(<Host />, { wrapper });

    // A handler written inline is a new function on every render, and the rows deliberately do
    // not re-render for that — the memo token reads presence, not identity. So nothing in the
    // row may be holding the handler: the write goes through the session, whose event callbacks
    // always reach the latest.
    fireEvent.click(screen.getByRole("button", { name: "tick" }));
    fireEvent.click(screen.getByRole("button", { name: "tick" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Drafted" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(seen).toEqual([2]);
  });

  it("does not let a render nobody saw shut the gate on the editor on screen", () => {
    const onEditCommit = vi.fn();
    const blocker = Promise.withResolvers<void>();

    function Blocker({ blocked }: { blocked: boolean }) {
      if (blocked) {
        throw blocker.promise;
      }

      return null;
    }

    function Harness() {
      const [editingEnabled, setEditingEnabled] = useState(true);
      const [blocked, setBlocked] = useState(false);

      return (
        <>
          <DataTable
            columns={nameColumn()}
            data={people}
            enableEditing={editingEnabled}
            getRowId={getRowId}
            onEditCommit={onEditCommit}
          />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setEditingEnabled(false);
              setBlocked(true);
            })}
          >
            shut
          </button>

          <Suspense fallback={<div>waiting</div>}>
            <Blocker blocked={blocked} />
          </Suspense>
        </>
      );
    }

    render(<Harness />, { wrapper });

    fireEvent.doubleClick(screen.getByText("Carol"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Drafted" } });

    // The transition renders the table with editing switched off and is then thrown away,
    // because a sibling suspends. Nothing of it reached the screen.
    fireEvent.click(screen.getByRole("button", { name: "shut" }));
    expect(screen.getByRole("textbox")).toBeTruthy();

    // So the gate is still open, and Enter commits. A render nobody saw may not decide that this
    // draft was written behind a closed gate and throw it away.
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(onEditCommit).toHaveBeenCalledTimes(1);
    expect(onEditCommit.mock.calls[0]?.[0]).toMatchObject({ previousValue: "Carol", value: "Drafted" });
  });

  it("commits against the row on screen, not one a discarded render replaced", () => {
    const onEditCommit = vi.fn();
    const blocker = Promise.withResolvers<void>();

    function Blocker({ blocked }: { blocked: boolean }) {
      if (blocked) {
        throw blocker.promise;
      }

      return null;
    }

    function Harness({ next }: { next: Person[] }) {
      const [rows, setRows] = useState(people);
      const [blocked, setBlocked] = useState(false);

      return (
        <>
          <DataTable
            columns={nameColumn()}
            data={rows}
            getRowId={getRowId}
            onEditCommit={onEditCommit}
          />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setRows(next);
              setBlocked(true);
            })}
          >
            swap
          </button>

          <Suspense fallback={<div>waiting</div>}>
            <Blocker blocked={blocked} />
          </Suspense>
        </>
      );
    }

    render(<Harness next={namedPerson("Moved")} />, { wrapper });

    fireEvent.doubleClick(screen.getByText("Carol"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Drafted" } });

    // The transition renders the row holding a different value and is then thrown away.
    fireEvent.click(screen.getByRole("button", { name: "swap" }));
    expect(screen.getByRole("textbox")).toBeTruthy();

    // What the row is editing away from is what the application last knew — and it never knew
    // "Moved", because no render carrying it ever reached the screen.
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onEditCommit.mock.calls[0]?.[0]).toMatchObject({ previousValue: "Carol", value: "Drafted" });
  });

  it("commits a draft whose row a discarded render removed", () => {
    const onEditCommit = vi.fn();
    const blocker = Promise.withResolvers<void>();

    function Blocker({ blocked }: { blocked: boolean }) {
      if (blocked) {
        throw blocker.promise;
      }

      return null;
    }

    function Harness() {
      const [rows, setRows] = useState(people);
      const [blocked, setBlocked] = useState(false);

      return (
        <>
          <DataTable
            columns={nameColumn()}
            data={rows}
            getRowId={getRowId}
            onEditCommit={onEditCommit}
          />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setRows([]);
              setBlocked(true);
            })}
          >
            empty
          </button>

          <Suspense fallback={<div>waiting</div>}>
            <Blocker blocked={blocked} />
          </Suspense>
        </>
      );
    }

    render(<Harness />, { wrapper });

    fireEvent.doubleClick(screen.getByText("Carol"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Drafted" } });

    // The transition renders an empty table and is thrown away. The row is still on screen, so
    // "the row is not in the table" is not something this commit may conclude — and concluding it
    // would report success while dropping the draft, which is the worst of both.
    fireEvent.click(screen.getByRole("button", { name: "empty" }));
    expect(screen.getByRole("textbox")).toBeTruthy();

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onEditCommit).toHaveBeenCalledTimes(1);
    expect(onEditCommit.mock.calls[0]?.[0]).toMatchObject({ previousValue: "Carol", value: "Drafted" });
  });

  it("does not let a render nobody saw strip the column's edit meta", () => {
    const onEditCommit = vi.fn();
    const blocker = Promise.withResolvers<void>();
    const readOnly: Array<ColumnDef<Person, any>> = [{ accessorKey: "name", header: "Name" }];

    function Blocker({ blocked }: { blocked: boolean }) {
      if (blocked) {
        throw blocker.promise;
      }

      return null;
    }

    function Harness() {
      const [defs, setDefs] = useState(() => nameColumn());
      const [blocked, setBlocked] = useState(false);

      return (
        <>
          <DataTable
            columns={defs}
            data={people}
            getRowId={getRowId}
            onEditCommit={onEditCommit}
          />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setDefs(readOnly);
              setBlocked(true);
            })}
          >
            strip
          </button>

          <Suspense fallback={<div>waiting</div>}>
            <Blocker blocked={blocked} />
          </Suspense>
        </>
      );
    }

    render(<Harness />, { wrapper });

    fireEvent.doubleClick(screen.getByText("Carol"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Drafted" } });

    // Same gate, reached through the column definitions rather than the switch.
    fireEvent.click(screen.getByRole("button", { name: "strip" }));
    expect(screen.getByRole("textbox")).toBeTruthy();

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onEditCommit).toHaveBeenCalledTimes(1);
  });

  it("reads a value through the accessor the committed render resolved", () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onEditCommit = vi.fn();
    const validated: unknown[] = [];
    const blocker = Promise.withResolvers<void>();
    // Same column id, different accessor. Reading a value has to resolve a column to do it, and
    // the row's own `getValue` resolves one through the shared core — so ledger resolves it from
    // the committed column instead. (Upstream caches a row's values after the first read, which
    // would mask this in most orders; the assertion below pins that the swap really landed.)
    const named = (accessor: (person: Person) => string): Array<ColumnDef<Person, any>> => [
      {
        id: "name",
        accessorFn: accessor,
        header: "Name",
        cell: () => "fixed",
        meta: {
          edit: {
            validate: value => {
              validated.push(value);

              return null;
            },
            variant: "text"
          }
        }
      },
      { accessorKey: "id", header: "Id" }
    ];

    function Blocker({ blocked }: { blocked: boolean }) {
      if (blocked) {
        throw blocker.promise;
      }

      return null;
    }

    function Harness() {
      const [defs, setDefs] = useState(() => named(person => person.name));
      const [blocked, setBlocked] = useState(false);

      return (
        <>
          <DataTable
            columns={defs}
            columnVisibility={{ name: false }}
            data={people}
            editingCell={{ columnId: "name", rowId: "1" }}
            getRowId={getRowId}
            handleRef={handle}
            onColumnVisibilityChange={vi.fn()}
            onEditCommit={onEditCommit}
            onEditingCellChange={vi.fn()}
          />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setDefs(named(() => "FROM-A-RENDER-NOBODY-SAW"));
              setBlocked(true);
            })}
          >
            reaccess
          </button>

          <Suspense fallback={<div>waiting</div>}>
            <Blocker blocked={blocked} />
          </Suspense>
        </>
      );
    }

    render(<Harness />, { wrapper });

    // The column is hidden, so no editor mounts. The draft goes straight to the session, which is
    // what an editor would have done.
    act(() => {
      handle.current?.table.options.meta?.ledger?.editing.drafts.write("1", "name", "Drafted");
    });

    // The transition swaps the accessor behind the same column id and is thrown away.
    fireEvent.click(screen.getByRole("button", { name: "reaccess" }));
    // The discarded pass really did reach the shared core: this is the accessor a commit would
    // resolve if it went looking for the column there.
    expect(handle.current?.table.getColumn("name")?.accessorFn?.(people[0] as Person, 0))
      .toBe("FROM-A-RENDER-NOBODY-SAW");

    act(() => handle.current?.stopEditing({ commit: true }));

    expect(onEditCommit).toHaveBeenCalledTimes(1);
    expect(onEditCommit.mock.calls[0]?.[0]).toMatchObject({ previousValue: "Carol", value: "Drafted" });
    expect(validated).toEqual(["Drafted"]);
  });

  it("a validation message blocks the commit and stays in editing", () => {
    const onEditCommit = vi.fn();
    render(
      <DataTable
        columns={nameColumn(value => String(value).length < 3 ? "too short" : null)}
        data={people}
        getRowId={getRowId}
        onEditCommit={onEditCommit}
      />,
      { wrapper }
    );

    fireEvent.doubleClick(screen.getByText("Carol"));

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onEditCommit).not.toHaveBeenCalled();
    expect(screen.getByText("too short")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("an async commit shows pending, then closes on resolve and stays on reject", async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    const onEditCommit = vi.fn(() => promise);

    render(
      <DataTable
        columns={nameColumn()}
        data={people}
        getRowId={getRowId}
        onEditCommit={onEditCommit}
      />,
      { wrapper }
    );

    fireEvent.doubleClick(screen.getByText("Carol"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Caroline" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(document.querySelector("[data-pending]")).toBeTruthy();

    resolve();
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });

  it("a rejected commit surfaces the reason and keeps editing", async () => {
    const onEditCommit = vi.fn(() => Promise.reject(new Error("server said no")));

    render(
      <DataTable
        columns={nameColumn()}
        data={people}
        getRowId={getRowId}
        onEditCommit={onEditCommit}
      />,
      { wrapper }
    );

    fireEvent.doubleClick(screen.getByText("Carol"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Caroline" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("server said no")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("commits — never discards — when unmounted mid-edit, deferred one tick", () => {
    // Regression: the deferral lets StrictMode's simulated unmount (and virtualizer row
    // remounts) cancel the commit, while a real departure still commits.
    vi.useFakeTimers();

    try {
      const onEditCommit = vi.fn();
      const { unmount } = render(
        <DataTable
          columns={nameColumn()}
          data={people}
          getRowId={getRowId}
          onEditCommit={onEditCommit}
        />,
        { wrapper }
      );

      fireEvent.doubleClick(screen.getByText("Carol"));
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "Caroline" } });

      unmount();
      expect(onEditCommit).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onEditCommit).toHaveBeenCalledTimes(1);
      expect(onEditCommit.mock.calls[0]?.[0]).toMatchObject({ value: "Caroline" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("the checkbox variant commits on toggle without entering edit mode", () => {
    const onEditCommit = vi.fn();
    const { container } = render(
      <DataTable
        data={people}
        getRowId={getRowId}
        columns={[
          {
            accessorKey: "active",
            header: "Active",
            meta: { edit: "checkbox" }
          }
        ]}
        onEditCommit={onEditCommit}
      />,
      { wrapper }
    );

    const checkbox = container.querySelector(":scope .ledger-cell input[type=\"checkbox\"]");
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox as Element);

    expect(onEditCommit).toHaveBeenCalledTimes(1);
    expect(onEditCommit.mock.calls[0]?.[0]).toMatchObject({ value: false, previousValue: true });
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("does not leave a cell when Tab hits validation or an async rejection", async () => {
    const onEditCommit = vi.fn(() => Promise.reject(new Error("server said no")));
    const editableColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: {
          edit: {
            variant: "text",
            validate: value => value === "invalid" ? "invalid name" : null
          }
        }
      },
      {
        accessorKey: "id",
        header: "ID",
        meta: { edit: "text" }
      }
    ];

    render(
      <DataTable
        columns={editableColumns}
        data={people}
        getRowId={getRowId}
        onEditCommit={onEditCommit}
      />,
      { wrapper }
    );

    fireEvent.doubleClick(screen.getByText("Carol"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "invalid" } });
    fireEvent.keyDown(input, { key: "Tab" });

    expect(screen.getByText("invalid name")).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("invalid");
    expect(onEditCommit).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "Caroline" } });
    fireEvent.keyDown(input, { key: "Tab" });

    expect(await screen.findByText("server said no")).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("Caroline");
  });

  it("waits for an async Tab commit, then skips an object-form checkbox editor", async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    const editableColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { edit: "text" }
      },
      {
        accessorKey: "active",
        header: "Active",
        meta: { edit: { variant: "checkbox" } }
      },
      {
        accessorKey: "id",
        header: "ID",
        meta: { edit: "text" }
      }
    ];

    render(
      <DataTable
        columns={editableColumns}
        data={people}
        getRowId={getRowId}
        onEditCommit={() => promise}
      />,
      { wrapper }
    );

    fireEvent.doubleClick(screen.getByText("Carol"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Caroline" } });
    fireEvent.keyDown(input, { key: "Tab" });

    expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("Caroline");
    expect(document.querySelector("[data-pending]")).toBeTruthy();

    resolve();

    await waitFor(() => expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("1"));
  });

  it("handles an async checkbox rejection and exposes the error without an unhandled promise", async () => {
    const { container } = render(
      <DataTable
        data={people}
        getRowId={getRowId}
        columns={[
          {
            accessorKey: "active",
            header: "Active",
            meta: { edit: { variant: "checkbox" } }
          }
        ]}
        onEditCommit={() => Promise.reject(new Error("toggle failed"))}
      />,
      { wrapper }
    );

    const checkbox = container.querySelector<HTMLInputElement>(":scope .ledger-cell input[type=\"checkbox\"]");
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox!);

    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toBe("toggle failed");
    expect(checkbox?.disabled).toBe(false);
  });

  it("blocks an object-form checkbox commit when validation fails", () => {
    const onEditCommit = vi.fn();

    const { container } = render(
      <DataTable
        data={people}
        getRowId={getRowId}
        columns={[
          {
            accessorKey: "active",
            header: "Active",
            meta: {
              edit: {
                variant: "checkbox",
                validate: () => "toggle not allowed"
              }
            }
          }
        ]}
        onEditCommit={onEditCommit}
      />,
      { wrapper }
    );

    const checkbox = container.querySelector<HTMLInputElement>(":scope .ledger-cell input[type=\"checkbox\"]");
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox!);

    expect(screen.getByRole("alert").textContent).toBe("toggle not allowed");
    expect(onEditCommit).not.toHaveBeenCalled();
  });
});
