// The Retention page's data adapters: the vendored retention and retail exports turned into the
// open tables of its Figures. Every number must be a source value (or a checked fact), never a
// rounded copy, a typed numeral or a synthesized outcome.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type TableData } from '@/components/kit/DataTable';
import { getFact, type FactId } from '@/lib/facts';
import * as sources from '@/lib/sources';
import {
  COHORTS,
  DEFAULT_COHORT_MONTH,
  RETAIL,
  RETENTION,
  figureProvenance,
  type Cohort,
  type ReturnMode,
  type RfmSegment,
} from '@/lib/retention/data';
import {
  cohortTable,
  holdoutTable,
  modelsTable,
  returnsTable,
  rfmTable,
  targetingTable,
} from '@/lib/retention/tables';

// provenanceOf stays the real function; one test makes it answer 'none' once.
vi.mock('@/lib/sources', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/sources')>();
  return { ...real, provenanceOf: vi.fn(real.provenanceOf) };
});

const render = (table: TableData) => renderToStaticMarkup(createElement(DataTable, { id: 't', caption: 'c', table, mode: 'open' }));
const bodyCells = (html: string) =>
  [...html.matchAll(/<td([^>]*)>([^<]*)<\/td>/g)].map((m) => ({ attrs: m[1]!, text: m[2]! }));
const numbersOf = (t: TableData) => t.rows.flatMap((r) => r.filter((v): v is number => typeof v === 'number'));
const column = (t: TableData, name: string) => {
  const i = t.columns.indexOf(name);
  if (i < 0) throw new Error(`no column ${name}`);
  return t.rows.map((r) => r[i]);
};
const value = (id: FactId) => getFact(id).value as number;

const ALL: readonly [name: string, table: () => TableData, source: 'source:retention' | 'source:retail'][] = [
  ['returns raw', () => returnsTable('raw'), 'source:retail'],
  ['returns clean', () => returnsTable('clean'), 'source:retail'],
  ['cohorts', cohortTable, 'source:retention'],
  ['rfm', rfmTable, 'source:retention'],
  ['models', modelsTable, 'source:retention'],
  ['targeting', targetingTable, 'source:retention'],
  ['holdout', holdoutTable, 'source:retention'],
];

describe('the source exports', () => {
  it('are the exports of @/lib/sources, not a second loader', () => {
    expect(RETENTION).toBe(sources.retention);
    expect(RETAIL).toBe(sources.retail);
  });

  it('give each public-data Figure its badge from the export metadata', () => {
    expect(figureProvenance('retention')).toBe('public-data');
    expect(figureProvenance('retail')).toBe('public-data');
    expect(sources.provenanceOf).toHaveBeenCalledWith('retention');
    expect(sources.provenanceOf).toHaveBeenCalledWith('retail');
  });

  it('refuses a source without public provenance instead of inventing a badge', () => {
    vi.mocked(sources.provenanceOf).mockReturnValueOnce('none');
    expect(() => figureProvenance('retention')).toThrow(/retention/);
    vi.mocked(sources.provenanceOf).mockReturnValueOnce('none');
    expect(() => figureProvenance('retail')).toThrow(/retail/);
  });
});

describe('cohorts', () => {
  it('has eleven cohorts of thirteen months each, January 2010 first and the default', () => {
    expect(COHORTS).toHaveLength(11);
    for (const c of COHORTS) expect(c.retention).toHaveLength(13);
    const january: Cohort = COHORTS[0]!;
    expect(january.cohort_month).toBe('2010-01');
    expect(january.cohort_size).toBe(368);
    expect(january.retention[1]).toBe(0.212);
    expect(DEFAULT_COHORT_MONTH).toBe('2010-01');
    expect(COHORTS.find((c) => c.cohort_month === DEFAULT_COHORT_MONTH)).toBe(january);
  });

  it('keeps all 143 values in the open table, in source order, as numeric shares', () => {
    const t = cohortTable();
    expect(t.columns).toHaveLength(15);
    expect(t.columns.slice(0, 3)).toEqual(['Cohort', 'Customers', 'Formation month']);
    expect(t.rows).toHaveLength(11);
    expect(t.rows[0]!.slice(0, 4)).toEqual(['Jan 2010', 368, 1, 0.212]);
    const values = t.rows.flatMap((r) => r.slice(2));
    expect(values).toHaveLength(143);
    expect(values).toEqual(COHORTS.flatMap((c) => c.retention));
    expect(t.formats).toEqual(['number', 'count', ...Array<string>(13).fill('share')]);
    // A later month can be higher than an earlier one: active that month, not survival.
    expect(t.rows[0]![4]).toBe(0.3179);
    expect(t.note).toContain('first order in the data');
    expect(t.note).toContain('not the share who kept buying every month since');
    expect(bodyCells(render(t)).slice(0, 4).map((c) => c.text)).toEqual(['Jan 2010', '368', '100%', '21%']);
  });
});

describe('returns', () => {
  const monthly = RETAIL.tables.monthly;
  type Key = 'returns_gbp_raw' | 'returns_gbp_clean' | 'sales_gbp_raw' | 'sales_gbp_clean';
  const total = (year: number, key: Key) =>
    monthly.filter((r) => r.month >= `${year}-01` && r.month <= `${year}-11`).reduce((s, r) => s + r[key], 0);

  it('has 25 months and only December 2011 is partial', () => {
    expect(monthly).toHaveLength(25);
    expect(monthly.filter((r) => r.partial).map((r) => r.month)).toEqual(['2011-12']);
  });

  it('pins the January to November facts the page prints', () => {
    expect(value('retail.returns.yoy_growth_raw')).toBe(0.2903);
    expect(value('retail.returns.yoy_growth_clean')).toBe(0.0239);
    expect(value('retail.returns.rate_2010_raw')).toBe(0.0285);
    expect(value('retail.returns.rate_2011_raw')).toBe(0.0368);
    expect(value('retail.returns.rate_2010_clean')).toBe(0.0209);
    expect(value('retail.returns.rate_2011_clean')).toBe(0.0217);
  });

  it('reproduces those facts from the monthly rows within export rounding', () => {
    // Monthly values are whole pounds and facts have four decimals: agreement to three decimals, not equality.
    for (const kind of ['raw', 'clean'] as const) {
      const r10 = total(2010, `returns_gbp_${kind}`);
      const r11 = total(2011, `returns_gbp_${kind}`);
      expect(r11 / r10 - 1).toBeCloseTo(value(`retail.returns.yoy_growth_${kind}`), 3);
      expect(r10 / total(2010, `sales_gbp_${kind}`)).toBeCloseTo(value(`retail.returns.rate_2010_${kind}`), 3);
      expect(r11 / total(2011, `sales_gbp_${kind}`)).toBeCloseTo(value(`retail.returns.rate_2011_${kind}`), 3);
    }
  });

  it.each(['raw', 'clean'] as const)('%s: keeps returned-order value as numeric count cells in pounds', (mode: ReturnMode) => {
    const t = returnsTable(mode);
    expect(t.columns).toEqual(['Month', 'Returned-order value (GBP)', 'Partial month']);
    expect(t.formats![1]).toBe('count');
    expect(column(t, 'Returned-order value (GBP)')).toEqual(monthly.map((r) => (mode === 'raw' ? r.returns_gbp_raw : r.returns_gbp_clean)));
    expect(column(t, 'Partial month')).toEqual([...Array<string>(24).fill('No'), 'Yes']);
    expect(t.rows[0]![0]).toBe('Dec 2009');
    expect(t.rows[24]![0]).toBe('Dec 2011');
    expect(t.refs).toEqual(['source:retail']);
    expect(t.note).toContain(mode === 'raw' ? 'Without the reversal rule' : 'With the reversal rule');
    const cells = bodyCells(render(t));
    const first = cells[1]!;
    expect(first.text).toBe(mode === 'raw' ? '19,338' : '15,091');
    expect(first.attrs).toContain('data-num');
    expect(first.attrs).toContain('text-right');
    expect(cells.some((c) => c.text.includes('£'))).toBe(false);
  });
});

describe('RFM segments', () => {
  it('pins the columns and takes the Champions share from the checked fact, never the rounded export', () => {
    const t = rfmTable();
    expect(t.columns).toEqual(['Segment', 'Customers', 'Share of customers', 'Share of spend']);
    expect(t.rows[0]![0]).toBe('Champions');
    expect(t.rows[0]![2]).toBe(0.2345);
    expect(t.rows[0]![2]).toBe(getFact('retention.rfm.champions_customer_share').value);
    expect(t.rows[0]![2]).not.toBe(0.235);
    expect(t.rows[0]![3]).toBe(getFact('retention.rfm.champions_revenue_share').value);
    expect(t.formats).toEqual(['number', 'count', 'share', 'share']);
    expect(t.refs).toEqual(expect.arrayContaining(['source:retention', 'retention.rfm.champions_customer_share']));
  });

  it('prints the Champions share as 23%, right-aligned with data-num', () => {
    const cells = bodyCells(render(rfmTable()));
    const champions = cells[2]!;
    expect(champions.text).toBe('23%');
    expect(champions.attrs).toContain('data-num');
    expect(champions.attrs).toContain('text-right');
    expect(cells[3]!.text).toBe('71%');
  });

  it('keeps every other segment as the export has it', () => {
    const t = rfmTable();
    const segments: readonly RfmSegment[] = RETENTION.tables.rfm_segments;
    expect(t.rows.map((r) => r[0])).toEqual(segments.map((s) => s.segment));
    expect(t.rows[0]![1]).toBe(segments[0]!.customers);
    expect(t.rows.slice(1).map((r) => r.slice(1))).toEqual(segments.slice(1).map((s) => [s.customers, s.customer_share, s.revenue_share]));
  });
});

describe('models', () => {
  it('names the real models with ROC AUC for all customers and for lapsed customers, as fractions', () => {
    const t = modelsTable();
    expect(t.columns).toEqual(['Model', 'ROC AUC, all customers', 'ROC AUC, lapsed customers only']);
    expect(column(t, 'Model')).toEqual(['Baseline: most recent buyer first', 'Logistic regression', 'Gradient boosting']);
    expect(column(t, 'ROC AUC, all customers')).toEqual([0.762, 0.792, 0.793]);
    expect(column(t, 'ROC AUC, lapsed customers only')).toEqual([0.685, 0.706, 0.71]);
    expect(t.formats).not.toContain('share');
    expect(t.refs).toEqual(expect.arrayContaining(['source:retention', 'retention.model.rule_auc', 'retention.model.gb_auc']));
    const printed = bodyCells(render(t)).map((c) => c.text);
    expect(printed).toEqual([
      'Baseline: most recent buyer first', '0.762', '0.685',
      'Logistic regression', '0.792', '0.706',
      'Gradient boosting', '0.793', '0.71',
    ]);
    expect(printed.some((p) => p.includes('%'))).toBe(false);
  });
});

describe('targeting and sizing stay separate', () => {
  it('targeting: observed later orders against a random selection, selected and never contacted', () => {
    const t = targetingTable();
    // Not "Returned within the window": on this page "returns" means returned-order value, so the
    // header says what happened, an order.
    expect(t.columns).toEqual(['Share selected', 'Customers selected', 'Ordered again within the window', 'Expected to order again, random selection']);
    expect(t.columns.join(' ')).not.toMatch(/return/i);
    expect(t.rows[0]).toEqual([0.05, 167, 116, 48.4]);
    expect(t.rows[1]).toEqual([0.1, 335, 216, 97.2]);
    expect(t.rows).toEqual(RETENTION.tables.lapsed_targeting.map((r) => [r.contact_share, r.contacted, r.returners_model, r.returners_random]));
    expect(t.formats).toEqual(['share', 'count', 'count', 'number']);
    expect(bodyCells(render(t)).slice(0, 8).map((c) => c.text)).toEqual(['5%', '167', '116', '48.4', '10%', '335', '216', '97.2']);
  });

  it('holdout: customers per group from the sizing, never customers selected', () => {
    const t = holdoutTable();
    // Some sizes exceed the group they are for (the top fifth of lapsed customers is far smaller), so the note says so.
    expect(t.note).toContain('Where the customers needed per group exceed the customers in that group');
    expect(t.columns).toContain('Customers per group');
    expect(t.columns).not.toContain('Customers selected');
    const fivePoints = t.rows.find((r) => r[0] === 'All lapsed customers' && r[2] === 5);
    expect(fivePoints?.[1]).toBe(getFact('retention.winback.baseline_rate').value);
    expect(fivePoints?.[3]).toBe(getFact('retention.winback.n_per_arm').value);
    expect(t.rows).toHaveLength(RETENTION.tables.holdout_sizes.length);
    expect(numbersOf(t)).toEqual(RETENTION.tables.holdout_sizes.flatMap((h) => [h.baseline_rate, h.uplift_pp, h.customers_per_arm]));
  });

  it('no header says contacted, per arm or money', () => {
    for (const t of [targetingTable(), holdoutTable()]) {
      for (const c of t.columns) expect(c).not.toMatch(/contact|per.?arm|revenue|GBP|saved|£/i);
    }
  });
});

describe('every table', () => {
  it.each(ALL)('%s: finite numbers, one format per column, refs from its source, no numerals outside the cells', (_, make, source) => {
    const t = make();
    expect(t.formats).toHaveLength(t.columns.length);
    for (const r of t.rows) expect(r).toHaveLength(t.columns.length);
    for (const v of numbersOf(t)) expect(Number.isFinite(v)).toBe(true);
    expect(t.refs.length).toBeGreaterThan(0);
    expect(t.refs).toContain(source);
    // Headers and notes are not marked as derived, so they carry no digits.
    for (const c of t.columns) expect(c).not.toMatch(/\d/);
    expect(t.note ?? '').not.toMatch(/\d/);
    expect(() => render(t)).not.toThrow();
  });

  it('no share column holds a value outside zero to one', () => {
    for (const [, make] of ALL) {
      const t = make();
      t.formats!.forEach((f, i) => {
        if (f !== 'share') return;
        for (const r of t.rows) {
          const v = r[i];
          expect(typeof v === 'number' && v >= 0 && v <= 1).toBe(true);
        }
      });
    }
  });
});
