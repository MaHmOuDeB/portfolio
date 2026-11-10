// The RFM Figure (`rfm`, static): for each segment at the September 2011 cutoff, its share of
// customers and its share of spend, as two series on one axis from none to all.
//
// - Segments are positions on the category axis, top to bottom in export order. Each band has the
//   segment's name from the export on its own line, then the two bars: customers outlined, spend
//   filled (series-1, so the series differ by more than colour). Each bar is labelled directly with
//   its series and value in a label column left of zero, so no label sits on a bar and no name has
//   to fit a gutter: the longest name, "At risk (were frequent)", gets the whole width at 320 px.
// - The Champions customer share is the checked fact (23%), not the export's rounded 0.235: the
//   bar, the label, the readout and the table agree.
// - Champions are defined exactly, with the rule's scores printed through <Derived> as constants of
//   the source code. Their share of spend is high partly by construction.
import { ChartFrame, MARK_UNITS, type PlotContext } from '@/components/kit/ChartFrame';
import { Derived, derivedAttr } from '@/components/kit/Derived';
import { Fact } from '@/components/kit/Fact';
import { Figure } from '@/components/kit/Figure';
import { formatValue } from '@/lib/facts/format';
import { pct } from '@/lib/figure/scales';
import { RETENTION, figureProvenance, type RfmSegment } from '@/lib/retention/data';
import { CHAMPIONS_MIN_SCORE, TOP_SCORE, rfmPlotRows } from '@/lib/retention/rfm';
import { rfmTable } from '@/lib/retention/tables';

const ID = 'rfm';
const TITLE = 'Champions account for more spend than their customer share';
const REFS = ['source:retention'] as const;

/** The label column left of zero, as a share of the axis: room for "Customers 23%" at 320 px. */
const LABEL_SHARE = 0.65;
/** One segment's band in px: its name, then the customers bar and the spend bar. */
// Label centres are at least 21 px apart, more than a line of text-xs in any engine.
const BAND = 72;
const NAME_Y = 10;
const BAR_H = 12;
const CUSTOMERS_Y = 25;
const SPEND_Y = 46;

const Score = ({ value }: { value: number }) => <Derived value={value} unit="count" refs={REFS} />;

function RfmChart({ rows }: { rows: readonly RfmSegment[] }) {
  const bars = rfmPlotRows(rows);
  const n = bars.length;
  const series = [
    { key: 'customers', word: 'Customers', y: CUSTOMERS_Y, value: (b: (typeof bars)[number]) => b.customers, refs: (b: (typeof bars)[number]) => b.customerRefs },
    { key: 'spend', word: 'Spend', y: SPEND_Y, value: (b: (typeof bars)[number]) => b.spend, refs: (b: (typeof bars)[number]) => b.spendRefs },
  ] as const;
  const top = (ctx: PlotContext, i: number) => ctx.yPx(i + 0.5);
  const marks = (ctx: PlotContext) => {
    const zero = ctx.xFrac(0) * MARK_UNITS;
    return (
      <>
        <line data-axis-zero="" x1={zero} x2={zero} y1={0} y2={ctx.height} stroke="var(--color-muted)" strokeWidth={1} />
        {bars.flatMap((b, i) =>
          series.map((s) => {
            const value = s.value(b);
            const filled = s.key === 'spend';
            return (
              <rect
                key={`${b.segment}-${s.key}`}
                data-mark=""
                data-series={s.key}
                data-segment={b.segment}
                data-value={value}
                x={zero}
                width={ctx.xFrac(value) * MARK_UNITS - zero}
                y={top(ctx, i) + s.y}
                height={BAR_H}
                fill={filled ? 'var(--color-series-1)' : 'var(--color-bg)'}
                stroke="var(--color-series-1)"
                strokeWidth={filled ? 0 : 1.5}
              />
            );
          }),
        )}
      </>
    );
  };
  const overlays = (ctx: PlotContext) => (
    <>
      {bars.map((b, i) => (
        <text
          key={`${b.segment}-name`}
          data-segment-name=""
          className="text-xs font-semibold fill-ink"
          x={pct(ctx.xFrac(-LABEL_SHARE))}
          y={top(ctx, i) + NAME_Y}
          dominantBaseline="middle"
        >
          {b.segment}
        </text>
      ))}
      {bars.flatMap((b, i) =>
        series.map((s) => (
          <text
            key={`${b.segment}-${s.key}-label`}
            data-bar-label={s.key}
            className="text-xs fill-ink"
            x={pct(ctx.xFrac(0))}
            dx={-6}
            y={top(ctx, i) + s.y + BAR_H / 2}
            textAnchor="end"
            dominantBaseline="middle"
          >
            {`${s.word} `}
            <tspan data-num="" {...derivedAttr(s.refs(b))}>
              {formatValue(s.value(b), 'share')}
            </tspan>
          </text>
        )),
      )}
    </>
  );
  const shareTick = (v: number) => formatValue(v, 'share');
  return (
    <ChartFrame
      id={`${ID}-chart`}
      ariaLabel="Share of customers and share of spend for each segment, on one scale from none to all: Champions hold a much larger share of spend than of customers, and Dormant customers the reverse"
      x={{
        domain: [-LABEL_SHARE, 1],
        ticks: { wide: [0, 0.25, 0.5, 0.75, 1], narrow: [0, 0.5, 1] },
        format: shareTick,
        label: 'Share of all customers, or of all spend',
        refs: REFS,
      }}
      y={{
        // Reversed, so the first segment is the top band; zero is outside it, so no zero line.
        domain: [n + 0.5, 0.5],
        ticks: { wide: [], narrow: [] },
        format: () => '',
        label: 'Segment',
        refs: REFS,
      }}
      height={{ narrow: n * BAND, wide: n * BAND }}
      marks={marks}
      overlays={overlays}
    />
  );
}

export function RfmFigure({ rows }: { rows: readonly RfmSegment[] }) {
  // The table is the export's, so the rows drawn must be the export's too.
  if (JSON.stringify(rows) !== JSON.stringify(RETENTION.tables.rfm_segments)) throw new Error('rfm: the rows drawn must be the export’s segments');
  return (
    <Figure
      id={ID}
      title={TITLE}
      provenance={figureProvenance('retention')}
      table={rfmTable()}
      result={
        <>
          Champions are <Fact id="retention.rfm.champions_customer_share" /> of customers and hold{' '}
          <Fact id="retention.rfm.champions_revenue_share" /> of spend up to the cutoff, partly by construction: spend
          is one of the three scores that define them.
        </>
      }
      caption={
        <>
          Customers of a UK online gift retailer, from a public dataset, in segments at the September 2011 cutoff. Each
          customer is scored by rank on recency, frequency and spend. Champions score <Score value={CHAMPIONS_MIN_SCORE} />{' '}
          or <Score value={TOP_SCORE} /> out of <Score value={TOP_SCORE} /> on each of recency, frequency and spend
          (roughly the top two-fifths on each), so they are not simply the customers who spent the most. Outlined bars
          are shares of customers and filled bars shares of spend, on the same scale.
        </>
      }
    >
      <RfmChart rows={rows} />
    </Figure>
  );
}
