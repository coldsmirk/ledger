import type { ReactNode } from "react";

import type { ColumnDef } from "./types";

import { createTheme, MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { startTransition, StrictMode, Suspense, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "./data-table";
import { textEditor } from "./editors";
import { useDataTable } from "./use-data-table";

interface Person {
  id: string;
  name: string;
}

const people: Person[] = [
  { id: "1", name: "Carol" },
  { id: "2", name: "Alice" }
];

const getRowId = (person: Person) => person.id;

const columns: Array<ColumnDef<Person, any>> = [{ accessorKey: "name", header: "Name" }];

const editable: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { edit: textEditor() }
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

const row = () => document.querySelector(".ledger-row") as HTMLElement;

function handlerView(onMouseEnter: () => void) {
  return (
    <StrictMode>
      <MantineProvider>
        <DataTable attributes={{ row: { onMouseEnter } }} columns={columns} data={people} getRowId={getRowId} />
      </MantineProvider>
    </StrictMode>
  );
}

const editor = () => document.querySelector(".ledger-cell-editor") as HTMLElement;

function styledView(color: string) {
  return (
    <StrictMode>
      <MantineProvider>
        <DataTable columns={columns} data={people} getRowId={getRowId} styles={{ row: { color } }} />
      </MantineProvider>
    </StrictMode>
  );
}

function classNamedView(rowClass: string) {
  return (
    <StrictMode>
      <MantineProvider>
        <DataTable classNames={{ row: rowClass }} columns={columns} data={people} getRowId={getRowId} />
      </MantineProvider>
    </StrictMode>
  );
}

function attributedView(density: string) {
  return (
    <StrictMode>
      <MantineProvider>
        <DataTable attributes={{ row: { "data-density": density } }} columns={columns} data={people} getRowId={getRowId} />
      </MantineProvider>
    </StrictMode>
  );
}

function themedView(color: string) {
  return (
    <StrictMode>
      <MantineProvider theme={createTheme({ components: { DataTable: { styles: { row: { color } } } } })}>
        <DataTable columns={columns} data={people} getRowId={getRowId} />
      </MantineProvider>
    </StrictMode>
  );
}

function functionalView(striped: boolean) {
  return (
    <StrictMode>
      <MantineProvider>
        <DataTable
          columns={columns}
          data={people}
          getRowId={getRowId}
          striped={striped}
          styles={(_theme, props) => { return { row: { color: props.striped === true ? "green" : "grey" } }; }}
        />
      </MantineProvider>
    </StrictMode>
  );
}

function behaviourView(enableActiveRow: boolean) {
  return (
    <StrictMode>
      <MantineProvider>
        <DataTable
          columns={columns}
          data={people}
          enableActiveRow={enableActiveRow}
          getRowId={getRowId}
          styles={(_theme, props) => { return { row: { color: "enableActiveRow" in props && props.enableActiveRow === true ? "red" : "blue" } }; }}
        />
      </MantineProvider>
    </StrictMode>
  );
}

function themedBehaviourView(enableActiveRow: boolean) {
  return (
    <StrictMode>
      <MantineProvider
        theme={createTheme({
          components: {
            DataTable: {
              classNames: (_theme: unknown, props: { enableActiveRow?: boolean }) => {
                return {
                  row: props.enableActiveRow === true ? "is-active-row" : "no-active-row"
                };
              }
            }
          }
        })}
      >
        <DataTable columns={columns} data={people} enableActiveRow={enableActiveRow} getRowId={getRowId} />
      </MantineProvider>
    </StrictMode>
  );
}

// The other routing branch: `table={...}` skips the option partition entirely, and its
// callbacks have to see the props that branch was given too.
function HookMode({ striped }: { striped: boolean }) {
  const table = useDataTable<Person>({
    columns,
    data: people,
    getRowId
  });

  return (
    <DataTable
      striped={striped}
      table={table}
      styles={(_theme, props) => {
        return {
          row: { color: props.table === (table as unknown) && striped ? "green" : "grey" }
        };
      }}
    />
  );
}

describe("Styles API revision", () => {
  it("carries a real styles change to the rows", () => {
    const { rerender } = render(styledView("red"));
    expect(row().style.color).toBe("red");

    // Same data, same definitions — only the Styles API moved. The rows are memoized against
    // everything else, so this is the one thing that has to reach them.
    rerender(styledView("blue"));
    expect(row().style.color).toBe("blue");
  });

  it("carries a real classNames change to the rows", () => {
    const { rerender } = render(classNamedView("first"));
    expect(row().classList.contains("first")).toBe(true);

    rerender(classNamedView("second"));
    expect(row().classList.contains("second")).toBe(true);
    expect(row().classList.contains("first")).toBe(false);
  });

  it("carries a real attributes change to the rows", () => {
    const { rerender } = render(attributedView("cozy"));
    expect(row().dataset.density).toBe("cozy");

    rerender(attributedView("compact"));
    expect(row().dataset.density).toBe("compact");
  });

  it("carries a theme-level styles override to the rows", () => {
    const { rerender } = render(themedView("red"));
    expect(row().style.color).toBe("red");

    rerender(themedView("blue"));
    expect(row().style.color).toBe("blue");
  });

  it("resolves a functional style against the props of the render drawing it", () => {
    const { rerender } = render(functionalView(false));
    expect(row().style.color).toBe("grey");

    // The resolver is the same function; what changed is a prop it reads.
    rerender(functionalView(true));
    expect(row().style.color).toBe("green");
  });

  it("does not let a render nobody saw restyle the tree on screen", () => {
    const blocker = Promise.withResolvers<void>();

    function Harness() {
      const [color, setColor] = useState("red");
      const [blocked, setBlocked] = useState(false);

      return (
        <>
          <DataTable
            columns={editable}
            data={people}
            editingCell={{ columnId: "name", rowId: "1" }}
            getRowId={getRowId}
            styles={{ cellEditor: { color }, row: { color } }}
            onEditCommit={vi.fn()}
            onEditingCellChange={vi.fn()}
          />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setColor("blue");
              setBlocked(true);
            })}
          >
            restyle
          </button>

          <Suspense fallback={<div>waiting</div>}>
            <Blocker blocked={blocked} promise={blocker.promise} />
          </Suspense>
        </>
      );
    }

    render(<Harness />, { wrapper });

    expect(editor().style.color).toBe("red");

    // The transition restyles the table and is then thrown away.
    fireEvent.click(screen.getByRole("button", { name: "restyle" }));
    expect(row().style.color).toBe("red");

    // Typing redraws the editor from its session — a render of the editor alone, with nothing of
    // the table's own render in between. What it draws must still be the styles on screen.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Drafted" } });

    expect(editor().style.color).toBe("red");
    expect(row().style.color).toBe("red");
  });

  it("resolves a style callback against every prop the table was given", () => {
    // The Styles API's callbacks are typed with the whole component's props, and behaviour props
    // are props: a table that routes them elsewhere internally still has to hand them over.
    const { rerender } = render(behaviourView(false));
    expect(row().style.color).toBe("blue");

    rerender(behaviourView(true));
    expect(row().style.color).toBe("red");
  });

  it("resolves a theme-level classNames callback against those props too", () => {
    const { rerender } = render(themedBehaviourView(false));
    expect(row().classList.contains("no-active-row")).toBe(true);

    rerender(themedBehaviourView(true));
    expect(row().classList.contains("is-active-row")).toBe(true);
    expect(row().classList.contains("no-active-row")).toBe(false);
  });

  it("carries a replaced function attribute to the rows", () => {
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = render(handlerView(first));
    fireEvent.mouseEnter(row());
    expect(first).toHaveBeenCalledTimes(1);

    // A handler is a resolved answer like any other, and one that cannot be written down as text.
    rerender(handlerView(second));
    first.mockClear();
    fireEvent.mouseEnter(row());

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("survives an attribute value that cannot be serialized", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    render(
      <DataTable attributes={{ row: { "data-payload": circular } }} columns={columns} data={people} getRowId={getRowId} />,
      { wrapper }
    );

    // Comparing answers may not assume they are writable as text: `attributes` carries whatever
    // the application put there.
    expect(row()).toBeTruthy();
    expect(row().dataset.payload).toBe("[object Object]");
  });

  it("resolves a style callback against the table a hook-mode caller passed", () => {
    const { rerender } = render(<HookMode striped={false} />, { wrapper });
    expect(row().style.color).toBe("grey");

    rerender(<HookMode striped />);
    expect(row().style.color).toBe("green");
  });

  it("does not re-render rows for style props that resolve to the same thing", () => {
    const renders: string[] = [];
    const counted: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        cell: info => {
          renders.push(info.row.id);

          return info.getValue() as string;
        }
      }
    ];

    function Harness() {
      const [tick, setTick] = useState(0);

      return (
        <>
          <button type="button" onClick={() => setTick(value => value + 1)}>
            tick
          </button>

          <DataTable
            attributes={{ row: { "data-density": "cozy" } }}
            classNames={{ row: "stable" }}
            columns={counted}
            data={people}
            getRowId={getRowId}
            styles={{ row: { color: "red" } }}
            onRowClick={() => {
              expect(tick).toBeGreaterThanOrEqual(0);
            }}
          />
        </>
      );
    }

    render(<Harness />, { wrapper });
    renders.length = 0;

    // Every one of those objects is a new object on this render, and every one of them resolves
    // to exactly what the rows already have.
    fireEvent.click(screen.getByRole("button", { name: "tick" }));

    expect(renders).toEqual([]);
  });
});
