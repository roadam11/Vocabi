import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import {
  aggregateRingLabel,
  aggregateSegments,
  type LayerShares,
  senseRingLabel,
  senseSegments,
  type SenseLayers,
} from "./masteryRing";

export type MasteryRingProps = (
  { variant: "sense"; layers: SenseLayers } | { variant: "aggregate"; shares: LayerShares }
) & {
  /** Rendered size; default 4rem. */
  size?: "sm" | "md" | "lg";
  /** Optional visible center content (e.g. "2/3"); the aria-label is always the full description. */
  children?: ReactNode;
  className?: string;
};

const SIZES = { sm: "size-10", md: "size-16", lg: "size-28" } as const;

const R = 42;
const C = 2 * Math.PI * R;
const GAP = 5; // in stroke-length units, between segments

/**
 * The signature element (docs/DESIGN.md, DECISIONS #2). Segments run clockwise from the top in
 * fixed layer order; filled = --accent, remaining = --line track. Never color-only: role="img"
 * with a complete aria-label.
 */
export function MasteryRing(props: MasteryRingProps) {
  const { size = "md", children, className } = props;
  const segments =
    props.variant === "sense" ? senseSegments(props.layers) : aggregateSegments(props.shares);
  const label =
    props.variant === "sense" ? senseRingLabel(props.layers) : aggregateRingLabel(props.shares);
  const n = segments.length;
  const slot = C / n;
  const len = n > 1 ? slot - GAP : C;

  return (
    <div
      role="img"
      aria-label={label}
      data-segments={n}
      className={cx("relative inline-grid shrink-0 place-items-center", SIZES[size], className)}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden="true">
        <g transform="rotate(-90 50 50)" fill="none" strokeWidth={8} strokeLinecap="butt">
          {segments.map((s, i) => {
            const offset = -(i * slot + (n > 1 ? GAP / 2 : 0));
            return (
              <g key={s.layer} data-layer={s.layer}>
                <circle
                  cx={50}
                  cy={50}
                  r={R}
                  className="stroke-line"
                  strokeDasharray={`${len} ${C}`}
                  strokeDashoffset={offset}
                />
                {s.fill > 0 && (
                  <circle
                    cx={50}
                    cy={50}
                    r={R}
                    className="stroke-accent transition-[stroke-dasharray] duration-(--duration-slow) ease-out"
                    strokeDasharray={`${len * s.fill} ${C}`}
                    strokeDashoffset={offset}
                  />
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {children && (
        <span aria-hidden="true" className="relative text-sm font-bold tabular-nums">
          {children}
        </span>
      )}
    </div>
  );
}
