import type { ReactNode } from "react";

import type { ColumnDef, DataTableHandle } from "./types";

import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, startTransition, StrictMode, Suspense, useLayoutEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "./data-table";

interface Person {
  id: string;
  name: string;
  age: number;
  /**
   * Never in the shared `columns` — it is here for the tests that need a checkbox column.
   */
  active?: boolean;
}

const people: Person[] = [
  {
    id: "1",
    name: "Carol",
    age: 30,
    active: true
  },
  {
    id: "2",
    name: "Alice",
    age: 25,
    active: false
  }
];

const columns: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { edit: "text" }
  },
  {
    accessorKey: "age",
    header: "Age",
    meta: { edit: "number" }
  },
  { accessorKey: "id", header: "Id" }
];

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <MantineProvider>{children}</MantineProvider>
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

const editorInputs = () => [...document.querySelectorAll<HTMLInputElement>(".ledger-cell-editor input")];
const viewport = () => document.querySelector(".ledger-scroller [tabindex=\"0\"]") as HTMLElement;

describe("keyboard entry into editing", () => {
  it("starts cell-mode editing at the row's first editable cell on F2", async () => {
    Element.prototype.scrollIntoView ??= () => undefined;

    render(
      <DataTable
        enableActiveRow
        columns={columns}
        data={people}
        defaultActiveRowId="2"
        getRowId={person => person.id}
        onEditCommit={vi.fn()}
      />,
      { wrapper }
    );

    // Enter activates the row; only F2 edits — that overload is why the pattern reserves it.
    fireEvent.keyDown(viewport(), { key: "Enter" });
    expect(editorInputs()).toHaveLength(0);

    fireEvent.keyDown(viewport(), { key: "F2" });

    await waitFor(() => expect(editorInputs()).toHaveLength(1));
    expect(
      document.querySelector("[data-row-id=\"2\"] td[data-ledger-column-id=\"name\"][data-editing]")
    ).toBeTruthy();
  });

  it("opens the whole row on F2 under editMode row", async () => {
    Element.prototype.scrollIntoView ??= () => undefined;

    render(
      <DataTable
        enableActiveRow
        columns={columns}
        data={people}
        defaultActiveRowId="1"
        editMode="row"
        getRowId={person => person.id}
        onRowEditCommit={vi.fn()}
      />,
      { wrapper }
    );

    fireEvent.keyDown(viewport(), { key: "F2" });

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    expect(document.querySelector("[data-row-id=\"1\"][data-editing-row]")).toBeTruthy();
    // F2 places focus in an input — landing on the editors without the caret would leave the
    // keyboard user stranded on the viewport.
    await waitFor(() => expect(document.activeElement).toBe(editorInputs()[0]));
  });

  it("opens a row whose only editable column is a checkbox on F2", async () => {
    Element.prototype.scrollIntoView ??= () => undefined;
    // What a checkbox column *is* depends on the mode: in cell mode it commits on toggle and has
    // no editor for F2 to open, but in row mode it is a draft-bound editor like any other.
    const checkboxOnly: Array<ColumnDef<Person, any>> = [
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "active",
        header: "Active",
        meta: { edit: "checkbox" }
      }
    ];

    render(
      <DataTable
        enableActiveRow
        columns={checkboxOnly}
        data={people}
        defaultActiveRowId="1"
        editMode="row"
        getRowId={person => person.id}
        onRowEditCommit={vi.fn()}
      />,
      { wrapper }
    );

    fireEvent.keyDown(viewport(), { key: "F2" });

    await waitFor(() => expect(document.querySelector("[data-row-id=\"1\"][data-editing-row]")).toBeTruthy());
    expect(document.querySelectorAll(".ledger-cell-editor input[type=\"checkbox\"]")).toHaveLength(1);
  });

  it("does not open a cell-mode checkbox on F2", () => {
    Element.prototype.scrollIntoView ??= () => undefined;
    const checkboxOnly: Array<ColumnDef<Person, any>> = [
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "active",
        header: "Active",
        meta: { edit: "checkbox" }
      }
    ];

    render(
      <DataTable
        enableActiveRow
        columns={checkboxOnly}
        data={people}
        defaultActiveRowId="1"
        getRowId={person => person.id}
        onEditCommit={vi.fn()}
      />,
      { wrapper }
    );

    fireEvent.keyDown(viewport(), { key: "F2" });

    // Toggling is the commit, so there is no editor to place a caret in — F2 has nowhere to go.
    expect(editorInputs()).toHaveLength(0);
    expect(document.querySelector("[data-editing]")).toBeNull();
  });
});

describe("row editing mode", () => {
  it("opens every editable cell of the row and commits the whole row on Enter", async () => {
    const onRowEditCommit = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={people}
        editMode="row"
        getRowId={person => person.id}
        onRowEditCommit={onRowEditCommit}
      />,
      { wrapper }
    );

    const nameCell = document.querySelector(
      "[data-row-id=\"2\"] td[data-ledger-column-id=\"name\"]"
    ) as Element;
    fireEvent.doubleClick(nameCell);

    // Both editable cells host editors at once; the plain column does not.
    await waitFor(() => expect(editorInputs()).toHaveLength(2));

    const [nameInput, ageInput] = editorInputs();
    fireEvent.change(nameInput as HTMLInputElement, { target: { value: "Alicia" } });
    fireEvent.change(ageInput as HTMLInputElement, { target: { value: "26" } });

    fireEvent.keyDown(nameInput as HTMLInputElement, { key: "Enter" });

    await waitFor(() => expect(editorInputs()).toHaveLength(0));
    expect(onRowEditCommit).toHaveBeenCalledTimes(1);

    const change = onRowEditCommit.mock.calls[0]?.[0] as {
      row: { id: string };
      values: Record<string, unknown>;
      previousValues: Record<string, unknown>;
    };
    expect(change.row.id).toBe("2");
    expect(change.values).toEqual({ name: "Alicia", age: 26 });
    expect(change.previousValues).toEqual({ name: "Alice", age: 25 });
  });

  it("cancels the whole row on Escape without committing", async () => {
    const onRowEditCommit = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={people}
        editMode="row"
        getRowId={person => person.id}
        onRowEditCommit={onRowEditCommit}
      />,
      { wrapper }
    );

    fireEvent.doubleClick(document.querySelector("[data-row-id=\"1\"] td[data-ledger-column-id=\"name\"]") as Element);
    await waitFor(() => expect(editorInputs()).toHaveLength(2));

    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Changed" } });
    fireEvent.keyDown(editorInputs()[0] as HTMLInputElement, { key: "Escape" });

    await waitFor(() => expect(editorInputs()).toHaveLength(0));
    expect(onRowEditCommit).not.toHaveBeenCalled();
    expect(screen.getByText("Carol")).toBeTruthy();
  });

  it("blocks the commit on a validation failure and shows it on the failing editor", async () => {
    const onRowEditCommit = vi.fn();
    const validatingColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: {
          edit: {
            variant: "text",
            validate: value => value === "" ? "Name is required" : null
          }
        }
      },
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: "number" }
      }
    ];

    render(
      <DataTable
        columns={validatingColumns}
        data={people}
        editMode="row"
        getRowId={person => person.id}
        onRowEditCommit={onRowEditCommit}
      />,
      { wrapper }
    );

    fireEvent.doubleClick(document.querySelector("[data-row-id=\"1\"] td[data-ledger-column-id=\"name\"]") as Element);
    await waitFor(() => expect(editorInputs()).toHaveLength(2));

    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "" } });
    fireEvent.keyDown(editorInputs()[0] as HTMLInputElement, { key: "Enter" });

    expect(await screen.findByText("Name is required")).toBeTruthy();
    expect(onRowEditCommit).not.toHaveBeenCalled();
    expect(editorInputs().length).toBeGreaterThan(0);
  });

  it("does not carry a draft across a controlled editingRowId switch", async () => {
    const { rerender } = render(
      <DataTable
        columns={columns}
        data={people}
        editingRowId="1"
        editMode="row"
        getRowId={person => person.id}
        onRowEditCommit={vi.fn()}
      />,
      { wrapper }
    );

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });

    // The application moves the edit itself; startRowEditing never runs, so the store has to
    // notice the row changed on its own.
    rerender(
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            data={people}
            editingRowId="2"
            editMode="row"
            getRowId={person => person.id}
            onRowEditCommit={vi.fn()}
          />
        </MantineProvider>
      </StrictMode>
    );

    await waitFor(() => expect(document.querySelector("[data-row-id=\"2\"][data-editing-row]")).toBeTruthy());
    expect((editorInputs()[0] as HTMLInputElement).value).toBe("Alice");
  });

  it("does not hand a controlled switch the previous row's in-flight commit", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();
    const committed: Array<Record<string, unknown>> = [];
    const onRowEditCommit = vi.fn(({ values }: { values: Record<string, unknown> }) => {
      committed.push(values);

      return inFlight.promise;
    });

    const view = (rowId: string) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            data={people}
            editingRowId={rowId}
            editMode="row"
            getRowId={person => person.id}
            handleRef={handle}
            onRowEditCommit={onRowEditCommit}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view("1"));

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });
    act(() => handle.current?.stopEditing({ commit: true }));
    expect(onRowEditCommit).toHaveBeenCalledTimes(1);

    // The controller moves the edit while Carol's write is still in flight. Alice's own commit
    // must be issued, not answered with the promise Carol left behind.
    rerender(view("2"));
    await waitFor(() => expect(document.querySelector("[data-row-id=\"2\"][data-editing-row]")).toBeTruthy());

    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Second" } });
    act(() => handle.current?.stopEditing({ commit: true }));

    expect(onRowEditCommit).toHaveBeenCalledTimes(2);
    expect(committed[1]).toMatchObject({ name: "Second" });

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });
  });

  it("lets a controlled switch overrule a start still waiting on a commit", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();
    const onRowEditCommit = vi.fn(() => inFlight.promise);
    const onEditingRowIdChange = vi.fn();

    const view = (rowId: string | null) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            data={people}
            editingRowId={rowId}
            editMode="row"
            getRowId={person => person.id}
            handleRef={handle}
            onEditingRowIdChange={onEditingRowIdChange}
            onRowEditCommit={onRowEditCommit}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view("1"));

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });

    // Asking for Alice commits Carol first and waits on it; the controller then closes editing
    // outright, which overrules the row that request was going to open.
    act(() => handle.current?.startEditing("2"));
    expect(onRowEditCommit).toHaveBeenCalledTimes(1);

    onEditingRowIdChange.mockClear();
    rerender(view(null));

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });

    // Carol's commit succeeding must not resurrect the request for Alice.
    expect(onEditingRowIdChange).not.toHaveBeenCalledWith("2");
    expect(document.querySelector("[data-editing-row]")).toBeNull();
    expect(editorInputs()).toHaveLength(0);
  });

  it("keeps the row on screen when a transition to another row never commits", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();
    const blocker = Promise.withResolvers<void>();
    let unblocked = false;
    const onRowEditCommit = vi.fn(() => inFlight.promise);

    function Blocker({ blocked }: { blocked: boolean }) {
      if (blocked && !unblocked) {
        // Suspends the transition's render, so React throws that tree away and keeps the one
        // already on screen — the row the user is still editing. One-shot: the retry after the
        // release has to get through, or the test would leave React suspended for good.
        throw blocker.promise;
      }

      return null;
    }

    function Harness() {
      const [rowId, setRowId] = useState<string | null>("1");
      const [blocked, setBlocked] = useState(false);

      return (
        <>
          <DataTable
            columns={columns}
            data={people}
            editingRowId={rowId}
            editMode="row"
            getRowId={person => person.id}
            handleRef={handle}
            onEditingRowIdChange={setRowId}
            onRowEditCommit={onRowEditCommit}
          />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setRowId("2");
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

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });
    act(() => handle.current?.stopEditing({ commit: true }));
    expect(onRowEditCommit).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "switch" }));

    // Nothing reached the screen: Carol is still the row being edited.
    expect(document.querySelector("[data-row-id=\"1\"][data-editing-row]")).toBeTruthy();

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });

    // The commit still belongs to the row on screen, so it closes it. Judged stale — which is
    // what a session ended by a render that never happened would do — the editors would stay
    // mounted, disabled and pending, with the write already through.
    expect(editorInputs()).toHaveLength(0);
    expect(document.querySelector("[data-pending]")).toBeNull();

    // Let the abandoned transition finish rather than leaving React work behind the test.
    await act(async () => {
      unblocked = true;
      blocker.resolve();
      await blocker.promise;
    });
  });

  it("keeps editing the row on screen when the controller declines the switch", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onRowEditCommit = vi.fn();
    // A controlled slice whose owner ignores the change. React's contract is that the row on
    // screen stays the one `editingRowId` names, so that is the row every write still belongs
    // to — asking to move the edit is not the same as having moved it.
    const onEditingRowIdChange = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={people}
        editingRowId="1"
        editMode="row"
        getRowId={person => person.id}
        handleRef={handle}
        onEditingRowIdChange={onEditingRowIdChange}
        onRowEditCommit={onRowEditCommit}
      />,
      { wrapper }
    );

    await waitFor(() => expect(editorInputs()).toHaveLength(2));

    act(() => handle.current?.startEditing("2"));

    expect(onEditingRowIdChange).toHaveBeenCalledWith("2");
    expect(document.querySelector("[data-row-id=\"1\"][data-editing-row]")).toBeTruthy();

    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });
    act(() => handle.current?.stopEditing({ commit: true }));

    await waitFor(() => expect(onRowEditCommit).toHaveBeenCalledTimes(1));
    const change = onRowEditCommit.mock.calls[0]?.[0] as {
      row: { id: string };
      values: Record<string, unknown>;
    };
    expect(change.row.id).toBe("1");
    expect(change.values).toEqual({ age: 30, name: "Drafted" });
  });

  it("sends one write when the row is committed twice before the close renders", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onRowEditCommit = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={people}
        editMode="row"
        getRowId={person => person.id}
        handleRef={handle}
        onRowEditCommit={onRowEditCommit}
      />,
      { wrapper }
    );

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });

    // Closing the row and opening another are answered by a single render, so the second commit
    // runs while the first row is still the one on screen. The write it would repeat has
    // already gone out.
    act(() => {
      handle.current?.stopEditing({ commit: true });
      handle.current?.startEditing("2");
    });

    await waitFor(() => expect(document.querySelector("[data-row-id=\"2\"][data-editing-row]")).toBeTruthy());
    expect(onRowEditCommit).toHaveBeenCalledTimes(1);
  });

  it("captures the baseline when the edited row arrives after the first render", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onRowEditCommit = vi.fn();
    // Deep-linking straight into an edit: the row is named before the fetch that carries it
    // lands, so the first pass has no row to read a previous value from.
    const narrow: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: "number" }
      }
    ];

    const view = (rows: Person[], columnSet: Array<ColumnDef<Person, any>>) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columnSet}
            data={rows}
            editingRowId="1"
            editMode="row"
            getRowId={person => person.id}
            handleRef={handle}
            onRowEditCommit={onRowEditCommit}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view([], columns));
    expect(editorInputs()).toHaveLength(0);

    rerender(view(people, columns));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });

    // The column leaves the definitions, so only the baseline can say what was there before.
    rerender(view(people, narrow));
    await waitFor(() => expect(editorInputs()).toHaveLength(1));

    act(() => handle.current?.stopEditing({ commit: true }));

    await waitFor(() => expect(onRowEditCommit).toHaveBeenCalledTimes(1));
    const change = onRowEditCommit.mock.calls[0]?.[0] as { previousValues: Record<string, unknown> };
    expect(change.previousValues).toEqual({ age: 30, name: "Carol" });
  });

  it("keeps a value typed while an async row commit was in flight", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();
    const committed: Array<Record<string, unknown>> = [];
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
        editingRowId="1"
        editMode="row"
        getRowId={person => person.id}
        handleRef={handle}
        onEditingRowIdChange={vi.fn()}
        onRowEditCommit={({ values }) => {
          committed.push(values);

          return committed.length === 1 ? inFlight.promise : undefined;
        }}
      />,
      { wrapper }
    );

    await waitFor(() => expect(editorInputs()).toHaveLength(1));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "First" } });
    act(() => handle.current?.stopEditing({ commit: true }));
    expect(committed).toEqual([{ name: "First" }]);

    // The request is still out, and the row is still on screen: what is typed now is a value
    // the first write never carried.
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Second" } });

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });

    act(() => handle.current?.stopEditing({ commit: true }));
    expect(committed).toEqual([{ name: "First" }, { name: "Second" }]);
  });

  it("puts the editors back when the application declines to close a cancelled row", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onRowEditCommit = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={people}
        editingRowId="1"
        editMode="row"
        getRowId={person => person.id}
        handleRef={handle}
        onEditingRowIdChange={vi.fn()}
        onRowEditCommit={onRowEditCommit}
      />,
      { wrapper }
    );

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    const nameInput = editorInputs()[0] as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Drafted" } });
    expect((editorInputs()[0] as HTMLInputElement).value).toBe("Drafted");

    fireEvent.keyDown(nameInput, { key: "Escape" });

    // The cancel discarded the pending values and the controller kept the row, so what the row
    // shows has to be the row again — not a value nothing would commit.
    expect((editorInputs()[0] as HTMLInputElement).value).toBe("Carol");

    act(() => handle.current?.stopEditing({ commit: true }));
    expect(onRowEditCommit).not.toHaveBeenCalled();
  });

  it("writes the values this session already committed, not the data it has not reached", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const committed: Array<Record<string, unknown>> = [];

    render(
      <DataTable
        columns={columns}
        data={people}
        editingRowId="1"
        editMode="row"
        getRowId={person => person.id}
        handleRef={handle}
        onEditingRowIdChange={vi.fn()}
        onRowEditCommit={({ values }) => {
          committed.push(values);
        }}
      />,
      { wrapper }
    );

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "First" } });
    act(() => handle.current?.stopEditing({ commit: true }));
    expect(committed).toEqual([{ age: 30, name: "First" }]);

    // The application kept the row open and has not fed the write back into `data`, so the cell
    // still reads "Carol". A second commit must not carry that back over the name it just wrote.
    fireEvent.change(editorInputs()[1] as HTMLInputElement, { target: { value: "31" } });
    act(() => handle.current?.stopEditing({ commit: true }));

    expect(committed).toEqual([
      { age: 30, name: "First" },
      { age: 31, name: "First" }
    ]);
  });

  it("keeps an uncontrolled row open when its commit settles behind a newer draft", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();
    const committed: Array<Record<string, unknown>> = [];
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

    // No `editingRowId` prop: the ordinary uncontrolled slice, which closes the row itself.
    render(
      <DataTable
        columns={customName}
        data={people}
        editMode="row"
        getRowId={person => person.id}
        handleRef={handle}
        onRowEditCommit={({ values }) => {
          committed.push(values);

          return committed.length === 1 ? inFlight.promise : undefined;
        }}
      />,
      { wrapper }
    );

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(1));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "First" } });
    act(() => handle.current?.stopEditing({ commit: true }));
    expect(committed).toEqual([{ name: "First" }]);

    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Second" } });

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });

    // The write that settled never carried "Second", so leaving now would drop it.
    expect(editorInputs()).toHaveLength(1);
    expect((editorInputs()[0] as HTMLInputElement).value).toBe("Second");
    expect(document.querySelector("[data-pending]")).toBeNull();

    act(() => handle.current?.stopEditing({ commit: true }));
    await waitFor(() => expect(committed).toHaveLength(2));
    expect(committed[1]).toEqual({ name: "Second" });
  });

  it("cancels the row when the table-level switch shuts under it", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onRowEditCommit = vi.fn();

    const view = (enableEditing: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            data={people}
            editMode="row"
            enableEditing={enableEditing}
            getRowId={person => person.id}
            handleRef={handle}
            onRowEditCommit={onRowEditCommit}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(true));

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });

    // Losing eligibility cancels (docs/editing.md) — the body merely stops rendering editors, so
    // the session has to end itself or it would sit there behind a closed gate.
    rerender(view(false));

    await waitFor(() => expect(document.querySelector("[data-editing-row]")).toBeNull());
    expect(onRowEditCommit).not.toHaveBeenCalled();

    // Reopening the gate must not bring the session — or its draft — back with it.
    rerender(view(true));

    expect(editorInputs()).toHaveLength(0);
    expect(document.querySelector("[data-editing-row]")).toBeNull();
  });

  it("keeps a row whose other columns are still editable, dropping only the closed one", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onRowEditCommit = vi.fn();
    const readOnlyName: Array<ColumnDef<Person, any>> = [
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: "number" }
      }
    ];

    const view = (columnSet: Array<ColumnDef<Person, any>>) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columnSet}
            data={people}
            editMode="row"
            getRowId={person => person.id}
            handleRef={handle}
            onRowEditCommit={onRowEditCommit}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(columns));

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });

    rerender(view(readOnlyName));

    // One column shutting is not the row shutting: age is still editable, so the row stays.
    await waitFor(() => expect(editorInputs()).toHaveLength(1));
    expect(document.querySelector("[data-row-id=\"1\"][data-editing-row]")).toBeTruthy();

    // The gate reopens: the value typed behind it is gone, because nothing could have shown it.
    rerender(view(columns));

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    expect((editorInputs()[0] as HTMLInputElement).value).toBe("Carol");

    act(() => handle.current?.stopEditing({ commit: true }));
    expect(onRowEditCommit).not.toHaveBeenCalled();
  });

  it("lets data that moved past the value it acknowledged win the next commit", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const committed: Array<{ previousValues: Record<string, unknown>; values: Record<string, unknown> }> = [];

    const view = (rows: Person[]) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            data={rows}
            editingRowId="1"
            editMode="row"
            getRowId={person => person.id}
            handleRef={handle}
            onEditingRowIdChange={vi.fn()}
            onRowEditCommit={change => {
              committed.push({ previousValues: change.previousValues, values: change.values });
            }}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(people));

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "First" } });
    act(() => handle.current?.stopEditing({ commit: true }));
    expect(committed[0]?.values).toEqual({ age: 30, name: "First" });

    // The server normalized what it accepted and fed that back. It, not the value we sent, is
    // what the row now holds — and what the editor has to show.
    rerender(view([
      {
        age: 30,
        id: "1",
        name: "FIRST"
      },
      people[1] as Person
    ]));

    await waitFor(() => expect((editorInputs()[0] as HTMLInputElement).value).toBe("FIRST"));

    fireEvent.change(editorInputs()[1] as HTMLInputElement, { target: { value: "31" } });
    act(() => handle.current?.stopEditing({ commit: true }));

    expect(committed).toHaveLength(2);
    expect(committed[1]?.values).toEqual({ age: 31, name: "FIRST" });
    expect(committed[1]?.previousValues).toEqual({ age: 30, name: "FIRST" });
  });

  it("shows what the session wrote when an editor remounts under it", async () => {
    const handle = createRef<DataTableHandle<Person>>();

    render(
      <DataTable
        columns={columns}
        data={people}
        editingRowId="1"
        editMode="row"
        getRowId={person => person.id}
        handleRef={handle}
        onEditingRowIdChange={vi.fn()}
        onRowEditCommit={vi.fn()}
      />,
      { wrapper }
    );

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "First" } });
    act(() => handle.current?.stopEditing({ commit: true }));

    // The write went through and the application kept the row open without feeding it back. An
    // editor that unmounts and returns — the columns panel here, virtual scrolling in a real
    // table — must not go back to showing a value the row no longer holds.
    act(() => handle.current?.table.getColumn("name")?.toggleVisibility(false));
    await waitFor(() => expect(editorInputs()).toHaveLength(1));
    act(() => handle.current?.table.getColumn("name")?.toggleVisibility(true));

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    expect((editorInputs()[0] as HTMLInputElement).value).toBe("First");
  });

  it("does not bring a written value back when the data returns to what it departed from", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const committed: Array<Record<string, unknown>> = [];
    const named = (name: string): Person[] => [
      {
        age: 30,
        id: "1",
        name
      },
      people[1] as Person
    ];

    const view = (rows: Person[]) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            data={rows}
            editingRowId="1"
            editMode="row"
            getRowId={person => person.id}
            handleRef={handle}
            onEditingRowIdChange={vi.fn()}
            onRowEditCommit={({ values }) => {
              committed.push(values);
            }}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(named("Carol")));

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "First" } });
    act(() => handle.current?.stopEditing({ commit: true }));
    expect(committed).toHaveLength(1);

    // The write lands in the data...
    rerender(view(named("First")));
    await waitFor(() => expect((editorInputs()[0] as HTMLInputElement).value).toBe("First"));

    // ...and is then reverted by somebody else. That is the data's own value now, not ours
    // resurfacing because it happens to match what the write departed from.
    rerender(view(named("Carol")));

    await waitFor(() => expect((editorInputs()[0] as HTMLInputElement).value).toBe("Carol"));

    fireEvent.change(editorInputs()[1] as HTMLInputElement, { target: { value: "31" } });
    act(() => handle.current?.stopEditing({ commit: true }));

    expect(committed).toHaveLength(2);
    expect(committed[1]).toEqual({ age: 31, name: "Carol" });
  });

  it("keeps the row when its only editable column leaves the definitions", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onRowEditCommit = vi.fn();
    const editableName: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { edit: "text" }
      },
      { accessorKey: "id", header: "Id" }
    ];
    // The breakpoint takes the column away entirely. No gate shut — the layout changed.
    const narrow: Array<ColumnDef<Person, any>> = [{ accessorKey: "id", header: "Id" }];

    const view = (columnSet: Array<ColumnDef<Person, any>>) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columnSet}
            data={people}
            editMode="row"
            getRowId={person => person.id}
            handleRef={handle}
            onRowEditCommit={onRowEditCommit}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(editableName));

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(1));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });

    rerender(view(narrow));

    expect(document.querySelector("[data-row-id=\"1\"][data-editing-row]")).toBeTruthy();

    act(() => handle.current?.stopEditing({ commit: true }));

    await waitFor(() => expect(onRowEditCommit).toHaveBeenCalledTimes(1));
    const change = onRowEditCommit.mock.calls[0]?.[0] as {
      previousValues: Record<string, unknown>;
      values: Record<string, unknown>;
    };
    expect(change.values).toEqual({ name: "Drafted" });
    expect(change.previousValues).toEqual({ name: "Carol" });
  });

  it("ends the row when a commit rejects after the table switch shut behind it", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();

    const view = (enableEditing: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            data={people}
            editMode="row"
            enableEditing={enableEditing}
            getRowId={person => person.id}
            handleRef={handle}
            onRowEditCommit={() => inFlight.promise}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(true));

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });
    act(() => handle.current?.stopEditing({ commit: true }));

    // The gate shuts while the write is out. The row stops presenting as editing at once, and
    // every editor unmounts with it — so nothing is left whose state change could bring the
    // session round again, and the settlement has to end it.
    rerender(view(false));
    expect(document.querySelector("[data-editing-row]")).toBeNull();
    expect(editorInputs()).toHaveLength(0);

    await act(async () => {
      inFlight.reject(new Error("nope"));
      await inFlight.promise.catch(() => undefined);
    });

    expect(document.querySelector("[data-editing-row]")).toBeNull();

    rerender(view(true));

    expect(editorInputs()).toHaveLength(0);
    expect(document.querySelector("[data-editing-row]")).toBeNull();
  });

  it("does not authorize a switch when the gate shuts under a pending commit", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();
    const onEditingRowIdChange = vi.fn();

    const view = (enableEditing: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            data={people}
            editingRowId="1"
            editMode="row"
            enableEditing={enableEditing}
            getRowId={person => person.id}
            handleRef={handle}
            onEditingRowIdChange={onEditingRowIdChange}
            onRowEditCommit={() => inFlight.promise}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(true));

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });

    // Asking for Alice commits Carol first and waits on that write.
    act(() => handle.current?.startEditing("2"));
    onEditingRowIdChange.mockClear();

    // Editing is switched off while the write is out.
    rerender(view(false));

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });

    // The session ended because the gate shut, not because the row finished — nothing may be
    // opened on the strength of it, and the one ending is requested once.
    expect(onEditingRowIdChange).not.toHaveBeenCalledWith("2");
    expect(onEditingRowIdChange.mock.calls.filter(call => call[0] === null)).toHaveLength(1);
  });

  it("records a baseline for a column the session only meets later", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onRowEditCommit = vi.fn();
    const ageOnly: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: "number" }
      }
    ];

    const view = (columnSet: Array<ColumnDef<Person, any>>) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columnSet}
            data={people}
            editMode="row"
            getRowId={person => person.id}
            handleRef={handle}
            onRowEditCommit={onRowEditCommit}
          />
        </MantineProvider>
      </StrictMode>
    );

    // The session opens on a narrow breakpoint, where `name` is not in the definitions at all.
    const { rerender } = render(view(ageOnly));

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(1));

    // It widens, `name` arrives, and the user edits it.
    rerender(view(columns));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });

    // Then it narrows again and `name` is gone by commit time. What it held has to have been
    // recorded when the session met it, not only when the session opened.
    rerender(view(ageOnly));
    await waitFor(() => expect(editorInputs()).toHaveLength(1));

    act(() => handle.current?.stopEditing({ commit: true }));

    await waitFor(() => expect(onRowEditCommit).toHaveBeenCalledTimes(1));
    const change = onRowEditCommit.mock.calls[0]?.[0] as {
      previousValues: Record<string, unknown>;
      values: Record<string, unknown>;
    };
    expect(change.values).toEqual({ age: 30, name: "Drafted" });
    expect(change.previousValues).toEqual({ age: 30, name: "Carol" });
  });

  it("cancels the row when the gate shuts on the only column it met later", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const ageOnly: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: "number" }
      }
    ];
    const nameOnly: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { edit: "text" }
      }
    ];
    const readOnlyName: Array<ColumnDef<Person, any>> = [{ accessorKey: "name", header: "Name" }];

    const view = (columnSet: Array<ColumnDef<Person, any>>) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columnSet}
            data={people}
            editMode="row"
            getRowId={person => person.id}
            handleRef={handle}
            onRowEditCommit={vi.fn()}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(ageOnly));

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(1));

    // `age` leaves and `name` arrives: the only column the session can now edit is one it never
    // saw when it opened.
    rerender(view(nameOnly));
    await waitFor(() => expect(editorInputs()).toHaveLength(1));

    // Its gate shuts. That is a gate closing on a column this session was editing, so the row
    // ends — which it cannot know from the snapshot taken at the start.
    rerender(view(readOnlyName));

    await waitFor(() => expect(document.querySelector("[data-editing-row]")).toBeNull());
  });

  it("falls back to the last previous it saw when a column's definition goes", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onRowEditCommit = vi.fn();
    const narrow: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: "number" }
      }
    ];

    const view = (rows: Person[], columnSet: Array<ColumnDef<Person, any>>) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columnSet}
            data={rows}
            editMode="row"
            getRowId={person => person.id}
            handleRef={handle}
            onRowEditCommit={onRowEditCommit}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(people, columns));

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });

    // Somebody else changes the row while the column is still on screen. That is what the
    // application last knew it to hold.
    rerender(view([
      {
        age: 30,
        id: "1",
        name: "Caroline"
      },
      people[1] as Person
    ], columns));

    await waitFor(() => expect((editorInputs()[0] as HTMLInputElement).value).toBe("Drafted"));

    // The column then leaves the definitions, so only what the session observed can answer.
    rerender(view([
      {
        age: 30,
        id: "1",
        name: "Caroline"
      },
      people[1] as Person
    ], narrow));
    await waitFor(() => expect(editorInputs()).toHaveLength(1));

    act(() => handle.current?.stopEditing({ commit: true }));

    await waitFor(() => expect(onRowEditCommit).toHaveBeenCalledTimes(1));
    const change = onRowEditCommit.mock.calls[0]?.[0] as { previousValues: Record<string, unknown> };
    expect(change.previousValues).toEqual({ age: 30, name: "Caroline" });
  });

  it("shows a commit still in flight to an editor that remounted under it", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();

    render(
      <DataTable
        columns={columns}
        data={people}
        editMode="row"
        getRowId={person => person.id}
        handleRef={handle}
        onRowEditCommit={() => inFlight.promise}
      />,
      { wrapper }
    );

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });
    act(() => handle.current?.stopEditing({ commit: true }));

    await waitFor(() => expect(document.querySelectorAll("[data-pending]")).toHaveLength(2));

    // A real unmount and remount — the columns panel here, virtual scrolling in a real table.
    act(() => handle.current?.table.getColumn("name")?.toggleVisibility(false));
    await waitFor(() => expect(editorInputs()).toHaveLength(1));
    act(() => handle.current?.table.getColumn("name")?.toggleVisibility(true));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));

    // The write is still out. An editor that knows nothing about it would take input and let the
    // user commit a second time.
    expect((editorInputs()[0] as HTMLInputElement).disabled).toBe(true);
    expect(document.querySelectorAll("[data-pending]")).toHaveLength(2);

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });
  });

  it("keeps a row failure for the editors that were not there to receive it", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();

    render(
      <DataTable
        columns={columns}
        data={people}
        editMode="row"
        getRowId={person => person.id}
        handleRef={handle}
        onRowEditCommit={() => inFlight.promise}
      />,
      { wrapper }
    );

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });
    act(() => handle.current?.stopEditing({ commit: true }));

    // Every editor of the row goes away while the write is out.
    act(() => {
      handle.current?.table.getColumn("name")?.toggleVisibility(false);
      handle.current?.table.getColumn("age")?.toggleVisibility(false);
    });
    await waitFor(() => expect(editorInputs()).toHaveLength(0));

    await act(async () => {
      inFlight.reject(new Error("Server said no"));
      await inFlight.promise.catch(() => undefined);
    });

    // The row is still being edited, so the reason it failed is still the row's to show.
    expect(document.querySelector("[data-editing-row]")).toBeTruthy();

    act(() => {
      handle.current?.table.getColumn("name")?.toggleVisibility(true);
      handle.current?.table.getColumn("age")?.toggleVisibility(true);
    });

    expect(await screen.findByText("Server said no")).toBeTruthy();
  });

  it("puts a row failure where it can be read, not on a hidden column", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();

    render(
      <DataTable
        columns={columns}
        data={people}
        editMode="row"
        getRowId={person => person.id}
        handleRef={handle}
        onRowEditCommit={() => inFlight.promise}
      />,
      { wrapper }
    );

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });
    act(() => handle.current?.stopEditing({ commit: true }));

    // The row's first editable column is hidden and the write settles straight after — no pause
    // in which a passive cleanup could tidy the registry first.
    await act(async () => {
      handle.current?.table.getColumn("name")?.toggleVisibility(false);
      inFlight.reject(new Error("Server said no"));
      await inFlight.promise.catch(() => undefined);
    });

    expect(editorInputs()).toHaveLength(1);
    expect(await screen.findByText("Server said no")).toBeTruthy();
  });

  it("clears the failure the column carries, not the row's other ones", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const validated: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: {
          edit: {
            validate: value => String(value ?? "").length > 0 ? null : "Name is required",
            variant: "text"
          }
        }
      },
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: "number" }
      }
    ];

    const view = () => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={validated}
            data={people}
            editMode="row"
            getRowId={person => person.id}
            handleRef={handle}
            onRowEditCommit={vi.fn()}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view());

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));

    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "" } });
    act(() => handle.current?.stopEditing({ commit: true }));
    expect(await screen.findByText("Name is required")).toBeTruthy();

    // Typing somewhere else is not an answer to what `name` is complaining about — and the next
    // render of any kind must not be where it quietly disappears.
    fireEvent.change(editorInputs()[1] as HTMLInputElement, { target: { value: "31" } });
    rerender(view());

    expect(screen.getByText("Name is required")).toBeTruthy();

    // Typing into the field that carries it is.
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Fixed" } });

    expect(screen.queryByText("Name is required")).toBeNull();
  });

  it("does not un-cancel a row when the gate reopens before its write lands", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();
    const onEditingRowIdChange = vi.fn();

    const view = (enableEditing: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            data={people}
            editingRowId="1"
            editMode="row"
            enableEditing={enableEditing}
            getRowId={person => person.id}
            handleRef={handle}
            onEditingRowIdChange={onEditingRowIdChange}
            onRowEditCommit={() => inFlight.promise}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(true));

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });
    act(() => handle.current?.startEditing("2"));
    onEditingRowIdChange.mockClear();

    // The gate shuts while the write is out, and reopens before it lands.
    rerender(view(false));
    rerender(view(true));

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });

    // Losing eligibility ended that session; reopening is the next one's eligibility.
    expect(onEditingRowIdChange).not.toHaveBeenCalledWith("2");
  });

  it("is read-only when row mode has no commit handler", () => {
    const handle = createRef<DataTableHandle<Person>>();

    render(
      <DataTable
        columns={columns}
        data={people}
        editMode="row"
        getRowId={person => person.id}
        handleRef={handle}
      />,
      { wrapper }
    );

    act(() => handle.current?.startEditing("1"));

    // Row mode commits through `onRowEditCommit`; without it the row has nothing to open for.
    expect(editorInputs()).toHaveLength(0);
    expect(document.querySelector("[data-editing-row]")).toBeNull();
  });

  it("does not revive a row whose gate shut before its data arrived", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onRowEditCommit = vi.fn();

    const view = (rows: Person[], enableEditing: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            data={rows}
            editingRowId="1"
            editMode="row"
            enableEditing={enableEditing}
            getRowId={person => person.id}
            handleRef={handle}
            onRowEditCommit={onRowEditCommit}
          />
        </MantineProvider>
      </StrictMode>
    );

    // The row is named for editing before the fetch carrying it lands.
    const { rerender } = render(view([], true));
    expect(editorInputs()).toHaveLength(0);

    // The table switch shuts and reopens while the row is still not there. The switch is not a
    // question about the row, so it has to be answered without one.
    rerender(view([], false));
    rerender(view([], true));

    rerender(view(people, true));

    // The session that was open when the switch shut is over. Nothing opens by itself.
    expect(editorInputs()).toHaveLength(0);
    expect(document.querySelector("[data-editing-row]")).toBeNull();

    // An explicit start is a new session, and it works.
    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
  });

  it("focuses the column an explicit start names on the row already open", async () => {
    const handle = createRef<DataTableHandle<Person>>();

    render(
      <DataTable
        columns={columns}
        data={people}
        editMode="row"
        getRowId={person => person.id}
        handleRef={handle}
        onRowEditCommit={vi.fn()}
      />,
      { wrapper }
    );

    act(() => handle.current?.startEditing("1", "name"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));

    // The row is already open, so nothing moves — but the handle promises to focus the column it
    // is given, and the editor for it is right there.
    act(() => handle.current?.startEditing("1", "age"));

    expect(document.activeElement).toBe(editorInputs()[1]);
  });

  it("tells a row custom editor that the row's write is still out", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();
    // Row mode's pending belongs to the row, not to one cell: the commit is atomic, so every
    // editor in it is waiting on the same write.
    const custom: Array<ColumnDef<Person, any>> = [
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
      },
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: "number" }
      }
    ];

    render(
      <DataTable
        columns={custom}
        data={people}
        editMode="row"
        getRowId={person => person.id}
        handleRef={handle}
        onRowEditCommit={() => inFlight.promise}
      />,
      { wrapper }
    );

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));

    const customInput = () => screen.getByLabelText("Edit Name") as HTMLInputElement;
    expect(customInput().disabled).toBe(false);

    fireEvent.change(editorInputs()[1] as HTMLInputElement, { target: { value: "31" } });
    act(() => handle.current?.stopEditing({ commit: true }));

    // The write is the row's, and it was another column that changed — this editor is waiting on
    // it all the same.
    expect(customInput().disabled).toBe(true);

    await act(async () => {
      inFlight.reject(new Error("nope"));
      await inFlight.promise.catch(() => undefined);
    });

    // A rejection returns the row to editing, so the editor is here and no longer waiting.
    expect(customInput().disabled).toBe(false);
  });

  it("hands a row custom editor the commit's real result", async () => {
    const results: Array<boolean | Promise<boolean>> = [];
    const inFlight = Promise.withResolvers<void>();
    const custom: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: {
          edit: ({
            value,
            setValue,
            commit
          }) => (
            <>
              <input
                aria-label="Edit Name"
                value={value === null || value === undefined ? "" : String(value)}
                onChange={event => setValue(event.currentTarget.value)}
              />

              <button
                type="button"
                onClick={() => {
                  results.push(commit());
                }}
              >
                commit
              </button>
            </>
          )
        }
      },
      {
        accessorKey: "age",
        header: "Age",
        meta: {
          edit: {
            validate: value => Number(value) > 0 ? null : "Age must be positive",
            variant: "number"
          }
        }
      }
    ];

    const handle = createRef<DataTableHandle<Person>>();

    render(
      <DataTable
        columns={custom}
        data={people}
        editMode="row"
        getRowId={person => person.id}
        handleRef={handle}
        onRowEditCommit={() => inFlight.promise}
      />,
      { wrapper }
    );

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));

    // Another column of the row fails its own `validate`, so the row does not commit.
    fireEvent.change(editorInputs()[1] as HTMLInputElement, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "commit" }));

    expect(results).toEqual([false]);

    // Now it validates, and the application's write rejects.
    fireEvent.change(editorInputs()[1] as HTMLInputElement, { target: { value: "31" } });
    fireEvent.click(screen.getByRole("button", { name: "commit" }));

    const pending = results[1];
    expect(typeof pending).not.toBe("boolean");

    await act(async () => {
      inFlight.reject(new Error("nope"));
      await inFlight.promise.catch(() => undefined);
    });

    await expect(pending).resolves.toBe(false);
  });

  it("does not record a row write the data moved out from under in flight", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();
    const committed: Array<{ previousValues: Record<string, unknown>; values: Record<string, unknown> }> = [];
    const named = (name: string): Person[] => [
      {
        age: 30,
        id: "1",
        name
      },
      people[1] as Person
    ];

    const view = (rows: Person[]) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            data={rows}
            editingRowId="1"
            editMode="row"
            getRowId={person => person.id}
            handleRef={handle}
            onEditingRowIdChange={vi.fn()}
            onRowEditCommit={change => {
              committed.push({ previousValues: change.previousValues, values: change.values });

              return committed.length === 1 ? inFlight.promise : undefined;
            }}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(named("Carol")));

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "First" } });
    act(() => handle.current?.stopEditing({ commit: true }));

    rerender(view(named("Caroline")));
    rerender(view(named("Carol")));

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });

    await waitFor(() => expect((editorInputs()[0] as HTMLInputElement).value).toBe("Carol"));

    fireEvent.change(editorInputs()[1] as HTMLInputElement, { target: { value: "31" } });
    act(() => handle.current?.stopEditing({ commit: true }));

    expect(committed[1]?.previousValues).toEqual({ age: 30, name: "Carol" });
  });

  it("asks a controlled owner to close a lost row session exactly once", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onEditingRowIdChange = vi.fn();

    const view = (enableEditing: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            data={people}
            editingRowId="1"
            editMode="row"
            enableEditing={enableEditing}
            getRowId={person => person.id}
            handleRef={handle}
            onEditingRowIdChange={onEditingRowIdChange}
            onRowEditCommit={vi.fn()}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(true));

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    onEditingRowIdChange.mockClear();

    // The gate shuts and the owner ignores the close. Asking again on every render that happens
    // to follow is not reconciliation, it is nagging.
    rerender(view(false));
    expect(onEditingRowIdChange.mock.calls).toEqual([[null]]);

    rerender(view(false));
    rerender(view(true));
    expect(onEditingRowIdChange.mock.calls).toEqual([[null]]);

    // An explicit stop is a new request, not the same one repeated.
    act(() => handle.current?.stopEditing({ commit: false }));
    expect(onEditingRowIdChange.mock.calls).toEqual([[null], [null]]);
  });

  it("does not authorize a switch when the commit itself finds the gate shut", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onEditingRowIdChange = vi.fn();
    const onRowEditCommit = vi.fn();
    // `edit.enabled` is application code, and nothing makes it answer the same way twice — so a
    // commit can be the first thing to learn that the gate is shut, with no render in between.
    let gateOpen = true;
    const gated: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { edit: { enabled: () => gateOpen, variant: "text" } }
      },
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: { enabled: () => gateOpen, variant: "number" } }
      }
    ];

    render(
      <DataTable
        columns={gated}
        data={people}
        editingRowId="1"
        editMode="row"
        getRowId={person => person.id}
        handleRef={handle}
        onEditingRowIdChange={onEditingRowIdChange}
        onRowEditCommit={onRowEditCommit}
      />,
      { wrapper }
    );

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });
    onEditingRowIdChange.mockClear();

    act(() => {
      gateOpen = false;
      handle.current?.startEditing("2");
    });

    // A session cancelled by its gate did not finish, so nothing opens on its behalf — and what
    // it held never passed a gate, so nothing of it is sent either.
    expect(onRowEditCommit).not.toHaveBeenCalled();
    expect(onEditingRowIdChange.mock.calls).toEqual([[null]]);
  });

  it("does not authorize a switch away from a row the table-level switch closed", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onEditingRowIdChange = vi.fn();

    const view = (editingEnabled: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            data={people}
            editingRowId="1"
            editMode="row"
            enableEditing={editingEnabled}
            getRowId={person => person.id}
            handleRef={handle}
            onEditingRowIdChange={onEditingRowIdChange}
            onRowEditCommit={vi.fn()}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(true));

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });
    onEditingRowIdChange.mockClear();

    // Reconciliation cancels the session and asks once; the owner declines, so the slice goes on
    // naming this row.
    rerender(view(false));
    expect(onEditingRowIdChange.mock.calls).toEqual([[null]]);

    act(() => handle.current?.startEditing("2"));

    // Editing is off. The commit that has to happen before the switch cannot happen at all, so
    // the switch does not — and the close it needs is asked for again, because a command is
    // always a fresh request.
    expect(onEditingRowIdChange.mock.calls).toEqual([[null], [null]]);
  });

  it("takes the row's editors off the screen in the same commit their gate shuts", async () => {
    const editorsAtLayout: number[] = [];

    const observe = () => {
      editorsAtLayout.push(editorInputs().length);
    };

    const view = (editingEnabled: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            data={people}
            editingRowId="1"
            editMode="row"
            enableEditing={editingEnabled}
            getRowId={person => person.id}
            onEditingRowIdChange={vi.fn()}
            onRowEditCommit={vi.fn()}
          />

          <LayoutProbe observe={observe} />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(true));

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    editorsAtLayout.length = 0;

    // Row mode asks the gate per cell in the render itself, so the editors go with the commit
    // that shut it — never a frame later, behind the reconciliation that ends the session.
    rerender(view(false));

    expect(editorsAtLayout.every(count => count === 0)).toBe(true);
  });

  it("commits the row on screen, not one a discarded render replaced", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onRowEditCommit = vi.fn();
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
            columns={columns}
            data={rows}
            editMode="row"
            getRowId={person => person.id}
            handleRef={handle}
            onRowEditCommit={onRowEditCommit}
          />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setRows([{ ...(people[0] as Person), age: 99 }, people[1] as Person]);
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

    render(<Harness />, { wrapper });

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Renamed" } });

    // The transition renders the row holding a different age and is then thrown away.
    fireEvent.click(screen.getByRole("button", { name: "swap" }));
    expect(editorInputs()).toHaveLength(2);

    act(() => handle.current?.stopEditing({ commit: true }));

    await waitFor(() => expect(onRowEditCommit).toHaveBeenCalledTimes(1));
    const change = onRowEditCommit.mock.calls[0]?.[0] as {
      values: Record<string, unknown>;
      previousValues: Record<string, unknown>;
    };

    // Age was never touched, and what the application last knew it to hold is 30 — the 99 no
    // render ever put on screen is not a previous value.
    expect(change.values).toEqual({ name: "Renamed", age: 30 });
    expect(change.previousValues).toEqual({ name: "Carol", age: 30 });
  });

  it("commits a row a discarded render removed", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onRowEditCommit = vi.fn();
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
            columns={columns}
            data={rows}
            editMode="row"
            getRowId={person => person.id}
            handleRef={handle}
            onRowEditCommit={onRowEditCommit}
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

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Renamed" } });

    // The row is still on screen; only a render nobody saw took it away.
    fireEvent.click(screen.getByRole("button", { name: "empty" }));
    expect(editorInputs()).toHaveLength(2);

    act(() => handle.current?.stopEditing({ commit: true }));

    await waitFor(() => expect(onRowEditCommit).toHaveBeenCalledTimes(1));
  });

  it("ends a row session whose commit handler went away while its row was absent", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onEditingRowIdChange = vi.fn();
    const view = (rows: Person[], withHandler: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            data={rows}
            editingRowId="1"
            editMode="row"
            getRowId={person => person.id}
            handleRef={handle}
            onEditingRowIdChange={onEditingRowIdChange}
            onRowEditCommit={withHandler ? vi.fn() : undefined}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(people, true));

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });
    onEditingRowIdChange.mockClear();

    // The row leaves and the handler goes with it. A row that is not there is a row that has not
    // arrived; a handler that is not there is the application closing the gate.
    rerender(view([], false));
    expect(onEditingRowIdChange.mock.calls).toEqual([[null]]);

    // Neither the handler coming back nor the row coming back resumes it.
    rerender(view([], true));
    rerender(view(people, true));
    expect(editorInputs()).toHaveLength(0);

    act(() => handle.current?.startEditing("1"));

    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    expect((editorInputs()[0] as HTMLInputElement).value).toBe("Carol");
  });

  it("commits a draft whose column was hidden mid-edit", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onRowEditCommit = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={people}
        editMode="row"
        getRowId={person => person.id}
        handleRef={handle}
        onRowEditCommit={onRowEditCommit}
      />,
      { wrapper }
    );

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Renamed" } });

    // Hiding the column takes its editor away — exactly what the columns panel does. The pending
    // value lives in the controller and must still be what the row commits; otherwise `changed`
    // is false and the whole edit is discarded.
    act(() => handle.current?.table.getColumn("name")?.toggleVisibility(false));
    await waitFor(() => expect(editorInputs()).toHaveLength(1));

    act(() => handle.current?.stopEditing({ commit: true }));

    await waitFor(() => expect(onRowEditCommit).toHaveBeenCalledTimes(1));
    expect((onRowEditCommit.mock.calls[0]?.[0] as { values: Record<string, unknown> }).values)
      .toEqual({ name: "Renamed", age: 30 });
  });

  it("commits a draft whose column left the definitions entirely", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onRowEditCommit = vi.fn();
    // What a responsive breakpoint does: the column is removed before TanStack sees it, so it
    // has no cell to read at commit time — unlike columnVisibility, which merely hides one.
    const narrow: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: "number" }
      }
    ];

    const view = (columnSet: Array<ColumnDef<Person, any>>) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columnSet}
            data={people}
            editMode="row"
            getRowId={person => person.id}
            handleRef={handle}
            onRowEditCommit={onRowEditCommit}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(columns));

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });

    rerender(view(narrow));
    await waitFor(() => expect(editorInputs()).toHaveLength(1));

    act(() => handle.current?.stopEditing({ commit: true }));

    await waitFor(() => expect(onRowEditCommit).toHaveBeenCalledTimes(1));
    const change = onRowEditCommit.mock.calls[0]?.[0] as {
      values: Record<string, unknown>;
      previousValues: Record<string, unknown>;
    };
    expect(change.values).toEqual({ age: 30, name: "Drafted" });
    // The previous value comes from the baseline captured when the edit began.
    expect(change.previousValues).toEqual({ age: 30, name: "Carol" });
  });

  it("drops a draft whose column stopped being editable mid-edit", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onRowEditCommit = vi.fn();
    // The column stays in the definitions; only its edit gate closes — `meta.edit` removed here,
    // the same shape as `enableEditing` flipping off or `edit.enabled(row)` turning false.
    const readOnlyName: Array<ColumnDef<Person, any>> = [
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: "number" }
      },
      { accessorKey: "id", header: "Id" }
    ];

    const view = (columnSet: Array<ColumnDef<Person, any>>) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columnSet}
            data={people}
            editMode="row"
            getRowId={person => person.id}
            handleRef={handle}
            onRowEditCommit={onRowEditCommit}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(columns));

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });

    rerender(view(readOnlyName));
    await waitFor(() => expect(editorInputs()).toHaveLength(1));

    act(() => handle.current?.stopEditing({ commit: true }));
    await waitFor(() => expect(editorInputs()).toHaveLength(0));

    // The draft must not slip through the gate the application just closed — and it would have
    // arrived unvalidated, since validation only walks currently editable cells. Age is
    // untouched, so there is nothing left to commit at all.
    expect(onRowEditCommit).not.toHaveBeenCalled();
    expect(screen.getByText("Carol")).toBeTruthy();
  });

  it("drops every draft when the table-level switch closes mid-edit", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onRowEditCommit = vi.fn();
    // The hard case for the rule above: the edited column leaves the definitions *and*
    // `enableEditing` goes off in the same tick. There is no cell left to test the draft
    // against, so only the table-level switch can still refuse it.
    const withoutName: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: "number" }
      },
      { accessorKey: "id", header: "Id" }
    ];

    const view = (columnSet: Array<ColumnDef<Person, any>>, editingEnabled: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columnSet}
            data={people}
            editMode="row"
            enableEditing={editingEnabled}
            getRowId={person => person.id}
            handleRef={handle}
            onRowEditCommit={onRowEditCommit}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(columns, true));

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });

    rerender(view(withoutName, false));
    await waitFor(() => expect(editorInputs()).toHaveLength(0));

    act(() => handle.current?.stopEditing({ commit: true }));

    expect(onRowEditCommit).not.toHaveBeenCalled();
  });

  it("joins a second commit to the request already in flight", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();
    const onRowEditCommit = vi.fn(() => inFlight.promise);

    render(
      <DataTable
        columns={columns}
        data={people}
        editMode="row"
        getRowId={person => person.id}
        handleRef={handle}
        onRowEditCommit={onRowEditCommit}
      />,
      { wrapper }
    );

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });

    // Two Enters, a blur landing behind one, or an application calling stop twice: one write.
    act(() => {
      handle.current?.stopEditing({ commit: true });
      handle.current?.stopEditing({ commit: true });
    });

    expect(onRowEditCommit).toHaveBeenCalledTimes(1);

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });

    await waitFor(() => expect(editorInputs()).toHaveLength(0));
    expect(onRowEditCommit).toHaveBeenCalledTimes(1);
  });

  it("lets a cancelled row's commit settle without closing the row opened after it", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const inFlight = Promise.withResolvers<void>();
    const onRowEditCommit = vi.fn(() => inFlight.promise);

    render(
      <DataTable
        columns={columns}
        data={people}
        editMode="row"
        getRowId={person => person.id}
        handleRef={handle}
        onRowEditCommit={onRowEditCommit}
      />,
      { wrapper }
    );

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Drafted" } });

    act(() => handle.current?.stopEditing({ commit: true }));
    expect(onRowEditCommit).toHaveBeenCalledTimes(1);

    // Carol's write is still in flight when the user abandons it and opens Alice instead.
    act(() => handle.current?.stopEditing({ commit: false }));
    act(() => handle.current?.startEditing("2"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));
    fireEvent.change(editorInputs()[0] as HTMLInputElement, { target: { value: "Second" } });

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });

    // The settled request belongs to a session that ended: it must not close Alice's editors,
    // and her draft must survive.
    expect(editorInputs()).toHaveLength(2);
    expect((editorInputs()[0] as HTMLInputElement).value).toBe("Second");
    expect(onRowEditCommit).toHaveBeenCalledTimes(1);
  });

  it("starts and stops row editing through the imperative handle", async () => {
    const handle = createRef<DataTableHandle<Person>>();
    const onRowEditCommit = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={people}
        editMode="row"
        getRowId={person => person.id}
        handleRef={handle}
        onRowEditCommit={onRowEditCommit}
      />,
      { wrapper }
    );

    act(() => handle.current?.startEditing("1"));
    await waitFor(() => expect(editorInputs()).toHaveLength(2));

    fireEvent.change(editorInputs()[1] as HTMLInputElement, { target: { value: "31" } });
    act(() => handle.current?.stopEditing({ commit: true }));

    await waitFor(() => expect(editorInputs()).toHaveLength(0));
    expect(onRowEditCommit).toHaveBeenCalledTimes(1);
    expect((onRowEditCommit.mock.calls[0]?.[0] as { values: Record<string, unknown> }).values).toEqual({
      name: "Carol",
      age: 31
    });
  });
});
