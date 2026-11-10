// The full sample-size planner's statistics side: the visitors per group (the Home planner's model),
// the weeks the paired duration Figure needs, the result sentences and the table fallbacks. It
// imports the statistics, so only the server and the lazy island draw with it; the values the page
// loads at once live in full-planner-values.ts.
import type { TableData } from '@/components/kit/DataTable';
import { formatNumber } from '@/lib/figure/format';
import { durationWeeks } from '@/lib/stats';
import {
  FULL_PLANNER_REFS,
  countText,
  normalizeFullPlan,
  normalizeTraffic,
  percentText,
  relativePercent,
  riseText,
  weeksText,
  type FullPlanValues,
  type PlannerNoun,
} from './full-planner-values';
import { planModel } from './planner';

export * from './full-planner-values';

/**
 * Visitors per group (Cohen's h, two-sided, alpha 0.05, power 0.8: the Home planner's planModel on
 * the normalized pair), the target rate and the rise as a fraction of the baseline, the effect the
 * statistics call relative (target = baseline x (1 + relativeRise)). The unit never changes them.
 */
export function fullPlanModel(v: FullPlanValues): { nPerArm: number; target: number; relativeRise: number } {
  const n = normalizeFullPlan(v);
  const { nPerArm, target } = planModel({ baseline: n.baseline, risePoints: n.risePoints });
  return { nPerArm, target, relativeRise: relativePercent(n.baseline, n.risePoints) / 100 };
}

/**
 * Whole weeks, rounded up, for both groups to reach `nPerArm` when `traffic` visitors a day enter
 * the test in total, split equally (durationWeeks). The traffic is normalized first; `nPerArm` is a
 * plan's result and must be a finite number of at least 1.
 */
export function durationModel(nPerArm: number, traffic: number): { weeks: number } {
  return { weeks: durationWeeks({ nPerArm, entryViewsPerDay: normalizeTraffic(traffic) }) };
}

const capital = (noun: PlannerNoun) => `${noun[0]!.toUpperCase()}${noun.slice(1)}`;

/** The sizing announcement: "1,353 visitors per group to detect a rise of 5 points, from 29% to 34%". */
export function fullPlanSentence(v: FullPlanValues, noun: PlannerNoun = 'visitors'): string {
  const n = normalizeFullPlan(v);
  const plan = fullPlanModel(n);
  return `${formatNumber(plan.nPerArm, 0)} ${noun} per group to detect a rise of ${riseText(n)}, from ${percentText(n.baseline)} to ${percentText(plan.target)}`;
}

/** The sizing table: the inputs in both units and the result. The unit shown does not change it. */
export function fullPlanTable(v: FullPlanValues, noun: PlannerNoun = 'visitors'): TableData {
  const n = normalizeFullPlan(v);
  const plan = fullPlanModel(n);
  return {
    columns: ['Input or result', 'Value'],
    rows: [
      ['Baseline conversion (%)', Math.round(n.baseline * 100)],
      ['Rise to detect (percentage points)', n.risePoints],
      ['Rise to detect (% of baseline)', relativePercent(n.baseline, n.risePoints)],
      ['Target conversion (%)', Math.round(plan.target * 100)],
      [`${capital(noun)} per group`, plan.nPerArm],
    ],
    formats: ['number', 'points'],
    rowDigits: [0, 0, 1, 0, 0],
    refs: FULL_PLANNER_REFS,
  };
}

/** The duration announcement: "4 weeks at 100 visitors a day to reach 1,353 visitors per group". */
export function durationSentence(nPerArm: number, traffic: number, noun: PlannerNoun = 'visitors'): string {
  const t = normalizeTraffic(traffic);
  return `${weeksText(durationModel(nPerArm, t).weeks)} at ${formatNumber(t, 0)} ${noun} a day to reach ${countText(nPerArm, noun)} per group`;
}

/** The duration table: the traffic, the sample it must reach and the weeks. */
export function durationTable(nPerArm: number, traffic: number, noun: PlannerNoun = 'visitors'): TableData {
  const t = normalizeTraffic(traffic);
  return {
    columns: ['Input or result', 'Value'],
    rows: [
      [`${capital(noun)} per day, both groups together`, t],
      [`${capital(noun)} per group`, nPerArm],
      [`${capital(noun)} in all`, 2 * nPerArm],
      ['Weeks, rounded up', durationModel(nPerArm, t).weeks],
    ],
    formats: ['number', 'count'],
    refs: FULL_PLANNER_REFS,
  };
}
