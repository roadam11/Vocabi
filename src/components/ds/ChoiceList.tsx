"use client";

import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { interpolate } from "@/i18n/format";
import { he } from "@/i18n/he";
import { cx } from "@/lib/cx";
import { IconCheck, IconX } from "./icons";

export type Choice = { id: string; label: ReactNode };

export type ChoiceListProps = {
  /** 2-4 options, already shuffled by the engine. */
  options: readonly Choice[];
  correctId: string;
  onAnswer?: (id: string, correct: boolean) => void;
  /** Accessible name of the group (the question), when there is no visible label to reference. */
  label?: string;
  /** id of a visible question element; preferred over `label`. */
  labelledBy?: string;
  /**
   * Keys 1-4 select an option. Listens on the whole page, so enable it on one list per screen
   * (the session shows one). Ignored with modifier keys and while typing in a field.
   */
  shortcuts?: boolean;
  /** Pre-answered state (resume after reload, or the /design showcase). */
  initialAnswerId?: string;
  disabled?: boolean;
  className?: string;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Multiple choice (recognition / context layers). Answer once: further taps and keys are ignored
 * (double-tap counts once). The result is announced via a polite live region and shown with
 * icon + text, never color alone (docs/DESIGN.md "Accessibility").
 */
export function ChoiceList({
  options,
  correctId,
  onAnswer,
  label,
  labelledBy,
  shortcuts = true,
  initialAnswerId,
  disabled = false,
  className,
}: ChoiceListProps) {
  const [answerId, setAnswerId] = useState<string | undefined>(initialAnswerId);
  const answeredRef = useRef(initialAnswerId !== undefined);
  const hintId = useId();
  const answered = answerId !== undefined;
  const locked = answered || disabled;

  const answer = useCallback(
    (id: string) => {
      if (answeredRef.current || disabled) return;
      answeredRef.current = true;
      setAnswerId(id);
      onAnswer?.(id, id === correctId);
    },
    [correctId, disabled, onAnswer],
  );

  useEffect(() => {
    if (!shortcuts || locked) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTypingTarget(e.target)) return;
      const n = /^(?:Digit|Numpad)([1-4])$/.exec(e.code)?.[1] ?? /^[1-4]$/.exec(e.key)?.[0];
      if (!n) return;
      const option = options[Number(n) - 1];
      if (!option) return;
      e.preventDefault();
      answer(option.id);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts, locked, options, answer]);

  const correct = options.find((o) => o.id === correctId);
  const isCorrect = answerId === correctId;

  return (
    <div
      role="group"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={shortcuts ? hintId : undefined}
      className={cx("flex flex-col gap-3", className)}
    >
      {shortcuts && (
        <p id={hintId} className="sr-only">
          {he.ds.choiceList.keyHint}
        </p>
      )}
      <ol className="flex flex-col gap-3">
        {options.map((option, i) => {
          const chosen = option.id === answerId;
          const state = !answered
            ? "idle"
            : option.id === correctId
              ? "correct"
              : chosen
                ? "wrong"
                : "other";
          return (
            <li key={option.id}>
              <button
                type="button"
                data-state={state}
                aria-disabled={locked || undefined}
                aria-keyshortcuts={shortcuts ? String(i + 1) : undefined}
                onClick={() => answer(option.id)}
                className={cx(
                  "flex min-h-14 w-full items-center gap-3 rounded-control border px-4 py-3 text-start text-lg",
                  "transition-[background-color,border-color,scale] duration-(--duration-fast) ease-out",
                  state === "idle" &&
                    "border-line-strong bg-surface text-ink ui-hover:border-ink-2 ui-hover:bg-surface-2 ui-active:scale-(--press-scale)",
                  state === "correct" && "border-success bg-success-soft text-ink",
                  state === "wrong" && "border-danger bg-danger-soft text-ink",
                  state === "other" && "border-line bg-surface text-ink-2",
                  disabled && !answered && "cursor-not-allowed opacity-50",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-chip text-sm font-medium tabular-nums",
                    state === "correct"
                      ? "bg-success text-on-accent"
                      : state === "wrong"
                        ? "bg-danger text-on-accent"
                        : "bg-surface-2 text-ink-2",
                  )}
                >
                  {state === "correct" ? (
                    <IconCheck className="size-4" />
                  ) : state === "wrong" ? (
                    <IconX className="size-4" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="min-w-0 flex-1 break-words">{option.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {/* Always rendered so screen readers register the live region before it changes. */}
      <p
        role="status"
        aria-live="polite"
        data-testid="choice-feedback"
        className={cx(
          "flex min-h-7 items-center gap-2 font-medium",
          isCorrect ? "text-success" : "text-danger",
        )}
      >
        {answered && (isCorrect ? <IconCheck /> : <IconX />)}
        {answered &&
          (isCorrect ? (
            he.ds.choiceList.correct
          ) : (
            <span>
              {he.ds.choiceList.wrong}{" "}
              {interpolate(he.ds.choiceList.correctAnswerIs, {
                answer: <span key="a">{correct?.label}</span>,
              })}
            </span>
          ))}
      </p>
    </div>
  );
}
