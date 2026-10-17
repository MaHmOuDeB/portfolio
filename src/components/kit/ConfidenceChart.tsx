// The live experiment's chart: the confidence sequence of B − A against views per group, with its
// "Now" row. Server-safe, no hooks. What it draws comes from confidenceModel (lib/figure/cs-band):
// - the band (running intersection, so it never grows back) as a series-ghost fill, its bounds as
//   1 px series-1 lines, the running estimate as a 1 px muted line;
// - while the test runs (calibration, A/B), the projected band from the last look to the six-month
//   cap in series-ghost, narrowing to the estimate ± the projected half-width; a decided or paused
//   test is not projected;
// - the current estimate as a series-2 dot with a 2 px bg ring;
// - "your view" as a muted x-axis tick (its one-time fade belongs to the scroll moment).
// In the collecting states it draws no chart, only the collecting Now row. When the split check
// failed or the calibration stopped it draws nothing, so a hidden verdict never leaks; nor does a
// decided test without an interval, which must not read as still collecting.
import { area, line } from 'd3-shape';
import { contentBody, confidenceModel, smallerGroup, type ConfidenceModel, type CsPoint, type LiveSnapshot } from '@/lib/figure/cs-band';
import { linearFrac, pct, type Layout } from '@/lib/figure/scales';
import type { FigureBody } from '@/lib/figure/states';
import { ChartFrame, MARK_UNITS, type PlotContext } from './ChartFrame';
import type { DerivedRef } from './Derived';
import { NowRow } from './NowRow';

type Props = {
  id: string;
  snapshot: LiveSnapshot;
  body: FigureBody;
  /** Where the numbers come from: 'live' on the site, 'simulated' in the kitchen sink. */
  refs?: readonly DerivedRef[];
  /** One layout only (tests); omit for responsive. */
  layout?: Layout;
};

const HEIGHT = { narrow: 220, wide: 280 } as const;
const VIEW_TICK = 8;
const VIEW_LABEL_GAP = 4;
// ChartFrame writes "B higher" and "B lower" at the right end of the zero line, 4 px off it, in
// text-xs (about 60 px wide with the dot's reach). Their box: the share of the narrowest plot of
// each layout (about 290 px narrow, 600 px wide) and its height in px. With the reach of the
// current dot (r 4 and its 2 px ring), the dot is never hidden under a label.
const SIDE_LABEL = { share: { narrow: 0.21, wide: 0.1 }, gap: 4, height: 13 };
const DOT_REACH = 6;
const LABEL_HALO = { stroke: 'var(--color-bg)', strokeWidth: '4px', paintOrder: 'stroke', strokeLinejoin: 'round' } as const;

/** The body the data calls for: paused, error and default keep it. */
const ownBody = (snapshot: LiveSnapshot, body: FigureBody): FigureBody =>
  body === 'paused' || body === 'error' || body === 'default' ? contentBody(snapshot) : body;

/** What a body shows of the chart. */
function shows(snapshot: LiveSnapshot, body: FigureBody): 'chart' | 'running' | 'collecting' | 'nothing' {
  const own = ownBody(snapshot, body);
  if (own === 'srm-suppressed' || own === 'aa-failed') return 'nothing';
  if (own === 'low-data') return 'collecting';
  return (own === 'calibration' || own === 'ab') && body !== 'paused' ? 'running' : 'chart';
}

/**
 * The finding in words, without a digit. Calibration (A/A) compares two identical groups, so it
 * names no group as higher; a decided test speaks of its final interval, a running one of the
 * current interval and what is not ruled out yet.
 */
function ariaLabel(m: ConfidenceModel, own: FigureBody): string {
  if (own === 'calibration') {
    const where = m.includesZero ? 'the current interval includes zero' : 'the current interval does not include zero';
    return `The difference between the two identical groups as views per group grow: ${where}`;
  }
  const final = own === 'ship-b' || own === 'stop-for-harm' || own === 'inconclusive';
  const which = final ? 'the final interval' : 'the current interval';
  const where = m.includesZero
    ? final
      ? `${which} includes zero`
      : `${which} still includes zero, so no difference is ruled out yet`
    : m.current.lower > 0
      ? `${which} lies above zero: B higher`
      : `${which} lies below zero: B lower`;
  return `The difference between the groups, B minus A, as views per group grow: ${where}`;
}

/** "B higher" and "B lower", each left out where the current estimate would sit under it. */
function sideLabels(m: ConfidenceModel): { aboveLabel?: string; belowLabel?: string } {
  let above = true;
  let below = true;
  const x = linearFrac(m.x.domain)(m.current.n);
  const yFrac = linearFrac(m.y.domain);
  for (const layout of ['narrow', 'wide'] as const) {
    if (x <= 1 - SIDE_LABEL.share[layout]) continue;
    // px below the zero line (negative: above it).
    const below0 = (yFrac(0) - yFrac(m.current.estimate)) * HEIGHT[layout];
    const reach = SIDE_LABEL.gap + SIDE_LABEL.height + DOT_REACH;
    if (below0 > -reach && below0 < DOT_REACH) above = false;
    if (below0 < reach && below0 > -DOT_REACH) below = false;
  }
  return { aboveLabel: above ? 'B higher' : undefined, belowLabel: below ? 'B lower' : undefined };
}

function Marks({ ctx, m, project }: { ctx: PlotContext; m: ConfidenceModel; project: boolean }) {
  const x = (n: number) => ctx.xFrac(n) * MARK_UNITS;
  const band = area<CsPoint>()
    .x((p) => x(p.n))
    .y0((p) => ctx.yPx(p.lower))
    .y1((p) => ctx.yPx(p.upper))(m.series) ?? '';
  const path = (key: 'lower' | 'upper' | 'estimate') =>
    line<CsPoint>()
      .x((p) => x(p.n))
      .y((p) => ctx.yPx(p[key]))(m.series) ?? '';
  const p = project ? m.projection : undefined;
  const current = m.current;
  return (
    <>
      <path data-mark="" data-cs="band" d={band} fill="var(--color-series-ghost)" />
      {p ? (
        <path
          data-mark=""
          data-cs="projection"
          d={`M${x(p.fromN)} ${ctx.yPx(p.fromUpper)}L${x(p.toN)} ${ctx.yPx(p.toUpper)}L${x(p.toN)} ${ctx.yPx(p.toLower)}L${x(p.fromN)} ${ctx.yPx(p.fromLower)}Z`}
          fill="var(--color-series-ghost)"
        />
      ) : null}
      {m.series.length === 1 ? (
        // One look has no band to fill yet: its interval is a vertical line.
        <path
          data-mark=""
          data-cs="interval"
          d={`M${x(current.n)} ${ctx.yPx(current.upper)}L${x(current.n)} ${ctx.yPx(current.lower)}`}
          fill="none"
          stroke="var(--color-series-1)"
          strokeWidth={1}
        />
      ) : null}
      <path data-mark="" data-cs="estimate" d={path('estimate')} fill="none" stroke="var(--color-muted)" strokeWidth={1} />
      <path data-mark="" data-cs="lower" d={path('lower')} fill="none" stroke="var(--color-series-1)" strokeWidth={1} />
      <path data-mark="" data-cs="upper" d={path('upper')} fill="none" stroke="var(--color-series-1)" strokeWidth={1} />
    </>
  );
}

function Overlays({ ctx, m }: { ctx: PlotContext; m: ConfidenceModel }) {
  const view = m.yourViewN;
  const viewFrac = view === undefined ? 0 : ctx.xFrac(view);
  return (
    <>
      {view !== undefined ? (
        <g data-your-view="">
          <line
            x1={pct(viewFrac)}
            x2={pct(viewFrac)}
            y1={ctx.height - VIEW_TICK}
            y2={ctx.height}
            stroke="var(--color-muted)"
            strokeWidth={1}
          />
          <text
            x={pct(viewFrac)}
            y={ctx.height - VIEW_TICK - VIEW_LABEL_GAP}
            textAnchor={viewFrac < 0.15 ? 'start' : viewFrac > 0.85 ? 'end' : 'middle'}
            className="text-xs fill-muted"
            {...LABEL_HALO}
          >
            your view
          </text>
        </g>
      ) : null}
      <circle
        data-mark=""
        data-cs="current"
        cx={pct(ctx.xFrac(m.current.n))}
        cy={ctx.yPx(m.current.estimate)}
        r={4}
        fill="var(--color-series-2)"
        stroke="var(--color-bg)"
        strokeWidth={4}
        paintOrder="stroke"
      />
    </>
  );
}

export function ConfidenceChart({ id, snapshot, body, refs = ['live'], layout }: Props) {
  const shown = shows(snapshot, body);
  if (shown === 'nothing') return null;
  const m = shown === 'chart' || shown === 'running' ? confidenceModel(snapshot) : null;
  // A decided test without an interval draws nothing: a collecting row would read as running.
  if (m === null && shown === 'chart') return null;
  if (m === null) {
    // Only a running phase (calibration or A/B, paused or not) is promised its next look.
    const due = snapshot.phase === 'calibration' || snapshot.phase === 'ab';
    return (
      <div data-confidence-chart={id}>
        <NowRow
          domain={[-1, 1]}
          collecting={{ nSmaller: smallerGroup(snapshot), plannedEnd: snapshot.plannedEnd, due }}
          refs={refs}
        />
      </div>
    );
  }
  return (
    <div data-confidence-chart={id}>
      <ChartFrame
        id={`${id}-chart`}
        ariaLabel={ariaLabel(m, ownBody(snapshot, body))}
        layout={layout}
        x={{ ...m.x, label: 'Views per group', refs }}
        y={{
          ...m.y,
          label: 'B − A (percentage points)',
          refs,
          zeroLabel: 'no difference',
          ...sideLabels(m),
        }}
        height={HEIGHT}
        marks={(ctx) => <Marks ctx={ctx} m={m} project={shown === 'running'} />}
        overlays={(ctx) => <Overlays ctx={ctx} m={m} />}
      />
      <NowRow domain={m.y.domain} interval={m.current} refs={refs} />
    </div>
  );
}
