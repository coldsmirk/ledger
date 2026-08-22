import type { ReactNode } from "react";

import type { ColumnDef, DataTableHandle } from "./types";

import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, StrictMode } from "react";
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
