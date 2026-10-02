"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { he } from "@/i18n/he";
import { cx } from "@/lib/cx";
import { Button } from "./Button";
import { IconAlert, IconCheck, IconInfo, IconX } from "./icons";

export type ToastTone = "info" | "success" | "danger";

const TONE_ICON = { info: IconInfo, success: IconCheck, danger: IconAlert } as const;
const TONE_ICON_COLOR = {
  info: "text-accent",
  success: "text-success",
  danger: "text-danger",
} as const;

export type ToastProps = {
  tone?: ToastTone;
  message: string;
  onDismiss?: () => void;
  className?: string;
};

/** One message: icon + text (never color alone), optional dismiss button. */
export function Toast({ tone = "info", message, onDismiss, className }: ToastProps) {
  const Icon = TONE_ICON[tone];
  return (
    <div
      data-tone={tone}
      className={cx(
        "flex min-h-11 w-full items-center gap-3 rounded-control border border-line bg-surface py-2 ps-4 pe-2 text-ink shadow-soft",
        className,
      )}
    >
      <Icon className={TONE_ICON_COLOR[tone]} />
      <p className="min-w-0 flex-1 text-base">{message}</p>
      {onDismiss && (
        <Button
          variant="ghost"
          iconOnly
          aria-label={he.ds.toast.dismiss}
          onClick={onDismiss}
          icon={<IconX />}
        />
      )}
    </div>
  );
}

type QueuedToast = { id: number; tone: ToastTone; message: string; duration: number };
type ShowToast = (toast: { tone?: ToastTone; message: string; duration?: number }) => void;

const ToastContext = createContext<ShowToast | null>(null);

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside <ToastProvider>");
  return show;
}

function AutoDismiss({ toast, onDone }: { toast: QueuedToast; onDone: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDone(toast.id), toast.duration);
    return () => window.clearTimeout(timer);
  }, [toast, onDone]);
  return (
    <Toast
      tone={toast.tone}
      message={toast.message}
      onDismiss={() => onDone(toast.id)}
      className="starting:translate-y-2 starting:opacity-0 transition-[translate,opacity] duration-(--duration-base) ease-out motion-reduce:starting:translate-y-0"
    />
  );
}

/**
 * Renders a persistent polite live region (present before any toast, so screen readers pick up
 * new messages) above the bottom safe area.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<QueuedToast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const show = useCallback<ShowToast>(({ tone = "info", message, duration = 5000 }) => {
    const id = nextId.current++;
    setToasts((ts) => [...ts.slice(-2), { id, tone, message, duration }]);
  }, []);
  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[35rem] flex-col gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <AutoDismiss toast={t} onDone={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
