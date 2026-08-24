import type { ReactNode } from "react";

import type { ColumnDef, DataTableHandle } from "./types";

import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, startTransition, StrictMode, Suspense, useState } from "react";
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
