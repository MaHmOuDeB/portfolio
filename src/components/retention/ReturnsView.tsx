// The returns-cleaning Figure, drawn from its mode: returned-order value per month, in pounds, with
// orders cancelled within the reversal window counted as returns (raw) or removed with the order
// they reverse (clean). Shared and hook-free: the server draws the clean preset with it (the static
// HTML, also the no-JS view) and the island draws the visitor's mode with the same markup.
//
// - One series, as bars from zero. The value axis is the same in both modes (it holds the largest
//   value of either), so switching modes never rescales it and only the bars change. Marks have no
//   transition.
// - The last month is partial (the data stops early in it): its bar is an outline, the chart labels
//   it, and the copy never sets it against a full month. The growth comparison is January to
//   November in both years.
// - Every number is a <Fact> or carries source refs: the growth facts, the January reversal's value
//   and its date from the export, the rule's window (a constant of the cleaning SQL), the ticks and
//   the period read from the rows.
import type { ReactNode } from 'react';
import { ChartFrame, MARK_UNITS, type PlotContext } from '@/components/kit/ChartFrame';
import type { TableData } from '@/components/kit/DataTable';
import { Derived, derivedAttr } from '@/components/kit/Derived';
import { Fact } from '@/components/kit/Fact';
import { Figure } from '@/components/kit/Figure';
import { formatNumber } from '@/lib/figure/format';
import { sentenceNodes } from '@/lib/retention/sentence';
import { EN_RETURNS, kitFromSlice, type ReturnsText } from '@/lib/retention/text';
import {
  RETURNS_ID,
  RETURNS_REFS,
  RULE_HOURS,
  checkMonths,
  comparisonPeriod,
  monthLabel,
  returnsAxis,
  returnsValue,
  type RetailMonth,
  type ReturnMode,
  type ReturnsEvidence,
} from '@/lib/retention/returns';

const SOURCE = derivedAttr(RETURNS_REFS);
/** Half a bar's width, in months: bars fill seven tenths of their month. */
const HALF_BAR = 0.35;

export const Hours = ({ text = EN_RETURNS }: { text?: ReturnsText } = {}) => (
  <Derived value={RULE_HOURS} unit="count" refs={RETURNS_REFS} locale={text.kit.locale} />
);

/** The comparison window, marked as read from the export's rows. */
export function Period({ data, text = EN_RETURNS }: { data: readonly RetailMonth[]; text?: ReturnsText }) {
  return <span {...SOURCE}>{comparisonPeriod(data, { locale: text.kit.locale, words: text.period })}</span>;
}

/**
 * Thrown by the test seam's chart: a chart failure after a change, for the error fallback's tests.
 * Its body is exactly one throw with a literal message, the only shape the fault-seam guard accepts.
 */
function SeamFailure(): never {
  throw new Error('The returns chart failed after a change (test seam)');
}

export function ReturnsChart({ mode, data, text = EN_RETURNS }: { mode: ReturnMode; data: readonly RetailMonth[]; text?: ReturnsText }) {
  const locale = text.kit.locale;
  checkMonths(data);
  const last = data.length - 1;
  const { top, ticks } = returnsAxis(data);
  const monthTick = (v: number) => {
    const row = Number.isInteger(v) ? data[v] : undefined;
    if (!row) throw new RangeError(`returns: no month at tick ${v}`);
    return monthLabel(row.month, locale);
  };
  // Every sixth month on a wide chart, every twelfth on a narrow one: the first and the last month
  // are always labelled, so the partial month's tick names it.
  const every = (step: number) => data.map((_, i) => i).filter((i) => i % step === last % step);
  const marks = (ctx: PlotContext) =>
    data.map((row, i) => {
      const value = returnsValue(row, mode);
      const x0 = ctx.xFrac(i - HALF_BAR) * MARK_UNITS;
      const x1 = ctx.xFrac(i + HALF_BAR) * MARK_UNITS;
      const y = ctx.yPx(value);
      return (
        <rect
          key={row.month}
          data-mark=""
          data-month={row.month}
          data-value={value}
          data-partial={row.partial ? '' : undefined}
          x={x0}
          width={x1 - x0}
          y={y}
          height={Math.max(0, ctx.yPx(0) - y)}
          fill={row.partial ? 'var(--color-bg)' : 'var(--color-series-1)'}
          stroke={row.partial ? 'var(--color-series-1)' : 'none'}
          strokeWidth={row.partial ? 2 : 0}
        />
      );
    });
  const partial = data[last]?.partial === true;
  return (
    <ChartFrame
      id={`${RETURNS_ID}-chart`}
      ariaLabel={text.chartName[mode]}
      x={{
        domain: [-0.5, last + 0.5],
        ticks: { wide: every(6), narrow: every(12) },
        format: monthTick,
        label: text.axis.x,
        refs: RETURNS_REFS,
      }}
      y={{
        domain: [0, top],
        ticks: { wide: ticks, narrow: ticks.filter((_, i) => i % 2 === 0) },
        format: (v) => formatNumber(v, 0, { locale }),
        label: text.axis.y,
        refs: RETURNS_REFS,
      }}
      height={{ narrow: 220, wide: 280 }}
      marks={marks}
      // Above the last bar, in the top band no bar of either mode reaches.
      annotation={partial ? () => ({ x: last + 0.45, y: top * 0.95, text: text.partial, anchor: 'end' }) : undefined}
    />
  );
}

/** The result line: the growth in this mode over the window, and the order behind most of the gap. */
export function ReturnsResult({
  mode,
  data,
  evidence,
  text = EN_RETURNS,
}: {
  mode: ReturnMode;
  data: readonly RetailMonth[];
  evidence: ReturnsEvidence;
  text?: ReturnsText;
}) {
  const locale = text.kit.locale;
  // The other mode, named in words so the sentence has its referent without a second figure.
  const reversal = sentenceNodes(text.reversal[mode], {
    january: <Fact id="retail.reversal.january_gbp" locale={locale} />,
    date: <Derived value={evidence.januaryReversalDate} unit="date" refs={RETURNS_REFS} locale={locale} />,
  });
  return sentenceNodes(text.lead[mode], {
    hours: <Hours text={text} />,
    growth: <Fact id={mode === 'raw' ? 'retail.returns.yoy_growth_raw' : 'retail.returns.yoy_growth_clean'} locale={locale} />,
    period: <Period data={data} text={text} />,
    reversal,
  });
}

export type ReturnsFigureViewProps = {
  mode: ReturnMode;
  data: readonly RetailMonth[];
  evidence: ReturnsEvidence;
  /** The table of this mode: returnsTable on the server, returnsTableFrom in the island. */
  table: TableData;
  controls?: ReactNode;
  announcement?: string;
  /** The island passes false, so a chart failure shows the kit's sentence and the current table only. */
  preview?: ReactNode;
  /**
   * Test seam, absent in production: with `changed`, the chart throws, so a test can see the error
   * fallback. The island forwards it unchanged; the server never sets it.
   */
  faultAfterChange?: true;
  /** Whether the visitor has changed the mode since the island loaded. */
  changed?: boolean;
  /** The Figure's words and the language of its numbers; default English. */
  text?: ReturnsText;
};

export function ReturnsFigureView({
  mode,
  data,
  evidence,
  table,
  controls,
  announcement,
  preview,
  faultAfterChange,
  changed,
  text = EN_RETURNS,
}: ReturnsFigureViewProps) {
  return (
    <Figure
      id={RETURNS_ID}
      title={text.title}
      text={kitFromSlice(text.kit)}
      provenance={evidence.provenance}
      table={table}
      controls={controls}
      announcement={announcement}
      preview={preview}
      result={<ReturnsResult mode={mode} data={data} evidence={evidence} text={text} />}
      caption={sentenceNodes(text.caption, { hours: <Hours text={text} /> })}
    >
      <ReturnsChart mode={mode} data={data} text={text} />
      {faultAfterChange && changed ? <SeamFailure /> : null}
    </Figure>
  );
}
