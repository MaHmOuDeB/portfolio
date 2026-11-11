// The "Chart frame" section of the kitchen sink. All data is fictional: a made-up difference between
// two groups that settles as views grow, plus the degenerate cases a live chart can hit (one look
// so far, a value that never moves) and an axis whose outer ticks sit close to the plot's ends.
// Every number is marked 'simulated'.
import { area, line } from 'd3-shape';
import { ChartFrame, MARK_UNITS, type AxisSpec, type ChartFrameProps, type PlotContext } from '@/components/kit/ChartFrame';
import { formatNumber, formatSignedPoints } from '@/lib/figure/format';
import { niceTicks, pct } from '@/lib/figure/scales';
import { Specimen } from './Specimen';

const REFS = ['simulated'] as const;

type Point = { n: number; lower: number; estimate: number; upper: number };

// A fictional interval, wide at first and narrowing with the square root of the views.
const SERIES: Point[] = Array.from({ length: 37 }, (_, i) => {
  const n = 20 + i * 5;
  const estimate = 3 + 8 * Math.exp(-n / 60) * Math.cos(n / 18);
  const half = 24 * Math.sqrt(40 / n);
  return { n, lower: estimate - half, estimate, upper: estimate + half };
});
const LAST = SERIES[SERIES.length - 1]!;

const viewsAxis = (domain: [number, number]): AxisSpec => ({
  domain,
  ticks: { narrow: niceTicks(domain, 3), wide: niceTicks(domain, 5) },
  format: (v) => formatNumber(v, 0),
  label: 'Views per group',
  refs: REFS,
});

const differenceAxis = (domain: [number, number]): ChartFrameProps['y'] => ({
  domain,
  ticks: { narrow: niceTicks(domain, 4), wide: niceTicks(domain, 9) },
  format: (v) => formatSignedPoints(v, 0),
  label: 'B − A (percentage points)',
  refs: REFS,
  zeroLabel: 'no difference',
  aboveLabel: 'B higher',
  belowLabel: 'B lower',
});

// The current estimate: a series-2 dot with a 2 px bg ring (a 4 px stroke painted under the fill).
function EstimateDot({ ctx, n, estimate }: { ctx: PlotContext; n: number; estimate: number }) {
  return (
    <circle
      data-mark=""
      cx={pct(ctx.xFrac(n))}
      cy={ctx.yPx(estimate)}
      r={4}
      fill="var(--color-series-2)"
      stroke="var(--color-bg)"
      strokeWidth={4}
      paintOrder="stroke"
      vectorEffect="non-scaling-stroke"
    />
  );
}

function bandMarks(ctx: PlotContext) {
  const x = (p: Point) => ctx.xFrac(p.n) * MARK_UNITS;
  const band = area<Point>().x(x).y0((p) => ctx.yPx(p.lower)).y1((p) => ctx.yPx(p.upper));
  const bound = (key: 'lower' | 'upper') => line<Point>().x(x).y((p) => ctx.yPx(p[key]));
  const estimate = line<Point>().x(x).y((p) => ctx.yPx(p.estimate));
  return (
    <>
      <path data-mark="" d={band(SERIES) ?? ''} fill="var(--color-series-ghost)" stroke="none" />
      <path data-mark="" d={bound('lower')(SERIES) ?? ''} fill="none" stroke="var(--color-series-1)" strokeWidth={1} />
      <path data-mark="" d={bound('upper')(SERIES) ?? ''} fill="none" stroke="var(--color-series-1)" strokeWidth={1} />
      <path data-mark="" d={estimate(SERIES) ?? ''} fill="none" stroke="var(--color-muted)" strokeWidth={1} />
    </>
  );
}

const SETTLING: ChartFrameProps = {
  id: 'sink-chart',
  ariaLabel: 'In this fictional run the interval narrows as views grow and still includes zero',
  x: viewsAxis([0, 250]),
  y: differenceAxis([-40, 50]),
  height: { narrow: 200, wide: 280 },
  marks: bandMarks,
  overlays: (ctx) => <EstimateDot ctx={ctx} n={LAST.n} estimate={LAST.estimate} />,
  // The top right is empty: the band is narrow there and sits well below the top of the domain.
  annotation: (ctx) => ({
    x: 250,
    y: 44,
    text: ctx.layout === 'narrow' ? 'The interval narrows' : 'The interval narrows as views grow',
    anchor: 'end',
  }),
};

// One look so far: the x domain has no width, so everything sits in the middle.
const ONE_LOOK: ChartFrameProps = {
  id: 'sink-chart-one-look',
  ariaLabel: 'A fictional first look: one interval that includes zero',
  x: viewsAxis([40, 40]),
  y: differenceAxis([-30, 40]),
  height: { narrow: 160, wide: 200 },
  marks: (ctx) => (
    <line
      data-mark=""
      x1={ctx.xFrac(40) * MARK_UNITS}
      x2={ctx.xFrac(40) * MARK_UNITS}
      y1={ctx.yPx(-22)}
      y2={ctx.yPx(31)}
      stroke="var(--color-series-1)"
      strokeWidth={1}
    />
  ),
  overlays: (ctx) => <EstimateDot ctx={ctx} n={40} estimate={4} />,
};

// A value that never moves: the y domain has no width, so the line runs through the middle.
const FLAT: ChartFrameProps = {
  id: 'sink-chart-flat',
  ariaLabel: 'A fictional rate that stays the same at every look',
  x: viewsAxis([0, 100]),
  y: {
    domain: [12, 12],
    ticks: { narrow: niceTicks([12, 12], 4), wide: niceTicks([12, 12], 9) },
    format: (v) => formatNumber(v, 0),
    label: 'Rate (%)',
    refs: REFS,
  },
  height: { narrow: 160, wide: 200 },
  marks: (ctx) => (
    <path
      data-mark=""
      d={`M0 ${ctx.yPx(12)} H${MARK_UNITS}`}
      fill="none"
      stroke="var(--color-series-1)"
      strokeWidth={1}
    />
  ),
};

// Outer x ticks inside the domain, close to the plot's ends: at 2% and 96% of it. In a wide column
// each label is centred on its tick; in a narrower one the frame anchors it at its tick, away from
// the edge (the first below 838 px, the last below 852 px), so it never leaves the frame. No zero
// line words, so there is no right margin to catch the last label.
const EDGE_VISITS: [number, number] = [100_000, 200_000];
const EDGE_TICKS = [102_000, 150_000, 196_000];
const EDGE_RATES: Array<[number, number]> = [[100_000, 3], [125_000, 5], [150_000, 4], [175_000, 6], [200_000, 5]];
const EDGE_TICK_LABELS: ChartFrameProps = {
  id: 'sink-chart-edge-ticks',
  ariaLabel: 'A fictional rate that wanders a little as visits grow',
  x: {
    domain: EDGE_VISITS,
    ticks: { narrow: EDGE_TICKS, wide: EDGE_TICKS },
    format: (v) => formatNumber(v, 0),
    label: 'Visits',
    refs: REFS,
  },
  y: {
    domain: [0, 8],
    ticks: { narrow: [4, 8], wide: [2, 4, 6, 8] },
    format: (v) => formatNumber(v, 0),
    label: 'Rate (%)',
    refs: REFS,
  },
  height: { narrow: 160, wide: 200 },
  marks: (ctx) => (
    <path
      data-mark=""
      d={EDGE_RATES.map(([n, rate], i) => `${i === 0 ? 'M' : 'L'}${ctx.xFrac(n) * MARK_UNITS} ${ctx.yPx(rate)}`).join(' ')}
      fill="none"
      stroke="var(--color-series-1)"
      strokeWidth={1}
    />
  ),
};

export function ChartFrameSection() {
  return (
    <>
      <Specimen
        id="chartframe--static"
        title="Static, responsive"
        note="A fictional difference between two groups. Below 640 px the narrow layout is drawn; from 640 px the wide one. Text never scales with the width."
      >
        <ChartFrame {...SETTLING} />
      </Specimen>
      <Specimen id="chartframe--narrow" title="Narrow layout" note="The phone layout at any width: fewer ticks, a shorter plot and a shorter annotation.">
        <ChartFrame {...SETTLING} id="sink-chart-narrow" layout="narrow" />
      </Specimen>
      <Specimen id="chartframe--wide" title="Wide layout" note="The layout from 640 px up, at any width.">
        <ChartFrame {...SETTLING} id="sink-chart-wide" layout="wide" />
      </Specimen>
      <Specimen
        id="chartframe--zero-width"
        title="One look so far"
        note="The x domain has no width yet, so the one fictional interval sits in the middle."
      >
        <ChartFrame {...ONE_LOOK} />
      </Specimen>
      <Specimen
        id="chartframe--all-equal"
        title="A value that never moves"
        note="Every fictional value is equal, so the y domain has no width and the line runs through the middle."
      >
        <ChartFrame {...FLAT} />
      </Specimen>
      <Specimen
        id="chartframe--edge-ticks"
        title="Outer ticks close to the plot's ends"
        note="A fictional rate over visits. In a wide column each outer tick label is centred on its tick; in a narrower one it is anchored at its tick, away from the edge, so it stays inside the frame."
      >
        <ChartFrame {...EDGE_TICK_LABELS} />
      </Specimen>
    </>
  );
}
