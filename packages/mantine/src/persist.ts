import type { DataTablePersistableSlice, DataTablePersistState } from "./types";

/**
 * Opt-in state persistence (`persistState`). Hydration happens once, synchronously, so the first
 * render already shows the restored layout; writes are debounced. Storage content is a trust
 * boundary — values are shape-checked before use, and a stale or corrupt entry degrades to
 * defaults instead of crashing the table.
 */
import { useEffect } from "react";

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

/**
 * Per-slice shape guards — storage may hold data written by an older app version.
 */
const sliceGuards: Record<DataTablePersistableSlice, (value: unknown) => boolean> = {
  sorting: Array.isArray,
  columnFilters: Array.isArray,
  globalFilter: value => typeof value === "string",
  pagination: value => isRecord(value) && typeof value.pageIndex === "number" && typeof value.pageSize === "number",
  columnVisibility: isRecord,
  columnPinning: isRecord,
  columnOrder: Array.isArray,
  columnSizing: isRecord,
  grouping: Array.isArray
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
        result[slice] = value;
      }
    }

    return result;
  } catch {
    return {};
  }
}

export function usePersistWriter(
  persist: DataTablePersistState | undefined,
  state: Record<DataTablePersistableSlice, unknown>
): void {
  const slices = persist?.slices ?? DEFAULT_SLICES;
  const serialized = persist
    ? JSON.stringify(Object.fromEntries(slices.map(slice => [slice, state[slice]])))
    : "";
  const key = persist?.key;

  useEffect(() => {
    if (!persist || !key) {
      return;
    }

    const timer = setTimeout(() => {
      try {
        resolveStorage(persist)?.setItem(STORAGE_PREFIX + key, serialized);
      } catch {
        // Quota/privacy-mode failures degrade to "not persisted", never to a crash.
      }
    }, WRITE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- `persist` participates via `key`/`serialized`; its object identity is irrelevant
  }, [key, serialized]);
}
