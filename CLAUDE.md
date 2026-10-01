# VOCABI

Vocabulary-first English learning web app (PWA) for Hebrew speakers in Israel.
First track: AMIRNET (mandatory English placement exam from Dec 2026).
Core promise: the learner reaches *verified* mastery of the words they need, not "marked as known".

Read on demand (do NOT load all at once):
- `docs/PRODUCT.md` — users, scope, what is in/out of the current phase
- `docs/ENGINE.md` — placement scoring, answer checking, distractors, session building, mastery
- `docs/CONTENT.md` — content schema and quality rules
- `docs/DESIGN.md` — tokens, typography, RTL rules, components
- `docs/ROADMAP.md` — milestones and acceptance criteria

## Stack
- Next.js (App Router) + TypeScript `strict`, pnpm, Tailwind CSS
- Vitest (unit), Playwright (e2e + screenshots), ESLint + Prettier
- Phase 0: progress stored locally behind the `ProgressStore` interface; Supabase only for the waitlist table
- Phase 1: Supabase (Postgres + RLS + anonymous auth) replaces the local store
- Spaced repetition: `ts-fsrs` (read its README before using its API; do not guess signatures)
- Analytics: PostHog (events listed in `docs/PRODUCT.md`)

## Commands
- `pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm typecheck`
- `pnpm test` (Vitest) · `pnpm e2e` (Playwright) · `pnpm content:check` (content validator)
- Definition of green: `pnpm lint && pnpm typecheck && pnpm test && pnpm content:check && pnpm build` all pass.

## Non-negotiables
- IMPORTANT: Every task ends with evidence: the commands you ran and their output, plus screenshots for UI work. Never claim "done" without it.
- UI is Hebrew, `<html lang="he" dir="rtl">`. All user-facing strings live in `src/i18n/he.ts`; no hard-coded Hebrew in components.
- Any English text inside Hebrew UI goes through the `<En>` component (`dir="ltr" lang="en"`, `unicode-bidi: isolate`).
- Never attach a Hebrew prefix letter to a Latin word in UI copy ("ב־VOCABI" is forbidden; rephrase). Numeric ranges use ASCII hyphen or the word "עד", never an en dash (bidi reverses it).
- Layout uses logical properties only (`ms-/me-/ps-/pe-/start-/end-`, `margin-inline-*`). No `left/right`, `ml-/mr-/pl-/pr-`. Directional icons must mirror in RTL.
- Colors, radii, spacing, motion come from design tokens only (`docs/DESIGN.md`). No raw hex in components.
- Respect `prefers-reduced-motion`. Tap targets ≥ 44px. Text sizes in `rem`.
- The learning engine (`src/engine/`) is pure TypeScript: no React, no I/O, no `Date.now()` inside — time and randomness are injected (`now`, `rng`) so tests are deterministic.
- Engine changes are test-first. Every rule in `docs/ENGINE.md` that you touch must have a test.
- Content never ships unless `pnpm content:check` passes. Do not "fix" validator failures by loosening the validator.
- No secrets in client code. Server-only env vars never use the `NEXT_PUBLIC_` prefix.
- No AI calls in the request path of the app. AI is used only by offline scripts in `scripts/content/`.

## Structure
```
src/app/            routes (landing, onboarding, placement, profile, session, progress, privacy, design)
src/components/     UI components (design-system primitives in src/components/ds/)
src/engine/         pure learning logic + tests (*.test.ts next to source)
src/store/          ProgressStore interface + local implementation
src/content/        typed loaders for content JSON
src/i18n/he.ts      all Hebrew strings
content/            JSON content (senses, placement items, tracks) — validated by Zod
scripts/content/    offline generation / validation / CSV review scripts
e2e/                Playwright specs and screenshot baselines
```

## Workflow
1. Multi-file or uncertain work: plan mode first. Write the plan with files to touch, risks, and the verification you will run.
2. Implement in small commits (Conventional Commits: `feat:`, `fix:`, `test:`, `chore:`).
3. Run the definition of green. For UI, capture Playwright screenshots at 390×844 and 1280×800, light and dark.
4. Before declaring done, delegate a review to the `spec-reviewer` subagent (and `rtl-a11y-auditor` for UI). Fix only findings that affect correctness or stated requirements.
5. Update the relevant `docs/*.md` if behavior changed. Keep this file short.

When compacting, preserve: the current milestone ID, the list of modified files, and failing test names.
