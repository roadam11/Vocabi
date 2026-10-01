# VOCABI — Roadmap (Phase 0 in detail)

Each milestone is one or a few Claude Code sessions. A milestone is done only when every acceptance criterion has evidence (command output or screenshot) and `spec-reviewer` found no correctness gaps.

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
**Accept:** every "Required test" in ENGINE §9 exists and passes; coverage of `src/engine/` ≥ 90% lines; no `Date.now()`/`Math.random()` inside the engine (lint rule or grep check in CI).

## M5 — Content pipeline (Phase 0 scale)
- `scripts/content/generate.ts` (Message Batches API), `export-review.ts` (CSV with BOM), `import-review.ts`.
- Produce: ~150 AMIRNET starter senses + placement bank (real items per band + 10+ pseudowords). Roie reviews every row.
**Accept:** all shipping senses `verified`; `content:check` passes with zero errors; `content/SOURCES.md` lists every source list used.

## M6 — Landing, onboarding, placement, profile
Routes `/`, `/start`, `/placement`, `/profile` per `docs/PRODUCT.md`, using the engine and content. State in the local `ProgressStore`.
**Accept:** e2e: landing → goal → full placement → profile; reload in the middle of placement resumes at the same item; unreliable-result path covered; screenshots of all four screens.

## M7 — Session, progress, PWA
Routes `/session`, `/session/done`, `/progress`. Learn → practice (3 layers) → verify. Report-error button on every card. Web Speech audio with fallback. Web app manifest + icons (installable).
**Accept:** e2e: first session end to end, mid-session reload resumes, day-2 simulation (injected clock) shows due reviews, exam-date countdown states (none / >14 days / ≤14 days / past); screenshots.

## M8 — Analytics, waitlist, privacy, deploy
PostHog events exactly as PRODUCT.md (no PII). Waitlist via a server route (validation, honeypot, rate limit, dedupe) into Supabase with RLS denying anon access. `/privacy` page. Production deploy.
**Accept:** events visible in PostHog from a production session; waitlist insert works and a second insert of the same email is deduped; anon key cannot read the table (tested); Lighthouse mobile ≥ 90 for performance and accessibility on `/` and `/session`.

## M9 — Hardening before the experiment
Adversarial review of the whole funnel, edge-case checklist from ENGINE §9 replayed in e2e where possible, 200% text-size check, offline behavior check, copy review (no Hebrew prefix on Latin words, no promised scores).
**Accept:** zero open blockers; a short `docs/QA-REPORT.md` with evidence.

## Experiment (2-3 weeks)
Share with your students and in 2-3 communities. Read the funnel weekly. Gate 1: ≥ 30% day-2 return among first-session finishers. Decide Phase 1 only after the gate.
