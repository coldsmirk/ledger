import type { TextInputProps } from "@mantine/core";

import type { DataTableLabels } from "./labels";
import type { TableInstance } from "./types";

/**
 * `DataTable.Search` — the global-filter input, debounced. A standalone compound: takes the
 * table instance, composes anywhere (toolbars are the page's territory).
 */
import { ActionIcon, TextInput, useProps } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import { useEffect, useState } from "react";

import { IconSearch, IconX } from "./icons";
import { resolveLabels } from "./labels";

export interface DataTableSearchProps<TData>
  extends Omit<TextInputProps, "value" | "defaultValue" | "onChange"> {
  table: TableInstance<TData>;
  /**
   * Debounce before the global filter applies, in milliseconds.
   */
  debounce?: number;
  labels?: Partial<DataTableLabels>;
}

const searchDefaultProps = { debounce: 200 } satisfies Partial<DataTableSearchProps<unknown>>;

export function DataTableSearch<TData>(props: DataTableSearchProps<TData>) {
  const {
    table,
    debounce,
    labels,
    placeholder,
    ...others
  } = useProps(
    "DataTableSearch",
    searchDefaultProps,
    props
  );

  const resolved = resolveLabels(labels);
  const globalFilter = (table.getState().globalFilter as string | undefined) ?? "";
  const [value, setValue] = useState(globalFilter);

  const apply = useDebouncedCallback((next: string) => table.setGlobalFilter(next), debounce);

  // Follow external changes (a programmatic reset, a controlled slice) once they settle.
  useEffect(() => {
    setValue(globalFilter);
  }, [globalFilter]);

  const clear = () => {
    setValue("");
    table.setGlobalFilter("");
  };

  return (
    <TextInput
      leftSection={<IconSearch />}
      placeholder={placeholder ?? resolved.searchPlaceholder}
      value={value}
      rightSection={
        value === ""
          ? undefined
          : (
              <ActionIcon aria-label={resolved.clearFilter} size="sm" variant="subtle" onClick={clear}>
                <IconX />
              </ActionIcon>
            )
      }
      onChange={event => {
        setValue(event.currentTarget.value);
        apply(event.currentTarget.value);
      }}
      {...others}
    />
  );
}
