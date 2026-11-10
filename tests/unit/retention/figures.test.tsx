// The cohort, RFM and model evidence Figures. Every number is a source value (through a table, a
// <Derived> with a source ref, or a mark's data-value) or a <Fact>; the charts plot exactly what the
// tables hold.
// - Cohorts (`cohorts`, interactive): month zero is the cohort's formation, every later month is
//   the share who ordered in that month (not survival), so a line can rise again. At 600 px and up
//   the heatmap shows every cohort with the selected one outlined and labelled; below it, the
//   selected cohort's line. Both are drawn, and CSS shows one of them with display: none.
// - RFM (`rfm`, static): customer and spend shares per segment as two series on one zero-to-all
//   axis, with the checked Champions fact in place of the export's rounded share.
// - Models (`models`, static): the rule against gradient boosting only, the gain and its interval
//   through the facts, never a gain computed from the two AUCs.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CohortFigure } from '@/components/retention/CohortFigure';
import { InertCohortControls } from '@/components/retention/CohortFigureClient';
import { CohortFigureView } from '@/components/retention/CohortView';
import { ModelFigure } from '@/components/retention/ModelFigure';
import { RfmFigure } from '@/components/retention/RfmFigure';
import { readFigureParams } from '@/lib/figure/url-state';
import { FACTS, FACT_DISPLAYS, formatValue, getFact } from '@/lib/facts';
import { factText } from '@/lib/facts/text';
import { COHORTS, DEFAULT_COHORT_MONTH, RETENTION, figureProvenance } from '@/lib/retention/data';
import {
  COHORTS_ID,
  COHORTS_TITLE,
  cohortAxis,
  cohortPresets,
  cohortSchema,
  cohortTableFrom,
} from '@/lib/retention/cohorts';
import { CHAMPIONS_MIN_SCORE, TOP_SCORE, rfmPlotRows } from '@/lib/retention/rfm';
import { cohortTable, modelsTable, rfmTable } from '@/lib/retention/tables';
import { auditHtml } from '../../../scripts/truth-audit.ts';

const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (markup: string) => decode(markup.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const prose = (markup: string) => text(markup).replace(/ ([.,:;)])/g, '$1').replace(/\( /g, '(');
const result = (html: string) => html.match(/<p data-figure-result=""[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
const caption = (html: string) => html.match(/<figcaption[^>]*><p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const tags = (html: string, selector: RegExp) => [...html.matchAll(selector)].map((m) => m[0]);
/** The open (no-JS) table's cells, as printed. */
function openCells(html: string, id: string) {
  const at = html.indexOf(`id="${id}-table-open-caption"`);
  expect(at).toBeGreaterThanOrEqual(0);
  const table = html.slice(at, html.indexOf('</table>', at));
  return [...table.matchAll(/<td([^>]*)>([^<]*)<\/td>/g)].map((m) => ({ attrs: m[1]!, text: m[2]! }));
}
const audit = (html: string) =>
  auditHtml(`<!doctype html><html><head><title>t</title></head><body>${html}</body></html>`, {
    route: '/work/retention',
    factIds: new Set(Object.keys(FACTS)),
    factDisplays: FACT_DISPLAYS,
    denylist: [],
  });
const share = (v: number) => formatValue(v, 'share');

// Values a source-derived <data> may hold: a leaf of the retention export or a listed constant of
// its source code (the Champions scores, the label window, the interval level).
function leafValues(x: unknown, out = new Set<string>()): Set<string> {
  if (x !== null && typeof x === 'object') for (const v of Object.values(x)) leafValues(v, out);
  else out.add(String(x));
  return out;
}
const EXPORT_VALUES = leafValues(RETENTION);
const CODE_CONSTANTS = ['4', '5', '90', '0.95'];
function untracedData(html: string): string[] {
  return tags(html, /<data [^>]*>/g)
    .filter((t) => attr(t, 'data-derived') !== undefined)
    .filter((t) => {
      const value = attr(t, 'value')!;
      const refs = attr(t, 'data-derived')!.split(' ');
      expect(refs).toEqual(['source:retention']);
      return !EXPORT_VALUES.has(value) && !CODE_CONSTANTS.includes(value);
    });
}

const PROVENANCE = figureProvenance('retention');

function cohortView(cohort: string, extra: { faultAfterChange?: true; changed?: boolean } = {}) {
  return renderToStaticMarkup(
    <CohortFigureView
      rows={COHORTS}
      cohort={cohort}
      provenance={PROVENANCE}
      table={cohortTable()}
      controls={<InertCohortControls rows={COHORTS} cohort={cohort} />}
      {...extra}
    />,
  );
}

/** One chart mode's wrapper: the markup from its data-cohort-mode element to the end of its chart. */
function mode(html: string, which: 'heatmap' | 'line') {
  const at = html.indexOf(`data-cohort-mode="${which}"`);
  expect(at).toBeGreaterThanOrEqual(0);
  const start = html.lastIndexOf('<div', at);
  const end = html.indexOf('</svg></div></div>', at);
  return { open: html.slice(start, html.indexOf('>', at) + 1), body: html.slice(start, end) };
}

const SERVER = renderToStaticMarkup(<CohortFigure rows={COHORTS} />);
const JAN = COHORTS[0]!;
const MAR = COHORTS[2]!;

describe('the cohort Figure', () => {
  it('states the relationship as its title, has the id cohorts and badges the export as public data', () => {
    expect(COHORTS_TITLE).toBe('Repeat ordering varies by cohort and month');
    expect(COHORTS_ID).toBe('cohorts');
    expect(SERVER).toMatch(new RegExp(`<h3 id="cohorts-title"[^>]*>${COHORTS_TITLE}</h3>`));
    expect(SERVER).toContain('data-figure="cohorts"');
    expect(text(SERVER)).toContain('Public data');
  });

  it('its URL schema is the eleven cohort months of the export, January 2010 by default, and a hostile value falls back', () => {
    const schema = cohortSchema(COHORTS);
    expect(schema.cohort.kind).toBe('enum');
    expect(schema.cohort.values).toEqual(RETENTION.tables.cohort_matrix.map((c) => c.cohort_month));
    expect(schema.cohort.values).toHaveLength(11);
    const presets = cohortPresets(COHORTS);
    expect(presets.default.cohort).toBe(DEFAULT_COHORT_MONTH);
    expect(presets.default.cohort).toBe('2010-01');
    const read = (q: string) => readFigureParams(new URLSearchParams(q), COHORTS_ID, schema, presets).values.cohort;
    expect(read('cohorts.cohort=2010-03')).toBe('2010-03');
    for (const bad of ['cohorts.cohort=2099-01', 'cohorts.cohort=__proto__', 'cohorts.cohort=2010-3', 'cohorts.preset=constructor']) {
      expect(read(bad), bad).toBe('2010-01');
    }
  });

  it('keeps all 143 cohort values in the open table, each printed from its source fraction', () => {
    expect(cohortTableFrom(COHORTS)).toEqual(cohortTable());
    const cells = openCells(SERVER, COHORTS_ID);
    expect(cells).toHaveLength(COHORTS.length * 15);
    const shares = COHORTS.flatMap((c, r) => cells.slice(r * 15 + 2, r * 15 + 15).map((cell, i) => [cell.text, share(c.retention[i]!)]));
    expect(shares).toHaveLength(143);
    for (const [printed, expected] of shares) expect(printed).toBe(expected);
    expect(cells[0]!.text).toBe('Jan 2010');
    expect(cells[1]!.text).toBe('368');
    expect(cells.every((c) => c.attrs.includes('data-derived="source:retention"'))).toBe(true);
  });

  it('says month zero is the cohort forming and a later month counts who ordered in it, not who kept buying', () => {
    const c = prose(caption(SERVER));
    expect(c).toMatch(/Month zero, the first order itself, includes every member by definition/);
    expect(c).toMatch(/ordered again in that later month, so a share can rise again/);
    expect(c).toMatch(/not the share still ordering every month since/);
    expect(cohortTable().columns[2]).toBe('Formation month');
    expect(c).not.toMatch(/\breturned\b|\bretained\b|\bsurviv/i);
  });

  it('draws both modes, each shown or hidden by display at 600 px, never moved off screen', () => {
    const heat = mode(SERVER, 'heatmap');
    const line = mode(SERVER, 'line');
    expect(attr(heat.open, 'class')!.split(' ')).toEqual(expect.arrayContaining(['hidden', 'min-[37.5rem]:block']));
    expect(attr(line.open, 'class')!.split(' ')).toEqual(['min-[37.5rem]:hidden']);
    for (const m of [heat.open, line.open]) expect(m).not.toMatch(/sr-only|absolute|-left-|translate|clip/);
    // one ChartFrame layout each: the Figure's own breakpoint replaces the frame's narrow/wide switch
    expect(tags(heat.body, /<svg[^>]*data-chart-frame[^>]*>/g)).toHaveLength(1);
    expect(tags(line.body, /<svg[^>]*data-chart-frame[^>]*>/g)).toHaveLength(1);
  });

  it('the heatmap holds every later month of every cohort, as source values with visible labels', () => {
    const heat = mode(SERVER, 'heatmap').body;
    const cells = tags(heat, /<rect[^>]*data-cell=""[^>]*>/g);
    expect(cells).toHaveLength(COHORTS.length * 12);
    const labels = tags(heat, /<text[^>]*data-cell-label=""[^>]*>[^<]*<\/text>/g);
    expect(labels).toHaveLength(COHORTS.length * 12);
    for (const c of COHORTS) {
      for (let m = 1; m <= 12; m++) {
        const cell = cells.find((t) => attr(t, 'data-cohort') === c.cohort_month && attr(t, 'data-month') === String(m))!;
        expect(Number(attr(cell, 'data-value'))).toBe(c.retention[m]);
        const label = labels.find((t) => attr(t, 'data-cohort') === c.cohort_month && attr(t, 'data-month') === String(m))!;
        expect(text(label)).toBe(share(c.retention[m]!));
        expect(label).toContain('data-derived="source:retention"');
        expect(label).toContain('data-num=""');
      }
    }
    // one sequential hue: every cell is series-1, its opacity rising with the value
    expect(cells.every((t) => attr(t, 'fill') === 'var(--color-series-1)')).toBe(true);
    const byValue = cells.map((t) => [Number(attr(t, 'data-value')), Number(attr(t, 'fill-opacity'))] as const).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < byValue.length; i++) expect(byValue[i]![1]).toBeGreaterThanOrEqual(byValue[i - 1]![1]);
    expect(Math.max(...byValue.map(([, o]) => o))).toBeLessThanOrEqual(0.6);
    // the cohorts are the y tick labels, in export order
    expect(tags(heat, /<text[^>]*data-tick="y"[^>]*>[^<]*<\/text>/g).map(text)).toEqual(
      ['Jan 2010', 'Feb 2010', 'Mar 2010', 'Apr 2010', 'May 2010', 'Jun 2010', 'Jul 2010', 'Aug 2010', 'Sept 2010', 'Oct 2010', 'Nov 2010'],
    );
  });

  it('clears the whole plot to the background before the cells, so no row gridline crosses a printed value', () => {
    const heat = mode(SERVER, 'heatmap').body;
    const clear = tags(heat, /<rect[^>]*data-plot-clear=""[^>]*>/g);
    expect(clear).toHaveLength(1);
    expect(Number(attr(clear[0]!, 'x'))).toBe(0);
    expect(Number(attr(clear[0]!, 'width'))).toBe(1000);
    expect(Number(attr(clear[0]!, 'y'))).toBe(0);
    expect(attr(clear[0]!, 'fill')).toBe('var(--color-bg)');
    // inside the mark layer, after the frame's gridlines and before the first cell
    const layer = heat.indexOf('data-mark-layer');
    expect(heat.indexOf('data-plot-clear')).toBeGreaterThan(layer);
    expect(heat.lastIndexOf('data-grid', layer)).toBeGreaterThan(-1);
    expect(heat.indexOf('data-plot-clear')).toBeLessThan(heat.indexOf('data-cell=""'));
  });

  it('outlines and labels the selected cohort row, January by default and March when March is chosen', () => {
    for (const [html, month] of [[SERVER, '2010-01'], [cohortView('2010-03'), '2010-03']] as const) {
      const heat = mode(html, 'heatmap').body;
      const outline = tags(heat, /<rect[^>]*data-selected=[^>]*>/g);
      expect(outline).toHaveLength(1);
      expect(attr(outline[0]!, 'data-selected')).toBe(month);
      expect(attr(outline[0]!, 'stroke')).toBe('var(--color-ink)');
      expect(attr(outline[0]!, 'fill')).toBe('none');
      expect(tags(heat, /<text[^>]*data-selected-label[^>]*>[^<]*<\/text>/g).map(text)).toEqual(['Selected']);
    }
  });

  it('the line is the selected cohort’s actual months, and January rises from month one to month two', () => {
    const dots = (html: string) =>
      tags(mode(html, 'line').body, /<circle[^>]*data-mark=""[^>]*>/g).map((t) => ({
        cohort: attr(t, 'data-cohort'),
        month: Number(attr(t, 'data-month')),
        value: Number(attr(t, 'data-value')),
        y: Number(attr(t, 'cy')),
      }));
    const jan = dots(SERVER);
    expect(jan.map((d) => d.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(jan.map((d) => d.value)).toEqual(JAN.retention.slice(1));
    expect(jan[0]!.value).toBe(0.212);
    expect(jan[1]!.value).toBe(0.3179);
    // higher on the chart (smaller y) in month two: the line is never forced to fall
    expect(jan[1]!.y).toBeLessThan(jan[0]!.y);
    const mar = dots(cohortView('2010-03'));
    expect(mar.every((d) => d.cohort === '2010-03')).toBe(true);
    expect(mar.map((d) => d.value)).toEqual(MAR.retention.slice(1));
    expect(text(mode(cohortView('2010-03'), 'line').body)).toContain('Mar 2010 cohort');
  });

  it('keeps the same axis for every cohort, from zero past the largest later month', () => {
    const { top, ticks } = cohortAxis(COHORTS);
    const max = Math.max(...COHORTS.flatMap((c) => c.retention.slice(1)));
    expect(top).toBeGreaterThanOrEqual(max);
    expect(top).toBe(0.4);
    expect(ticks).toEqual([0, 0.1, 0.2, 0.3, 0.4]);
    const yTicks = (html: string) => tags(mode(html, 'line').body, /<text[^>]*data-tick="y"[^>]*>[\s\S]*?<\/text>/g).map(text);
    expect(yTicks(SERVER)).toEqual(yTicks(cohortView('2010-11')));
  });

  it('the result line states the selected cohort’s own values, as source-derived numbers', () => {
    const jan = prose(result(SERVER));
    expect(jan).toBe(`In the month after their first order, ${share(JAN.retention[1]!)} of the Jan 2010 cohort (${JAN.cohort_size} customers) ordered again; in the twelfth month after it, ${share(JAN.retention[12]!)} did.`);
    const mar = prose(result(cohortView('2010-03')));
    expect(mar).toContain(`${share(MAR.retention[1]!)} of the Mar 2010 cohort (${MAR.cohort_size} customers) ordered again`);
    expect(mar).toContain(`in the twelfth month after it, ${share(MAR.retention[12]!)} did.`);
    expect(untracedData(SERVER)).toEqual([]);
    expect(result(SERVER)).toContain('data-derived="source:retention"');
  });

  it('carries no untraced number, and its charts are named in words with no digit', () => {
    for (const html of [SERVER, cohortView('2010-07')]) {
      expect(audit(html)).toEqual([]);
      for (const label of tags(html, /aria-label="[^"]*"/g)) expect(label).not.toMatch(/\d/);
    }
  });

  it('the seam: the view throws only once a change has happened, and the server never sets it', () => {
    expect(() => cohortView('2010-02', { faultAfterChange: true })).not.toThrow();
    expect(() => cohortView('2010-02', { faultAfterChange: true, changed: true })).toThrow(/test seam/);
    expect(() => cohortView('2010-02', { changed: true })).not.toThrow();
    expect(SERVER).not.toContain('faultAfterChange');
  });

  it('refuses rows that are not the export’s, so the chart and the table cannot disagree', () => {
    const changed = COHORTS.map((c, i) => (i === 0 ? { ...c, cohort_size: c.cohort_size + 1 } : c));
    expect(() => renderToStaticMarkup(<CohortFigure rows={changed} />)).toThrow(/export/);
  });
});

const RFM = renderToStaticMarkup(<RfmFigure rows={RETENTION.tables.rfm_segments} />);
const SEGMENTS = RETENTION.tables.rfm_segments;

describe('the RFM Figure', () => {
  it('states its finding as the title and badges the export', () => {
    expect(RFM).toMatch(/<h3 id="rfm-title"[^>]*>Champions account for more spend than their customer share<\/h3>/);
    expect(RFM).toContain('data-figure="rfm"');
    expect(text(RFM)).toContain('Public data');
    expect(RFM).not.toContain('data-figure-controls');
  });

  it('plots the checked Champions fact, not the export’s rounded share, and the source values for the rest', () => {
    const rows = rfmPlotRows(SEGMENTS);
    expect(rows.map((r) => r.segment)).toEqual(SEGMENTS.map((s) => s.segment));
    expect(rows[0]!.customers).toBe(getFact('retention.rfm.champions_customer_share').value);
    expect(rows[0]!.customers).toBe(0.2345);
    expect(rows[0]!.spend).toBe(0.712);
    expect(rows.slice(1).map((r) => r.customers)).toEqual(SEGMENTS.slice(1).map((s) => s.customer_share));
    expect(rows.map((r) => r.spend)).toEqual(SEGMENTS.map((s) => s.revenue_share));
  });

  it('draws customers and spend as two series on one zero-to-all axis, segment by segment', () => {
    const layouts = tags(RFM, /<svg[^>]*data-chart-frame[^>]*>/g).length;
    expect(layouts).toBe(2);
    const all = tags(RFM, /<rect[^>]*data-series="[^"]*"[^>]*>/g);
    expect(all).toHaveLength(SEGMENTS.length * 2 * layouts);
    // the narrow layout comes first; both layouts draw the same bars
    const bars = all.slice(0, SEGMENTS.length * 2);
    expect(all.slice(SEGMENTS.length * 2).map((b) => attr(b, 'data-value'))).toEqual(bars.map((b) => attr(b, 'data-value')));
    const series = new Set(bars.map((b) => attr(b, 'data-series')));
    expect([...series].sort()).toEqual(['customers', 'spend']);
    // both series start at the same zero
    expect(new Set(bars.map((b) => attr(b, 'x'))).size).toBe(1);
    const champ = bars.filter((b) => attr(b, 'data-segment') === 'Champions');
    expect(champ.map((b) => [attr(b, 'data-series'), Number(attr(b, 'data-value'))])).toEqual([['customers', 0.2345], ['spend', 0.712]]);
    // one frame, whose x ticks run from 0% to 100%
    expect(tags(RFM, /<svg[^>]*data-chart-frame[^>]*>/g).length).toBeGreaterThanOrEqual(1);
    const wide = RFM.slice(RFM.indexOf('data-layout="wide"'));
    const xTicks = tags(wide.slice(0, wide.indexOf('</svg></div>') + 1), /<text[^>]*data-tick="x"[^>]*>[^<]*<\/text>/g).map(text);
    expect(xTicks[0]).toBe('0%');
    expect(xTicks.at(-1)).toBe('100%');
    // the two series differ by more than colour: one outlined, one filled
    const fills = new Set(bars.map((b) => `${attr(b, 'data-series')}:${attr(b, 'fill')}`));
    expect(fills).toEqual(new Set(['customers:var(--color-bg)', 'spend:var(--color-series-1)']));
  });

  it('labels every bar directly with its series and value, and names each segment from the source', () => {
    const labels = tags(RFM, /<text[^>]*data-bar-label="[^"]*"[^>]*>[\s\S]*?<\/text>/g);
    const layouts = tags(RFM, /<svg[^>]*data-chart-frame[^>]*>/g).length;
    expect(labels).toHaveLength(SEGMENTS.length * 2 * layouts);
    const first = labels.slice(0, SEGMENTS.length * 2).map(text);
    expect(first.slice(0, 2)).toEqual(['Customers 23%', 'Spend 71%']);
    expect(first.join(' ')).not.toContain('24%');
    const names = tags(RFM, /<text[^>]*data-segment-name=""[^>]*>[^<]*<\/text>/g).map((t) => decode(text(t)));
    expect(names.slice(0, SEGMENTS.length)).toEqual(SEGMENTS.map((s) => s.segment));
    expect(names).toContain('At risk (were frequent)');
  });

  it('reads 23% of customers and 71% of spend for Champions, partly by construction, and never as the top spenders', () => {
    const r = prose(result(RFM));
    expect(r).toBe('Champions are 23% of customers and hold 71% of spend up to the cutoff, partly by construction: spend is one of the three scores that define them.');
    expect(result(RFM)).toContain('data-fact="retention.rfm.champions_customer_share"');
    expect(result(RFM)).toContain('data-fact="retention.rfm.champions_revenue_share"');
    expect(text(RFM)).not.toMatch(/top[- ]spend/i);
    const cells = openCells(RFM, 'rfm');
    expect(cells.slice(0, 4).map((c) => c.text)).toEqual(['Champions', '1,232', '23%', '71%']);
    expect(rfmTable().rows[0]![2]).toBe(0.2345);
  });

  it('defines Champions exactly, with the scores as source-code constants', () => {
    expect(CHAMPIONS_MIN_SCORE).toBe(4);
    expect(TOP_SCORE).toBe(5);
    const c = prose(caption(RFM));
    expect(c).toContain('Champions score 4 or 5 out of 5 on each of recency, frequency and spend (roughly the top two-fifths on each)');
    expect(caption(RFM)).toMatch(/<data value="4" data-derived="source:retention">4<\/data> or <data value="5" data-derived="source:retention">5<\/data> out of <data value="5" data-derived="source:retention">5<\/data>/);
    expect(untracedData(RFM)).toEqual([]);
  });

  it('carries no untraced number', () => {
    expect(audit(RFM)).toEqual([]);
    for (const label of tags(RFM, /aria-label="[^"]*"/g)) expect(label).not.toMatch(/\d/);
  });

  it('refuses rows that are not the export’s', () => {
    const changed = SEGMENTS.map((s, i) => (i === 1 ? { ...s, revenue_share: 0.2 } : s));
    expect(() => renderToStaticMarkup(<RfmFigure rows={changed} />)).toThrow(/export/);
  });
});

const MODELS = renderToStaticMarkup(<ModelFigure />);

describe('the model Figure', () => {
  it('states its finding as the title and badges the export', () => {
    expect(MODELS).toMatch(/<h3 id="models-title"[^>]*>The model ranks repeat buyers only slightly better than recency<\/h3>/);
    expect(MODELS).toContain('data-figure="models"');
    expect(text(MODELS)).toContain('Public data');
    expect(MODELS).not.toContain('data-figure-controls');
  });

  it('plots the recency rule and gradient boosting only, at their fact values', () => {
    const dots = tags(MODELS, /<circle[^>]*data-model="[^"]*"[^>]*>/g);
    const layouts = tags(MODELS, /<svg[^>]*data-chart-frame[^>]*>/g).length;
    expect(dots).toHaveLength(2 * layouts);
    expect(dots.slice(0, 2).map((d) => [attr(d, 'data-model'), Number(attr(d, 'data-value'))])).toEqual([
      ['Baseline: most recent buyer first', 0.762],
      ['Gradient boosting', 0.793],
    ]);
    expect(MODELS.slice(0, MODELS.indexOf('<figcaption'))).not.toContain('Logistic regression');
    const labels = tags(MODELS, /<text[^>]*data-dot-label[^>]*>[\s\S]*?<\/text>/g).slice(0, 2).map(text);
    expect(labels).toEqual([factText('retention.model.rule_auc'), factText('retention.model.gb_auc')]);
    expect(labels).toEqual(['0.762', '0.793']);
    // no interval drawn on an AUC that has none of its own
    expect(MODELS).not.toMatch(/data-interval|data-ci/);
  });

  it('gives the gain and its interval through their facts, scoped to test-sample variability', () => {
    const r = prose(result(MODELS));
    expect(r).toBe(
      'Gradient boosting ranks with a ROC AUC of 0.793, against 0.762 for putting the most recent buyers first: a gain of 0.03, with a 95% interval of 0.02 to 0.04 that covers test-sample variability only.',
    );
    for (const id of ['retention.model.gb_auc', 'retention.model.rule_auc', 'retention.model.auc_gain', 'retention.model.auc_gain_low', 'retention.model.auc_gain_high']) {
      expect(result(MODELS)).toContain(`data-fact="${id}"`);
    }
    // the gain is the fact, never 0.793 minus 0.762
    expect(text(MODELS)).not.toMatch(/0\.031|0\.023|0\.038/);
  });

  it('is ranking accuracy, not a response to contact: nobody was contacted', () => {
    const c = prose(caption(MODELS));
    expect(c).toContain('ranking accuracy, not a response to any offer');
    expect(c).toContain('nobody was contacted');
    expect(c).toContain('a prediction, not an effect of contact');
    expect(text(MODELS)).not.toMatch(/response rate|responded|uplift/i);
    // the table is the sourced models table: all three models, all customers and lapsed only (the
    // kit's number format prints the export's 0.71 without a trailing zero)
    expect(modelsTable().rows).toHaveLength(3);
    expect(openCells(MODELS, 'models').map((c) => c.text)).toEqual([
      'Baseline: most recent buyer first', '0.762', '0.685',
      'Logistic regression', '0.792', '0.706',
      'Gradient boosting', '0.793', '0.71',
    ]);
    expect(untracedData(MODELS)).toEqual([]);
  });

  it('carries no untraced number', () => {
    expect(audit(MODELS)).toEqual([]);
    for (const label of tags(MODELS, /aria-label="[^"]*"/g)) expect(label).not.toMatch(/\d/);
  });
});
