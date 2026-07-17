/**
 * Sticky offsets for pinned rows: each top-pinned row sticks below the header PLUS the measured
 * heights of the pinned rows above it (bottom rows mirror upward). One shared `top` value would
 * stack every pinned row onto the same edge. Heights are measured, not assumed — row height
 * follows content and spacing.
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
    if (topCount === 0 && bottomCount === 0) {
      return;
    }

    measure();

    const observer = new ResizeObserver(measure);

    for (const element of [...topRows.current, ...bottomRows.current]) {
      if (element) {
        observer.observe(element);
      }
    }

    return () => observer.disconnect();
  }, [topCount, bottomCount, measure]);

  const registerTopRow = useCallback(
    (index: number) => (element: Element | null) => {
      topRows.current[index] = element;
    },
    []
  );

  const registerBottomRow = useCallback(
    (index: number) => (element: Element | null) => {
      bottomRows.current[index] = element;
    },
    []
  );

  return {
    offsets,
    registerTopRow,
    registerBottomRow
  };
}
