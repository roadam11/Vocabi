"use client";

import { useId, useSyncExternalStore } from "react";
import { he } from "@/i18n/he";
import {
  currentThemePreference,
  setThemePreference,
  subscribeThemePreference,
  THEME_PREFERENCES,
  type ThemePreference,
} from "@/lib/theme";

/** System / light / dark segmented control. Native radios give arrow-key navigation for free. */
export function ThemeToggle() {
  const name = useId();
  const pref = useSyncExternalStore<ThemePreference | null>(
    subscribeThemePreference,
    currentThemePreference,
    () => null, // server: unknown until hydration, so no option is pre-checked in the HTML
  );

  return (
    <fieldset className="inline-flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-ink-2">{he.theme.label}</legend>
      <div className="inline-flex rounded-control border border-line-strong bg-surface p-1">
        {THEME_PREFERENCES.map((option) => (
          <label
            key={option}
            className="relative flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-[calc(var(--radius-control)-0.25rem)] px-4 text-sm font-medium text-ink-2 transition-colors duration-(--duration-fast) ease-out has-checked:bg-accent-soft has-checked:text-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ui-hover:text-ink"
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={pref === option}
              onChange={() => setThemePreference(option)}
              className="sr-only"
            />
            {he.theme[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
