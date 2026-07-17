# Inline editing

Cells become editable by declaring `meta.edit` on their column. **Data ownership never moves**: ledger never mutates `data` — a commit hands the change to the application through `onEditCommit`, which updates its own store (optimistically or after an API call) and flows new `data` back down.

```tsx
const columns = [
  helper.accessor("name",   { header: "Name",   meta: { edit: "text" } }),
  helper.accessor("age",    { header: "Age",    meta: { edit: "number" } }),
  helper.accessor("role",   { header: "Role",   meta: { edit: { variant: "select", options: roles } } }),
  helper.accessor("active", { header: "Active", meta: { edit: "checkbox" } })
];

<DataTable
  columns={columns}
  data={people}
  getRowId={person => person.id}
  onEditCommit={async ({ row, column, value }) => {
    await api.patchPerson(row.original.id, { [column.id]: value });
    refetch();
  }}
/>
```

## Switches and triggers

- `enableEditing` (default `true`) is the table-level master switch — columns still opt in via `meta.edit`, and `enableEditing={false}` renders the same defs read-only.
- `editTrigger`: `"double-click"` (default) or `"click"` starts editing on the corresponding cell event.
- Editable cells show a quiet inset outline on hover (`data-editable`) as the affordance.
- A per-row gate refines eligibility: `meta.edit = { variant, enabled: row => … }`.

## Variants

| Variant | Editor | Commit behavior |
| --- | --- | --- |
| `text` | unstyled `TextInput` | Enter / blur commits |
| `number` | unstyled `NumberInput` (`hideControls`); an emptied input commits `null` | Enter / blur commits |
| `select` | unstyled `Select`, dropdown opens immediately | **picking an option commits at once** |
| `checkbox` | none — the cell renders a live checkbox | **toggling commits immediately**, never enters edit mode |

Editors are borderless Mantine inputs filling the cell (a boxed input inside a table cell is visual noise) and focus automatically.

## Validation and async commits

```tsx
meta: {
  edit: {
    variant: "number",
    validate: (value, row) => (typeof value === "number" && value >= 0 ? null : "必须是非负数")
  }
}
```

- `validate(value, row)` runs before commit; a non-null message blocks the commit and shows on the editor. Returning `null` approves.
- A commit with an **unchanged value** (`Object.is` against the value at edit start) skips `onEditCommit` entirely and just closes the editor.
- If `onEditCommit` returns a **Promise**, the cell enters a pending state (disabled input, small loader, `data-pending`, `aria-busy`) until it settles. Resolution closes the editor; **rejection returns the cell to editing** with the error message shown — the same presentation as a `validate` failure.

`onEditCommit` receives `{ row, column, value, previousValue }` — the live TanStack `Row`/`Column` instances plus both values.

## Keyboard and lifecycle

| Key / event | Effect |
| --- | --- |
| Enter | Commit |
| Escape | Cancel (restore the original value) |
| Tab / Shift+Tab | Commit, then move to the row's next/previous editable cell (checkbox cells are skipped; past the row's edge, editing stops with a commit) |
| Blur | Commit — unless focus moved elsewhere *inside* the editor (e.g. onto a select option) |
| Starting to edit another cell | Commits the cell being left (spreadsheet semantics) |
| Scrolling the editing row out of the virtual window | **Commits** (equivalent to blur), never discards — a validation failure has nowhere left to display and degrades to discard |

Event boundaries: on an editable column, the double-click that enters editing does **not** fire `onRowDoubleClick`, and an editing cell swallows clicks so `onRowClick` never fires through it.

## Custom editors

`meta.edit` accepts a render function receiving the full editing context:

```tsx
meta: {
  edit: ({ value, setValue, commit, cancel, error }) => (
    <ColorSwatchPicker
      value={value as string}
      onChange={next => setValue(next)}
      onDone={commit}
      onAbort={cancel}
      error={error}
    />
  )
}
```

The context is `DataTableEditContext`: `row`, `column`, the draft `value`, `setValue`, `commit`, `cancel`, and the current `error`. The host still provides the keyboard map, blur-commit, pending state, and lifecycle above — the function only replaces the input.

## Programmatic control

- The `editingCell` slice (`{ rowId, columnId } | null`) is controllable: `editingCell` / `onEditingCellChange`. It is the only non-TanStack state slice and has no `default*` (a default editing cell is meaningless).
- The imperative handle exposes `startEditing(rowId, columnId)` and `stopEditing({ commit? })` (default `commit: true`) — see [api.md](api.md#imperative-handle).
