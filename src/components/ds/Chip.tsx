import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { IconCheck } from "./icons";

export type ChipTone = "neutral" | "accent" | "success" | "danger";

// --accent text on --accent-soft is 4.33:1 in light (fails AA), so the accent tint uses --ink text.
const TONES: Record<ChipTone, string> = {
  neutral: "border border-line bg-surface-2 text-ink-2",
  accent: "bg-accent-soft text-ink",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
};

type StaticChipProps = {
  tone?: ChipTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
};

type ToggleChipProps = {
  /** Selectable chip (e.g. goal or minutes choice): a toggle button with aria-pressed. */
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
};

export function Chip(props: StaticChipProps | ToggleChipProps) {
  if ("pressed" in props) {
    const { pressed, onPressedChange, disabled, children, className } = props;
    return (
      <button
        type="button"
        aria-pressed={pressed}
        disabled={disabled}
        onClick={() => onPressedChange(!pressed)}
        className={cx(
          "inline-flex min-h-11 items-center gap-2 rounded-chip border px-4 text-base font-medium",
          "transition-[background-color,border-color,scale] duration-(--duration-fast) ease-out",
          "ui-active:scale-(--press-scale) disabled:cursor-not-allowed disabled:opacity-50",
          // Unselected boundary is --line-strong (≥3:1); selected uses --accent (≥3:1 on accent-soft).
          pressed
            ? "border-accent bg-accent-soft text-ink"
            : "border-line-strong bg-surface text-ink ui-hover:bg-surface-2",
          className,
        )}
      >
        {/* Selection is never color-only: a check mark appears too. */}
        {pressed && <IconCheck className="size-4" />}
        {children}
      </button>
    );
  }

  const { tone = "neutral", icon, children, className } = props;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-chip px-3 py-0.5 text-sm font-medium",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
