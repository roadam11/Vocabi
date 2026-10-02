import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

export type EmptyStateProps = {
  title: string;
  body?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, body, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cx("flex flex-col items-center gap-3 px-6 py-8 text-center", className)}>
      {icon && (
        <span className="flex size-12 items-center justify-center rounded-chip bg-accent-soft text-ink">
          {icon}
        </span>
      )}
      <h3 className="font-display-he text-xl font-bold">{title}</h3>
      {body && <p className="max-w-[28rem] text-ink-2">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
