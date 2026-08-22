import type { ReactNode } from "react";

import type { ColumnDef } from "./types";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  }
];

const columns: Array<ColumnDef<Person, any>> = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "age", header: "Age" }
];

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <MantineProvider>{children}</MantineProvider>
    </StrictMode>
  );
}

function renderReorderable() {
  const onColumnOrderChange = vi.fn();
  const utils = render(
    <DataTable
      enableColumnOrdering
      columns={columns}
      data={people}
      getRowId={person => person.id}
      onColumnOrderChange={onColumnOrderChange}
    />,
    { wrapper }
  );
  const header = (id: string) => utils.container.querySelector(`[data-ledger-column-id="${CSS.escape(id)}"]`) as HTMLElement;

  return { onColumnOrderChange, header };
}

// jsdom lays nothing out, so the drop-target hit-test is stubbed to the header the test intends.
function stubHitTest(target: Element) {
  document.elementFromPoint = vi.fn(() => target);
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "elementFromPoint");
});

describe("useColumnReorder", () => {
  it("commits a drag past the threshold onto the target's far side", () => {
    const { onColumnOrderChange, header } = renderReorderable();
    stubHitTest(header("age"));

    fireEvent.pointerDown(header("name"), { button: 0, clientX: 10 });
    fireEvent.pointerMove(document, { clientX: 60 });
    fireEvent.pointerUp(document);

    expect(onColumnOrderChange).toHaveBeenLastCalledWith(["age", "name"]);
  });

  it("abandons a cancelled drag instead of committing it on the next pointerup", () => {
    const { onColumnOrderChange, header } = renderReorderable();
    stubHitTest(header("age"));

    fireEvent.pointerDown(header("name"), { button: 0, clientX: 10 });
    fireEvent.pointerMove(document, { clientX: 60 });
    fireEvent.pointerCancel(document);

    // The stray pointerup of a later, unrelated interaction must find no session to commit.
    fireEvent.pointerUp(document);
    expect(onColumnOrderChange).not.toHaveBeenCalled();

    // And no click suppression leaks onto the next real header interaction.
    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(header("name").getAttribute("aria-sort")).toBe("ascending");
  });

  it("ignores a nested pointerdown while a drag session is live", () => {
    const { header } = renderReorderable();
    const adds = vi.spyOn(globalThis, "addEventListener");
    const moveListeners = () => adds.mock.calls.filter(([type]) => type === "pointermove").length;

    fireEvent.pointerDown(header("name"), { button: 0, clientX: 10 });
    const afterFirst = moveListeners();

    fireEvent.pointerDown(header("name"), { button: 0, clientX: 10 });
    expect(moveListeners()).toBe(afterFirst);

    fireEvent.pointerUp(document);
  });
});
