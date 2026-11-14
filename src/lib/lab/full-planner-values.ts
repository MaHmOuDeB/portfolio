// The full sample-size planner's values: the base planner's two inputs (baseline conversion in whole
// percentages, the rise in whole points) plus the unit the rise is shown in, and the paired duration
// Figure's traffic. Pure and client-safe: the control row the page loads at once uses it. It must not
// import @/lib/stats (tests/unit/lab/full-planner.test.ts walks its imports); the statistics side is
// full-planner.ts.
//
// The rise is stored in one canonical unit, whole points, whatever unit it is shown in, so switching
// between points and percent of the baseline never changes the baseline, the rise, the target or the
// sample. The relative display steps on the same integer-point grid: each step is one point, shown
// as its percent of the baseline. Both URL schemas are static; the joint cap (the base planner's
// normalizePlanner) is applied after they are read.
import type { DerivedRef } from '@/components/kit/Derived';
import { formatNumber } from '@/lib/figure/format';
import type { ParamValues, Presets } from '@/lib/figure/url-state';
import { normalizePlanner, percentText, pointsText, riseMax } from './planner-values';

/** The Lab's ids; the Retention page passes its own pair. */
export const FULL_PLANNER_ID = 'planner';
export const DURATION_ID = 'duration';

export const MDE_MODES = ['absolute', 'relative'] as const;
export type MdeMode = (typeof MDE_MODES)[number];

/** Where the planner stands: a hypothetical test (the Lab) or the Retention win-back sizing. */
export type PlannerContext = 'hypothetical' | 'retention';
/** What the groups are made of, per context. */
export type PlannerNoun = 'visitors' | 'customers';
export const PLANNER_NOUN: Record<PlannerContext, PlannerNoun> = { hypothetical: 'visitors', retention: 'customers' };

export const FULL_PLAN_SCHEMA = {
  baseline: { kind: 'number', min: 0.01, max: 0.98, step: 0.01 },
  risePoints: { kind: 'number', min: 1, max: 30, step: 1 },
  mode: { kind: 'enum', values: MDE_MODES },
} as const;

export type FullPlanValues = ParamValues<typeof FULL_PLAN_SCHEMA>;

/** The preset: the base planner's, shown in points. The Retention context reads it as its sourced sizing. */
export const FULL_PLAN_PRESETS: Presets<typeof FULL_PLAN_SCHEMA> = { default: { baseline: 0.29, risePoints: 5, mode: 'absolute' } };

export const DURATION_SCHEMA = { traffic: { kind: 'number', min: 1, max: 10_000, step: 1 } } as const;
export type DurationValues = ParamValues<typeof DURATION_SCHEMA>;
export const DURATION_PRESETS: Presets<typeof DURATION_SCHEMA> = { default: { traffic: 100 } };

export const FULL_PLANNER_REFS: readonly DerivedRef[] = ['simulated'];

/** The baseline and the rise jointly valid (the base planner's normalization); an unknown unit is points. */
export function normalizeFullPlan(v: FullPlanValues): FullPlanValues {
  const pair = normalizePlanner({ baseline: v.baseline, risePoints: v.risePoints });
  return { ...pair, mode: v.mode === 'relative' ? 'relative' : 'absolute' };
}

/** Visitors a day: a whole number from 1 to 10,000; NaN gives the preset. */
export function normalizeTraffic(traffic: number): number {
  const { min, max } = DURATION_SCHEMA.traffic;
  const v = Number.isNaN(traffic) ? DURATION_PRESETS.default.traffic : traffic;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** The baseline in whole percent, as normalized. */
const baselinePercent = (baseline: number) => Math.round(normalizePlanner({ baseline, risePoints: 1 }).baseline * 100);

/**
 * The rise as a percent of the baseline: 100 x (risePoints / 100) / baseline, computed on the whole
 * percent (5 points on 29% is 17.24...).
 */
export function relativePercent(baseline: number, risePoints: number): number {
  return (100 * risePoints) / baselinePercent(baseline);
}

/** An edited percent of the baseline, mapped to the nearest whole point and normalized with the baseline. */
export function risePointsFromRelative(baseline: number, percent: number): number {
  const points = Number.isNaN(percent) ? Number.NaN : (percent * baselinePercent(baseline)) / 100;
  return normalizePlanner({ baseline, risePoints: points }).risePoints;
}

/** The relative slider's range: one step is one whole point, shown as its percent of the baseline. */
export function relativeSliderBounds(baseline: number): { min: number; max: number; step: number } {
  const step = 100 / baselinePercent(baseline);
  return { min: step, max: riseMax(baseline) * step, step };
}

/** "17.2%": a percent of the baseline, one decimal at most. */
export const relativeText = (percent: number) => `${formatNumber(percent, 1)}%`;

/** The rise in the chosen unit: "5 points" or "17.2% of the baseline". */
export function riseText(v: FullPlanValues): string {
  const n = normalizeFullPlan(v);
  return n.mode === 'relative' ? `${relativeText(relativePercent(n.baseline, n.risePoints))} of the baseline` : pointsText(n.risePoints);
}

/** "1 visitor", "4 customers". */
export function countText(count: number, noun: PlannerNoun): string {
  return `${formatNumber(count, 0)} ${count === 1 ? noun.slice(0, -1) : noun}`;
}

/** "1 week", "4 weeks". */
export const weeksText = (weeks: number) => `${formatNumber(weeks, 0)} ${weeks === 1 ? 'week' : 'weeks'}`;

export { percentText, pointsText };
