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

export function IconDots(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="3.25" fill="currentColor" r="0.75" stroke="none" />
      <circle cx="8" cy="8" fill="currentColor" r="0.75" stroke="none" />
      <circle cx="8" cy="12.75" fill="currentColor" r="0.75" stroke="none" />
    </Icon>
  );
}

export function IconPin(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 2.5h4l-.5 4 2 2v1h-7v-1l2-2z" />
      <path d="M8 9.5V14" />
    </Icon>
  );
}

export function IconPinOff(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 2.5h4l-.5 4 2 2v1h-7v-1l2-2z" />
      <path d="M8 9.5V14" />
      <path d="M2.5 2.5l11 11" />
    </Icon>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 8s2.25-3.5 6-3.5c1 0 1.9.25 2.66.62M14 8s-2.25 3.5-6 3.5c-1 0-1.9-.25-2.66-.62" />
      <circle cx="8" cy="8" r="1.75" />
      <path d="M2.5 2.5l11 11" />
    </Icon>
  );
}

export function IconColumns(props: IconProps) {
  return (
    <Icon {...props}>
      <rect height="11" rx="1" width="12" x="2" y="2.5" />
      <path d="M6 2.5v11M10 2.5v11" />
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
