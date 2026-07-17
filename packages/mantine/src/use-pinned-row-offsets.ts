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

  topRows.current.length = topCount;
  bottomRows.current.length = bottomCount;

  const measure = useCallback(() => {
    const cumulative = (elements: Array<Element | null>) => {
      const result: number[] = [];
      let sum = 0;

      for (const element of elements) {
        result.push(sum);
        sum += element?.getBoundingClientRect().height ?? 0;
      }

      return result;
    };

    // Bottom rows stack upward: the LAST bottom-pinned row sits at 0, the ones above it offset
    // by the heights below them.
    const bottomHeights = bottomRows.current.map(element => element?.getBoundingClientRect().height ?? 0);
    const bottom: number[] = [];
    let below = 0;

    for (let index = bottomHeights.length - 1; index >= 0; index -= 1) {
      bottom[index] = below;
      below += bottomHeights[index] ?? 0;
    }

    const next = { top: cumulative(topRows.current), bottom };

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

        if (index < elements.current.length) {
          elements.current[index] = element;
        }

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
