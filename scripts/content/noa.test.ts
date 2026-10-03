import { describe, expect, it } from "vitest";
import { docxParagraphs, extractNoa, normalizeHeadword, parseLine } from "./noa";

const known = new Set(["wrath", "underwent", "allege", "defer"]);

describe("Noa's list: English headwords only", () => {
  it("reads paragraphs from document.xml, unescaping entities", () => {
    const xml =
      '<w:p><w:r><w:t>in vain</w:t></w:r><w:r><w:t xml:space="preserve"> – לשווא</w:t></w:r></w:p>' +
      "<w:p><w:r><w:t>inimitable – &quot;יחידאי&quot;</w:t></w:r></w:p>";
    expect(docxParagraphs(xml).slice(0, 2)).toEqual(["in vain – לשווא", 'inimitable – "יחידאי"']);
  });

  it("takes the text before the dash and never any Hebrew", () => {
    const lines = [
      "accomplice – שותף לעבירה",
      "Parasite- טפיל",
      "3. prosper – לשגשג",
      "to slay – להרוג",
      "draw upon – להסתמך על",
      "compulsory",
      "(הערה בראש העמודה: 40 מילים)",
      "",
    ];
    expect(lines.map((l) => parseLine(l)?.original ?? null)).toEqual([
      "accomplice",
      "parasite",
      "prosper",
      "slay",
      "draw upon",
      "compulsory",
      null,
      null,
    ]);
    for (const l of lines) expect(parseLine(l)?.original ?? "").not.toMatch(/[֐-׿]/);
  });

  it("normalizes case, spaces, numbering and trailing punctuation", () => {
    expect(normalizeHeadword("  10.  Well   Read. ")).toBe("well read");
    expect(normalizeHeadword("ill-fated")).toBe("ill-fated");
  });

  it("applies a stated correction only when the word is known; 'or' and unknown words are pending", () => {
    const r = extractNoa(
      [
        "warth (כנראה שגיאת כתיב ל-wrath)",
        "undervent (נראה כ-underwent) – עבר",
        "incess (נראה כ-incessant) – בלתי פוסק",
        "deffer (או defer) – לדחות",
        "sword (נכתב sward) – חרב",
        "Hampered (מתוקן מ-Hamperded) – מעוכב",
      ],
      known,
    );
    expect(r.resolutions.map((x) => [x.original, x.status, x.headword])).toEqual([
      ["warth", "applied", "wrath"],
      ["undervent", "applied", "underwent"],
      ["incess", "pending", null],
      ["deffer", "pending", null],
      ["sword", "kept", "sword"],
      ["hampered", "kept", "hampered"],
    ]);
    expect(r.headwords).toEqual(["hampered", "sword", "underwent", "wrath"]);
  });

  it("dedupes case-insensitively and counts", () => {
    const r = extractNoa(["Vital – חיוני", "vital – חיוני", "merely – רק"], known);
    expect(r.headwords).toEqual(["merely", "vital"]);
    expect(r.counts).toEqual({ lines: 3, duplicates: 1, unique: 2, pending: 0 });
  });
});
