import { describe, expect, it } from "vitest";
import { parseThemePreference, THEME_STORAGE_KEY, themeInitScript } from "./theme";

/** Runs the inline <head> script against a fake document + storage, returns data-theme. */
function runInitScript(getItem: (key: string) => string | null): string | null {
  const attrs = new Map<string, string>();
  const document = { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v) } };
  const localStorage = { getItem };
  new Function("document", "localStorage", themeInitScript)(document, localStorage);
  return attrs.get("data-theme") ?? null;
}

describe("parseThemePreference", () => {
  it("accepts only light/dark overrides", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    for (const v of [null, undefined, "", "system", "DARK", "blue", 1]) {
      expect(parseThemePreference(v)).toBe("system");
    }
  });
});

describe("themeInitScript", () => {
  it("applies a stored override", () => {
    expect(runInitScript((k) => (k === THEME_STORAGE_KEY ? "dark" : null))).toBe("dark");
    expect(runInitScript((k) => (k === THEME_STORAGE_KEY ? "light" : null))).toBe("light");
  });

  it("leaves the attribute unset for system / corrupted values", () => {
    expect(runInitScript(() => null)).toBeNull();
    expect(runInitScript(() => "purple")).toBeNull();
  });

  it("does not throw when storage is unavailable", () => {
    expect(
      runInitScript(() => {
        throw new Error("SecurityError");
      }),
    ).toBeNull();
  });
});
