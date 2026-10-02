"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from "react";
import { he } from "@/i18n/he";
import { Button } from "./Button";
import { IconX } from "./icons";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet on a native modal <dialog>: the rest of the page is inert, Esc closes, Tab and
 * Shift+Tab wrap inside the sheet, and focus returns to the opener on close.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      opener.current?.focus();
    }
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key !== "Tab") return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      // Esc fires "cancel": keep the parent's `open` state as the source of truth.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="mx-auto mt-auto mb-0 max-h-[85dvh] w-full max-w-[35rem] rounded-t-card border border-line bg-surface p-0 text-ink shadow-soft backdrop:bg-ink/40 open:flex open:flex-col transition-[translate,opacity] duration-(--duration-slow) ease-out starting:open:translate-y-8 starting:open:opacity-0 motion-reduce:starting:open:translate-y-0"
    >
      <div className="flex flex-col gap-4 overflow-y-auto px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-display-he text-xl font-bold">
            {title}
          </h2>
          <Button
            variant="ghost"
            iconOnly
            aria-label={he.ds.close}
            onClick={onClose}
            icon={<IconX />}
          />
        </div>
        {children}
      </div>
    </dialog>
  );
}
