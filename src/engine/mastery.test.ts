import { describe, expect, it } from "vitest";
import type { Layer } from "@/content/schema";
import { MASTERY } from "./config";
import { addDays, dayKey, zonedDayStart } from "./days";
import { applyReview, type CardState, newCardState, type RatingName } from "./fsrs";
import {
  displayState,
  isMastered,
  type LayerCards,
  masteryHorizon,
  requiredLayers,
} from "./mastery";

const TZ = "Asia/Jerusalem";
const T0 = Date.parse("2026-10-01T09:00:00Z");
const DAY = 86_400_000;

const rec = { layers: ["recognition"] as Layer[] };
const recCtx = { layers: ["recognition", "context"] as Layer[] };
const prod = { layers: ["recognition", "context", "production"] as Layer[] };

/** A card reviewed with `rating` at each day offset from T0. */
function card(layer: Layer, days: number[], rating: RatingName = "good"): CardState {
  let s = newCardState("abandon.v.01", layer, new Date(T0));
  for (const d of days) s = applyReview(s, rating, new Date(T0 + d * DAY));
  return s;
}

/** Strong cards: R at +30 days ≈ 0.93, at +60 days ≈ 0.88 (measured with ts-fsrs defaults). */
const STRONG = [0, 1, 4, 12];
const strong = (layer: Layer) => card(layer, STRONG);
const lastStrong = T0 + 12 * DAY;

describe("requiredLayers (docs/ENGINE.md §1)", () => {
  it("is the sense's layers (the content schema enforces recognition always, production iff prod)", () => {
    expect(requiredLayers(rec)).toEqual(["recognition"]);
    expect(requiredLayers(prod)).toEqual(["recognition", "context", "production"]);
  });
});

describe("masteryHorizon (docs/ENGINE.md §3, DECISIONS #37)", () => {
  const now = new Date("2026-10-03T07:15:00Z"); // 10:15 local

  it("is the local start of the exam day when the exam is in the future", () => {
    expect(masteryHorizon(now, TZ, "2026-10-28").toISOString()).toBe("2026-10-27T22:00:00.000Z");
  });

  it("is now + 30 local calendar days, same wall time, without an exam date", () => {
    const h = masteryHorizon(now, TZ);
    expect(dayKey(h, TZ)).toBe(addDays("2026-10-03", MASTERY.defaultHorizonDays));
    // 10:15 local on 2026-11-02 is 08:15Z after DST ends: not now + 30 × 24h.
    expect(h.toISOString()).toBe("2026-11-02T08:15:00.000Z");
    expect(h.getTime() - now.getTime()).not.toBe(30 * DAY);
  });

  it("falls back to +30 days when the exam date is today or in the past", () => {
    const plus30 = masteryHorizon(now, TZ).getTime();
    expect(masteryHorizon(now, TZ, "2026-10-03").getTime()).toBe(plus30);
    expect(masteryHorizon(now, TZ, "2026-09-01").getTime()).toBe(plus30);
  });
});

describe("isMastered (docs/ENGINE.md §3)", () => {
  const plus30 = new Date(lastStrong + 30 * DAY);

  it("self-mark only (no reviewed cards) is never mastered", () => {
    expect(isMastered(rec, {}, plus30)).toBe(false);
    const unreviewed: LayerCards = {
      recognition: newCardState("abandon.v.01", "recognition", new Date(T0)),
    };
    expect(isMastered(rec, unreviewed, plus30)).toBe(false);
  });

  it("needs every required layer: a prod sense needs all three", () => {
    const two: LayerCards = { recognition: strong("recognition"), context: strong("context") };
    expect(isMastered(recCtx, two, plus30)).toBe(true);
    expect(isMastered(prod, two, plus30)).toBe(false);
    expect(isMastered(prod, { ...two, production: strong("production") }, plus30)).toBe(true);
  });

  it("needs at least one successful review: only Again reviews never master", () => {
    expect(
      isMastered(rec, { recognition: card("recognition", [0, 1], "again") }, new Date(T0)),
    ).toBe(false);
  });

  it("horizon = exam date vs +30 days decides it", () => {
    // Reviews at day 0 and 1: R ≈ 0.95 three days later, ≈ 0.78 thirty days later.
    const weak = { recognition: card("recognition", [0, 1]) };
    const examIn3 = new Date(T0 + 4 * DAY);
    const plus30FromLast = new Date(T0 + 31 * DAY);
    expect(isMastered(rec, weak, examIn3)).toBe(true);
    expect(isMastered(rec, weak, plus30FromLast)).toBe(false);
    // Strong cards: mastered at +30 days, not for an exam 60 days away.
    const s = { recognition: strong("recognition") };
    expect(isMastered(rec, s, plus30)).toBe(true);
    expect(isMastered(rec, s, new Date(lastStrong + 60 * DAY))).toBe(false);
  });

  it("uses retrievability ≥ 0.90 inclusively (boundary)", () => {
    // Find the last minute at which R ≥ 0.90, then check both sides of it.
    const c = card("recognition", [0, 1]);
    let lo = T0 + DAY;
    let hi = T0 + 60 * DAY;
    const ok = (t: number) => isMastered(rec, { recognition: c }, new Date(t));
    while (hi - lo > 60_000) {
      const mid = Math.floor((lo + hi) / 2);
      if (ok(mid)) lo = mid;
      else hi = mid;
    }
    expect(ok(lo)).toBe(true);
    expect(ok(hi)).toBe(false);
  });
});

describe("displayState (docs/ENGINE.md §3, DECISIONS #36)", () => {
  const h = new Date(lastStrong + 30 * DAY);

  it("new without reviewed cards (self-marks never count)", () => {
    expect(displayState(recCtx, {}, h)).toBe("new");
    expect(
      displayState(recCtx, { recognition: newCardState("a", "recognition", new Date(T0)) }, h),
    ).toBe("new");
  });

  it("learning after a first failure, recognized once recognition passed", () => {
    expect(displayState(recCtx, { recognition: card("recognition", [0], "again") }, h)).toBe(
      "learning",
    );
    expect(displayState(recCtx, { recognition: strong("recognition") }, h)).toBe("recognized");
  });

  it("a first-ever failure on context is not a lapse: still recognized", () => {
    const cards = { recognition: strong("recognition"), context: card("context", [12], "again") };
    expect(displayState(recCtx, cards, h)).toBe("recognized");
  });

  it("mastered when isMastered holds", () => {
    expect(
      displayState(recCtx, { recognition: strong("recognition"), context: strong("context") }, h),
    ).toBe("mastered");
  });

  it("a lapse on any required layer demotes to learning until that layer is passed again", () => {
    const at = (d: number) => new Date(lastStrong + d * DAY);
    const lapsed = applyReview(strong("context"), "again", at(1));
    const cards = { recognition: strong("recognition"), context: lapsed };
    expect(displayState(recCtx, cards, h)).toBe("learning");
    expect(isMastered(recCtx, cards, h)).toBe(false);
    const repassed = applyReview(lapsed, "good", at(1.01));
    expect(displayState(recCtx, { ...cards, context: repassed }, h)).not.toBe("learning");
  });

  it("a lapse on recognition demotes too", () => {
    const lapsed = applyReview(strong("recognition"), "again", new Date(lastStrong + DAY));
    expect(displayState(rec, { recognition: lapsed }, h)).toBe("learning");
  });

  it("ignores cards of layers the sense does not require", () => {
    const cards = {
      recognition: strong("recognition"),
      production: card("production", [12], "again"),
    };
    expect(displayState(rec, cards, h)).toBe("mastered");
  });

  it("uses the exam-day horizon from masteryHorizon end to end", () => {
    const now = new Date(lastStrong + DAY);
    const exam = addDays(dayKey(now, TZ), 70);
    const horizon = masteryHorizon(now, TZ, exam);
    expect(horizon.getTime()).toBe(zonedDayStart(exam, TZ).getTime());
    expect(displayState(rec, { recognition: strong("recognition") }, horizon)).toBe("recognized");
  });
});
