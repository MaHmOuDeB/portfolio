// The exaggeration Figure, drawn from its two inputs: a hypothetical true effect and the standard
// error of its estimate, in the same arbitrary units, at a fixed two-sided significance level.
// Shared and hook-free: the server draws the preset with it (the static HTML, also the no-JS view)
// and the island draws the reader's setting with the same markup.
//
// - The readout gives power, the wrong-sign rate among significant estimates and the exaggeration
//   among them, from retrodesign; the table row of the current ratio uses the same words.
// - The chart is the analytic exaggeration over every reachable ratio of effect to standard error, on
//   a log10 x-axis, with the current ratio's own datum as an orange dot with a bg ring. A zero
//   effect has no dot and is never put through the logarithm; a non-finite result is words only.
// - Every number is computed from the reader's values and marked 'simulated'.
import type { ReactNode } from 'react';
import { ChartFrame, MARK_UNITS, type PlotContext } from '@/components/kit/ChartFrame';
import { derivedAttr } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { formatNumber } from '@/lib/figure/format';
import { pct } from '@/lib/figure/scales';
import {
  CURSE_ALPHA,
  CURSE_HEIGHT,
  CURSE_ID,
  CURSE_TITLE,
  CURSE_UNBOUNDED,
  CURSE_X_TICKS,
  CURSE_ZERO,
  DIAGNOSTICS_REFS,
  DOT_RADIUS,
  DOT_RING,
  RATIO_MAX,
  RATIO_MIN,
  curseAxis,
  curseCurve,
  curseModel,
  curseRatio,
  curseTable,
  formatExaggeration,
  formatPower,
  formatWrongSign,
  normalizeCurse,
  ratioTick,
  unitsText,
  type CurseDeps,
  type CurseResult,
  type CurseValues,
  type CurvePoint,
} from '@/lib/lab/diagnostics';

const SIMULATED = derivedAttr(DIAGNOSTICS_REFS);
export const CURSE_X_LABEL = 'True effect ÷ standard error (log scale)';

/**
 * Thrown by the test seam's chart: a chart failure after a change, for the error fallback's tests.
 * Its body is exactly one throw with a literal message, the only shape the fault-seam guard accepts.
 */
function CurseSeamFailure(): never {
  throw new Error('The exaggeration chart failed after a change (test seam)');
}

function chartName(result: CurseResult): string {
  const base = 'Exaggeration among significant estimates against the ratio of true effect to standard error, on a log scale: large for small ratios and close to none for large ones';
  if (result.kind === 'zero-effect') return `${base}, with no setting marked, because the true effect is zero`;
  if (result.kind === 'unbounded') return `${base}, with no setting marked, because this setting has no finite value`;
  return `${base}, with your setting marked`;
}

export function CurseChart({ result, points, selected }: { result: CurseResult; points: readonly CurvePoint[]; selected: CurvePoint | null }) {
  const { top, ticks } = curseAxis(points, selected);
  return (
    <ChartFrame
      id={`${CURSE_ID}-chart`}
      ariaLabel={chartName(result)}
      x={{
        domain: [Math.log10(RATIO_MIN), Math.log10(RATIO_MAX)],
        ticks: { narrow: CURSE_X_TICKS, wide: CURSE_X_TICKS },
        format: ratioTick,
        label: CURSE_X_LABEL,
        refs: DIAGNOSTICS_REFS,
      }}
      y={{
        domain: [0, top],
        ticks,
        format: (v) => formatNumber(v, 0),
        label: 'Exaggeration (times the true effect)',
        refs: DIAGNOSTICS_REFS,
      }}
      height={CURSE_HEIGHT}
      marks={(ctx: PlotContext) =>
        points.length > 1 ? (
          <polyline
            data-mark=""
            data-curse-line=""
            points={points.map((p) => `${ctx.xFrac(p.x) * MARK_UNITS},${ctx.yPx(p.exaggeration)}`).join(' ')}
            fill="none"
            stroke="var(--color-series-1)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        ) : null
      }
      overlays={(ctx: PlotContext) =>
        selected ? (
          <circle
            data-mark=""
            data-curse-dot=""
            data-ratio={selected.ratio}
            data-exaggeration={selected.exaggeration}
            cx={pct(ctx.xFrac(selected.x))}
            cy={ctx.yPx(selected.exaggeration)}
            r={DOT_RADIUS}
            fill="var(--color-series-2)"
            stroke="var(--color-bg)"
            strokeWidth={2 * DOT_RING}
            paintOrder="stroke"
          />
        ) : null
      }
    />
  );
}

/** A readout value, marked as a number only when it is one ("17%", not "below 0.1%"). */
function Value({ name, text }: { name: string; text: string }) {
  const numeric = /^[\d.,%]+$/.test(text);
  return (
    <span {...{ [`data-curse-${name}`]: '' }} {...(numeric ? { 'data-num': '' } : {})} {...SIMULATED}>
      {text}
    </span>
  );
}

/**
 * Power, the wrong-sign rate and exaggeration, large. The same three items in every branch, words in
 * place of numbers for a zero effect and an unbounded result, so the readout keeps its height when a
 * shared URL swaps the preset preview for one of those branches.
 */
export function CurseReadout({ result }: { result: CurseResult }) {
  const item = (label: string, value: ReactNode) => (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold">{value}</dd>
    </div>
  );
  const values: [ReactNode, ReactNode, ReactNode] =
    result.kind === 'result'
      ? [
          <Value key="p" name="power" text={formatPower(result.power)} />,
          <Value key="s" name="wrong-sign" text={formatWrongSign(result.typeS)} />,
          <>
            <Value name="exaggeration" text={formatExaggeration(result.exaggeration)} /> times
          </>,
        ]
      : result.kind === 'zero-effect'
        ? ['not shown', 'undefined', 'undefined']
        : ['not shown', 'not shown', 'no finite value'];
  return (
    <dl data-curse-readout="" data-curse-branch={result.kind} className="mb-4 grid gap-4 xs:grid-cols-3">
      {item('Power', values[0])}
      {item('Wrong sign, among significant estimates', values[1])}
      {item('Exaggeration, among significant estimates', values[2])}
    </dl>
  );
}

/** The result line, the same words as curseResultText with each number marked. */
export function CurseResultLine({ values, result }: { values: CurseValues; result: CurseResult }) {
  if (result.kind === 'zero-effect') return <>{CURSE_ZERO}</>;
  if (result.kind === 'unbounded') return <>{CURSE_UNBOUNDED}</>;
  const n = (s: string) => (
    <span data-num="" {...SIMULATED}>
      {s}
    </span>
  );
  return (
    <>
      At a true effect of {n(unitsText(values.trueEffect))} and a standard error of {n(unitsText(values.se))}, a ratio of{' '}
      {n(formatNumber(curseRatio(values)))}, power is <span {...SIMULATED}>{formatPower(result.power)}</span>. Of the estimates
      that pass the threshold, <span {...SIMULATED}>{formatWrongSign(result.typeS)}</span> have the wrong sign, and on average
      their size is {n(formatExaggeration(result.exaggeration))} times the true effect.
    </>
  );
}

export type CurseFigureViewProps = {
  values: CurseValues;
  controls?: ReactNode;
  announcement?: string;
  /** The island passes false, so a chart failure shows the kit's sentence and the current table only. */
  preview?: ReactNode;
  /**
   * Test seam, absent in production: with `changed`, the chart throws, so a test can see the error
   * fallback. The island forwards it unchanged; the server never sets it.
   */
  faultAfterChange?: true;
  /** Whether the reader has changed a value since the island loaded. */
  changed?: boolean;
  /** The statistics, injectable for tests; retrodesign by default. */
  deps?: CurseDeps;
};

export function CurseFigureView({ values, controls, announcement, preview, faultAfterChange, changed, deps }: CurseFigureViewProps) {
  const v = normalizeCurse(values);
  const result = curseModel(v, deps);
  const curve = curseCurve(v, deps);
  // The dot is the model's own datum: drawn only when the model has a finite result.
  const selected = result.kind === 'result' ? curve.selected : null;
  return (
    <Figure
      id={CURSE_ID}
      title={CURSE_TITLE}
      provenance="simulated"
      table={curseTable(v, deps)}
      controls={controls}
      announcement={announcement}
      preview={preview}
      result={<CurseResultLine values={v} result={result} />}
      caption={
        <>
          An exact calculation from Gelman and Carlin’s retrodesign formulas on hypothetical values you set; no random
          draws are involved. A study estimates a true effect, and its estimate is normally distributed around that effect with the standard error you set, both in the same
          arbitrary units; the test is two-sided at a significance level of{' '}
          <span {...SIMULATED}>{formatNumber(CURSE_ALPHA)}</span>. Power is the chance that the estimate passes that
          threshold. The other two numbers describe only the estimates that pass the threshold: how many have the wrong
          sign, and how large they are on average against the true effect. Reporting only those is the selection that
          creates the exaggeration. The line shows the exaggeration at every ratio of true effect to standard error from{' '}
          <span {...SIMULATED}>{formatNumber(RATIO_MIN)}</span> to <span {...SIMULATED}>{formatNumber(RATIO_MAX)}</span>{' '}
          on a logarithmic axis, and the dot is your setting. The calculation assumes independent observations and a
          known standard error, and it guarantees no business outcome.
        </>
      }
    >
      <CurseReadout result={result} />
      <CurseChart result={result} points={curve.points} selected={selected} />
      {faultAfterChange && changed ? <CurseSeamFailure /> : null}
    </Figure>
  );
}
