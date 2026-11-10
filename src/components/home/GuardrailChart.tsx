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

export function guardrailTable(g: Interval | null, limit: number, refs: readonly DerivedRef[]): TableData {
  if (g === null) {
    return { columns: ['Quick exits, B − A', 'Points'], rows: [['Interval', 'Not shown'], ['Limit', limit]], formats: ['number', 'signedPoints'], rowDigits: [0, 0], refs: BUILD };
  }
  const d = intervalDigits(g.lower, g.upper);
  return {
    columns: ['Quick exits, B − A', 'Points'],
    rows: [['Lower end', g.lower], ['Upper end', g.upper], ['Limit', g.limit]],
    formats: ['number', 'signedPoints'],
    rowDigits: [d, d, 0],
    note: 'Points are percentage points of entry views.',
    refs,
  };
}

export function GuardrailChart({ model: m }: { model: HomeModel }) {
  const g = guardrailInterval(m);
  const limit = g?.limit ?? EXPERIMENT.guardrail.marginPp;
  const refs: readonly DerivedRef[] = g ? [...m.refs.filter((r) => r !== 'build'), 'build'] : BUILD;
  const domain = domainOf(g ? [0, limit, g.lower, g.upper] : [-limit, 0, limit]);
  const ticks = { narrow: niceTicks(domain, TICKS.narrow), wide: niceTicks(domain, TICKS.wide) };
  const digits = Math.max(stepDigits(ticks.narrow), stepDigits(ticks.wide));
  const limitText = `Limit ${formatSignedNumber(limit, 1)}`;
  const passes = g !== null && g.upper < g.limit;
  const title =
    g === null
      ? 'No quick-exit interval is shown, only its limit'
      : passes
        ? 'The quick-exit interval lies below the limit'
        : 'The quick-exit interval does not lie below the limit';
  const d = g ? intervalDigits(g.lower, g.upper) : 0;
  // The same digits as the table, so the sentence and the table agree.
  const result = g ? (
    <>
      Quick exits, B minus A:{' '}
      <span data-num="" {...derivedAttr(refs)}>
        {formatSignedPoints(g.lower, d)} to {formatSignedPoints(g.upper, d)}
      </span>{' '}
      points. The upper end is {passes ? '' : 'not '}below the limit.
    </>
  ) : undefined;
  const label =
    g === null
      ? 'The limit for quick exits, B minus A, with no interval drawn'
      : `The quick-exit interval, B minus A, against its limit: the upper end ${passes ? 'lies below' : 'does not lie below'} the limit`;
  return (
    <div data-guardrail={g === null ? 'empty' : 'interval'}>
      <Figure
        id="home-guardrail"
        titleLevel={4}
        title={title}
        caption="B minus A in percentage points of entry views. The dashed line is the pre-registered limit."
        provenance={m.refs.includes('simulated') ? 'simulated' : 'live'}
        table={guardrailTable(g, limit, refs)}
        result={result}
      >
        <ChartFrame
          id="home-guardrail-chart"
          ariaLabel={label}
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
                <line
                  data-limit-line=""
                  x1={0}
                  x2="100%"
                  y1={y}
                  y2={y}
                  stroke="var(--color-muted)"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
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
      </Figure>
    </div>
  );
}
