import type { KeyboardEvent, ReactNode } from "react";

import type { Cell, DataTableEditConfig, DataTableEditContext, Row } from "./types";

/**
 * The inline cell editor host (docs/editing.md). Owns the draft value, validation, and the
 * async commit lifecycle; registers itself with the editing controller so `stopEditing` and
 * cell-switch commits reach it; commits (never discards) when unmounted mid-edit by virtual
 * scrolling. Editors are unstyled Mantine inputs filling the cell — a boxed input inside a
 * table cell is visual noise.
 */
import { Loader, NumberInput, Select, TextInput } from "@mantine/core";
import { useEffect, useReducer, useRef, useState } from "react";

import { columnHeaderText } from "./build-columns";
import { useDataTableContext } from "./context";
import { useEventCallback } from "./utils";

type NormalizedEdit
  = | { kind: "variant"; config: DataTableEditConfig<any, unknown> }
    | { kind: "custom"; render: (ctx: DataTableEditContext<any, unknown>) => ReactNode };

type CommitResult = boolean | Promise<boolean>;

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return typeof value === "object" && value !== null && "then" in value && typeof value.then === "function";
}

export function editErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeEdit(
  edit: NonNullable<Cell<any, unknown>["column"]["columnDef"]["meta"]>["edit"]
): NormalizedEdit | null {
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
export function canEditCell(cell: Cell<any, unknown>, row: Row<any>): boolean {
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

export function isCheckboxEdit(cell: Cell<any, unknown>): boolean {
  const normalized = normalizeEdit(cell.column.columnDef.meta?.edit);

  return normalized?.kind === "variant" && normalized.config.variant === "checkbox";
}

export function CellEditor({ cell }: { cell: Cell<any, unknown> }) {
  const { labels, getStyles } = useDataTableContext();
  const { table } = cell.getContext();
  const ledger = table.options.meta?.ledger;
  const normalized = normalizeEdit(cell.column.columnDef.meta?.edit);

  const initialValue = useRef(cell.getValue());
  const draftRef = useRef<unknown>(initialValue.current);
  const [draft, setDraftState] = useState<unknown>(initialValue.current);
  const [editError, setEditError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const pendingCommitRef = useRef<Promise<boolean> | null>(null);
  const completedRef = useRef(false);
  const mountedRef = useRef(true);

  const setValue = useEventCallback((value: unknown) => {
    draftRef.current = value;
    setDraftState(value);
    setEditError(null);
    // A new value is a new edit. This editor is only still on screen past a settled commit or
    // cancel because the application declined to close the slice, and what it holds now is
    // something no write has carried.
    completedRef.current = false;
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

  const commit = useEventCallback<[], CommitResult>(() => {
    if (completedRef.current) {
      return true;
    }

    if (pendingCommitRef.current) {
      return pendingCommitRef.current;
    }

    if (!ledger) {
      return false;
    }

    // Eligibility is re-read here, not trusted from mount: `enableEditing` can switch off,
    // `meta.edit` can be removed, and `edit.enabled(row)` can turn false while this editor is
    // open. Committing then would push a value through a gate the application has just shut —
    // and unvalidated, since a closed gate is exactly what `validate` no longer guards. The
    // draft is dropped and leaving the cell is safe, the same resolution row mode gives it
    // (docs/editing.md).
    if (!canEditCell(cell, cell.row)) {
      completedRef.current = true;
      clearIfCurrent();

      return true;
    }

    const previousValue = initialValue.current;
    const value = draftRef.current;

    if (Object.is(value, previousValue)) {
      completedRef.current = true;
      clearIfCurrent();
      return true;
    }

    try {
      if (normalized?.kind === "variant" && normalized.config.validate) {
        const validationError = normalized.config.validate(value, cell.row);

        if (validationError !== null) {
          if (mountedRef.current) {
            setEditError(validationError);
          }

          return false;
        }
      }
    } catch (error) {
      if (mountedRef.current) {
        setEditError(editErrorMessage(error));
      }

      return false;
    }

    let result: void | Promise<void>;

    try {
      result = ledger.onEditCommit?.({
        row: cell.row,
        column: cell.column,
        value,
        previousValue
      });
    } catch (error) {
      if (mountedRef.current) {
        setEditError(editErrorMessage(error));
      }

      return false;
    }

    if (isPromiseLike(result)) {
      pendingRef.current = true;

      if (mountedRef.current) {
        setPending(true);
      }

      // The in-flight slot is released inside the handlers rather than in a `finally`: the
      // not-carried branch below commits again, and a request that has settled must not still be
      // standing there for its own successor to join.
      const pendingCommit: Promise<boolean> = Promise.resolve(result).then(
        () => {
          // A custom editor is not disabled while the request is out, so the user can type
          // straight past it. What this write carried is what the next edit departs from, but a
          // value typed since is one it never carried.
          const carried = Object.is(draftRef.current, value);
          completedRef.current = carried;
          initialValue.current = value;
          pendingRef.current = false;

          if (pendingCommitRef.current === pendingCommit) {
            pendingCommitRef.current = null;
          }

          if (mountedRef.current) {
            setPending(false);
          }

          // The gate can shut while a request is out. This write passed it on the way, so it
          // stands — but the session it belonged to is over, and nothing waiting to move may do
          // so on the strength of a commit whose editor was taken out from under it.
          if (!canEditCell(cell, cell.row)) {
            completedRef.current = true;
            clearIfCurrent();

            return false;
          }

          if (!carried) {
            // Still on screen: the cell does not close, and whoever was waiting to leave it is
            // told it is not safe to. Gone from the screen: nobody can commit it by hand any
            // more, and an unmount commits rather than discards (docs/editing.md) — so this
            // write, which did succeed, is followed by the one it outran. That successor carries
            // the latest value, so it settles `carried` and recurses no further.
            return mountedRef.current ? false : commit();
          }

          clearIfCurrent();

          return true;
        },
        (error: unknown) => {
          pendingRef.current = false;

          if (pendingCommitRef.current === pendingCommit) {
            pendingCommitRef.current = null;
          }

          if (mountedRef.current) {
            setPending(false);
            setEditError(editErrorMessage(error));
          }

          return false;
        }
      );

      pendingCommitRef.current = pendingCommit;

      return pendingCommit;
    }

    completedRef.current = true;
    initialValue.current = value;
    clearIfCurrent();

    return true;
  }) as () => CommitResult;

  const cancel = useEventCallback(() => {
    // Nothing to cancel while a request is out, and nothing left to cancel once this editor has
    // settled — a second request would ask the application to close the same session twice.
    if (pendingRef.current || completedRef.current) {
      return;
    }

    // The pending value is discarded, not merely abandoned: an application that declines to
    // close the slice keeps this editor on screen, and what it shows must be the cell again.
    draftRef.current = initialValue.current;
    setDraftState(initialValue.current);
    setEditError(null);
    completedRef.current = true;
    clearIfCurrent();
  });

  /**
   * The same rule as a live event: when eligibility closes under an open editor, the editor
   * cancels. Cancelling clears the editing slice, so the editor leaves through the ordinary
   * path and the unmount carve-out below — which commits — never arms. An async commit already
   * in flight is left alone: that value passed the gate before it shut.
   */
  const editable = canEditCell(cell, cell.row);

  useEffect(() => {
    if (!editable) {
      cancel();
    }
    // `pending` is a dependency, not noise: `cancel()` refuses while a commit is in flight, so
    // an editor that lost eligibility mid-request would otherwise come back on rejection —
    // typable, under a switch that is off — and stay until the next commit attempt.
  }, [editable, pending, cancel]);

  /**
   * Unmount-commit is deferred one tick so a remount of the same cell — React StrictMode's
   * simulated unmount, or the virtualizer re-mounting a row that stayed in view — cancels it.
   * Only a real departure (scrolled out of the window) lets the timer fire: commit, never
   * discard (docs/editing.md). A validation failure has nowhere to display anymore and degrades to discard.
   */
  const unmountCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    if (unmountCommitTimer.current !== null) {
      clearTimeout(unmountCommitTimer.current);
      unmountCommitTimer.current = null;
    }

    const editing = table.options.meta?.ledger?.editing;
    editing?.registerEditor({ commit, cancel });

    return () => {
      mountedRef.current = false;
      editing?.registerEditor(null);

      const latest = table.options.meta?.ledger?.editing;

      if (
        latest?.cell
        && latest.cell.rowId === cell.row.id
        && latest.cell.columnId === cell.column.id
      ) {
        unmountCommitTimer.current = setTimeout(() => {
          unmountCommitTimer.current = null;
          const result = commit();

          if (isPromiseLike(result)) {
            void Promise.resolve(result).then(() => clearIfCurrent());
          } else {
            clearIfCurrent();
          }
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
        void commit();

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
        const result = commit();

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
          commit,
          cancel,
          error: editError
        })
      : (
          <VariantEditor
            config={normalized.config}
            draft={draft}
            error={editError}
            name={labels.editColumn(columnHeaderText(cell.column))}
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
  const [editError, setEditError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  // Ref-read, not consumed — StrictMode's remount and virtualizer round-trips keep the focus.
  const autoFocus = rowApi?.shouldFocus(columnId) ?? false;

  const setValue = useEventCallback((value: unknown) => {
    rowApi?.drafts.write(rowId, columnId, value);
    setEditError(null);
    redraw();
  });

  /**
   * The controller calls this when the row's pending edit is thrown away. There is nothing to put
   * back — the store already answers differently — only a render to ask for.
   */
  const resetDraft = useEventCallback(() => {
    setEditError(null);
    redraw();
  });

  useEffect(() => {
    mountedRef.current = true;

    const unregister = rowApi?.register(columnId, {
      focus: () => containerRef.current
        ?.querySelector<HTMLElement>(":scope input, :scope select, :scope textarea, :scope button")
        ?.focus(),
      setError: error => {
        if (mountedRef.current) {
          setEditError(error);
        }
      },
      setPending: value => {
        if (mountedRef.current) {
          setPending(value);
        }
      },
      reset: resetDraft
    });

    return () => {
      mountedRef.current = false;
      unregister?.();
    };
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
