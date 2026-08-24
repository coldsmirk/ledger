import type { Updater } from "@tanstack/react-table";

/**
 * One state slice of the table, following the canonical React controlled/uncontrolled contract
 * (docs/state.md): controlled `value` / uncontrolled `defaultValue` / observer `onChange`
 * receiving the resolved value. TanStack hands us `Updater`s; they are resolved here so consumer
 * callbacks never see a function.
 */
import { useUncontrolled } from "@mantine/hooks";
import { functionalUpdate } from "@tanstack/react-table";
import { useCallback, useInsertionEffect, useRef } from "react";

export type SliceSetter<T> = (updater: Updater<T>) => void;

export interface UseSliceInput<T> {
  value: T | undefined;
  defaultValue: T | undefined;
  onChange: ((value: T) => void) | undefined;
  /**
   * Internal notification for every resolved set attempt, including no-op values that React does
   * not render. Used by debounced controls to observe an external reset to the current value.
   */
  onSet?: (value: T) => void;
  fallback: T;
}

export function useSlice<T>({
  value,
  defaultValue,
  onChange,
  onSet,
  fallback
}: UseSliceInput<T>): readonly [T, SliceSetter<T>] {
  const [current, setCurrent] = useUncontrolled<T>({
    value,
    defaultValue,
    finalValue: fallback,
    onChange
  });

  /**
   * What actually reached the screen, and the handlers of the render that put it there. Mirrored
   * in an effect rather than during render: refs are shared between the current tree and a
   * work-in-progress one, so a transition React renders and then throws away — a sibling
   * suspends — would otherwise leave updaters resolving against a value nobody ever saw, and
   * calling the abandoned render's `onChange`. Insertion phase, so that a layout effect setting
   * a slice already sees this render's values; `useEventCallback` mirrors its handler the same
   * way, for the same reason.
   */
  const committedRef = useRef(current);
  const setCurrentRef = useRef(setCurrent);
  const onSetRef = useRef(onSet);

  /**
   * The value this event has already asked for, so updaters chained inside one event resolve
   * against each other instead of against the render-time snapshot. It is scoped to that event:
   * `value` is controllable, and an owner may answer by leaving it exactly where it was — no
   * render would then arrive to correct this, and every later event would go on departing from a
   * value the owner declined. So it is dropped at the end of the batch, by a microtask queued
   * when the burst starts, rather than left for whatever render happens along next.
   */
  const requestedRef = useRef<{ value: T } | null>(null);

  useInsertionEffect(() => {
    committedRef.current = current;
    requestedRef.current = null;
    setCurrentRef.current = setCurrent;
    onSetRef.current = onSet;
  });

  const set = useCallback<SliceSetter<T>>(updater => {
    const requested = requestedRef.current;
    const next = functionalUpdate(updater, requested ? requested.value : committedRef.current);

    if (requested === null) {
      queueMicrotask(() => {
        requestedRef.current = null;
      });
    }

    requestedRef.current = { value: next };
    onSetRef.current?.(next);
    setCurrentRef.current(next);
  }, []);

  return [current, set] as const;
}
