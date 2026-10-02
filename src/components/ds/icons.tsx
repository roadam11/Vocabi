import type { ReactNode, SVGProps } from "react";
import { cx } from "@/lib/cx";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

/**
 * Inline SVG icons, decorative (aria-hidden) — the control that holds one supplies the name.
 * docs/DESIGN.md "RTL rules": directional icons mirror in RTL, non-directional ones never do.
 * Directional icons are drawn for LTR ("next" points right) and flipped by `rtl:-scale-x-100`.
 */
function Icon({
  name,
  directional = false,
  className,
  children,
  ...props
}: IconProps & { name: string; directional?: boolean; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
      data-directional={directional || undefined}
      className={cx("size-5 shrink-0", directional && "rtl:-scale-x-100", className)}
      {...props}
    >
      {children}
    </svg>
  );
}

/** Points toward the next item in reading order. */
export function IconChevronNext(props: IconProps) {
  return (
    <Icon name="chevron-next" directional {...props}>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  );
}

export function IconArrowNext(props: IconProps) {
  return (
    <Icon name="arrow-next" directional {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}

export function IconArrowBack(props: IconProps) {
  return (
    <Icon name="arrow-back" directional {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Icon>
  );
}

export function IconPlay(props: IconProps) {
  return (
    <Icon name="play" {...props}>
      <path d="M8 5.5v13l10-6.5z" fill="currentColor" />
    </Icon>
  );
}

export function IconSpeaker(props: IconProps) {
  return (
    <Icon name="speaker" {...props}>
      <path d="M4 9.5v5h4l5 4v-13l-5 4z" />
      <path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" />
    </Icon>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Icon name="check" {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function IconX(props: IconProps) {
  return (
    <Icon name="x" {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <Icon name="info" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </Icon>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <Icon name="alert" {...props}>
      <path d="M12 4 2.5 20h19z" />
      <path d="M12 10v4M12 17h.01" />
    </Icon>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <Icon name="calendar" {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </Icon>
  );
}

export function IconSparkle(props: IconProps) {
  return (
    <Icon name="sparkle" {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5 9 15M15 9l2.5-2.5" />
    </Icon>
  );
}

/** Loading indicator; spins only when motion is allowed (otherwise a static ring segment). */
export function IconSpinner({ className, ...props }: IconProps) {
  return (
    <Icon
      name="spinner"
      className={cx("animate-spin motion-reduce:animate-none", className)}
      {...props}
    >
      <circle cx="12" cy="12" r="8.5" opacity="0.25" />
      <path d="M20.5 12A8.5 8.5 0 0 0 12 3.5" />
    </Icon>
  );
}
