import { useLayoutEffect, useState } from "react";

/**
 * How the body's content sits in its viewport — measured whenever the viewport or its content
 * resizes: rows arriving, columns widening, or the host resizing the table each change the
 * answer without a scroll event.
 */
export interface ViewportFit {
  /**
   * The viewport scrolls sideways: its content is wider than it is.
   */
  overflowsX: boolean;
  /**
   * The viewport scrolls up and down: its content is taller than it is — never, under an
   * indefinite parent, where the table grows with its rows and the page scrolls instead.
   */
  overflowsY: boolean;
  /**
   * The rows end above the viewport's bottom edge, so there is empty body under the last one —
   * which makes the last row a row between, owed a separator like any other
   * (docs/styling.md#borders).
   */
  underfilled: boolean;
}

const UNMEASURED: ViewportFit = {
  overflowsX: false,
  overflowsY: false,
  underfilled: false
};

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
      const overflowsX = viewport.scrollWidth - viewport.clientWidth > 1;
      const overflowsY = viewport.scrollHeight - viewport.clientHeight > 1;
      const underfilled = content instanceof HTMLElement && viewport.clientHeight - content.offsetHeight >= 1;

      setFit(previous => previous.overflowsX === overflowsX && previous.overflowsY === overflowsY && previous.underfilled === underfilled
        ? previous
        : {
            overflowsX,
            overflowsY,
            underfilled
          });
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
