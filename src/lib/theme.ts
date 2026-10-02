/**
 * Theme preference: system by default, manual override saved on the device (docs/DESIGN.md "Tokens").
 * The override is the `data-theme` attribute on <html>; without it, tokens.css follows
 * `prefers-color-scheme`. `themeInitScript` runs inline in <head> so the attribute is set before
 * first paint (no flash of the wrong theme).
 */
export const THEME_STORAGE_KEY = "vocabi-theme";

export type ThemePreference = "system" | "light" | "dark";
export const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

/** A stored override, or "system" for anything else (missing, corrupted, unknown). */
export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/** Blocking inline script for <head>. Kept tiny and dependency-free; storage may throw. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

const listeners = new Set<() => void>();

/** Applies the preference to <html> and saves it; works for the session even if storage fails. */
export function setThemePreference(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  try {
    if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage unavailable (private mode / quota): the attribute still applies for this page view.
  }
  listeners.forEach((l) => l());
}

/** The current preference as reflected on <html> (source of truth after the init script ran). */
export function currentThemePreference(): ThemePreference {
  return parseThemePreference(document.documentElement.getAttribute("data-theme"));
}

export function subscribeThemePreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
