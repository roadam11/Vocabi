import { describe, expect, it } from "vitest";
import { addDays, dayKey } from "./days";
import { displayStreak, EMPTY_STREAK, recordSession, type StreakState } from "./streak";

const TZ = "Asia/Jerusalem";

/** Records a session on each key, in order. */
function run(keys: string[], from: StreakState = EMPTY_STREAK): StreakState {
  return keys.reduce(recordSession, from);
}

describe("streak (docs/ENGINE.md §8, DECISIONS #6)", () => {
  it("day 1, day 2, day 8 with an injected clock: +1 per local day, broken after a long gap", () => {
    const day1 = new Date("2026-10-01T07:00:00Z");
    const plusDays = (n: number) => new Date(day1.getTime() + n * 86_400_000);
    let s = recordSession(EMPTY_STREAK, dayKey(day1, TZ));
    expect(s.current).toBe(1);
    s = recordSession(s, dayKey(plusDays(1), TZ));
    expect(s.current).toBe(2);
    s = recordSession(s, dayKey(plusDays(7), TZ)); // day 8: five missed days
    expect(s.current).toBe(1);
  });

  it("counts only the first completed session of a local day", () => {
    const s = run(["2026-10-01", "2026-10-01", "2026-10-01"]);
    expect(s.current).toBe(1);
  });

  it("a single missed day is covered by an automatic freeze when none was used before", () => {
    const s = run(["2026-10-01", "2026-10-02", "2026-10-04"]);
    expect(s.current).toBe(3);
    expect(s.lastFreezeDayKey).toBe("2026-10-03");
  });

  it("two consecutive missed days always break the streak, even with a freeze available", () => {
    const s = run(["2026-10-01", "2026-10-02", "2026-10-05"]);
    expect(s.current).toBe(1);
    expect(s.lastFreezeDayKey).toBeNull();
  });

  describe("rolling 7-day window: no freeze used in the previous 6 local days", () => {
    const base = ["2026-10-01", "2026-10-03"]; // freeze on 10-02

    it("a miss 6 days after the last freeze is not covered", () => {
      // Sessions 10-03..10-07, miss 10-08 (6 days after 10-02), session 10-09.
      const s = run([
        ...base,
        "2026-10-04",
        "2026-10-05",
        "2026-10-06",
        "2026-10-07",
        "2026-10-09",
      ]);
      expect(s.current).toBe(1);
      expect(s.lastFreezeDayKey).toBe("2026-10-02");
    });

    it("a miss 7 days after the last freeze is covered", () => {
      // Sessions 10-03..10-08, miss 10-09 (7 days after 10-02), session 10-10.
      const keys = [...base, "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"];
      const s = run([...keys, "2026-10-10"]);
      expect(s.current).toBe(8); // 8 session days, the missed 10-09 frozen
      expect(s.lastFreezeDayKey).toBe("2026-10-09");
    });
  });

  it("misses on both sides of a Sun/Mon week boundary do not grant two freezes", () => {
    // 2026-10-10 is Saturday (missed), 10-11 Sunday, 10-12 Monday (missed).
    const s1 = run(["2026-10-08", "2026-10-09", "2026-10-11"]);
    expect(s1.current).toBe(3);
    const s2 = recordSession(s1, "2026-10-13");
    expect(s2.current).toBe(1);
  });

  it("DST week in Asia/Jerusalem: a session at 23:30 local every day counts exactly 7", () => {
    let s = EMPTY_STREAK;
    const keys: string[] = [];
    for (let k = "2026-10-22"; k <= "2026-10-28"; k = addDays(k, 1)) {
      // 23:30 local: UTC+3 until 10-24, UTC+2 from 10-25.
      const offsetH = k <= "2026-10-24" ? 3 : 2;
      const at = new Date(`${k}T23:30:00+0${offsetH}:00`);
      keys.push(dayKey(at, TZ));
      s = recordSession(s, dayKey(at, TZ));
    }
    expect(keys).toEqual([
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
    ]);
    expect(s.current).toBe(7);
    expect(s.lastFreezeDayKey).toBeNull();
  });

  describe("time-zone change uses the stored day keys (§8)", () => {
    it("same evening from New York after a session in Jerusalem: no double count", () => {
      const jlm = new Date("2026-10-10T20:30:00Z"); // 23:30 in Jerusalem
      const nyc = new Date("2026-10-11T01:00:00Z"); // 21:00 Oct 10 in New York
      let s = recordSession(EMPTY_STREAK, dayKey(jlm, TZ));
      s = recordSession(s, dayKey(nyc, "America/New_York"));
      expect(s.current).toBe(1);
      expect(s.lastSessionDayKey).toBe("2026-10-10");
    });

    it("flying west so today's key is earlier than the stored one: unchanged, not broken", () => {
      const s1 = run(["2026-10-09", "2026-10-10"]);
      const s2 = recordSession(s1, "2026-10-09");
      expect(s2).toEqual(s1);
    });

    it("flying east the next day: +1 with no gap", () => {
      const jlm = new Date("2026-10-10T20:30:00Z"); // 23:30 Oct 10, Jerusalem
      const tokyo = new Date("2026-10-11T03:00:00Z"); // 12:00 Oct 11, Tokyo
      const s = recordSession(
        recordSession(EMPTY_STREAK, dayKey(jlm, TZ)),
        dayKey(tokyo, "Asia/Tokyo"),
      );
      expect(s.current).toBe(2);
    });
  });
});

describe("displayStreak (before today's session)", () => {
  const s = run(["2026-10-01", "2026-10-02"]);

  it("shows the streak on the session day and the day after", () => {
    expect(displayStreak(s, "2026-10-02")).toBe(2);
    expect(displayStreak(s, "2026-10-03")).toBe(2);
  });

  it("still shows it after one missed day while a freeze can cover it", () => {
    expect(displayStreak(s, "2026-10-04")).toBe(2);
  });

  it("shows 0 after one missed day with no freeze available", () => {
    const frozen = run(["2026-10-01", "2026-10-03", "2026-10-04"]); // freeze on 10-02
    expect(displayStreak(frozen, "2026-10-06")).toBe(0);
  });

  it("shows 0 after two missed days, and for a new user", () => {
    expect(displayStreak(s, "2026-10-05")).toBe(0);
    expect(displayStreak(EMPTY_STREAK, "2026-10-05")).toBe(0);
  });

  it("does not break when the clock moved to an earlier key", () => {
    expect(displayStreak(s, "2026-10-01")).toBe(2);
  });
});
