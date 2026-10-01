# VOCABI — Product spec (for implementation)

## One line
A personal vocabulary engine for Israelis: it finds which English words you need, checks what you really know, and gets you to verified, durable mastery — first for AMIRNET.

## Why now
From the December 2026 sitting, the psychometric exam has no English section; AMIRNET becomes the only English placement exam for higher education. "Psychometric English" in the UI maps to the AMIRNET track.

## Users (priority order)
1. AMIRNET candidates (18-30): exam date, threshold anxiety, high intent, seasonal.
2. High-school students (Bagrut 4-5 units): teacher word lists, parents pay. (Later: paste/import a teacher list.)
3. Adults improving work English. (Later.)
Out of scope: children (Band I), teachers/schools, non-Israeli markets.

## Principles
- Value before signup. No account needed until after the first session.
- "Known" is a hypothesis until verified by a test item.
- Mastery is defined in `docs/ENGINE.md`; never show progress the engine has not earned.
- Show ranges, not fake precision (the placement result is a range).
- Never promise a score or an exemption — not in UI copy, not in marketing pages.

## Phase 0 — the experiment (current)
Goal: measure whether people finish placement, finish a first session, and come back on day 2 and day 7.
No accounts, no payments. Progress is stored on the device, behind a `ProgressStore` interface that must already be migratable to a server without data loss (`docs/DECISIONS.md` #8), even though the Phase 1 migration itself is out of scope now: versioned schema keyed only by stable sense ids, raw review logs stored (not just derived FSRS state), `exportAll()`/`importAll()` with a round-trip test.

### Screens / routes
1. `/` Landing — headline, one CTA ("בדוק כמה מילים אתה יודע"), 5-minute promise, no signup. Link to `/privacy`.
2. `/start` Goal — AMIRNET · Psychometric (→ AMIRNET track) · Bagrut · General. Optional exam date (reject past dates; today allowed). Daily minutes: 5 / 10 / 20.
3. `/placement` — ~44 items: 30 real words across 6 bands + 10 pseudowords (yes/no) + up to 4 verification MCQs (see ENGINE §4; `docs/DECISIONS.md` #9). Progress indicator. No "back". Quitting saves state; returning resumes.
4. `/profile` — vocabulary range, per-band breakdown, coverage of the track's target list, daily plan ("X new words/day until <date>"), CTA to first session. Reliability warning when the guessing check fails.
5. `/session` — today's session: learn → practice (3 knowledge layers) → verify. Interruptible and resumable mid-session (refresh must not lose answers already given).
6. `/session/done` — what changed today (mastery ring deltas), streak, next session time, "Pro" painted door.
7. `/progress` — mastered count, weak words, streak, exam countdown with on-track status.
8. `/privacy` — plain-Hebrew notice: what is stored on the device, what analytics collects, and the waitlist email policy (`docs/DECISIONS.md` #5): used only to announce Pro, no marketing use, no sharing; deleted 30 days after the Pro-launch announcement or 12 months after signup (whichever comes first); delete on request anytime via a contact address, fulfilled within 30 days.
9. `/design` — internal design-system showcase (`noindex`, not linked).

### Pro painted door
Button "VOCABI Pro" on `/session/done` and `/progress` → sheet: "Pro is coming" → optional email + explicit consent checkbox (unchecked by default) → insert into Supabase `waitlist` (insert-only RLS, no select for anon). Track click and submit separately. Validate email format client- and server-side; dedupe by lowercase email. Each row stores a consent timestamp and the `/privacy` notice version shown at signup time, to support the retention policy above (`docs/DECISIONS.md` #5).

### Analytics events (PostHog, anonymous id persisted on the device)
`landing_viewed`, `placement_started`, `placement_item_answered` (band, isPseudo, answer, ms), `placement_completed` (estimateLow, estimateHigh, reliable), `goal_set` (track, hasExamDate, minutes), `session_started` (dayIndex, dueCount, newCount), `item_answered` (layer, correct, ms, senseId), `session_completed` (items, accuracy, durationS), `report_error_clicked` (senseId, reason), `pro_clicked` (surface), `waitlist_submitted`, `app_installed`.
No PII in events. The email never goes to PostHog. Analytics must not block rendering and must fail silently (ad blockers).

### Phase 0 content
- ~150 verified AMIRNET-track senses (starter set), each complete per `docs/CONTENT.md`.
- Placement bank: real words sampled per frequency band + pseudowords (see ENGINE).
- Audio: Web Speech API (`en-US`) with graceful fallback (button hidden when unsupported). Pre-generated audio comes in Phase 1.

### Out of scope in Phase 0
Accounts, server-side progress, payments, list import, OCR, games, AI chat, native app, simulations, restatements, reading, listening sections.

## Success gates
- Gate 1 (Phase 0 → 1): ≥ 30% of first-session finishers return on day 2. Track day 7 as well.
- Gate 2 (Phase 1 → 2): ≥ 15% day-7 return; otherwise fix the product before marketing.

## Phase 1 (context only — do not build now)
Supabase accounts (anonymous → linked), server-side progress, full content pipeline (1,000-1,500 AMIRNET senses), pre-generated audio, confusion pairs, list import (paste text / xlsx).
Note for later (`docs/DECISIONS.md` #8): a Supabase anonymous user gets the full `authenticated` Postgres role, not a lesser one — RLS policies must branch explicitly on the `is_anonymous` JWT claim, never on role, when distinguishing anonymous from linked accounts.
