/**
 * Sticky offsets for pinned display items: each top item sticks at the body edge plus the measured
 * heights above it (bottom items mirror upward). One shared `top` value would stack every pinned
 * row/detail item onto the same edge. Heights are measured, not assumed — they follow content and
 * spacing.
 */
import { useCallback, useLayoutEffect, useRef, useState } from "react";

interface PinnedRowOffsets {
  top: number[];
  bottom: number[];
}

const NONE: PinnedRowOffsets = { top: [], bottom: [] };

export interface PinnedRowMeasurer {
  offsets: PinnedRowOffsets;
  registerTopRow: (index: number) => (element: Element | null) => void;
  registerBottomRow: (index: number) => (element: Element | null) => void;
}

export function usePinnedRowOffsets(topCount: number, bottomCount: number): PinnedRowMeasurer {
  const [offsets, setOffsets] = useState<PinnedRowOffsets>(NONE);
  const topRows = useRef<Array<Element | null>>([]);
  const bottomRows = useRef<Array<Element | null>>([]);
  const topCallbacks = useRef<Array<(element: Element | null) => void>>([]);
  const bottomCallbacks = useRef<Array<(element: Element | null) => void>>([]);
  const observerRef = useRef<ResizeObserver | null>(null);

  /**
   * How many items of each end actually reached the screen. Mirrored in a layout effect, never
   * read from the props while measuring: refs are shared between the current tree and a
   * work-in-progress one, so a transition React renders and then throws away — a sibling suspends
   * — would otherwise take a row that is still on screen out of the measurement, and its ref
   * callback would never run again to put it back.
   */
  const committedCounts = useRef({ bottom: bottomCount, top: topCount });

  const measure = useCallback(() => {
    const cumulative = (elements: Array<Element | null>, count: number) => {
      const result: number[] = [];
      let sum = 0;

      for (let index = 0; index < count; index += 1) {
        result.push(sum);
        sum += elements[index]?.getBoundingClientRect().height ?? 0;
      }

      return result;
    };

    // Only what is on screen is measured, and all of it: an element registered for a row that has
    // not committed yet is not part of the layout, and a row that has is, whether or not anything
    // has re-attached its element since.
    const counts = committedCounts.current;

    // Bottom rows stack upward: the LAST bottom-pinned row sits at 0, the ones above it offset
    // by the heights below them.
    const bottom: number[] = [];
    let below = 0;

    for (let index = counts.bottom - 1; index >= 0; index -= 1) {
      bottom[index] = below;
      below += bottomRows.current[index]?.getBoundingClientRect().height ?? 0;
    }

    const next = { top: cumulative(topRows.current, counts.top), bottom };

    setOffsets(previous => previous.top.join(",") === next.top.join(",") && previous.bottom.join(",") === next.bottom.join(",")
      ? previous
      : next);
  }, []);

  useLayoutEffect(() => {
    const observer = new ResizeObserver(measure);
    observerRef.current = observer;

    for (const element of [...topRows.current, ...bottomRows.current]) {
      if (element) {
        observer.observe(element);
      }
    }

    measure();

    return () => {
      observerRef.current = null;
      observer.disconnect();
    };
  }, [measure]);

  /**
   * A real change in how many items are pinned: the counts the measurement works from move here,
   * in the commit phase, and the rows that left take their elements with them. Then everything
   * still there is measured again, because what stays has moved.
   */
  useLayoutEffect(() => {
    const counts = committedCounts.current;

    if (counts.top === topCount && counts.bottom === bottomCount) {
      return;
    }

    committedCounts.current = { bottom: bottomCount, top: topCount };
    topRows.current.length = topCount;
    bottomRows.current.length = bottomCount;
    measure();
  });

  const register = useCallback(
    (
      elements: { current: Array<Element | null> },
      callbacks: { current: Array<(element: Element | null) => void> },
      index: number
    ) => {
      const existing = callbacks.current[index];

      if (existing) {
        return existing;
      }

      let currentElement: Element | null = null;

      const callback = (element: Element | null) => {
        if (element === currentElement) {
          return;
        }

        if (currentElement) {
          observerRef.current?.unobserve(currentElement);
        }

        currentElement = element;
        // Written whatever the array's length is: a row growing the list attaches its element
        // during the same commit that carries the new count, and the effect above has not run
        // yet. The effect is what trims anything the screen no longer holds.
        elements.current[index] = element;

        if (element) {
          observerRef.current?.observe(element);
        }

        measure();
      };

      callbacks.current[index] = callback;

      return callback;
    },
    [measure]
  );

  const registerTopRow = useCallback(
    (index: number) => register(topRows, topCallbacks, index),
    [register]
  );

  const registerBottomRow = useCallback(
    (index: number) => register(bottomRows, bottomCallbacks, index),
    [register]
  );

  return {
    offsets,
    registerTopRow,
    registerBottomRow
  };
}
