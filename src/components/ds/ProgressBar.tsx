import { he } from "@/i18n/he";
import { cx } from "@/lib/cx";

export type ProgressBarProps = {
  value: number;
  max: number;
  /** Accessible name; defaults to a generic "progress". */
  label?: string;
  className?: string;
};

/** Thin bar for the top of a session. Fills from inline-start (the right edge in RTL). */
export function ProgressBar({
  value,
  max,
  label = he.ds.progressBar.label,
  className,
}: ProgressBarProps) {
  const clamped = Math.min(Math.max(value, 0), max);
  const pct = max > 0 ? (clamped / max) * 100 : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={clamped}
      className={cx("h-1 w-full overflow-hidden rounded-chip bg-line", className)}
    >
      <div
        className="h-full rounded-chip bg-accent transition-[inline-size] duration-(--duration-slow) ease-out"
        style={{ inlineSize: `${pct}%` }}
      />
    </div>
  );
}
