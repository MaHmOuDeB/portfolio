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
import { formatValue } from '@/lib/facts/format';
import { formatNumber } from '@/lib/figure/format';
import { niceTicks, pct } from '@/lib/figure/scales';
import type { FigureRuntime } from '@/lib/figure/states';
import type { PublishedCount } from '@/lib/home/counts';
import type { Locale } from '@/lib/i18n/locale';
import type { LivePagePublic } from '@/lib/live-page/model';
import { KIT_TEXT_DE } from '../../../content/de/kit';
import { LIVE_EN } from '../../../content/live';
import { liveCopy } from './copy';
import { BUILD, Count, provenanceOf } from './Values';

/** How the line is computed: the caption's second sentence, which the page puts in its method row. */
export const DETECTABLE_METHOD = LIVE_EN.detectable.method;

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
  locale?: Locale;
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

/**
 * The x axis: it starts where the curve starts (or at the current point, if that lies left of it),
 * because the calculation has no value at 0 views. The start is always the first tick, so the axis
 * says where it begins, and a nice tick closer to it than half a step is left out.
 */
export function detectableX(points: readonly { n: number }[], currentN: number | null) {
  const lo = Math.min(...points.map((p) => p.n), currentN ?? Infinity);
  const x0 = Number.isFinite(lo) ? lo : 0;
  const xMax = niceTop(Math.max(1, x0 + 1, ...points.map((p) => p.n), currentN ?? 0));
  const domain: [number, number] = [x0, xMax];
  const withStart = (count: number) => {
    const nice = niceTicks(domain, count);
    const step = nice.length > 1 ? nice[1]! - nice[0]! : xMax - x0;
    return [x0, ...nice.filter((t) => t - x0 >= step / 2)];
  };
  return { domain, ticks: { narrow: withStart(TICKS.narrow), wide: withStart(TICKS.wide) } };
}

export function DetectableFigure({ data, refs, phase, smaller, hideCurrentSize, runtime, locale = 'en' }: Props) {
  const t = liveCopy(locale).detectable;
  const d = data.detectable;
  const placeholder = data.source === 'unavailable';
  const baseline = data.config.planningBaselines.primary;
  const points = d.points.map((p) => ({ n: p.nPerArm, effect: p.effect * 100 }));
  const atCurrent = !placeholder && d.atCurrent !== null ? d.atCurrent * 100 : null;
  const currentN = atCurrent !== null && !hideCurrentSize && typeof smaller === 'number' ? smaller : null;
  const both = [...refs.filter((r) => r !== 'build'), 'build'] as DerivedRef[];

  const x = detectableX(points, currentN);
  const yMax = niceTop(Math.max(1, ...points.map((p) => p.effect), currentN !== null && atCurrent !== null ? atCurrent : 0) * 1.05);
  const domain = { x: x.domain, y: [0, yMax] as [number, number] };
  const xTicks = x.ticks;
  const yTicks = { narrow: niceTicks(domain.y, TICKS.narrow), wide: niceTicks(domain.y, TICKS.wide) };
  const yDigits = Math.max(stepDigits(yTicks.narrow), stepDigits(yTicks.wide));

  const power = <Derived value={Math.round(d.power * 10)} unit="count" refs={BUILD} locale={locale} />;
  const ten = <Derived value={10} unit="count" refs={BUILD} locale={locale} />;
  const rate = (
    <data value={baseline} data-planning-rate="" {...derivedAttr(BUILD)}>
      {formatValue(baseline, 'share', { locale })}
    </data>
  );
  const caption = t.caption({ power, ten, rate, ab: phase === 'ab' });
  const atNow = atCurrent !== null ? <Derived value={atCurrent} unit="pp" decimals={1} refs={both} locale={locale} /> : null;
  const result = placeholder
    ? t.noData
    : atNow !== null && currentN !== null
      ? t.atNowCount({ count: <Count value={smaller} refs={refs} locale={locale} />, lift: atNow })
      : atNow !== null
        ? t.atNow(atNow)
        : d.atCurrentNote === 'no-views'
          ? t.noViews
          : d.atCurrentNote === 'small-cell'
            ? t.smallCell(<Derived value={5} unit="count" refs={BUILD} locale={locale} />)
            : t.beyond;

  return (
    <Figure
      id="live-detectable"
      title={t.title}
      state={runtime === undefined ? undefined : { runtime }}
      {...(locale === 'de' ? { text: KIT_TEXT_DE } : {})}
      caption={caption}
      provenance={provenanceOf(refs)}
      result={result}
      table={{
        columns: [...t.columns],
        rows: points.map((p) => [p.n, p.effect]),
        formats: ['count', { fixed: 1 }],
        note: t.note,
        refs: BUILD,
      }}
    >
      <div data-domain={JSON.stringify(domain)}>
        <ChartFrame
          id="live-detectable-chart"
          ariaLabel={t.aria(currentN !== null)}
          height={HEIGHT}
          x={{ domain: domain.x, ticks: xTicks, format: (v) => formatNumber(v, 0, { locale }), label: t.xLabel, refs: BUILD }}
          y={{ domain: domain.y, ticks: yTicks, format: (v) => formatNumber(v, yDigits, { locale }), label: t.yLabel, refs: BUILD }}
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
