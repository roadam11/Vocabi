import { describe, expect, it } from "vitest";
import { inflections } from "./inflect";

describe("inflections (content:check rule 9)", () => {
  it.each([
    ["walk", ["walk", "walks", "walked", "walking", "walker", "walkly"]],
    ["hope", ["hopes", "hoped", "hoping", "hoper"]],
    ["carry", ["carries", "carried", "carrying", "carrier", "carrily"]],
    ["stop", ["stopped", "stopping"]],
    ["big", ["bigger", "biggest"]],
    ["watch", ["watches"]],
    ["simple", ["simply"]],
  ])("%s → includes %j", (word, forms) => {
    expect(inflections(word)).toEqual(expect.arrayContaining(forms));
  });

  it("does not stack suffixes on forms that are already inflected", () => {
    expect(inflections("abandoned")).toEqual(["abandoned"]);
    expect(inflections("running")).toEqual(["running"]);
  });

  it("does not produce e-doubling junk", () => {
    expect(inflections("hesitate")).not.toContain("hesitateing");
    expect(inflections("hesitate")).not.toContain("hesitatees");
  });

  it("passes multi-word and non-alphabetic entries through unchanged", () => {
    expect(inflections("give up")).toEqual(["give up"]);
    expect(inflections("don't")).toEqual(["don't"]);
  });
});
