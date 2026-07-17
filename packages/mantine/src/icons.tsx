/**
 * The handful of glyphs the table chrome needs, drawn as primitive strokes — no icon-library
 * dependency, no locked icon set. All follow the host text color via `currentColor`.
 */
import type { SVGProps } from "react";

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
      strokeWidth={1.5}
      viewBox="0 0 16 16"
      width={size}
      {...others}
    >
      {children}
    </svg>
  );
}

export function IconInbox(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 3.5h11v9h-11z" />
      <path d="M2.5 9.5H6l1 1.5h2l1-1.5h3.5" />
    </Icon>
  );
}

export function IconChevronUp(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10l4-4 4 4" />
    </Icon>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6l4 4 4-4" />
    </Icon>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 4l4 4-4 4" />
    </Icon>
  );
}

/**
 * Neutral sortable affordance: both directions, quiet.
 */
export function IconSortable(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 6.5L8 3.5l3 3" />
      <path d="M5 9.5l3 3 3-3" />
    </Icon>
  );
}

export function IconFilter(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 3.5h11l-4.25 5v3.5l-2.5 1.5v-5z" />
    </Icon>
  );
}

/**
 * Drag affordance: the universal two-by-three grip.
 */
export function IconGripVertical(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="6" cy="4" fill="currentColor" r="0.85" stroke="none" />
      <circle cx="10" cy="4" fill="currentColor" r="0.85" stroke="none" />
      <circle cx="6" cy="8" fill="currentColor" r="0.85" stroke="none" />
      <circle cx="10" cy="8" fill="currentColor" r="0.85" stroke="none" />
      <circle cx="6" cy="12" fill="currentColor" r="0.85" stroke="none" />
      <circle cx="10" cy="12" fill="currentColor" r="0.85" stroke="none" />
    </Icon>
  );
}

/**
 * The three pin states speak one language — where the column sits relative to the table's edges.
 * A rotated pushpin was tried first and rejected: at 16px nobody, including its author, could
 * tell which way it pointed.
 */
export function IconPinLeft(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 3v10" />
      <path d="M13.5 8H6.5" />
      <path d="M9 5.5L6.5 8l2.5 2.5" />
    </Icon>
  );
}

export function IconPinRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 3v10" />
      <path d="M2.5 8h7" />
      <path d="M7 5.5L9.5 8l-2.5 2.5" />
    </Icon>
  );
}

/**
 * Neither edge: the column floats free between them.
 */
export function IconUnpin(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 3v10" />
      <path d="M13 3v10" />
      <path d="M6.5 8h3" />
    </Icon>
  );
}

/**
 * "Put it back the way it was": three quarters of a circle travelled counter-clockwise, with the
 * arrowhead on the tangent where it closes.
 */
export function IconRestore(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 8a5 5 0 1 0 5-5" />
      <path d="M10 1.5L8 3l2 1.5" />
    </Icon>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7" cy="7" r="4" />
      <path d="M10 10l3.5 3.5" />
    </Icon>
  );
}

export function IconX(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Icon>
  );
}

export function IconGroup(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 4.5h10" />
      <path d="M5.5 8h7.5" />
      <path d="M5.5 11.5h7.5" />
      <path d="M3 6.75V12l1.5-1" />
    </Icon>
  );
}
