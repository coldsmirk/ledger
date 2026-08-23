import type { ReactNode } from "react";

import type { ColumnDef } from "./types";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "./data-table";

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
