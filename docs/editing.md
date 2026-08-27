# Inline editing

Cells become editable by declaring `meta.edit` on their column. **Rendering the editor belongs to the application** — `meta.edit` is a render function over the editing context, and the shipped `textEditor` / `numberEditor` / `selectEditor` / `checkboxEditor` helpers are ordinary renderers of that same shape, conveniences rather than the mechanism. **Data ownership never moves either**: ledger never mutates `data` — a commit hands the change to the application through `onEditCommit`, which updates its own store (optimistically or after an API call) and flows new `data` back down.

```tsx
import { checkboxEditor, numberEditor, selectEditor, textEditor } from "@coldsmirk/ledger-mantine";

const columns = [
  helper.accessor("name",   { header: "Name",   meta: { edit: textEditor() } }),
  helper.accessor("age",    { header: "Age",    meta: { edit: numberEditor() } }),
  helper.accessor("role",   { header: "Role",   meta: { edit: selectEditor(roles) } }),
  helper.accessor("active", { header: "Active", meta: { edit: { instant: checkboxEditor() } } })
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
- A per-row gate refines eligibility: `meta.edit = { render, enabled: row => … }`.

## Editors

`meta.edit` takes one of three forms, and which one is which interaction model:

- **a renderer** — `(ctx: DataTableEditContext) => ReactNode`: a session editor, opened by the trigger and closed by its commit or cancel;
- **`{ render, enabled?, validate? }`** — the same session editor carrying its gates;
- **`{ instant, enabled?, validate? }`** — an instant-apply control living in the cell itself, no session and no trigger: each change is one commit. See [Instant editing](#instant-editing).

The division of labor is fixed: **the host owns the session, the renderer owns the control.** The keyboard map, blur commit, draft store, pending state, and the whole lifecycle below are the host's regardless of what the function returns — it only replaces the input.

```tsx
meta: {
  edit: ({ value, setValue, commit, cancel, error, label }) => (
    <ColorSwatchPicker
      aria-label={label}
      value={value as string}
      onChange={next => setValue(next)}
      onDone={commit}
      onAbort={cancel}
      error={error}
    />
  )
}
```

The context is `DataTableEditContext`:

| Field | Meaning |
| --- | --- |
| `row`, `column` | The live TanStack instances |
| `value` | The draft — what the session currently holds |
| `setValue(value)` | Writes the draft (it survives a virtualized unmount; the store is the controller's) |
| `commit()` | Returns `boolean \| Promise<boolean>` — `true` means it is safe to leave the cell; `false` means validation or the application commit failed. In row mode, commits the whole row |
| `cancel()` | Discards the draft; in row mode, cancels the whole row |
| `error` | The current validation or commit failure, to present |
| `pending` | A write for this editor is still out — the host cannot know what to disable, so the renderer reads the flag and decides |
| `mode` | `"cell"` or `"row"` — a renderer may adapt (the select helper opens its dropdown and commits on pick only in cell mode) |
| `autoFocus` | Whether to take focus on mount: always in cell mode, only the entry column in row mode |
| `label` | The localized accessible name (`labels.editColumn` over the column title) — one of many identical controls in the grid, told apart by the column it edits |

### The shipped editors

Each is implemented purely on the public context above — proof the context suffices, and the reference for writing your own. All render borderless Mantine inputs filling the cell (a boxed input inside a table cell is visual noise) and honor `autoFocus`, `pending`, `error`, and `label`.

| Helper | Control | Commit behavior |
| --- | --- | --- |
| `textEditor()` | unstyled `TextInput` | Enter / blur commits |
| `numberEditor()` | unstyled `NumberInput` (`hideControls`); an emptied input holds `null` | Enter / blur commits |
| `selectEditor(options)` | unstyled `Select`; in cell mode the dropdown opens immediately | **picking an option commits at once** in cell mode; a draft-bound field in row mode |
| `checkboxEditor()` | a live checkbox — an **instant** renderer: `edit: { instant: checkboxEditor() }` | **each toggle commits immediately**; never enters edit mode |

## Validation and async commits

```tsx
meta: {
  edit: {
    render: numberEditor(),
    validate: (value, row) => (typeof value === "number" && value >= 0 ? null : "必须是非负数")
  }
}
```

- `validate(value, row)` runs before commit for **any** renderer — it rides the config, not the control, because it is the session's gate rather than a property of what is rendered. A non-null message blocks the commit and shows on the editor (or the instant cell). Returning `null` approves.
- A commit with an **unchanged value** skips `onEditCommit` entirely and just closes the editor. Unchanged against what the application last knew the cell to hold — the value this session wrote while the data has not moved past it, otherwise the data — not against whatever it held when the editor opened.
- If `onEditCommit` returns a **Promise**, the cell enters a pending state (`data-pending`, `aria-busy`, a small loader) until it settles. The shipped editors disable their input for the duration; **no renderer is disabled by the host** — it cannot know what to disable — so a custom one reads `pending` from its context and decides for itself. Typing past a request that is still out is supported either way: the write that lands never carried that value, so the editor stays open and whoever was waiting to leave is told it is not safe to. Resolution closes the editor; **rejection returns the cell to editing** with the error message shown — the same presentation as a `validate` failure.
- Commit attempts are idempotent while pending: every caller waits on the same result. A validation failure, synchronous exception, or async rejection reports failure and keeps the current editor mounted; navigation only continues after success.

`onEditCommit` receives `{ row, column, value, previousValue }` — the live TanStack `Row`/`Column` instances plus both values.

## Keyboard and lifecycle

| Key / event | Effect |
| --- | --- |
| F2 (with `enableActiveRow`) | Start editing the current row — its first editable cell in cell mode, the whole row in row mode. What counts as an entry point follows the mode: an instant column is skipped in cell mode, where a change *is* the commit and there is no editor to place a caret in, but taken in row mode, where it is a draft-bound editor like any other. The dedicated edit key of the WAI-APG grid pattern; `Enter` is taken here, since it activates the row ([rows.md](rows.md#active-row)) |
| Enter | Commit |
| Escape | Cancel — the pending value is discarded and the editor shows what the row holds again, which after a commit the application declined to close is the value that commit wrote, not the one the session opened on |
| Tab / Shift+Tab | Commit, wait for success, then move to the row's next/previous editable cell (instant columns are skipped; past the row's edge, editing stops with a commit) |
| Blur | Commit — unless focus moved elsewhere *inside* the editor (e.g. onto a select option) |
| Starting to edit another cell | Commits the cell being left and switches only after success (spreadsheet semantics); if several destinations are requested while pending, the latest one wins |
| No commit handler for the mode | **Read-only.** The commit belongs to the application, so `onEditCommit` (cell mode) or `onRowEditCommit` (row mode) is part of the gate: without it nothing opens, including the live instant controls — an editor that validates, closes "successfully" and writes nothing is worse than a cell that never offered. |
| Losing eligibility mid-edit | **Cancels.** `enableEditing` switching off, `meta.edit` being removed, or `edit.enabled(row)` turning false closes the open editor and drops the draft — committing would push the value through a gate the application has just shut, and past a `validate` that is no longer guarding it. Row mode reads it a column at a time — a column whose gate shuts loses its pending value there and then, and the row ends once a gate has shut and no editable cell is left ([Row mode](#row-mode)). A column merely **gone from the definitions** is a layout change and not a closed gate: the row keeps editing and that draft still commits against the baseline. An async commit already in flight is left to finish — that value passed the gate before it closed — and the cancel completes when it settles, driven by the settlement itself rather than by whatever render happens along. The loss **latches**: a gate that reopens is the next session's eligibility, and the editors do not come back on screen for the cancelled one. An explicit `startEditing` on the same target is that next session, with a fresh baseline |
| Scrolling the editing row out of the virtual window | **Commits** (equivalent to blur), never discards. This is the one carve-out from "a failure keeps the editor": once the editor is unmounted **any** failure — a `validate` rejection, a thrown handler, a rejected promise — has nowhere left to report itself, so it degrades to discard rather than leaving an invisible cell in edit mode. The rows above describe the editor while it is still mounted. |

Event boundaries: on an editable column, the double-click that enters editing does **not** fire `onRowDoubleClick`, and an editing cell swallows clicks so `onRowClick` never fires through it.

## Instant editing

`{ instant: renderer }` declares an instant-apply control (the HIG term: instant-apply, as opposed to the explicit-apply of a session): the control lives in the cell itself, and each change it reports through `ctx.commit(value)` is one commit — validation, the application handler, pending, and failure presentation all run exactly as a session commit's would. There is no session to open and no trigger to wait for; the host still owns the chrome — the pending loader, the failure alert, and the click fences that keep `onRowClick` out.

```tsx
meta: {
  edit: {
    instant: ({ value, commit, pending, label }) => (
      <Switch
        aria-label={label}
        checked={Boolean(value)}
        disabled={pending}
        onChange={event => commit(event.currentTarget.checked)}
      />
    )
  }
}
```

The context is `DataTableInstantEditContext`: `row`, `column`, `value` (what the cell holds as far as the application knows), `commit(value)` (returning `boolean | Promise<boolean>` like a session commit), `pending`, `error`, and `label`. The shipped `checkboxEditor()` is one of these renderers; a `Switch`, a rating control, or a segmented picker fits the same contract unchanged.

What a commit leaves behind still belongs to the cell rather than to the control that sent it, and the host keeps it there:

- **A commit departs from what the application last knew**, exactly as `previousValue` means everywhere else — the value this cell has already written while your `data` has not caught up with it, and the data itself once it has. Toggling a checkbox twice against a handler that has not fed anything back therefore sends `true → false` and then `false → true`, not the same change twice. The record retires for good the moment the data moves — your write applied, normalized, or somebody else's edit — including while the write is still in flight, so data that leaves and returns during the request leaves nothing for it to be true about.
- **The pending write, and the failure it comes back with, survive the control.** Hiding the column, a responsive breakpoint removing it, or a virtual scroll taking the row off screen unmounts the control; none of them is the write landing. It comes back still pending if its write is still out (so a second change cannot send a second write), and a rejection that arrived while it was away is shown when it returns.
- **Any number of cells can have a write out at once.** Each one's pending, failure and record are its own: a second control never joins the first's request, and a failure lands only on the cell that sent it.
- **A commit re-reads the gate.** `edit.enabled(row)` is your function, and nothing makes it answer the same way twice — a change can be the first thing to learn the gate has shut, with no render in between. Nothing is sent then, and nothing is left behind: no write, no pending, no record for the next commit to depart from.
- **A gate that shuts behind a write latches.** The write passed before it shut and is left to land — but the failure it may come back with has nowhere left to be shown, and a gate that reopens is not a reprieve for it. This is the same rule the editor sessions follow when nothing is left mounted to report a failure to.

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
- An **instant column joins the row with the same renderer**: its `commit(value)` stages the value in the row draft instead of writing — "this control is done with this value", and the mode decides what done means, so the atomic row commit owns the write. The select helper likewise stops committing on choose and does not auto-open its dropdown (it reads `ctx.mode`).
- Session renderers receive the same `DataTableEditContext` — in row mode its `commit`/`cancel` operate on the whole row, `pending` is the row's write rather than one cell's, and `commit` answers with the row's real result: every editable column's `validate`, then the application's handler.
- The editing row renders `data-editing-row` (a primary wash with hairlines above and below).
- Row mode ignores `onEditCommit` and the `editingCell` slice (dev warnings point to the row-mode counterparts).

## Programmatic control

- The `editingCell` slice (`{ rowId, columnId } | null`) is controllable: `editingCell` / `onEditingCellChange`. Row mode tracks `editingRowId` / `onEditingRowIdChange` instead. These ledger-owned slices have no `default*` (a default editing target is meaningless).
- These slices are controlled like any other, so `startEditing` / `stopEditing` and every keyboard or click trigger *request* the change through `onEditingCellChange` / `onEditingRowIdChange`. An application that answers with a different target, or leaves the prop where it was, keeps what it named on screen — and in row mode that row stays the one being edited: the session, its in-flight commit and its drafts all follow what rendered, never what was asked for. An editor left on screen this way stays a live editor in both modes: the next value typed into it is a new edit, and committing it sends it.
- **A commit that settles behind a newer value keeps the editor.** A custom editor is not disabled while an async commit is in flight, so the user can type straight past it; the write that lands never carried what they typed. The row (or cell) stays open, and whoever was waiting to leave it — `startEditing` moving on, Tab moving to the next cell — is told it is not safe to. The one exception is an editor unmounted meanwhile: nobody can commit it by hand any more, so the outrun value is sent after the write it outran, per commit-never-discards.
- The imperative handle exposes `startEditing(rowId, columnId?)` — cell mode requires the column; row mode takes any editable column to focus, or none — and `stopEditing({ commit? })` (default `commit: true`) — see [api.md](api.md#imperative-handle).
