// The open tables behind the Retention Figures, built from exact fields of the vendored exports.
// Cells stay numeric (the kit formats them, right-aligned with data-num) and unrounded: a share
// column holds the raw fraction, never a rounded copy. Headers and notes are plain words with no
// digits, because only the cells carry the data-derived refs. Nothing here computes an outcome:
// every number is a source value, or a checked fact where the export rounds one too far.
import type { DerivedRef } from '@/components/kit/Derived';
import type { ColumnFormat, TableData } from '@/components/kit/DataTable';
import { COHORTS, RETAIL, RETENTION, numericFact, type ReturnMode } from './data';
import { monthLabel } from './returns';
import { EN_COHORTS, EN_RETURNS, type CohortText, type ReturnsText } from './text';

const RETAIL_REFS: readonly DerivedRef[] = ['source:retail'];

/**
 * The words of the four tables that only the server draws (the segments, the models, the targeting and
 * the holdout sizes). English here; the German values are in content/de/retention.tsx. The group and
 * model names are the export's own keys, so a text maps each key to the name it prints, and throws on a
 * key it does not know.
 */
export type SourcedTablesText = {
  rfm: { columns: readonly [segment: string, customers: string, customerShare: string, spendShare: string]; note: string };
  models: {
    columns: readonly [model: string, all: string, lapsed: string];
    note: string;
    /** The name printed for an export model name. */
    name: (model: string) => string;
  };
  targeting: { columns: readonly [share: string, selected: string, ordered: string, expected: string]; note: string };
  holdout: {
    columns: readonly [group: string, ordered: string, rise: string, perGroup: string];
    note: string;
    /** The label printed for an export group name. */
    group: (group: string) => string;
  };
};

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const EN_TABLES: SourcedTablesText = {
  rfm: {
    columns: ['Segment', 'Customers', 'Share of customers', 'Share of spend'],
    note: 'Customers at the September cutoff of the analysis; spend is everything they bought up to it.',
  },
  models: {
    columns: ['Model', 'ROC AUC, all customers', 'ROC AUC, lapsed customers only'],
    note: 'How well each model ranks the customers who ordered again within the window, scored on a later period than it learned from. Ranking accuracy, not a response to any offer.',
    name: (model) => model,
  },
  targeting: {
    columns: ['Share selected', 'Customers selected', 'Ordered again within the window', 'Expected to order again, random selection'],
    note: 'Lapsed customers with the highest model scores, selected on paper only. These are observed orders, not the effect of an offer.',
  },
  holdout: {
    columns: ['Sized for', 'Ordered again', 'Rise (points)', 'Customers per group'],
    note: 'Ordered again is the share who ordered again within the window, and the rise is in percentage points. A sample-size calculation only. Where the customers needed per group exceed the customers in that group, the test would need lapsed customers from more than one period.',
    group: capitalise,
  },
};

/** The value itself, after checking it is a finite number (a share also between zero and one). */
function finite(v: number, what: string, share = false): number {
  if (!Number.isFinite(v)) throw new TypeError(`${what}: expected a finite number, got ${String(v)}`);
  if (share && (v < 0 || v > 1)) throw new RangeError(`${what}: a share must be between zero and one, got ${v}`);
  return v;
}

/** Returned-order value per month, in whole pounds, with or without the 24-hour reversal rule. */
export function returnsTable(mode: ReturnMode, text: ReturnsText = EN_RETURNS): TableData {
  const locale = text.kit.locale;
  return {
    columns: [...text.table.columns],
    rows: RETAIL.tables.monthly.map((m) => [
      monthLabel(m.month, locale),
      finite(mode === 'raw' ? m.returns_gbp_raw : m.returns_gbp_clean, `returns ${m.month}`),
      m.partial ? text.table.yes : text.table.no,
    ]),
    formats: ['number', 'count', 'number'],
    note: text.table.note[mode],
    refs: RETAIL_REFS,
  };
}

/** Every cohort's share active in each month after its first order: all thirteen values per row. */
export function cohortTable(text: CohortText = EN_COHORTS): TableData {
  const locale = text.kit.locale;
  const months = COHORTS[0]?.retention.length ?? 0;
  if (months !== text.table.months.length + 1) throw new Error(`retention: expected ${text.table.months.length + 1} months per cohort, got ${months}`);
  return {
    columns: [...text.table.columns, ...text.table.months],
    rows: COHORTS.map((c) => {
      if (c.retention.length !== months) throw new Error(`retention: cohort ${c.cohort_month} has ${c.retention.length} months`);
      return [
        monthLabel(c.cohort_month, locale),
        finite(c.cohort_size, `cohort ${c.cohort_month} size`),
        ...c.retention.map((v, i) => finite(v, `cohort ${c.cohort_month} month ${i}`, true)),
      ];
    }),
    formats: ['number', 'count', ...Array<ColumnFormat>(months).fill('share')],
    note: text.table.note,
    refs: ['source:retention'],
  };
}

/**
 * Customer and spend shares per RFM segment at the test cutoff. The export rounds the Champions
 * customer share to three decimals, which would print one point too high, so that cell is the
 * checked fact computed from counts.
 */
export function rfmTable(text: SourcedTablesText = EN_TABLES): TableData {
  const championsShare = numericFact('retention.rfm.champions_customer_share');
  const championsSpend = numericFact('retention.rfm.champions_revenue_share');
  const segments = RETENTION.tables.rfm_segments;
  const champions = segments.find((s) => s.segment === 'Champions');
  if (!champions) throw new Error('retention: no Champions segment in the export');
  // The fact must be the export's own value before its rounding, never another number.
  if (Math.abs(champions.customer_share - championsShare) > 0.0005 + 1e-12) {
    throw new Error(`retention: Champions share ${championsShare} does not round to the export's ${champions.customer_share}`);
  }
  if (champions.revenue_share !== championsSpend) throw new Error('retention: Champions spend share differs from its fact');
  return {
    columns: [...text.rfm.columns],
    rows: segments.map((s) => [
      s.segment,
      finite(s.customers, `${s.segment} customers`),
      s === champions ? championsShare : finite(s.customer_share, `${s.segment} customer share`, true),
      finite(s.revenue_share, `${s.segment} spend share`, true),
    ]),
    formats: ['number', 'count', 'share', 'share'],
    note: text.rfm.note,
    refs: ['source:retention', 'retention.rfm.champions_customer_share', 'retention.rfm.champions_revenue_share'],
  };
}

/** ROC AUC of each model on the later test snapshot, for all customers and for lapsed ones only. */
export function modelsTable(text: SourcedTablesText = EN_TABLES): TableData {
  const models = RETENTION.tables.models;
  const auc = (name: string) => models.find((m) => m.model === name)?.roc_auc;
  if (auc('Baseline: most recent buyer first') !== numericFact('retention.model.rule_auc')) throw new Error('retention: rule AUC differs from its fact');
  if (auc('Gradient boosting') !== numericFact('retention.model.gb_auc')) throw new Error('retention: gradient-boosting AUC differs from its fact');
  return {
    columns: [...text.models.columns],
    rows: models.map((m) => [text.models.name(m.model), finite(m.roc_auc, `${m.model} AUC`, true), finite(m.lapsed_roc_auc, `${m.model} lapsed AUC`, true)]),
    // Every AUC has three decimals in the export, so each prints three, "0.710" among them.
    formats: ['number', { fixed: 3 }, { fixed: 3 }],
    note: text.models.note,
    refs: ['source:retention', 'retention.model.rule_auc', 'retention.model.gb_auc'],
  };
}

/** Lapsed customers ranked by score: observed later orders against a random selection of the same size. */
export function targetingTable(text: SourcedTablesText = EN_TABLES): TableData {
  return {
    columns: [...text.targeting.columns],
    rows: RETENTION.tables.lapsed_targeting.map((r) => [
      finite(r.contact_share, 'share selected', true),
      finite(r.contacted, 'customers selected'),
      finite(r.returners_model, 'returned'),
      finite(r.returners_random, 'expected from random selection'),
    ]),
    formats: ['share', 'count', 'count', 'number'],
    note: text.targeting.note,
    refs: ['source:retention', 'retention.winback.top20_customers'],
  };
}

/** The holdout-test sizing: customers needed in each group to detect each rise. */
export function holdoutTable(text: SourcedTablesText = EN_TABLES): TableData {
  return {
    columns: [...text.holdout.columns],
    rows: RETENTION.tables.holdout_sizes.map((h) => [
      text.holdout.group(h.group),
      finite(h.baseline_rate, `${h.group} baseline`, true),
      finite(h.uplift_pp, `${h.group} uplift`),
      finite(h.customers_per_arm, `${h.group} customers per group`),
    ]),
    formats: ['number', 'share', 'count', 'count'],
    note: text.holdout.note,
    refs: ['source:retention', 'retention.winback.n_per_arm', 'retention.winback.baseline_rate', 'retention.winback.uplift_pp'],
  };
}
