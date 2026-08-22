import type { PointerEvent } from "react";

/**
 * The tooltip behind `meta.truncate` (docs/columns.md) and the header label.
 *
 * Resolved at hover time from the element itself, for three reasons the old render-time
 * `title={cell.getValue()}` got wrong: the rendered text is what is actually clipped (a custom
 * `cell` renderer's output included), a non-primitive value still has readable text, and a
 * tooltip is only worth having when the text really overflows.
 *
 * Deliberately imperative: measuring every truncated cell on every render would thrash layout
 * across a virtualized body, and the read here happens once, on the hover that precedes the
 * browser's own tooltip delay. Native `title` therefore reaches pointer users only — a richer
 * tooltip is a `meta.cellProps` or custom `cell` job.
 */
export function syncTruncationTitle(event: PointerEvent<HTMLElement>): void {
  const element = event.currentTarget;
  const text = element.scrollWidth > element.clientWidth ? element.textContent : null;

  if (text === null || text === "") {
    element.removeAttribute("title");
  } else {
    element.title = text;
  }
}
