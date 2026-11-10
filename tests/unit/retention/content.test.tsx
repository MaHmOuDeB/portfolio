// The Retention page's sourced prose sections. Every number is a <Fact> or a <Derived> with real
// refs (the same truth audit the build runs), and the wording keeps the honesty rules: a public
// dataset rebuilt in 2026, a sized (never run) win-back test, prediction rather than treatment
// effect, and the exact Champions definition.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  RetentionChecks,
  RetentionLimits,
  RetentionMethod,
  RetentionSources,
  RetentionSummary,
} from '../../../content/retention';
import { FACTS, FACT_DISPLAYS, getFact } from '@/lib/facts';
import { RETAIL, RETENTION } from '@/lib/retention/data';
import { sampleSizePerArm } from '@/lib/stats';
import { auditHtml } from '../../../scripts/truth-audit.ts';

const repo = join(import.meta.dirname, '../../..');
const lock = JSON.parse(readFileSync(join(repo, 'sources.lock.json'), 'utf8')) as {
  sources: Record<string, { repo: string; commit: string; path: string }>;
};

const SECTIONS: readonly [name: string, Section: () => ReactNode][] = [
  ['summary', RetentionSummary],
  ['method', RetentionMethod],
  ['checks', RetentionChecks],
  ['limits', RetentionLimits],
  ['sources', RetentionSources],
];

const html = (Section: () => ReactNode) => renderToStaticMarkup(<Section />);
const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** Visible text: tags removed, entities decoded, whitespace collapsed. */
const text = (markup: string) => decode(markup.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const page = SECTIONS.map(([, S]) => html(S)).join('\n');
const pageText = text(page);
const ctx = { route: '/work/retention', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] };

describe('every section', () => {
  it.each(SECTIONS)('%s: renders with every number under a fact or derived marker', (_, Section) => {
    const markup = html(Section);
    expect(text(markup).length).toBeGreaterThan(0);
    expect(auditHtml(`<!doctype html><html><head><title>t</title></head><body>${markup}</body></html>`, ctx)).toEqual([]);
  });

  it('marks derived numbers with refs that name their source', () => {
    for (const m of page.matchAll(/data-derived="([^"]*)"/g)) {
      expect(m[1]!.split(' ').some((r) => r.startsWith('source:') || r in FACTS)).toBe(true);
    }
  });
});

describe('honest wording', () => {
  it('names the project as a public dataset, rebuilt in 2026, with the literal year', () => {
    expect(pageText).toContain('public dataset, rebuilt in 2026');
    const source = readFileSync(join(repo, 'content/retention.tsx'), 'utf8');
    expect(source).toContain('public dataset, rebuilt in 2026');
    expect(source).not.toMatch(/getFullYear|new Date\(|Date\.now/);
  });

  it('says the win-back test was sized, that nobody was contacted and no test was run', () => {
    expect(pageText).toMatch(/\bsized\b/);
    expect(pageText).toContain('Nobody was contacted');
    expect(pageText).toContain('no test was run');
  });

  it('gives the exact Champions definition and its by-construction caveat', () => {
    expect(pageText).toContain(
      '4 or 5 out of 5 on each of recency, frequency and spend (roughly the top two-fifths on each)',
    );
    expect(pageText).toContain('partly by construction');
  });

  it('keeps prediction apart from treatment effect', () => {
    expect(pageText).toContain('rank is not uplift');
    expect(pageText).toContain('not how anyone would respond');
  });

  it('describes the reversal rule as the source SQL does, and the review that caught it', () => {
    expect(pageText).toContain('orders cancelled within 24 hours');
    expect(pageText).toContain('same customer, for the same product and quantity');
    expect(pageText).toContain('The inflated growth was not my catch: a review caught it and I fixed it.');
  });

  it.each([
    ['two orders', /two orders/i],
    ['same-day', /same[- ]day/i],
    ['ran', /\bran\b/i],
    ['designed', /\bdesign(ed)?\b/i],
    ['ROI', /\bROI\b/],
    ['top fifth', /top fifth/i],
    ['top-spending', /top[- ]spending/i],
    ['we decided', /we decided/i],
    ['the business', /the business/i],
    ['rolled out', /rolled out/i],
    ['launched', /launched/i],
    ['customers responded', /customers responded/i],
    ['29% higher', /returns? (were |was )?\S+ higher/i],
    ['I found', /\bI found\b/i],
    ['money saved', /saved|revenue caused|caused revenue/i],
    ['other studies', /Pulse|Weather|Audible/],
    ['banned words', /passionate|rockstar|AI[- ]powered/i],
    ['customers per arm', /per arm|\barm\b/i],
    ['contacted header', /Customers contacted|contacted customers/i],
  ])('never says %s', (_, pattern) => {
    expect(pageText).not.toMatch(pattern);
  });
});

describe('the summary', () => {
  const summary = html(RetentionSummary);

  it('has the six labelled items, the decision as what I would recommend', () => {
    const labels = [...summary.matchAll(/<dt[^>]*>([^<]*)<\/dt>/g)].map((m) => decode(m[1]!));
    expect(labels).toEqual(['Question', 'My role', 'Method', 'Result', 'What I would recommend', 'Next step']);
  });

  it('prints the returns growth through the retail facts, mostly one order on its source date', () => {
    expect(summary).toContain('data-fact="retail.returns.yoy_growth_raw"');
    expect(summary).toContain('data-fact="retail.returns.yoy_growth_clean"');
    const method = html(RetentionMethod);
    expect(method).toContain('data-fact="retail.reversal.january_gbp"');
    const january = RETAIL.tables.largest_reversals.find((r) => r.value_gbp === getFact('retail.reversal.january_gbp').value);
    expect(january?.date).toBe('2011-01-18');
    expect(text(method)).toContain('mostly from one £77k order, placed on 18 Jan 2011 and cancelled within 24 hours');
  });

  it('derives the target rate from the baseline and the uplift', () => {
    const target = /<data value="([^"]+)" data-derived="retention\.winback\.baseline_rate retention\.winback\.uplift_pp">([^<]*)<\/data>/.exec(summary);
    expect(target).not.toBeNull();
    expect(Number(target![1])).toBeCloseTo(0.34, 10);
    expect(target![2]).toBe('34%');
    expect(summary).toContain('data-fact="retention.winback.n_per_arm"');
  });
});

describe('how I checked this', () => {
  it("the site's own tested sample-size code gives the analysis' figure", () => {
    const n = sampleSizePerArm({
      baseline: getFact('retention.winback.baseline_rate').value as number,
      mde: (getFact('retention.winback.uplift_pp').value as number) / 100,
      mdeType: 'absolute',
      alpha: 0.05,
      power: 0.8,
    });
    expect(n).toBe(getFact('retention.winback.n_per_arm').value);
    expect(text(html(RetentionChecks))).toContain('scipy and statsmodels');
  });

  it('gives the AUC interval as test-sample variability only', () => {
    const checks = html(RetentionChecks);
    expect(checks).toContain('data-fact="retention.model.auc_gain_low"');
    expect(checks).toContain('data-fact="retention.model.auc_gain_high"');
    expect(text(checks)).toContain('test-sample variability only');
  });
});

describe('the limits', () => {
  const limits = html(RetentionLimits);

  it('lists at least two concrete limits', () => {
    expect([...limits.matchAll(/<li/g)].length).toBeGreaterThanOrEqual(2);
    expect(text(limits)).toContain('historic, observational data');
    expect(text(limits)).toContain('does not cover retraining');
  });

  it('shows the calibration gap from the lowest-scored tenth of the source table', () => {
    const lowest = RETENTION.tables.calibration[0]!;
    expect(lowest.bin).toBe(0);
    expect(limits).toContain(`<data value="${lowest.predicted}" data-derived="source:retention">3.1%</data>`);
    expect(limits).toContain(`<data value="${lowest.observed}" data-derived="source:retention">8.7%</data>`);
    expect(text(limits)).toContain('not calibrated probabilities');
  });
});

describe('the sources', () => {
  const sources = html(RetentionSources);
  const hrefs = [...sources.matchAll(/href="([^"]+)"/g)].map((m) => decode(m[1]!));

  it.each(['retention', 'retail'])('links the %s repository and export at the pinned commit', (id) => {
    const { repo: name, commit, path } = lock.sources[id]!;
    expect(hrefs).toContain(`https://github.com/${name}/tree/${commit}`);
    expect(hrefs).toContain(`https://github.com/${name}/blob/${commit}/${path}`);
    expect(hrefs).toContain(`https://github.com/${name}/blob/${commit}/sql/01_clean.sql`);
  });

  it('never links a moving branch', () => {
    for (const h of hrefs) expect(h).not.toMatch(/\/(tree|blob)\/(main|master|HEAD)\b/);
  });

  it('links the dataset and its licence as the exports name them', () => {
    expect(RETAIL._meta.dataset).toEqual(RETENTION._meta.dataset);
    expect(hrefs).toContain(RETENTION._meta.dataset.url);
    expect(hrefs).toContain('https://creativecommons.org/licenses/by/4.0/');
    expect(text(sources)).toContain(RETENTION._meta.dataset.name);
    expect(text(sources)).toContain(RETENTION._meta.dataset.licence);
  });
});
