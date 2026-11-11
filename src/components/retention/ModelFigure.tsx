// The model Figure (`models`, static): how well the "most recent buyer first" rule and gradient
// boosting rank the customers who ordered again within the window after the September 2011 cutoff,
// scored on that later period.
//
// - Only the rule and gradient boosting are plotted, each a dot at its ROC AUC on a track from one
//   half (chance) to one (a perfect ranking), with its value from its fact. Neither AUC has an
//   interval of its own, so none is drawn: the interval belongs to the gain, which the result line
//   gives through its facts (never the difference of the two printed AUCs).
// - It is ranking accuracy on observed orders, not a response to an offer: nobody was contacted.
// - The table is the sourced models table, with logistic regression and the lapsed-only scores too.
import { ChartFrame, MARK_UNITS, type PlotContext } from '@/components/kit/ChartFrame';
import { Derived, derivedAttr } from '@/components/kit/Derived';
import { Fact } from '@/components/kit/Fact';
import { Figure } from '@/components/kit/Figure';
import type { FactId } from '@/lib/facts';
import { formatNumber } from '@/lib/figure/format';
import { factText } from '@/lib/facts/text';
import { pct } from '@/lib/figure/scales';
import { RETENTION, figureProvenance, numericFact } from '@/lib/retention/data';
import { INTERVAL_LEVEL, WINDOW_DAYS } from '@/lib/retention/rfm';
import { modelsTable } from '@/lib/retention/tables';

const ID = 'models';
const TITLE = 'The model ranks repeat buyers only slightly better than recency';
const REFS = ['source:retention'] as const;

/** The two methods compared, by their export names, with the fact that holds each AUC. */
const COMPARED: readonly { model: string; fact: FactId }[] = [
  { model: 'Baseline: most recent buyer first', fact: 'retention.model.rule_auc' },
  { model: 'Gradient boosting', fact: 'retention.model.gb_auc' },
];

/** A method's band in px: its name, then its track and dot. */
const BAND = 56;
const NAME_Y = 11;
const DOT_Y = 34;

function plotted() {
  return COMPARED.map(({ model, fact }) => {
    const row = RETENTION.tables.models.find((m) => m.model === model);
    if (!row) throw new Error(`models: no ${model} in the export`);
    const value = numericFact(fact);
    if (row.roc_auc !== value) throw new Error(`models: the ${model} AUC differs from its fact`);
    return { model, fact, value };
  });
}

function ModelChart() {
  const rows = plotted();
  const n = rows.length;
  const top = (ctx: PlotContext, i: number) => ctx.yPx(i + 0.5);
  return (
    <ChartFrame
      id={`${ID}-chart`}
      ariaLabel="ROC AUC of the most-recent-buyer-first rule and of gradient boosting on the later test period, on a scale from chance to a perfect ranking: gradient boosting is only slightly higher"
      x={{
        domain: [0.5, 1],
        ticks: { wide: [0.5, 0.6, 0.7, 0.8, 0.9, 1], narrow: [0.5, 0.6, 0.7, 0.8, 0.9, 1] },
        format: (v) => formatNumber(v, 1, { fixed: true }),
        label: 'ROC AUC on the later test period',
        refs: REFS,
      }}
      y={{
        domain: [n + 0.5, 0.5],
        ticks: { wide: [], narrow: [] },
        format: () => '',
        label: 'Ranking method',
        refs: REFS,
      }}
      height={{ narrow: n * BAND, wide: n * BAND }}
      marks={(ctx) =>
        rows.map((r, i) => (
          <line
            key={r.model}
            data-track=""
            x1={0}
            x2={MARK_UNITS}
            y1={top(ctx, i) + DOT_Y}
            y2={top(ctx, i) + DOT_Y}
            stroke="var(--color-line)"
            strokeWidth={2}
          />
        ))
      }
      overlays={(ctx) => (
        <>
          {rows.map((r, i) => (
            <text
              key={`${r.model}-name`}
              data-model-name=""
              className="text-xs font-semibold fill-ink"
              x={pct(0)}
              y={top(ctx, i) + NAME_Y}
              dominantBaseline="middle"
            >
              {r.model}
            </text>
          ))}
          {rows.map((r, i) => (
            <circle
              key={`${r.model}-dot`}
              data-mark=""
              data-model={r.model}
              data-value={r.value}
              cx={pct(ctx.xFrac(r.value))}
              cy={top(ctx, i) + DOT_Y}
              r={5}
              fill="var(--color-series-1)"
            />
          ))}
          {rows.map((r, i) => (
            <text
              key={`${r.model}-value`}
              data-dot-label=""
              data-num=""
              {...derivedAttr([r.fact])}
              className="text-xs fill-ink"
              x={pct(ctx.xFrac(r.value))}
              dx={10}
              y={top(ctx, i) + DOT_Y}
              dominantBaseline="middle"
            >
              {factText(r.fact)}
            </text>
          ))}
        </>
      )}
    />
  );
}

export function ModelFigure() {
  return (
    <Figure
      id={ID}
      title={TITLE}
      provenance={figureProvenance('retention')}
      table={modelsTable()}
      result={
        <>
          Gradient boosting ranks with a ROC AUC of <Fact id="retention.model.gb_auc" />, against{' '}
          <Fact id="retention.model.rule_auc" /> for putting the most recent buyers first: a gain of{' '}
          <Fact id="retention.model.auc_gain" />, with a <Derived value={INTERVAL_LEVEL} unit="share" refs={REFS} /> interval
          of <Fact id="retention.model.auc_gain_low" /> to <Fact id="retention.model.auc_gain_high" /> that covers
          test-sample variability only.
        </>
      }
      caption={
        <>
          How well each method ranks the customers of a public dataset by whether they ordered again within the{' '}
          <Derived value={WINDOW_DAYS} unit="count" refs={REFS} /> days after the September 2011 cutoff. The model learned
          on an earlier cutoff and both were scored on this later one. A ROC AUC is the chance that a customer who
          ordered again is ranked above one who did not: one half is no better than chance, one is a perfect ranking.
          This is ranking accuracy, not a response to any offer: nobody was contacted, and a high score is a
          prediction, not an effect of contact. The table adds logistic regression and the scores for lapsed customers
          only.
        </>
      }
    >
      <ModelChart />
    </Figure>
  );
}
