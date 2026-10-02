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
      className={cx("relative h-1 w-full overflow-hidden rounded-chip bg-line", className)}
    >
      {/* --line alone is under 3:1 against the page, so a --line-strong hairline marks the track's
          extent (WCAG 1.4.11), as on MasteryRing; the accent fill covers it. No -translate-y-1/2:
          on the 4px track that lands on a half pixel and blurs below 3:1 at 1x DPR. */}
      <div className="absolute start-0 end-0 top-1/2 h-px bg-line-strong" />
      <div
        className="relative h-full rounded-chip bg-accent transition-[inline-size] duration-(--duration-slow) ease-out"
        style={{ inlineSize: `${pct}%` }}
      />
    </div>
  );
}
