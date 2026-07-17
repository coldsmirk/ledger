import type { Cell, Row } from "@tanstack/react-table";
import type { KeyboardEvent, ReactNode } from "react";

import type { DataTableEditConfig, DataTableEditContext } from "./types";

/**
 * The inline cell editor host (docs/editing.md). Owns the draft value, validation, and the
 * async commit lifecycle; registers itself with the editing controller so `stopEditing` and
 * cell-switch commits reach it; commits (never discards) when unmounted mid-edit by virtual
 * scrolling. Editors are unstyled Mantine inputs filling the cell — a boxed input inside a
 * table cell is visual noise.
 */
import { Loader, NumberInput, Select, TextInput } from "@mantine/core";
import { useEffect, useRef, useState } from "react";

import { useDataTableContext } from "./context";
import { useEventCallback } from "./utils";

type NormalizedEdit<TData>
  = | { kind: "variant"; config: DataTableEditConfig<TData, unknown> }
    | { kind: "custom"; render: (ctx: DataTableEditContext<TData, unknown>) => ReactNode };

export function normalizeEdit<TData>(
  edit: NonNullable<Cell<TData, unknown>["column"]["columnDef"]["meta"]>["edit"]
): NormalizedEdit<TData> | null {
  if (!edit) {
    return null;
  }

  if (typeof edit === "function") {
    return { kind: "custom", render: edit };
  }

  return { kind: "variant", config: typeof edit === "string" ? { variant: edit } : edit };
}

/**
 * Whether this cell is editable right now (column meta + table switch + per-row gate).
 */
export function canEditCell<TData>(cell: Cell<TData, unknown>, row: Row<TData>): boolean {
  const { table } = cell.getContext();
  const ledger = table.options.meta?.ledger;

  if (!ledger?.enableEditing) {
    return false;
  }

  const edit = cell.column.columnDef.meta?.edit;

  if (!edit) {
    return false;
  }

  return !(typeof edit === "object" && edit.enabled && !edit.enabled(row));
}

export function CellEditor<TData>({ cell }: { cell: Cell<TData, unknown> }) {
  const { labels, getStyles } = useDataTableContext();
  const { table } = cell.getContext();
  const ledger = table.options.meta?.ledger;
  const normalized = normalizeEdit<TData>(cell.column.columnDef.meta?.edit);

  const initialValue = useRef(cell.getValue());
  const draftRef = useRef<unknown>(initialValue.current);
  const [draft, setDraftState] = useState<unknown>(initialValue.current);
  const [editError, setEditError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  const setValue = useEventCallback((value: unknown) => {
    draftRef.current = value;
    setDraftState(value);
    setEditError(null);
  });

  /**
   * Clear the editing slice only if this cell is still the one being edited.
   */
  const clearIfCurrent = useEventCallback(() => {
    const editing = table.options.meta?.ledger?.editing;

    if (
      editing?.cell
      && editing.cell.rowId === cell.row.id
      && editing.cell.columnId === cell.column.id
    ) {
      editing.clear();
    }
  });

  const commit = useEventCallback(() => {
    if (pendingRef.current || !ledger) {
      return;
    }

    const previousValue = initialValue.current;
    const value = draftRef.current;

    if (Object.is(value, previousValue)) {
      clearIfCurrent();
      return;
    }

    if (normalized?.kind === "variant" && normalized.config.validate) {
      const validationError = normalized.config.validate(value, cell.row);

      if (validationError !== null) {
        setEditError(validationError);
        return;
      }
    }

    const result = ledger.onEditCommit?.({
      row: cell.row,
      column: cell.column,
      value,
      previousValue
    });

    if (result instanceof Promise) {
      pendingRef.current = true;
      setPending(true);

      result.then(
        () => {
          pendingRef.current = false;
          clearIfCurrent();
        },
        (error: unknown) => {
          pendingRef.current = false;
          setPending(false);
          setEditError(error instanceof Error ? error.message : String(error));
        }
      );

      return;
    }

    clearIfCurrent();
  });

  const cancel = useEventCallback(() => {
    if (!pendingRef.current) {
      clearIfCurrent();
    }
  });

  /**
   * Unmount-commit is deferred one tick so a remount of the same cell — React StrictMode's
   * simulated unmount, or the virtualizer re-mounting a row that stayed in view — cancels it.
   * Only a real departure (scrolled out of the window) lets the timer fire: commit, never
   * discard (docs/editing.md). A validation failure has nowhere to display anymore and degrades to discard.
   */
  const unmountCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (unmountCommitTimer.current !== null) {
      clearTimeout(unmountCommitTimer.current);
      unmountCommitTimer.current = null;
    }

    const editing = table.options.meta?.ledger?.editing;
    editing?.registerEditor({ commit, cancel });

    return () => {
      editing?.registerEditor(null);

      const latest = table.options.meta?.ledger?.editing;

      if (
        latest?.cell
        && latest.cell.rowId === cell.row.id
        && latest.cell.columnId === cell.column.id
      ) {
        unmountCommitTimer.current = setTimeout(() => {
          unmountCommitTimer.current = null;
          commit();
          latest.clear();
        }, 0);
      }
    };
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- registration is a mount/unmount pairing; handlers are stable
  }, []);

  if (!normalized) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case "Enter": {
        event.preventDefault();
        commit();

        break;
      }

      case "Escape": {
        event.preventDefault();
        event.stopPropagation();
        cancel();

        break;
      }

      case "Tab": {
        event.preventDefault();
        moveToAdjacentEditableCell(cell, event.shiftKey);

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
          commit,
          cancel,
          error: editError
        })
      : (
          <VariantEditor
            config={normalized.config}
            draft={draft}
            error={editError}
            pending={pending}
            onCommit={commit}
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
          commit();
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

interface VariantEditorProps<TData> {
  config: DataTableEditConfig<TData, unknown>;
  draft: unknown;
  error: string | null;
  pending: boolean;
  onValueChange: (value: unknown) => void;
  onCommit: () => void;
}

function VariantEditor<TData>({
  config,
  draft,
  error,
  pending,
  onValueChange,
  onCommit
}: VariantEditorProps<TData>) {
  switch (config.variant) {
    case "text": {
      return (
        <TextInput
          autoFocus
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
          autoFocus
          hideControls
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
          autoFocus
          defaultDropdownOpened
          comboboxProps={{ withinPortal: true }}
          data={config.options}
          disabled={pending}
          error={error}
          size="xs"
          value={draft === null || draft === undefined ? null : String(draft)}
          variant="unstyled"
          onChange={value => {
            onValueChange(value);
            onCommit();
          }}
        />
      );
    }

    case "checkbox": {
      // The checkbox variant never enters edit mode (it commits on toggle in the cell itself);
      // reaching here means startEditing was called programmatically — render nothing.
      return null;
    }
  }
}

/**
 * Tab / Shift+Tab: commit-and-move to the row's adjacent editable cell (docs/editing.md keyboard map).
 */
function moveToAdjacentEditableCell<TData>(cell: Cell<TData, unknown>, backwards: boolean): void {
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
      && candidate.column.columnDef.meta?.edit !== "checkbox"
    ) {
      editing.start({ rowId: candidate.row.id, columnId: candidate.column.id });
      return;
    }
  }

  editing.stop({ commit: true });
}
