import type { ReactNode } from "react";

import type { SliceSetter } from "./use-slice";

import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { startTransition, StrictMode, Suspense, useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { useSlice } from "./use-slice";

function wrapper({ children }: { children: ReactNode }) {
  return <StrictMode>{children}</StrictMode>;
}

/**
 * React flushes transitions synchronously inside `act`. A test about when a transition has *not*
 * committed yet has to step outside it.
 */
const ACT_ENVIRONMENT = "IS_REACT_ACT_ENVIRONMENT";

const actEnvironmentFlag = (): unknown => Reflect.get(globalThis, ACT_ENVIRONMENT);

function setActEnvironmentFlag(enabled: unknown) {
  Reflect.set(globalThis, ACT_ENVIRONMENT, enabled);
}

function Slice({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const [current, set] = useSlice<number>({
    value,
    defaultValue: undefined,
    onChange,
    fallback: 0
  });

  return (
    <>
      <span data-testid="value">{String(current)}</span>

      <button type="button" onClick={() => set(previous => previous + 1)}>
        increment
      </button>
    </>
  );
}

describe("useSlice", () => {
  it("runs uncontrolled from defaultValue and resolves functional updaters", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useSlice<number[]>({
      value: undefined,
      defaultValue: [1],
      onChange,
      fallback: []
    }));

    expect(result.current[0]).toEqual([1]);

    act(() => result.current[1](previous => [...previous, 2]));

    expect(result.current[0]).toEqual([1, 2]);
    // The observer receives the resolved value, never the updater function.
    expect(onChange).toHaveBeenCalledWith([1, 2]);
  });

  it("falls back when neither value nor defaultValue is given", () => {
    const { result } = renderHook(() => useSlice<string>({
      value: undefined,
      defaultValue: undefined,
      onChange: undefined,
      fallback: "fallback"
    }));

    expect(result.current[0]).toBe("fallback");
  });

  it("follows the controlled value and still reports resolved values", () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ value }: { value: number }) => useSlice<number>({
        value,
        defaultValue: undefined,
        onChange,
        fallback: 0
      }),
      { initialProps: { value: 5 } }
    );

    expect(result.current[0]).toBe(5);

    act(() => result.current[1](previous => previous + 1));

    expect(onChange).toHaveBeenCalledWith(6);
    // Controlled: the rendered value only moves when the prop moves.
    expect(result.current[0]).toBe(5);

    rerender({ value: 6 });

    expect(result.current[0]).toBe(6);
  });

  it("resolves chained updaters within one event against fresh state", () => {
    const { result } = renderHook(() => useSlice<number>({
      value: undefined,
      defaultValue: 0,
      onChange: undefined,
      fallback: 0
    }));

    act(() => {
      result.current[1](previous => previous + 1);
      result.current[1](previous => previous + 1);
    });

    expect(result.current[0]).toBe(2);
  });

  it("resolves an updater against the value on screen, not one a discarded render named", () => {
    const blocker = Promise.withResolvers<void>();
    let unblocked = false;
    const onChange = vi.fn();

    function Blocker({ blocked }: { blocked: boolean }) {
      if (blocked && !unblocked) {
        throw blocker.promise;
      }

      return null;
    }

    function Harness() {
      const [value, setValue] = useState(0);
      const [blocked, setBlocked] = useState(false);

      return (
        <>
          <Slice
            value={value}
            onChange={next => {
              onChange(next);
              setValue(next);
            }}
          />

          <button
            type="button"
            onClick={() => startTransition(() => {
              setValue(10);
              setBlocked(true);
            })}
          >
            jump
          </button>

          <Suspense fallback={<div>waiting</div>}>
            <Blocker blocked={blocked} />
          </Suspense>
        </>
      );
    }

    render(<Harness />, { wrapper });

    expect(screen.getByTestId("value").textContent).toBe("0");

    // The transition renders 10 and is then thrown away, because a sibling suspends. Nothing of
    // it reached the screen — the slice on screen is still 0.
    fireEvent.click(screen.getByRole("button", { name: "jump" }));
    expect(screen.getByTestId("value").textContent).toBe("0");

    fireEvent.click(screen.getByRole("button", { name: "increment" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toBe(1);

    act(() => {
      unblocked = true;
      blocker.resolve();
    });
  });

  it("drops an optimistic value the controlled owner declined", async () => {
    const onChange = vi.fn();

    function Refused() {
      const [current, set] = useSlice<number>({
        value: 5,
        defaultValue: undefined,
        onChange,
        fallback: 0
      });

      return (
        <>
          <span data-testid="value">{String(current)}</span>

          <button type="button" onClick={() => set(previous => previous + 1)}>
            increment
          </button>
        </>
      );
    }

    render(<Refused />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "increment" }));

    expect(onChange.mock.calls.map(call => call[0])).toEqual([6]);
    expect(screen.getByTestId("value").textContent).toBe("5");

    // Two separate events, so the microtask that ends the first batch has to run in between —
    // which is exactly what a browser does between two real clicks.
    await Promise.resolve();

    fireEvent.click(screen.getByRole("button", { name: "increment" }));

    // `value` never moved, so the second event departs from 5 as well. Asking for 7 would be
    // building on a request the owner turned down.
    expect(onChange.mock.calls.map(call => call[0])).toEqual([6, 6]);
    expect(screen.getByTestId("value").textContent).toBe("5");
  });

  it("keeps an uncontrolled base alive across a transition that has not committed", async () => {
    const setter: { current: SliceSetter<number> | null } = { current: null };

    function Deferred() {
      const [current, set] = useSlice<number>({
        value: undefined,
        defaultValue: 0,
        onChange: undefined,
        fallback: 0
      });

      useEffect(() => {
        setter.current = set;
      }, [set]);

      return <span data-testid="value">{String(current)}</span>;
    }

    render(<Deferred />, { wrapper });

    // `act` flushes transitions eagerly, and their scheduling is exactly what this is about: a
    // transition renders on a task of React's own, so a microtask checkpoint arrives while the
    // update is still only queued. The window runs outside `act`, the way a browser does.
    const actEnvironment = actEnvironmentFlag();
    setActEnvironmentFlag(false);

    try {
      startTransition(() => setter.current?.(previous => previous + 1));

      await Promise.resolve();

      setter.current?.(previous => previous + 1);

      // Both increments are updates React has accepted. Neither may be resolved away.
      await waitFor(() => expect(screen.getByTestId("value").textContent).toBe("2"));
    } finally {
      setActEnvironmentFlag(actEnvironment);
    }
  });
});
