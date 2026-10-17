// The confidence-sequence chart of the live experiment, as data: what is shown, its band, its
// domains and ticks, its table, and the Figure state a snapshot puts the Figure in. Pure and
// server-safe; ConfidenceChart, NowRow and LiveStateBody draw from it. Every difference is B − A in
// percentage points.
//
// Live data can be anything a broken store sends, so nothing here trusts it:
// - a count that is not a finite, non-negative number reads as 0 (low data, "0 of 50", no division);
// - a point whose views or estimate is not a number, or whose bound is NaN, is dropped; a bound
//   beyond ±100 points (a difference of two percentages cannot be wider; ±Infinity included) is
//   drawn at ±100; inverted bounds are swapped;
// - points below 50 views per group are never shown (the estimate is blinded until then);
// - the band is the running intersection, so its width never grows back;
// - the y-domain always holds every drawn bound and estimate, the projection and 0, and the tick
//   digits come from the tick step, so ChartFrame can never refuse a label.
import { scaleLinear } from 'd3-scale';
import type { TableData } from '@/components/kit/DataTable';
import type { DerivedRef } from '@/components/kit/Derived';
import { formatNumber, formatSignedNumber, formatSignedPoints } from './format';
import { niceTicks, type Layout } from './scales';
import {
  dataAmount,
  MIN_PER_GROUP,
  resolveFigureBody,
  type FigureBody,
  type FigureRuntime,
  type FigureState,
  type Freshness,
  type LivePhase,
} from './states';

/**
 * One look at the experiment. `n` is the views in the smaller group; the rest are B − A in
 * PERCENTAGE POINTS (not proportions: convert a mixtureCs interval with csPointFromInterval).
 */
export type CsPoint = { n: number; lower: number; upper: number; estimate: number };

export type LiveSnapshot = {
  phase: LivePhase;
  freshness: Freshness;
  nA: number;
  nB: number;
  series: CsPoint[];
  /** Views per group the six-month cap allows: the x-axis ends here. */
  capPerArm: number;
  /** The half-width the interval is projected to have at the cap. */
  projectedHalfWidthAtCap: number;
  /** ISO date-time with an offset, like every timestamp below. */
  plannedEnd: string;
  abStartedOn?: string;
  /** The views per group when this visitor's view was counted. */
  yourViewN?: number;
  /** "Leaving within 5 seconds": the interval of B − A against its limit, in points. */
  guardrail?: { lower: number; upper: number; limit: number };
  aaFailed?: { on: string; reason: string; restartsOn: string };
  /** The effect size the final interval rules out; default: the larger end of the interval. */
  ruledOutAbove?: number;
  nextStep?: string;
};

/** A difference of two percentages lies within ±100 points; a wider bound is drawn at the edge. */
export const MAX_POINTS = 100;
/** The smallest y span, so all-equal data still has an axis (±1 point around it). */
const MIN_SPAN = 2;
const PADDING = 0.1;
const NICE_COUNT = 10;
const Y_TICKS: Record<Layout, number> = { narrow: 4, wide: 6 };
const X_TICKS: Record<Layout, number> = { narrow: 3, wide: 6 };
/** Decimals beyond this are never needed: the y span is at least MIN_SPAN, the x span at least 1. */
const MAX_DIGITS = 6;
/** Room past the last look when it sits at the end of the x-axis, as a share of the axis. */
const END_ROOM = 0.02;

const clampPoints = (v: number) => Math.min(MAX_POINTS, Math.max(-MAX_POINTS, v)) + 0;

/** A count as shown: anything that is not a finite, non-negative number is 0. */
export function safeCount(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Views in the smaller group. */
export function smallerGroup(s: Pick<LiveSnapshot, 'nA' | 'nB'>): number {
  return Math.min(safeCount(s.nA), safeCount(s.nB));
}

/**
 * Sorted by views; `lower` is the running maximum and `upper` the running minimum, so the band's
 * width never grows. Points with a NaN field are dropped and inverted bounds swapped. When the
 * bounds would cross (an empty intersection), the band collapses to the point nearest the crossing
 * inside the band before it, so it still never widens or moves outward. The estimate is kept as
 * given: it can lie outside the band.
 */
export function runningIntersection(points: readonly CsPoint[]): CsPoint[] {
  const valid = points
    .filter((p) => ![p.n, p.lower, p.upper, p.estimate].some(Number.isNaN))
    .map((p) => ({ n: p.n, lower: Math.min(p.lower, p.upper), upper: Math.max(p.lower, p.upper), estimate: p.estimate }))
    .sort((a, b) => a.n - b.n);
  const out: CsPoint[] = [];
  for (const p of valid) {
    const prev = out[out.length - 1];
    if (prev === undefined) {
      out.push(p);
      continue;
    }
    let lower = Math.max(prev.lower, p.lower);
    let upper = Math.min(prev.upper, p.upper);
    if (lower > upper) {
      const at = Math.min(prev.upper, Math.max(prev.lower, lower / 2 + upper / 2));
      lower = at;
      upper = at;
    }
    out.push({ n: p.n, lower, upper, estimate: p.estimate });
  }
  return out;
}

/** The points that may be drawn: valid, clamped to ±100, at 50 views per group or more, intersected. */
export function shownSeries(s: Pick<LiveSnapshot, 'series'>): CsPoint[] {
  const points = s.series
    .filter((p) => Number.isFinite(p.n) && p.n >= MIN_PER_GROUP && Number.isFinite(p.estimate))
    .filter((p) => !Number.isNaN(p.lower) && !Number.isNaN(p.upper))
    .map((p) => ({ n: p.n, lower: clampPoints(p.lower), upper: clampPoints(p.upper), estimate: clampPoints(p.estimate) }));
  return runningIntersection(points);
}

const validHalfWidth = (h: number) => (Number.isFinite(h) && h > 0 ? h : 0);

/**
 * The y-domain of the chart: it holds every bound and estimate (clamped to ±100 points), the last
 * estimate ± the projected half-width, and 0; padded by 10% of its span on each side and widened to
 * round values. Never zero-width; NaN values are ignored.
 */
export function confidenceYDomain(points: readonly CsPoint[], projectedHalfWidth: number): [number, number] {
  const values = [0];
  for (const p of points) {
    for (const v of [p.lower, p.upper, p.estimate]) if (!Number.isNaN(v)) values.push(clampPoints(v));
  }
  const last = points
    .filter((p) => !Number.isNaN(p.n) && !Number.isNaN(p.estimate))
    .reduce<CsPoint | undefined>((a, p) => (a === undefined || p.n >= a.n ? p : a), undefined);
  const h = validHalfWidth(projectedHalfWidth);
  if (last && h > 0) {
    const at = clampPoints(last.estimate);
    values.push(clampPoints(at - h), clampPoints(at + h));
  }
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < MIN_SPAN) {
    const mid = (lo + hi) / 2;
    lo = Math.min(lo, mid - MIN_SPAN / 2);
    hi = Math.max(hi, mid + MIN_SPAN / 2);
  }
  const pad = (hi - lo) * PADDING;
  const [a, b] = scaleLinear().domain([lo - pad, hi + pad]).nice(NICE_COUNT).domain() as [number, number];
  return [a + 0, b + 0];
}

/** The Figure state a snapshot puts a live Figure in. Low data unless a point at 50 or more may show. */
export function liveFigureState(s: LiveSnapshot, runtime?: FigureRuntime): FigureState {
  const enough = dataAmount(safeCount(s.nA), safeCount(s.nB)) === 'enough-data' && shownSeries(s).length > 0;
  const live = { phase: s.phase, data: enough ? 'enough-data' : 'low-data', freshness: s.freshness } as const;
  return runtime === undefined ? { live } : { runtime, live };
}

/** The body the data itself calls for, without the runtime or a pause: what a paused Figure keeps. */
export function contentBody(s: LiveSnapshot): FigureBody {
  const { live } = liveFigureState(s);
  return resolveFigureBody({ live: { ...live!, freshness: { kind: 'fresh' } } });
}

/**
 * `v` rounded up at `digits` decimals: a ruled-out size rounded down would claim more than the
 * interval does. The product is snapped to nine decimals first, so a float artefact
 * (0.07 × 100 = 7.000000000000001) does not round 0.07 up to 0.08.
 */
export function ceilAt(v: number, digits: number): number {
  const k = 10 ** digits;
  return Math.ceil(Number((v * k).toFixed(9))) / k;
}

/** Decimals an interval may grow to before a bound below the display floor prints "0". */
const MAX_INTERVAL_DIGITS = 3;

/**
 * Decimals for an interval: one when it is narrower than ten points, none when wider; then more,
 * up to three, until every bound that is not exactly zero shows a non-zero digit. So "+0.3 to
 * +26.3", never "0 to +26", and "−0.04 to +0.03", never "0 to 0". Only a bound under 0.0005
 * points can still print "0" (see formatIntervalPoints for sentences that claim its sign).
 */
export function intervalDigits(lower: number, upper: number): number {
  let digits = Math.abs(upper - lower) < 10 ? 1 : 0;
  const shows = (v: number) => v === 0 || formatSignedPoints(v, digits) !== '0';
  while (digits < MAX_INTERVAL_DIGITS && !(shows(lower) && shows(upper))) digits += 1;
  return digits;
}

/**
 * "−12 to +31", with intervalDigits' decimals. `awayFromZero` is for sentences that claim a bound's
 * sign ("the lower end is above zero"): a bound below the display floor then prints as the smallest
 * shown unit on its own side ("+0.001"), never as "0".
 */
export function formatIntervalPoints(lower: number, upper: number, o: { awayFromZero?: boolean } = {}): string {
  const digits = intervalDigits(lower, upper);
  const one = (v: number) => {
    const text = formatSignedPoints(v, digits);
    if (text !== '0' || v === 0 || !o.awayFromZero) return text;
    return `${v < 0 ? '−' : '+'}${(10 ** -digits).toFixed(digits)}`;
  };
  return `${one(lower)} to ${one(upper)}`;
}

/**
 * The CsPoint the chart consumes, from a confidence-sequence interval of `mixtureCs`
 * (src/lib/stats), which is in PROPORTIONS: estimate = xB/nB − xA/nA and an unclamped half-width.
 * The point is in PERCENTAGE POINTS (×100), each value clamped to ±100 points (a tiny sample's
 * half-width can be far wider than a difference of proportions can be). `n` is the views in the
 * smaller group at that look.
 */
export function csPointFromInterval(n: number, interval: { estimate: number; lower: number; upper: number }): CsPoint {
  return {
    n,
    estimate: clampPoints(interval.estimate * 100),
    lower: clampPoints(interval.lower * 100),
    upper: clampPoints(interval.upper * 100),
  };
}

const NOT_SHOWN_YET = 'Not shown yet';
const NOT_SHOWN = 'Not shown';

/** The table fallback: the running interval at each look, or the count and no interval while hidden. */
export function confidenceTable(s: LiveSnapshot, refs: readonly DerivedRef[] = ['live']): TableData {
  const columns = ['Views per group', 'Lower (points)', 'Estimate (points)', 'Upper (points)'];
  const formats: TableData['formats'] = ['count', 'signedPoints', 'signedPoints', 'signedPoints'];
  const hidden = s.phase === 'srm-suppressed' ? NOT_SHOWN : liveFigureState(s).live?.data === 'low-data' ? NOT_SHOWN_YET : null;
  const rows = hidden
    ? [[smallerGroup(s), hidden, hidden, hidden]]
    : shownSeries(s).map((p) => [p.n, p.lower, p.estimate, p.upper]);
  return { columns, rows, formats, refs };
}

/** The decimals that print every multiple of the tick step exactly. */
function stepDigits(ticks: readonly number[]): number {
  if (ticks.length < 2) return 0;
  const step = ticks[1]! - ticks[0]!;
  let digits = 0;
  while (digits < MAX_DIGITS && Math.abs(step * 10 ** digits - Math.round(step * 10 ** digits)) > 1e-6) digits += 1;
  return digits;
}

export type AxisModel = {
  domain: [number, number];
  ticks: Record<Layout, number[]>;
  format: (v: number) => string;
};

export type Projection = { fromN: number; toN: number; fromLower: number; fromUpper: number; toLower: number; toUpper: number };

export type ConfidenceModel = {
  series: CsPoint[];
  /** The last shown point: the current interval and estimate. */
  current: CsPoint;
  x: AxisModel;
  y: AxisModel;
  /** From the last point to the cap, narrowing to estimate ± the projected half-width, inside the band. */
  projection?: Projection;
  yourViewN?: number;
  includesZero: boolean;
};

function axis(domain: [number, number], counts: Record<Layout, number>, signed: boolean): AxisModel {
  const ticks = { narrow: niceTicks(domain, counts.narrow), wide: niceTicks(domain, counts.wide) };
  const digits = Math.max(stepDigits(ticks.narrow), stepDigits(ticks.wide));
  return { domain, ticks, format: signed ? (v) => formatSignedNumber(v, digits) : (v) => formatNumber(v, digits) };
}

/** What ConfidenceChart draws, or null when nothing may be drawn (low data). */
export function confidenceModel(s: LiveSnapshot): ConfidenceModel | null {
  if (liveFigureState(s).live?.data !== 'enough-data') return null;
  const series = shownSeries(s);
  const current = series[series.length - 1];
  if (current === undefined) return null;
  const cap = Number.isFinite(s.capPerArm) && s.capPerArm > 0 ? s.capPerArm : 0;
  // The axis ends at the cap, or at the last look past it; a look at the very end gets a sliver
  // of room, so its dot is not cut in half by the frame edge.
  const end = Math.max(cap, current.n);
  const roomy = end * (1 + END_ROOM);
  const xMax = current.n >= end * (1 - END_ROOM) && Number.isFinite(roomy) ? roomy : end;
  const h = validHalfWidth(s.projectedHalfWidthAtCap);
  let projection: Projection | undefined;
  if (cap > current.n) {
    const at = Math.min(current.upper, Math.max(current.lower, current.estimate));
    projection = {
      fromN: current.n,
      toN: cap,
      fromLower: current.lower,
      fromUpper: current.upper,
      toLower: Math.max(current.lower, at - h),
      toUpper: Math.min(current.upper, at + h),
    };
  }
  const yDomain = confidenceYDomain(series, h);
  const view = s.yourViewN;
  return {
    series,
    current,
    x: axis([0, xMax], X_TICKS, false),
    y: axis(yDomain, Y_TICKS, true),
    projection,
    yourViewN: view !== undefined && Number.isFinite(view) && view >= 0 && view <= xMax ? view : undefined,
    includesZero: current.lower <= 0 && current.upper >= 0,
  };
}
