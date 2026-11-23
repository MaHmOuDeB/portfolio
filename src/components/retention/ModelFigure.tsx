// The model Figure (`models`, static): how well the "most recent buyer first" rule and gradient
// boosting rank the customers who ordered again within the window after the September 2011 cutoff,
// scored on that later period.
//
// - Only the rule and gradient boosting are plotted, each a dot at its ROC AUC on a track from one
//   half (chance) to one (a perfect ranking), with its value from its fact. Neither AUC has an
//   interval of its own, so none is drawn: the interval belongs to the gain, which the result line
//   gives through its facts (never the difference of the two printed AUCs).
// - It is ranking accuracy on observed orders, not a response to an offer (the page says once that nobody was contacted).
// - The table is the sourced models table, with logistic regression and the lapsed-only scores too.
import { ChartFrame, MARK_UNITS, type PlotContext } from '@/components/kit/ChartFrame';
import { derivedAttr } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import type { FactId } from '@/lib/facts';
import { formatNumber } from '@/lib/figure/format';
import { factText } from '@/lib/facts/text';
import { pct } from '@/lib/figure/scales';
import type { Locale } from '@/lib/i18n/locale';
import { RETENTION, figureProvenance, numericFact } from '@/lib/retention/data';
import { modelsTable } from '@/lib/retention/tables';
import { slotsFor } from '../../../content/retention';
import { retentionCopy } from './copy';

const ID = 'models';
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

function ModelChart({ locale }: { locale: Locale }) {
  const c = retentionCopy(locale);
  const rows = plotted();
  const n = rows.length;
  const top = (ctx: PlotContext, i: number) => ctx.yPx(i + 0.5);
  return (
    <ChartFrame
      id={`${ID}-chart`}
      ariaLabel={c.models.ariaLabel}
      x={{
        domain: [0.5, 1],
        ticks: { wide: [0.5, 0.6, 0.7, 0.8, 0.9, 1], narrow: [0.5, 0.6, 0.7, 0.8, 0.9, 1] },
        format: (v) => formatNumber(v, 1, { fixed: true, locale }),
        label: c.models.axis.x,
        refs: REFS,
      }}
      y={{
        domain: [n + 0.5, 0.5],
        ticks: { wide: [], narrow: [] },
        format: () => '',
        label: c.models.axis.y,
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
              {c.tables.models.name(r.model)}
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
              {factText(r.fact, { locale })}
            </text>
          ))}
        </>
      )}
    />
  );
}

export function ModelFigure({ locale = 'en' }: { locale?: Locale } = {}) {
  const c = retentionCopy(locale);
  const p = slotsFor(locale);
  return (
    <Figure
      id={ID}
      title={c.models.title}
      text={c.kit}
      provenance={figureProvenance('retention')}
      table={modelsTable(c.tables)}
      result={c.models.result(p)}
      caption={c.models.caption(p)}
    >
      <ModelChart locale={locale} />
    </Figure>
  );
}
