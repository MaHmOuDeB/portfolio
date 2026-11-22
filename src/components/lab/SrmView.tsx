// The split-check Figure, drawn from its two inputs: hypothetical visitor counts for groups A and B,
// each meant to get half the visitors. Shared and hook-free: the server draws the
// preset with it (the static HTML, also the no-JS view) and the island draws the reader's setting
// with the same markup.
//
// - Paired bars per group: the visitors who arrived filled, half of all visitors outlined, on one
//   count axis from zero. Two series, told apart by fill and outline as well as by the legend's words.
// - The result line states the flag as a word and the p-value in plain words, as how often a fair
//   coin leaves a gap this big or bigger; the chi-square statistic and the p-value itself are in the method row, where a flagged
//   p-value prints as below the threshold, never rounded up to it. With no visitors at all there is
//   no test and no inference: the line says so.
// - Every number is computed from the reader's values and marked 'simulated'.
import type { ReactNode } from 'react';
import { ChartFrame, MARK_UNITS, type PlotContext } from '@/components/kit/ChartFrame';
import { derivedAttr } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { formatNumber } from '@/lib/figure/format';
import { pct } from '@/lib/figure/scales';
import type { Locale } from '@/lib/i18n/locale';
import { labKit } from '@/lib/lab/text-common';
import { EN_SRM, type SrmText } from '@/lib/lab/text-srm';
import { sentenceNodes } from '@/lib/retention/sentence';
import { Exhibit, PhonePoint } from './Exhibit';
import {
  DIAGNOSTICS_REFS,
  SRM_ID,
  SRM_ODDS,
  SRM_PRESETS,
  SRM_SMALL_EXPECTED,
  SRM_THRESHOLD,
  chi2Text,
  normalizeSrm,
  pValueText,
  srmAxis,
  srmExpected,
  srmModel,
  srmResultText,
  srmSmallExpected,
  srmTable,
  type SrmDeps,
  type SrmResult,
  type SrmValues,
} from '@/lib/lab/diagnostics';

const SIMULATED = derivedAttr(DIAGNOSTICS_REFS);

/** A visitor count of the starting numbers, marked as the Figure marks its own. */
const startCount = (n: number, locale: Locale) => (
  <span data-num="" {...SIMULATED}>
    {formatNumber(n, 0, { locale })}
  </span>
);

/** The sentence above the Figure: the starting numbers, as the Figure draws them at its preset, and the one control to move. */
export function SrmLeadIn({ text = EN_SRM }: { text?: SrmText } = {}) {
  const { nA, nB } = SRM_PRESETS.default;
  const locale = text.kit.locale;
  return sentenceNodes(text.leadIn, { a: startCount(nA, locale), b: startCount(nB, locale) });
}

export const SRM_TAKEAWAY = EN_SRM.takeaway;

const GROUPS = ['A', 'B'] as const;
/** Each bar's width and the gap between a group's two bars, in groups (one group is one unit). */
const BAR = 0.28;
const GAP = 0.03;
const HEIGHT = { narrow: 200, wide: 240 } as const;
/** The group names' baseline under the plot, in px: the line the frame puts its x tick labels on. */
const GROUP_LABEL_BASELINE = 20;

/**
 * Thrown by the test seam's chart: a chart failure after a change, for the error fallback's tests.
 * Its body is exactly one throw with a literal message, the only shape the fault-seam guard accepts.
 */
function SrmSeamFailure(): never {
  throw new Error('The split chart failed after a change (test seam)');
}

function chartName(r: SrmResult, text: SrmText): string {
  if (r.kind === 'empty') return text.chartName.empty;
  return r.flagged ? text.chartName.flagged : text.chartName.ok;
}

export function SrmChart({ values, result, text = EN_SRM }: { values: SrmValues; result: SrmResult; text?: SrmText }) {
  const locale = text.kit.locale;
  const v = normalizeSrm(values);
  const e = srmExpected(v);
  const { top, ticks } = srmAxis(v);
  const bars = [
    { group: GROUPS[0], at: 0, observed: v.nA, expected: e.a },
    { group: GROUPS[1], at: 1, observed: v.nB, expected: e.b },
  ];
  const marks = (ctx: PlotContext) =>
    bars.flatMap((b) => {
      const rect = (series: 'observed' | 'expected', from: number, value: number) => {
        const x0 = ctx.xFrac(from) * MARK_UNITS;
        const x1 = ctx.xFrac(from + BAR) * MARK_UNITS;
        const y = ctx.yPx(value);
        const observed = series === 'observed';
        return (
          <rect
            key={`${b.group}-${series}`}
            data-mark=""
            data-series={series}
            data-group={b.group}
            data-value={value}
            x={x0}
            width={x1 - x0}
            y={y}
            height={Math.max(0, ctx.yPx(0) - y)}
            fill={observed ? 'var(--color-series-1)' : 'var(--color-bg)'}
            stroke={observed ? 'none' : 'var(--color-series-1)'}
            strokeWidth={observed ? 0 : 2}
          />
        );
      };
      return [rect('observed', b.at - GAP / 2 - BAR, b.observed), rect('expected', b.at + GAP / 2, b.expected)];
    });
  return (
    <ChartFrame
      id={`${SRM_ID}-chart`}
      ariaLabel={chartName(result, text)}
      // No kit ticks on x: the frame anchors its first and last tick at their start and end, which
      // would put "Group A" and "Group B" off their bars. The names are drawn centred under each pair
      // in the overlay instead, on the tick line, below the baseline and clear of every mark.
      x={{
        domain: [-0.5, 1.5],
        ticks: { narrow: [], wide: [] },
        format: (i) => formatNumber(i, 0, { locale }),
        label: text.axis.x,
        refs: DIAGNOSTICS_REFS,
      }}
      y={{
        domain: [0, top],
        ticks,
        format: (t) => formatNumber(t, 0, { locale }),
        label: text.axis.y,
        refs: DIAGNOSTICS_REFS,
      }}
      height={HEIGHT}
      marks={marks}
      overlays={(ctx: PlotContext) =>
        bars.map((b) => (
          <text
            key={b.group}
            data-group-label={b.group}
            className="text-xs fill-muted"
            x={pct(ctx.xFrac(b.at))}
            y={ctx.height + GROUP_LABEL_BASELINE}
            textAnchor="middle"
          >
            {sentenceNodes(text.groupLabel, { group: b.group })}
          </text>
        ))
      }
    />
  );
}

/** The legend: the two series in words, each with its swatch. */
function Legend({ text }: { text: SrmText }) {
  const swatch = (observed: boolean) => (
    <svg aria-hidden="true" width="16" height="12" className="shrink-0">
      <rect
        x="1"
        y="1"
        width="14"
        height="10"
        fill={observed ? 'var(--color-series-1)' : 'var(--color-bg)'}
        stroke="var(--color-series-1)"
        strokeWidth="2"
      />
    </svg>
  );
  return (
    <ul data-srm-legend="" className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
      <li className="flex items-center gap-2">
        {swatch(true)}
        {text.legend.observed}
      </li>
      <li className="flex items-center gap-2">
        {swatch(false)}
        {text.legend.expected}
      </li>
    </ul>
  );
}

/** The result line as plain text: the announcement, and what the view prints. */
export const srmPlainText = srmResultText;

/** A number of the result line or the method row, marked as the Figure marks its own. */
const num = (text: string, mark?: string) => (
  <span {...(mark ? { [mark]: '' } : {})} data-num="" {...SIMULATED}>
    {text}
  </span>
);

/**
 * The result line: the flag as a word, then how often a fair coin leaves a gap this big; a rough-check
 * warning with few visitors; nothing to check without visitors.
 */
export function SrmResultLine({ values, result, text = EN_SRM }: { values: SrmValues; result: SrmResult; text?: SrmText }) {
  if (result.kind === 'empty') return <>{text.empty}</>;
  const odds = sentenceNodes(text.odds, { one: num('1'), n: num(formatNumber(SRM_ODDS, 0, { locale: text.kit.locale })) });
  return (
    <>
      <span data-srm-status="" className={`font-semibold ${result.flagged ? 'text-warn' : 'text-ok'}`}>
        {result.flagged ? text.status.flagged : text.status.ok}
      </span>
      :{' '}
      {sentenceNodes(result.flagged ? text.verdict.flagged : text.verdict.ok, { odds })}
      {srmSmallExpected(values) ? (
        <>
          {' '}
          <span data-srm-small="">{text.smallNote}</span>
        </>
      ) : null}
    </>
  );
}

export type SrmFigureViewProps = {
  values: SrmValues;
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
  /** The statistics, injectable for tests; srmTest by default. */
  deps?: SrmDeps;
  /** The Figure's words and the language of its numbers; English when absent. */
  text?: SrmText;
};

export function SrmFigureView({ values, controls, announcement, preview, faultAfterChange, changed, deps, text = EN_SRM }: SrmFigureViewProps) {
  const v = normalizeSrm(values);
  const result = srmModel(v, deps);
  const locale = text.kit.locale;
  const figure = (
    <Figure
      id={SRM_ID}
      title={text.title}
      text={labKit(text.kit)}
      provenance="simulated"
      table={srmTable(v, text)}
      lead={<PhonePoint label={text.exhibit.takeaway}>{text.takeaway}</PhonePoint>}
      controls={controls}
      announcement={announcement}
      preview={preview}
      result={<SrmResultLine values={v} result={result} text={text} />}
      caption={<>{text.caption}</>}
    >
      <SrmChart values={v} result={result} text={text} />
      <Legend text={text} />
      {faultAfterChange && changed ? <SrmSeamFailure /> : null}
    </Figure>
  );
  return (
    <Exhibit
      summary={text.summary}
      leadIn={<SrmLeadIn text={text} />}
      takeaway={text.takeaway}
      labels={text.exhibit}
      method={
        <>
          <p data-method-terms="">
            {sentenceNodes(text.terms, { term: <strong className="font-semibold">{text.term}</strong> })}
          </p>
          <p data-method-text="">
            {sentenceNodes(text.method, {
              threshold: <span {...SIMULATED}>{formatNumber(SRM_THRESHOLD, undefined, { locale })}</span>,
              small: <span {...SIMULATED}>{formatNumber(SRM_SMALL_EXPECTED, undefined, { locale })}</span>,
            })}
            {result.kind === 'result'
              ? sentenceNodes(text.setting, {
                  chi2: num(chi2Text(result.chi2, locale), 'data-srm-chi2'),
                  p: (
                    <span data-srm-p="" {...SIMULATED}>
                      {pValueText(result, text)}
                    </span>
                  ),
                })
              : null}
          </p>
        </>
      }
    >
      {figure}
    </Exhibit>
  );
}
