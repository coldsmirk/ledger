import { useLayoutEffect, useState } from "react";

/**
 * How the body's content sits in its viewport — measured whenever the viewport or its content
 * resizes: rows arriving, columns widening, or the host resizing the table each change the
 * answer without a scroll event.
 */
export interface ViewportFit {
  /**
   * The viewport scrolls on either axis. A scroll container has to be reachable by keyboard to be
   * scrolled by it (WCAG 2.1.1), while a focus stop over content that fits is a Tab press spent
   * on nothing — so the viewport's focus stop follows this.
   */
  overflowing: boolean;
  /**
   * The rows end above the viewport's bottom edge, so there is empty body under the last one —
   * which makes the last row a row between, owed a separator like any other
   * (docs/styling.md#borders).
   */
  underfilled: boolean;
}

const UNMEASURED: ViewportFit = { overflowing: false, underfilled: false };

/**
 * Layout sizes only, never rects: a transform (a modal scaling in) would shrink a rect but not
 * the viewport's client box, and nothing re-measures when the transform ends. A 1px tolerance
 * absorbs fractional layout rounding, which would otherwise flicker either answer.
 */
export function useViewportFit(viewport: HTMLElement | null): ViewportFit {
  const [fit, setFit] = useState(UNMEASURED);

  useLayoutEffect(() => {
    if (!viewport) {
      return;
    }

    const content = viewport.firstElementChild;

    const measure = () => {
      const overflowing = viewport.scrollHeight - viewport.clientHeight > 1 || viewport.scrollWidth - viewport.clientWidth > 1;
      const underfilled = content instanceof HTMLElement && viewport.clientHeight - content.offsetHeight >= 1;

      setFit(previous => previous.overflowing === overflowing && previous.underfilled === underfilled
        ? previous
        : { overflowing, underfilled });
    };

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(viewport);

    if (content) {
      observer.observe(content);
    }

    return () => observer.disconnect();
  }, [viewport]);

  return fit;
}
