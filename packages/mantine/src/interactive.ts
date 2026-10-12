import type { SyntheticEvent } from "react";

/**
 * The roles that take input of their own (WAI-ARIA widget roles a table cell can plausibly
 * hold). A bare `tabindex` is deliberately absent: focusable is not interactive, and a cell's
 * tooltip anchor or a scroll region must not swallow the row's click.
 */
const INTERACTIVE_ROLES = [
  "button",
  "checkbox",
  "combobox",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem"
];

/**
 * An element that handles a click or a key itself: links, buttons, form controls and the labels
 * that forward to them, a disclosure's summary, editable content, and the interactive roles.
 */
const INTERACTIVE = [
  "a[href]",
  "area[href]",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "[contenteditable]:not([contenteditable=\"false\"])",
  ...INTERACTIVE_ROLES.map(role => `[role="${role}"]`)
].join(", ");

/**
 * Whether an event belongs to `boundary` itself — the row a click reached, the body viewport a
 * key reached — rather than to something inside it that handles input of its own
 * (docs/rows.md#row-interaction):
 *
 * - it happened in the boundary's own DOM: React bubbles a portal's events through the tree
 * that rendered it, so a click on the item of a menu opened from a cell would otherwise reach
 * the row the menu's trigger sits in;
 * - and not on, or inside, an interactive element within the boundary, which owns it.
 */
export function isOwnEvent(event: SyntheticEvent, boundary: Element): boolean {
  const { target } = event;

  if (!(target instanceof Node) || !boundary.contains(target)) {
    return false;
  }

  const element = target instanceof Element ? target : target.parentElement;
  const interactive = element?.closest(INTERACTIVE);

  return !interactive || interactive === boundary || !boundary.contains(interactive);
}

/**
 * Whether a click is the end of a text selection made inside `boundary`: the pointer went down,
 * dragged across text and came up there, which selected the text and chose nothing. (A
 * double-click selects the word it lands on as its own effect, so it is not asked.)
 */
export function endsTextSelection(boundary: Element): boolean {
  const selection = boundary.ownerDocument.getSelection();

  return selection !== null && !selection.isCollapsed && boundary.contains(selection.anchorNode);
}
