// The RFM Figure's plotting data, and the constants of the source code that the Retention copy and
// Figures print (the Champions rule, the label window, the interval level). Server only (it reads facts
// through ./data). The export rounds the Champions customer share to three decimals, which would
// print one point too high, so the plotted Champions share is the checked fact, as in rfmTable: the
// bar, the readout and the table all say the same.
import type { DerivedRef } from '@/components/kit/Derived';
import { numericFact, type RfmSegment } from './data';

/**
 * src/analysis.py rule_segment and quintile_score: customers are scored 1 to TOP_SCORE by rank on
 * recency, frequency and spend, and Champions score at least CHAMPIONS_MIN_SCORE on each.
 */
export const CHAMPIONS_MIN_SCORE = 4;
export const TOP_SCORE = 5;

/**
 * sql/02_features.sql: the label window after a cutoff, in days; src/analysis.py: lapsed means no
 * order in the window before it.
 */
export const WINDOW_DAYS = 90;
/** src/analysis.py: the level of the paired bootstrap interval on the AUC gain. */
export const INTERVAL_LEVEL = 0.95;

export type RfmBar = {
  segment: string;
  /** Share of customers, a raw fraction. */
  customers: number;
  /** Share of spend up to the cutoff, a raw fraction. */
  spend: number;
  customerRefs: readonly DerivedRef[];
  spendRefs: readonly DerivedRef[];
};

const SOURCE: readonly DerivedRef[] = ['source:retention'];

function fraction(v: number, what: string): number {
  if (!Number.isFinite(v) || v < 0 || v > 1) throw new RangeError(`rfm: ${what} is not a share: ${String(v)}`);
  return v;
}

/** One bar pair per segment, in export order, with the Champions customer share from its fact. */
export function rfmPlotRows(rows: readonly RfmSegment[]): RfmBar[] {
  const championsShare = numericFact('retention.rfm.champions_customer_share');
  const championsSpend = numericFact('retention.rfm.champions_revenue_share');
  const champions = rows.find((s) => s.segment === 'Champions');
  if (!champions) throw new Error('rfm: no Champions segment in the export');
  // The fact must be the export's own value before its rounding, never another number.
  if (Math.abs(champions.customer_share - championsShare) > 0.0005 + 1e-12) {
    throw new Error(`rfm: Champions share ${championsShare} does not round to the export's ${champions.customer_share}`);
  }
  if (champions.revenue_share !== championsSpend) throw new Error('rfm: Champions spend share differs from its fact');
  return rows.map((s) =>
    s === champions
      ? {
          segment: s.segment,
          customers: championsShare,
          spend: championsSpend,
          customerRefs: ['retention.rfm.champions_customer_share'],
          spendRefs: ['retention.rfm.champions_revenue_share'],
        }
      : {
          segment: s.segment,
          customers: fraction(s.customer_share, `${s.segment} customer share`),
          spend: fraction(s.revenue_share, `${s.segment} spend share`),
          customerRefs: SOURCE,
          spendRefs: SOURCE,
        },
  );
}
