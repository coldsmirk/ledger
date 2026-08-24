import type { ReactNode } from "react";

import type { ColumnDef } from "./types";

import { MantineProvider } from "@mantine/core";
import { act, render, renderHook, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DataTable } from "./data-table";
import { useResponsiveColumns } from "./use-responsive-columns";

interface Person {
  id: string;
  name: string;
  age: number;
  contact: string;
}

const people: Person[] = [
  {
    id: "1",
    name: "Carol",
    age: 30,
    contact: "carol@example.com"
  }
];

const columns: Array<ColumnDef<Person, any>> = [
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "age",
    header: "Age",
    meta: { hiddenFrom: "sm" }
  },
  {
    accessorKey: "contact",
    header: "Contact",
    meta: { visibleFrom: "md" }
  }
];

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <MantineProvider>{children}</MantineProvider>
    </StrictMode>
  );
}

/**
 * Controllable matchMedia stub keyed by the breakpoint length inside the query string.
 */
function installMatchMedia(initial: Record<string, boolean>) {
  const state = { ...initial };
  const listeners = new Map<string, Set<() => void>>();

  const keyFor = (query: string) => Object.keys(state).find(value => query.includes(value)) ?? query;

  vi.stubGlobal("matchMedia", (query: string) => {
    const key = keyFor(query);

    return {
      media: query,
      get matches() {
        return state[key] ?? false;
      },
      addEventListener: (_type: string, listener: () => void) => {
        const set = listeners.get(key) ?? new Set();
        set.add(listener);
        listeners.set(key, set);
      },
      removeEventListener: (_type: string, listener: () => void) => {
        listeners.get(key)?.delete(listener);
      }
    };
  });

  return (next: Record<string, boolean>) => {
    act(() => {
      for (const [key, matches] of Object.entries(next)) {
        state[key] = matches;
        const keyListeners = listeners.get(key);

        if (keyListeners) {
          for (const listener of keyListeners) {
            listener();
          }
        }
      }
    });
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useResponsiveColumns", () => {
  it("removes hiddenFrom columns above and visibleFrom columns below their breakpoints", () => {
    // Wide viewport: at/above sm and md.
    const update = installMatchMedia({ "48em": true, "62em": true });

    render(<DataTable columns={columns} data={people} getRowId={person => person.id} />, { wrapper });

    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.queryByText("Age")).toBeNull();
    expect(screen.getByText("Contact")).toBeTruthy();

    // Narrow viewport: below both breakpoints — the pair swaps.
    update({ "48em": false, "62em": false });

    expect(screen.getByText("Age")).toBeTruthy();
    expect(screen.queryByText("Contact")).toBeNull();
  });

  it("keeps every column when matchMedia is unavailable", () => {
    // jsdom ships a stub matchMedia; simulate a truly matchMedia-less environment (SSR).
    // The hook renders bare — MantineProvider itself needs matchMedia for scheme detection.
    vi.stubGlobal("matchMedia", undefined);

    const { result } = renderHook(() => useResponsiveColumns(columns));

    expect(result.current).toHaveLength(3);
  });

  it("keeps a breakpoint value that contains commas in one piece", () => {
    // A breakpoint is any CSS length the author writes, and clamp() carries commas.
    const clamped = "clamp(30em, 50vw, 60em)";
    const custom: Array<ColumnDef<Person, any>> = [
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "age",
        header: "Age",
        meta: { hiddenFrom: clamped }
      }
    ];
    const queries: string[] = [];

    vi.stubGlobal("matchMedia", (query: string) => {
      queries.push(query);

      return {
        matches: true,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => false)
      };
    });

    const { result } = renderHook(() => useResponsiveColumns(custom));

    expect(queries).toContain(`(min-width: ${clamped})`);
    // One breakpoint, one query — and the column it names is hidden at and above it.
    expect(queries.filter(query => query.includes("30em"))).toHaveLength(1);
    expect(result.current.map(column => column.header)).toEqual(["Name"]);
  });
});
