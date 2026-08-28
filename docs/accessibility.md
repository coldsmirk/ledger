# Accessibility

What ledger guarantees, how to hold up your end, and where the boundaries are drawn.

## The table is an ARIA table

Header, body, and footer render as three synced native `<table>`s so the browser's layout does the work ([sizing.md](sizing.md)). Those tables are marked `role="presentation"`; a single explicit ARIA table on `.ledger-main` carries the semantics, and every row and cell states its own role:

| Element | Role |
| --- | --- |
| `.ledger-main` | `table` |
| header, body, and footer rows | `row` |
| header cells | `columnheader` (with `aria-sort` while sortable) |
| body cells | `cell` |
| footer cells | `cell` — totals are data, not headers |

Under `virtualizedRows`, rows carry `aria-rowindex` and the table carries `aria-rowcount`, so assistive technology reads "row 4,120 of 50,000" rather than counting the mounted window. Under `virtualizedColumns`, the table carries `aria-colcount` and every rendered header and data cell carries `aria-colindex`, so a windowed-out column still has an addressable position. Unvirtualized tables mount everything and need none of these.

## Name the table

```tsx
<DataTable aria-label="Open orders" … />
```

`aria-label`, `aria-labelledby`, and `aria-describedby` are routed to the ARIA table itself, not to the root wrapper — a name on a roleless `<div>` would never reach it. A table on a page with more than one deserves a name; a screen-reader user listing tables gets nothing else to tell them apart.

## Built-in controls are named

Every control ledger renders carries an accessible name from [`labels`](i18n.md), so a locale swap moves the names with the copy:

| Control | Name |
| --- | --- |
| Header filter trigger and the control inside it | `filterColumn(columnTitle)` — "Filter Amount" |
| Range filter | The group is named; each input keeps `filterRangeMin` / `filterRangeMax` |
| Inline editors (`ctx.label`, applied by the shipped editors) | `editColumn(columnTitle)` — "Edit Name" |
| Selection checkbox / radio | `selectRow`, `selectAllRows` |
| Expander | `expandRow` / `collapseRow`, `expandAll` / `collapseAll` |
| Global search | its placeholder, so the visible text and the name agree |
| Rows-per-page select | `aria-labelledby` the visible "Rows per page" text |

Column titles come from `meta.label`, then the def's `header` when it is a string; a JSX header with no `meta.label` falls back to the column id, so give such columns a `meta.label`.

## Keyboard

- **Sorting, filtering, the columns panel, pagination, and the selection controls** are ordinary focusable controls in DOM order.
- **`enableActiveRow`** makes the body viewport a focus stop with a visible ring: `↑` / `↓` move the current row, `Home` / `End` jump to the edges, `Enter` fires `onRowActivate`, and `F2` starts editing ([rows.md](rows.md#active-row)). That keyboard model is carried by `labels.rowNavigation`, hung on the viewport itself through `aria-describedby` (composed after any `aria-describedby` you passed in `viewportProps`) — a description is read out for the element that has focus, and the ARIA table never does. It is a *description*, not a name: the viewport is a roleless `<div>`, and ARIA's `generic` role prohibits an accessible name but not a description. Focus stays on the viewport as the current row moves, so the move is also spoken through a polite live region (`labels.currentRow`, carrying the leading visible cell's text and the row's position — hiding or reordering columns re-speaks it). Deliberately *not* `aria-activedescendant`: that attribute is defined for composite widgets, and this is a `table` (see Boundaries).
- **Inline editing** runs its own map — `Enter` / `Escape` / `Tab` commit, cancel, and move ([editing.md](editing.md#keyboard-and-lifecycle)).
- **Row ordering** is fully keyboard-driven from the handle button ([rows.md](rows.md#row-ordering)): `Space` lifts (`aria-pressed`), `↑` / `↓` step the insertion point, `Home` / `End` jump, `Space` drops, `Escape` cancels, and losing focus abandons the lift. Lift, target, drop, and cancel are each spoken through a polite live region (`labels.rowReorder*`), naming rows by the leading data column exactly as `labels.currentRow` does.
- **Wire navigation to `onRowActivate`, never `onRowClick`.** The latter is a pointer event by definition; a row whose only affordance is `onRowClick` cannot be reached by keyboard at all.

## States are announced

- `loading` sets `aria-busy` on the ARIA table (`.ledger-main`); with rows present it also dims them behind an overlay. The root keeps `data-loading` for styling.
- The **error** panel is a `role="alert"` — it interrupts, because a failed load invalidates what is on screen.
- The **empty / no-results** panel is a `role="status"` — polite, so filtering a table to nothing announces itself without interrupting the typing that caused it.
- The **load-more error** row puts its `role="alert"` on the message inside the cell, never on the cell: `role="alert"` would displace `role="cell"` and leave the row with no cell at all.
- Async edits set `aria-busy` on the editor and expose validation through `aria-invalid` + `aria-describedby`.

## Boundaries

Stated plainly, because a library that overclaims here is worse than one that does not:

- **ledger is a `table`, not a `grid`.** There is no cell-level roving focus and no cell selection — those belong to a spreadsheet-shaped component, and the keyboard model above is the deliberate alternative ([DESIGN.md](DESIGN.md)).
- **Column width has one keyboard route, and it is not the drag handle.** The resizer is `aria-hidden`: it takes no focus and answers no key, and announcing an inoperable control is worse than announcing nothing. The keyboard equivalent is the width field on each row of [`DataTable.ColumnsPanel`](columns.md#the-columns-panel), which writes the same `columnSizing` entry. That panel is a compound component the application renders — **enable `enableColumnResizing` without it and column width is pointer-only**.
- **Truncation tooltips are native `title`** and so reach pointer users only. For one that survives keyboard and touch, render it yourself in `cell` or attach it through `meta.cellProps` ([DOM props](styling.md#dom-props)).
- **Single-select radios group only across mounted rows.** Under `virtualizedRows` the platform's arrow-key navigation covers the rendered window, the same boundary autosize documents.
- **Your cells are yours.** Custom `cell` renderers, `emptyState`, detail panels, and anything reached through the DOM prop hooks are outside ledger's contract — the icon buttons in your actions column need their own labels.
