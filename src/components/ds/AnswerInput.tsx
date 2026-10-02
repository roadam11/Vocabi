"use client";

import { type FormEvent, useId, useState } from "react";
import { he } from "@/i18n/he";
import { cx } from "@/lib/cx";
import { Button } from "./Button";
import { IconAlert } from "./icons";

export type AnswerInputProps = {
  onSubmit: (value: string) => void;
  onDontKnow?: () => void;
  label?: string;
  /** External error (e.g. from the checker); an empty submit shows its own message. */
  error?: string;
  disabled?: boolean;
  loading?: boolean;
  defaultValue?: string;
  autoFocus?: boolean;
  className?: string;
};

/**
 * Production layer: type the English word. Input attributes are exactly those required by
 * docs/DESIGN.md "RTL rules" (dir/lang/autocapitalize/autocorrect/spellcheck/inputmode).
 */
export function AnswerInput({
  onSubmit,
  onDontKnow,
  label = he.ds.answerInput.label,
  error,
  disabled = false,
  loading = false,
  defaultValue = "",
  autoFocus,
  className,
}: AnswerInputProps) {
  const inputId = useId();
  const messageId = useId();
  const [value, setValue] = useState(defaultValue);
  const [emptyError, setEmptyError] = useState(false);
  const message = error ?? (emptyError ? he.ds.answerInput.empty : undefined);
  const locked = disabled || loading;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (locked) return;
    const trimmed = value.trim();
    if (!trimmed) {
      setEmptyError(true);
      return;
    }
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={submit} noValidate className={cx("flex flex-col gap-3", className)}>
      <label htmlFor={inputId} className="font-medium">
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        dir="ltr"
        lang="en"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        autoComplete="off"
        enterKeyHint="done"
        autoFocus={autoFocus}
        disabled={disabled}
        readOnly={loading}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (emptyError) setEmptyError(false);
        }}
        aria-invalid={message ? true : undefined}
        aria-describedby={messageId}
        className={cx(
          "min-h-12 w-full rounded-control border bg-surface px-4 text-xl text-ink",
          "transition-[border-color] duration-(--duration-fast) ease-out",
          "disabled:cursor-not-allowed disabled:opacity-50",
          message ? "border-danger" : "border-line-strong ui-hover:border-ink-2",
        )}
      />
      <p
        id={messageId}
        role="status"
        aria-live="polite"
        className="flex min-h-6 items-center gap-2 text-sm font-medium text-danger"
      >
        {message && <IconAlert className="size-4" />}
        {message}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={loading} disabled={disabled}>
          {he.ds.answerInput.submit}
        </Button>
        {onDontKnow && (
          <Button variant="ghost" onClick={onDontKnow} disabled={locked}>
            {he.ds.answerInput.dontKnow}
          </Button>
        )}
      </div>
    </form>
  );
}
