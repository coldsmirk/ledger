import type { RowData } from "@tanstack/react-table";

import type { DateRangeFilterValue } from "./filter-fns";
import type { Column, DataTableFilterConfig } from "./types";

/**
 * Header filter UI: a funnel trigger (filled while active) opening a popover with the control
 * `meta.filter` declares. Client mode derives `select`/`multi-select` options from faceted
 * values when none are given; server mode requires explicit options and degrades to the text
 * variant (with a dev warning) when they are missing. Date bounds render an inline
 * `@mantine/dates` range calendar (no nested popover to misread as an outside click);
 * its values are the same `YYYY-MM-DD` strings the filter fn compares.
 *
 * Clearing lives on each control, not on a shared popover row: `select`/`multi-select` use
 * their native clear buttons, `text` clears from its right section, `range` from the end of
 * its input row, and the calendar from a caption under it. Only a custom render-prop filter —
 * a black box that may ship no clear of its own — keeps the popover-level fallback.
 */
import { ActionIcon, Button, CloseButton, Group, MultiSelect, NumberInput, Popover, Select, Stack, TextInput } from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { useDebouncedCallback } from "@mantine/hooks";
import { useEffect, useState } from "react";

import { columnHeaderText } from "./build-columns";
import { useDataTableContext } from "./context";
import { warnOnce } from "./env";

const FACETED_OPTIONS_CAP = 100;

export interface FilterPopoverProps<TData extends RowData> {
  column: Column<TData, unknown>;
}

export function FilterPopover<TData extends RowData>({ column }: FilterPopoverProps<TData>) {
  const {
    labels,
    icons,
    getStyles,
    filterMode
  } = useDataTableContext();
  const filter = column.columnDef.meta?.filter;

  if (!filter || !column.getCanFilter()) {
    return null;
  }

  const active = column.getFilterValue() !== undefined;
  // Every filter control in a header is the same control; only the column tells them apart.
  const name = labels.filterColumn(columnHeaderText(column));

  return (
    <Popover trapFocus position="bottom-start" width={240}>
      <Popover.Target>
        <ActionIcon
          aria-label={name}
          data-active={active || undefined}
          size="sm"
          variant={active ? "light" : "subtle"}
          onClick={event => event.stopPropagation()}
        >
          <icons.filterColumn />
        </ActionIcon>
      </Popover.Target>

      <Popover.Dropdown {...getStyles("filterPopover")} onClick={event => event.stopPropagation()}>
        <Stack gap="xs">
          {typeof filter === "function"
            ? (
                <>
                  {filter(column)}

                  {active && (
                    <Group justify="flex-end">
                      <CloseButton
                        aria-label={labels.clearFilter}
                        size="sm"
                        onClick={() => column.setFilterValue(undefined)}
                      />
                    </Group>
                  )}
                </>
              )
            : (
                <VariantFilterControl
                  column={column}
                  config={typeof filter === "string" ? { variant: filter } : filter}
                  filterMode={filterMode}
                  name={name}
                />
              )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

interface VariantFilterControlProps<TData extends RowData> {
  column: Column<TData, unknown>;
  config: DataTableFilterConfig;
  filterMode: "client" | "server";
  /**
   * Accessible name, shared with the funnel trigger — a placeholder is not a label.
   */
  name: string;
}

function VariantFilterControl<TData extends RowData>({
  column,
  config,
  filterMode,
  name
}: VariantFilterControlProps<TData>) {
  const { labels } = useDataTableContext();

  switch (config.variant) {
    case "text": {
      return <TextFilter column={column} name={name} placeholder={config.placeholder ?? labels.filterPlaceholder} />;
    }

    case "select": {
      return <SelectFilter column={column} config={config} filterMode={filterMode} name={name} />;
    }

    case "multi-select": {
      return <SelectFilter column={column} config={config} filterMode={filterMode} name={name} />;
    }

    case "range": {
      return <RangeFilter column={column} name={name} />;
    }

    case "date-range": {
      return <DateRangeFilter column={column} name={name} />;
    }
  }
}

/**
 * The select family, whose two variants differ only in cardinality — one control, one option
 * source, one degradation path.
 */
function SelectFilter<TData extends RowData>({
  column,
  config,
  filterMode,
  name
}: {
  column: Column<TData, unknown>;
  config: Extract<DataTableFilterConfig, { variant: "select" | "multi-select" }>;
  filterMode: "client" | "server";
  name: string;
}) {
  const { labels } = useDataTableContext();
  const placeholder = config.placeholder ?? labels.filterPlaceholder;
  // Declared options win; client mode derives them from the faceted values, which server mode has
  // no rows to compute. An explicitly empty list is a declaration like any other.
  const options = config.options ?? (filterMode === "server" ? undefined : facetedOptions(column));

  if (!options) {
    warnOnce(
      `filter-options-${column.id}`,
      `Column "${column.id}" uses a ${config.variant} filter in server mode without options — faceted values need client-side rows. Falling back to a text filter.`
    );

    return <TextFilter column={column} name={name} placeholder={placeholder} />;
  }

  if (config.variant === "multi-select") {
    return (
      <MultiSelect
        clearable
        searchable
        aria-label={name}
        clearButtonProps={{ "aria-label": labels.clearFilter }}
        comboboxProps={{ withinPortal: false }}
        data={options}
        placeholder={placeholder}
        value={(column.getFilterValue() as string[] | undefined) ?? []}
        onChange={value => column.setFilterValue(value.length > 0 ? value : undefined)}
      />
    );
  }

  return (
    <Select
      clearable
      searchable
      aria-label={name}
      clearButtonProps={{ "aria-label": labels.clearFilter }}
      // Inside the filter popover the combobox must not portal out: a portal dropdown
      // reads as an outside click and closes the popover mid-interaction.
      comboboxProps={{ withinPortal: false }}
      data={options}
      placeholder={placeholder}
      value={(column.getFilterValue() as string | undefined) ?? null}
      onChange={value => column.setFilterValue(value ?? undefined)}
    />
  );
}

function TextFilter<TData extends RowData>({
  column,
  name,
  placeholder
}: { column: Column<TData, unknown>; name: string; placeholder: string }) {
  // Straight from the context, never through a table instance: this control redraws from its
  // own state, in renders the table root has no part in, and the instance it would reach for
  // then is whatever pass wrote it last (context.ts).
  const { labels, subscribeColumnFilters } = useDataTableContext();
  // Only a string is this control's value. A server-mode `select`/`multi-select` that degrades
  // here (no options to build) inherits whatever filter was already set, and a multi-select's is
  // an array — which a TextInput would render as its comma-joined form and then write back as
  // one string.
  const raw = column.getFilterValue();
  const filterValue = typeof raw === "string" ? raw : "";
  const [value, setValue] = useState(filterValue);
  const apply = useDebouncedCallback(
    (next: string) => column.setFilterValue(next === "" ? undefined : next),
    { delay: 200, flushOnUnmount: true }
  );

  useEffect(() => subscribeColumnFilters?.(filters => {
    const next = filters.find(filter => filter.id === column.id)?.value;

    apply.cancel();
    setValue(typeof next === "string" ? next : "");
  }), [apply, column.id, subscribeColumnFilters]);

  useEffect(() => {
    apply.cancel();
    setValue(filterValue);
  }, [apply, filterValue]);

  return (
    <TextInput
      aria-label={name}
      placeholder={placeholder}
      rightSectionPointerEvents="all"
      value={value}
      rightSection={value !== "" && (
        <CloseButton
          aria-label={labels.clearFilter}
          size="sm"
          onClick={() => {
            apply.cancel();
            setValue("");
            column.setFilterValue(undefined);
          }}
        />
      )}
      onChange={event => {
        setValue(event.currentTarget.value);
        apply(event.currentTarget.value);
      }}
    />
  );
}

function RangeFilter<TData extends RowData>({ column, name }: { column: Column<TData, unknown>; name: string }) {
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

  const active = min !== undefined || max !== undefined;

  return (
    // The pair is one control: the group carries the column's name, the inputs their bound.
    <Group aria-label={name} gap="xs" role="group" wrap="nowrap">
      <NumberInput
        aria-label={labels.filterRangeMin}
        flex={1}
        placeholder={facetMin === undefined ? labels.filterRangeMin : String(facetMin)}
        value={min ?? ""}
        onChange={setBound(0)}
      />

      <NumberInput
        aria-label={labels.filterRangeMax}
        flex={1}
        placeholder={facetMax === undefined ? labels.filterRangeMax : String(facetMax)}
        value={max ?? ""}
        onChange={setBound(1)}
      />

      {/* Space is reserved while inactive so the inputs keep their width as the button appears. */}
      <CloseButton
        aria-label={labels.clearFilter}
        size="sm"
        style={{ visibility: active ? undefined : "hidden" }}
        onClick={() => column.setFilterValue(undefined)}
      />
    </Group>
  );
}

function DateRangeFilter<TData extends RowData>({ column, name }: { column: Column<TData, unknown>; name: string }) {
  const { labels } = useDataTableContext();
  const filterValue = column.getFilterValue() as DateRangeFilterValue | undefined;
  const value = filterValue ?? [null, null];

  return (
    <>
      <DatePicker
        allowSingleDateInRange
        highlightToday
        aria-label={name}
        size="xs"
        type="range"
        value={value}
        onChange={next => column.setFilterValue(!next[0] && !next[1] ? undefined : next)}
      />

      {/* The calendar has no input row to host a clear button; a quiet caption under it is the
          date-picker-panel convention instead. */}
      {filterValue !== undefined && (
        <Group justify="flex-end">
          <Button
            color="gray"
            size="compact-xs"
            variant="subtle"
            onClick={() => column.setFilterValue(undefined)}
          >
            {labels.clearFilter}
          </Button>
        </Group>
      )}
    </>
  );
}

function facetedOptions<TData extends RowData>(column: Column<TData, unknown>): string[] {
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
