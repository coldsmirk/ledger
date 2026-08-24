import type { PinnedRowMeasurer } from "./use-pinned-row-offsets";

import { act, render, renderHook, screen } from "@testing-library/react";
import { startTransition, StrictMode, Suspense, useEffect, useState } from "react";
import { describe, expect, it } from "vitest";

import { usePinnedRowOffsets } from "./use-pinned-row-offsets";

function rowWithHeight(height: number): Element {
  return {
    getBoundingClientRect: () => { return { height }; }
  } as unknown as Element;
}

/**
 * The two ends of the body are the same mechanism read in opposite directions: top items stack
 * downward from the first, bottom items upward from the last. Every rule below holds for both.
 */
const ENDS = [
  {
    name: "top",
    counts: (count: number) => [count, 0] as const,
    register: (measurer: PinnedRowMeasurer) => measurer.registerTopRow,
    read: (measurer: PinnedRowMeasurer) => measurer.offsets.top,
    // Heights 20 then 40, with the first replaced by 30: each item clears the ones above it.
    settled: [0, 30]
  },
  {
    name: "bottom",
    counts: (count: number) => [0, count] as const,
    register: (measurer: PinnedRowMeasurer) => measurer.registerBottomRow,
    read: (measurer: PinnedRowMeasurer) => measurer.offsets.bottom,
    // The last item sits on the edge; the one above it clears the 40 below.
    settled: [40, 0]
  }
];

describe("usePinnedRowOffsets", () => {
  it("remeasures same-count element replacements and row reorders", () => {
    const { result } = renderHook(() => usePinnedRowOffsets(2, 0));

    act(() => {
      result.current.registerTopRow(0)(rowWithHeight(20));
      result.current.registerTopRow(1)(rowWithHeight(40));
    });
    expect(result.current.offsets.top).toEqual([0, 20]);

    act(() => {
      result.current.registerTopRow(0)(rowWithHeight(40));
      result.current.registerTopRow(1)(rowWithHeight(20));
    });
    expect(result.current.offsets.top).toEqual([0, 40]);
  });

  it.each(ENDS)("keeps measuring the $name rows on screen after a discarded render shrank the count", end => {
    const blocker = Promise.withResolvers<void>();
    const measurer: { current: PinnedRowMeasurer | null } = { current: null };

    function Blocker({ blocked }: { blocked: boolean }) {
      if (blocked) {
        throw blocker.promise;
      }

      return null;
    }

    function Harness() {
      const [count, setCount] = useState(2);
      const [blocked, setBlocked] = useState(false);
      const [top, bottom] = end.counts(count);
      const pinned = usePinnedRowOffsets(top, bottom);

      useEffect(() => {
        measurer.current = pinned;
      });

      return (
        <>
          <span data-testid="offsets">{end.read(pinned).join(",")}</span>

          <button
            type="button"
            onClick={() => startTransition(() => {
              setCount(1);
              setBlocked(true);
            })}
          >
            shrink
          </button>

          <Suspense fallback={<div>waiting</div>}>
            <Blocker blocked={blocked} />
          </Suspense>
        </>
      );
    }

    render(<Harness />, { wrapper: StrictMode });

    act(() => {
      const register = end.register(measurer.current as PinnedRowMeasurer);
      register(0)(rowWithHeight(20));
      register(1)(rowWithHeight(40));
    });
    expect(screen.getByTestId("offsets").textContent).toBe(end.name === "top" ? "0,20" : "40,0");

    // The transition renders one row and is then thrown away, because a sibling suspends. Two
    // rows are still on screen, and nothing about them changed.
    act(() => {
      screen.getByRole("button", { name: "shrink" }).click();
    });
    expect(screen.getByTestId("offsets").textContent).toBe(end.name === "top" ? "0,20" : "40,0");

    // Something the observer watches resizes. The measurement has to cover both rows that are
    // actually there — a render nobody saw may not have taken one of them out of it.
    act(() => {
      end.register(measurer.current as PinnedRowMeasurer)(0)(rowWithHeight(30));
    });

    expect(end.read(measurer.current as PinnedRowMeasurer)).toEqual(end.settled);
  });

  it.each(ENDS)("remeasures the $name rows when a real change of count commits", end => {
    const measurer: { current: PinnedRowMeasurer | null } = { current: null };

    function Counted({ count }: { count: number }) {
      const [top, bottom] = end.counts(count);
      const pinned = usePinnedRowOffsets(top, bottom);

      useEffect(() => {
        measurer.current = pinned;
      });

      return <span data-testid="offsets">{end.read(pinned).join(",")}</span>;
    }

    const { rerender } = render(<Counted count={1} />, { wrapper: StrictMode });

    act(() => {
      end.register(measurer.current as PinnedRowMeasurer)(0)(rowWithHeight(20));
    });
    expect(screen.getByTestId("offsets").textContent).toBe("0");

    // A second row arrives. Its element attaches during the commit that carries the new count,
    // before anything in the owner has seen that count — which is the only order React offers,
    // since refs are attached before the layout effects above them run.
    act(() => {
      end.register(measurer.current as PinnedRowMeasurer)(1)(rowWithHeight(40));
    });

    rerender(<Counted count={2} />);
    expect(screen.getByTestId("offsets").textContent).toBe(end.name === "top" ? "0,20" : "40,0");

    // And it leaves again: React detaches its element, then the new count commits.
    act(() => {
      end.register(measurer.current as PinnedRowMeasurer)(1)(null);
    });

    rerender(<Counted count={1} />);
    expect(screen.getByTestId("offsets").textContent).toBe("0");

    // Nothing of the row that left may come back with the next measurement.
    act(() => {
      end.register(measurer.current as PinnedRowMeasurer)(0)(rowWithHeight(30));
    });
    expect(end.read(measurer.current as PinnedRowMeasurer)).toEqual([0]);
  });
});
