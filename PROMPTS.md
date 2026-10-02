# VOCABI — Claude Code prompts (Phase 0)

Use them in order. One prompt = one fresh session (`/clear` first). Start every prompt in plan mode (Shift+Tab until the status bar shows `⏸ plan mode on`, or `claude --permission-mode plan`). Read the plan, edit it with Ctrl+G if needed, then approve. Prompts are in English on purpose: terminals render Hebrew poorly and English specs are less ambiguous for the agent. Hebrew UI text lives in `src/i18n/he.ts`.

Standard closing block (already included in every prompt below as "Process"):
1. Plan first: files to create/change, order of work, risks, and the exact verification you will run. Wait for my approval.
2. Implement in small Conventional Commits.
3. Run the definition of green from CLAUDE.md and the milestone checks. Show the commands and their output.
4. Use the `spec-reviewer` subagent on the diff (and `rtl-a11y-auditor` for UI). Fix blockers only.
5. Final message: what changed, evidence, deviations from spec, open questions.

---

## P0 — Spec audit (no code)
```
Read CLAUDE.md and every file in docs/. Do not write code.

Goal: find what would make implementation go wrong before it starts.
1. List contradictions between the docs, ambiguous rules, missing decisions, and constants that need a default. Cite file and section for each.
2. Check the technical assumptions against the current reality of the tools: the current stable major versions of Next.js, Tailwind CSS, ts-fsrs, Playwright, PostHog JS and Supabase JS, and any API in the docs that may have changed. Use their official docs. List what must change in our docs.
3. Interview me with the AskUserQuestion tool about the items you cannot decide from the docs. At most 8 questions, hardest first, each with your recommended answer.
4. Write docs/DECISIONS.md: one line per decision (decision, reason, date), and update the affected docs.

Process: plan first and wait for approval. Final message: the list of doc changes.
```

## P1 — M1 Scaffold and quality gates
```
Milestone M1 in docs/ROADMAP.md. Read CLAUDE.md and docs/DECISIONS.md first.

Build the project skeleton:
- Next.js App Router + TypeScript strict (noUncheckedIndexedAccess on) + Tailwind + ESLint + Prettier + Vitest + Playwright, managed by pnpm. Use the installed major versions' current docs; no deprecated APIs.
- Scripts exactly as in CLAUDE.md: dev, build, lint, typecheck, test, e2e, content:check (temporary stub that exits 0 and prints "no content yet").
- Root layout: <html lang="he" dir="rtl">, viewport meta per docs/DESIGN.md, Heebo via next/font, src/i18n/he.ts with the strings used.
- ESLint rules: forbid physical-direction Tailwind classes (ml-, mr-, pl-, pr-, left-, right-, text-left, text-right) and forbid Date.now / Math.random inside src/engine/.
- Folder structure from CLAUDE.md with a README line in each empty folder.
- GitHub Actions CI on push and PR: install with frozen lockfile, lint, typecheck, test, content:check, build. Cache pnpm.
- One Playwright smoke test: home page renders, has dir=rtl, screenshot at 390x844.

Edge cases: the lint rule must not flag `start-`/`end-`/`ms-`/`me-`; make the engine rule work for both `Date.now()` and `new Date()` without arguments.

Verification: show output of every script; show the CI workflow file; attach the screenshot path.
Process: plan → approve → small commits → definition of green → spec-reviewer → final summary.
```

## P2 — M2 Design system
```
Milestone M2. Read docs/DESIGN.md fully before planning.

Implement:
- Tokens as CSS variables for light and dark, mapped into the Tailwind theme. Theme: system default + manual override saved on the device, applied before first paint (no flash). Test the no-flash behavior.
- Fonts with next/font: Heebo, Frank Ruhl Libre, and both Latin serif candidates (Newsreader, Fraunces) behind a CSS variable so we can switch with one line.
- Components in src/components/ds/: Button, Card, Chip, ProgressBar, MasteryRing, WordCard, ChoiceList, AnswerInput, Sheet, Toast, ExamCountdown, Stat, EmptyState, En. All states from DESIGN.md. ChoiceList supports keys 1-4 and announces results via aria-live. Sheet traps focus and closes with Esc. AnswerInput has the exact input attributes from DESIGN.md.
- /design page (noindex) showing every component in every state, both serif candidates side by side, light and dark.
- A unit test that computes WCAG contrast for every text/background token pair and fails under 4.5:1 (3:1 for large text and UI borders).

Edge cases: long Hebrew strings wrap without overflow at 320px; a Hebrew sentence containing an English word keeps correct order; directional icons mirror; reduced motion disables flips.

Verification: Playwright screenshots of /design at 390x844 and 1280x800, light and dark; contrast test output; keyboard-only Playwright walkthrough.
Process: plan → approve → small commits → definition of green → spec-reviewer + rtl-a11y-auditor → final summary.
```

## P3 — M3 Content schema and validator
```
Milestone M3. Read docs/CONTENT.md fully.

Implement:
- src/content/schema.ts with Zod schemas for Sense, Track, PlacementItem, Pseudoword, and inferred types.
- Typed loaders in src/content/ that load only verified senses (and devOnly fixtures only in development).
- scripts/content/check.ts behind `pnpm content:check`: every error and warning rule in CONTENT.md, output as `file › id › RULE_CODE › message`, exit 1 on any error. Includes the distractor-only lexicon (`content/lexicon/distractors.json`) as a source of recognition-MCQ candidates, and treats "fewer than 3 eligible recognition distractors" for a shipping sense as an ERROR, not a warning (docs/DECISIONS.md #3).
- Fixtures: 20 dev senses (devOnly: true, verified) and, for EACH rule, one failing fixture plus a test asserting that exact rule fires and nothing else.

Edge cases: Hebrew text with niqqud, maqaf and gershayim; Latin letters inside parentheses in Hebrew text (still an error if touching Hebrew letters); multi-word lemmas ("get along with"); answers with hyphen/space variants; cloze with two "___" or none; duplicate ids across files.

Verification: test output per rule; a sample content:check run with one error and one warning.
Process: plan → approve → small commits → definition of green → spec-reviewer → final summary.
```

## P4a — M4 Engine, part 1: placement, answers, distractors
```
Milestone M4, part 1. Read docs/ENGINE.md sections 4, 5, 6, 9. Work test-first: write the tests for a rule, see them fail, then implement.

Implement in src/engine/ (pure functions, injected now/rng, constants in config.ts):
- Placement: item ordering (pseudoword constraints), early stop, scoring, reliability flags, interval with smoothing and rounding — exactly as §4.
- Answer checker as §5, including the "other lemma = wrong + confusion pair" rule and Damerau-Levenshtein ≤ 1 for targets ≥ 5 chars.
- Distractor selection as §6 with the Hebrew gloss normalization and collision rule; seeded shuffle.

All §9 tests for these areas must exist. Add property-based tests (fast-check) for: the interval always contains the estimate, low ≤ high, both within [0, total]; the correct option position is uniform.

Verification: test output, coverage report for these files (≥ 90% lines), grep proving no Date.now/Math.random in src/engine.
Process: plan → approve → small commits → definition of green → spec-reviewer → final summary.
```

## P4b — M4 Engine, part 2: FSRS, mastery, session, streak
```
Milestone M4, part 2. Read docs/ENGINE.md sections 1, 2, 3, 7, 8, 9 and the ts-fsrs README (current version) before planning. Do not guess its API.

Implement in src/engine/:
- FSRS wrapper: one card per (senseId, layer); rating mapping from §2; desired retention from config.
- Mastery per §3 with the horizon rule, display states, and lapse demotion.
- Session builder per §7: budget, ordering, verify-first, new-word quota with exam taper, on-track status, empty-state result.
- Day keys and streaks per §8 using IANA time zones (Asia/Jerusalem in tests), including a DST transition week and a time-zone change.

Edge cases from §7 and §9 are mandatory tests. Use an injected clock to simulate day 1, day 2, day 8.

Verification: test output, coverage ≥ 90% for src/engine, a short table in the final message mapping each §-rule to its test names.
Process: plan → approve → small commits → definition of green → spec-reviewer → final summary.
```

## P5 — M5 Content pipeline scripts
```
Milestone M5. Read docs/CONTENT.md (Translation standard + Pipeline).

Implement:
- scripts/content/generate.ts: input CSV (lemma, senseHint, band, track) → Anthropic Message Batches API → draft Sense JSON. Model from ANTHROPIC_MODEL, key from ANTHROPIC_API_KEY (read from .env.local, never committed). The generation prompt lives in scripts/content/prompts/sense.md and embeds the Translation standard verbatim. Validate each result with the Zod schema; retry invalid items at most 2 times; write failures to a log file. Support --dry-run (prints requests, no API call) and resumes a batch by id.
- scripts/content/export-review.ts → review/<date>.csv, UTF-8 with BOM, columns from CONTENT.md.
- scripts/content/import-review.ts: applies approve/fix/reject, sets verification fields; a rejected sense is removed from all tracks (`tracks: []` and its id deleted from every track `order`, docs/CONTENT.md Pipeline step 5); refuses rows whose id is unknown or whose edited Hebrew violates validator rules.
- scripts/content/pseudowords.ts: generates candidate pseudowords and rejects any that exist in the reference word list or as inflections, any with length outside 7-10 characters, and any within Damerau-Levenshtein distance ≤2 of a word/inflection among the top ~20,000 most frequent English words (not the full lexicon — checking against every word would reject almost every candidate) (docs/DECISIONS.md #7).

Edge cases: CSV fields with commas, quotes and Hebrew; Excel re-saving the CSV (BOM, CRLF); partial batch failures; rate limits (backoff); re-running generation must not overwrite verified records.

Verification: unit tests for CSV round-trip with Hebrew, a --dry-run output sample, and a run of import-review on a fixture CSV.
Process: plan → approve → small commits → definition of green → spec-reviewer → final summary.
```

## P6 — M6 Landing, onboarding, placement, profile
```
Milestone M6. Read docs/PRODUCT.md (screens 1-4), docs/DESIGN.md, docs/ENGINE.md §4.

Implement routes /, /start, /placement, /profile using the ds components, the engine, the content loaders and a ProgressStore interface (src/store/) with a local implementation (versioned schema, migration function, corrupted-data recovery that resets safely and logs once).

Requirements:
- Goal choices, optional exam date (reject past, allow today), minutes 5/10/20.
- Placement: one item per screen, big tap targets, progress bar, no back, state saved after every answer, resume on reload.
- Profile: range text ("בערך X עד Y מילים"), per-band bars, target coverage, daily plan, unreliable-result message with retake option.
- All copy in he.ts; English words via <En>.

Edge cases: storage unavailable (private mode / quota) → app still works for the session with a warning; double-tap on an answer counts once; resizing mid-placement; very fast answers (< 300ms) still recorded.

Verification: e2e for the full path and for reload-resume; screenshots of the 4 screens (390/1280, light/dark).
Process: plan → approve → small commits → definition of green → spec-reviewer + rtl-a11y-auditor → final summary.
```

## P7 — M7 Session, progress, PWA
```
Milestone M7. Read docs/PRODUCT.md (screens 5-7), docs/ENGINE.md §1-3, §7-8, docs/DESIGN.md.

Implement /session, /session/done, /progress:
- Learn step (WordCard with audio, example, "I know this" → schedules a verification item), practice across layers (ChoiceList for recognition/context, AnswerInput for production), feedback with correct answer and example, report-error sheet (reasons: translation, example, audio, other).
- Session state persisted after every answer; reload resumes at the same item.
- Done screen: MasteryRing deltas, streak, next session, Pro painted-door button (UI only for now).
- Progress: mastered count, weak words list, streak, ExamCountdown with on-track status.
- Web Speech audio (en-US voice if available; hide the button when unsupported).
- Web app manifest + icons; installable.

Edge cases: empty session state, exam today/past, no en-US voice, user switches tab mid-item, back button during a session (confirm leaving), clock injected in e2e to simulate day 2 and day 8.

Verification: e2e for first session, resume, day-2 reviews, countdown states; screenshots.
Process: plan → approve → small commits → definition of green → spec-reviewer + rtl-a11y-auditor → final summary.
```

## P8 — M8 Analytics, waitlist, privacy, deploy
```
Milestone M8. Read docs/PRODUCT.md (Pro painted door, Analytics events).

Implement:
- PostHog client with the exact event names and properties from PRODUCT.md, anonymous id persisted on the device, no PII, non-blocking, silent failure when blocked.
- Waitlist: Pro sheet with email + unchecked consent checkbox → POST /api/waitlist (server route): validation, honeypot field, per-IP rate limit, lowercase dedupe, insert with a server-only Supabase key. SQL migration in supabase/migrations/ creating the table with RLS enabled and NO anon policies. A test proving the anon key cannot select or insert.
- /privacy page in plain Hebrew (local storage, analytics, waitlist email, how to delete).
- Production deploy and environment variables documented in docs/DEPLOY.md.

Edge cases: double submit, invalid email, consent unchecked, network failure with retry message, analytics blocked.

Verification: screenshot of PostHog live events from production; waitlist insert + duplicate test output; anon access test output; Lighthouse mobile scores for / and /session.
Process: plan → approve → small commits → definition of green → spec-reviewer + rtl-a11y-auditor → final summary.
```

## P9 — M9 Hardening
```
Milestone M9. Use subagents to keep this session's context clean.

1. spec-reviewer on the full diff since the first commit, against PRODUCT, ENGINE, CONTENT, DESIGN.
2. rtl-a11y-auditor on every route, including a 200% text-size pass.
3. Replay every ENGINE §9 edge case that is observable in the UI as an e2e test.
4. Copy audit of src/i18n/he.ts: no Hebrew prefix on Latin words, no en dash between digits, no promised score or exemption.
5. Offline check: start a session, go offline, answer items, come back online — nothing lost.

Write docs/QA-REPORT.md with findings, fixes and evidence. Fix blockers only; list the rest.
Process: plan → approve → fixes in small commits → definition of green → final summary.
```

---

## Utility prompts
**Bug:**
```
Bug: <what happened>, expected <what should happen>, on <route/device>. Steps: <1,2,3>.
Write a failing test that reproduces it first, then fix the root cause (don't suppress it), then run the definition of green and show the output.
```
**Stuck after two corrections:** run `/clear`, then start again with a prompt that includes what you learned from the failed attempts.
**Independent review of a branch:**
```
Use the spec-reviewer subagent to review the diff of branch <name> against main and milestone <M#>. Report blockers only.
```
