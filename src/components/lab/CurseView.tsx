// The exaggeration Figure (the winner's curse), drawn from one input: how often a test clears the
// bar, its power, at a fixed two-sided significance level. Shared and hook-free: the server draws the
// preset with it (the static HTML, also the no-JS view) and the island draws the reader's setting
// with the same markup.
//
// - The readout gives the exaggeration among results that clear the bar and the wrong-sign rate
//   among them, from retrodesign at the ratio of effect to standard error the power implies; the
//   table row of the current power uses the same words.
// - The chart is the exaggeration at every power the slider reaches, on linear axes, with the
//   current power's own datum as an orange dot with a bg ring. A non-finite result is words only.
// - Every number is computed from the reader's value and marked 'simulated'.
import type { ReactNode } from 'react';
import { ChartFrame, MARK_UNITS, type PlotContext } from '@/components/kit/ChartFrame';
import { derivedAttr } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { formatNumber } from '@/lib/figure/format';
import { pct } from '@/lib/figure/scales';
import { Exhibit, PhonePoint } from './Exhibit';
import {
  CURSE_ALPHA,
  CURSE_HEIGHT,
  CURSE_ID,
  CURSE_LABELS,
  CURSE_SCHEMA,
  CURSE_TITLE,
  CURSE_UNBOUNDED,
  CURSE_X_TICKS,
  DIAGNOSTICS_REFS,
  DOT_RADIUS,
  DOT_RING,
  curseAxis,
  curseY,
  exaggerationTick,
  curseCurve,
  curseModel,
  curseTable,
  formatExaggeration,
  formatPower,
  formatWrongSign,
  normalizeCurse,
  powerTick,
  type CurseDeps,
  type CurseResult,
  type CurvePoint,
  type CurseValues,
} from '@/lib/lab/diagnostics';

const SIMULATED = derivedAttr(DIAGNOSTICS_REFS);

export const CURSE_LEAD_IN = 'Drag the slider right, toward a bigger test. Watch the wins shrink toward the real effect.';

/** A number of the result line or the method row, marked as the Figure marks its own. */
const num = (text: string) => (
  <span data-num="" {...SIMULATED}>
    {text}
  </span>
);

/**
 * The sentence below the Figure: what I do about it, the same at every setting, so it quotes no
 * number. The result line above it carries the setting's numbers.
 */
export const CURSE_TAKEAWAY =
  'A forecast built on a win like this would overpromise. So I treat a surprising win from a small test as a lead. I test it again at full size before anyone plans on that number.';

export const CURSE_X_LABEL = CURSE_LABELS.power;
export const CURSE_Y_LABEL = 'Times the real effect';

/**
 * Thrown by the test seam's chart: a chart failure after a change, for the error fallback's tests.
 * Its body is exactly one throw with a literal message, the only shape the fault-seam guard accepts.
 */
function CurseSeamFailure(): never {
  throw new Error('The exaggeration chart failed after a change (test seam)');
}

function chartName(result: CurseResult): string {
  const base =
    'How many times the real effect the results that clear the bar report, against how often the test clears the bar: large for a test that rarely clears it and close to the real effect for one that nearly always does';
  if (result.kind === 'unbounded') return `${base}, with no setting marked, because this setting has no finite answer`;
  return `${base}, with your setting marked`;
}

export function CurseChart({ result, points, selected }: { result: CurseResult; points: readonly CurvePoint[]; selected: CurvePoint | null }) {
  const { domain, ticks } = curseAxis(points, selected);
  return (
    <ChartFrame
      id={`${CURSE_ID}-chart`}
      ariaLabel={chartName(result)}
      x={{
        domain: [CURSE_SCHEMA.power.min, CURSE_SCHEMA.power.max],
        ticks: CURSE_X_TICKS,
        format: powerTick,
        label: CURSE_X_LABEL,
        refs: DIAGNOSTICS_REFS,
      }}
      y={{
        domain,
        ticks,
        format: exaggerationTick,
        label: CURSE_Y_LABEL,
        refs: DIAGNOSTICS_REFS,
      }}
      height={CURSE_HEIGHT}
      marks={(ctx: PlotContext) =>
        points.length > 1 ? (
          <polyline
            data-mark=""
            data-curse-line=""
            points={points.map((p) => `${ctx.xFrac(p.power) * MARK_UNITS},${ctx.yPx(curseY(p.exaggeration))}`).join(' ')}
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
            data-power={selected.power}
            data-ratio={selected.ratio}
            data-exaggeration={selected.exaggeration}
            cx={pct(ctx.xFrac(selected.power))}
            cy={ctx.yPx(curseY(selected.exaggeration))}
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

/** A readout value, marked as a number only when it is one ("0.9%", not "below 0.1%"). */
function Value({ name, text }: { name: string; text: string }) {
  const numeric = /^[\d.,%]+$/.test(text);
  return (
    <span {...{ [`data-curse-${name}`]: '' }} {...(numeric ? { 'data-num': '' } : {})} {...SIMULATED}>
      {text}
    </span>
  );
}

/**
 * The exaggeration and the wrong-sign rate, large: the point of the check first. The same two items
 * in every branch, words in place of numbers for an unbounded result, so the readout keeps its height
 * when a shared URL swaps the preset preview for that branch.
 */
export function CurseReadout({ result }: { result: CurseResult }) {
  const item = (label: string, value: ReactNode) => (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold">{value}</dd>
    </div>
  );
  const values: [ReactNode, ReactNode] =
    result.kind === 'result'
      ? [
          <>
            <Value name="exaggeration" text={formatExaggeration(result.exaggeration)} /> times
          </>,
          <Value key="s" name="wrong-sign" text={formatWrongSign(result.typeS)} />,
        ]
      : ['no finite value', 'not shown'];
  return (
    <dl data-curse-readout="" data-curse-branch={result.kind} className="mb-4 grid gap-4 xs:grid-cols-2">
      {item(CURSE_LABELS.exaggeration, values[0])}
      {item(CURSE_LABELS.wrongSign, values[1])}
    </dl>
  );
}

/** The result line, the same words as curseResultText with each number marked. */
export function CurseResultLine({ result }: { result: CurseResult }) {
  if (result.kind === 'unbounded') return <>{CURSE_UNBOUNDED}</>;
  return (
    <>
      At this setting, results that clear the bar average {num(formatExaggeration(result.exaggeration))} times the real
      effect. Of those, <span {...SIMULATED}>{formatWrongSign(result.typeS)}</span> point the wrong way.
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
  const ratio = result.kind === 'result' ? result.ratio : null;
  // The dot is the model's own datum: drawn only when the model has a finite result.
  const selected = result.kind === 'result' ? curve.selected : null;
  const takeaway = CURSE_TAKEAWAY;
  const figure = (
    <Figure
      id={CURSE_ID}
      title={CURSE_TITLE}
      provenance="simulated"
      table={curseTable(v, deps)}
      lead={<PhonePoint>{takeaway}</PhonePoint>}
      controls={controls}
      announcement={announcement}
      preview={preview}
      result={<CurseResultLine result={result} />}
      caption={<>An exact calculation on made-up values, with no random draws.</>}
    >
      <CurseReadout result={result} />
      <CurseChart result={result} points={curve.points} selected={selected} />
      {faultAfterChange && changed ? <CurseSeamFailure /> : null}
    </Figure>
  );
  return (
    <Exhibit
      summary="How the overstatement is calculated"
      leadIn={CURSE_LEAD_IN}
      takeaway={takeaway}
      method={
        <>
          <p data-method-terms="">
            <strong className="font-semibold">Winner&apos;s curse (type M error)</strong>: a result that clears the bar
            overstates the effect on average when the test is too small to see it reliably; Gelman and Carlin call the
            overstatement the exaggeration ratio, or type M (magnitude) error.
          </p>
          <p data-method-text="">
            A study estimates a true effect, and its estimate is normally distributed around that effect with a known
            standard error, both in the same arbitrary units; the test is two-sided at a significance level of{' '}
            <span {...SIMULATED}>{formatNumber(CURSE_ALPHA)}</span>. Power is the chance that the estimate clears that
            bar, and it fixes the ratio of the true effect to its standard error
            {ratio !== null ? (
              <>
                : your setting is a ratio of {num(formatNumber(ratio, 2, { fixed: true }))}
              </>
            ) : null}
            . The other two numbers describe only the estimates that clear the bar: how many have the wrong sign, and how
            large they are on average against the true effect. Reporting only those is the selection that creates the
            exaggeration. The line shows the exaggeration at every power from{' '}
            <span {...SIMULATED}>{formatPower(CURSE_SCHEMA.power.min)}</span> to{' '}
            <span {...SIMULATED}>{formatPower(CURSE_SCHEMA.power.max)}</span>, and the dot is your setting. These are Gelman
            and Carlin&apos;s retrodesign formulas; they assume independent observations and a known standard error, and
            they guarantee no business outcome.
          </p>
        </>
      }
    >
      {figure}
    </Exhibit>
  );
}
