import type { TextInputProps } from "@mantine/core";
import type { RowData } from "@tanstack/react-table";

import type { DataTableIcons } from "./icons";
import type { DataTableLabels } from "./labels";
import type { TableInstance } from "./types";

/**
 * `DataTable.Search` — the global-filter input, debounced. A standalone compound: takes the
 * table instance, composes anywhere (toolbars are the page's territory).
 */
import { CloseButton, TextInput, useProps } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import { useEffect, useState } from "react";

import { resolveIcons } from "./icons";
import { resolveLabels } from "./labels";

export interface DataTableSearchProps<TData extends RowData>
  extends Omit<TextInputProps, "value" | "defaultValue" | "onChange"> {
  table: TableInstance<TData>;
  /**
   * Debounce before the global filter applies, in milliseconds.
   */
  debounce?: number;
  labels?: Partial<DataTableLabels>;
  icons?: Partial<DataTableIcons>;
}

const searchDefaultProps = { debounce: 200 } satisfies Partial<DataTableSearchProps<RowData>>;

export function DataTableSearch<TData extends RowData>(props: DataTableSearchProps<TData>) {
  const {
    table,
    debounce,
    labels,
    icons,
    placeholder,
    ...others
  } = useProps(
    "DataTableSearch",
    searchDefaultProps,
    props
  );

  const resolved = resolveLabels(labels);
  const resolvedIcons = resolveIcons(icons);
  const globalFilter = (table.atoms.globalFilter.get() as string | undefined) ?? "";
  const [value, setValue] = useState(globalFilter);

  const apply = useDebouncedCallback((next: string) => table.setGlobalFilter(next), debounce);
  const subscribeGlobalFilter = table.options.meta?.ledger?.filtering.subscribeGlobalFilter;

  // A reset to the current table value is invisible to React state. Subscribe to set attempts so
  // it still cancels a pending local value before that value can write itself back later.
  useEffect(() => subscribeGlobalFilter?.(next => {
    apply.cancel();
    setValue(next);
  }), [apply, subscribeGlobalFilter]);

  // Follow external changes (a programmatic reset, a controlled slice) once they settle.
  useEffect(() => {
    apply.cancel();
    setValue(globalFilter);
  }, [apply, globalFilter]);

  const clear = () => {
    apply.cancel();
    setValue("");
    table.setGlobalFilter("");
  };

  const resolvedPlaceholder = placeholder ?? resolved.searchPlaceholder;

  return (
    <TextInput
      // A placeholder is not a label — it disappears the moment there is a value. The visible
      // text doubles as the name so the two never disagree; `others` lets a caller override it.
      aria-label={resolvedPlaceholder}
      leftSection={<resolvedIcons.search />}
      placeholder={resolvedPlaceholder}
      rightSectionPointerEvents="all"
      value={value}
      rightSection={value !== ""
        && <CloseButton aria-label={resolved.clearFilter} size="sm" onClick={clear} />}
      onChange={event => {
        setValue(event.currentTarget.value);
        apply(event.currentTarget.value);
      }}
      {...others}
    />
  );
}
