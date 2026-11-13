// The Lab's two diagnostics, the statistics side: the split check (srmTest) and exaggeration
// (retrodesign), both from @/lib/stats and used unchanged, with the words, tables and axes their
// Figures draw. Pure: the server draws the presets with it and the lazy islands redraw with it. Each
// model takes the statistics function as an optional dependency, so a test can count its calls or
// hand it an extreme result. The client-safe values are in ./diagnostics-values.ts, re-exported here.
import type { TableData } from '@/components/kit/DataTable';
import { formatValue } from '@/lib/facts/format';
import { formatNumber } from '@/lib/figure/format';
import { retrodesign, srmTest, type RetrodesignInput, type RetrodesignResult } from '@/lib/stats';
import {
  CURSE_ALPHA,
  CURVE_SAMPLES,
  DIAGNOSTICS_REFS,
  RATIO_MAX,
  RATIO_MIN,
  SRM_SMALL_EXPECTED,
  SRM_THRESHOLD,
  unitsText,
  type CurseValues,
  type SrmValues,
} from './diagnostics-values';

export * from './diagnostics-values';

// ---------------------------------------------------------------------------------------------
// The split check.

export type SrmResult = { kind: 'empty' } | { kind: 'result'; chi2: number; p: number; flagged: boolean };
export type SrmDeps = { srmTest: typeof srmTest };

/**
 * The chi-square split check on the counts and the expected share of group A. With no visitors at
 * all there is nothing to test (srmTest rejects an empty total), so the model says so without
 * calling it; one empty group is a real result. The flag is srmTest's own (p below SRM_THRESHOLD).
 */
export function srmModel({ nA, nB, shareA }: SrmValues, deps: SrmDeps = { srmTest }): SrmResult {
  if (nA + nB === 0) return { kind: 'empty' };
  const { chi2, p, flagged } = deps.srmTest(nA, nB, shareA);
  return { kind: 'result', chi2, p, flagged };
}

/** The visitors each group should have at the expected share, as srmTest computes them. */
export function srmExpected({ nA, nB, shareA }: SrmValues): { a: number; b: number } {
  const total = nA + nB;
  return { a: total * shareA, b: total * (1 - shareA) };
}

/** Whether an expected count is under the rule of thumb for the chi-square approximation. */
export function srmSmallExpected(v: SrmValues): boolean {
  const e = srmExpected(v);
  return v.nA + v.nB > 0 && Math.min(e.a, e.b) < SRM_SMALL_EXPECTED;
}

/** "20", "0", "0.0123": the statistic with the chart formatter's digits. */
export const chi2Text = (chi2: number) => formatNumber(chi2);

/**
 * "below 0.001" for a flagged split, so a p-value just under the threshold never prints as the
 * threshold itself; otherwise three significant digits ("0.123", "1"), which cannot round below it.
 */
export function pValueText(r: { p: number; flagged: boolean }): string {
  return r.flagged ? `below ${formatNumber(SRM_THRESHOLD)}` : formatNumber(r.p);
}

export const SRM_EMPTY = 'No visitors in either group yet, so there is nothing to test and no p-value.';
export const SRM_FLAGGED_NOTE =
  'A split this far from the expected share would be unlikely if visitors were assigned as planned, so check the assignment and the logging before reading any result.';
export const SRM_CLEAR_NOTE = 'This split is consistent with the expected share at this threshold.';
export const smallExpectedNote = () =>
  `An expected count is below ${formatNumber(SRM_SMALL_EXPECTED)}, so the chi-square approximation is rough here.`;

/** The result line as plain text: the announcement, and what the view prints. */
export function srmResultText(v: SrmValues, deps?: SrmDeps): string {
  const r = srmModel(v, deps);
  if (r.kind === 'empty') return SRM_EMPTY;
  const parts = [
    `Chi-square ${chi2Text(r.chi2)} with one degree of freedom, p-value ${pValueText(r)}: ${r.flagged ? 'flagged' : 'not flagged'}.`,
    r.flagged ? SRM_FLAGGED_NOTE : SRM_CLEAR_NOTE,
  ];
  if (srmSmallExpected(v)) parts.push(smallExpectedNote());
  return parts.join(' ');
}

/** The table fallback: observed and expected visitors per group, and the expected share. */
export function srmTable(v: SrmValues): TableData {
  const e = srmExpected(v);
  return {
    columns: ['Group', 'Visitors', 'Expected share', 'Expected visitors'],
    rows: [
      ['Group A', v.nA, v.shareA, e.a],
      ['Group B', v.nB, 1 - v.shareA, e.b],
    ],
    formats: ['number', 'count', 'share', 'number'],
    note: 'Hypothetical counts you set. The expected visitors are the total times the expected share.',
    refs: DIAGNOSTICS_REFS,
  };
}

/** The smallest top of the count axis, so an empty or tiny split still has a readable scale. */
const SRM_MIN_TOP = 10;

/** The nice tops: 1, 2, 2.5 and 5 times a power of ten. */
function niceCeil(v: number): number {
  const power = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * power >= v) return m * power;
  return 10 * power;
}

/**
 * The count axis: from zero to a nice value at or above the tallest bar (observed or expected), with
 * four steps; only whole-number ticks are kept, since visitors are counted. The narrow layout keeps
 * every other tick and always the top one, so a phone never shows a lone "0" (a top of 25 has only
 * 0 and 25 as whole ticks).
 */
export function srmAxis(v: SrmValues): { top: number; ticks: { wide: number[]; narrow: number[] } } {
  const e = srmExpected(v);
  const top = niceCeil(Math.max(SRM_MIN_TOP, v.nA, v.nB, e.a, e.b));
  const step = top / 4;
  const wide = [0, 1, 2, 3, 4].map((i) => i * step).filter(Number.isInteger);
  return { top, ticks: { wide, narrow: wide.filter((t, i) => i % 2 === 0 || t === top) } };
}

// ---------------------------------------------------------------------------------------------
// Exaggeration.

export type CurseResult =
  | { kind: 'zero-effect' }
  | { kind: 'result'; power: number; typeS: number; exaggeration: number }
  | { kind: 'unbounded' };
export type CurseDeps = { retrodesign: (o: RetrodesignInput) => RetrodesignResult };

const STATS_RETRO: CurseDeps = { retrodesign };
const finite = (r: RetrodesignResult) => Number.isFinite(r.power) && Number.isFinite(r.typeS) && Number.isFinite(r.exaggeration);

/**
 * Power, the wrong-sign rate among significant estimates and the exaggeration among them, from
 * retrodesign at the fixed significance level. A zero true effect is its own branch, without a call
 * (retrodesign rejects it: exaggeration is a ratio to the true effect). Any non-finite result is the
 * unbounded branch, before anything is formatted or serialized.
 */
export function curseModel({ trueEffect, se }: CurseValues, deps: CurseDeps = STATS_RETRO): CurseResult {
  if (trueEffect === 0) return { kind: 'zero-effect' };
  const r = deps.retrodesign({ trueEffect, se, alpha: CURSE_ALPHA });
  if (!finite(r)) return { kind: 'unbounded' };
  return { kind: 'result', power: r.power, typeS: r.typeS, exaggeration: r.exaggeration };
}

/** The ratio of the true effect to its standard error: 0 for no effect, never undefined. */
export const curseRatio = (v: CurseValues) => v.trueEffect / v.se;

export type CurvePoint = { ratio: number; x: number; exaggeration: number };

/** The curve's ratios: both ends exactly and CURVE_SAMPLES log-spaced ratios strictly between. */
function curveRatios(): number[] {
  const lo = Math.log10(RATIO_MIN);
  const hi = Math.log10(RATIO_MAX);
  const inner = Array.from({ length: CURVE_SAMPLES }, (_, i) => 10 ** (lo + ((hi - lo) * (i + 1)) / (CURVE_SAMPLES + 1)));
  return [RATIO_MIN, ...inner, RATIO_MAX];
}

/**
 * The analytic exaggeration across the reachable ratios, retrodesign at each ratio over a standard
 * error of 1 (the same as the setting itself: retrodesign works on the ratio), plus the exact current
 * ratio when it is positive. Sorted and unique; x is log10 of the ratio. A sample with a non-finite
 * result is dropped. `selected` is the current ratio's own datum, or null for a zero effect (which
 * is never put through the logarithm) or an unbounded result.
 */
export function curseCurve(v: CurseValues, deps: CurseDeps = STATS_RETRO): { points: CurvePoint[]; selected: CurvePoint | null } {
  const current = curseRatio(v);
  const ratios = curveRatios();
  if (current > 0 && !ratios.includes(current)) ratios.push(current);
  ratios.sort((a, b) => a - b);
  const points: CurvePoint[] = [];
  for (const ratio of ratios) {
    const r = deps.retrodesign({ trueEffect: ratio, se: 1, alpha: CURSE_ALPHA });
    if (finite(r)) points.push({ ratio, x: Math.log10(ratio), exaggeration: r.exaggeration });
  }
  const selected = current > 0 ? (points.find((p) => p.ratio === current) ?? null) : null;
  return { points, selected };
}

/** The plot heights of the exaggeration chart, in px. */
export const CURSE_HEIGHT = { narrow: 220, wide: 280 } as const;
/** The current dot's radius and its bg ring, in px. */
export const DOT_RADIUS = 4;
export const DOT_RING = 2;
/** The room kept between the top of the plot and the highest value: the dot, its ring and a gap. */
export const DOT_CLEARANCE_PX = DOT_RADIUS + DOT_RING + 2;
/** The log axis's tick values, in plain multiples: 1, 2 and 5 in each decade. */
const CURSE_MULTIPLES = [1, 2, 5] as const;

/** A value's height on the exaggeration axis: log10 of the exaggeration, never below 1 (no exaggeration). */
export const curseY = (exaggeration: number): number => Math.log10(Math.max(1, exaggeration));

/** The y tick text: a log10 tick printed back as its plain multiple ("1", "2", "50"). */
export const exaggerationTick = (v: number): string => formatNumber(Math.round(10 ** v), 0);

/**
 * The exaggeration axis, on a log scale so a small exaggeration (the preset's about 2.5 times) sits
 * clear of the floor while the curve's largest values still fit. The floor is 1 times the true effect
 * (log10 0, the zero line: no exaggeration). The top is the first value of 2, 5, 10, 20, 50, ... above
 * every sampled value and the selected one at which the highest value sits at least DOT_CLEARANCE_PX
 * below the top in the shorter layout. `domain` and `ticks` are in log10; `top` is the plain multiple.
 * Ticks at 1, 2 and 5 in each decade wide, and at the powers of ten narrow (with the highest wide tick
 * when the axis spans less than a decade).
 */
export function curseAxis(
  points: readonly CurvePoint[],
  selected: CurvePoint | null,
): { top: number; domain: [number, number]; ticks: { wide: number[]; narrow: number[] } } {
  const values = [...points.map((p) => p.exaggeration), ...(selected ? [selected.exaggeration] : [])];
  const max = Math.max(1, ...values.filter((v) => Number.isFinite(v)));
  const shorter = Math.min(CURSE_HEIGHT.narrow, CURSE_HEIGHT.wide);
  const room = (top: number) => ((Math.log10(top) - curseY(max)) / Math.log10(top)) * shorter;
  const candidates = (decade: number) => CURSE_MULTIPLES.map((m) => m * 10 ** decade);
  let top = 2;
  for (let decade = 0; ; decade++) {
    const found = candidates(decade).find((t) => t > 1 && t > max && room(t) >= DOT_CLEARANCE_PX);
    if (found !== undefined) {
      top = found;
      break;
    }
  }
  const plain: number[] = [];
  for (let decade = 0; 10 ** decade <= top; decade++) for (const t of candidates(decade)) if (t <= top) plain.push(t);
  const wide = plain.map((t) => Math.log10(t));
  const tens = plain.filter((t) => Number.isInteger(Math.log10(t)));
  const narrow = (tens.length >= 2 ? tens : [1, plain.at(-1)!]).map((t) => Math.log10(t));
  return { top, domain: [0, Math.log10(top)], ticks: { wide, narrow } };
}

/** The x-axis ticks: ratios of 0.1, 1 and 10, as their log10. */
export const CURSE_X_TICKS = [-1, 0, 1];
/** A log10 tick printed back as its plain ratio ("0.1", "1", "10"). */
export const ratioTick = (x: number) => formatNumber(Number((10 ** x).toPrecision(12)));

/** Below this wrong-sign rate the readout says "below 0.1%" rather than a rounded zero. */
const WRONG_SIGN_FLOOR = 0.001;

/** Power as a whole percent; a value that would round to 100% is "over 99%", never a certainty. */
export function formatPower(power: number): string {
  const s = formatValue(power, 'share', { decimals: 0 });
  return s === '100%' ? `over ${formatValue(0.99, 'share', { decimals: 0 })}` : s;
}

/** The wrong-sign rate with one decimal, or "below 0.1%" (a true zero underflows the same way). */
export function formatWrongSign(typeS: number): string {
  return typeS < WRONG_SIGN_FLOOR ? `below ${formatValue(WRONG_SIGN_FLOOR, 'share', { decimals: 1 })}` : formatValue(typeS, 'share', { decimals: 1 });
}

const oneDecimal = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** The exaggeration factor with one decimal: "2.5", "1.0". It is at least 1. */
export const formatExaggeration = (e: number) => oneDecimal.format(e);

export const CURSE_ZERO =
  'Exaggeration is undefined when the true effect is zero. The ratio of true effect to standard error is then zero, not undefined, but zero has no place on the logarithmic x-axis, so the chart marks no setting.';
export const CURSE_UNBOUNDED = 'Exaggeration is unbounded at this setting: the calculation gives no finite value, so no number is shown.';

/** The result line as plain text: the announcement, and what the view prints. */
export function curseResultText(v: CurseValues, deps?: CurseDeps): string {
  const r = curseModel(v, deps);
  if (r.kind === 'zero-effect') return CURSE_ZERO;
  if (r.kind === 'unbounded') return CURSE_UNBOUNDED;
  return `At a true effect of ${unitsText(v.trueEffect)} and a standard error of ${unitsText(v.se)}, a ratio of ${formatNumber(curseRatio(v))}, power is ${formatPower(r.power)}. Of the estimates that pass the threshold, ${formatWrongSign(r.typeS)} have the wrong sign, and on average their size is ${formatExaggeration(r.exaggeration)} times the true effect.`;
}

/** The reference ratios the table always lists, from one end of the range to the other. */
const TABLE_RATIOS = [RATIO_MIN, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, RATIO_MAX];
const NO_VALUE = 'no finite value';

/**
 * The table fallback: the reference ratios and the current one (marked), each with the readout's own
 * words for power, the wrong-sign rate and exaggeration, so a row and the readout always agree. A
 * zero effect has no row (it is not on the curve); a non-finite result is written in words.
 */
export function curseTable(v: CurseValues, deps: CurseDeps = STATS_RETRO): TableData {
  const current = curseRatio(v);
  // The current ratio is used exactly. A reference ratio it equals up to float noise (0.6 / 0.3 is
  // not exactly 2) gives way to it, so no two rows print the same ratio.
  const near = (r: number) => Math.abs(r - current) <= 1e-9 * current;
  const ratios = current > 0 ? [...TABLE_RATIOS.filter((r) => !near(r)), current].sort((a, b) => a - b) : TABLE_RATIOS;
  return {
    columns: [
      'True effect ÷ standard error',
      'Power',
      'Wrong sign among significant estimates',
      'Exaggeration among significant estimates',
      'Your setting',
    ],
    rows: ratios.map((ratio) => {
      const r = deps.retrodesign({ trueEffect: ratio, se: 1, alpha: CURSE_ALPHA });
      const mine = ratio === current ? 'Yes' : '';
      return finite(r)
        ? [ratio, formatPower(r.power), formatWrongSign(r.typeS), formatExaggeration(r.exaggeration), mine]
        : [ratio, NO_VALUE, NO_VALUE, NO_VALUE, mine];
    }),
    note: 'An analytic calculation at a two-sided significance level, on a true effect and a standard error in the same arbitrary units. A zero true effect has no row: its exaggeration is undefined.',
    refs: DIAGNOSTICS_REFS,
  };
}
