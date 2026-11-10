// The open tables behind the Retention Figures, built from exact fields of the vendored exports.
// Cells stay numeric (the kit formats them, right-aligned with data-num) and unrounded: a share
// column holds the raw fraction, never a rounded copy. Headers and notes are plain words with no
// digits, because only the cells carry the data-derived refs. Nothing here computes an outcome:
// every number is a source value, or a checked fact where the export rounds one too far.
import type { DerivedRef } from '@/components/kit/Derived';
import type { ColumnFormat, TableData } from '@/components/kit/DataTable';
import { COHORTS, RETAIL, RETENTION, numericFact, type ReturnMode } from './data';

const RETAIL_REFS: readonly DerivedRef[] = ['source:retail'];

const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "Jan 2010" for "2010-01". */
function monthLabel(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new TypeError(`expected a YYYY-MM month, got ${JSON.stringify(month)}`);
  return monthFormat.format(Date.parse(`${month}-01T00:00:00Z`));
}

/** The value itself, after checking it is a finite number (a share also between zero and one). */
function finite(v: number, what: string, share = false): number {
  if (!Number.isFinite(v)) throw new TypeError(`${what}: expected a finite number, got ${String(v)}`);
  if (share && (v < 0 || v > 1)) throw new RangeError(`${what}: a share must be between zero and one, got ${v}`);
  return v;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Returned-order value per month, in whole pounds, with or without the 24-hour reversal rule. */
export function returnsTable(mode: ReturnMode): TableData {
  return {
    columns: ['Month', 'Returned-order value (GBP)', 'Partial month'],
    rows: RETAIL.tables.monthly.map((m) => [
      monthLabel(m.month),
      finite(mode === 'raw' ? m.returns_gbp_raw : m.returns_gbp_clean, `returns ${m.month}`),
      m.partial ? 'Yes' : 'No',
    ]),
    formats: ['number', 'count', 'number'],
    note:
      mode === 'raw'
        ? 'Without the reversal rule: a cancellation that reverses an order counts as a returned order. The last month is partial: the data ends early in December.'
        : 'With the reversal rule: an order and the cancellation that reverses it are both removed. The last month is partial: the data ends early in December.',
    refs: RETAIL_REFS,
  };
}

const MONTH_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** Every cohort's share active in each month after its first order: all thirteen values per row. */
export function cohortTable(): TableData {
  const months = COHORTS[0]?.retention.length ?? 0;
  if (months !== MONTH_WORDS.length + 1) throw new Error(`retention: expected ${MONTH_WORDS.length + 1} months per cohort, got ${months}`);
  return {
    columns: ['Cohort', 'Customers', 'Formation month', ...MONTH_WORDS.map((w) => `Month ${w}`)],
    rows: COHORTS.map((c) => {
      if (c.retention.length !== months) throw new Error(`retention: cohort ${c.cohort_month} has ${c.retention.length} months`);
      return [
        monthLabel(c.cohort_month),
        finite(c.cohort_size, `cohort ${c.cohort_month} size`),
        ...c.retention.map((v, i) => finite(v, `cohort ${c.cohort_month} month ${i}`, true)),
      ];
    }),
    formats: ['number', 'count', ...Array<ColumnFormat>(months).fill('share')],
    note:
      'Customers are grouped by the month of their first order in the data. Each later month counts the cohort members who ordered in that month, so a share can rise again; it is not the share who kept buying every month since.',
    refs: ['source:retention'],
  };
}

/**
 * Customer and spend shares per RFM segment at the test cutoff. The export rounds the Champions
 * customer share to three decimals, which would print one point too high, so that cell is the
 * checked fact computed from counts.
 */
export function rfmTable(): TableData {
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
    columns: ['Segment', 'Customers', 'Share of customers', 'Share of spend'],
    rows: segments.map((s) => [
      s.segment,
      finite(s.customers, `${s.segment} customers`),
      s === champions ? championsShare : finite(s.customer_share, `${s.segment} customer share`, true),
      finite(s.revenue_share, `${s.segment} spend share`, true),
    ]),
    formats: ['number', 'count', 'share', 'share'],
    note: "Customers at the September cutoff of the analysis; spend is everything they bought up to it. Champions' share of spend is high partly by construction.",
    refs: ['source:retention', 'retention.rfm.champions_customer_share', 'retention.rfm.champions_revenue_share'],
  };
}

/** ROC AUC of each model on the later test snapshot, for all customers and for lapsed ones only. */
export function modelsTable(): TableData {
  const models = RETENTION.tables.models;
  const auc = (name: string) => models.find((m) => m.model === name)?.roc_auc;
  if (auc('Baseline: most recent buyer first') !== numericFact('retention.model.rule_auc')) throw new Error('retention: rule AUC differs from its fact');
  if (auc('Gradient boosting') !== numericFact('retention.model.gb_auc')) throw new Error('retention: gradient-boosting AUC differs from its fact');
  return {
    columns: ['Model', 'ROC AUC, all customers', 'ROC AUC, lapsed customers only'],
    rows: models.map((m) => [m.model, finite(m.roc_auc, `${m.model} AUC`, true), finite(m.lapsed_roc_auc, `${m.model} lapsed AUC`, true)]),
    formats: ['number', 'number', 'number'],
    note: 'How well each model ranks the customers who ordered again within the window, scored on a later period than it learned from. Ranking accuracy, not a response to any offer.',
    refs: ['source:retention', 'retention.model.rule_auc', 'retention.model.gb_auc'],
  };
}

/** Lapsed customers ranked by score: observed later orders against a random selection of the same size. */
export function targetingTable(): TableData {
  return {
    columns: ['Share selected', 'Customers selected', 'Ordered again within the window', 'Expected to order again, random selection'],
    rows: RETENTION.tables.lapsed_targeting.map((r) => [
      finite(r.contact_share, 'share selected', true),
      finite(r.contacted, 'customers selected'),
      finite(r.returners_model, 'returned'),
      finite(r.returners_random, 'expected from random selection'),
    ]),
    formats: ['share', 'count', 'count', 'number'],
    note: 'Lapsed customers with the highest model scores, selected on paper only: nobody was contacted. These are observed orders, not the effect of an offer.',
    refs: ['source:retention', 'retention.winback.top20_customers'],
  };
}

/** The holdout-test sizing: customers needed in each group to detect each rise. */
export function holdoutTable(): TableData {
  return {
    columns: ['Customers sized for', 'Share who ordered again within the window', 'Rise to detect (percentage points)', 'Customers per group'],
    rows: RETENTION.tables.holdout_sizes.map((h) => [
      capitalise(h.group),
      finite(h.baseline_rate, `${h.group} baseline`, true),
      finite(h.uplift_pp, `${h.group} uplift`),
      finite(h.customers_per_arm, `${h.group} customers per group`),
    ]),
    formats: ['number', 'share', 'count', 'count'],
    note: 'A sample-size calculation only: nobody was contacted and no test was run. Where the customers needed per group exceed the customers in that group, the test would need lapsed customers from more than one period.',
    refs: ['source:retention', 'retention.winback.n_per_arm', 'retention.winback.baseline_rate', 'retention.winback.uplift_pp'],
  };
}
