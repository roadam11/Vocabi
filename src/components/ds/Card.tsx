import type { HTMLAttributes } from "react";
import { cx } from "@/lib/cx";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Flat cards (inside another surface) drop the single soft shadow. */
  flat?: boolean;
};

/** Surface container. --line is a decorative outline here; it carries no meaning on its own. */
export function Card({ flat = false, className, ...props }: CardProps) {
  return (
    <div
      className={cx(
        "rounded-card border border-line bg-surface p-6 text-ink",
        !flat && "shadow-soft",
        className,
      )}
      {...props}
    />
  );
}
