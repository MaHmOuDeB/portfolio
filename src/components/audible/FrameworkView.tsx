// The ship-rule Figure, drawn from three interval bounds on a made-up product. Shared and hook-free:
// the server draws the preset with it (the static HTML, also the no-JS view) and the island draws the
// visitor's bounds with the same markup.
//
// - Chapter Club, its main metric (session completion) and its guardrail (help requests) are made up,
//   and the bounds are typed in: nothing is estimated. The decision is the model's
//   (src/lib/audible/framework.ts), checked in its order: stop, hold, ship, may ship.
// - One difference axis in percentage points, the same for every value (-10 to +10), so a change of
//   bounds never rescales it. The main metric is an interval with both ends capped; the guardrail is
//   drawn by its upper end only (a cap, with a dashed line down to the axis's end), because the rule
//   asks only how far it might rise. Its limit is a dashed line across the guardrail's column, with
//   one annotation. Marks have no transition.
// - Every number names its source: every value here is simulated (typed in, or the model's fixed
//   limit). The decision is a word, set in semibold; its colour only repeats it.
import type { ReactNode } from 'react';
import { ChartFrame } from '@/components/kit/ChartFrame';
import type { TableData } from '@/components/kit/DataTable';
import { derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { GUARDRAIL_MARGIN, frameworkDecision, type FrameworkDecision, type FrameworkValues } from '@/lib/audible/framework';
import { FRAMEWORK_ID } from '@/lib/audible/framework-url';
import { EN_FRAMEWORK, type FrameworkText } from '@/lib/audible/text';
import { formatSignedNumber, formatSignedPoints } from '@/lib/figure/format';
import { pct } from '@/lib/figure/scales';
import type { FigureState } from '@/lib/figure/states';
import { labKit } from '@/lib/lab/text-common';
import { fill } from '@/lib/i18n/template';
import { sentenceNodes, sentenceText } from '@/lib/retention/sentence';

export const FRAMEWORK_REFS: readonly DerivedRef[] = ['simulated'];
const SOURCE = derivedAttr(FRAMEWORK_REFS);

export const FRAMEWORK_TITLE = EN_FRAMEWORK.title;

export const DECISION_LABEL: Record<FrameworkDecision, string> = EN_FRAMEWORK.decision;

/** The colour that repeats the decision word: never the only signal. */
const DECISION_TONE: Record<FrameworkDecision, string> = {
  ship: 'text-ok',
  'ship-neutral': 'text-ok',
  harm: 'text-warn',
  hold: 'text-warn',
};

/** Bounds print with one decimal, the grid's step; the limit is a whole number. */
const boundIn = (locale: FrameworkText['kit']['locale']) => (v: number) => formatSignedPoints(v, 1, { locale });
const limitIn = (locale: FrameworkText['kit']['locale']) => formatSignedNumber(GUARDRAIL_MARGIN, 1, { locale });

const Y_TICKS = { wide: [-10, -5, 0, 5, 10], narrow: [-10, -5, 0, 5, 10] };
const HEIGHT = { narrow: 220, wide: 260 } as const;
const CAP = 7;
const STROKE = 3;
/** The limit's label sits this far above its line, in px. */
const LABEL_LIFT = 12;

function xNameIn(names: readonly string[]): (v: number) => string {
  return (v) => {
    const name = Number.isInteger(v) ? names[v] : undefined;
    if (name === undefined) throw new RangeError(`framework: no metric at tick ${v}`);
    return name;
  };
}

/** The bounds and the limit as one sentence, for the announcement. */
function boundsText(v: FrameworkValues, text: FrameworkText): string {
  const locale = text.kit.locale;
  const bound = boundIn(locale);
  return sentenceText(text.result, {
    interval: `${bound(v.primaryLower)} ${text.to} ${bound(v.primaryUpper)}`,
    guardrail: bound(v.guardrailUpper),
    limit: limitIn(locale),
  });
}

/** The announcement: the decision and the bounds, as plain text. */
export function frameworkAnnouncement(v: FrameworkValues, text: FrameworkText = EN_FRAMEWORK): string {
  return `${text.decision[frameworkDecision(v)]}. ${boundsText(v, text)}`;
}

export function frameworkTable(v: FrameworkValues, text: FrameworkText = EN_FRAMEWORK): TableData {
  return {
    columns: [...text.table.columns],
    rows: [
      [text.table.rows[0], v.primaryLower],
      [text.table.rows[1], v.primaryUpper],
      [text.table.rows[2], v.guardrailUpper],
      [text.table.rows[3], GUARDRAIL_MARGIN],
    ],
    formats: ['number', 'signedPoints'],
    rowDigits: [1, 1, 1, 0],
    note: text.table.note,
    refs: FRAMEWORK_REFS,
  };
}

/**
 * One layout of the chart. The chart draws each layout itself (ChartFrame's `layout`), because the
 * narrow one names the metrics briefly and keeps only the short side words ("higher", "lower") in its
 * right margin: "no change" would be cut by the figure's edge at 320 px. The zero tick still marks
 * the line.
 */
function FrameworkFrame({ values: v, layout, text }: { values: FrameworkValues; layout: 'narrow' | 'wide'; text: FrameworkText }) {
  const decision = frameworkDecision(v);
  const narrow = layout === 'narrow';
  const locale = text.kit.locale;
  return (
    <ChartFrame
      id={`${FRAMEWORK_ID}-chart`}
      layout={layout}
      ariaLabel={text.chartName[decision]}
      x={{ domain: [-0.5, 1.5], ticks: { wide: [0, 1], narrow: [0, 1] }, format: xNameIn(narrow ? text.metricsNarrow : text.metrics), label: text.axis.x, refs: FRAMEWORK_REFS }}
      y={{
        domain: [-10, 10],
        ticks: Y_TICKS,
        format: (t) => formatSignedNumber(t, 0, { locale }),
        label: text.axis.y,
        refs: FRAMEWORK_REFS,
        zeroLabel: narrow ? undefined : text.zero.noChange,
        aboveLabel: text.zero.higher,
        belowLabel: text.zero.lower,
      }}
      height={HEIGHT}
      marks={() => null}
      overlays={(ctx) => {
        const limit = ctx.yPx(GUARDRAIL_MARGIN);
        const top = ctx.yPx(v.guardrailUpper);
        return (
          <>
            <line
              data-limit-line=""
              x1={pct(ctx.xFrac(0.5))}
              x2="100%"
              y1={limit}
              y2={limit}
              stroke="var(--color-muted)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <svg data-mark="" data-primary-interval="" x={pct(ctx.xFrac(0))} y={0} width={1} height={ctx.height} overflow="visible">
              <line x1={0} x2={0} y1={ctx.yPx(v.primaryUpper)} y2={ctx.yPx(v.primaryLower)} stroke="var(--color-series-1)" strokeWidth={STROKE} />
              {[v.primaryLower, v.primaryUpper].map((end, i) => (
                <line key={i} x1={-CAP} x2={CAP} y1={ctx.yPx(end)} y2={ctx.yPx(end)} stroke="var(--color-series-1)" strokeWidth={2} />
              ))}
            </svg>
            <svg data-mark="" data-guardrail-bound="" x={pct(ctx.xFrac(1))} y={0} width={1} height={ctx.height} overflow="visible">
              <line x1={0} x2={0} y1={top} y2={ctx.height} stroke="var(--color-series-1)" strokeWidth={2} strokeDasharray="2 4" />
              <line x1={-CAP} x2={CAP} y1={top} y2={top} stroke="var(--color-series-1)" strokeWidth={STROKE} />
            </svg>
          </>
        );
      }}
      // Right of the guardrail's column and above its dashed line, never on it.
      annotation={(ctx) => ({
        x: 1.12,
        y: GUARDRAIL_MARGIN + (20 * LABEL_LIFT) / ctx.height,
        text: fill(text.limit, { value: limitIn(locale) }),
        anchor: 'start',
        refs: FRAMEWORK_REFS,
      })}
    />
  );
}

export function FrameworkChart({ values, text = EN_FRAMEWORK }: { values: FrameworkValues; text?: FrameworkText }) {
  return (
    <>
      <div className="sm:hidden">
        <FrameworkFrame values={values} layout="narrow" text={text} />
      </div>
      <div className="max-sm:hidden">
        <FrameworkFrame values={values} layout="wide" text={text} />
      </div>
    </>
  );
}

/** The result line: the decision as a word, then the bounds. */
export function FrameworkResult({ values: v, text = EN_FRAMEWORK }: { values: FrameworkValues; text?: FrameworkText }) {
  const decision = frameworkDecision(v);
  const locale = text.kit.locale;
  const bound = boundIn(locale);
  return (
    <>
      <span data-framework-decision={decision} className={`font-semibold ${DECISION_TONE[decision]}`}>
        {text.decision[decision]}.
      </span>{' '}
      {sentenceNodes(text.result, {
        interval: (
          <span data-num="" {...SOURCE}>
            {bound(v.primaryLower)}
            {` ${text.to} `}
            {bound(v.primaryUpper)}
          </span>
        ),
        guardrail: (
          <span data-num="" {...SOURCE}>
            {bound(v.guardrailUpper)}
          </span>
        ),
        limit: (
          <span data-num="" {...SOURCE}>
            {limitIn(locale)}
          </span>
        ),
      })}
    </>
  );
}

/**
 * Thrown by the test seam's chart: a chart failure after a change, for the error fallback's tests.
 * Its body is exactly one throw with a literal message, the only shape the fault-seam guard accepts.
 */
function SeamFailure(): never {
  throw new Error('The ship-rule chart failed after a change (test seam)');
}

export type FrameworkFigureViewProps = {
  values: FrameworkValues;
  controls?: ReactNode;
  announcement?: string;
  /** The island passes false, so a chart failure shows the kit's sentence and the current table only. */
  preview?: ReactNode;
  /** A forced runtime state, for the kitchen sink and tests. */
  state?: FigureState;
  /**
   * Test seam, absent in production: with `changed`, the chart throws, so a test can see the error
   * fallback. The island forwards it unchanged; the server never sets it.
   */
  faultAfterChange?: true;
  /** Whether the visitor has changed a bound since the island loaded. */
  changed?: boolean;
  /** The Figure's words and the language of its numbers; English when absent. */
  text?: FrameworkText;
};

export function FrameworkFigureView({ values, controls, announcement, preview, state, faultAfterChange, changed, text = EN_FRAMEWORK }: FrameworkFigureViewProps) {
  return (
    <Figure
      id={FRAMEWORK_ID}
      title={text.title}
      text={labKit(text.kit)}
      state={state}
      provenance="simulated"
      table={frameworkTable(values, text)}
      controls={controls}
      announcement={announcement}
      preview={preview}
      result={<FrameworkResult values={values} text={text} />}
      caption={<>{text.caption}</>}
    >
      <FrameworkChart values={values} text={text} />
      {faultAfterChange && changed ? <SeamFailure /> : null}
    </Figure>
  );
}
