// The full sample-size planner's statistics side: the visitors per group (the base planner's model),
// the weeks the paired duration Figure needs, the result sentences and the table fallbacks. It
// imports the statistics, so only the server and the lazy island draw with it; the values the page
// loads at once live in full-planner-values.ts.
import type { TableData } from '@/components/kit/DataTable';
import { formatNumber } from '@/lib/figure/format';
import { fill } from '@/lib/i18n/template';
import { durationWeeks } from '@/lib/stats';
import {
  FULL_PLANNER_REFS,
  countText,
  normalizeFullPlan,
  normalizeLabPlan,
  normalizeTraffic,
  percentText,
  relativePercent,
  riseText,
  weeksText,
  type FullPlanValues,
  type LabPlanValues,
  type PlannerNoun,
} from './full-planner-values';
import { PLANNER_POWER, planModel } from './planner';
import { EN_PLANNER, type PlannerText } from './text-planner';

export * from './full-planner-values';

/**
 * Visitors per group (Cohen's h, two-sided, alpha 0.05, power 0.8: the base planner's planModel on
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

/** The sizing announcement: "1,353 visitors per group to detect a rise of 5 points, from 29% to 34%". */
export function fullPlanSentence(v: FullPlanValues, noun: PlannerNoun = 'visitors', text: PlannerText = EN_PLANNER): string {
  const n = normalizeFullPlan(v);
  const plan = fullPlanModel(n);
  return fill(text.announce.sizing, {
    n: formatNumber(plan.nPerArm, 0, { locale: text.kit.locale }),
    noun: text.nouns[noun].other,
    rise: riseText(n, text),
    from: percentText(n.baseline, text),
    to: percentText(plan.target, text),
  });
}

/**
 * The sizing announcement with the weeks it implies at the duration Figure's current traffic, since
 * a committed sizing change moves the duration readout too: "...from 29% to 34%; both groups fill in
 * 4 weeks at 100 visitors a day".
 */
export function pairedSentence(v: FullPlanValues, traffic: number, noun: PlannerNoun = 'visitors', text: PlannerText = EN_PLANNER): string {
  const t = normalizeTraffic(traffic);
  const { weeks } = durationModel(fullPlanModel(v).nPerArm, t);
  return fill(text.announce.paired, {
    sentence: fullPlanSentence(v, noun, text),
    weeks: weeksText(weeks, text),
    n: formatNumber(t, 0, { locale: text.kit.locale }),
    noun: text.nouns[noun].other,
  });
}

/** The sizing table: the inputs in both units and the result. The unit shown does not change it. */
export function fullPlanTable(v: FullPlanValues, noun: PlannerNoun = 'visitors', text: PlannerText = EN_PLANNER): TableData {
  const n = normalizeFullPlan(v);
  const plan = fullPlanModel(n);
  const t = text.tables;
  return {
    columns: [...t.columns],
    rows: [
      [t.sizing.baseline, Math.round(n.baseline * 100)],
      [t.sizing.rise, n.risePoints],
      [t.sizing.riseRelative, relativePercent(n.baseline, n.risePoints)],
      [t.sizing.target, Math.round(plan.target * 100)],
      [fill(text.perGroup, { noun: text.nouns[noun].capital }), plan.nPerArm],
    ],
    formats: ['number', 'points'],
    rowDigits: [0, 0, 1, 0, 0],
    refs: FULL_PLANNER_REFS,
  };
}

/** The duration announcement: "4 weeks at 100 visitors a day to reach 1,353 visitors per group". */
export function durationSentence(nPerArm: number, traffic: number, noun: PlannerNoun = 'visitors', text: PlannerText = EN_PLANNER): string {
  const t = normalizeTraffic(traffic);
  return fill(text.announce.duration, {
    weeks: weeksText(durationModel(nPerArm, t).weeks, text),
    n: formatNumber(t, 0, { locale: text.kit.locale }),
    noun: text.nouns[noun].other,
    count: countText(nPerArm, noun, text),
  });
}

/** The duration table: the traffic, the sample it must reach and the weeks. */
export function durationTable(nPerArm: number, traffic: number, noun: PlannerNoun = 'visitors', text: PlannerText = EN_PLANNER): TableData {
  const t = normalizeTraffic(traffic);
  const cap = text.nouns[noun].capital;
  const d = text.tables.duration;
  return {
    columns: [...text.tables.columns],
    rows: [
      [fill(d.perDay, { noun: cap }), t],
      [fill(text.perGroup, { noun: cap }), nPerArm],
      [fill(d.inAll, { noun: cap }), 2 * nPerArm],
      [d.weeks, durationModel(nPerArm, t).weeks],
    ],
    formats: ['number', 'count'],
    refs: FULL_PLANNER_REFS,
  };
}

// ---------------------------------------------------------------------------------------------
// The Lab's merged planner: the same model, one Figure, the words a non-specialist reads.

/** Power in plain words: "8 tests out of 10". */
export const PLANNER_POWER_TESTS = { hits: Math.round(PLANNER_POWER * 10), of: 10 } as const;

/** Visitors per group, the target and the whole weeks the test needs at the traffic set. */
export function labPlanModel(v: LabPlanValues): { nPerArm: number; target: number; weeks: number } {
  const n = normalizeLabPlan(v);
  const { nPerArm, target } = planModel({ baseline: n.baseline, risePoints: n.risePoints });
  return { nPerArm, target, weeks: durationModel(nPerArm, n.traffic).weeks };
}

/**
 * The result line's words: "To catch a real rise from 29% to 34% in 8 tests out of 10, you need:",
 * then the two readouts. The false-winner risk the size assumes is in the method row's terms, and the
 * traffic is on its own control, so the line holds one idea.
 */
export function labPlanLead(v: LabPlanValues, text: PlannerText = EN_PLANNER): string {
  const n = normalizeLabPlan(v);
  const { target } = labPlanModel(n);
  return fill(text.announce.labLead, {
    from: percentText(n.baseline, text),
    to: percentText(target, text),
    hits: String(PLANNER_POWER_TESTS.hits),
    of: String(PLANNER_POWER_TESTS.of),
  });
}

/** The announcement: the result line and both readouts, as the Figure shows them. */
export function labPlanSentence(v: LabPlanValues, text: PlannerText = EN_PLANNER): string {
  const { nPerArm, weeks } = labPlanModel(v);
  return fill(text.announce.lab, {
    lead: labPlanLead(v, text),
    count: countText(nPerArm, 'visitors', text),
    weeks: weeksText(weeks, text),
  });
}

/** The table fallback: the inputs, the rise in both units, and both results. */
export function labPlanTable(v: LabPlanValues, text: PlannerText = EN_PLANNER): TableData {
  const n = normalizeLabPlan(v);
  const { nPerArm, target, weeks } = labPlanModel(n);
  const t = text.tables.lab;
  return {
    columns: [...text.tables.columns],
    rows: [
      [t.baseline, Math.round(n.baseline * 100)],
      [t.rise, n.risePoints],
      [t.riseRelative, relativePercent(n.baseline, n.risePoints)],
      [t.target, Math.round(target * 100)],
      [t.traffic, n.traffic],
      [t.perGroup, nPerArm],
      [t.inAll, 2 * nPerArm],
      [t.weeks, weeks],
    ],
    formats: ['number', 'points'],
    rowDigits: [0, 0, 1, 0, 0, 0, 0, 0],
    refs: FULL_PLANNER_REFS,
  };
}
