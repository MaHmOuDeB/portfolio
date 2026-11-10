// The returns-cleaning Figure: one returned-order value series in GBP over every month of the
// export, with orders cancelled within the reversal window counted (raw) or removed (clean). The
// server draws the clean preset; the island draws the mode from its URL state with the same markup.
// Every number goes through Fact or Derived, the growth comparison is January to November in both
// years, the partial last month is marked and never compared, and the reversal named beside the
// period is the January one, not the larger December one.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReturnsFigure } from '@/components/retention/ReturnsFigure';
import { InertReturnsControls } from '@/components/retention/ReturnsFigureClient';
import { ReturnsFigureView } from '@/components/retention/ReturnsView';
import { readFigureParams } from '@/lib/figure/url-state';
import { FACTS, FACT_DISPLAYS, getFact } from '@/lib/facts';
import { factText } from '@/lib/facts/text';
import { RETAIL, figureProvenance, type ReturnMode } from '@/lib/retention/data';
import {
  RETURNS_ID,
  RETURNS_PRESETS,
  RETURNS_SCHEMA,
  RETURNS_TITLE,
  returnsAxis,
  returnsTableFrom,
} from '@/lib/retention/returns';
import { returnsTable } from '@/lib/retention/tables';
import { auditHtml } from '../../../scripts/truth-audit.ts';

const ROWS = RETAIL.tables.monthly;
const JANUARY = RETAIL.tables.largest_reversals.find((r) => r.value_gbp === getFact('retail.reversal.january_gbp').value)!;
const LARGEST = RETAIL.tables.largest_reversals.find((r) => r.value_gbp === getFact('retail.reversal.largest_gbp').value)!;

const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (markup: string) => decode(markup.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
/** Text with the spaces the tag stripping adds before punctuation removed again. */
const prose = (markup: string) => text(markup).replace(/ ([.,:;)])/g, '$1').replace(/\( /g, '(');

function view(mode: ReturnMode) {
  return renderToStaticMarkup(
    <ReturnsFigureView
      mode={mode}
      data={ROWS}
      evidence={{ provenance: figureProvenance('retail'), januaryReversalDate: JANUARY.date }}
      table={returnsTable(mode)}
      controls={<InertReturnsControls mode={mode} />}
    />,
  );
}

const CLEAN = view('clean');
const RAW = view('raw');
const SERVER = renderToStaticMarkup(<ReturnsFigure />);

const result = (html: string) => html.match(/<p data-figure-result=""[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
const audit = (html: string) =>
  auditHtml(`<!doctype html><html><head><title>t</title></head><body>${html}</body></html>`, {
    route: '/work/retention',
    factIds: new Set(Object.keys(FACTS)),
    factDisplays: FACT_DISPLAYS,
    denylist: [],
  });
/** Bars of one layout, in month order: [month, value, partial]. */
function bars(html: string, layout: 'wide' | 'narrow') {
  const svg = html.match(new RegExp(`<svg[^>]*data-layout="${layout}"[\\s\\S]*?</g></svg>`))?.[0] ?? '';
  return [...svg.matchAll(/<rect[^>]*data-month="([^"]+)"[^>]*data-value="([^"]+)"([^>]*)>/g)].map((m) => [
    m[1],
    Number(m[2]),
    m[3]!.includes('data-partial'),
  ]);
}

describe('the returns Figure as the server draws it', () => {
  it('states the relationship as its title and badges the export as public data', () => {
    expect(SERVER).toMatch(new RegExp(`<h3 id="${RETURNS_ID}-title"[^>]*>${RETURNS_TITLE}</h3>`));
    expect(RETURNS_TITLE).toBe('Removing reversed orders changes the returns story');
    expect(text(SERVER)).toContain('Public data');
    expect(SERVER).toContain(`data-figure="${RETURNS_ID}"`);
  });

  it('draws the clean preset: the clean growth fact, never the raw one', () => {
    expect(result(SERVER)).toContain('data-fact="retail.returns.yoy_growth_clean"');
    expect(result(SERVER)).not.toContain('data-fact="retail.returns.yoy_growth_raw"');
    expect(SERVER).toContain('Controls need JavaScript.');
  });

  it('loads its island on its own URL keys only', () => {
    expect(SERVER).toContain('data-island="idle"');
  });
});

describe('the result line', () => {
  it('uses the clean growth fact in clean mode and the raw one in raw mode', () => {
    expect(result(CLEAN)).toContain('data-fact="retail.returns.yoy_growth_clean"');
    expect(result(CLEAN)).not.toContain('yoy_growth_raw');
    expect(result(RAW)).toContain('data-fact="retail.returns.yoy_growth_raw"');
    expect(result(RAW)).not.toContain('yoy_growth_clean');
    expect(factText('retail.returns.yoy_growth_clean')).toBe('2%');
    expect(factText('retail.returns.yoy_growth_raw')).toBe('29%');
    expect(prose(result(CLEAN))).toContain('grew about 2%');
    expect(prose(result(RAW))).toContain('grew 29%');
  });

  it('says the period explicitly, January to November of each year, under a source marker', () => {
    for (const html of [CLEAN, RAW]) {
      expect(prose(result(html))).toContain('Jan–Nov 2011 versus Jan–Nov 2010');
      expect(result(html)).toMatch(/<span data-derived="source:retail">Jan–Nov 2011 versus Jan–Nov 2010<\/span>/);
    }
  });

  it('names the January reversal beside the period, by its fact and its source date, not the December one', () => {
    expect(JANUARY.date).toBe('2011-01-18');
    for (const html of [CLEAN, RAW]) {
      const line = result(html);
      expect(prose(line)).toContain('mostly one £77k order on 18 Jan 2011');
      expect(line).toContain('data-fact="retail.reversal.january_gbp"');
      expect(line).toContain(`<data value="${JANUARY.date}" data-derived="source:retail">18 Jan 2011</data>`);
      expect(html).not.toContain('retail.reversal.largest_gbp');
      expect(text(html)).not.toContain('£168k');
      expect(html).not.toContain(LARGEST.date);
    }
  });

  it('is growth in returned-order value, distinct from returns as a share of sales', () => {
    for (const html of [CLEAN, RAW]) {
      expect(html).not.toMatch(/retail\.returns\.rate_/);
      expect(prose(html)).toContain('not returns as a share of sales');
    }
  });
});

describe('the chart', () => {
  it('plots one returns series over every monthly row, in both layouts', () => {
    expect(ROWS).toHaveLength(25);
    for (const html of [CLEAN, RAW]) {
      for (const layout of ['wide', 'narrow'] as const) {
        const b = bars(html, layout);
        expect(b.map(([m]) => m)).toEqual(ROWS.map((r) => r.month));
      }
    }
    expect(bars(CLEAN, 'wide').map(([, v]) => v)).toEqual(ROWS.map((r) => r.returns_gbp_clean));
    expect(bars(RAW, 'wide').map(([, v]) => v)).toEqual(ROWS.map((r) => r.returns_gbp_raw));
  });

  it('marks the partial last month, and only it', () => {
    const b = bars(CLEAN, 'wide');
    expect(b.filter(([, , partial]) => partial).map(([m]) => m)).toEqual(['2011-12']);
    expect(ROWS.filter((r) => r.partial).map((r) => r.month)).toEqual(['2011-12']);
    for (const html of [CLEAN, RAW]) expect(html).toContain('Partial month');
  });

  it('never compares December with full months', () => {
    for (const html of [CLEAN, RAW]) {
      const words = prose(html);
      expect(words).toContain('partial month');
      expect(words).toMatch(/not compared with the full months/);
      expect(words).not.toMatch(/December 2011 (?:against|versus|compared)/i);
      expect(words).not.toMatch(/Dec(?:ember)? 2010 (?:against|versus)/i);
    }
  });

  it('keeps one value axis from zero for both modes, holding every value of either mode', () => {
    const { top, ticks } = returnsAxis(ROWS);
    const max = Math.max(...ROWS.flatMap((r) => [r.returns_gbp_raw, r.returns_gbp_clean]));
    expect(top).toBeGreaterThanOrEqual(max);
    expect(ticks[0]).toBe(0);
    const yTicks = (html: string) => [...html.matchAll(/data-tick="y"[^>]*>(?:<tspan>)?([^<]+)</g)].map((m) => m[1]);
    expect(yTicks(RAW)).toEqual(yTicks(CLEAN));
    expect(yTicks(CLEAN)).toContain('150,000');
  });

  it('states each mode in words in the accessible name, with no digit', () => {
    const names = (html: string) => [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => decode(m[1]!));
    for (const html of [CLEAN, RAW]) for (const name of names(html)) expect(name).not.toMatch(/\d/);
    const chartName = (html: string) => html.match(/<svg[^>]*role="img"[^>]*aria-label="([^"]*)"/)?.[1];
    expect(chartName(CLEAN)).not.toBe(chartName(RAW));
  });
});

describe('the table', () => {
  it.each(['raw', 'clean'] as const)('is the sourced table for %s, with numeric value cells', (mode) => {
    const t = returnsTableFrom(ROWS, mode);
    expect(t).toEqual(returnsTable(mode));
    expect(t.columns).toEqual(['Month', 'Returned-order value (GBP)', 'Partial month']);
    expect(t.formats?.[1]).toBe('count');
    for (const row of t.rows) expect(typeof row[1]).toBe('number');
    expect(t.refs).toEqual(['source:retail']);
  });

  it('shows the current mode in the folded and the open table', () => {
    // January 2011, the month of the reversal: printed by the table's count format, under source refs.
    const cell = (html: string) => [...html.matchAll(/<td[^>]*data-derived="source:retail"[^>]*data-num=""[^>]*>([^<]+)<\/td>/g)].map((m) => m[1]);
    expect(cell(RAW)).toContain('91,254');
    expect(cell(CLEAN)).not.toContain('91,254');
    expect(cell(CLEAN)).toContain('11,758');
    // the folded table and the open no-JS table both hold the current mode
    expect(cell(RAW).filter((v) => v === '91,254')).toHaveLength(2);
  });
});

describe('the rule and the copy', () => {
  it('prints the rule window through Derived with the retail source ref', () => {
    for (const html of [CLEAN, RAW]) {
      expect(html).toContain('<data value="24" data-derived="source:retail">24</data>');
      expect(prose(html)).toContain('cancelled within 24 hours');
    }
  });

  it.each([
    ['clean', CLEAN],
    ['raw', RAW],
    ['server', SERVER],
  ])('%s: no stray number, no banned wording', (_, html) => {
    expect(audit(html)).toEqual([]);
    const words = text(html);
    expect(words).not.toMatch(/two orders/i);
    expect(words).not.toMatch(/same[- ]day/i);
    expect(words).not.toMatch(/\bROI\b/);
    expect(words).not.toMatch(/[←-⇿·]/);
    expect(words).not.toMatch(/\bfound\b/i);
  });
});

describe('the controls', () => {
  it('sit in a group named by the Figure title, with the mode choice and Reset', () => {
    expect(CLEAN).toMatch(new RegExp(`<div role="group" aria-labelledby="${RETURNS_ID}-title"[^>]*>`));
    const group = CLEAN.match(/<div role="group" aria-labelledby="returns-title"[^>]*>([\s\S]*?)<\/fieldset>/)?.[1] ?? '';
    expect(text(group)).toContain('Reversed orders');
    expect(text(group)).toContain('Counted as returns');
    expect(text(group)).toContain('Removed');
    const checked = (html: string) => html.match(/<input type="radio"[^>]*name="returns-mode"[^>]*checked=""[^>]*value="([a-z]+)"/)?.[1];
    expect(checked(CLEAN)).toBe('clean');
    expect(checked(RAW)).toBe('raw');
    expect(text(CLEAN)).toContain('Reset');
  });

  it('reads a hostile or unknown URL as the clean preset', () => {
    const read = (q: string) => readFigureParams(new URLSearchParams(q), RETURNS_ID, RETURNS_SCHEMA, RETURNS_PRESETS).values.mode;
    expect(read('')).toBe('clean');
    expect(read('returns.mode=raw')).toBe('raw');
    expect(read('returns.mode=RAW')).toBe('clean');
    expect(read('returns.mode=__proto__&returns.preset=constructor')).toBe('clean');
    expect(read('returns.mode=raw&returns.mode=clean')).toBe('raw');
    expect(read('other.mode=raw')).toBe('clean');
  });
});
