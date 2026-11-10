// The quick-exit guardrail of the live test: one interval of B − A (the share of entry views that
// leave within 5 seconds, in percentage points) against its pre-registered limit, drawn with the
// kit's ChartFrame. The kit has no such chart. Empty (the limit alone, labelled, from the build)
// until the A/B publishes a guardrail interval: never in the calibration, never while a group is
// under 50 views, and never when the split check or the calibration failed, whose results are
// withheld. The y-domain always holds both ends of the interval, zero and the limit. Server-safe.
import { scaleLinear } from 'd3-scale';
import { ChartFrame } from '@/components/kit/ChartFrame';
import type { TableData } from '@/components/kit/DataTable';
import { derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { EXPERIMENT } from '@/experiment.values';
import { intervalDigits, MAX_POINTS } from '@/lib/figure/cs-band';
import { formatSignedNumber, formatSignedPoints } from '@/lib/figure/format';
import { niceTicks } from '@/lib/figure/scales';
import type { HomeModel } from '@/lib/home/model';

const BUILD: readonly DerivedRef[] = ['build'];
const HEIGHT = { narrow: 160, wide: 200 } as const;
const TICKS = { narrow: 4, wide: 6 } as const;
const CAP = 6;
const STROKE = 3;
/** The limit's label sits this far above its line, in px. */
const LABEL_LIFT = 12;

type Interval = { lower: number; upper: number; limit: number };

const clamp = (v: number) => Math.min(MAX_POINTS, Math.max(-MAX_POINTS, v)) + 0;

/** The published interval, or null when none may be shown. */
export function guardrailInterval(m: HomeModel): Interval | null {
  const g = m.live.guardrail;
  if (!g || ![g.lower, g.upper, g.limit].every(Number.isFinite)) return null;
  if (m.calibration !== null || m.live.phase === 'srm-suppressed' || m.live.phase === 'aa-failed') return null;
  if (m.counts.a === '<5' || m.counts.b === '<5') return null;
  return { lower: clamp(Math.min(g.lower, g.upper)), upper: clamp(Math.max(g.lower, g.upper)), limit: clamp(g.limit) };
}

/** Zero, the limit and both ends, padded and widened to round values. */
function domainOf(values: readonly number[]): [number, number] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.15;
  const [a, b] = scaleLinear().domain([lo - pad, hi + pad]).nice(10).domain() as [number, number];
  return [a + 0, b + 0];
}

/** The decimals that print every multiple of the tick step exactly. */
function stepDigits(ticks: readonly number[]): number {
  if (ticks.length < 2) return 0;
  const step = ticks[1]! - ticks[0]!;
  let digits = 0;
  while (digits < 6 && Math.abs(step * 10 ** digits - Math.round(step * 10 ** digits)) > 1e-6) digits += 1;
  return digits;
}

/** Where the interval lies against the limit: the verdict the title, sentence and label give. */
type Place = 'below' | 'reaches' | 'above';
const placeOf = (g: Interval): Place => (g.upper < g.limit ? 'below' : g.lower >= g.limit ? 'above' : 'reaches');

const MAX_DIGITS = 6;
/** A bound as printed, read back as a number. */
const printed = (v: number, digits: number) => Number(formatSignedPoints(v, digits).replace('−', '-').replace('+', ''));

/**
 * The interval as it is printed: the decimals of intervalDigits, or more until the printed ends say
 * what the unrounded ones do about the limit (an upper end of 9.96 prints "+9.96", never "+10.0",
 * beside "below the limit"). Should six decimals still not do, the end is printed just on its side.
 */
export function printedInterval(g: Interval): { lower: number; upper: number; digits: number } {
  const agrees = (lower: number, upper: number) => placeOf({ lower, upper, limit: g.limit }) === placeOf(g);
  for (let d = intervalDigits(g.lower, g.upper); d <= MAX_DIGITS; d += 1) {
    if (agrees(printed(g.lower, d), printed(g.upper, d))) return { lower: g.lower, upper: g.upper, digits: d };
  }
  const step = 10 ** -MAX_DIGITS;
  const side = (v: number) => (v < g.limit ? Math.min(v, g.limit - step) : v);
  return { lower: side(g.lower), upper: side(g.upper), digits: MAX_DIGITS };
}

export function guardrailTable(g: Interval, refs: readonly DerivedRef[]): TableData {
  const p = printedInterval(g);
  return {
    columns: ['Quick exits, B − A', 'Points'],
    rows: [['Lower end', p.lower], ['Upper end', p.upper], ['Limit', g.limit]],
    formats: ['number', 'signedPoints'],
    rowDigits: [p.digits, p.digits, 0],
    note: 'Points are percentage points of entry views.',
    refs,
  };
}

const TITLE: Record<Place, string> = {
  below: 'The quick-exit interval lies below the limit',
  reaches: 'The quick-exit interval still reaches the limit',
  above: 'The quick-exit interval lies above the limit',
};
const VERDICT: Record<Place, string> = {
  below: 'The upper end is below the limit.',
  reaches: 'The interval still reaches the limit.',
  above: 'The whole interval lies above the limit.',
};
const LABEL: Record<Place, string> = {
  below: 'the interval lies below the limit',
  reaches: 'the interval still reaches the limit',
  above: 'the interval lies above the limit',
};

/**
 * The guardrail Figure. With an interval it is a chart Figure (badge from the data's origin, result
 * sentence, table); without one it shows only the pre-registered limit, a rule drawn from the build,
 * so it is a diagram Figure: no badge and no table, as no data is shown.
 */
export function GuardrailChart({ model: m, id = 'home-guardrail' }: { model: HomeModel; id?: string }) {
  const g = guardrailInterval(m);
  const limit = g?.limit ?? EXPERIMENT.guardrail.marginPp;
  const refs: readonly DerivedRef[] = g ? [...m.refs.filter((r) => r !== 'build'), 'build'] : BUILD;
  const domain = domainOf(g ? [0, limit, g.lower, g.upper] : [-limit, 0, limit]);
  const ticks = { narrow: niceTicks(domain, TICKS.narrow), wide: niceTicks(domain, TICKS.wide) };
  const digits = Math.max(stepDigits(ticks.narrow), stepDigits(ticks.wide));
  const limitText = `Limit ${formatSignedNumber(limit, 1)}`;
  const place = g ? placeOf(g) : null;
  const chart = (
    <ChartFrame
      id={`${id}-chart`}
      ariaLabel={
        place === null
          ? 'The limit for quick exits, B minus A, with no interval drawn'
          : `The quick-exit interval, B minus A, against its limit: ${LABEL[place]}`
      }
      height={HEIGHT}
      // One interval, no x scale: the axis only names what is drawn.
      x={{ domain: [0, 1], ticks: { narrow: [], wide: [] }, format: (v) => formatSignedNumber(v, 0), label: 'Quick exits', refs: BUILD }}
      y={{
        domain,
        ticks,
        format: (v) => formatSignedNumber(v, digits),
        label: 'B − A (percentage points)',
        refs,
        zeroLabel: 'no difference',
        aboveLabel: 'B higher',
        belowLabel: 'B lower',
      }}
      marks={() => null}
      overlays={(ctx) => {
        const y = ctx.yPx(limit);
        return (
          <>
            <line data-limit-line="" x1={0} x2="100%" y1={y} y2={y} stroke="var(--color-muted)" strokeWidth={1} strokeDasharray="4 4" />
            {g ? (
              <svg data-guardrail-interval="" x="50%" y={0} width={1} height={ctx.height} overflow="visible">
                <line data-bar="" x1={0} x2={0} y1={ctx.yPx(g.upper)} y2={ctx.yPx(g.lower)} stroke="var(--color-series-1)" strokeWidth={STROKE} />
                {[g.lower, g.upper].map((v, i) => (
                  <line key={i} x1={-CAP} x2={CAP} y1={ctx.yPx(v)} y2={ctx.yPx(v)} stroke="var(--color-series-1)" strokeWidth={2} />
                ))}
              </svg>
            ) : null}
          </>
        );
      }}
      // Above the dashed line, never on it: the domain's padding leaves room for it.
      annotation={(ctx) => ({
        x: 0.02,
        y: limit + ((domain[1] - domain[0]) * LABEL_LIFT) / ctx.height,
        text: limitText,
        anchor: 'start',
        refs: BUILD,
      })}
    />
  );
  const caption = 'B minus A in percentage points of entry views. The dashed line is the pre-registered limit.';
  if (g === null || place === null) {
    return (
      <div data-guardrail="empty">
        <Figure kind="diagram" id={id} titleLevel={4} title="No quick-exit interval is shown, only its limit" caption={caption}>
          {chart}
        </Figure>
      </div>
    );
  }
  const p = printedInterval(g);
  return (
    <div data-guardrail="interval">
      <Figure
        id={id}
        titleLevel={4}
        title={TITLE[place]}
        caption={caption}
        provenance={m.refs.includes('live') ? 'live' : 'simulated'}
        table={guardrailTable(g, refs)}
        result={
          <>
            Quick exits, B minus A:{' '}
            <span data-num="" {...derivedAttr(refs)}>
              {formatSignedPoints(p.lower, p.digits)} to {formatSignedPoints(p.upper, p.digits)}
            </span>{' '}
            points. {VERDICT[place]}
          </>
        }
      >
        {chart}
      </Figure>
    </div>
  );
}
