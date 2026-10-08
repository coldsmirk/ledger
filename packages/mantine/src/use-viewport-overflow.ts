import { useLayoutEffect, useState } from "react";

/**
 * Whether the body viewport scrolls on either axis. A scroll container has to be reachable by
 * keyboard to be scrolled by it (WCAG 2.1.1), while a focus stop over content that fits is a
 * Tab press spent on nothing — so the viewport's focus stop follows this.
 *
 * Measured whenever the viewport or its content resizes: rows arriving, columns widening, or
 * the host resizing the table each change the answer without a scroll event. A 1px tolerance
 * absorbs fractional layout rounding, which would otherwise flicker the stop on and off.
 */
export function useViewportOverflow(viewport: HTMLElement | null): boolean {
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    if (!viewport) {
      return;
    }

    const measure = () => {
      const next = viewport.scrollHeight - viewport.clientHeight > 1 || viewport.scrollWidth - viewport.clientWidth > 1;

      setOverflowing(next);
    };

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(viewport);

    if (viewport.firstElementChild) {
      observer.observe(viewport.firstElementChild);
    }

    return () => observer.disconnect();
  }, [viewport]);

  return overflowing;
}
