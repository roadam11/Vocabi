import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

export type StatProps = {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  className?: string;
};

/** A single number with its label. Numbers use tabular figures (they change between sessions). */
export function Stat({ label, value, hint, icon, className }: StatProps) {
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <span className="flex items-center gap-2 text-sm text-ink-2">
        {icon}
        {label}
      </span>
      <span className="text-3xl leading-tight font-bold text-ink tabular-nums">{value}</span>
      {hint && <span className="text-sm text-ink-2 tabular-nums">{hint}</span>}
    </div>
  );
}
