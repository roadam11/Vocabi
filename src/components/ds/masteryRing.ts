import { format } from "@/i18n/format";
import { he } from "@/i18n/he";

export type Layer = "recognition" | "context" | "production";
export const LAYER_ORDER: readonly Layer[] = ["recognition", "context", "production"];

/** Keys present = the sense's required layers; value = passed. */
export type SenseLayers = Partial<Record<Layer, boolean>>;
/** Share (0-1) of all senses requiring a layer that have passed it. */
export type LayerShares = Record<Layer, number>;

export type Segment = { layer: Layer; fill: number };

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

/** Per-sense ring: 1-3 segments, exactly the required layers, fixed order (DECISIONS #2). */
export function senseSegments(layers: SenseLayers): Segment[] {
  const out = LAYER_ORDER.filter((l) => layers[l] !== undefined).map((layer) => ({
    layer,
    fill: layers[layer] ? 1 : 0,
  }));
  if (out.length === 0) throw new Error("MasteryRing: a sense requires at least one layer");
  return out;
}

/** Aggregate ring: always 3 segments. */
export function aggregateSegments(shares: LayerShares): Segment[] {
  return LAYER_ORDER.map((layer) => ({ layer, fill: clamp01(shares[layer]) }));
}

const t = he.ds.masteryRing;

export function senseRingLabel(layers: SenseLayers): string {
  const segments = senseSegments(layers);
  const details = segments
    .map((s) => format(t.senseLayer, { layer: t[s.layer], state: s.fill ? t.passed : t.notPassed }))
    .join(", ");
  const passed = segments.filter((s) => s.fill).length;
  return format(t.senseLabel, { passed, total: segments.length, details });
}

export function aggregateRingLabel(shares: LayerShares): string {
  const details = aggregateSegments(shares)
    .map((s) => format(t.aggregateLayer, { layer: t[s.layer], percent: Math.round(s.fill * 100) }))
    .join(", ");
  return format(t.aggregateLabel, { details });
}
