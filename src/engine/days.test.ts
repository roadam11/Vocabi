import { describe, expect, it } from "vitest";
import { addDays, dayKey, daysBetween, zonedDayStart } from "./days";

const TZ = "Asia/Jerusalem";
const utc = (iso: string) => new Date(iso);

describe("dayKey (docs/ENGINE.md §8)", () => {
  it("has the exact YYYY-MM-DD format, zero-padded, built from formatToParts", () => {
    const key = dayKey(utc("2026-01-04T10:00:00Z"), TZ);
    expect(key).toBe("2026-01-04");
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dayKey(utc("0999-03-05T12:00:00Z"), "UTC")).toBe("0999-03-05");
  });

  it("is the local calendar date, not the UTC date", () => {
    // 22:30Z on Oct 1 is 01:30 on Oct 2 in Jerusalem (UTC+3).
    expect(dayKey(utc("2026-10-01T22:30:00Z"), TZ)).toBe("2026-10-02");
    expect(dayKey(utc("2026-10-01T22:30:00Z"), "UTC")).toBe("2026-10-01");
  });

  describe("Israel DST end, Sunday 2026-10-25 02:00 (UTC+3 → UTC+2)", () => {
    it("keeps a 25-hour local day as one key: 00:10 and 23:50 are 24h40m apart", () => {
      const early = utc("2026-10-24T21:10:00Z"); // 00:10 local, UTC+3
      const late = utc("2026-10-25T21:50:00Z"); // 23:50 local, UTC+2
      expect(late.getTime() - early.getTime()).toBe((24 * 60 + 40) * 60_000);
      expect(dayKey(early, TZ)).toBe("2026-10-25");
      expect(dayKey(late, TZ)).toBe("2026-10-25");
    });

    it("switches keys exactly at each local midnight around the change", () => {
      expect(dayKey(utc("2026-10-24T20:59:59Z"), TZ)).toBe("2026-10-24");
      expect(dayKey(utc("2026-10-24T21:00:00Z"), TZ)).toBe("2026-10-25");
      expect(dayKey(utc("2026-10-25T21:59:59Z"), TZ)).toBe("2026-10-25");
      expect(dayKey(utc("2026-10-25T22:00:00Z"), TZ)).toBe("2026-10-26");
    });

    it("both 01:30 local instants of the repeated hour fall on the same day", () => {
      expect(dayKey(utc("2026-10-24T22:30:00Z"), TZ)).toBe("2026-10-25"); // 01:30 UTC+3
      expect(dayKey(utc("2026-10-24T23:30:00Z"), TZ)).toBe("2026-10-25"); // 01:30 UTC+2
    });
  });
});

describe("calendar arithmetic on keys (never 24-hour multiples)", () => {
  it("counts calendar days across the DST change", () => {
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-10-26", "2026-10-24")).toBe(-2);
    expect(daysBetween("2026-10-25", "2026-10-25")).toBe(0);
  });

  it("rolls over months, years and leap days", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-10-03", 30)).toBe("2026-11-02");
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it.each(["2026-1-04", "2026-02-30", "20261004", "", "2026-13-01"])(
    "rejects invalid key %j",
    (k) => {
      expect(() => addDays(k, 1)).toThrow(/day key/);
      expect(() => daysBetween(k, "2026-01-01")).toThrow(/day key/);
    },
  );
});

describe("zonedDayStart", () => {
  it("returns the instant of local midnight, honoring the DST offset of that day", () => {
    expect(zonedDayStart("2026-10-25", TZ).toISOString()).toBe("2026-10-24T21:00:00.000Z");
    expect(zonedDayStart("2026-10-26", TZ).toISOString()).toBe("2026-10-25T22:00:00.000Z");
    expect(zonedDayStart("2026-10-25", "UTC").toISOString()).toBe("2026-10-25T00:00:00.000Z");
    expect(zonedDayStart("2026-10-25", "America/New_York").toISOString()).toBe(
      "2026-10-25T04:00:00.000Z",
    );
  });

  it("round-trips with dayKey", () => {
    for (const k of ["2026-03-26", "2026-03-27", "2026-10-25", "2026-12-31"]) {
      expect(dayKey(zonedDayStart(k, TZ), TZ)).toBe(k);
    }
  });

  it("falls back to the first existing instant when local midnight is skipped", () => {
    // Chile (America/Santiago) jumps 00:00 → 01:00 on 2026-09-06.
    const start = zonedDayStart("2026-09-06", "America/Santiago");
    expect(dayKey(start, "America/Santiago")).toBe("2026-09-06");
    expect(dayKey(new Date(start.getTime() - 1), "America/Santiago")).toBe("2026-09-05");
  });
});
