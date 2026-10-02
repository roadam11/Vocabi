import type { ButtonHTMLAttributes, ReactNode } from "react";
import { he } from "@/i18n/he";
import { cx } from "@/lib/cx";
import { IconSpinner } from "./icons";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<ButtonVariant, string> = {
  // Hover mixes toward --ink: darker in light, lighter in dark — contrast with the label only grows.
  primary:
    "bg-accent text-on-accent ui-hover:bg-[color-mix(in_oklab,var(--accent),var(--ink)_14%)]",
  secondary:
    "border border-line-strong bg-surface text-ink ui-hover:border-ink-2 ui-hover:bg-surface-2",
  ghost: "text-accent ui-hover:bg-surface-2",
  danger: "bg-danger text-on-accent ui-hover:bg-[color-mix(in_oklab,var(--danger),var(--ink)_14%)]",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** Shows a spinner, sets aria-busy and blocks activation; the label stays for context. */
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  /** Icon-only button: square, 44px; pass the accessible name via aria-label. */
  iconOnly?: boolean;
};

export function Button({
  variant = "primary",
  loading = false,
  fullWidth = false,
  icon,
  iconOnly = false,
  disabled,
  type = "button",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-variant={variant}
      className={cx(
        "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control font-medium select-none",
        "transition-[background-color,border-color,color,scale] duration-(--duration-fast) ease-out",
        "ui-active:scale-(--press-scale) disabled:cursor-not-allowed",
        // Disabled (not loading) is dimmed; loading keeps full color so the spinner reads as progress.
        disabled && !loading && "opacity-50",
        iconOnly ? "p-2" : "px-6 py-2 text-base",
        fullWidth && "w-full",
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading ? <IconSpinner /> : icon}
      {children}
      {loading && <span className="sr-only">{he.ds.loading}</span>}
    </button>
  );
}
