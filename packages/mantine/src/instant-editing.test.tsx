import type { ReactNode } from "react";

import type { ColumnDef } from "./types";

import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { startTransition, StrictMode, Suspense, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "./data-table";
import { checkboxEditor } from "./editors";
import { useDataTable } from "./use-data-table";

interface Item {
  id: string;
  name: string;
  onSale: boolean;
  archived: boolean;
}

const items: Item[] = [
  {
    archived: false,
    id: "1",
    name: "Wireless Mouse",
    onSale: true
  },
  {
    archived: false,
    id: "2",
    name: "Projector",
    onSale: false
  }
];

const getRowId = (item: Item) => item.id;

const columns: Array<ColumnDef<Item, any>> = [
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "onSale",
    header: "On sale",
    meta: { edit: { instant: checkboxEditor() } }
  },
  {
    accessorKey: "archived",
    header: "Archived",
    meta: { edit: { instant: checkboxEditor() } }
  }
];

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <MantineProvider>{children}</MantineProvider>
    </StrictMode>
  );
}

const boxes = (label: string) => screen.getAllByLabelText(label) as HTMLInputElement[];
const box = (label: string, index = 0) => boxes(label)[index] as HTMLInputElement;

function handlerView(withHandler: boolean) {
  return (
    <StrictMode>
      <MantineProvider>
        <DataTable
          columns={columns}
          data={items}
          getRowId={getRowId}
          onEditCommit={withHandler ? vi.fn() : undefined}
        />
      </MantineProvider>
    </StrictMode>
  );
}

function SwappableTable() {
  const [second, setSecond] = useState(false);
  const options = {
    columns,
    data: items,
    getRowId,
    onEditCommit: vi.fn()
  };
  const first = useDataTable<Item>(options);
  const other = useDataTable<Item>(options);

  return (
    <>
      <button type="button" onClick={() => setSecond(true)}>
        swap
      </button>

      <DataTable table={second ? other : first} />
    </>
  );
}

describe("checkbox transient editing", () => {
  it("departs from what the application last knew, not from data that has not caught up", () => {
    // A synchronous handler that never feeds the value back — the row the table holds keeps
    // saying `true` long after the application was told to make it `false`.
    const commits: Array<{ previousValue: unknown; value: unknown }> = [];

    render(
      <DataTable
        columns={columns}
        data={items}
        getRowId={getRowId}
        onEditCommit={change => {
          commits.push({ previousValue: change.previousValue, value: change.value });
        }}
      />,
      { wrapper }
    );

    fireEvent.click(box("Edit On sale"));
    expect(commits).toEqual([{ previousValue: true, value: false }]);
    // The control shows what this cell now holds, not the stale row.
    expect(box("Edit On sale").checked).toBe(false);

    fireEvent.click(box("Edit On sale"));
    expect(commits[1]).toEqual({ previousValue: false, value: true });
    expect(box("Edit On sale").checked).toBe(true);
  });

  it("retires its record for good once the data moves past it", () => {
    const commits: Array<{ previousValue: unknown; value: unknown }> = [];
    const view = (rows: Item[]) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            data={rows}
            getRowId={getRowId}
            onEditCommit={change => {
              commits.push({ previousValue: change.previousValue, value: change.value });
            }}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(items));

    fireEvent.click(box("Edit On sale"));
    expect(box("Edit On sale").checked).toBe(false);

    // Somebody else moves the row. From here the data is what the cell holds — and it stays that
    // way even when it comes back to what the write departed from.
    rerender(view([{ ...(items[0] as Item), onSale: false }, items[1] as Item]));
    rerender(view(items));

    expect(box("Edit On sale").checked).toBe(true);

    fireEvent.click(box("Edit On sale"));
    expect(commits[1]).toEqual({ previousValue: true, value: false });
  });

  it("keeps a pending write across the column being hidden and shown again", async () => {
    const inFlight = Promise.withResolvers<void>();
    const onEditCommit = vi.fn(() => inFlight.promise);
    const view = (visible: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            columnVisibility={{ onSale: visible }}
            data={items}
            getRowId={getRowId}
            onColumnVisibilityChange={vi.fn()}
            onEditCommit={onEditCommit}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(true));

    fireEvent.click(box("Edit On sale"));
    expect(box("Edit On sale").disabled).toBe(true);

    // The columns panel hides the column, then brings it back. Neither is the write landing.
    rerender(view(false));
    expect(screen.queryByLabelText("Edit On sale")).toBeNull();
    rerender(view(true));

    // A control that came back knowing nothing would take a second click and send a second write.
    expect(box("Edit On sale").disabled).toBe(true);
    fireEvent.click(box("Edit On sale"));
    expect(onEditCommit).toHaveBeenCalledTimes(1);

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });

    expect(box("Edit On sale").disabled).toBe(false);
  });

  it("shows a failure that arrived while its control was off screen", async () => {
    const inFlight = Promise.withResolvers<void>();
    const view = (visible: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            columnVisibility={{ onSale: visible }}
            data={items}
            getRowId={getRowId}
            onColumnVisibilityChange={vi.fn()}
            onEditCommit={() => inFlight.promise}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(true));

    fireEvent.click(box("Edit On sale"));
    rerender(view(false));

    await act(async () => {
      inFlight.reject(new Error("server said no"));
      await inFlight.promise.catch(() => undefined);
    });

    // The failure belongs to the cell, not to the control that happened to be mounted: it is
    // there to be shown when the column comes back.
    rerender(view(true));
    expect(screen.getByRole("alert").textContent).toBe("server said no");
    expect(box("Edit On sale").disabled).toBe(false);
  });

  it("records nothing for a write the data moved past while it was in flight", async () => {
    const inFlight = Promise.withResolvers<void>();
    const commits: Array<{ previousValue: unknown; value: unknown }> = [];
    const view = (rows: Item[]) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            data={rows}
            getRowId={getRowId}
            onEditCommit={change => {
              commits.push({ previousValue: change.previousValue, value: change.value });

              return commits.length === 1 ? inFlight.promise : undefined;
            }}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(items));

    fireEvent.click(box("Edit On sale"));

    // While the write is out the row moves — and moves back. The data did move, even though
    // where it landed is where the write departed from.
    rerender(view([{ ...(items[0] as Item), onSale: false }, items[1] as Item]));
    rerender(view(items));

    await act(async () => {
      inFlight.resolve();
      await inFlight.promise;
    });

    // So the write has nothing left to be true about: the data is what the cell holds.
    expect(box("Edit On sale").checked).toBe(true);

    fireEvent.click(box("Edit On sale"));
    expect(commits[1]).toEqual({ previousValue: true, value: false });
  });

  it("keeps two cells' writes apart", async () => {
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    const commits: string[] = [];

    render(
      <DataTable
        columns={columns}
        data={items}
        getRowId={getRowId}
        onEditCommit={change => {
          const id = `${change.row.id}:${change.column.id}`;
          commits.push(id);

          return (id === "1:onSale" ? first : second).promise;
        }}
      />,
      { wrapper }
    );

    // Two targets at once: a different row, and a different column of the same row.
    fireEvent.click(box("Edit On sale", 0));
    fireEvent.click(box("Edit Archived", 1));

    expect(commits).toEqual(["1:onSale", "2:archived"]);
    expect(box("Edit On sale", 0).disabled).toBe(true);
    expect(box("Edit Archived", 1).disabled).toBe(true);
    // Neither joined the other's request, and neither is waiting on it.
    expect(box("Edit On sale", 1).disabled).toBe(false);
    expect(box("Edit Archived", 0).disabled).toBe(false);

    await act(async () => {
      first.reject(new Error("only the first"));
      await first.promise.catch(() => undefined);
    });

    // The failure lands on the cell that sent it, and takes nothing else with it.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toBe("only the first");
    expect(box("Edit On sale", 0).disabled).toBe(false);
    expect(box("Edit Archived", 1).disabled).toBe(true);

    await act(async () => {
      second.resolve();
      await second.promise;
    });

    expect(box("Edit Archived", 1).disabled).toBe(false);
  });

  it("does not let a render nobody saw shut the gate on the checkbox on screen", () => {
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
            columns={columns}
            data={items}
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

    // The transition renders the table with editing switched off and is then thrown away. The
    // checkbox is still on screen, and still a live control.
    fireEvent.click(screen.getByRole("button", { name: "shut" }));
    expect(box("Edit On sale")).toBeTruthy();

    fireEvent.click(box("Edit On sale"));
    expect(onEditCommit).toHaveBeenCalledTimes(1);
  });

  it("toggles against the row on screen, not one a discarded render replaced", () => {
    const commits: Array<{ previousValue: unknown; value: unknown }> = [];
    const blocker = Promise.withResolvers<void>();

    function Blocker({ blocked }: { blocked: boolean }) {
      if (blocked) {
        throw blocker.promise;
      }

      return null;
    }

    function Harness() {
      const [rows, setRows] = useState(items);
      const [blocked, setBlocked] = useState(false);

      return (
        <>
          <DataTable
            columns={columns}
            data={rows}
            getRowId={getRowId}
            onEditCommit={change => {
              commits.push({ previousValue: change.previousValue, value: change.value });
            }}
          />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setRows([{ ...(items[0] as Item), onSale: false }, items[1] as Item]);
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

    // The transition renders the row already off sale and is then thrown away. The checkbox on
    // screen is still checked, so toggling it means switching it off.
    fireEvent.click(screen.getByRole("button", { name: "swap" }));
    expect(box("Edit On sale").checked).toBe(true);

    fireEvent.click(box("Edit On sale"));
    expect(commits).toEqual([{ previousValue: true, value: false }]);
  });

  it("does not send a toggle the gate shut on since the last render", () => {
    const onEditCommit = vi.fn();
    const validate = vi.fn(() => null);
    // `edit.enabled` is application code, and nothing makes it answer the same way twice — so a
    // click can be the first thing to learn that the gate is shut, with no render in between.
    let gateOpen = true;
    const gated: Array<ColumnDef<Item, any>> = [
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "onSale",
        header: "On sale",
        meta: {
          edit: {
            enabled: () => gateOpen,
            instant: checkboxEditor(),
            validate
          }
        }
      }
    ];

    render(
      <DataTable
        columns={gated}
        data={items}
        getRowId={getRowId}
        onEditCommit={onEditCommit}
      />,
      { wrapper }
    );

    gateOpen = false;
    fireEvent.click(box("Edit On sale"));

    // Nothing passed the gate, so nothing happened: no write, not even the validation that only
    // guards writes, and nothing left behind to be shown or departed from.
    expect(onEditCommit).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
    expect(box("Edit On sale").checked).toBe(true);
    expect(box("Edit On sale").disabled).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();

    // And the cell was not quietly written to behind the closed gate: reopening it finds the
    // value the data has always held.
    gateOpen = true;
    fireEvent.click(box("Edit On sale"));
    expect(onEditCommit).toHaveBeenCalledTimes(1);
    expect(onEditCommit.mock.calls[0]?.[0]).toMatchObject({ previousValue: true, value: false });
  });

  it("latches a gate that shuts behind a write, and does not revive it when the gate reopens", async () => {
    const inFlight = Promise.withResolvers<void>();
    const view = (enableEditing: boolean) => (
      <StrictMode>
        <MantineProvider>
          <DataTable
            columns={columns}
            data={items}
            enableEditing={enableEditing}
            getRowId={getRowId}
            onEditCommit={() => inFlight.promise}
          />
        </MantineProvider>
      </StrictMode>
    );

    const { rerender } = render(view(true));

    fireEvent.click(box("Edit On sale"));
    expect(box("Edit On sale").disabled).toBe(true);

    // The gate shuts. The control goes with it — there is no session to cancel, but the failure
    // this write may come back with has nowhere left to be shown.
    rerender(view(false));
    expect(screen.queryByLabelText("Edit On sale")).toBeNull();

    await act(async () => {
      inFlight.reject(new Error("landed behind a closed gate"));
      await inFlight.promise.catch(() => undefined);
    });

    rerender(view(true));

    // The gate reopening is not a reprieve for the write that was out when it shut.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(box("Edit On sale").disabled).toBe(false);
    expect(box("Edit On sale").checked).toBe(true);
  });

  it("does not re-render every row because the commit handler was written inline", () => {
    const renders: string[] = [];
    // A cell renderer is the only place a row's re-render is observable from outside: DataRow is
    // memoized, and a cell only runs again when its row does.
    const counted: Array<ColumnDef<Item, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        cell: info => {
          renders.push(info.row.id);

          return info.getValue() as string;
        }
      },
      {
        accessorKey: "onSale",
        header: "On sale",
        meta: { edit: { instant: checkboxEditor() } }
      }
    ];

    function Host() {
      const [tick, setTick] = useState(0);

      return (
        <>
          <button type="button" onClick={() => setTick(value => value + 1)}>
            tick
          </button>

          <DataTable
            columns={counted}
            data={items}
            getRowId={getRowId}
            // Written inline, the ordinary way: a new function on every render of this component.
            onEditCommit={() => {
              expect(tick).toBeGreaterThanOrEqual(0);
            }}
          />
        </>
      );
    }

    render(<Host />, { wrapper });
    renders.length = 0;

    fireEvent.click(screen.getByRole("button", { name: "tick" }));

    // Nothing about the rows changed — only the identity of a handler whose *presence* is all
    // they read.
    expect(renders).toEqual([]);
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
            columns={columns}
            data={items}
            getRowId={getRowId}
            onEditCommit={() => {
              seen.push(tick);
            }}
          />
        </>
      );
    }

    render(<Host />, { wrapper });

    // The rows deliberately do not re-render for this, so nothing in them may be holding the
    // handler: the write goes through the controller, which always reaches the latest one.
    fireEvent.click(screen.getByRole("button", { name: "tick" }));
    fireEvent.click(screen.getByRole("button", { name: "tick" }));
    fireEvent.click(box("Edit On sale"));

    expect(seen).toEqual([2]);
  });

  it("re-renders a row when the commit handler appears or disappears", () => {
    const { rerender } = render(handlerView(true));
    expect(boxes("Edit On sale")).toHaveLength(2);

    // Presence is part of the gate: with nowhere for an edit to go the cells are read-only, and
    // the rows have to be told.
    rerender(handlerView(false));
    expect(screen.queryByLabelText("Edit On sale")).toBeNull();

    rerender(handlerView(true));
    expect(boxes("Edit On sale")).toHaveLength(2);
  });

  it("re-registers its controls when the table they belong to is replaced", () => {
    render(<SwappableTable />, { wrapper });

    fireEvent.click(box("Edit On sale"));
    expect(box("Edit On sale").checked).toBe(false);

    // The table is replaced under a control React keeps: same cell, same element. Its
    // registration belonged to the controller that is gone, and the new one holds no record.
    fireEvent.click(screen.getByRole("button", { name: "swap" }));
    expect(box("Edit On sale").checked).toBe(true);

    // Toggling reaches the new controller's store, and the new controller can tell this control
    // to draw what it now holds.
    fireEvent.click(box("Edit On sale"));
    expect(box("Edit On sale").checked).toBe(false);
  });
});

describe("custom instant renderers", () => {
  it("drives the same write lifecycle for whatever control the application renders", async () => {
    // Nothing checkbox-shaped: a button appending to a string value. The lifecycle is the
    // abstraction's, not the control's — the pending flag disables it, the settled write is
    // what the cell then shows, and previousValue departs from what the application last knew.
    const write = Promise.withResolvers<void>();
    const commits: Array<{ previousValue: unknown; value: unknown }> = [];

    render(
      <DataTable
        data={items}
        getRowId={getRowId}
        columns={[
          {
            accessorKey: "name",
            header: "Name",
            meta: {
              edit: {
                instant: ({
                  value,
                  commit,
                  pending
                }) => (
                  <button disabled={pending} type="button" onClick={() => void commit(`${String(value)}!`)}>
                    {String(value)}
                  </button>
                )
              }
            }
          }
        ]}
        onEditCommit={change => {
          commits.push({ previousValue: change.previousValue, value: change.value });

          return write.promise;
        }}
      />,
      { wrapper }
    );

    fireEvent.click(screen.getByRole("button", { name: "Wireless Mouse" }));

    expect(commits).toEqual([{ previousValue: "Wireless Mouse", value: "Wireless Mouse!" }]);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Wireless Mouse" }).disabled).toBe(true);

    await act(async () => {
      write.resolve();
      await Promise.resolve();
    });

    // The record stands while the data has not moved: the control shows what this cell wrote.
    expect(screen.getByRole("button", { name: "Wireless Mouse!" })).toBeTruthy();
  });
});
