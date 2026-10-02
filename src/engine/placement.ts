/**
 * Placement test (docs/ENGINE.md §4): plan building, resume/early stop, verification picks and
 * scoring. Pure: randomness comes from the injected `rng`, state from the persisted answers.
 */
import { PLACEMENT } from "./config";
import { BANDS, type Band } from "./distractors";
import { type Rng, shuffle } from "./random";

export type PlacementStep =
  | { kind: "real"; id: string; lemma: string; band: Band }
  | { kind: "pseudo"; id: string; text: string };
/** One yes/no answer, keyed by the step's stable id; stored in plan order. */
export type PlacementAnswer = { id: string; yes: boolean };
/** Lemma counts per band, from content/placement/bands.json (docs/DECISIONS.md #31). */
export type BandSizes = Record<Band, number>;
export type PlacementResult = {
  low: number;
  high: number;
  perBand: { band: Band; p: number }[];
  reliable: boolean;
  truncated: boolean;
};

/**
 * Up to 5 real items per band in ascending band blocks (B1 … B5, then ACAD, whose words all rank
 * above 3000), with up to 10 pseudowords interleaved: `pseudoInFirstWindow` of them at random
 * slots 2-20 (so ≥ 4 fall inside the first 20 items), the rest at random later slots.
 */
export function buildPlacementPlan(
  bank: readonly { id: string; lemma: string; band: Band }[],
  pseudowords: readonly { id: string; text: string }[],
  rng: Rng,
): PlacementStep[] {
  const reals: PlacementStep[] = BANDS.flatMap((band) =>
    shuffle(
      bank.filter((i) => i.band === band),
      rng,
    )
      .slice(0, PLACEMENT.realPerBand)
      .map((i) => ({ kind: "real" as const, id: i.id, lemma: i.lemma, band })),
  );
  const pseudos: PlacementStep[] = shuffle(pseudowords, rng)
    .slice(0, PLACEMENT.pseudowords)
    .map((p) => ({ kind: "pseudo" as const, id: p.id, text: p.text }));

  const length = reals.length + pseudos.length;
  const window = Math.min(PLACEMENT.firstWindow, length);
  const early = shuffle(range(1, window), rng);
  const late = shuffle(range(window, length), rng);
  const nEarly = Math.min(PLACEMENT.pseudoInFirstWindow, pseudos.length, early.length);
  const nLate = Math.min(pseudos.length - nEarly, late.length);
  const slots = new Set([
    ...early.slice(0, nEarly),
    ...late.slice(0, nLate),
    // Too few late slots (tiny bank): the remaining pseudowords go early after all.
    ...early.slice(nEarly, nEarly + pseudos.length - nEarly - nLate),
  ]);

  const plan: PlacementStep[] = [];
  let r = 0;
  let p = 0;
  for (let i = 0; i < length; i++) plan.push(slots.has(i) ? pseudos[p++]! : reals[r++]!);
  return plan;
}

const range = (from: number, to: number) =>
  Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);

type Tally = { yes: number; n: number };
type Progress = {
  bands: Map<Band, Tally>;
  pseudo: Tally;
  truncated: boolean;
  answered: number;
};

/** Replays answers against the plan, applying the early-stop rule after every answer. */
function replay(plan: readonly PlacementStep[], answers: readonly PlacementAnswer[]): Progress {
  const planned = new Map<Band, number>();
  for (const s of plan) if (s.kind === "real") planned.set(s.band, (planned.get(s.band) ?? 0) + 1);
  const bands = new Map<Band, Tally>();
  const pseudo: Tally = { yes: 0, n: 0 };
  const completed: Band[] = [];
  let truncated = false;
  let answered = 0;

  for (const a of answers) {
    if (truncated) throw new Error(`placement: answer "${a.id}" after the test stopped early`);
    const step = plan[answered];
    if (!step || step.id !== a.id) {
      throw new Error(`placement: answer "${a.id}" does not match plan item ${answered}`);
    }
    answered++;
    const tally = step.kind === "pseudo" ? pseudo : getOrInit(bands, step.band);
    tally.n++;
    if (a.yes) tally.yes++;
    if (step.kind === "real" && tally.n === planned.get(step.band)) completed.push(step.band);
    // Only while a higher band remains: after the last band there is nothing to skip.
    truncated = completed.length < planned.size && earlyStop(completed, bands, pseudo);
  }
  return { bands, pseudo, truncated, answered };
}

/** §4: the last two completed bands both at real-word yes-rate ≤ 0.20, after ≥ 4 pseudowords. */
function earlyStop(completed: readonly Band[], bands: Map<Band, Tally>, pseudo: Tally): boolean {
  if (pseudo.n < PLACEMENT.earlyStopMinPseudo || completed.length < 2) return false;
  return completed.slice(-2).every((b) => rate(bands.get(b)!) <= PLACEMENT.earlyStopYesRate);
}

function getOrInit(m: Map<Band, Tally>, band: Band): Tally {
  let t = m.get(band);
  if (!t) m.set(band, (t = { yes: 0, n: 0 }));
  return t;
}

const rate = (t: Tally) => (t.n === 0 ? 0 : t.yes / t.n);

/**
 * The next yes/no item, or `finished` once every item is answered or the early-stop rule fired
 * (`truncated`). Derived only from the persisted answers, so a reload resumes at the same item.
 * Throws on answers that do not match the plan (corrupted state).
 */
export function nextPlacementStep(
  plan: readonly PlacementStep[],
  answers: readonly PlacementAnswer[],
): { type: "item"; step: PlacementStep } | { type: "finished"; truncated: boolean } {
  const { truncated, answered } = replay(plan, answers);
  if (truncated || answered >= plan.length) return { type: "finished", truncated };
  return { type: "item", step: plan[answered]! };
}

/**
 * §4 Verification: up to 4 senses for real words answered "yes" in B3-B5/ACAD, in random order.
 * Lemmas without a loadable sense are skipped (the MCQ needs its glosses).
 */
export function pickVerificationItems<S>(
  plan: readonly PlacementStep[],
  answers: readonly PlacementAnswer[],
  sensesByLemma: ReadonlyMap<string, S>,
  rng: Rng,
): S[] {
  const byId = new Map(plan.map((s) => [s.id, s]));
  const candidates = answers.flatMap((a) => {
    const step = byId.get(a.id);
    if (!a.yes || step?.kind !== "real" || !PLACEMENT.verificationBands.includes(step.band)) {
      return [];
    }
    const sense = sensesByLemma.get(step.lemma);
    return sense === undefined ? [] : [sense];
  });
  return shuffle([...new Set(candidates)], rng).slice(0, PLACEMENT.maxVerification);
}

/** known = Σ p_b × size_b. Not part of the result: the UI shows a range, never one number. */
export function estimateKnown(perBand: readonly { band: Band; p: number }[], sizes: BandSizes) {
  return perBand.reduce((sum, { band, p }) => sum + p * sizes[band], 0);
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * §4 Scoring: guessing-corrected per-band knowledge and a rounded, clamped interval. Only for a
 * finished (or early-stopped) test; throws otherwise.
 */
export function scorePlacement({
  plan,
  answers,
  verification,
  bandSizes,
}: {
  plan: readonly PlacementStep[];
  answers: readonly PlacementAnswer[];
  /** Verification MCQ results. */
  verification: { correct: number; total: number };
  bandSizes: BandSizes;
}): PlacementResult {
  const { bands, pseudo, truncated, answered } = replay(plan, answers);
  // Score only a finished test: an unreached band would look skipped, a partial one would enter
  // the variance with n_b < 5 (§4 relies on n_b being all of the band's items, or 0).
  if (!truncated && answered < plan.length) {
    throw new Error(`placement: cannot score an unfinished test (${answered}/${plan.length})`);
  }
  const f = rate(pseudo);

  const reliable =
    f < PLACEMENT.maxPseudoYesRate &&
    pseudo.n >= PLACEMENT.minPseudoAnswered &&
    !(
      verification.total >= PLACEMENT.minVerificationItems &&
      verification.correct / verification.total < PLACEMENT.minVerificationAccuracy
    );

  const perBand = BANDS.map((band) => {
    const t = bands.get(band);
    // f = 1 would divide by zero: knowledge is unmeasurable, so p_b = 0 (and unreliable above).
    const p = !t || t.n === 0 || f === 1 ? 0 : clamp((rate(t) - f) / (1 - f), 0, 1);
    return { band, p };
  });
  const known = estimateKnown(perBand, bandSizes);

  let variance = 0;
  let skippedHigh = 0;
  for (const { band, p } of perBand) {
    const n = bands.get(band)?.n ?? 0;
    const size = bandSizes[band];
    if (n === 0) {
      // Skipped bands (n_b = 0) never enter the variance (docs/DECISIONS.md #12).
      skippedHigh += PLACEMENT.skippedBandHighShare * size;
      continue;
    }
    const smoothed = (p * n + 1) / (n + 2);
    variance += (size ** 2 * smoothed * (1 - smoothed)) / n;
  }
  const margin = PLACEMENT.z * Math.sqrt(variance);
  const total = BANDS.reduce((sum, b) => sum + bandSizes[b], 0);
  const step = PLACEMENT.roundTo;
  // Round after clamping, then clamp again: Σ size_b comes from data and need not be a multiple
  // of 250, so rounding up could otherwise pass the maximum.
  const low = clamp(Math.floor(clamp(known - margin, 0, total) / step) * step, 0, total);
  const high = clamp(
    Math.ceil(clamp(known + margin + skippedHigh, 0, total) / step) * step,
    0,
    total,
  );

  return { low, high, perBand, reliable, truncated };
}
