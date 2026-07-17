# Filtering

Two independent mechanisms: **per-column filters** declared on `meta.filter` (a funnel button in the header opening a popover), and a **global filter** searched from `DataTable.Search`. Both follow the standard state trios and both translate to server mode.

## Column filters

`enableColumnFilters` is on by default; a column grows a filter UI by declaring `meta.filter`:

```tsx
helper.accessor("name",   { header: "Name",   meta: { filter: "text" } }),
helper.accessor("status", { header: "Status", meta: { filter: "select" } }),
helper.accessor("tags",   { header: "Tags",   meta: { filter: "multi-select" } }),
helper.accessor("age",    { header: "Age",    meta: { filter: "range" } }),
helper.accessor("hired",  { header: "Hired",  meta: { filter: "date-range" } }),
```

The funnel trigger renders subtle while inactive and filled (`data-active`) while a value is applied; an active popover gains a clear button; clearing sets the filter value back to `undefined`.

### Variants

| Variant | Control | Filter function | Value shape |
| --- | --- | --- | --- |
| `text` | `TextInput`, debounced 200 ms | `includesString` (case-insensitive substring) | `string` |
| `select` | clearable, searchable `Select` | `equalsString` | `string` |
| `multi-select` | clearable, searchable `MultiSelect` | `ledger-one-of` — **strict set membership** | `string[]` |
| `range` | two `NumberInput` bounds; faceted min/max as placeholders | `inNumberRange` | `[min?, max?]` |
| `date-range` | an inline `@mantine/dates` range calendar (`DatePicker type="range"`; month names and first weekday follow the host's `DatesProvider` locale) | `ledger-date-range` | `[fromISO \| null, toISO \| null]` |

Two functions are ledger-registered because TanStack's built-ins have the wrong semantics:

- **`ledger-one-of`** — "the cell value is one of the chosen options", exactly. TanStack's `arrIncludesSome` expects an array row value and degrades to substring matching on scalars (choosing `active` would also match `inactive`).
- **`ledger-date-range`** — inclusive `[from, to]` over anything `new Date()` can parse; the `to` bound covers its entire day, so `2026-07-16 → 2026-07-16` matches every timestamp within that date. Rows whose value is missing or unparseable never match.

Both auto-remove when emptied (clearing every option or both bounds removes the filter entirely).

### Config and custom filter functions

The string shorthand expands to a config; use the object form for options or a placeholder:

```tsx
meta: {
  filter: {
    variant: "select",
    options: [
      { value: "active", label: "Active" },
      { value: "suspended", label: "Suspended" }
    ],
    placeholder: "Any status"
  }
}
```

The variant mapping only fills a gap — a column that declares its own `filterFn` keeps it, and the variant contributes just the UI:

```tsx
helper.accessor("owner", {
  filterFn: (row, columnId, value: string) => row.original.ownerAliases.includes(value),
  meta: { filter: "select" }
});
```

### Faceted options

When a `select` / `multi-select` column gives no `options`:

- **Client mode** derives them from the column's faceted unique values — deduplicated, stringified, array values flattened, `null`/empty skipped, sorted, capped at 100.
- **Server mode** has no client rows to facet, so explicit `options` are required; without them the control degrades to a `text` filter with a dev-mode warning.

### Fully custom filter UI

`meta.filter` also accepts a render function receiving the typed `Column`; render any control and drive `column.setFilterValue` yourself:

```tsx
meta: {
  filter: column => (
    <SegmentedControl
      value={(column.getFilterValue() as string) ?? "all"}
      onChange={value => column.setFilterValue(value === "all" ? undefined : value)}
      data={["all", "active", "suspended"]}
    />
  )
}
```

Inside the popover, Mantine combobox-based controls must render in place — pass `comboboxProps={{ withinPortal: false }}` as ledger's own variants do. A body-level portal reads as an outside click and closes the popover mid-interaction.

## Global filter

`enableGlobalFilter` (default `false`) wires TanStack's global filtering; `DataTable.Search` is the input:

```tsx
const table = useDataTable({ …, enableGlobalFilter: true });

<DataTable.Search table={table} w={260} debounce={200} />
```

- Accepts every `TextInput` prop except the value trio; `debounce` (default 200 ms) delays application, a clear button appears while non-empty, and the input follows external resets (a programmatic `setGlobalFilter("")`, a controlled slice).
- Columns opt out with `enableGlobalFilter: false` on their def; a custom matcher goes through `tableOptions.globalFilterFn`.
- State rides the `globalFilter` trio (`globalFilter` / `defaultGlobalFilter` / `onGlobalFilterChange`).

## Server mode

`filterMode: "server"` sets TanStack's `manualFiltering` and omits the client filtered/faceted row models — rows arrive pre-filtered, and `onColumnFiltersChange` / `onGlobalFilterChange` drive the refetch. Remember: server mode needs explicit `options` on select-family variants, and with server pagination a filter change resets `pageIndex` to 0 ([state.md](state.md)).
