import { describe, expect, it } from "vitest";
import { SESSION } from "./config";
import { cardMap, daysBefore, REC, REC_CTX, reviewed, senses, TZ } from "./fixtures/session";
import { masteryHorizon } from "./mastery";
import { applyHysteresis, onTrackCosts, type OnTrackStatus, onTrackStatus } from "./ontrack";
import { bandKnowledge, examDays, senseCost } from "./workload";

const NOW = new Date("2026-10-03T07:00:00Z"); // 10:00 local
const EXAM = "2026-11-30"; // 58 local days ahead → divisor 58 − 14 = 44

describe("verify-first costing (docs/ENGINE.md §7, DECISIONS #1)", () => {
  const [s] = senses(1, REC_CTX, "B1");
  it("costs a full teach+practice unit below p_b 0.8", () => {
    expect(senseCost(s!, bandKnowledge({ perBand: [{ band: "B1", p: 0.79 }] }))).toBe(20 + 8 + 15);
  });
  it("costs one recognition item at p_b ≥ 0.8", () => {
    expect(senseCost(s!, bandKnowledge({ perBand: [{ band: "B1", p: 0.8 }] }))).toBe(8);
  });
  it("without placement nothing is verify-first", () => {
    expect(senseCost(s!, bandKnowledge())).toBe(43);
  });
});

describe("examDays (calendar days, DST-safe)", () => {
  it("none / past / today / upcoming", () => {
    expect(examDays(NOW, TZ)).toEqual({ kind: "none" });
    expect(examDays(NOW, TZ, "2026-10-02")).toEqual({ kind: "past" });
    expect(examDays(NOW, TZ, "2026-10-03")).toEqual({ kind: "upcoming", daysLeft: 0 });
    expect(examDays(NOW, TZ, "2026-10-13")).toEqual({ kind: "upcoming", daysLeft: 10 });
  });

  it("DST week in Asia/Jerusalem (clocks go back 2026-10-25): days follow local dates", () => {
    // 23:30 local on 10-24 (UTC+3), 00:30 local on 10-25 (UTC+3), 00:30 local on 10-26 (UTC+2).
    expect(examDays(new Date("2026-10-24T20:30:00Z"), TZ, "2026-11-08")).toEqual({
      kind: "upcoming",
      daysLeft: 15,
    });
    expect(examDays(new Date("2026-10-24T21:30:00Z"), TZ, "2026-11-08")).toEqual({
      kind: "upcoming",
      daysLeft: 14,
    });
    expect(examDays(new Date("2026-10-25T22:30:00Z"), TZ, "2026-11-08")).toEqual({
      kind: "upcoming",
      daysLeft: 13,
    });
  });
});

describe("onTrackCosts: unmasteredTarget cost-weighting (DECISIONS #1, #4)", () => {
  const ss = senses(44, REC_CTX, "B1");
  const horizon = masteryHorizon(NOW, TZ, EXAM);

  it("p_b ≥ 0.8 lowers the learning cost to verify-first price but never the target", () => {
    const low = onTrackCosts(ss, {}, bandKnowledge(), horizon);
    const high = onTrackCosts(ss, {}, { B1: 0.9 }, horizon);
    expect(low).toEqual({ target: 44, newLearningCost: 44 * 43, projectedReviewCost: 44 * 4 * 23 });
    expect(high).toEqual({ target: 44, newLearningCost: 44 * 8, projectedReviewCost: 44 * 4 * 23 });
  });

  it("mastered senses leave the target; started-but-unmastered ones stay in it", () => {
    const strong = [0, 1, 4, 12, 40].map((d) => daysBefore(NOW, 60 - d));
    const cards = cardMap([
      reviewed(ss[0]!.id, "recognition", strong),
      reviewed(ss[0]!.id, "context", strong),
      reviewed(ss[1]!.id, "recognition", [daysBefore(NOW, 1)]),
    ]);
    const nearHorizon = masteryHorizon(NOW, TZ, "2026-10-05");
    expect(onTrackCosts(ss, cards, {}, nearHorizon).target).toBe(43);
  });
});

describe("onTrackStatus (docs/ENGINE.md §7, DECISIONS #4)", () => {
  const base = {
    now: NOW,
    timeZone: TZ,
    minutesPerDay: 5,
    senses: senses(44, REC_CTX, "B1"),
    cards: {},
    previousStatus: null,
  };

  it("no exam date → no status at all", () => {
    expect(onTrackStatus(base)).toBeNull();
  });

  it("exam in the past → examPast (prompt to update), no status", () => {
    expect(onTrackStatus({ ...base, examDayKey: "2026-09-30" })).toEqual({ kind: "examPast" });
  });

  it("projects (newLearningCost + projectedReviewCost) / (daysLeft − taperDays)", () => {
    const r = onTrackStatus({ ...base, examDayKey: EXAM });
    // 44 × (43 + 92) s / 44 days = 135 s = 2.25 min.
    expect(r).toEqual({
      kind: "status",
      status: "onTrack",
      neededMinutesPerDay: 2.25,
      inTaper: false,
    });
  });

  it("verify-first bands lower the projection (8 s instead of 43 s per sense)", () => {
    const r = onTrackStatus({
      ...base,
      examDayKey: EXAM,
      placement: { perBand: [{ band: "B1", p: 0.85 }] },
    });
    expect(r?.kind === "status" && r.neededMinutesPerDay).toBeCloseTo(100 / 60, 10);
  });

  it("flips to needsMore when the projection exceeds the daily minutes", () => {
    const r = onTrackStatus({ ...base, minutesPerDay: 2, examDayKey: EXAM });
    expect(r).toMatchObject({ status: "needsMore", neededMinutesPerDay: 2.25 });
  });

  describe("taper window: only today's due reviews count", () => {
    // 40 recognition cards due today: 320 s = 5.33 min against a 5-minute budget.
    const ss = senses(40, REC);
    const due = cardMap(ss.map((s) => reviewed(s.id, "recognition", [daysBefore(NOW, 3)])));
    const taper = { ...base, senses: ss, cards: due };

    it("exam today (daysLeft 0): needs more once due reviews exceed the budget", () => {
      expect(onTrackStatus({ ...taper, examDayKey: "2026-10-03" })).toEqual({
        kind: "status",
        status: "needsMore",
        neededMinutesPerDay: 320 / 60,
        inTaper: true,
      });
    });

    it("exam in 10 days: same rule, and hysteresis holds an onTrack status at 107%", () => {
      const r = onTrackStatus({ ...taper, examDayKey: "2026-10-13", previousStatus: "onTrack" });
      expect(r).toMatchObject({ status: "onTrack", inTaper: true });
    });

    it("exam in 10 days with nothing due: on track, whatever the unmastered target", () => {
      const r = onTrackStatus({ ...base, examDayKey: "2026-10-13", previousStatus: "needsMore" });
      expect(r).toEqual({
        kind: "status",
        status: "onTrack",
        neededMinutesPerDay: 0,
        inTaper: true,
      });
    });
  });

  it("DST week: the taper starts exactly at 14 local days (daysLeft 15 → 14)", () => {
    const at = (iso: string) =>
      onTrackStatus({ ...base, now: new Date(iso), examDayKey: "2026-11-08" });
    expect(at("2026-10-24T20:30:00Z")).toMatchObject({ inTaper: false });
    expect(at("2026-10-24T21:30:00Z")).toMatchObject({ inTaper: true });
  });
});

describe("hysteresis with previousStatus as explicit input (DECISIONS #4)", () => {
  const minutes = 10;
  it("trips above 110%, clears below 95%, holds in between", () => {
    expect(applyHysteresis(11.01, minutes, "onTrack")).toBe("needsMore");
    expect(applyHysteresis(10.5, minutes, "onTrack")).toBe("onTrack");
    expect(applyHysteresis(10.5, minutes, "needsMore")).toBe("needsMore");
    expect(applyHysteresis(9.49, minutes, "needsMore")).toBe("onTrack");
  });

  it("without a previous status, 100% decides", () => {
    expect(applyHysteresis(10, minutes, null)).toBe("onTrack");
    expect(applyHysteresis(10.01, minutes, null)).toBe("needsMore");
  });

  it("flapping around both thresholds changes status only on a real crossing", () => {
    // Needed minutes against a 10-minute day (exact decimals, so 11/10 is exactly 110%).
    const needed = [9.4, 10.9, 11.1, 10.5, 9.6, 9.4, 11, 11.001, 9.5, 9.499, 10, 10];
    const expected: OnTrackStatus[] = [
      "onTrack", // 0.94
      "onTrack", // 1.09 held
      "needsMore", // 1.11 trips
      "needsMore", // 1.05 held
      "needsMore", // 0.96 held
      "onTrack", // 0.94 clears
      "onTrack", // exactly 110%: not above, held
      "needsMore", // just above 110%
      "needsMore", // exactly 95%: not below, held
      "onTrack", // just below 95%
      "onTrack",
      "onTrack",
    ];
    let prev: OnTrackStatus | null = "onTrack";
    const got = needed.map((n) => (prev = applyHysteresis(n, minutes, prev)));
    expect(got).toEqual(expected);
  });

  it("thresholds come from config", () => {
    expect([SESSION.tripAbove, SESSION.clearBelow]).toEqual([1.1, 0.95]);
  });
});
