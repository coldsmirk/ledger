import type { DataTablePersistableSlice, DataTablePersistState } from "./types";

/**
 * Opt-in state persistence (`persistState`). Hydration happens once, synchronously, so the first
 * render already shows the restored layout; writes are debounced and the latest pending value
 * flushes on real unmount. Storage content is a trust boundary — values are shape-checked before
 * use, and a stale or corrupt entry degrades to defaults instead of crashing the table.
 */
import { useEffect, useRef } from "react";

import { warnOnce } from "./env";

const STORAGE_PREFIX = "ledger:";
const WRITE_DEBOUNCE_MS = 250;

const DEFAULT_SLICES: readonly DataTablePersistableSlice[] = [
  "columnSizing",
  "columnVisibility",
  "columnOrder",
  "columnPinning"
];

type PersistedState = Partial<Record<DataTablePersistableSlice, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(entry => typeof entry === "string");
}

function isRecordOf(value: unknown, guard: (entry: unknown) => boolean): boolean {
  return isRecord(value) && Object.values(value).every(entry => guard(entry));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isSortingState(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every(entry => isRecord(entry)
    && typeof entry.id === "string"
    && typeof entry.desc === "boolean");
}

function isColumnFiltersState(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every(entry => isRecord(entry)
    && typeof entry.id === "string"
    && Object.hasOwn(entry, "value"));
}

function isPaginationState(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return isSafeInteger(value.pageIndex)
    && value.pageIndex >= 0
    && isSafeInteger(value.pageSize)
    && value.pageSize > 0;
}

function isColumnPinningState(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return isStringArray(value.start) && isStringArray(value.end);
}

/**
 * Start wins an overlap, and each side holds a column once. A pinned id repeated within a side —
 * or claimed by both — would put the same column in the display order twice, which is a duplicate
 * `<col>`, a duplicate cell, and a duplicate React key. The reader is a trust boundary
 * (docs/state.md), so the shape is repaired rather than believed.
 */
function normalizeColumnPinning(value: unknown): unknown {
  if (!isRecord(value) || !isStringArray(value.start) || !isStringArray(value.end)) {
    return value;
  }

  const start = new Set(value.start);

  return { end: [...new Set(value.end).difference(start)], start: [...start] };
}

/**
 * The slices whose *valid* shape still needs repairing. Deliberately not every slice: a guard says
 * whether the value can be used at all, and only pinning carries an invariant beyond its shape.
 */
const sliceNormalizers: Partial<Record<DataTablePersistableSlice, (value: unknown) => unknown>> = {
  columnPinning: normalizeColumnPinning
};

/**
 * Per-slice shape guards — storage may hold data written by an older app version.
 */
const sliceGuards: Record<DataTablePersistableSlice, (value: unknown) => boolean> = {
  sorting: isSortingState,
  columnFilters: isColumnFiltersState,
  globalFilter: value => typeof value === "string",
  pagination: isPaginationState,
  columnVisibility: value => isRecordOf(value, entry => typeof entry === "boolean"),
  columnPinning: isColumnPinningState,
  columnOrder: isStringArray,
  columnSizing: value => isRecordOf(value, entry => isFiniteNumber(entry) && entry >= 0),
  grouping: isStringArray
};

function resolveStorage(persist: DataTablePersistState): DataTablePersistState["storage"] {
  if (persist.storage) {
    return persist.storage;
  }

  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function readPersistedState(persist: DataTablePersistState | undefined): PersistedState {
  if (!persist) {
    return {};
  }

  try {
    const raw = resolveStorage(persist)?.getItem(STORAGE_PREFIX + persist.key);

    if (!raw) {
      return {};
    }

    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed)) {
      return {};
    }

    const slices = persist.slices ?? DEFAULT_SLICES;
    const result: PersistedState = {};

    for (const slice of slices) {
      const value = parsed[slice];

      if (value !== undefined && sliceGuards[slice](value)) {
        result[slice] = sliceNormalizers[slice]?.(value) ?? value;
      }
    }

    return result;
  } catch {
    return {};
  }
}

function serializeSlices(
  slices: readonly DataTablePersistableSlice[],
  state: Record<DataTablePersistableSlice, unknown>
): string | null {
  try {
    return JSON.stringify(Object.fromEntries(slices.map(slice => [slice, state[slice]])));
  } catch {
    warnOnce(
      "persist-unserializable",
      "persistState skipped a write — a persisted slice holds a value JSON cannot represent (a BigInt, a circular reference, or a throwing toJSON)."
    );

    return null;
  }
}

export function usePersistWriter(
  persist: DataTablePersistState | undefined,
  state: Record<DataTablePersistableSlice, unknown>
): void {
  const slices = persist?.slices ?? DEFAULT_SLICES;
  // Serialized in the render that produced the state, but never *throwing* in it: a filter value
  // may be a BigInt, may refer to itself, or may own a `toJSON` that throws, and any of those
  // would take the whole table down on a keystroke. `null` means "this state cannot be written",
  // which cancels the pending write rather than leaving the previous payload to stand in for it.
  const serialized = persist ? serializeSlices(slices, state) : "";
  const key = persist?.key;
  const storage = persist?.storage;
  const pendingWriteRef = useRef<(() => void) | null>(null);
  const unmountFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!persist || !key || serialized === null) {
      pendingWriteRef.current = null;

      return;
    }

    const write = () => {
      if (pendingWriteRef.current !== write) {
        return;
      }

      try {
        resolveStorage(persist)?.setItem(STORAGE_PREFIX + key, serialized);
      } catch {
        // Quota/privacy-mode failures degrade to "not persisted", never to a crash.
      } finally {
        pendingWriteRef.current = null;
      }
    };

    pendingWriteRef.current = write;
    const timer = setTimeout(write, WRITE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // The `storage` dependency re-targets a pending write when the backend swaps under the
    // same key (e.g. a consent flow upgrading in-memory storage to localStorage).
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- `persist` participates via `key`/`serialized`/`storage`; its object identity is irrelevant
  }, [key, serialized, storage]);

  useEffect(() => {
    if (unmountFlushTimer.current !== null) {
      clearTimeout(unmountFlushTimer.current);
      unmountFlushTimer.current = null;
    }

    return () => {
      // Defer one tick so React StrictMode's simulated unmount/remount can cancel the flush.
      unmountFlushTimer.current = setTimeout(() => {
        unmountFlushTimer.current = null;
        pendingWriteRef.current?.();
      }, 0);
    };
  }, []);
}
