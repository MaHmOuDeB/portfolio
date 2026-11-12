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
import { formatSignedNumber, formatSignedPoints } from '@/lib/figure/format';
import { pct } from '@/lib/figure/scales';
import type { FigureState } from '@/lib/figure/states';

export const FRAMEWORK_REFS: readonly DerivedRef[] = ['simulated'];
const SOURCE = derivedAttr(FRAMEWORK_REFS);

export const FRAMEWORK_TITLE = 'Where the two intervals fall decides the call';

export const DECISION_LABEL: Record<FrameworkDecision, string> = {
  ship: 'Ship: the main metric rose, guardrail intact',
  'ship-neutral': 'May ship: neutral on the main metric, guardrail intact',
  harm: 'Stop: the main metric fell',
  hold: 'Hold: the guardrail moved past its limit',
};

/** The colour that repeats the decision word: never the only signal. */
const DECISION_TONE: Record<FrameworkDecision, string> = {
  ship: 'text-ok',
  'ship-neutral': 'text-ok',
  harm: 'text-warn',
  hold: 'text-warn',
};

const CHART_NAME: Record<FrameworkDecision, string> = {
  ship: "The main metric's interval lies above zero and the guardrail's upper end is within its limit",
  'ship-neutral': "The main metric's interval reaches zero and the guardrail's upper end is within its limit",
  harm: "The main metric's interval lies below zero",
  hold: "The guardrail's upper end is past its limit",
};

/** Bounds print with one decimal, the grid's step; the limit is a whole number. */
const bound = (v: number) => formatSignedPoints(v, 1);
const limitText = () => formatSignedNumber(GUARDRAIL_MARGIN, 1);

const X_NAMES = ['Session completion', 'Help requests'] as const;
const Y_TICKS = { wide: [-10, -5, 0, 5, 10], narrow: [-10, -5, 0, 5, 10] };
const HEIGHT = { narrow: 220, wide: 260 } as const;
const CAP = 7;
const STROKE = 3;
/** The limit's label sits this far above its line, in px. */
const LABEL_LIFT = 12;

function xName(v: number): string {
  const name = Number.isInteger(v) ? X_NAMES[v] : undefined;
  if (name === undefined) throw new RangeError(`framework: no metric at tick ${v}`);
  return name;
}

/** The bounds and the limit as one sentence, for the result line and the announcement. */
function boundsText(v: FrameworkValues): string {
  return `Session completion: ${bound(v.primaryLower)} to ${bound(v.primaryUpper)} points; help requests: at most ${bound(v.guardrailUpper)} points, against a limit of ${limitText()}.`;
}

/** The announcement: the decision and the bounds, as plain text. */
export function frameworkAnnouncement(v: FrameworkValues): string {
  return `${DECISION_LABEL[frameworkDecision(v)]}. ${boundsText(v)}`;
}

export function frameworkTable(v: FrameworkValues): TableData {
  return {
    columns: ['Bound', 'Points'],
    rows: [
      ['Session completion, lower end', v.primaryLower],
      ['Session completion, upper end', v.primaryUpper],
      ['Help requests, upper end', v.guardrailUpper],
      ['Help requests, limit', GUARDRAIL_MARGIN],
    ],
    formats: ['number', 'signedPoints'],
    rowDigits: [1, 1, 1, 0],
    note: 'Points are percentage points. Every value is made up.',
    refs: FRAMEWORK_REFS,
  };
}

export function FrameworkChart({ values: v }: { values: FrameworkValues }) {
  const decision = frameworkDecision(v);
  return (
    <ChartFrame
      id={`${FRAMEWORK_ID}-chart`}
      ariaLabel={CHART_NAME[decision]}
      x={{ domain: [-0.5, 1.5], ticks: { wide: [0, 1], narrow: [0, 1] }, format: xName, label: 'Metric', refs: FRAMEWORK_REFS }}
      y={{
        domain: [-10, 10],
        ticks: Y_TICKS,
        format: (t) => formatSignedNumber(t, 0),
        label: 'Change (percentage points)',
        refs: FRAMEWORK_REFS,
        zeroLabel: 'no change',
        aboveLabel: 'higher',
        belowLabel: 'lower',
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
        text: `Limit ${limitText()}`,
        anchor: 'start',
        refs: FRAMEWORK_REFS,
      })}
    />
  );
}

/** The result line: the decision as a word, then the bounds. */
export function FrameworkResult({ values: v }: { values: FrameworkValues }) {
  const decision = frameworkDecision(v);
  return (
    <>
      <span data-framework-decision={decision} className={`font-semibold ${DECISION_TONE[decision]}`}>
        {DECISION_LABEL[decision]}.
      </span>{' '}
      Session completion:{' '}
      <span data-num="" {...SOURCE}>
        {bound(v.primaryLower)} to {bound(v.primaryUpper)}
      </span>{' '}
      points; help requests: at most{' '}
      <span data-num="" {...SOURCE}>
        {bound(v.guardrailUpper)}
      </span>{' '}
      points, against a limit of{' '}
      <span data-num="" {...SOURCE}>
        {limitText()}
      </span>
      .
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
};

export function FrameworkFigureView({ values, controls, announcement, preview, state, faultAfterChange, changed }: FrameworkFigureViewProps) {
  return (
    <Figure
      id={FRAMEWORK_ID}
      title={FRAMEWORK_TITLE}
      state={state}
      provenance="simulated"
      table={frameworkTable(values)}
      controls={controls}
      announcement={announcement}
      preview={preview}
      result={<FrameworkResult values={values} />}
      caption={
        <>
          Chapter Club, session completion and help requests are made up. The interval ends are typed in, not estimated
          from observations: no data, test or sample is behind them. A rise in help requests is bad, so the guardrail is
          drawn by its upper end only, and the dashed line is its limit.
        </>
      }
    >
      <FrameworkChart values={values} />
      {faultAfterChange && changed ? <SeamFailure /> : null}
    </Figure>
  );
}
