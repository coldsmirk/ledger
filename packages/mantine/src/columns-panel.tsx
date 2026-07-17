import type { DragEndEvent } from "@dnd-kit/react";
import type { PopoverProps } from "@mantine/core";
import type { Column, ColumnPinningPosition, Table } from "@tanstack/react-table";
import type { CSSProperties, ReactElement } from "react";

import type { DataTableLabels } from "./labels";
import type { TableInstance } from "./types";

/**
 * `DataTable.ColumnsPanel` — one surface for every column-layout decision: order (drag),
 * visibility, pinning, width, and grouping. It replaces the per-column header menu, whose
 * "hide column" item was a trap door — a hidden column took its own menu with it.
 *
 * Trigger-agnostic by construction. `children` IS the trigger and the panel opens from it in a
 * Popover; with no children the panel renders bare, so a drawer, a sidebar, or a settings page
 * hosts it just as well. Bare is the primary shape — the rest of the compound family
 * (`.Search` / `.Pagination` / `.SelectionBar`) is bare content the page places, too.
 *
 * Presentation contract (docs/columns.md): at rest a row is identity — checkbox and name — plus
 * dimmed marks only where the layout deviates from default (captions over pinned zones, an
 * overridden width, a grouped column, a dimmed hidden name). The machinery — drag handle, width
 * field, pin segment, group toggle — surfaces on the hovered or keyboard-focused row and stays
 * inline where hover does not exist. The reveal is stylesheet-only: every control is always in
 * the DOM and the accessibility tree.
 */
import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Popover,
  Text,
  useProps
} from "@mantine/core";
import clsx from "clsx";

import { columnHeaderText, isInternalColumn, rawColumnSizing } from "./build-columns";
import { applyCenterOrder, resolveColumnOrder } from "./column-order";
import { IconGripVertical, IconGroup, IconPinLeft, IconPinRight, IconRestore, IconUnpin } from "./icons";
import { resolveLabels } from "./labels";

export interface DataTableColumnsPanelProps<TData> {
  table: TableInstance<TData>;
  /**
   * The control that opens the panel, wrapped as the Popover target — a button, an icon in a
   * header cell, anything. Omitted: the panel renders bare for a drawer, a sidebar, or a page
   * of its own.
   */
  children?: ReactElement;
  /**
   * Forwarded to the Popover; only meaningful alongside a trigger.
   */
  popoverProps?: Omit<PopoverProps, "children">;
  labels?: Partial<DataTableLabels>;
  className?: string;
  style?: CSSProperties;
}

/**
 * The three lists the panel renders, in table display order. `left` / `center` / `right` are
 * TanStack's own words (`getLeftLeafColumns` / `getCenterLeafColumns` / `getRightLeafColumns`);
 * "zone" is ledger's collective noun for them, because TanStack names the accessors but never
 * the set.
 */
type ColumnZone = "left" | "center" | "right";

interface ColumnsPanelZone<TData> {
  id: ColumnZone;
  columns: Array<Column<TData, unknown>>;
}

/**
 * Leaf columns per zone — hidden ones included (bringing them back is what the panel is for) and
 * ledger's injected columns excluded (they can never be reordered, hidden, or unpinned). The
 * order is TanStack's: a pinned zone reads its `columnPinning` array, the center reads
 * `columnOrder`.
 */
function resolveZones<TData>(table: Table<TData>): Array<ColumnsPanelZone<TData>> {
  const external = (columns: Array<Column<TData, unknown>>) => columns.filter(column => !isInternalColumn(column.id));

  return [
    { id: "left", columns: external(table.getLeftLeafColumns()) },
    { id: "center", columns: external(table.getCenterLeafColumns()) },
    { id: "right", columns: external(table.getRightLeafColumns()) }
  ];
}

/**
 * The pinned zones caption themselves; the center is the default territory and stays unlabeled.
 */
const zoneCaptionKeys = {
  left: "pinnedLeft",
  right: "pinnedRight"
} satisfies Partial<Record<ColumnZone, keyof DataTableLabels>>;

/**
 * The three-state position control, one segment per TanStack `ColumnPinningPosition`.
 */
const pinSegments: Array<{
  position: ColumnPinningPosition;
  labelKey: "pinLeft" | "unpin" | "pinRight";
  Glyph: typeof IconPinLeft;
}> = [
  {
    position: "left",
    labelKey: "pinLeft",
    Glyph: IconPinLeft
  },
  {
    position: false,
    labelKey: "unpin",
    Glyph: IconUnpin
  },
  {
    position: "right",
    labelKey: "pinRight",
    Glyph: IconPinRight
  }
];

const columnsPanelDefaultProps = {} satisfies Partial<DataTableColumnsPanelProps<unknown>>;

export function DataTableColumnsPanel<TData>(props: DataTableColumnsPanelProps<TData>) {
  const {
    table,
    children,
    popoverProps,
    labels,
    className,
    style
  } = useProps("DataTableColumnsPanel", columnsPanelDefaultProps, props);

  const content = (
    <ColumnsPanelContent
      className={className}
      labels={resolveLabels(labels)}
      style={style}
      table={table}
    />
  );

  if (!children) {
    return content;
  }

  // 360 fits the widest row a column can ask for — handle, checkbox, a comfortable title, and
  // the revealed toolbar — so the default never squeezes; `popoverProps` tunes it for column
  // sets that need less or titles that need more.
  return (
    <Popover position="bottom-end" shadow="md" width={360} {...popoverProps}>
      <Popover.Target>{children}</Popover.Target>

      {/* A dropdown grows without bound, so it gets a definite cap here and the panel's own list
          becomes the scroller; p={0} because the panel brings its own padding. */}
      <Popover.Dropdown display="flex" mah="60vh" p={0}>
        {content}
      </Popover.Dropdown>
    </Popover>
  );
}

interface ColumnsPanelContentProps<TData> {
  table: Table<TData>;
  labels: DataTableLabels;
  className?: string;
  style?: CSSProperties;
}

function ColumnsPanelContent<TData>({
  table,
  labels,
  className,
  style
}: ColumnsPanelContentProps<TData>) {
  const zones = resolveZones(table);

  // The same rule the header drag applies (use-column-reorder.ts): with column groups, sibling
  // order inside a group is ambiguous — that hook already carries the dev warning.
  const orderable
    = table.options.meta?.ledger?.enableColumnOrdering === true
      && table.getHeaderGroups().length === 1;

  const zoneIds = (id: ColumnZone) => zones.find(zone => zone.id === id)?.columns.map(column => column.id) ?? [];

  const handleDragEnd = (event: DragEndEvent) => {
    const { source } = event.operation;

    if (event.canceled || !source) {
      return;
    }

    const zone = zones.find(candidate => candidate.columns.some(column => column.id === source.id));

    if (!zone) {
      return;
    }

    const ids = zone.columns.map(column => column.id);
    const next = move(ids, event);

    if (next === ids) {
      return;
    }

    if (zone.id === "center") {
      table.setColumnOrder(applyCenterOrder(resolveColumnOrder(table), next));

      return;
    }

    // Assembled from the panel's own zone lists, never from `getState().columnPinning`: that one
    // carries the injected column ids useDataTable merges in on every render, and echoing them
    // back would leak `ledger:*` into the consumer's onColumnPinningChange and persisted state.
    table.setColumnPinning({
      left: zone.id === "left" ? next : zoneIds("left"),
      right: zone.id === "right" ? next : zoneIds("right")
    });
  };

  const handleReset = () => {
    // Exactly the layout set `persistState` persists by default (docs/state.md). Each reset
    // targets `table.initialState`, which useDataTable seeds from the `defaultX` options — so
    // this restores the application's declared layout, not merely an empty one.
    table.resetColumnOrder();
    table.resetColumnVisibility();
    table.resetColumnPinning();
    table.resetColumnSizing();
  };

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      <div className={clsx("ledger-columns-panel", className)} style={style}>
        <Group className="ledger-columns-panel-header" gap="xs" justify="space-between" wrap="nowrap">
          <Text fw={600} size="sm">
            {labels.columnsPanel}
          </Text>

          <Button
            color="gray"
            leftSection={<IconRestore size={14} />}
            size="compact-xs"
            variant="subtle"
            onClick={handleReset}
          >
            {labels.resetColumns}
          </Button>
        </Group>

        <div className="ledger-columns-panel-list">
          {zones
            .filter(zone => zone.columns.length > 0)
            .map(zone => (
              <div key={zone.id} className="ledger-columns-panel-zone">
                {zone.id !== "center" && (
                  <Text c="dimmed" className="ledger-columns-panel-zone-label" fw={500} size="xs">
                    {labels[zoneCaptionKeys[zone.id]]}
                  </Text>
                )}

                {zone.columns.map((column, index) => (
                  <ColumnsPanelItem
                    key={column.id}
                    column={column}
                    index={index}
                    labels={labels}
                    orderable={orderable}
                    table={table}
                    zone={zone.id}
                  />
                ))}
              </div>
            ))}
        </div>
      </div>
    </DragDropProvider>
  );
}

interface ColumnsPanelItemProps<TData> {
  column: Column<TData, unknown>;
  table: Table<TData>;
  labels: DataTableLabels;
  index: number;
  zone: ColumnZone;
  orderable: boolean;
}

function ColumnsPanelItem<TData>({
  column,
  table,
  labels,
  index,
  zone,
  orderable
}: ColumnsPanelItemProps<TData>) {
  // `type`/`accept` both carry the zone, so a column only ever sorts among its own kind: moving
  // between zones is what the pin controls are for, and an empty zone has no drop target anyway.
  const {
    ref,
    handleRef,
    isDragging
  } = useSortable({
    id: column.id,
    index,
    group: zone,
    type: zone,
    accept: zone,
    disabled: !orderable
  });

  const title = columnHeaderText(column);
  const pinned = column.getIsPinned();
  const grouped = column.getIsGrouped();
  const canPin = column.getCanPin();
  const canResize = table.options.enableColumnResizing === true && column.getCanResize();
  const canGroup = table.options.enableGrouping === true && column.getCanGroup();

  // The field holds the OVERRIDE; empty falls back to whatever the definition prescribes — the
  // author's `size`, or growing where none is declared. The placeholder shows that fallback
  // rather than a blanket "auto", which would misdescribe every column that declares a size.
  // Author sizing comes from the RAW registry, never `columnDef.size`: TanStack merges its
  // `size: 150` default into every resolved definition, which would make "unsized"
  // unrepresentable (docs/sizing.md).
  const width = table.getState().columnSizing[column.id];
  const declaredWidth = rawColumnSizing(column.columnDef)?.size ?? table.options.defaultColumn?.size;

  const handleWidthChange = (value: number | string) => {
    table.setColumnSizing(previous => {
      // Cleared: drop the entry entirely rather than zeroing it — the same move the resize drag
      // makes on Escape (use-column-resize.ts), and the only state the width engine reads as
      // "no override" (docs/sizing.md).
      if (value === "") {
        const { [column.id]: _dropped, ...rest } = previous;

        return rest;
      }

      return { ...previous, [column.id]: Number(value) };
    });
  };

  return (
    <Group
      ref={ref}
      className="ledger-columns-panel-item"
      data-dragging={isDragging || undefined}
      data-hidden={!column.getIsVisible() || undefined}
      gap="xs"
      wrap="nowrap"
    >
      {orderable && (
        <ActionIcon
          ref={handleRef}
          aria-label={labels.reorderColumn}
          className="ledger-columns-panel-handle"
          color="gray"
          size="sm"
          title={labels.reorderColumn}
          variant="subtle"
        >
          <IconGripVertical />
        </ActionIcon>
      )}

      {/* miw={0} is load-bearing: a flex item defaults to `min-width: auto`, so the nowrap title
          would set an unshrinkable floor — long names would shove the rest of the row instead of
          ellipsing. The tooltip rides `wrapperProps` because Checkbox forwards bare props to its
          INPUT, and a title there would only answer on the box, never on the truncated text. */}
      <Checkbox
        checked={column.getIsVisible()}
        classNames={{ labelWrapper: "ledger-columns-panel-label" }}
        disabled={!column.getCanHide()}
        flex={1}
        label={title}
        miw={0}
        size="sm"
        wrapperProps={{ title }}
        onChange={event => column.toggleVisibility(event.currentTarget.checked)}
      />

      {/* Rest-state marks for the two deviations the zone captions cannot carry. The toolbar
          covers them while revealed, and the touch stylesheet drops them outright — there the
          real controls sit inline and already say the same thing. */}
      {(grouped || width !== undefined) && (
        <Group c="dimmed" className="ledger-columns-panel-indicators" gap={6} wrap="nowrap">
          {grouped && <IconGroup size={12} />}
          {width !== undefined && <Text size="xs">{width}</Text>}
        </Group>
      )}

      {(canResize || canGroup || canPin) && (
        <div className="ledger-columns-panel-controls">
          {canResize && (
            <NumberInput
              hideControls
              aria-label={labels.columnWidth}
              max={column.columnDef.maxSize}
              min={column.columnDef.minSize}
              placeholder={declaredWidth === undefined ? labels.columnWidthAuto : String(declaredWidth)}
              size="xs"
              value={width ?? ""}
              w={72}
              onChange={handleWidthChange}
            />
          )}

          {canGroup && (
            <ActionIcon
              aria-label={grouped ? labels.ungroupColumn : labels.groupByColumn}
              aria-pressed={grouped}
              size="input-xs"
              title={grouped ? labels.ungroupColumn : labels.groupByColumn}
              variant={grouped ? "light" : "default"}
              onClick={() => column.toggleGrouping()}
            >
              <IconGroup />
            </ActionIcon>
          )}

          {canPin && (
            <ActionIcon.Group>
              {pinSegments.map(({
                position,
                labelKey,
                Glyph
              }) => (
                <ActionIcon
                  key={labelKey}
                  aria-label={labels[labelKey]}
                  aria-pressed={pinned === position}
                  size="input-xs"
                  title={labels[labelKey]}
                  variant={pinned === position ? "light" : "default"}
                  onClick={() => column.pin(position)}
                >
                  <Glyph />
                </ActionIcon>
              ))}
            </ActionIcon.Group>
          )}
        </div>
      )}
    </Group>
  );
}
