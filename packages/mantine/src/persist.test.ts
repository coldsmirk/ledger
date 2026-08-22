import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readPersistedState, usePersistWriter } from "./persist";

function storageStub(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
    removeItem: (key: string) => store.delete(key)
  };
}

function persistableState(width: number) {
  return {
    sorting: [],
    columnFilters: [],
    globalFilter: "",
    pagination: { pageIndex: 0, pageSize: 20 },
    columnVisibility: {},
    columnPinning: {},
    columnOrder: [],
    columnSizing: { name: width },
    grouping: []
  };
}

describe("readPersistedState", () => {
  it("returns only shape-valid slices from the requested set", () => {
    const storage = storageStub({
      "ledger:demo": JSON.stringify({
        sorting: [{ id: "name", desc: false }],
        columnSizing: "corrupt",
        columnVisibility: { age: false },
        unknown: 1
      })
    });

    const state = readPersistedState({
      key: "demo",
      slices: ["sorting", "columnSizing", "columnVisibility"],
      storage
    });

    expect(state).toEqual({
      sorting: [{ id: "name", desc: false }],
      columnVisibility: { age: false }
    });
  });

  it("degrades corrupt storage to defaults instead of throwing", () => {
    const storage = storageStub({ "ledger:demo": "not json{{{" });

    expect(readPersistedState({ key: "demo", storage })).toEqual({});
  });

  it("rejects invalid nested slice shapes", () => {
    const storage = storageStub({
      "ledger:demo": JSON.stringify({
        sorting: [{ id: 1, desc: false }],
        columnFilters: [{ id: "name" }],
        globalFilter: 1,
        pagination: { pageIndex: -1, pageSize: 0 },
        columnVisibility: { age: "false" },
        columnPinning: { start: "name", end: [] },
        columnOrder: ["name", 1],
        columnSizing: { name: "240" },
        grouping: ["department", 1]
      })
    });

    expect(readPersistedState({
      key: "demo",
      slices: [
        "sorting",
        "columnFilters",
        "globalFilter",
        "pagination",
        "columnVisibility",
        "columnPinning",
        "columnOrder",
        "columnSizing",
        "grouping"
      ],
      storage
    })).toEqual({});
  });

  it("accepts valid nested slice shapes", () => {
    const persisted = {
      sorting: [{ id: "name", desc: false }],
      columnFilters: [{ id: "name", value: "ali" }],
      globalFilter: "ali",
      pagination: { pageIndex: 2, pageSize: 20 },
      columnVisibility: { age: false },
      columnPinning: { start: ["name"], end: ["age"] },
      columnOrder: ["name", "age"],
      columnSizing: { name: 240 },
      grouping: ["department"]
    };
    const storage = storageStub({ "ledger:demo": JSON.stringify(persisted) });

    expect(readPersistedState({
      key: "demo",
      slices: [
        "sorting",
        "columnFilters",
        "globalFilter",
        "pagination",
        "columnVisibility",
        "columnPinning",
        "columnOrder",
        "columnSizing",
        "grouping"
      ],
      storage
    })).toEqual(persisted);
  });
});

describe("usePersistWriter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("writes the picked slices, debounced", () => {
    const storage = storageStub();
    const state = {
      sorting: [],
      columnFilters: [],
      globalFilter: "",
      pagination: { pageIndex: 0, pageSize: 20 },
      columnVisibility: {},
      columnPinning: {},
      columnOrder: [],
      columnSizing: { name: 240 },
      grouping: []
    };

    renderHook(() => usePersistWriter({
      key: "demo",
      slices: ["columnSizing"],
      storage
    }, state));

    expect(storage.setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    expect(storage.setItem).toHaveBeenCalledWith(
      "ledger:demo",
      JSON.stringify({ columnSizing: { name: 240 } })
    );
  });

  it("re-targets the pending debounced write when the storage backend swaps", () => {
    const storageA = storageStub();
    const storageB = storageStub();

    const { rerender } = renderHook(
      ({ storage }: { storage: ReturnType<typeof storageStub> }) => usePersistWriter({
        key: "demo",
        slices: ["columnSizing"],
        storage
      }, persistableState(240)),
      { initialProps: { storage: storageA } }
    );

    // Swap mid-debounce (a consent flow upgrading in-memory storage to localStorage): the
    // pending write must land in the new backend, not the old one.
    rerender({ storage: storageB });
    vi.advanceTimersByTime(300);

    expect(storageA.setItem).not.toHaveBeenCalled();
    expect(storageB.setItem).toHaveBeenCalledWith(
      "ledger:demo",
      JSON.stringify({ columnSizing: { name: 240 } })
    );
  });

  it("flushes the latest pending value on a real unmount", () => {
    const storage = storageStub();
    const persist = {
      key: "demo",
      slices: ["columnSizing" as const],
      storage
    };

    const { rerender, unmount } = renderHook(
      ({ width }: { width: number }) => usePersistWriter(persist, persistableState(width)),
      { initialProps: { width: 120 } }
    );

    rerender({ width: 240 });
    unmount();
    vi.advanceTimersByTime(1);

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(
      "ledger:demo",
      JSON.stringify({ columnSizing: { name: 240 } })
    );
  });

  it("does not flush during a StrictMode simulated unmount", () => {
    const storage = storageStub();
    const state = {
      sorting: [],
      columnFilters: [],
      globalFilter: "",
      pagination: { pageIndex: 0, pageSize: 20 },
      columnVisibility: {},
      columnPinning: {},
      columnOrder: [],
      columnSizing: { name: 240 },
      grouping: []
    };

    renderHook(() => usePersistWriter({
      key: "demo",
      slices: ["columnSizing"],
      storage
    }, state), { reactStrictMode: true });

    vi.advanceTimersByTime(1);
    expect(storage.setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(249);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });
});
