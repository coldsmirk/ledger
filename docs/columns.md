# Columns

Columns are **raw TanStack `ColumnDef`s** — ledger has no bespoke column DSL. Every column-level TanStack capability (`sortingFn`, `sortDescFirst`, `sortUndefined`, `invertSorting`, `filterFn`, `aggregationFn`, `size`/`minSize`/`maxSize`, per-column `enable*`) is therefore automatically present, and knowledge transfers directly from TanStack's docs. Presentation concerns ride the typed `meta` extension described below.

## Defining columns

`createColumnHelper` is re-exported from the main entry (never import `@tanstack/*` directly):

```tsx
import { createColumnHelper } from "@coldsmirk/ledger-mantine";

const helper = createColumnHelper<Person>();

const columns = [
  helper.accessor("name", { header: "Name", size: 160 }),
  helper.accessor(person => person.contact.email, {
    id: "email",                              // required with an accessor function
    header: "Email",
    meta: { truncate: true }
  }),
  helper.display({
    id: "actions",
    size: 64,
    enableSorting: false,
    cell: ({ row }) => <RowActions person={row.original} />
  })
];
```

Keep the array's identity stable (module scope or `useMemo`) — a fresh identity every render re-initializes the table, and a dev-mode warning detects the churn.

### Header groups and footers

Group columns (`helper.group({ header, columns })`) render as grouped header rows with correct `colSpan` and placeholder handling. Column footers render as a totals row **only when at least one leaf column declares a `footer`** — in an **always-visible region below the scroller** (like the header, it mirrors horizontal scroll), so totals never scroll out of view; pinned columns keep their sticky offsets there. Note that header drag-reordering is unavailable while header groups exist (see below).

## The `meta` extension

ledger declaration-merges its presentation surface into TanStack's `ColumnMeta`, so `meta` is fully typed with no imports:

| Key | Type | Effect |
| --- | --- | --- |
| `align` | `"start" \| "center" \| "end"` | Logical text alignment for header, cells, and footer — RTL-correct by construction |
| `truncate` | `boolean` | Single-line ellipsis with a `title` tooltip (host vocabulary: `Text.truncate`) |
| `filter` | variant \| config \| render function | Header filter UI — see [filtering.md](filtering.md) |
| `edit` | variant \| config \| render function | Inline cell editing — see [editing.md](editing.md) |
| `headerClassName` | `string` | Extra class on the `<th>` |
| `cellClassName` | `string \| (cell) => string \| undefined` | Extra class on each `<td>`, statically or per cell |

## Width model

Sized columns are fixed pixels; unsized columns grow to share the leftover viewport width. The full width contract (`tableMinWidth`, grow columns, why layout is always fixed) lives in [sizing.md](sizing.md).

### Resizing

```tsx
<DataTable enableColumnResizing … />
```

- Off by default. When on, every resizable column gets a handle on its trailing edge; per-column opt-out is TanStack's own `enableResizing: false` on the def.
- Drags are live and **exactly 1:1**: the pointer session starts from the width the engine actually rendered ([sizing.md](sizing.md#resizing-interplay)), updates are CSS variables, so a drag **never re-renders row components**, and the result is clamped to the column's `minSize`/`maxSize`.
- **Escape cancels** an in-flight drag, restoring the pre-drag width; double-click resets the column to its definition (a grow column returns to growing).
- The drag direction follows the handle's computed `direction` (RTL-correct).
- State rides the `columnSizing` slice (`columnSizing` / `defaultColumnSizing` / `onColumnSizingChange`), persistable via `persistState`.

### Drag reordering

```tsx
<DataTable enableColumnOrdering … />
```

- Off by default. `enableColumnOrdering` is a ledger-owned name: TanStack has `columnOrder` state but no switch for the header affordance.
- Pointer-based, dependency-free: a press becomes a drag after a 5px threshold (so the sortable header label keeps its click), a drop indicator marks the target edge, Escape cancels, and a completed drag suppresses the click that follows.
- Limited to single-row headers — with column groups, sibling order inside a group is ambiguous, so the switch is ignored with a dev-mode warning.
- The injected selection/expander columns cannot be dragged or displaced.
- State rides the `columnOrder` slice, persistable via `persistState`.

### Visibility

`enableHiding` is on by default; per-column opt-out is `enableHiding: false` on the def. Two affordances:

- The per-column menu's "Hide column" item.
- `<DataTable.ColumnsMenu table={table} />` — a checkbox menu of every hideable column that stays open while toggling, plus a "Show all columns" item once anything is hidden.

State rides the `columnVisibility` slice, persistable via `persistState`.

## The per-column menu

`withColumnMenu` (default `true`) reveals a dots trigger on header hover/focus. Each item appears only when the column can actually do it:

- Sort ascending / descending / clear (sortable columns)
- Pin left / right / unpin (pinnable columns — see [pinning.md](pinning.md))
- Group by this column / ungroup (only when `enableGrouping` is on — see [grouping.md](grouping.md))
- Hide column (hideable columns)

The trigger stops propagation, so opening the menu never toggles the header sort and never reaches `onRowClick`.

## Injected columns

Enabling row selection injects a checkbox column (`ledger:select`, 40px); a detail panel or `getSubRows` injects an expander column (`ledger:expander`, 36px). Both are:

- always pinned left, ahead of any user-pinned columns (merged invisibly over the consumer's `columnPinning` slice);
- excluded from sorting, hiding, resizing, filtering, global filtering, grouping, and drag reordering;
- propagation-stopped — a click on a checkbox or expander never fires `onRowClick`.
