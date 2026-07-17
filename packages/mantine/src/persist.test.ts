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
});
