# Columns

Columns are **raw TanStack `ColumnDef`s** — ledger has no bespoke column DSL. Every column-level TanStack capability (`sortFn`, `sortDescFirst`, `sortUndefined`, `invertSorting`, `filterFn`, `aggregationFn`, `size`/`minSize`/`maxSize`, per-column `enable*`) is therefore automatically present, and knowledge transfers directly from TanStack's docs. Presentation concerns ride the typed `meta` extension described below.

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
| `export` | `false \| { header?, value? }` | Exclude from or reshape the CSV export ([api.md](api.md#tocsv)) |
| `hiddenFrom` / `visibleFrom` | `MantineBreakpoint` | Breakpoint-driven presence — see [Responsive columns](#responsive-columns) |

## Width model

Sized columns are fixed pixels; unsized columns grow to share the leftover viewport width. The full width contract (`tableMinWidth`, grow columns, why layout is always fixed) lives in [sizing.md](sizing.md).

### Resizing

```tsx
<DataTable enableColumnResizing … />
```

- Off by default. When on, every resizable column gets a handle on its trailing edge; per-column opt-out is TanStack's own `enableResizing: false` on the def.
- Drags are live and **exactly 1:1**: the pointer session starts from the width the engine actually rendered ([sizing.md](sizing.md#resizing-interplay)), updates are CSS variables, so a drag **never re-renders row components**, and the result is clamped to the column's `minSize`/`maxSize`.
- **Escape or a pointercancel cancels** an in-flight drag, restoring the pre-drag width.
- **Double-click fits the column to its content**: the header and every rendered body cell are measured (under virtualization that is the current window — unrendered rows have no boxes to measure) and the result is clamped like a drag. The definition width stays reachable through the columns panel's width reset.
- The drag direction follows the handle's computed `direction` (RTL-correct).
- State rides the `columnSizing` slice (`columnSizing` / `defaultColumnSizing` / `onColumnSizingChange`), persistable via `persistState`.

### Drag reordering

```tsx
<DataTable enableColumnOrdering … />
```

- Off by default. `enableColumnOrdering` is a ledger-owned name: TanStack has `columnOrder` state but no switch for the affordance. It turns on **both** reordering affordances — the header drag and the columns panel's drag handles.
- The header drag is pointer-based and dependency-free: a press becomes a drag after a 5px threshold (so the sortable header label keeps its click), a drop indicator marks the target edge, Escape cancels, and a completed drag suppresses the click that follows.
- Limited to single-row headers — with column groups, sibling order inside a group is ambiguous, so the switch is ignored with a dev-mode warning.
- The injected selection/expander columns cannot be dragged or displaced.
- State rides the `columnOrder` slice, persistable via `persistState`.

### Visibility

`enableHiding` is on by default; per-column opt-out is `enableHiding: false` on the def, which renders the panel's checkbox disabled rather than dropping the row. State rides the `columnVisibility` slice, persistable via `persistState`.

### Responsive columns

`meta.hiddenFrom` and `meta.visibleFrom` carry the host's own `Box` vocabulary onto columns: `hiddenFrom: "sm"` removes the column at and above the `sm` breakpoint, `visibleFrom: "md"` shows it only from `md` up. Breakpoint values resolve from the Mantine theme (its published `--mantine-breakpoint-*` variables, falling back to the stock scale).

```tsx
helper.accessor("contact", { header: "Contact", meta: { visibleFrom: "md" } }),
helper.accessor("age",     { header: "Age",     meta: { hiddenFrom: "sm" } }),
```

An off-breakpoint column is removed from the definitions before TanStack sees them, so the width engine redistributes, the colgroup follows, and the columns panel lists only what the viewport can show. Column state keyed by id — `columnVisibility`, ordering, persisted layout — is untouched and reapplies when the column returns. Where `matchMedia` does not exist (SSR first paint, some test environments) every column stays visible.

## The columns panel

`<DataTable.ColumnsPanel table={table} />` is the single surface for every column-layout decision. One row per leaf column, in the table's display order, each control appearing only when the column can actually do it:

| Control | Appears when | Writes |
| --- | --- | --- |
| Drag handle | `enableColumnOrdering`, single-row headers | `columnOrder` / `columnPinning` |
| Visibility checkbox | always (disabled where `getCanHide()` is false) | `columnVisibility` |
| Pin start / unpin / pin end | `enableColumnPinning` ([pinning.md](pinning.md)) | `columnPinning` |
| Width | `enableColumnResizing` ([sizing.md](sizing.md#the-panels-width-control)) | `columnSizing` |
| Group / ungroup | `enableGrouping` ([grouping.md](grouping.md)) | `grouping` |

**Hidden columns stay listed** — that is the point of the panel. Their checkbox is simply unchecked and their name dims, so a column can always come back.

**At rest a row is identity, not machinery.** The resting panel shows the checkbox, the name, and dimmed marks only where the layout deviates from default — an overridden width as a small number, a grouped column's glyph, a hidden column's dimmed name. The controls themselves — drag handle, width field, three-state pin segment, group toggle — reveal as a toolbar over the hovered or keyboard-focused row, so resting names get the full row width. The reveal is stylesheet-only: every control is always in the DOM and the accessibility tree, and where hover does not exist (`hover: none` media) the toolbar sits inline permanently.

**Reset** restores order, visibility, pinning, and width — exactly the layout set `persistState` persists by default — to what the application declared through `defaultColumnOrder` / `defaultColumnVisibility` / `defaultColumnPinning` / `defaultColumnSizing`, falling back to the column definitions' own layout. Grouping is not layout and is left alone.

Rows are grouped into three zones in display order — pinned start, unpinned, pinned end (TanStack v9's logical positions). An occupied pinned zone carries a caption (the `pinnedStart` / `pinnedEnd` labels) and consecutive zones get a seam; nothing pinned means one flat list with no chrome at all. **Dragging reorders within a zone only**: a pinned column's position comes from its index in `columnPinning`, an unpinned one's from `columnOrder`, so the two are different edits. Moving a column between zones is what the pin controls are for.

### The trigger is yours

The panel makes **no assumption about what opens it**. `children` is the trigger, wrapped as the Popover target:

```tsx
<DataTable.ColumnsPanel table={table}>
  <Button leftSection={<IconColumns />}>Columns</Button>
</DataTable.ColumnsPanel>
```

Pass no children and the panel renders **bare** — its primary shape, ready for a drawer, a sidebar, or a settings page of its own:

```tsx
<Drawer opened={opened} onClose={close} title="Columns">
  <DataTable.ColumnsPanel table={table} />
</Drawer>
```

`popoverProps` forwards to the Popover (position, width, `withinPortal`, …) and is ignored without a trigger. The dropdown caps itself at `60vh` and the panel's list scrolls inside it; bare, the panel fills whatever box its host gives it and degrades to content height in an indefinite one.

For a trigger inside a header cell — a cog beside an actions column's title — put it on a column that **cannot sort**: a sortable header *is* a `<button>` covering the whole cell, and nesting a control inside it is invalid HTML. A `helper.display({ … })` column never sorts, so its header is a plain box. One v9 note: header renderers receive the **core** table shape, while the panel's prop is typed as the hook's `TableInstance` — assert it across (the runtime object is the same instance family, and the panel only touches the surface the two share):

```tsx
helper.display({
  id: "actions",
  header: ({ table }) => (
    <DataTable.ColumnsPanel table={table as TableInstance<Person>}>
      <ActionIcon variant="subtle"><IconSettings /></ActionIcon>
    </DataTable.ColumnsPanel>
  ),
  cell: ({ row }) => <RowActions row={row} />
})
```

## Injected columns

Enabling row selection injects a checkbox column (`ledger:select`, 40px); a detail panel or `getSubRows` injects an expander column (`ledger:expander`, 36px). Both are:

- always pinned to the start, ahead of any user-pinned columns (merged invisibly over the consumer's `columnPinning` slice);
- excluded from sorting, hiding, resizing, filtering, global filtering, grouping, and drag reordering;
- propagation-stopped — a click on a checkbox or expander never fires `onRowClick`.
