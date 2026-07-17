import type { Updater } from "@tanstack/react-table";

/**
 * One state slice of the table, following the canonical React controlled/uncontrolled contract
 * (docs/state.md): controlled `value` / uncontrolled `defaultValue` / observer `onChange`
 * receiving the resolved value. TanStack hands us `Updater`s; they are resolved here so consumer
 * callbacks never see a function.
 */
import { useUncontrolled } from "@mantine/hooks";
import { functionalUpdate } from "@tanstack/react-table";
import { useCallback, useRef } from "react";

export type SliceSetter<T> = (updater: Updater<T>) => void;

export interface UseSliceInput<T> {
  value: T | undefined;
  defaultValue: T | undefined;
  onChange: ((value: T) => void) | undefined;
  fallback: T;
}

export function useSlice<T>({
  value,
  defaultValue,
  onChange,
  fallback
}: UseSliceInput<T>): readonly [T, SliceSetter<T>] {
  const [current, setCurrent] = useUncontrolled<T>({
    value,
    defaultValue,
    finalValue: fallback,
    onChange
  });

  // Mirror the latest value so chained updaters within one event resolve against fresh state,
  // not the render-time snapshot.
  const currentRef = useRef(current);
  currentRef.current = current;

  const setCurrentRef = useRef(setCurrent);
  setCurrentRef.current = setCurrent;

  const set = useCallback<SliceSetter<T>>(updater => {
    const next = functionalUpdate(updater, currentRef.current);
    currentRef.current = next;
    setCurrentRef.current(next);
  }, []);

  return [current, set] as const;
}
