// The split-check Figure, drawn from its three inputs: hypothetical visitor counts for groups A and B
// and the share of visitors group A was meant to get. Shared and hook-free: the server draws the
// preset with it (the static HTML, also the no-JS view) and the island draws the reader's setting
// with the same markup.
//
// - Paired bars per group: observed visitors filled, expected visitors outlined, on one count axis
//   from zero. Two series, told apart by fill and outline as well as by the legend's words.
// - The result line states the chi-square statistic, the p-value and the flag as a word. A flagged
//   p-value prints as below the threshold, never rounded up to it. With no visitors at all there is
//   no test and no inference: the line says so.
// - Every number is computed from the reader's values and marked 'simulated'.
import type { ReactNode } from 'react';
import { ChartFrame, MARK_UNITS, type PlotContext } from '@/components/kit/ChartFrame';
import { derivedAttr } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { formatNumber } from '@/lib/figure/format';
import { pct } from '@/lib/figure/scales';
import {
  DIAGNOSTICS_REFS,
  SRM_CLEAR_NOTE,
  SRM_EMPTY,
  SRM_FLAGGED_NOTE,
  SRM_ID,
  SRM_SMALL_EXPECTED,
  SRM_THRESHOLD,
  SRM_TITLE,
  chi2Text,
  normalizeSrm,
  pValueText,
  smallExpectedNote,
  srmAxis,
  srmExpected,
  srmModel,
  srmSmallExpected,
  srmTable,
  type SrmDeps,
  type SrmResult,
  type SrmValues,
} from '@/lib/lab/diagnostics';

const SIMULATED = derivedAttr(DIAGNOSTICS_REFS);
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

function chartName(r: SrmResult): string {
  const base = 'Observed and expected visitors in group A and group B, as paired bars';
  if (r.kind === 'empty') return `${base}: no visitors yet, so nothing is tested`;
  return `${base}: the split is ${r.flagged ? 'flagged as a mismatch' : 'not flagged'}`;
}

export function SrmChart({ values, result }: { values: SrmValues; result: SrmResult }) {
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
      ariaLabel={chartName(result)}
      // No kit ticks on x: the frame anchors its first and last tick at their start and end, which
      // would put "Group A" and "Group B" off their bars. The names are drawn centred under each pair
      // in the overlay instead, on the tick line, below the baseline and clear of every mark.
      x={{
        domain: [-0.5, 1.5],
        ticks: { narrow: [], wide: [] },
        format: (i) => formatNumber(i, 0),
        label: 'Group',
        refs: DIAGNOSTICS_REFS,
      }}
      y={{
        domain: [0, top],
        ticks: { narrow: ticks.filter((_, i) => i % 2 === 0), wide: ticks },
        format: (t) => formatNumber(t, 0),
        label: 'Visitors',
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
            Group {b.group}
          </text>
        ))
      }
    />
  );
}

/** The legend: the two series in words, each with its swatch. */
function Legend() {
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
        Observed visitors (filled)
      </li>
      <li className="flex items-center gap-2">
        {swatch(false)}
        Expected visitors at the expected share (outlined)
      </li>
    </ul>
  );
}

/** The result line: the statistic, the p-value and the flag in words; nothing to test without visitors. */
export function SrmResultLine({ values, result }: { values: SrmValues; result: SrmResult }) {
  if (result.kind === 'empty') return <>{SRM_EMPTY}</>;
  return (
    <>
      Chi-square{' '}
      <span data-srm-chi2="" data-num="" {...SIMULATED}>
        {chi2Text(result.chi2)}
      </span>{' '}
      with one degree of freedom, p-value{' '}
      <span data-srm-p="" {...SIMULATED}>
        {pValueText(result)}
      </span>
      :{' '}
      <span data-srm-status="" className={`font-semibold ${result.flagged ? 'text-warn' : 'text-ok'}`}>
        {result.flagged ? 'flagged' : 'not flagged'}
      </span>
      . {result.flagged ? SRM_FLAGGED_NOTE : SRM_CLEAR_NOTE}
      {srmSmallExpected(values) ? (
        <>
          {' '}
          <span data-srm-small="" {...SIMULATED}>
            {smallExpectedNote()}
          </span>
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
};

export function SrmFigureView({ values, controls, announcement, preview, faultAfterChange, changed, deps }: SrmFigureViewProps) {
  const v = normalizeSrm(values);
  const result = srmModel(v, deps);
  return (
    <Figure
      id={SRM_ID}
      title={SRM_TITLE}
      provenance="simulated"
      table={srmTable(v)}
      controls={controls}
      announcement={announcement}
      preview={preview}
      result={<SrmResultLine values={v} result={result} />}
      caption={
        <>
          Hypothetical visitor counts for the two groups of a test, and the share of visitors group A was meant to get.
          The check is a chi-square test with one degree of freedom on the counts against that share. It flags the split
          when the p-value is below <span {...SIMULATED}>{formatNumber(SRM_THRESHOLD)}</span>, a strict threshold, so
          that a check run on every test rarely raises a false alarm. A flag is a warning to investigate the assignment
          and the logging, not proof of what caused it. The test is an approximation: with fewer than{' '}
          <span {...SIMULATED}>{formatNumber(SRM_SMALL_EXPECTED)}</span> expected visitors in a group its p-value is
          rough. It assumes each visitor is counted once and assigned independently with the same chance (a binomial
          model), and it guarantees no business outcome. These p-values are simulated diagnostics on numbers you set,
          not results from this site’s live test.
        </>
      }
    >
      <SrmChart values={v} result={result} />
      <Legend />
      {faultAfterChange && changed ? <SrmSeamFailure /> : null}
    </Figure>
  );
}
