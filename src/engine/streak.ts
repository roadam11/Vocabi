/**
 * Streaks on stored local day keys (docs/ENGINE.md §8). The caller computes today's key with
 * `dayKey(now, timeZone)`; comparing stored keys keeps a time-zone change from double-counting or
 * breaking a streak. Freeze: rolling 7-day window, never ISO weeks (docs/DECISIONS.md #6).
 */
import { STREAK } from "./config";
import { addDays, daysBetween } from "./days";

export interface StreakState {
  current: number;
  /** Day key of the last completed session. */
  lastSessionDayKey: string | null;
  /** Day key of the missed day the last automatic freeze covered. */
  lastFreezeDayKey: string | null;
}

export const EMPTY_STREAK: StreakState = {
  current: 0,
  lastSessionDayKey: null,
  lastFreezeDayKey: null,
};

/** A freeze can cover `missedKey` iff no freeze was used in the 6 local days before it. */
function freezeAvailable(state: StreakState, missedKey: string): boolean {
  return (
    state.lastFreezeDayKey === null ||
    daysBetween(state.lastFreezeDayKey, missedKey) >= STREAK.freezeWindowDays
  );
}

/** Applies a completed session on local day `todayKey`. */
export function recordSession(state: StreakState, todayKey: string): StreakState {
  if (state.lastSessionDayKey === null) {
    return { ...state, current: 1, lastSessionDayKey: todayKey };
  }
  const gap = daysBetween(state.lastSessionDayKey, todayKey);
  // Same day, or a time-zone change moved today's key before the stored one: nothing changes.
  if (gap <= 0) return state;
  if (gap === 1) return { ...state, current: state.current + 1, lastSessionDayKey: todayKey };
  if (gap === 2) {
    const missed = addDays(state.lastSessionDayKey, 1);
    if (freezeAvailable(state, missed)) {
      return {
        current: state.current + 1,
        lastSessionDayKey: todayKey,
        lastFreezeDayKey: missed,
      };
    }
  }
  // Two or more consecutive missed days, or one with no freeze left: the streak restarts.
  return { ...state, current: 1, lastSessionDayKey: todayKey };
}

/** The streak to show on `todayKey` before any session today: 0 once it can no longer continue. */
export function displayStreak(state: StreakState, todayKey: string): number {
  if (state.lastSessionDayKey === null) return 0;
  const gap = daysBetween(state.lastSessionDayKey, todayKey);
  if (gap <= 1) return state.current;
  if (gap === 2 && freezeAvailable(state, addDays(state.lastSessionDayKey, 1))) {
    return state.current;
  }
  return 0;
}
