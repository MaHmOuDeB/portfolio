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
import { labKit } from '@/lib/lab/text-common';
import { EN_CURSE, type CurseText } from '@/lib/lab/text-curse';
import { sentenceNodes } from '@/lib/retention/sentence';
import { Exhibit, PhonePoint } from './Exhibit';
import {
  CURSE_ALPHA,
  CURSE_HEIGHT,
  CURSE_ID,
  CURSE_SCHEMA,
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

export const CURSE_LEAD_IN = EN_CURSE.leadIn;

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
export const CURSE_TAKEAWAY = EN_CURSE.takeaway;

export const CURSE_X_LABEL = EN_CURSE.labels.power;
export const CURSE_Y_LABEL = EN_CURSE.axis.y;

/**
 * Thrown by the test seam's chart: a chart failure after a change, for the error fallback's tests.
 * Its body is exactly one throw with a literal message, the only shape the fault-seam guard accepts.
 */
function CurseSeamFailure(): never {
  throw new Error('The exaggeration chart failed after a change (test seam)');
}

function chartName(result: CurseResult, text: CurseText): string {
  return result.kind === 'unbounded' ? text.chartName.unbounded : text.chartName.result;
}

export function CurseChart({
  result,
  points,
  selected,
  text = EN_CURSE,
}: {
  result: CurseResult;
  points: readonly CurvePoint[];
  selected: CurvePoint | null;
  text?: CurseText;
}) {
  const locale = text.kit.locale;
  const { domain, ticks } = curseAxis(points, selected);
  return (
    <ChartFrame
      id={`${CURSE_ID}-chart`}
      ariaLabel={chartName(result, text)}
      x={{
        domain: [CURSE_SCHEMA.power.min, CURSE_SCHEMA.power.max],
        ticks: CURSE_X_TICKS,
        format: (power) => powerTick(power, text),
        label: text.labels.power,
        refs: DIAGNOSTICS_REFS,
      }}
      y={{
        domain,
        ticks,
        format: (v) => exaggerationTick(v, locale),
        label: text.axis.y,
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
  const numeric = /^[\d.,%\u00a0]+$/.test(text);
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
export function CurseReadout({ result, text = EN_CURSE }: { result: CurseResult; text?: CurseText }) {
  const locale = text.kit.locale;
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
            <Value name="exaggeration" text={formatExaggeration(result.exaggeration, locale)} />
            {text.times}
          </>,
          <Value key="s" name="wrong-sign" text={formatWrongSign(result.typeS, text)} />,
        ]
      : [text.noValue, text.notShown];
  return (
    <dl data-curse-readout="" data-curse-branch={result.kind} className="mb-4 grid gap-4 xs:grid-cols-2">
      {item(text.labels.exaggeration, values[0])}
      {item(text.labels.wrongSign, values[1])}
    </dl>
  );
}

/** The result line, the same words as curseResultText with each number marked. */
export function CurseResultLine({ result, text = EN_CURSE }: { result: CurseResult; text?: CurseText }) {
  if (result.kind === 'unbounded') return <>{text.unbounded}</>;
  return sentenceNodes(text.result, {
    x: num(formatExaggeration(result.exaggeration, text.kit.locale)),
    wrong: <span {...SIMULATED}>{formatWrongSign(result.typeS, text)}</span>,
  });
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
  /** The Figure's words and the language of its numbers; English when absent. */
  text?: CurseText;
};

export function CurseFigureView({ values, controls, announcement, preview, faultAfterChange, changed, deps, text = EN_CURSE }: CurseFigureViewProps) {
  const locale = text.kit.locale;
  const v = normalizeCurse(values);
  const result = curseModel(v, deps);
  const curve = curseCurve(v, deps);
  const ratio = result.kind === 'result' ? result.ratio : null;
  // The dot is the model's own datum: drawn only when the model has a finite result.
  const selected = result.kind === 'result' ? curve.selected : null;
  const takeaway = text.takeaway;
  const figure = (
    <Figure
      id={CURSE_ID}
      title={text.title}
      text={labKit(text.kit)}
      provenance="simulated"
      table={curseTable(v, deps, text)}
      lead={<PhonePoint label={text.exhibit.takeaway}>{takeaway}</PhonePoint>}
      controls={controls}
      announcement={announcement}
      preview={preview}
      result={<CurseResultLine result={result} text={text} />}
      caption={<>{text.caption}</>}
    >
      <CurseReadout result={result} text={text} />
      <CurseChart result={result} points={curve.points} selected={selected} text={text} />
      {faultAfterChange && changed ? <CurseSeamFailure /> : null}
    </Figure>
  );
  return (
    <Exhibit
      summary={text.summary}
      leadIn={text.leadIn}
      takeaway={takeaway}
      labels={text.exhibit}
      method={
        <>
          <p data-method-terms="">
            {sentenceNodes(text.terms, { term: <strong className="font-semibold">{text.term}</strong> })}
          </p>
          <p data-method-text="">
            {sentenceNodes(text.method, {
              alpha: <span {...SIMULATED}>{formatNumber(CURSE_ALPHA, undefined, { locale })}</span>,
              ratioPart:
                ratio !== null ? sentenceNodes(text.ratioPart, { ratio: num(formatNumber(ratio, 2, { fixed: true, locale })) }) : null,
              min: <span {...SIMULATED}>{formatPower(CURSE_SCHEMA.power.min, text)}</span>,
              max: <span {...SIMULATED}>{formatPower(CURSE_SCHEMA.power.max, text)}</span>,
            })}
          </p>
        </>
      }
    >
      {figure}
    </Exhibit>
  );
}
