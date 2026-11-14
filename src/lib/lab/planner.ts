// The statistics side of the Lab planner's base model: the visitors needed per group, the result line
// and the table fallback. It imports the statistics, so only the full planner's island and the server
// draw with it; the values and text helpers the page loads at once live in planner-values.ts.
import type { TableData } from '@/components/kit/DataTable';
import { formatNumber } from '@/lib/figure/format';
import { sampleSizePerArm } from '@/lib/stats';
import { PLANNER_ALPHA, PLANNER_POWER, PLANNER_REFS, normalizePlanner, percentText, targetRate, type PlannerValues } from './planner-values';

export * from './planner-values';

/** Visitors per group (two-sided, alpha 0.05, power 0.8, Cohen's h) and the target rate. */
export function planModel(v: PlannerValues): { nPerArm: number; target: number } {
  const n = normalizePlanner(v);
  return {
    nPerArm: sampleSizePerArm({
      baseline: n.baseline,
      mde: n.risePoints / 100,
      mdeType: 'absolute',
      alpha: PLANNER_ALPHA,
      power: PLANNER_POWER,
    }),
    target: targetRate(n.baseline, n.risePoints),
  };
}

/** The result line and the announcement. */
export function resultSentence(v: PlannerValues): string {
  const n = normalizePlanner(v);
  const plan = planModel(n);
  return `${formatNumber(plan.nPerArm, 0)} visitors per group to detect a rise from ${percentText(n.baseline)} to ${percentText(plan.target)}`;
}

/** The table fallback: the inputs and the result, readable without JavaScript. */
export function plannerTable(v: PlannerValues): TableData {
  const n = normalizePlanner(v);
  const plan = planModel(n);
  return {
    columns: ['Input or result', 'Value'],
    rows: [
      ['Baseline conversion (%)', Math.round(n.baseline * 100)],
      ['Rise to detect (percentage points)', n.risePoints],
      ['Target conversion (%)', Math.round(plan.target * 100)],
      ['Visitors per group', plan.nPerArm],
    ],
    formats: ['number', 'count'],
    refs: PLANNER_REFS,
  };
}
