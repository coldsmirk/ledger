import type { ComponentType, SVGProps } from "react";

/**
 * The table chrome's glyphs and the `icons` registry that swaps them (docs/styling.md#icons).
 *
 * The defaults are vendored from Lucide (https://lucide.dev): path data copied verbatim from
 * `lucide-static` v1.34.0, so there is no icon-library dependency and the set is a default, not
 * a lock — any component satisfying `DataTableIconProps` slots in, and `lucide-react` components
 * satisfy it as-is.
 *
 * License of the vendored path data — ISC, Copyright (c) 2026 Lucide Icons and Contributors:
 * permission to use, copy, modify, and/or distribute this software for any purpose with or
 * without fee is hereby granted, provided that the above copyright notice and this permission
 * notice appear in all copies. The chevron, search and x glyphs are derived from Feather
 * (MIT, Copyright (c) 2013-present Cole Bemis).
 */
interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function Icon({
  size = 16,
  children,
  ...others
}: IconProps) {
  return (
    <svg
      aria-hidden
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={size}
      {...others}
    >
      {children}
    </svg>
  );
}

// Glyphs, named for their Lucide source icons. Module-private: components reach them through
// the resolved registry, never directly.

function IconInbox(props: IconProps) {
  return (
    <Icon {...props}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </Icon>
  );
}

function IconTriangleAlert(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Icon>
  );
}

function IconChevronUp(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m18 15-6-6-6 6" />
    </Icon>
  );
}

function IconChevronDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

function IconChevronRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  );
}

function IconChevronsUpDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m7 15 5 5 5-5" />
      <path d="m7 9 5-5 5 5" />
    </Icon>
  );
}

function IconFunnel(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z" />
    </Icon>
  );
}

function IconGripVertical(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="5" r="1" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="15" cy="19" r="1" />
    </Icon>
  );
}

/**
 * The three pin states speak one language — where the column sits relative to the table's edges
 * (a pushpin cannot say start from end, which is why `pin` / `pin-off` were passed over).
 */
function IconArrowLeftToLine(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 19V5" />
      <path d="m13 6-6 6 6 6" />
      <path d="M7 12h14" />
    </Icon>
  );
}

function IconArrowRightToLine(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M17 12H3" />
      <path d="m11 18 6-6-6-6" />
      <path d="M21 5v14" />
    </Icon>
  );
}

/**
 * Neither edge: the column moves with the scroll again.
 */
function IconMoveHorizontal(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m18 8 4 4-4 4" />
      <path d="M2 12h20" />
      <path d="m6 8-4 4 4 4" />
    </Icon>
  );
}

/**
 * "Put it back the way it was": counter-clockwise is the industry's undo, clockwise its
 * refresh — the table shows both, so they must not be the same glyph.
 */
function IconRotateCcw(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </Icon>
  );
}

function IconRotateCw(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </Icon>
  );
}

function IconSearch(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m21 21-4.34-4.34" />
      <circle cx="11" cy="11" r="8" />
    </Icon>
  );
}

function IconX(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  );
}

function IconListTree(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 5h13" />
      <path d="M13 12h8" />
      <path d="M13 19h8" />
      <path d="M3 10a2 2 0 0 0 2 2h3" />
      <path d="M3 5v12a2 2 0 0 0 2 2h3" />
    </Icon>
  );
}

/**
 * What a replacement icon receives — the two knobs the chrome actually turns. Lucide icons are
 * drawn on a 24px grid at stroke 2; a custom component is free to ignore either.
 */
export interface DataTableIconProps {
  /**
   * Rendered width and height in px. The chrome passes 12–16 for controls and 40 for the
   * empty/error indicators.
   */
  size?: number;
  strokeWidth?: number;
}

export type DataTableIconComponent = ComponentType<DataTableIconProps>;

/**
 * Every glyph the table chrome renders, one slot per affordance. Slots are named for the
 * `DataTableLabels` key of the same affordance where one exists (`pinStart`, `retry`,
 * `clearSelection`, …), so the two registries read as one vocabulary.
 */
export interface DataTableIcons {
  /* Header */
  sortAsc: DataTableIconComponent;
  sortDesc: DataTableIconComponent;
  /**
   * The neutral both-directions affordance an unsorted sortable column shows.
   */
  sortable: DataTableIconComponent;
  filterColumn: DataTableIconComponent;

  /* Rows — one chevron, rotated open by the stylesheet (expand-all and groups included). */
  expandRow: DataTableIconComponent;

  /* States */
  empty: DataTableIconComponent;
  noResults: DataTableIconComponent;
  error: DataTableIconComponent;
  retry: DataTableIconComponent;

  /* Global search */
  search: DataTableIconComponent;

  /* Selection */
  clearSelection: DataTableIconComponent;

  /* Columns panel */
  resetColumns: DataTableIconComponent;
  reorderColumn: DataTableIconComponent;
  /**
   * Both the group toggle and the grouped rest-state mark.
   */
  groupByColumn: DataTableIconComponent;
  pinStart: DataTableIconComponent;
  unpin: DataTableIconComponent;
  pinEnd: DataTableIconComponent;
}

export const defaultIcons: DataTableIcons = {
  sortAsc: IconChevronUp,
  sortDesc: IconChevronDown,
  sortable: IconChevronsUpDown,
  filterColumn: IconFunnel,
  expandRow: IconChevronRight,
  empty: IconInbox,
  noResults: IconSearch,
  error: IconTriangleAlert,
  retry: IconRotateCw,
  search: IconSearch,
  clearSelection: IconX,
  resetColumns: IconRotateCcw,
  reorderColumn: IconGripVertical,
  groupByColumn: IconListTree,
  pinStart: IconArrowLeftToLine,
  unpin: IconMoveHorizontal,
  pinEnd: IconArrowRightToLine
};

export function resolveIcons(icons: Partial<DataTableIcons> | undefined): DataTableIcons {
  return icons ? { ...defaultIcons, ...icons } : defaultIcons;
}
