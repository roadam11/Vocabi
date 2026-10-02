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
});
