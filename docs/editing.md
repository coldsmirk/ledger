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
- `editMode`: `"cell"` (default) edits one cell at a time; `"row"` opens every editable cell of a row at once and commits atomically — see [Row mode](#row-mode).
- Editable cells show a quiet inset outline on hover (`data-editable`) as the affordance.
- A per-row gate refines eligibility: `meta.edit = { variant, enabled: row => … }`.

## Variants

| Variant | Editor | Commit behavior |
| --- | --- | --- |
| `text` | unstyled `TextInput` | Enter / blur commits |
| `number` | unstyled `NumberInput` (`hideControls`); an emptied input commits `null` | Enter / blur commits |
| `select` | unstyled `Select`, dropdown opens immediately | **picking an option commits at once** |
| `checkbox` | none — the cell renders a live checkbox | **toggling commits immediately**, never enters edit mode; validation or rejection is shown inline, and async commits disable it while pending |

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

- `validate(value, row)` runs before commit; a non-null message blocks the commit and shows on the editor (or the live checkbox cell). Returning `null` approves.
- A commit with an **unchanged value** skips `onEditCommit` entirely and just closes the editor. Unchanged against what the application last knew the cell to hold — the value this session wrote while the data has not moved past it, otherwise the data — not against whatever it held when the editor opened.
- If `onEditCommit` returns a **Promise**, the cell enters a pending state (`data-pending`, `aria-busy`, a small loader) until it settles. The built-in variants disable their input for the duration; a **custom editor is not disabled** — the host cannot know what to disable — so it reads the flag from the context it is given and decides for itself. Typing past a request that is still out is supported either way: the write that lands never carried that value, so the editor stays open and whoever was waiting to leave is told it is not safe to. Resolution closes the editor; **rejection returns the cell to editing** with the error message shown — the same presentation as a `validate` failure.
- Commit attempts are idempotent while pending: every caller waits on the same result. A validation failure, synchronous exception, or async rejection reports failure and keeps the current editor mounted; navigation only continues after success.

`onEditCommit` receives `{ row, column, value, previousValue }` — the live TanStack `Row`/`Column` instances plus both values.

## Keyboard and lifecycle

| Key / event | Effect |
| --- | --- |
| F2 (with `enableActiveRow`) | Start editing the current row — its first editable cell in cell mode, the whole row in row mode. What counts as an entry point follows the mode: a `checkbox` column is skipped in cell mode, where toggling *is* the commit and there is no editor to place a caret in, but taken in row mode, where it is a draft-bound editor like any other. The dedicated edit key of the WAI-APG grid pattern; `Enter` is taken here, since it activates the row ([rows.md](rows.md#active-row)) |
| Enter | Commit |
| Escape | Cancel — the pending value is discarded and the editor shows what the row holds again, which after a commit the application declined to close is the value that commit wrote, not the one the session opened on |
| Tab / Shift+Tab | Commit, wait for success, then move to the row's next/previous editable cell (checkbox cells are skipped in shorthand and object form; past the row's edge, editing stops with a commit) |
| Blur | Commit — unless focus moved elsewhere *inside* the editor (e.g. onto a select option) |
| Starting to edit another cell | Commits the cell being left and switches only after success (spreadsheet semantics); if several destinations are requested while pending, the latest one wins |
| No commit handler for the mode | **Read-only.** The commit belongs to the application, so `onEditCommit` (cell mode) or `onRowEditCommit` (row mode) is part of the gate: without it nothing opens, including the live `checkbox` control — an editor that validates, closes "successfully" and writes nothing is worse than a cell that never offered. |
| Losing eligibility mid-edit | **Cancels.** `enableEditing` switching off, `meta.edit` being removed, or `edit.enabled(row)` turning false closes the open editor and drops the draft — committing would push the value through a gate the application has just shut, and past a `validate` that is no longer guarding it. Row mode reads it a column at a time — a column whose gate shuts loses its pending value there and then, and the row ends once a gate has shut and no editable cell is left ([Row mode](#row-mode)). A column merely **gone from the definitions** is a layout change and not a closed gate: the row keeps editing and that draft still commits against the baseline. An async commit already in flight is left to finish — that value passed the gate before it closed — and the cancel completes when it settles, driven by the settlement itself rather than by whatever render happens along. The loss **latches**: a gate that reopens is the next session's eligibility, and the editors do not come back on screen for the cancelled one. An explicit `startEditing` on the same target is that next session, with a fresh baseline |
| Scrolling the editing row out of the virtual window | **Commits** (equivalent to blur), never discards. This is the one carve-out from "a failure keeps the editor": once the editor is unmounted **any** failure — a `validate` rejection, a thrown handler, a rejected promise — has nowhere left to report itself, so it degrades to discard rather than leaving an invisible cell in edit mode. The rows above describe the editor while it is still mounted. |

Event boundaries: on an editable column, the double-click that enters editing does **not** fire `onRowDoubleClick`, and an editing cell swallows clicks so `onRowClick` never fires through it.

## The checkbox variant

Toggling *is* the commit, so a checkbox never enters edit mode and has no session to open or close. What a toggle leaves behind still belongs to the cell rather than to the control that sent it, and the host keeps it there:

- **A toggle departs from what the application last knew**, exactly as `previousValue` means everywhere else — the value this cell has already written while your `data` has not caught up with it, and the data itself once it has. Toggling twice against a handler that has not fed anything back therefore sends `true → false` and then `false → true`, not the same change twice. The record retires for good the moment the data moves — your write applied, normalized, or somebody else's edit — including while the write is still in flight, so data that leaves and returns during the request leaves nothing for it to be true about.
- **The pending write, and the failure it comes back with, survive the control.** Hiding the column, a responsive breakpoint removing it, or a virtual scroll taking the row off screen unmounts the checkbox; none of them is the write landing. It comes back still disabled if its write is still out (so a second click cannot send a second write), and a rejection that arrived while it was away is shown when it returns.
- **Any number of cells can have a write out at once.** Each one's pending, failure and record are its own: a second checkbox never joins the first's request, and a failure lands only on the cell that sent it.
- **A toggle re-reads the gate.** `edit.enabled(row)` is your function, and nothing makes it answer the same way twice — a click can be the first thing to learn the gate has shut, with no render in between. Nothing is sent then, and nothing is left behind: no write, no pending, no record for the next toggle to depart from.
- **A gate that shuts behind a write latches.** The write passed before it shut and is left to land — but the failure it may come back with has nowhere left to be shown, and a gate that reopens is not a reprieve for it. This is the same rule the editor sessions follow when nothing is left mounted to report a failure to.

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

The context is `DataTableEditContext`: `row`, `column`, the draft `value`, `setValue`, `commit`, `cancel`, the current `error`, and `pending` — true while a write for this editor is still out, so an editor that wants to disable itself, or show its own indicator, can. `commit()` returns `boolean | Promise<boolean>` — `true` means it is safe to leave the cell; `false` means validation or the application commit failed. The host still provides the keyboard map, blur-commit, pending state, and lifecycle above — the function only replaces the input.

## Row mode

`editMode: "row"` turns a row into one open form: clicking (or double-clicking, per `editTrigger`) any editable cell opens **every** editable cell of that row, and the row commits or cancels as a unit.

```tsx
<DataTable
  editMode="row"
  onRowEditCommit={async ({ row, values, previousValues }) => {
    await api.updatePerson(row.original.id, values);
  }}
  …
/>
```

- **Keyboard**: `Enter` commits the whole row, `Escape` cancels it, `Tab` moves between the row's editors natively (they are all mounted). Blur never commits — the atomic commit is deliberate, not incidental.
- **Commit**: every editable column's `validate` runs first; the first failure focuses its editor, shows the message there, and blocks the row. Then `onRowEditCommit({ row, values, previousValues })` receives every editable column's value (drafts where the user typed, unchanged values elsewhere). A rejected promise keeps the row editing with the message on whichever editable column has an editor on screen to show it — the failure belongs to the session, so one that is hidden or scrolled away when it arrives shows it when it comes back; editors show a pending state while an async commit is in flight, and further commit requests join that one rather than issuing a second write. A commit that settles after its row was cancelled or replaced has already reached your handler, and nothing here can recall a write it made: what is ignored is its settlement's effect on the current editing session — it never closes the row that took its place, and its error never lands on that row's fields.
- **A column that changes mid-edit** is resolved by what became of it — unless `enableEditing` itself went off, which drops the whole row's drafts before any of the cases below are considered. Merely hidden (`columnVisibility`, or its editor unmounted by virtualization) — the draft still commits and still validates, because the column and its definition are both still there. **No longer editable** (`meta.edit` removed, or `edit.enabled(row)` now false) — the draft is dropped: promoting it would push a value through a gate the application just closed, unvalidated. **Gone from the definitions** (a responsive `hiddenFrom` / `visibleFrom` breakpoint removes the column before TanStack sees it) — the draft commits against the last previous value the session saw for that column, which is refreshed every time the session sees it — so an external change that landed while the column was still on screen is what the commit departs from — and it is the one case where `validate` cannot run, because the definition that carried it no longer exists.
- **Drafts survive virtualization**: the controller owns the draft store, so an editing row that scrolls out of the virtual window and back keeps its pending values. The store belongs to exactly one row and follows the row that rendered — including when `editingRowId` is moved from outside — so editors never read a neighbour's pending values. Cancelling discards the whole pending edit and puts the mounted editors back to what the row holds.
- **A session remembers its own writes** (both modes). A successful commit takes back the pending values it carried and records them instead, so a repeated `stopEditing` sends nothing, a second commit departs from the value already written rather than from `data` that has not caught up with it, and cancelling restores that value rather than a stale one. The record is dropped for good the moment the data moves — your write applied, your write normalized, or somebody else's edit — including while the write is still in flight, so data that moves away and back again during the request leaves nothing for it to be true about — and from then on `data` is what the row holds and what its editors show, including a value that later returns to what the write departed from. This matters whenever the row outlives its own commit: a controlled `editingRowId` the application declines to close, or a `data` update that arrives on its own schedule. `previousValues` therefore means *what the application last knew the column to hold*, which is the value the row is editing away from — not what it held when the row first opened.
- Starting another row first commits the current one (commit, never discard) — the switch only happens if that commit succeeds.
- The `checkbox` variant becomes a draft-bound checkbox inside the row (its cell-mode toggle-commits-immediately behavior belongs to cell mode); the `select` variant no longer commits on choose, and does not auto-open its dropdown.
- Custom editors receive the same `DataTableEditContext` — in row mode its `commit`/`cancel` operate on the whole row, `pending` is the row's write rather than one cell's, and `commit` answers with the row's real result: every editable column's `validate`, then the application's handler.
- The editing row renders `data-editing-row` (a primary wash with hairlines above and below).
- Row mode ignores `onEditCommit` and the `editingCell` slice (dev warnings point to the row-mode counterparts).

## Programmatic control

- The `editingCell` slice (`{ rowId, columnId } | null`) is controllable: `editingCell` / `onEditingCellChange`. Row mode tracks `editingRowId` / `onEditingRowIdChange` instead. These ledger-owned slices have no `default*` (a default editing target is meaningless).
- These slices are controlled like any other, so `startEditing` / `stopEditing` and every keyboard or click trigger *request* the change through `onEditingCellChange` / `onEditingRowIdChange`. An application that answers with a different target, or leaves the prop where it was, keeps what it named on screen — and in row mode that row stays the one being edited: the session, its in-flight commit and its drafts all follow what rendered, never what was asked for. An editor left on screen this way stays a live editor in both modes: the next value typed into it is a new edit, and committing it sends it.
- **A commit that settles behind a newer value keeps the editor.** A custom editor is not disabled while an async commit is in flight, so the user can type straight past it; the write that lands never carried what they typed. The row (or cell) stays open, and whoever was waiting to leave it — `startEditing` moving on, Tab moving to the next cell — is told it is not safe to. The one exception is an editor unmounted meanwhile: nobody can commit it by hand any more, so the outrun value is sent after the write it outran, per commit-never-discards.
- The imperative handle exposes `startEditing(rowId, columnId?)` — cell mode requires the column; row mode takes any editable column to focus, or none — and `stopEditing({ commit? })` (default `commit: true`) — see [api.md](api.md#imperative-handle).
