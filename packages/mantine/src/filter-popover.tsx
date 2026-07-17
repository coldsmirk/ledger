import type { Column } from "@tanstack/react-table";

import type { DateRangeFilterValue } from "./filter-fns";
import type { DataTableFilterConfig } from "./types";

/**
 * Header filter UI: a funnel trigger (filled while active) opening a popover with the control
 * `meta.filter` declares. Client mode derives `select`/`multi-select` options from faceted
 * values when none are given; server mode requires explicit options and degrades to the text
 * variant (with a dev warning) when they are missing. Date bounds use native `type="date"`
 * inputs — no extra dependency, ISO-string filter values.
 */
import { ActionIcon, Group, MultiSelect, NumberInput, Popover, Select, Stack, TextInput } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import { useState } from "react";

import { useDataTableContext } from "./context";
import { warnOnce } from "./env";
import { IconFilter, IconX } from "./icons";

const FACETED_OPTIONS_CAP = 100;

export interface FilterPopoverProps<TData> {
  column: Column<TData, unknown>;
}

export function FilterPopover<TData>({ column }: FilterPopoverProps<TData>) {
  const {
    labels,
    getStyles,
    filterMode
  } = useDataTableContext();
  const filter = column.columnDef.meta?.filter;

  if (!filter || !column.getCanFilter()) {
    return null;
  }

  const active = column.getFilterValue() !== undefined;

  return (
    <Popover trapFocus position="bottom-start" width={240}>
      <Popover.Target>
        <ActionIcon
          aria-label={labels.filterColumn}
          data-active={active || undefined}
          size="sm"
          variant={active ? "light" : "subtle"}
          onClick={event => event.stopPropagation()}
        >
          <IconFilter />
        </ActionIcon>
      </Popover.Target>

      <Popover.Dropdown {...getStyles("filterPopover")} onClick={event => event.stopPropagation()}>
        <Stack gap="xs">
          {typeof filter === "function"
            ? filter(column)
            : (
                <VariantFilterControl
                  column={column}
                  config={typeof filter === "string" ? { variant: filter } : filter}
                  filterMode={filterMode}
                />
              )}

          {active && (
            <Group justify="flex-end">
              <ActionIcon
                aria-label={labels.clearFilter}
                size="sm"
                variant="subtle"
                onClick={() => column.setFilterValue(undefined)}
              >
                <IconX />
              </ActionIcon>
            </Group>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

interface VariantFilterControlProps<TData> {
  column: Column<TData, unknown>;
  config: DataTableFilterConfig;
  filterMode: "client" | "server";
}

function VariantFilterControl<TData>({
  column,
  config,
  filterMode
}: VariantFilterControlProps<TData>) {
  const { labels } = useDataTableContext();

  let { variant } = config;
  let { options } = config;

  if ((variant === "select" || variant === "multi-select") && !options) {
    if (filterMode === "server") {
      warnOnce(
        `filter-options-${column.id}`,
        `Column "${column.id}" uses a ${variant} filter in server mode without options — faceted values need client-side rows. Falling back to a text filter.`
      );
      variant = "text";
    } else {
      options = facetedOptions(column);
    }
  }

  switch (variant) {
    case "text": {
      return <TextFilter column={column} placeholder={config.placeholder ?? labels.filterPlaceholder} />;
    }

    case "select": {
      return (
        <Select
          clearable
          searchable
          // Inside the filter popover the combobox must not portal out: a portal dropdown
          // reads as an outside click and closes the popover mid-interaction.
          comboboxProps={{ withinPortal: false }}
          data={options}
          placeholder={config.placeholder ?? labels.filterPlaceholder}
          value={(column.getFilterValue() as string | undefined) ?? null}
          onChange={value => column.setFilterValue(value ?? undefined)}
        />
      );
    }

    case "multi-select": {
      return (
        <MultiSelect
          clearable
          searchable
          comboboxProps={{ withinPortal: false }}
          data={options}
          placeholder={config.placeholder ?? labels.filterPlaceholder}
          value={(column.getFilterValue() as string[] | undefined) ?? []}
          onChange={value => column.setFilterValue(value.length > 0 ? value : undefined)}
        />
      );
    }

    case "range": {
      return <RangeFilter column={column} />;
    }

    case "date-range": {
      return <DateRangeFilter column={column} />;
    }
  }
}

function TextFilter<TData>({ column, placeholder }: { column: Column<TData, unknown>; placeholder: string }) {
  const [value, setValue] = useState((column.getFilterValue() as string | undefined) ?? "");
  const apply = useDebouncedCallback(
    (next: string) => column.setFilterValue(next === "" ? undefined : next),
    200
  );

  return (
    <TextInput
      placeholder={placeholder}
      value={value}
      onChange={event => {
        setValue(event.currentTarget.value);
        apply(event.currentTarget.value);
      }}
    />
  );
}

function RangeFilter<TData>({ column }: { column: Column<TData, unknown> }) {
  const { labels } = useDataTableContext();
  const [min, max] = (column.getFilterValue() as [number | undefined, number | undefined] | undefined) ?? [
    undefined,
    undefined
  ];
  const [facetMin, facetMax] = column.getFacetedMinMaxValues() ?? [undefined, undefined];

  const setBound = (index: 0 | 1) => (raw: number | string) => {
    const bound = typeof raw === "number" ? raw : undefined;
    const next: [number | undefined, number | undefined] = index === 0 ? [bound, max] : [min, bound];
    column.setFilterValue(next[0] === undefined && next[1] === undefined ? undefined : next);
  };

  return (
    <Group grow gap="xs">
      <NumberInput
        aria-label={labels.filterRangeMin}
        placeholder={facetMin === undefined ? labels.filterRangeMin : String(facetMin)}
        value={min ?? ""}
        onChange={setBound(0)}
      />

      <NumberInput
        aria-label={labels.filterRangeMax}
        placeholder={facetMax === undefined ? labels.filterRangeMax : String(facetMax)}
        value={max ?? ""}
        onChange={setBound(1)}
      />
    </Group>
  );
}

function DateRangeFilter<TData>({ column }: { column: Column<TData, unknown> }) {
  const { labels } = useDataTableContext();
  const [from, to] = (column.getFilterValue() as DateRangeFilterValue | undefined) ?? [null, null];

  const setBound = (index: 0 | 1) => (raw: string) => {
    const bound = raw === "" ? null : raw;
    const next: DateRangeFilterValue = index === 0 ? [bound, to] : [from, bound];
    column.setFilterValue(!next[0] && !next[1] ? undefined : next);
  };

  return (
    <Group grow gap="xs">
      <TextInput
        aria-label={labels.filterDateFrom}
        type="date"
        value={from ?? ""}
        onChange={event => setBound(0)(event.currentTarget.value)}
      />

      <TextInput
        aria-label={labels.filterDateTo}
        type="date"
        value={to ?? ""}
        onChange={event => setBound(1)(event.currentTarget.value)}
      />
    </Group>
  );
}

function facetedOptions<TData>(column: Column<TData, unknown>): string[] {
  const values: string[] = [];

  for (const key of column.getFacetedUniqueValues().keys()) {
    if (key === null || key === undefined || key === "") {
      continue;
    }

    if (Array.isArray(key)) {
      for (const entry of key) {
        if (entry !== null && entry !== undefined) {
          values.push(String(entry));
        }
      }
    } else {
      values.push(String(key));
    }
  }

  return [...new Set(values)].toSorted().slice(0, FACETED_OPTIONS_CAP);
}
