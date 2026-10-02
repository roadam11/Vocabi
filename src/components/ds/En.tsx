import type { ReactNode } from "react";

/**
 * Every English fragment inside Hebrew UI goes through <En>.
 * <bdi> isolates bidi by default (unicode-bidi: isolate) — docs/DECISIONS.md #23.
 */
export function En({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" lang="en" className={className}>
      {children}
    </bdi>
  );
}
