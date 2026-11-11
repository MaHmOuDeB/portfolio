// The cohort Figure, drawn from the selected cohort: the share of each cohort who ordered again in
// each of the twelve months after their first order. Shared and hook-free: the server draws the
// preset with it (the static HTML, also the no-JS view) and the island draws the visitor's cohort
// with the same markup.
//
// - Two charts, both always in the markup, and CSS shows one of them with display: none at 600 px
//   (37.5rem): from 600 px up the heatmap of every cohort, with the selected row outlined in ink and
//   labelled "Selected"; below it, the selected cohort as a line. Each is one ChartFrame layout, so
//   no chart is drawn twice.
// - The heatmap is one sequential hue: series-1 at an opacity proportional to the share, on the same
//   top as the line, with every value printed in its cell. Month zero (the first order, the whole
//   cohort by definition) is left out of both charts and kept in the table.
// - The line plots the cohort's own values: it can rise again, and nothing smooths or sorts it. Its
//   axis is the same for every cohort. Marks have no transition.
// - Every number is a source value with a source ref: the cells, the dots, the ticks, the result
//   line and the cohort names.
// - Page weight: the heatmap's cells and printed values are in cohort order, then month order, so a
//   cell pairs with its value by position and neither repeats the cohort and month as attributes.
//   Mark-layer x positions are printed to MARK_DECIMALS places (the layer is 1000 units across the
//   plot, so the rounding is far below a pixel); the drawn pixels are unchanged.
import type { ReactNode } from 'react';
import { ChartFrame, MARK_UNITS, type PlotContext } from '@/components/kit/ChartFrame';
import type { TableData } from '@/components/kit/DataTable';
import { Derived, derivedAttr } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import type { Provenance } from '@/components/kit/ProvenanceBadge';
import { formatValue } from '@/lib/facts/format';
import { formatNumber } from '@/lib/figure/format';
import { pct } from '@/lib/figure/scales';
import {
  COHORTS_ID,
  COHORTS_REFS,
  COHORTS_TITLE,
  MONTHS,
  cellOpacity,
  checkCohorts,
  cohortAt,
  cohortAxis,
  cohortMonthWord,
  cohortSpan,
  monthLabel,
  type Cohort,
} from '@/lib/retention/cohorts';

const SOURCE = derivedAttr(COHORTS_REFS);
const share = (v: number) => formatValue(v, 'share');
/** A share as a position on the line's percent axis (0.3179 is 31.79): a plotting unit, never printed. */
const toPercent = (v: number) => v * 100;
/** A tick, a whole tenth of the axis, in whole percent: 30, never 30.000000000000004. */
const wholePercent = (v: number) => Math.round(v * 100);

/** Room right of the last month for the "Selected" label, in months: at least 77 px at 600 px. */
const LABEL_MONTHS = 2.25;
/** The last later month's right edge. */
const LATER_END = MONTHS.length + 0.5;
/** A heatmap row's height in px. */
const ROW_PX = 26;
const LINE_HEIGHT = 220;
/** Decimals of a mark-layer x position or width as printed. */
const MARK_DECIMALS = 2;
/** A mark-layer x position or width, rounded for print: 70.18, never 70.17543859649122. */
const units = (v: number) => Number(v.toFixed(MARK_DECIMALS));
const SELECTED = 'Selected';
const X_LABEL = 'Months after the first order';

/** Thrown by the test seam's chart: a chart failure after a change, for the error fallback's tests. */
function SeamFailure(): never {
  throw new Error('The cohort chart failed after a change (test seam)');
}

/** A cohort's name as printed, marked as read from the export. */
function CohortName({ month }: { month: string }) {
  return <span {...SOURCE}>{monthLabel(month)}</span>;
}

/** Every cohort as a row, every later month as a cell; the selected row outlined and labelled. */
export function CohortHeatmap({ rows, selected }: { rows: readonly Cohort[]; selected: string }) {
  checkCohorts(rows);
  const { top } = cohortAxis(rows);
  const { index } = cohortAt(rows, selected);
  const n = rows.length;
  const rowTick = (v: number) => {
    const row = Number.isInteger(v) ? rows[v - 1] : undefined;
    return row ? monthLabel(row.cohort_month) : '';
  };
  const marks = (ctx: PlotContext) => {
    const x = (m: number) => ctx.xFrac(m) * MARK_UNITS;
    // In cohort order, then month order: the overlays print the values in the same order.
    const cells = rows.flatMap((c, r) =>
      MONTHS.map((m) => {
        const value = c.retention[m]!;
        const y0 = ctx.yPx(r + 0.5);
        return (
          <rect
            key={`${c.cohort_month}-${m}`}
            data-mark=""
            data-cell=""
            data-value={value}
            x={units(x(m - 0.5))}
            width={units(x(m + 0.5) - x(m - 0.5))}
            y={y0}
            height={ctx.yPx(r + 1.5) - y0}
            fill="var(--color-series-1)"
            fillOpacity={cellOpacity(value, top)}
            stroke="var(--color-bg)"
            strokeWidth={1}
          />
        );
      }),
    );
    const y0 = ctx.yPx(index + 0.5);
    return (
      <>
        {/* The frame draws a gridline per row across the whole plot, through the middle of each
            row's printed values and through the "Selected" label's room. The cells are
            translucent, so the whole plot is cleared to the background before they are drawn. */}
        <rect data-plot-clear="" x={0} width={MARK_UNITS} y={0} height={ctx.height} fill="var(--color-bg)" />
        {cells}
        <rect
          data-mark=""
          data-selected={selected}
          x={units(x(0.5))}
          width={units(x(LATER_END) - x(0.5))}
          y={y0}
          height={ctx.yPx(index + 1.5) - y0}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth={2}
        />
      </>
    );
  };
  // Printed values are text over the cells (outside the stretched mark layer, so never scaled);
  // the label sits in the empty room right of the last month, never on a cell.
  const overlays = (ctx: PlotContext) => (
    <>
      {rows.flatMap((c, r) =>
        MONTHS.map((m) => (
          <text
            key={`${c.cohort_month}-${m}`}
            data-cell-label=""
            data-num=""
            {...SOURCE}
            className="text-xs fill-ink"
            x={pct(ctx.xFrac(m))}
            y={ctx.yPx(r + 1)}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {share(c.retention[m]!)}
          </text>
        )),
      )}
      <text
        data-selected-label=""
        className="text-sm font-semibold fill-ink"
        x={pct(ctx.xFrac(LATER_END))}
        dx={8}
        y={ctx.yPx(index + 1)}
        dominantBaseline="middle"
      >
        {SELECTED}
      </text>
    </>
  );
  return (
    <ChartFrame
      id={`${COHORTS_ID}-heatmap`}
      layout="wide"
      ariaLabel={`Share of each cohort, by month of first order from ${cohortSpanWords(rows)}, who ordered again in each month after it, as shaded cells with their values; the ${cohortMonthWord(selected)} cohort is outlined`}
      x={{
        domain: [0.5, LATER_END + LABEL_MONTHS],
        ticks: { wide: [...MONTHS], narrow: [...MONTHS] },
        format: (v) => formatNumber(v, 0),
        label: X_LABEL,
        refs: COHORTS_REFS,
      }}
      y={{
        // Reversed, so the first cohort is the top row; zero is outside it, so no zero line.
        domain: [n + 0.5, 0.5],
        ticks: { wide: rows.map((_, i) => i + 1), narrow: rows.map((_, i) => i + 1) },
        format: rowTick,
        label: 'Cohort, by month of first order',
        refs: COHORTS_REFS,
      }}
      height={{ narrow: n * ROW_PX, wide: n * ROW_PX }}
      marks={marks}
      overlays={overlays}
    />
  );
}

/** "January to November", the span's months in words, for the accessible name. */
function cohortSpanWords(rows: readonly Cohort[]): string {
  const first = rows[0]!.cohort_month;
  const last = rows.at(-1)!.cohort_month;
  return first === last ? cohortMonthWord(first) : `${cohortMonthWord(first)} to ${cohortMonthWord(last)}`;
}

/** The selected cohort's twelve later months as a line, on the axis every cohort shares. */
export function CohortLine({ rows, selected }: { rows: readonly Cohort[]; selected: string }) {
  checkCohorts(rows);
  const { top, ticks } = cohortAxis(rows);
  const { row } = cohortAt(rows, selected);
  const points = MONTHS.map((m) => [m, row.retention[m]!] as const);
  const name = monthLabel(row.cohort_month);
  return (
    <ChartFrame
      id={`${COHORTS_ID}-line`}
      layout="narrow"
      ariaLabel={`Share of the ${cohortMonthWord(selected)} cohort who ordered again, month by month for the twelve months after their first order`}
      x={{
        domain: [1, MONTHS.length],
        ticks: { narrow: [1, 3, 6, 9, 12], wide: [1, 3, 6, 9, 12] },
        format: (v) => formatNumber(v, 0),
        label: X_LABEL,
        refs: COHORTS_REFS,
      }}
      // In percent, so a tick prints "30" and the unit is in the label: the frame sizes its left
      // gutter for digits, and a "%" on every tick would push the widest label past it at 320 px.
      y={{
        domain: [0, top * 100],
        ticks: { narrow: ticks.map(wholePercent), wide: ticks.map(wholePercent) },
        format: (v) => formatNumber(v, 0),
        label: 'Ordered again that month (%)',
        refs: COHORTS_REFS,
      }}
      height={{ narrow: LINE_HEIGHT, wide: LINE_HEIGHT }}
      marks={(ctx) => (
        <polyline
          data-mark=""
          data-cohort={row.cohort_month}
          points={points.map(([m, v]) => `${units(ctx.xFrac(m) * MARK_UNITS)},${ctx.yPx(toPercent(v))}`).join(' ')}
          fill="none"
          stroke="var(--color-series-1)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      )}
      overlays={(ctx) =>
        points.map(([m, v]) => (
          <circle
            key={m}
            data-mark=""
            data-cohort={row.cohort_month}
            data-month={m}
            data-value={v}
            cx={pct(ctx.xFrac(m))}
            cy={ctx.yPx(toPercent(v))}
            r={3.5}
            fill="var(--color-series-1)"
          />
        ))
      }
      // In the top band, above every cohort's largest month, at the line's right end.
      annotation={() => ({ x: MONTHS.length, y: toPercent(top) * 0.94, text: `${name} cohort`, anchor: 'end', refs: COHORTS_REFS })}
    />
  );
}

/** The result line: the selected cohort's first and twelfth later month. */
export function CohortResult({ row }: { row: Cohort }) {
  return (
    <>
      In the month after their first order, <Derived value={row.retention[1]!} unit="share" refs={COHORTS_REFS} /> of
      the <CohortName month={row.cohort_month} /> cohort (
      <Derived value={row.cohort_size} unit="count" refs={COHORTS_REFS} /> customers) ordered again; in the twelfth month
      after it, <Derived value={row.retention[MONTHS.length]!} unit="share" refs={COHORTS_REFS} /> did.
    </>
  );
}

/** The same sentence as plain text, for the announcement on a committed change. */
export function cohortResultText(row: Cohort): string {
  return `In the month after their first order, ${share(row.retention[1]!)} of the ${monthLabel(row.cohort_month)} cohort (${formatValue(row.cohort_size, 'count')} customers) ordered again; in the twelfth month after it, ${share(row.retention[MONTHS.length]!)} did.`;
}

export type CohortFigureViewProps = {
  rows: readonly Cohort[];
  /** The selected cohort month. */
  cohort: string;
  provenance: Provenance;
  /** The cohort table: cohortTable on the server, cohortTableFrom in the island. */
  table: TableData;
  controls?: ReactNode;
  announcement?: string;
  /** The island passes false, so a chart failure shows the kit's sentence and the current table only. */
  preview?: ReactNode;
  /** Test seam, absent in production: with `changed`, the chart throws. Only ever forwarded, never set. */
  faultAfterChange?: true;
  /** Whether the visitor has changed the cohort since the island loaded. */
  changed?: boolean;
};

export function CohortFigureView({
  rows,
  cohort,
  provenance,
  table,
  controls,
  announcement,
  preview,
  faultAfterChange,
  changed,
}: CohortFigureViewProps) {
  const { row } = cohortAt(rows, cohort);
  return (
    <Figure
      id={COHORTS_ID}
      title={COHORTS_TITLE}
      provenance={provenance}
      table={table}
      controls={controls}
      announcement={announcement}
      preview={preview}
      result={<CohortResult row={row} />}
      caption={
        <>
          Customers of a UK online gift retailer, from a public dataset, grouped by the month of their first order in
          the data, <span {...SOURCE}>{cohortSpan(rows)}</span>. Each later month shows the share of a cohort who
          ordered again in that later month, so a share can rise again: it is not the share still ordering every
          month since. Month zero, the first order itself, includes every member by definition, so only the table
          shows it. On a wide screen each row is a cohort and darker cells hold larger shares, with the chosen cohort
          outlined; on a narrow one the chosen cohort is a line.
        </>
      }
    >
      <div data-cohort-mode="heatmap" className="hidden min-[37.5rem]:block">
        <CohortHeatmap rows={rows} selected={cohort} />
      </div>
      <div data-cohort-mode="line" className="min-[37.5rem]:hidden">
        <CohortLine rows={rows} selected={cohort} />
      </div>
      {faultAfterChange && changed ? <SeamFailure /> : null}
    </Figure>
  );
}
