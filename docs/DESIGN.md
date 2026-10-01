# VOCABI — Design system

Direction: "an expensive book, not a game". Calm, typographic, one accent color, generous whitespace. Mobile first (390px). Never childish: no mascots, no confetti storms, no neon.

## Tokens (CSS variables on `:root`, mapped into Tailwind theme)
| Token | Light | Dark |
| --- | --- | --- |
| `--bg` (paper) | #F7F4EC | #121110 |
| `--surface` (card) | #FFFFFF | #1C1A16 |
| `--surface-2` | #FBFAF6 | #24211B |
| `--ink` | #1C1A17 | #ECE6D8 |
| `--ink-2` (secondary) | #6F695E | #A39B8B |
| `--line` | #E2DDD0 | #37322A |
| `--accent` (olive) | #677042 | #A9B377 |
| `--accent-soft` | #E8EAD9 | #2B2D20 |
| `--on-accent` | #FFFFFF | #121110 |
| `--success` | #2C6E49 | #5FB383 |
| `--success-soft` | #E6F0E8 | #1B2A20 |
| `--danger` (terracotta) | #A3492A | #DC7C5D |
| `--danger-soft` | #F6E7E0 | #32211A |
- Two tokens were darkened from the tutoring pages to pass WCAG AA (4.5:1), measured: `--ink-2` #8C8578 → #6F695E (3.33 → 4.95 on `--bg`); `--accent` #7A8450 → #677042 (white text on it 4.00 → 5.29; as text on `--bg` 3.64 → 4.81). Verify every text/background pair with a contrast check in tests; fix the token, not the component.
- Dark mode: `prefers-color-scheme` by default + manual override stored on the device (`data-theme` on `<html>`). No flash of the wrong theme on load (set the attribute before paint).
- Radii: card 16, control 12, chip 999. Spacing scale: 4/8/12/16/24/32/48. Shadows: at most one soft shadow level.

## Typography (`next/font`, self-hosted, `display: swap`)
- English headword: a Latin serif — candidates **Newsreader** and **Fraunces**; choose after a side-by-side on a real phone (`/design` page shows both). 40-48px on the word card.
- Hebrew display: **Frank Ruhl Libre** (weights 500/700/900).
- UI and translations: **Heebo** (400/500/700), base 17px (`1.0625rem`), line-height 1.6.
- Numbers in UI use tabular figures where they change (timers, counters).

## RTL rules
- `<html lang="he" dir="rtl">`. Logical properties only.
- `<En>` component for every English fragment: `<span dir="ltr" lang="en" class="isolate">`. Applies to words, examples, IPA, brand names inside Hebrew sentences.
- Mixed lines (Hebrew sentence containing an English word) must render in the correct reading order; covered by a Playwright screenshot test.
- Directional icons (back/next arrows, chevrons) mirror in RTL; non-directional icons (play, check) do not.
- Inputs for English answers: `dir="ltr"`, `lang="en"`, `autocapitalize="none"`, `autocorrect="off"`, `spellcheck="false"`, `inputmode="text"`.

## Motion
- Durations 150-250ms, `ease-out`; card flip 400ms with a light spring; button press scales to 0.98.
- Library: Motion (formerly Framer Motion), only where CSS transitions are not enough.
- `prefers-reduced-motion: reduce` → no transforms, no flips; fades ≤ 100ms.

## Core components (`src/components/ds/`)
`Button` (primary/secondary/ghost/danger, loading state), `Card`, `Chip`, `ProgressBar` (thin, top of session), `MasteryRing` (the signature element; per-sense variant renders 1-3 segments — exactly the sense's required layers, fixed order recognition→context→production, never a fixed 3 with greyed-out slots; aggregate variant on `/session/done` and `/progress` always shows 3 segments = share of all senses requiring+passing that layer; every ring ships a text alternative via `aria-label`, never color-only — `docs/DECISIONS.md` #2), `WordCard` (headword in serif, POS chip, audio button, Hebrew meaning, example), `ChoiceList` (MCQ with keyboard 1-4 and full a11y), `AnswerInput` (production layer, with "I don't know"), `Sheet` (bottom sheet with focus trap, Esc closes), `Toast`, `ExamCountdown`, `Stat`, `EmptyState`, `En`.
Each component: all states (default, hover, focus-visible, active, disabled, loading, error), light + dark, shown on `/design`.

## Layout
- One task per screen. Primary action in the thumb zone (bottom), respecting `env(safe-area-inset-bottom)`.
- Max content width 560px on desktop, centered.
- Viewport meta: `width=device-width, initial-scale=1, viewport-fit=cover`. Never disable zoom.

## Accessibility (WCAG 2.2 AA)
Contrast AA for all text; focus-visible ring using `--accent`; tap targets ≥ 44px; all controls reachable by keyboard; MCQ answers announced via `aria-live` (polite); feedback never by color alone (icon + text); text scales with the browser font size without breaking layout (test at 200%).

## Visual verification
Playwright screenshots of each screen at 390×844 and 1280×800, light and dark, stored as baselines in `e2e/__screenshots__/`. A visual change must be intentional and reviewed.
