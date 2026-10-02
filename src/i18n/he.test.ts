import { describe, expect, it } from "vitest";
import { he } from "./he";

function leaves(obj: object, path = ""): Array<[string, unknown]> {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? leaves(v, `${path}${k}.`) : [[`${path}${k}`, v]],
  );
}

describe("he.ts strings", () => {
  it("has only non-empty string leaves", () => {
    for (const [key, value] of leaves(he)) {
      expect(typeof value, key).toBe("string");
      expect((value as string).trim(), key).not.toBe("");
    }
  });

  it("never uses an en dash (bidi reverses it in ranges)", () => {
    for (const [key, value] of leaves(he)) expect(value, key).not.toContain("–");
  });

  it("never attaches a Hebrew prefix letter to a Latin word or a {placeholder}", () => {
    // "ב־VOCABI" / "בVOCABI" / "ב{word}" are forbidden (CLAUDE.md non-negotiables).
    for (const [key, value] of leaves(he)) {
      expect(value, key).not.toMatch(/[\u05D0-\u05EA][\u05BE-]?[A-Za-z{]/);
    }
  });
});
