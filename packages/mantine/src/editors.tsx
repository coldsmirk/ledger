import type { ComboboxData } from "@mantine/core";

import type { DataTableEditRenderer, DataTableInstantEditRenderer } from "./types";

/**
 * The shipped editor renderers — conveniences, never the mechanism. Each is an ordinary
 * renderer over the public editing contexts (docs/editing.md#editors), which is the proof the
 * contexts suffice: anything these do, an application's own renderer can do the same way.
 * All are unstyled Mantine inputs filling the cell — a boxed input inside a table cell is
 * visual noise.
 */
import { NumberInput, Select, TextInput } from "@mantine/core";

const renderTextEditor: DataTableEditRenderer<any, any> = ({
  value,
  setValue,
  error,
  pending,
  autoFocus,
  label
}) => (
  <TextInput
    aria-label={label}
    autoFocus={autoFocus}
    disabled={pending}
    error={error}
    size="xs"
    value={value === null || value === undefined ? "" : String(value)}
    variant="unstyled"
    onChange={event => setValue(event.currentTarget.value)}
  />
);

/**
 * A plain text editor: `meta.edit: textEditor()`.
 */
export function textEditor(): DataTableEditRenderer<any, any> {
  return renderTextEditor;
}

const renderNumberEditor: DataTableEditRenderer<any, any> = ({
  value,
  setValue,
  error,
  pending,
  autoFocus,
  label
}) => (
  <NumberInput
    hideControls
    aria-label={label}
    autoFocus={autoFocus}
    disabled={pending}
    error={error}
    size="xs"
    value={typeof value === "number" || typeof value === "string" ? value : ""}
    variant="unstyled"
    onChange={next => setValue(next === "" ? null : next)}
  />
);

/**
 * A numeric editor; an emptied input holds `null`, never `0`.
 */
export function numberEditor(): DataTableEditRenderer<any, any> {
  return renderNumberEditor;
}

/**
 * A single-pick editor over the given options. In cell mode the dropdown opens immediately and
 * picking an option commits at once — one cell is the whole session; in row mode it is one
 * draft-bound field among the row's others, and the row's own commit decides.
 */
export function selectEditor(options: ComboboxData): DataTableEditRenderer<any, any> {
  return ({
    value,
    setValue,
    commit,
    error,
    pending,
    mode,
    autoFocus,
    label
  }) => (
    <Select
      aria-label={label}
      autoFocus={autoFocus}
      comboboxProps={{ withinPortal: true }}
      data={options}
      defaultDropdownOpened={mode === "cell"}
      disabled={pending}
      error={error}
      size="xs"
      value={value === null || value === undefined ? null : String(value)}
      variant="unstyled"
      onChange={next => {
        setValue(next);

        if (mode === "cell") {
          void commit();
        }
      }}
    />
  );
}

const renderCheckboxEditor: DataTableInstantEditRenderer<any, any> = ({
  value,
  commit,
  pending,
  error,
  label
}) => (
  <input
    aria-invalid={error ? true : undefined}
    aria-label={label}
    checked={Boolean(value)}
    disabled={pending}
    type="checkbox"
    onChange={event => void commit(event.currentTarget.checked)}
  />
);

/**
 * A live checkbox for an instant column: `meta.edit: { instant: checkboxEditor() }`. Each
 * toggle commits the flipped value; the host disables it while its own write is out.
 */
export function checkboxEditor(): DataTableInstantEditRenderer<any, any> {
  return renderCheckboxEditor;
}
