import type { KeyboardEvent } from "react";

import type { Cell, DataTableEditConfig } from "./types";

/**
 * The inline cell editor host (docs/editing.md). Owns the draft value, validation, and the
 * async commit lifecycle; registers itself with the editing controller so `stopEditing` and
 * cell-switch commits reach it; commits (never discards) when unmounted mid-edit by virtual
 * scrolling. Editors are unstyled Mantine inputs filling the cell — a boxed input inside a
 * table cell is visual noise.
 */
import { Loader, NumberInput, Select, TextInput } from "@mantine/core";
import { useLayoutEffect, useReducer, useRef } from "react";

import { columnHeaderText } from "./build-columns";
import { useDataTableContext } from "./context";
import { canEditCell, isCheckboxEdit, normalizeEdit } from "./edit-meta";
import { isPromiseLike, useEventCallback } from "./utils";

export { canEditCell, editErrorMessage, isCheckboxEdit, normalizeEdit } from "./edit-meta";

type CommitResult = boolean | Promise<boolean>;

export function CellEditor({ cell }: { cell: Cell<any, unknown> }) {
  const { labels, getStyles } = useDataTableContext();
  const { table } = cell.getContext();
  const editing = table.options.meta?.ledger?.editing;
  const normalized = normalizeEdit(cell.column.columnDef.meta?.edit);
  const rowId = cell.row.id;
  const columnId = cell.column.id;

  const [, redraw] = useReducer((token: number) => token + 1, 0);
  const redrawFromSession = useEventCallback(() => redraw());

  // Layout, not passive: the registry is what "on screen right now" means to the session, and a
  // commit that unmounts this editor is followed by microtasks — a settling write among them —
  // long before a passive cleanup would run.
  useLayoutEffect(
    () => editing?.register(rowId, columnId, { redraw: redrawFromSession }),
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- registration is a mount/unmount pairing; handlers are stable
    []
  );

  if (!normalized || !editing) {
    return null;
  }

  const draft = editing.drafts.read(rowId, columnId, cell.getValue());
  const editError = editing.drafts.error(rowId, columnId);
  const pending = editing.drafts.pending(rowId, columnId);

  const setValue = (value: unknown) => {
    editing.drafts.write(rowId, columnId, value);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case "Enter": {
        event.preventDefault();
        void editing.commit();

        break;
      }

      case "Escape": {
        event.preventDefault();
        event.stopPropagation();
        editing.cancel();

        break;
      }

      case "Tab": {
        event.preventDefault();
        const result = editing.commit();

        if (isPromiseLike(result)) {
          void Promise.resolve(result).then(succeeded => {
            if (succeeded) {
              moveToAdjacentEditableCell(cell, event.shiftKey);
            }
          });
        } else if (result) {
          moveToAdjacentEditableCell(cell, event.shiftKey);
        }

        break;
      }
    // No default
    }
  };

  const editor
    = normalized.kind === "custom"
      ? normalized.render({
          row: cell.row,
          column: cell.column,
          value: draft,
          setValue,
          commit: () => editing.commit(),
          cancel: () => editing.cancel(),
          error: editError
        })
      : (
          <VariantEditor
            config={normalized.config}
            draft={draft}
            error={editError}
            name={labels.editColumn(columnHeaderText(cell.column))}
            pending={pending}
            onCommit={() => editing.commit()}
            onValueChange={setValue}
          />
        );

  return (
    <div
      aria-busy={pending || undefined}
      aria-label={pending ? labels.editPending : undefined}
      data-pending={pending || undefined}
      onBlur={event => {
        // Blur commits — unless focus moved elsewhere inside the editor (e.g. a select option).
        if (!event.currentTarget.contains(event.relatedTarget)) {
          editing.commit();
        }
      }}
      onClick={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      {...getStyles("cellEditor")}
    >
      {editor}
      {pending && <Loader size={12} />}
    </div>
  );
}

/**
 * The row-mode editor host (docs/editing.md#row-mode): one per editable cell of the editing
 * row, all mounted at once. Drafts write through to the controller's store (they must survive
 * a virtualized unmount), blur never commits, and Enter/Escape commit or cancel the whole row.
 */
export function RowCellEditor({ cell }: { cell: Cell<any, unknown> }) {
  const { labels, getStyles } = useDataTableContext();
  const { table } = cell.getContext();
  const editing = table.options.meta?.ledger?.editing;
  const rowApi = editing?.row;
  const normalized = normalizeEdit(cell.column.columnDef.meta?.edit);
  const columnId = cell.column.id;
  const rowId = cell.row.id;

  // The store is the value, not a copy of it: what the row holds moves under an open editor —
  // the application feeds a write back, normalizes it, or the controller throws the edit away —
  // and local state would go on showing a value the row had already left behind. Rendering is
  // the only thing left to ask for.
  const [, redraw] = useReducer((token: number) => token + 1, 0);
  const draft = rowApi ? rowApi.drafts.read(rowId, columnId, cell.getValue()) : cell.getValue();
  const editError = rowApi?.drafts.error(rowId, columnId) ?? null;
  const pending = rowApi?.drafts.pending(rowId) ?? false;
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Ref-read, not consumed — StrictMode's remount and virtualizer round-trips keep the focus.
  const autoFocus = rowApi?.shouldFocus(columnId) ?? false;

  const setValue = useEventCallback((value: unknown) => {
    rowApi?.drafts.write(rowId, columnId, value);
    redraw();
  });

  /**
   * Everything this editor shows lives in the session, so a change there is answered by drawing
   * again — there is nothing here to put back.
   */
  const redrawFromSession = useEventCallback(() => redraw());

  // Layout, not passive: the registry is what "on screen right now" means to the session, and a
  // commit that unmounts this editor is followed by microtasks — a settling write among them —
  // long before a passive cleanup would have run. A registration that outlives its DOM would put
  // a failure on a column nobody can see.
  useLayoutEffect(() => {
    const unregister = rowApi?.register(columnId, {
      focus: () => containerRef.current
        ?.querySelector<HTMLElement>(":scope input, :scope select, :scope textarea, :scope button")
        ?.focus(),
      redraw: redrawFromSession
    });

    return unregister;
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- registration is a mount/unmount pairing; handlers are stable
  }, []);

  if (!normalized || !editing) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    // An inner control that consumed the key (a select picking its option) keeps it.
    if (event.defaultPrevented) {
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      editing.row.stop({ commit: true });
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      editing.row.stop({ commit: false });
    }
  };

  const editor
    = normalized.kind === "custom"
      ? normalized.render({
          row: cell.row,
          column: cell.column,
          value: draft,
          setValue,
          // Row mode: commit/cancel operate on the whole row, matching the keyboard map.
          commit: () => {
            editing.row.stop({ commit: true });
            return true;
          },
          cancel: () => editing.row.stop({ commit: false }),
          error: editError
        })
      : (
          <VariantEditor
            autoFocus={autoFocus}
            config={normalized.config}
            draft={draft}
            error={editError}
            mode="row"
            name={labels.editColumn(columnHeaderText(cell.column))}
            pending={pending}
            onCommit={() => true}
            onValueChange={setValue}
          />
        );

  return (
    <div
      ref={containerRef}
      aria-busy={pending || undefined}
      aria-label={pending ? labels.editPending : undefined}
      data-pending={pending || undefined}
      onClick={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      {...getStyles("cellEditor")}
    >
      {editor}
      {pending && <Loader size={12} />}
    </div>
  );
}

interface VariantEditorProps {
  config: DataTableEditConfig<any, unknown>;
  draft: unknown;
  error: string | null;
  pending: boolean;
  /**
   * Cell mode focuses (and for selects, opens) its single editor; row mode focuses only the
   * cell the session started from, never auto-opens, and never commits from a select change.
   */
  mode?: "cell" | "row";
  autoFocus?: boolean;
  /**
   * Accessible name: an editor is one of many identical controls in the grid, and the column it
   * edits is what tells them apart.
   */
  name: string;
  onValueChange: (value: unknown) => void;
  onCommit: () => CommitResult;
}

function VariantEditor({
  config,
  draft,
  error,
  pending,
  mode = "cell",
  autoFocus = true,
  name,
  onValueChange,
  onCommit
}: VariantEditorProps) {
  switch (config.variant) {
    case "text": {
      return (
        <TextInput
          aria-label={name}
          autoFocus={autoFocus}
          disabled={pending}
          error={error}
          size="xs"
          value={draft === null || draft === undefined ? "" : String(draft)}
          variant="unstyled"
          onChange={event => onValueChange(event.currentTarget.value)}
        />
      );
    }

    case "number": {
      return (
        <NumberInput
          hideControls
          aria-label={name}
          autoFocus={autoFocus}
          disabled={pending}
          error={error}
          size="xs"
          value={typeof draft === "number" || typeof draft === "string" ? draft : ""}
          variant="unstyled"
          onChange={value => onValueChange(value === "" ? null : value)}
        />
      );
    }

    case "select": {
      return (
        <Select
          aria-label={name}
          autoFocus={autoFocus}
          comboboxProps={{ withinPortal: true }}
          data={config.options}
          defaultDropdownOpened={mode === "cell"}
          disabled={pending}
          error={error}
          size="xs"
          value={draft === null || draft === undefined ? null : String(draft)}
          variant="unstyled"
          onChange={value => {
            onValueChange(value);

            if (mode === "cell") {
              onCommit();
            }
          }}
        />
      );
    }

    case "checkbox": {
      if (mode === "row") {
        // Row mode binds the checkbox to the draft like any other editor — the atomic commit
        // owns the write.
        return (
          <input
            aria-label={name}
            checked={Boolean(draft)}
            disabled={pending}
            type="checkbox"
            onChange={event => onValueChange(event.currentTarget.checked)}
          />
        );
      }

      // Cell mode: the checkbox variant never enters edit mode (it commits on toggle in the
      // cell itself); reaching here means startEditing was called programmatically.
      return null;
    }
  }
}

/**
 * Tab / Shift+Tab: commit-and-move to the row's adjacent editable cell (docs/editing.md keyboard map).
 */
function moveToAdjacentEditableCell(cell: Cell<any, unknown>, backwards: boolean): void {
  const { table } = cell.getContext();
  const editing = table.options.meta?.ledger?.editing;

  if (!editing) {
    return;
  }

  const cells = cell.row.getVisibleCells();
  const currentIndex = cells.findIndex(candidate => candidate.id === cell.id);
  const step = backwards ? -1 : 1;

  for (let index = currentIndex + step; index >= 0 && index < cells.length; index += step) {
    const candidate = cells[index];

    if (
      candidate
      && canEditCell(candidate, candidate.row)
      && !isCheckboxEdit(candidate)
    ) {
      editing.start({ rowId: candidate.row.id, columnId: candidate.column.id });
      return;
    }
  }

  editing.stop({ commit: true });
}
