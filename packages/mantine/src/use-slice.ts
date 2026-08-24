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
  const [current, setCurrent, controlled] = useUncontrolled<T>({
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
  const controlledRef = useRef(controlled);

  /**
   * The value already asked for and not yet seen on screen, so updaters resolve against each
   * other rather than against a snapshot the last one has already moved past. How long it may
   * stand depends on who owns the state.
   */
  const requestedRef = useRef<{ value: T; controlled: boolean } | null>(null);

  useInsertionEffect(() => {
    committedRef.current = current;

    // Only a commit that actually carries the value ends the request. React renders lanes it has
    // not been asked to flush yet — an urgent update commits without the transition queued behind
    // it — and an update still sitting in that queue is one React will apply, so it goes on
    // counting until it does. A slice that has changed hands drops it either way: what the last
    // owner asked for is nothing the new one agreed to.
    if (requestedRef.current
      && (requestedRef.current.controlled !== controlled || Object.is(current, requestedRef.current.value))) {
      requestedRef.current = null;
    }

    setCurrentRef.current = setCurrent;
    onSetRef.current = onSet;
    controlledRef.current = controlled;
  });

  const set = useCallback<SliceSetter<T>>(updater => {
    // A request the other owner made says nothing about this one's value.
    const requested = requestedRef.current?.controlled === controlledRef.current ? requestedRef.current : null;
    const next = functionalUpdate(updater, requested ? requested.value : committedRef.current);

    // Uncontrolled state always takes the update. React renders it when it chooses — a
    // transition renders on a task of its own — so the value stands until the render carrying it
    // commits, and the insertion effect above is what ends it.
    //
    // A controlled owner may instead answer by leaving `value` exactly where it was, and nothing
    // tells that refusal apart from an acceptance it has deferred: both look like silence. So
    // there the value stands for the event that asked for it and no longer, dropped by a
    // microtask queued when the burst starts. An owner deferring inside a transition therefore
    // sees the next event depart from what is on screen rather than from what it has not applied
    // — building on a value it may never take is the worse of the two mistakes.
    if (requested === null && controlledRef.current) {
      queueMicrotask(() => {
        requestedRef.current = null;
      });
    }

    requestedRef.current = { controlled: controlledRef.current, value: next };
    onSetRef.current?.(next);
    setCurrentRef.current(next);
  }, []);

  return [current, set] as const;
}
