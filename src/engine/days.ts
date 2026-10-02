/**
 * Local calendar days (docs/ENGINE.md §8). A day is a `YYYY-MM-DD` key in the user's IANA time
 * zone; day arithmetic works on the keys themselves, never on 24-hour multiples (DST).
 */

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Wall-clock parts in `timeZone`. Read from formatToParts, never from a locale's string format. */
function wallParts(at: Date, timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  const n: Record<string, number> = {};
  for (const p of f.formatToParts(at)) {
    if (p.type !== "literal") n[p.type] = Number(p.value);
  }
  return {
    year: n.year!,
    month: n.month!,
    day: n.day!,
    hour: n.hour!,
    minute: n.minute!,
    second: n.second!,
  };
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

function toKey(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** Days since 1970-01-01 of a valid key; throws on anything else (e.g. "2026-02-30"). */
function epochDay(key: string): number {
  const m = KEY_RE.exec(key);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const t = new Date(0);
    t.setUTCFullYear(y, mo - 1, d);
    if (t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d) {
      return Math.round(t.getTime() / MS_PER_DAY);
    }
  }
  throw new Error(`Invalid day key: ${JSON.stringify(key)}`);
}

function fromEpochDay(n: number): string {
  const t = new Date(n * MS_PER_DAY);
  return toKey(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** The local calendar date of `now` in `timeZone`, as `YYYY-MM-DD`. */
export function dayKey(now: Date, timeZone: string): string {
  const p = wallParts(now, timeZone);
  return toKey(p.year, p.month, p.day);
}

/** Calendar days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  return epochDay(b) - epochDay(a);
}

export function addDays(key: string, days: number): string {
  return fromEpochDay(epochDay(key) + days);
}

/** Offset of `timeZone` at instant `t`: local wall time minus UTC, in ms (whole seconds). */
function offsetAt(t: number, timeZone: string): number {
  const p = wallParts(new Date(t), timeZone);
  const wall = new Date(0);
  wall.setUTCFullYear(p.year, p.month - 1, p.day);
  wall.setUTCHours(p.hour, p.minute, p.second, 0);
  return wall.getTime() - (t - (((t % 1000) + 1000) % 1000));
}

/**
 * The first instant of local day `key` in `timeZone`: local 00:00, or the first existing local
 * time when a DST jump skips midnight.
 */
export function zonedDayStart(key: string, timeZone: string): Date {
  const wallMidnight = epochDay(key) * MS_PER_DAY;
  // Two passes settle the offset in effect at the result (it can differ from the first guess's).
  let t = wallMidnight - offsetAt(wallMidnight, timeZone);
  t = wallMidnight - offsetAt(t, timeZone);
  // Midnight skipped by a DST jump: t landed on the previous day; step to the first minute of `key`
  // (real offsets are whole minutes).
  while (dayKey(new Date(t), timeZone) < key) t += 60_000;
  return new Date(t);
}
