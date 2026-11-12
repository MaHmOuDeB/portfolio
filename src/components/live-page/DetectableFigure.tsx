// What this many views can detect: the smallest lift (in percentage points) that a given number of
// views per group would detect 8 times in 10 at the planning click rate, for one look at that size
// under the confidence sequence's boundary. The curve comes from the published data (computed from
// the committed configuration, so its refs are `build`); the current size is marked only when the
// published data gives a value for it and the smaller group is printed as a count. The baseline is
// the committed planning rate, never a reading from the store. Server-safe.
import { scaleLinear } from 'd3-scale';
import { ChartFrame, MARK_UNITS } from '@/components/kit/ChartFrame';
import { Derived, derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { PublishedCountText } from '@/components/home/PublishedCountText';
import { formatValue } from '@/lib/facts/format';
import { formatNumber } from '@/lib/figure/format';
import { niceTicks, pct } from '@/lib/figure/scales';
import type { FigureRuntime } from '@/lib/figure/states';
import type { PublishedCount } from '@/lib/home/counts';
import type { LivePagePublic } from '@/lib/live-page/model';
import { BUILD, provenanceOf } from './Values';

const HEIGHT = { narrow: 180, wide: 240 } as const;
const TICKS = { narrow: 4, wide: 6 } as const;

type Props = {
  data: LivePagePublic;
  refs: readonly DerivedRef[];
  phase: 'calibration' | 'ab';
  /** The smaller group's published views, for the current point. */
  smaller: PublishedCount;
  /** The current point's views are not the published smaller group's (a suppressed split). */
  hideCurrentSize: boolean;
  runtime?: FigureRuntime;
};

/** The decimals that print every multiple of the tick step exactly. */
function stepDigits(ticks: readonly number[]): number {
  if (ticks.length < 2) return 0;
  const step = ticks[1]! - ticks[0]!;
  let digits = 0;
  while (digits < 6 && Math.abs(step * 10 ** digits - Math.round(step * 10 ** digits)) > 1e-6) digits += 1;
  return digits;
}

const niceTop = (v: number) => (scaleLinear().domain([0, v]).nice(10).domain() as [number, number])[1] + 0;

export function DetectableFigure({ data, refs, phase, smaller, hideCurrentSize, runtime }: Props) {
  const d = data.detectable;
  const placeholder = data.source === 'unavailable';
  const baseline = data.config.planningBaselines.primary;
  const points = d.points.map((p) => ({ n: p.nPerArm, effect: p.effect * 100 }));
  const atCurrent = !placeholder && d.atCurrent !== null ? d.atCurrent * 100 : null;
  const currentN = atCurrent !== null && !hideCurrentSize && typeof smaller === 'number' ? smaller : null;
  const both = [...refs.filter((r) => r !== 'build'), 'build'] as DerivedRef[];

  const xMax = niceTop(Math.max(1, ...points.map((p) => p.n), currentN ?? 0));
  const yMax = niceTop(Math.max(1, ...points.map((p) => p.effect), currentN !== null && atCurrent !== null ? atCurrent : 0) * 1.05);
  const domain = { x: [0, xMax] as [number, number], y: [0, yMax] as [number, number] };
  const xTicks = { narrow: niceTicks(domain.x, TICKS.narrow), wide: niceTicks(domain.x, TICKS.wide) };
  const yTicks = { narrow: niceTicks(domain.y, TICKS.narrow), wide: niceTicks(domain.y, TICKS.wide) };
  const yDigits = Math.max(stepDigits(yTicks.narrow), stepDigits(yTicks.wide));

  const power = <Derived value={Math.round(d.power * 10)} unit="count" refs={BUILD} />;
  const ten = <Derived value={10} unit="count" refs={BUILD} />;
  const rate = (
    <data value={baseline} data-planning-rate="" {...derivedAttr(BUILD)}>
      {formatValue(baseline, 'share')}
    </data>
  );
  const caption = (
    <>
      The smallest lift this many views per group would detect {power} times in {ten}, assuming{' '}
      {phase === 'ab' ? <>the planning click rate from the calibration, {rate}</> : <>the planning click rate of {rate}</>}, at one look.
      It is computed for one look at n under the confidence sequence’s boundary, not the power of the sequential stopping rule.
    </>
  );
  const atNow = atCurrent !== null ? <Derived value={atCurrent} unit="pp" decimals={1} refs={both} /> : null;
  const result = placeholder ? (
    'No data is shown, so there is no point for the current size.'
  ) : atNow !== null && currentN !== null ? (
    <>
      At the current size, <PublishedCountText value={smaller} refs={refs} /> views in the smaller group, the smallest
      detectable lift is about {atNow} percentage points.
    </>
  ) : atNow !== null ? (
    <>At the current size the smallest detectable lift is about {atNow} percentage points.</>
  ) : d.atCurrentNote === 'no-views' ? (
    'No views are counted yet, so there is no point for the current size.'
  ) : d.atCurrentNote === 'small-cell' ? (
    <>
      While a group has fewer than <Derived value={5} unit="count" refs={BUILD} /> views, the point for the current size is not
      shown.
    </>
  ) : (
    'At the current size the detectable lift is beyond the range this calculation covers, so no point is shown.'
  );

  return (
    <Figure
      id="live-detectable"
      title="More views per group, smaller detectable lifts"
      state={runtime === undefined ? undefined : { runtime }}
      caption={caption}
      provenance={provenanceOf(refs)}
      result={result}
      table={{
        columns: ['Views per group', 'Smallest detectable lift (points)'],
        rows: points.map((p) => [p.n, p.effect]),
        formats: ['count', { fixed: 1 }],
        note: 'Percentage points, for one look at that size.',
        refs: BUILD,
      }}
    >
      <div data-domain={JSON.stringify(domain)}>
        <ChartFrame
          id="live-detectable-chart"
          ariaLabel={`The smallest detectable lift falls as views per group grow${currentN !== null ? ', with the current size marked' : ''}`}
          height={HEIGHT}
          x={{ domain: domain.x, ticks: xTicks, format: (v) => formatNumber(v, 0), label: 'Views per group', refs: BUILD }}
          y={{ domain: domain.y, ticks: yTicks, format: (v) => formatNumber(v, yDigits), label: 'Smallest detectable lift (percentage points)', refs: BUILD }}
          marks={(ctx) => (
            <path
              data-mark=""
              d={points.map((p, i) => `${i === 0 ? 'M' : 'L'}${ctx.xFrac(p.n) * MARK_UNITS} ${ctx.yPx(p.effect)}`).join('')}
              fill="none"
              stroke="var(--color-series-1)"
              strokeWidth={2}
            />
          )}
          overlays={(ctx) =>
            currentN !== null && atCurrent !== null ? (
              <circle
                data-detectable-current=""
                cx={pct(ctx.xFrac(currentN))}
                cy={ctx.yPx(atCurrent)}
                r={4}
                fill="var(--color-series-2)"
                stroke="var(--color-bg)"
                strokeWidth={4}
                paintOrder="stroke"
              />
            ) : null
          }
        />
      </div>
    </Figure>
  );
}
