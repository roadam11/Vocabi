# VOCABI — Learning engine spec

All engine code lives in `src/engine/`, is pure, and receives `now: Date`, `timeZone: string` and `rng: () => number` as inputs. Every numbered rule below needs at least one unit test. Heuristic constants are marked CALIBRATE: keep them in `src/engine/config.ts`, never inline.

## 1. Units of knowledge
- The unit is a **sense** (word + meaning), id like `abandon.v.01`. Two senses of one word are tracked separately.
- Each sense has knowledge **layers**:
  - `recognition` — choose the Hebrew meaning (MCQ, 4 options). Always required.
  - `context` — choose the word that completes an English sentence (MCQ, 4 options). Required when `sense.layers` includes it (default true for the AMIRNET track).
  - `production` — type the English word from the Hebrew meaning + a sentence with a blank. Required only when `sense.knowledge === "prod"`.
- One FSRS card per (senseId, layer), via `ts-fsrs`. Desired retention 0.90 (CALIBRATE).

## 2. Rating answers
| Outcome | FSRS rating |
| --- | --- |
| Wrong, or "I don't know" button | Again |
| Correct but slow (> `slowMs[layer]`, CALIBRATE: 8000 / 15000 / 20000) or correct with an accepted typo | Hard |
| Correct | Good |
`Easy` is not used in Phase 0. A self-mark "I know this" in the learn step never rates a card; it schedules a verification item in the same session.

## 3. Mastery
A sense is **mastered** iff every required layer has a card with at least one successful review AND predicted retrievability at the horizon ≥ 0.90, where horizon = exam date (if set and in the future) else `now + 30 days`.
Display states per sense: `new` → `learning` → `recognized` (recognition passed) → `mastered`. A lapse on any required layer drops the sense back to `learning`. Never show `mastered` for a sense that has only self-marks.

## 4. Placement test
### Bank
- Bands by frequency rank (CALIBRATE): B1 1-1000, B2 1001-2000, B3 2001-3000, B4 3001-5000, B5 5001-8000, ACAD (academic words not in B1-B3).
- Per attempt: 5 real items per band (30) + 10 pseudowords + up to 4 verification MCQs ≈ 44 items, ~4-5 minutes.
- Pseudowords are pronounceable non-words (e.g. "prendity"). `content:check` must prove none is a real word or inflection in the lexicon/word list.
### Flow
- Yes/no: "do you know this word?". Items interleaved; at least 4 pseudowords inside the first 20 items; bands roughly ascending.
- Early stop: if two consecutive bands have real-word yes-rate ≤ 0.20, skip the remaining higher bands (`truncated = true`) — but only after ≥ 4 pseudowords were answered.
- Verification: up to 4 MCQs drawn from real words answered "yes" in B3-B5/ACAD.
- State is persisted after every answer; reload resumes at the same item. No back navigation.
### Scoring
- `h_b` = yes-rate on real words in band b; `f` = yes-rate on pseudowords (global).
- `reliable = false` if `f ≥ 0.5`, or fewer than 4 pseudowords answered, or verification accuracy < 0.5 with ≥ 2 verification items.
- Corrected knowledge per band: `p_b = clamp((h_b − f) / (1 − f), 0, 1)`; if `f === 1`, set `p_b = 0` (no division by zero) and `reliable = false`.
- Estimate: `known = Σ p_b × size_b`.
- Interval: per band use smoothed `p̃ = (p_b·n_b + 1) / (n_b + 2)`, `var_b = size_b² · p̃(1 − p̃) / n_b`; `sd = √Σ var_b`; `[known − 1.645·sd, known + 1.645·sd]`, clamped to `[0, Σ size_b]`, low rounded down and high rounded up to the nearest 250. Skipped bands add 0 to `known` and `0.15 × size_b` to the high bound (CALIBRATE).
- Output: `{ low, high, perBand: [{ band, p }], reliable, truncated }`. The UI shows a range and never a single number.

## 5. Answer checking (production layer)
1. Normalize both sides: Unicode NFKC, trim, lowercase, collapse inner whitespace, unify apostrophes (’ → '), strip leading/trailing punctuation.
2. Accepted answers = `sense.answers` (lemma, listed inflections, US/UK variants, listed hyphen/space variants).
3. Exact match → correct.
4. If the input equals any OTHER lemma or listed form in the lexicon → wrong, and record a confusion pair (`target`, `typed`). No typo tolerance in this case (affect ≠ effect).
5. Otherwise, typo tolerance: Damerau-Levenshtein distance ≤ 1 if the target is ≥ 5 characters, else 0. Multi-word answers: at most one typo in total. Correct-with-typo → rated Hard, and the correct spelling is shown.
6. Empty input is not submittable; "I don't know" is a separate button (rated Again).

## 6. Distractors
- Recognition MCQ (engine-generated): candidates with the same part of speech, frequency band within ±1, not the same word family, not listed as a synonym. Their Hebrew glosses must share no normalized gloss with the target (normalize Hebrew: strip niqqud, maqaf → space, remove parenthetical text, split on `,` and `;`). Example of a collision that must be blocked: about/approximately both → "בערך".
- Context MCQ: uses the 3 curated `clozeDistractors` from content (authored in the same inflection as the answer and verified not to fit). If missing, the sense is not eligible for the context layer — never improvise.
- Options are shuffled with the injected `rng`; the correct index must be uniformly distributed (test with a fixed seed over many draws).

## 7. Session builder
Inputs: `now`, `timeZone`, `minutesPerDay`, `examDate?`, card states, track sense order, placement result, `rng`.
- Time per item (CALIBRATE): learn 20s, recognition 8s, context 15s, production 20s. Budget = minutes × 60, hard cap 30 minutes.
- Fill order: (1) due reviews, lowest retrievability first; (2) recent lapses; (3) new senses in track order.
- New senses from bands with placement `p_b ≥ 0.8` go **verify-first**: a recognition MCQ before teaching. Correct → recognition rated Good, no teach card; wrong → normal teach flow.
- New words per day:
  - With exam date: `daysLeft` = local calendar days until the exam; `taperDays = 14` (CALIBRATE). If `daysLeft ≤ taperDays` → no new words unless nothing else is due. Else `newPerDay = ceil(unmasteredTarget / (daysLeft − taperDays))`, capped by the budget.
  - Without exam date: up to 40% of the budget for new words (CALIBRATE).
- On-track status: estimate the minutes/day needed to master the remaining target by the horizon. If > `minutesPerDay` → status "needs more" with a suggested value; else "on track".
- Edge cases: nothing due and nothing new → "you're done for today" + optional extra practice; exam date in the past → prompt to update it; the session survives reload mid-way; items answered offline are kept.

## 8. Days and streaks
- A day is a local calendar date in the user's time zone (`YYYY-MM-DD`). Never compute days as 24-hour multiples (DST).
- Streak +1 on the first completed session of a local day. One automatic freeze per ISO week covers a single missed day.
- Changing the device time zone must not double-count or break a streak (use the stored day keys).

## 9. Required tests (minimum)
Placement: all-yes (f = 1), all-no, f = 0.5 boundary, early stop with < 4 pseudowords, truncated bounds, rounding to 250, clamping at 0 and max.
Answers: affect/effect, adapt/adopt, color/colour, "well-known"/"well known", trailing period, curly apostrophe, 4-letter word with one typo (reject), 6-letter word with transposition (accept, Hard).
Distractors: gloss collision blocked, same-family blocked, uniform correct position over 10,000 seeded draws.
Session: empty state, budget cap, verify-first path, exam today, exam in 10 days (taper), exam in the past, DST change week in Asia/Jerusalem, resume mid-session.
Mastery: self-mark only ≠ mastered; lapse demotes; horizon = exam date vs +30 days.
