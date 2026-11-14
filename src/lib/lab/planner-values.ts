// The base of the Lab's sample-size planner: a hypothetical sign-up page, its baseline conversion and
// the rise to detect, in whole percentages and whole points. Pure and client-safe: the server draws
// the preset with it and the island redraws with it. It must not import @/lib/stats: the control row
// the page loads at once reaches it through full-planner-values.ts (guarded by
// tests/unit/lab/full-planner.test.ts).
//
// Arithmetic is on integer percentages, so 29% plus 5 points is exactly 34% (0.29 + 0.05 is not),
// and the target never passes 99%: the rise is capped at min(30, 99 - baseline percent). The URL
// schema is static; the joint cap is applied after it is read, so no shared URL, however hostile,
// gives an invalid pair.
import type { DerivedRef } from '@/components/kit/Derived';
import type { ParamValues, Presets } from '@/lib/figure/url-state';

export const PLANNER_SCHEMA = {
  baseline: { kind: 'number', min: 0.01, max: 0.98, step: 0.01 },
  risePoints: { kind: 'number', min: 1, max: 30, step: 1 },
} as const;

export type PlannerValues = ParamValues<typeof PLANNER_SCHEMA>;

export const PLANNER_PRESETS: Presets<typeof PLANNER_SCHEMA> = { default: { baseline: 0.29, risePoints: 5 } };

export const PLANNER_ALPHA = 0.05;
export const PLANNER_POWER = 0.8;
export const PLANNER_REFS: readonly DerivedRef[] = ['simulated'];

const BASELINE_MIN = 1;
const BASELINE_MAX = 98;
const RISE_MIN = 1;
const RISE_MAX = 30;
const TARGET_MAX = 99;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function baselinePercent(baseline: number): number {
  const v = Number.isNaN(baseline) ? PLANNER_PRESETS.default.baseline : baseline;
  return clamp(Math.round(v * 100), BASELINE_MIN, BASELINE_MAX);
}

/** The largest rise, in points, that keeps the target at or under 99% for this baseline. */
export function riseMax(baseline: number): number {
  return Math.min(RISE_MAX, TARGET_MAX - baselinePercent(baseline));
}

/** The target rate for a baseline and a rise, in whole percentages (0.29 and 5 give exactly 0.34). */
export function targetRate(baseline: number, risePoints: number): number {
  return (baselinePercent(baseline) + risePoints) / 100;
}

/** Both inputs on their grids and jointly valid: baseline 1% to 98%, rise 1 point up to the cap. */
export function normalizePlanner(v: PlannerValues): PlannerValues {
  const percent = baselinePercent(v.baseline);
  const rise = Number.isNaN(v.risePoints) ? PLANNER_PRESETS.default.risePoints : v.risePoints;
  return {
    baseline: percent / 100,
    risePoints: clamp(Math.round(rise), RISE_MIN, Math.min(RISE_MAX, TARGET_MAX - percent)),
  };
}

/** "29%" */
export const percentText = (rate: number) => `${Math.round(rate * 100)}%`;
/** "5 points" */
export const pointsText = (points: number) => `${points} ${points === 1 ? 'point' : 'points'}`;
