// The peeking Figure, drawn from one PeekView: the chart, the result line, the caption and the table
// all read the same tuple, so they can never disagree. Shared and hook-free: the server draws the
// preset with it (the static HTML, also the no-JS view) and the island draws the visitor's view.
//
// - The chart: the share of simulated A/A runs flagged so far at each look (y from 0 to 40%, or to
//   the next tenth above the highest plotted share), the chosen schedule in series-1, the daily
//   schedule with no fix as a pale ghost when it differs from the chosen one, the selected rate at
//   the last look (or the one look) as an orange dot with a background ring, and the nominal 5% as a
//   dotted line. One look puts its point at x = 1 on a [0, 1] axis. Marks have no transition.
// - The result line: the rate over the runs with its 95% Monte Carlo range (a Wilson interval),
//   and how it stands against the nominal 5%. With no fix, and when looking once, that word is read
//   from the range (above, about or below); with a fix it holds at every look count
//   (O'Brien-Fleming "close to or under", the confidence sequence "well under"). Then the price of
//   the fix, as planning arithmetic: never measured power or a sample, and never tied to the looks.
// - Every number is a <Derived> with the simulated ref; the caption's values come from the
//   reconstructed metadata of the selected schedule and of the daily ghost. The chart's accessible
//   name is words only; its numbers are in the table and the result line.
import { line } from 'd3-shape';
import type { ReactNode } from 'react';
import { ChartFrame, MARK_UNITS, type PlotContext } from '@/components/kit/ChartFrame';
import { Derived } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { formatValue } from '@/lib/facts/format';
import { formatNumber } from '@/lib/figure/format';
import { niceTicks, pct } from '@/lib/figure/scales';
import { PEEK_REFS, peekDomains, type PeekView } from '@/lib/lab/peeking';
import { PEEK_TITLE } from '@/lib/lab/peeking-values';

/** The Monte Carlo range is a 95% Wilson interval over the runs. */
const MC_LEVEL = 0.95;
/** The y axis of the usual 0 to 40% domain. */
const Y_TOP = 0.4;
const Y_TICKS = { wide: [0.1, 0.2, 0.3, 0.4], narrow: [0.2, 0.4] };

type Num = { n: number; unit: 'share' | 'count' | 'decimal'; decimals?: number };
type Seg = string | Num;

const share = (n: number, decimals = 0): Num => ({ n, unit: 'share', decimals });
const count = (n: number): Num => ({ n, unit: 'count' });
const decimal = (n: number): Num => ({ n, unit: 'decimal', decimals: 2 });

const segText = (s: Seg) => (typeof s === 'string' ? s : formatValue(s.n, s.unit, { decimals: s.decimals }));

function Segments({ segs }: { segs: readonly Seg[] }) {
  return (
    <>
      {segs.map((s, i) =>
        typeof s === 'string' ? s : <Derived key={i} value={s.n} unit={s.unit} decimals={s.decimals} refs={PEEK_REFS} />,
      )}
    </>
  );
}

const looksWord = (n: number) => (n === 1 ? 'look' : 'looks');

/** How the rate stands against the nominal level, as the result line says it. */
function relation(view: PeekView): string {
  const { mode, fix } = view.values;
  if (mode === 'daily' && fix === 'obf') return 'close to or under';
  if (mode === 'daily' && fix === 'cs') return 'well under';
  const alpha = view.selected.alpha;
  return view.mc.lower > alpha ? 'above' : view.mc.upper < alpha ? 'below' : 'about';
}

/** The result line and the announcement, as one list of words and numbers. */
function resultSegments(view: PeekView): Seg[] {
  const { values, selected, mc, cost } = view;
  const where: Seg[] =
    values.mode === 'once'
      ? ['at one look after ', count(selected.nPerLook), ' visitors per group']
      : ['by look ', count(selected.looks)];
  const segs: Seg[] = [
    'Under these simulation assumptions, ',
    share(selected.falsePositiveRate, 1),
    ' of ',
    count(selected.runs),
    ' runs found a false winner ',
    ...where,
    ' (',
    share(MC_LEVEL),
    ' Monte Carlo range ',
    share(mc.lower, 1),
    ' to ',
    share(mc.upper, 1),
    `): ${relation(view)} the nominal `,
    share(selected.alpha),
    '.',
  ];
  if (cost?.kind === 'boundary') {
    segs.push(
      ...(values.looks === 1
        ? [' With one look there is no extra bar: this is the fixed design.']
        : [
            ' At the last look the bar for a winner is about ',
            share(cost.ratio - 1),
            ' higher than for one look at the end; early looks need stronger evidence.',
          ]),
    );
  } else if (cost?.kind === 'width') {
    segs.push(
      " It is conservative here; that is not a guarantee for every population. At the planned sample, the confidence sequence's interval is about ",
      share(cost.ratio - 1),
      " wider than a single fixed test's.",
    );
  }
  return segs;
}

/** The announcement: the result line in words, on a committed change only. */
export function peekAnnouncement(view: PeekView): string {
  return resultSegments(view).map(segText).join('');
}

function criterion(view: PeekView): Seg[] {
  const { mode, fix } = view.values;
  const alpha = view.selected.alpha;
  if (mode === 'once') {
    return ['A run counts as a false winner if its p-value (pooled z-test, two-sided) at that one look falls below ', decimal(alpha), '. '];
  }
  if (fix === 'obf') {
    return [
      "A run counts as a false winner the first time the size of its z statistic reaches the O'Brien-Fleming bar for that look, set for an overall two-sided level of ",
      decimal(alpha),
      '. ',
    ];
  }
  if (fix === 'cs') {
    return ['A run counts as a false winner the first time the ', share(1 - alpha), ' confidence sequence for the difference excludes zero. '];
  }
  return ['A run counts as a false winner the first time its p-value (pooled z-test, two-sided) falls below ', decimal(alpha), '. '];
}

/**
 * What the marks are: the chosen schedule, the ghost (the daily looks with no fix) and the dot. At
 * one look the ghost is a pale dot; when it has the same share as the chosen schedule (looking once,
 * or O'Brien-Fleming, at one look) the ringed dot covers it, and the caption says so.
 */
function legend(view: PeekView): Seg[] {
  const { values, naive, selected } = view;
  const one = values.looks === 1;
  const hidden = one && naive.falsePositiveRate === selected.falsePositiveRate;
  if (values.mode === 'once') {
    if (hidden) {
      return [
        'The comparison schedule is ',
        count(naive.looks),
        ' daily look of ',
        count(naive.nPerLook),
        ' visitors per group with no fix. With one look the comparison schedule gives the same share, so its pale dot sits under the ringed dot. ',
      ];
    }
    return [
      `The pale ${one ? 'dot' : 'line'} is the comparison schedule: `,
      count(naive.looks),
      ` daily ${looksWord(naive.looks)} of `,
      count(naive.nPerLook),
      ' visitors per group with no fix. The ringed dot is the one look at the end. ',
    ];
  }
  if (values.fix === 'naive') {
    return [one ? 'The ringed dot is the share of runs flagged at the one look. ' : 'The line is the share of runs flagged so far at each look, and the ringed dot is the last look. '];
  }
  if (hidden) {
    return [
      'The comparison is the same ',
      count(naive.looks),
      ' daily look of ',
      count(naive.nPerLook),
      ' visitors per group with no fix; with one look the fix changes nothing, so the pale dot sits under the ringed dot. ',
    ];
  }
  return [
    `The pale ${one ? 'dot' : 'line'} is the same `,
    count(naive.looks),
    ` daily ${looksWord(naive.looks)} of `,
    count(naive.nPerLook),
    ` visitors per group with no fix; ${one ? 'the ringed dot uses the fix. ' : 'the dark line uses the fix, and the ringed dot is its last look. '}`,
  ];
}

function captionSegments(view: PeekView): Seg[] {
  const { values, selected } = view;
  return [
    'Simulated A/A tests: both groups convert at ',
    share(selected.p),
    ', so every winner is a false one. ',
    ...(values.mode === 'once'
      ? ['Looking once means one check after ', count(selected.nPerLook), ' visitors per group. ']
      : ['Each scheduled look adds ', count(selected.nPerLook), ' visitors per group. ']),
    ...criterion(view),
    ...legend(view),
    'The dotted line marks the nominal ',
    share(selected.alpha),
    '. ',
    count(selected.runs),
    ' runs from seed ',
    count(selected.seed),
    '; the ',
    share(MC_LEVEL),
    ' Monte Carlo range is a Wilson interval over the runs: where the rate would settle with far more runs. ',
    'Each setting is its own simulation, so nearby look counts can differ by a few points. ',
    ...(view.cost ? ["The price of a fix is arithmetic at the last look's sample, not a measured loss of power. "] : []),
    'Idea credited to Evan Miller, “How Not To Run an A/B Test”.',
  ];
}

/** Look 1, round looks between, and the last look; none crowding either end. */
function lookTicks(looks: number, count: number): number[] {
  if (looks === 1) return [1];
  const gap = (looks - 1) * 0.08;
  const inner = niceTicks([1, looks], count).filter((t) => Number.isInteger(t) && t - 1 >= gap && looks - t >= gap);
  return [1, ...inner.filter((t) => t > 1 && t < looks), looks];
}

function chartName(view: PeekView): string {
  const { looks, mode, fix } = view.values;
  if (mode === 'once') return 'False winners when looking once at the end, beside daily looks with no fix';
  if (fix === 'naive') {
    return looks === 1
      ? 'False winners at a single look with no fix'
      : 'False winners so far by look when peeking daily with no fix: the share climbs from the first look to the last';
  }
  const method = fix === 'obf' ? "O'Brien-Fleming bounds" : 'a confidence sequence';
  return looks === 1
    ? `False winners at a single look with ${method}, beside the same look with no fix`
    : `False winners so far by look with ${method}, beside the same daily looks with no fix`;
}

/**
 * Thrown by the test seam's chart: a chart failure after a change, for the error fallback's tests.
 * Its body is exactly one throw with a literal message, the only shape the fault-seam guard accepts.
 */
function SeamFailure(): never {
  throw new Error('The peeking chart failed after a change (test seam)');
}

export function PeekChart({ id, view }: { id: string; view: PeekView }) {
  const { values, selected, naive } = view;
  const L = values.looks;
  const { x, y } = peekDomains(view);
  const ghost = values.mode === 'once' || values.fix !== 'naive';
  const chosen = values.mode === 'once' ? null : selected.cumulativeByLook;
  const yTicks =
    y[1] === Y_TOP
      ? Y_TICKS
      : (() => {
          const wide = niceTicks(y, 4).filter((t) => t > 0);
          return { wide, narrow: wide.filter((_, i) => i % 2 === 1) };
        })();
  const alpha = selected.alpha;
  const path = (ctx: PlotContext, values: readonly number[]) =>
    line<number>()
      .x((_, i) => ctx.xFrac(i + 1) * MARK_UNITS)
      .y((v) => ctx.yPx(v))(values) ?? '';
  return (
    <div
      data-peek-chart=""
      data-looks={L}
      data-mode={values.mode}
      data-fix={values.fix}
      data-ghost-looks={naive.looks}
      data-ghost-n-per-look={naive.nPerLook}
      data-selected-looks={selected.looks}
      data-selected-n-per-look={selected.nPerLook}
    >
      <ChartFrame
        id={`${id}-chart`}
        ariaLabel={chartName(view)}
        x={{
          domain: x,
          ticks: { wide: lookTicks(L, 6), narrow: lookTicks(L, 3) },
          format: (v) => formatNumber(v, 0),
          label: 'Look',
          refs: PEEK_REFS,
        }}
        y={{
          domain: y,
          ticks: yTicks,
          format: (v) => `${formatNumber(v * 100, 0)}%`,
          label: 'False winners so far',
          refs: PEEK_REFS,
        }}
        height={{ narrow: 220, wide: 280 }}
        marks={(ctx) => (
          <>
            {ghost && L > 1 ? (
              <path
                data-mark=""
                data-series="ghost"
                data-values={naive.cumulativeByLook.join(' ')}
                d={path(ctx, naive.cumulativeByLook)}
                fill="none"
                stroke="var(--color-series-ghost)"
                strokeWidth={3}
                strokeLinejoin="round"
              />
            ) : null}
            {chosen && L > 1 ? (
              <path
                data-mark=""
                data-series="selected"
                data-values={chosen.join(' ')}
                d={path(ctx, chosen)}
                fill="none"
                stroke="var(--color-series-1)"
                strokeWidth={2}
                strokeLinejoin="round"
              />
            ) : null}
          </>
        )}
        overlays={(ctx) => (
          <>
            <line
              data-mark=""
              data-nominal=""
              x1={0}
              x2="100%"
              y1={ctx.yPx(alpha)}
              y2={ctx.yPx(alpha)}
              stroke="var(--color-muted)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            {ghost && L === 1 ? (
              <circle
                data-mark=""
                data-series="ghost-point"
                cx={pct(ctx.xFrac(1))}
                cy={ctx.yPx(naive.falsePositiveRate)}
                r={6}
                fill="var(--color-series-ghost)"
              />
            ) : null}
            <circle
              data-mark=""
              data-series="current"
              data-look={L}
              data-value={selected.falsePositiveRate}
              cx={pct(ctx.xFrac(L))}
              cy={ctx.yPx(selected.falsePositiveRate)}
              r={4}
              stroke="var(--color-bg)"
              fill="var(--color-series-2)"
              strokeWidth={4}
              paintOrder="stroke"
            />
          </>
        )}
        // Top left, in the band no plotted share reaches at the start of the looks.
        annotation={() => ({
          x: x[0],
          y: y[1] * 0.92,
          text: `Dotted line: nominal ${formatValue(alpha, 'share', { decimals: 0 })}`,
          anchor: 'start',
          refs: PEEK_REFS,
        })}
      />
    </div>
  );
}

export type PeekingFigureViewProps = {
  id: string;
  view: PeekView;
  controls?: ReactNode;
  announcement?: string;
  /** The island passes false, so a chart failure shows the kit's sentence and the current table only. */
  preview?: ReactNode;
  /**
   * Test seam, absent in production: with `changed`, the chart throws, so a test can see the error
   * fallback. The island forwards it unchanged; the server never sets it.
   */
  faultAfterChange?: true;
  /** Whether the visitor has committed a change since the island loaded. */
  changed?: boolean;
};

export function PeekingFigureView({ id, view, controls, announcement, preview, faultAfterChange, changed }: PeekingFigureViewProps) {
  const { values, selected } = view;
  return (
    <Figure
      id={id}
      title={PEEK_TITLE}
      provenance="simulated"
      table={view.table}
      controls={controls}
      announcement={announcement}
      preview={preview}
      result={
        <span data-peek-result="" data-looks={values.looks} data-mode={values.mode} data-fix={values.fix} data-rate={selected.falsePositiveRate}>
          <Segments segs={resultSegments(view)} />
        </span>
      }
      caption={<Segments segs={captionSegments(view)} />}
    >
      <PeekChart id={id} view={view} />
      {faultAfterChange && changed ? <SeamFailure /> : null}
    </Figure>
  );
}
