# VOCABI — Roadmap (Phase 0 in detail)

Each milestone is one or a few Claude Code sessions. A milestone is done only when every acceptance criterion has evidence (command output or screenshot) and `spec-reviewer` found no correctness gaps.

See `docs/DECISIONS.md` for the log of decisions that refine the rules below — read it alongside the other docs before starting any milestone.

## M0 — Setup (human)
Accounts and tools ready: GitHub repo `vocabi` (private), Node LTS, pnpm, Claude Code, Vercel account, Supabase project (waitlist only), PostHog project (EU region), Anthropic API key (for content scripts only). Kit files copied to the repo root.

## M1 — Scaffold and quality gates
- Next.js (App Router) + TypeScript strict + Tailwind + ESLint + Prettier + Vitest + Playwright, pnpm scripts from CLAUDE.md.
- `<html lang="he" dir="rtl">`, Heebo loaded, `src/i18n/he.ts` with the first strings.
- GitHub Actions CI: lint, typecheck, test, content:check (stub), build on every push/PR.
**Accept:** all scripts pass locally and in CI; a placeholder page renders RTL (screenshot 390×844); `pnpm e2e` runs one smoke test.

## M2 — Design system
- Tokens (light/dark) from `docs/DESIGN.md`, theme toggle without flash, fonts, all components in `src/components/ds/`, `/design` showcase with every state.
- Contrast test: a unit test computing WCAG ratios for every text/background token pair used.
**Accept:** `/design` screenshots (390 + 1280, light + dark); contrast test green; keyboard-only walkthrough of `/design` recorded in a Playwright test; `rtl-a11y-auditor` report with no blockers.

## M3 — Content schema and validator
- Zod schema for senses, tracks, placement items, pseudowords; typed loaders; `pnpm content:check` implementing every rule in `docs/CONTENT.md` (errors + warnings).
- Fixtures: 20 hand-written dev senses (status `verified`, marked `devOnly: true`) + failing fixtures proving each rule fires.
**Accept:** each validator rule has a failing fixture test and a passing one; `content:check` output is readable (file, id, rule, message).

## M4 — Learning engine (test-first)
- `src/engine/`: placement scoring, answer checking, distractors, FSRS wrapper, mastery, session builder, streaks — exactly as `docs/ENGINE.md`.
**Accept:** every "Required test" in ENGINE §9 exists and passes, including the on-track hysteresis tests (`previousStatus` input, flapping test around the 95%/110% thresholds), the rolling-7-day streak-freeze tests, the distractor widen/practice-only fallback tests, and the `unmasteredTarget` cost-weighting test; coverage of `src/engine/` ≥ 90% lines; no `Date.now()`/`Math.random()` inside the engine (lint rule or grep check in CI). The §9 `ProgressStore.exportAll()`/`importAll()` round-trip test is delivered with the store in M6.

## M5 — Content pipeline (Phase 0 scale)
- `scripts/content/generate.ts` (Message Batches API), `export-review.ts` (CSV with BOM), `import-review.ts`.
- `scripts/content/pseudowords.ts`: reject candidates within Damerau-Levenshtein distance ≤2 of any word/inflection among the top ~20,000 most frequent English words, and enforce length 7-10 characters (`docs/DECISIONS.md` #7).
- `content/placement/bands.json`: band sizes in lemmas from the disjoint partition (ACAD = NAWL lemmas ranked > 3000, removed from B4/B5; `docs/DECISIONS.md` #31), with its builder script, Zod check in `content:check`, and loader wiring. *(P5a done: `content:bands`, `BANDS_STALE`/`PLACEMENT_BAND`, placement bank, pseudowords, Noa list, starter CSV — DECISIONS #50-55. P5b: generation and review.)*
- `content/lexicon/distractors.json`: the distractor-only lexicon backing recognition-MCQ generation when shipping senses alone don't supply 3 eligible distractors (`docs/DECISIONS.md` #3).
- Produce: ~150 AMIRNET starter senses + placement bank (real items per band + 10+ pseudowords). Roie reviews every row, including the slang/brand/other-language pseudoword check.
**Accept:** all shipping senses `verified`; `content:check` passes with zero errors (including the new recognition-distractor-count error); `content/SOURCES.md` lists every source list used.

## M6 — Landing, onboarding, placement, profile
Routes `/`, `/start`, `/placement`, `/profile` per `docs/PRODUCT.md`, using the engine and content. State in the local `ProgressStore`, built to the migratable-store contract in `docs/ENGINE.md` §7 (`docs/DECISIONS.md` #8).
**Accept:** e2e: landing → goal → full placement → profile; reload in the middle of placement resumes at the same item; unreliable-result path covered; screenshots of all four screens; `ProgressStore.exportAll()`/`importAll()` round-trip test passes.

## M7 — Session, progress, PWA
Routes `/session`, `/session/done`, `/progress`. Learn → practice (3 layers) → verify. Report-error button on every card. Web Speech audio with fallback. Web app manifest + icons (installable).
**Accept:** e2e: first session end to end, mid-session reload resumes, day-2 simulation (injected clock) shows due reviews, exam-date countdown states (none / >14 days / ≤14 days / past); screenshots.

## M8 — Analytics, waitlist, privacy, deploy
PostHog events exactly as PRODUCT.md (no PII), initialized via `instrumentation-client.ts` with a dated `defaults` bundle (`docs/DECISIONS.md` #20). Waitlist via a server route (validation, honeypot, rate limit, dedupe) into Supabase with RLS denying anon access; each row stores `consentTimestamp` and `privacyNoticeVersion` (`docs/DECISIONS.md` #5). `/privacy` page. Production deploy.
**Accept:** events visible in PostHog from a production session; waitlist insert works and a second insert of the same email is deduped; anon key cannot read the table (tested); Lighthouse mobile ≥ 90 for performance and accessibility on `/` and `/session`.
**Phase 1 backlog note:** a scheduled job to delete waitlist rows per the retention policy (30 days after the Pro-launch announcement, or 12 months after signup, whichever is first) is not built in Phase 0 — tracked for Phase 1 (`docs/DECISIONS.md` #5).

## M9 — Hardening before the experiment
Adversarial review of the whole funnel, edge-case checklist from ENGINE §9 replayed in e2e where possible, 200% text-size check, offline behavior check, copy review (no Hebrew prefix on Latin words, no promised scores).
**Accept:** zero open blockers; a short `docs/QA-REPORT.md` with evidence.

## Experiment (2-3 weeks)
Share with your students and in 2-3 communities. Read the funnel weekly. Gate 1: ≥ 30% day-2 return among first-session finishers. Decide Phase 1 only after the gate.
