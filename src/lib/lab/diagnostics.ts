// The Lab's two diagnostics, the statistics side: the split check (srmTest) and exaggeration
// (retrodesign), both from @/lib/stats and used unchanged, with the words, tables and axes their
// Figures draw. Pure: the server draws the presets with it and the lazy islands redraw with it. Each
// model takes the statistics function as an optional dependency, so a test can count its calls or
// hand it an extreme result. The client-safe values are in ./diagnostics-values.ts, re-exported here.
import type { TableData } from '@/components/kit/DataTable';
import { formatValue } from '@/lib/facts/format';
import { formatNumber } from '@/lib/figure/format';
import { fill } from '@/lib/i18n/template';
import { INTL, type Locale } from '@/lib/i18n/locale';
import { sentenceText } from '@/lib/retention/sentence';
import { retrodesign, srmTest, type RetrodesignInput, type RetrodesignResult } from '@/lib/stats';
import {
  CURSE_ALPHA,
  CURSE_SCHEMA,
  DIAGNOSTICS_REFS,
  SRM_SHARE,
  SRM_SMALL_EXPECTED,
  SRM_THRESHOLD,
  normalizeCurse,
  type CurseValues,
  type SrmValues,
} from './diagnostics-values';
import { EN_CURSE, type CurseText } from './text-curse';
import { EN_SRM, type SrmText } from './text-srm';

export * from './diagnostics-values';

// ---------------------------------------------------------------------------------------------
// The split check.

export type SrmResult = { kind: 'empty' } | { kind: 'result'; chi2: number; p: number; flagged: boolean };
export type SrmDeps = { srmTest: typeof srmTest };

/**
 * The chi-square split check on the counts against the planned share of half. With no visitors at
 * all there is nothing to test (srmTest rejects an empty total), so the model says so without
 * calling it; one empty group is a real result. The flag is srmTest's own (p below SRM_THRESHOLD).
 */
export function srmModel({ nA, nB }: SrmValues, deps: SrmDeps = { srmTest }): SrmResult {
  if (nA + nB === 0) return { kind: 'empty' };
  const { chi2, p, flagged } = deps.srmTest(nA, nB, SRM_SHARE);
  return { kind: 'result', chi2, p, flagged };
}

/** The visitors each group should have at the planned share, as srmTest computes them. */
export function srmExpected({ nA, nB }: SrmValues): { a: number; b: number } {
  const total = nA + nB;
  return { a: total * SRM_SHARE, b: total * (1 - SRM_SHARE) };
}

/** Whether an expected count is under the rule of thumb for the chi-square approximation. */
export function srmSmallExpected(v: SrmValues): boolean {
  const e = srmExpected(v);
  return v.nA + v.nB > 0 && Math.min(e.a, e.b) < SRM_SMALL_EXPECTED;
}

/** "20", "0", "0.0123": the statistic with the chart formatter's digits. */
export const chi2Text = (chi2: number, locale: Locale = 'en') => formatNumber(chi2, undefined, { locale });

/**
 * "below 0.001" for a flagged split, so a p-value just under the threshold never prints as the
 * threshold itself; otherwise three significant digits ("0.123", "1"), which cannot round below it.
 */
export function pValueText(r: { p: number; flagged: boolean }, text: SrmText = EN_SRM): string {
  const locale = text.kit.locale;
  return r.flagged ? fill(text.below, { value: formatNumber(SRM_THRESHOLD, undefined, { locale }) }) : formatNumber(r.p, undefined, { locale });
}

/** The threshold as odds, "1 time in 1,000": the number of tests per false alarm. */
export const SRM_ODDS = Math.round(1 / SRM_THRESHOLD);

export const SRM_EMPTY = EN_SRM.empty;
export const SRM_SMALL_NOTE = EN_SRM.smallNote;

/**
 * The verdict's sentence after the word, in plain words: the p-value as how often a fair coin leaves
 * a gap this big or bigger. The two sides are exact complements.
 */
export function srmVerdictText(flagged: boolean, text: SrmText = EN_SRM): string {
  const odds = sentenceText(text.odds, { one: '1', n: formatNumber(SRM_ODDS, 0, { locale: text.kit.locale }) });
  return sentenceText(flagged ? text.verdict.flagged : text.verdict.ok, { odds });
}

/** The result line as plain text: the announcement, and what the view prints. */
export function srmResultText(v: SrmValues, deps?: SrmDeps, text: SrmText = EN_SRM): string {
  const r = srmModel(v, deps);
  if (r.kind === 'empty') return text.empty;
  const parts = [`${r.flagged ? text.status.flagged : text.status.ok}: ${srmVerdictText(r.flagged, text)}`];
  if (srmSmallExpected(v)) parts.push(text.smallNote);
  return parts.join(' ');
}

/** The statistic for the method row: "chi-square 11.56, one degree of freedom, p-value below 0.001". */
export function srmStatText(r: { chi2: number; p: number; flagged: boolean }, text: SrmText = EN_SRM): string {
  return fill(text.statText, { chi2: chi2Text(r.chi2, text.kit.locale), p: pValueText(r, text) });
}

/** The table fallback: observed and expected visitors per group, and the planned share. */
export function srmTable(v: SrmValues, text: SrmText = EN_SRM): TableData {
  const e = srmExpected(v);
  return {
    columns: [...text.table.columns],
    rows: [
      [text.table.groupA, v.nA, SRM_SHARE, e.a],
      [text.table.groupB, v.nB, 1 - SRM_SHARE, e.b],
    ],
    formats: ['number', 'count', 'share', 'number'],
    note: text.table.note,
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

export type CurseResult = { kind: 'result'; power: number; ratio: number; typeS: number; exaggeration: number } | { kind: 'unbounded' };
export type CurseDeps = { retrodesign: (o: RetrodesignInput) => RetrodesignResult };

const STATS_RETRO: CurseDeps = { retrodesign };
const finite = (r: RetrodesignResult) => Number.isFinite(r.power) && Number.isFinite(r.typeS) && Number.isFinite(r.exaggeration);

/** The bisection's upper end: at a ratio of 10 the test clears the bar essentially always. */
const RATIO_HI = 10;
/** Bisection stops when the bracket is narrower than this (power then agrees to about 1e-14). */
const RATIO_TOLERANCE = 1e-14;
const inverse = new Map<number, number>();

/**
 * The ratio of true effect to standard error at which a two-sided test at CURSE_ALPHA clears the bar
 * with the given power: the inverse of retrodesign's power, found by bisection. Power is
 * Phi(r - z) + Phi(-r - z), which rises strictly from alpha as r grows above zero, so there is one
 * ratio per power. The power is normalized first (clamped to the slider's range and put on its grid,
 * NaN gives the preset), so it never throws. Always the statistics' own retrodesign.
 */
export function ratioForPower(power: number): number {
  const target = normalizeCurse({ power }).power;
  const known = inverse.get(target);
  if (known !== undefined) return known;
  const powerAt = (ratio: number) => retrodesign({ trueEffect: ratio, se: 1, alpha: CURSE_ALPHA }).power;
  let lo = 0;
  let hi = RATIO_HI;
  while (hi - lo > RATIO_TOLERANCE) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (powerAt(mid) < target) lo = mid;
    else hi = mid;
  }
  const ratio = (lo + hi) / 2;
  inverse.set(target, ratio);
  return ratio;
}

/**
 * The ratio for the power set, and at that ratio the wrong-sign rate among results that clear the
 * bar and the exaggeration among them, from retrodesign at the fixed significance level. Any
 * non-finite result is the unbounded branch, before anything is formatted or serialized.
 */
export function curseModel(v: CurseValues, deps: CurseDeps = STATS_RETRO): CurseResult {
  const ratio = ratioForPower(normalizeCurse(v).power);
  const r = deps.retrodesign({ trueEffect: ratio, se: 1, alpha: CURSE_ALPHA });
  if (!finite(r)) return { kind: 'unbounded' };
  return { kind: 'result', power: r.power, ratio, typeS: r.typeS, exaggeration: r.exaggeration };
}

export type CurvePoint = { power: number; ratio: number; exaggeration: number };

/** Every power the slider reaches, from its lowest to its highest step. */
export function cursePowers(): number[] {
  const { min, max, step } = CURSE_SCHEMA.power;
  return Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => normalizeCurse({ power: min + i * step }).power);
}

/**
 * The exaggeration at every power the slider reaches, on linear axes. A sample with a non-finite
 * result is dropped. `selected` is the setting's own datum, or null for an unbounded result.
 */
export function curseCurve(v: CurseValues, deps: CurseDeps = STATS_RETRO): { points: CurvePoint[]; selected: CurvePoint | null } {
  const current = normalizeCurse(v).power;
  const points: CurvePoint[] = [];
  for (const power of cursePowers()) {
    const ratio = ratioForPower(power);
    const r = deps.retrodesign({ trueEffect: ratio, se: 1, alpha: CURSE_ALPHA });
    if (finite(r)) points.push({ power, ratio, exaggeration: r.exaggeration });
  }
  return { points, selected: points.find((p) => p.power === current) ?? null };
}

/** The plot heights of the exaggeration chart, in px. */
export const CURSE_HEIGHT = { narrow: 220, wide: 280 } as const;
/** The current dot's radius and its bg ring, in px. */
export const DOT_RADIUS = 4;
export const DOT_RING = 2;
/** The room kept between the top of the plot and the highest value: the dot, its ring and a gap. */
export const DOT_CLEARANCE_PX = DOT_RADIUS + DOT_RING + 2;

/**
 * A value's height on the exaggeration axis: the exaggeration minus one, never below zero, so the
 * frame's zero line is one times the real effect (no exaggeration).
 */
export const curseY = (exaggeration: number): number => Math.max(1, exaggeration) - 1;

/** The y tick text: a tick printed back as its plain multiple ("1", "2", "4"). */
export const exaggerationTick = (v: number, locale: Locale = 'en'): string => formatNumber(v + 1, 0, { locale });

/**
 * The linear exaggeration axis: from one times the real effect (the zero line) to the first whole
 * multiple above every sampled value and the selected one at which the highest value sits at least
 * DOT_CLEARANCE_PX below the top in the shorter layout. `domain` and `ticks` are in curseY's units;
 * `top` is the plain multiple. Every whole multiple is a tick wide; narrow keeps the top and every
 * other one below it.
 */
export function curseAxis(
  points: readonly CurvePoint[],
  selected: CurvePoint | null,
): { top: number; domain: [number, number]; ticks: { wide: number[]; narrow: number[] } } {
  const values = [...points.map((p) => p.exaggeration), ...(selected ? [selected.exaggeration] : [])];
  const max = curseY(Math.max(1, ...values.filter((v) => Number.isFinite(v))));
  const shorter = Math.min(CURSE_HEIGHT.narrow, CURSE_HEIGHT.wide);
  let top = 2;
  while (top - 1 <= max || ((top - 1 - max) / (top - 1)) * shorter < DOT_CLEARANCE_PX) top++;
  const wide = Array.from({ length: top - 1 }, (_, i) => i + 1);
  const narrow = wide.filter((_, i) => (wide.length - 1 - i) % 2 === 0);
  return { top, domain: [0, top - 1], ticks: { wide, narrow } };
}

/** The x-axis ticks: powers of 10%, 30%, 50%, 70% and 90% wide, three of them narrow. */
export const CURSE_X_TICKS = { wide: [0.1, 0.3, 0.5, 0.7, 0.9], narrow: [0.1, 0.5, 0.9] };
/** A power tick as a whole percent ("10%"). */
export const powerTick = (power: number, text: CurseText = EN_CURSE) =>
  fill(text.percent, { value: formatNumber(power * 100, 0, { locale: text.kit.locale }) });

/** Below this wrong-sign rate the readout says "below 0.1%" rather than a rounded zero. */
const WRONG_SIGN_FLOOR = 0.001;

/** Power as a whole percent; a value that would round to 100% is "over 99%", never a certainty. */
export function formatPower(power: number, text: CurseText = EN_CURSE): string {
  const locale = text.kit.locale;
  return Math.round(power * 100) >= 100
    ? fill(text.over, { value: formatValue(0.99, 'share', { decimals: 0, locale }) })
    : formatValue(power, 'share', { decimals: 0, locale });
}

/** The wrong-sign rate with one decimal, or "below 0.1%" (a true zero underflows the same way). */
export function formatWrongSign(typeS: number, text: CurseText = EN_CURSE): string {
  const locale = text.kit.locale;
  return typeS < WRONG_SIGN_FLOOR
    ? fill(text.below, { value: formatValue(WRONG_SIGN_FLOOR, 'share', { decimals: 1, locale }) })
    : formatValue(typeS, 'share', { decimals: 1, locale });
}

const oneDecimal: Record<Locale, Intl.NumberFormat> = {
  en: new Intl.NumberFormat(INTL.en, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  de: new Intl.NumberFormat(INTL.de, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
};
/** The exaggeration factor with one decimal: "2.5", "1.0". It is at least 1. */
export const formatExaggeration = (e: number, locale: Locale = 'en') => oneDecimal[locale].format(e);

export const CURSE_UNBOUNDED = EN_CURSE.unbounded;

/** The result line as plain text: the announcement, and what the view prints. */
export function curseResultText(v: CurseValues, deps?: CurseDeps, text: CurseText = EN_CURSE): string {
  const r = curseModel(v, deps);
  if (r.kind === 'unbounded') return text.unbounded;
  return sentenceText(text.result, {
    x: formatExaggeration(r.exaggeration, text.kit.locale),
    wrong: formatWrongSign(r.typeS, text),
  });
}

/** The reference powers the table always lists, from one end of the slider to the other. */
const TABLE_POWERS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99];

/**
 * The table fallback: the reference powers and the current one (marked), each with the ratio it
 * implies and the readout's own words for the wrong-sign rate and exaggeration, so a row and the
 * readout always agree. A non-finite result is written in words.
 */
export function curseTable(v: CurseValues, deps: CurseDeps = STATS_RETRO, text: CurseText = EN_CURSE): TableData {
  const current = normalizeCurse(v).power;
  const t = text.table;
  const locale = text.kit.locale;
  const powers = [...new Set([...TABLE_POWERS, current])].sort((a, b) => a - b);
  return {
    columns: [...t.columns],
    rows: powers.map((power) => {
      const ratio = ratioForPower(power);
      const r = deps.retrodesign({ trueEffect: ratio, se: 1, alpha: CURSE_ALPHA });
      const mine = power === current ? t.yes : '';
      return finite(r)
        ? [power, ratio, formatWrongSign(r.typeS, text), formatExaggeration(r.exaggeration, locale), mine]
        : [power, ratio, t.noValue, t.noValue, mine];
    }),
    formats: ['share', { fixed: 2 }, 'number', 'number', 'number'],
    note: t.note,
    refs: DIAGNOSTICS_REFS,
  };
}
