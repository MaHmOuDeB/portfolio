// The peeking Figure, drawn from one PeekView: the chart, the result line, the caption and the table
// all read the same tuple, so they can never disagree. Shared and hook-free: the server draws the
// preset with it (the static HTML, also the no-JS view) and the island draws the visitor's view.
//
// - The chart: the share of simulated A/A runs flagged so far on each day checked (y from 0 to 40%,
//   or to the next tenth above the highest plotted share), the chosen fix in series-1, the daily
//   checks with no fix as a pale ghost when a fix is chosen, the selected rate on the last day as an
//   orange dot with a background ring, and the planned 5% as a dotted line. One day puts its point
//   at x = 1 on a [0, 1] axis. Marks have no transition.
// - The result line, in plain words: the share of tests that found a false winner and how it stands
//   against the 5% a single check allows (with no fix the check-once comparison; with a fix the word holds at every
//   number of days: O'Brien-Fleming "close to or under", the confidence sequence "well under"). Then
//   the price of the fix, as planning arithmetic: never measured power or a sample. The Monte Carlo
//   range and the check-once simulated rate are in the method row.
// - Every number is a <Derived> with the simulated ref; the caption's values come from the
//   reconstructed metadata of the selected schedule and of the daily ghost. The chart's accessible
//   name is words only; its numbers are in the table and the result line.
import { line } from 'd3-shape';
import { Fragment, type ReactNode } from 'react';
import { ChartFrame, MARK_UNITS, type PlotContext } from '@/components/kit/ChartFrame';
import { Derived } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { formatValue } from '@/lib/facts/format';
import { formatNumber } from '@/lib/figure/format';
import { niceTicks, pct } from '@/lib/figure/scales';
import { fill } from '@/lib/i18n/template';
import type { Locale } from '@/lib/i18n/locale';
import { Exhibit, PhonePoint } from '@/components/lab/Exhibit';
import { PEEK_REFS, computePeek, peekDomains, type PeekView } from '@/lib/lab/peeking';
import { PEEK_PRESETS } from '@/lib/lab/peeking-values';
import { withWords } from '@/lib/lab/sentence';
import { labKit, plural } from '@/lib/lab/text-common';
import { EN_PEEK, type PeekText } from '@/lib/lab/text-peek';
import { sentenceNodes, sentenceText, type Sentence } from '@/lib/retention/sentence';

/** The Monte Carlo range is a 95% Wilson interval over the runs. */
const MC_LEVEL = 0.95;
/** The y axis of the usual 0 to 40% domain. */
const Y_TOP = 0.4;
const Y_TICKS = { wide: [0.1, 0.2, 0.3, 0.4], narrow: [0.2, 0.4] };

type Num = { n: number; unit: 'share' | 'count' | 'decimal'; decimals?: number };

const share = (n: number, decimals = 0): Num => ({ n, unit: 'share', decimals });
const count = (n: number): Num => ({ n, unit: 'count' });
const decimal = (n: number): Num => ({ n, unit: 'decimal', decimals: 2 });

/**
 * A piece of a result, a legend or a method: a sentence of the words, the numbers its slots stand
 * for, and the plain words its `{name}` placeholders take. Pieces are drawn one after the other, as
 * children of one element, so the markup is the pieces' own.
 */
type Part = { s: Sentence; nums?: Record<string, Num>; words?: Record<string, string> };

const numText = (num: Num, locale: Locale) => formatValue(num.n, num.unit, { decimals: num.decimals, locale });

function partNodes(part: Part, locale: Locale): ReactNode {
  const values: Record<string, ReactNode> = {};
  for (const [name, num] of Object.entries(part.nums ?? {})) {
    values[name] = <Derived value={num.n} unit={num.unit} decimals={num.decimals} refs={PEEK_REFS} locale={locale} />;
  }
  return sentenceNodes(withWords(part.s, part.words ?? {}), values);
}

function partText(part: Part, locale: Locale): string {
  const values: Record<string, string> = {};
  for (const [name, num] of Object.entries(part.nums ?? {})) values[name] = numText(num, locale);
  return sentenceText(withWords(part.s, part.words ?? {}), values);
}

function Parts({ parts, locale }: { parts: readonly Part[]; locale: Locale }) {
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{partNodes(part, locale)}</Fragment>
      ))}
    </>
  );
}

/** How the rate stands against the planned level, as the result line says it. */
function relation(view: PeekView, text: PeekText): string {
  const { mode, fix } = view.values;
  if (mode === 'daily' && fix === 'obf') return text.relation.closeOrUnder;
  if (mode === 'daily' && fix === 'cs') return text.relation.wellUnder;
  const alpha = view.selected.alpha;
  return view.mc.lower > alpha ? text.relation.above : view.mc.upper < alpha ? text.relation.below : text.relation.about;
}

/**
 * The result line and the announcement, as one list of pieces: the plain verdict first, then the price
 * of a fix. The Monte Carlo range of the rate is in the method row.
 */
function resultParts(view: PeekView, text: PeekText): Part[] {
  const { values, selected, cost } = view;
  const alpha = share(selected.alpha);
  const base = { rate: share(selected.falsePositiveRate, 1), runs: count(selected.runs), alpha };
  const r = text.result;
  if (values.mode === 'once') {
    return [{ s: r.once, nums: { ...base, nPerLook: count(selected.nPerLook) }, words: { relation: relation(view, text) } }];
  }
  if (values.fix === 'cs') {
    return [
      { s: r.cs, nums: base },
      ...(cost?.kind === 'width' ? [{ s: text.cost.width, nums: { ratio: share(cost.ratio - 1) } }] : []),
    ];
  }
  if (values.looks === 1) {
    return [{ s: r.single, nums: base, words: { relation: relation(view, text) } }, ...(values.fix === 'obf' ? [{ s: r.singleObf }] : [])];
  }
  if (values.fix === 'obf') {
    return [
      { s: r.obf, nums: base },
      ...(cost?.kind === 'boundary' ? [{ s: text.cost.boundary, nums: { ratio: share(cost.ratio - 1) } }] : []),
    ];
  }
  return [{ s: r.naive, nums: { ...base, looks: count(selected.looks) }, words: { days: plural(selected.looks, text.day) } }];
}

/** The announcement: the result line in words, on a committed change only. */
export function peekAnnouncement(view: PeekView, text: PeekText = EN_PEEK): string {
  return resultParts(view, text)
    .map((part) => partText(part, text.kit.locale))
    .join('');
}

function criterion(view: PeekView, text: PeekText): Part {
  const { mode, fix } = view.values;
  const alpha = view.selected.alpha;
  const c = text.criterion;
  if (mode === 'once') return { s: c.once, nums: { alpha: decimal(alpha) } };
  if (fix === 'obf') return { s: c.obf, nums: { alpha: decimal(alpha) } };
  if (fix === 'cs') return { s: c.cs, nums: { level: share(1 - alpha) } };
  return { s: c.naive, nums: { alpha: decimal(alpha) } };
}

/**
 * What the marks are: the chosen schedule, the ghost (the daily looks with no fix) and the dot. At
 * one look the ghost is a pale dot; when it has the same share as the chosen schedule (looking once,
 * or O'Brien-Fleming, at one look) the ringed dot covers it, and the caption says so.
 */
function legend(view: PeekView, text: PeekText): Part {
  const { values, naive, selected } = view;
  const one = values.looks === 1;
  const hidden = one && naive.falsePositiveRate === selected.falsePositiveRate;
  const l = text.legend;
  const nums = { looks: count(naive.looks), n: count(naive.nPerLook) };
  const words = { mark: one ? text.words.dot : text.words.line, checks: plural(naive.looks, text.words.check) };
  if (values.mode === 'once') {
    return hidden ? { s: l.onceHidden, nums } : { s: l.once, nums, words };
  }
  if (values.fix === 'naive') return { s: one ? l.naiveOne : l.naiveMany };
  if (hidden) return { s: l.hidden, nums };
  return { s: l.other, nums, words: { ...words, tail: one ? l.tailOne : l.tailMany } };
}

/** The caption under the chart: what is simulated. The rest of the method is in the method row. */
function captionParts(view: PeekView, text: PeekText): Part[] {
  return [{ s: text.caption, nums: { p: share(view.selected.p) } }];
}

/** The method row's text for the setting on screen: the schedule, the criterion, the marks, the runs. */
function methodParts(view: PeekView, text: PeekText): Part[] {
  const { values, selected, mc } = view;
  // The check-once comparison the control row no longer offers: one check after the same visitors.
  const once = values.mode === 'once' ? null : computePeek({ ...values, mode: 'once' }).selected;
  const m = text.method;
  const level = share(MC_LEVEL);
  const alpha = share(selected.alpha);
  return [
    {
      s: m.head,
      nums: { rate: share(selected.falsePositiveRate, 1), level, lower: share(mc.lower, 1), upper: share(mc.upper, 1), alpha },
      words: { relation: relation(view, text) },
    },
    values.mode === 'once'
      ? { s: m.scheduleOnce, nums: { n: count(selected.nPerLook) } }
      : { s: m.scheduleDaily, nums: { n: count(selected.nPerLook) } },
    ...(once ? [{ s: m.onceRate, nums: { n: count(once.nPerLook), rate: share(once.falsePositiveRate, 1) } }] : []),
    criterion(view, text),
    legend(view, text),
    { s: m.tail, nums: { alpha, runs: count(selected.runs), seed: count(selected.seed), level } },
    ...(view.cost ? [{ s: [m.cost] }] : []),
    { s: [m.credit] },
  ];
}

/** The preset's view, looked up once: the lead-in and the terms quote the starting setting. */
let startView: PeekView | undefined;
const start = () => (startView ??= computePeek({ ...PEEK_PRESETS.default, mode: 'daily' }));

/** The sentence above the Figure: the one control to move and what to watch. */
export function PeekLeadIn({ text = EN_PEEK }: { text?: PeekText } = {}) {
  return <Parts parts={[{ s: text.leadIn, nums: { runs: count(start().selected.runs) } }]} locale={text.kit.locale} />;
}

/**
 * The sentence below the Figure: what I do about it, the same at every setting, so it quotes no
 * number (the result line shows the contrast of one check and daily checks). The live test's plan
 * uses a confidence sequence, the always-valid check.
 */
export const PEEK_TAKEAWAY = EN_PEEK.takeaway;

/** The terms the peeking example uses, each in one sentence, at the top of the method row. */
function PeekTerms({ text }: { text: PeekText }) {
  const locale = text.kit.locale;
  const alpha = start().selected.alpha;
  const term = (name: string) => <strong className="font-semibold">{name}</strong>;
  const n = text.termNames;
  return sentenceNodes(text.terms, {
    peeking: term(n.peeking),
    falseWinner: term(n.falseWinner),
    odds: <Parts parts={[{ s: text.odds, nums: { one: count(1), n: count(Math.round(1 / alpha)) } }]} locale={locale} />,
    obf: term(n.obf),
    cs: term(n.cs),
  });
}

/** Look 1, round looks between, and the last look; none crowding either end. */
function lookTicks(looks: number, count: number): number[] {
  if (looks === 1) return [1];
  const gap = (looks - 1) * 0.08;
  const inner = niceTicks([1, looks], count).filter((t) => Number.isInteger(t) && t - 1 >= gap && looks - t >= gap);
  return [1, ...inner.filter((t) => t > 1 && t < looks), looks];
}

function chartName(view: PeekView, text: PeekText): string {
  const { looks, mode, fix } = view.values;
  const name = text.chart.name;
  if (mode === 'once') return name.once;
  if (fix === 'naive') return looks === 1 ? name.naiveOne : name.naiveMany;
  const method = name.methods[fix];
  return fill(looks === 1 ? name.fixOne : name.fixMany, { method });
}

/**
 * Thrown by the test seam's chart: a chart failure after a change, for the error fallback's tests.
 * Its body is exactly one throw with a literal message, the only shape the fault-seam guard accepts.
 */
function SeamFailure(): never {
  throw new Error('The peeking chart failed after a change (test seam)');
}

export function PeekChart({ id, view, text = EN_PEEK }: { id: string; view: PeekView; text?: PeekText }) {
  const locale = text.kit.locale;
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
        ariaLabel={chartName(view, text)}
        x={{
          domain: x,
          ticks: { wide: lookTicks(L, 6), narrow: lookTicks(L, 3) },
          format: (v) => formatNumber(v, 0, { locale }),
          label: text.chart.axis.x,
          refs: PEEK_REFS,
        }}
        y={{
          domain: y,
          ticks: yTicks,
          format: (v) => fill(text.percent, { value: formatNumber(v * 100, 0, { locale }) }),
          label: text.chart.axis.y,
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
      />
      {/* The key to the dotted line, under the chart: on the chart a label would sit far from the line
          or on the curves, which start at the nominal level and, with a fix, stay on it. */}
      <p data-nominal-key="" className="mt-2 flex items-center gap-2 text-sm text-muted">
        <svg aria-hidden="true" width={24} height={2} className="shrink-0">
          <line x1={0} x2={24} y1={1} y2={1} stroke="var(--color-muted)" strokeWidth={1} strokeDasharray="2 3" />
        </svg>
        <span>
          {sentenceNodes(text.chart.key, { alpha: <Derived value={alpha} unit="share" decimals={0} refs={PEEK_REFS} locale={locale} /> })}
        </span>
      </p>
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
  /** The Figure's words and the language of its numbers; English when absent. */
  text?: PeekText;
};

export function PeekingFigureView({ id, view, controls, announcement, preview, faultAfterChange, changed, text = EN_PEEK }: PeekingFigureViewProps) {
  const { values, selected } = view;
  const locale = text.kit.locale;
  const takeaway = text.takeaway;
  const figure = (
    <Figure
      id={id}
      title={text.title}
      text={labKit(text.kit)}
      provenance="simulated"
      table={view.table}
      lead={<PhonePoint label={text.exhibit.takeaway}>{takeaway}</PhonePoint>}
      controls={controls}
      announcement={announcement}
      preview={preview}
      result={
        <span data-peek-result="" data-looks={values.looks} data-mode={values.mode} data-fix={values.fix} data-rate={selected.falsePositiveRate}>
          <Parts parts={resultParts(view, text)} locale={locale} />
        </span>
      }
      caption={<Parts parts={captionParts(view, text)} locale={locale} />}
    >
      <PeekChart id={id} view={view} text={text} />
      {faultAfterChange && changed ? <SeamFailure /> : null}
    </Figure>
  );
  return (
    <Exhibit
      summary={text.summary}
      leadIn={<PeekLeadIn text={text} />}
      takeaway={takeaway}
      labels={text.exhibit}
      method={
        <>
          <p data-method-terms="">
            <PeekTerms text={text} />
          </p>
          <p data-method-text="" data-peek-method="">
            <Parts parts={methodParts(view, text)} locale={locale} />
          </p>
        </>
      }
    >
      {figure}
    </Exhibit>
  );
}
