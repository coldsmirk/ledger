import type { ReactNode } from "react";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { startTransition, StrictMode, Suspense, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { useSlice } from "./use-slice";

function wrapper({ children }: { children: ReactNode }) {
  return <StrictMode>{children}</StrictMode>;
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

  it("resolves updaters chained inside one event against each other", () => {
    const onChange = vi.fn();

    function Chained() {
      const [current, set] = useSlice<number>({
        value: undefined,
        defaultValue: 0,
        onChange,
        fallback: 0
      });

      return (
        <>
          <span data-testid="value">{String(current)}</span>

          <button
            type="button"
            onClick={() => {
              set(previous => previous + 1);
              set(previous => previous + 1);
            }}
          >
            twice
          </button>
        </>
      );
    }

    render(<Chained />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "twice" }));

    // The second updater has to see the first one's result, which only the synchronous mirror
    // inside `set` can give it — the render it came from has not happened yet.
    expect(onChange.mock.calls.map(call => call[0])).toEqual([1, 2]);
    expect(screen.getByTestId("value").textContent).toBe("2");
  });
});
