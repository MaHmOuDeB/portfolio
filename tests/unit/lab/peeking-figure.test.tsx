// The peeking Figure ("More looks, more false winners"): a lookup of seeded A/A simulations, never a
// simulation in the browser. One set of control values gives one PeekView, and the chart, the result
// line, the caption, the announcement and the table are all drawn from it, so they always agree.
// - Every numeral is marked simulated: the audit finds no stray number in any of the 200 states.
// - The result line states the rate over the runs, its 95% Monte Carlo range and how it stands
//   against the nominal 5%: with no fix and looking once read from that range (above, about when
//   the range holds 5%, or below); O'Brien-Fleming "close to or under", the confidence sequence
//   "well under", true at every look count.
// - O'Brien-Fleming's price is its last-look bar over one look's, as an approximate whole percent
//   (none at one look); the confidence sequence's is its interval width at the planned sample, the
//   same at every look count, so no copy ties it to the looks.
// - Neighbouring look counts are separate simulations, so no copy says a rate grows by a fixed step
//   per look, and the deck's stale 25% never appears in the rendered words.
// - Looking once is one check after 100 visitors per group per look of the daily schedule, against
//   the daily schedule with no fix as the comparison.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PeekingFigure } from '@/components/figures/PeekingFigure';
import { InertPeekingControls } from '@/components/figures/PeekingFigureClient';
import { PeekingFigureView, peekAnnouncement } from '@/components/figures/PeekingView';
import { FACTS, FACT_DISPLAYS, formatValue } from '@/lib/facts';
import { readFigureParams } from '@/lib/figure/url-state';
import { PEEK_MAX_LOOKS, PEEK_PRESET, computePeek, type PeekValues, type PeekView } from '@/lib/lab/peeking';
import { PEEK_TABLE_MANIFEST } from '@/lib/lab/peeking-table.generated';
import {
  FIX_OPTIONS,
  MODE_OPTIONS,
  ONCE_FIX_REASON,
  PEEK_ID,
  PEEK_PRESETS,
  PEEK_SCHEMA,
  PEEK_TITLE,
  PEEK_VISITORS_PER_LOOK,
  looksReadout,
  looksValueText,
} from '@/lib/lab/peeking-values';
import { auditHtml } from '../../../scripts/truth-audit.ts';

const decode = (s: string) =>
  s
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
const text = (markup: string) => decode(markup.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
/** Text with the spaces the tag stripping adds around punctuation removed again. */
const prose = (markup: string) => text(markup).replace(/ ([.,:;)])/g, '$1').replace(/\( /g, '(');
const result = (html: string) => html.match(/<p data-figure-result=""[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
const caption = (html: string) => html.match(/<figcaption[^>]*><p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const audit = (html: string) =>
  auditHtml(`<!doctype html><html><head><title>t</title></head><body>${html}</body></html>`, {
    route: '/lab',
    factIds: new Set(Object.keys(FACTS)),
    factDisplays: FACT_DISPLAYS,
    denylist: [],
  });
const pct = (v: number, decimals: number) => formatValue(v, 'share', { decimals });

function draw(v: PeekValues): { view: PeekView; html: string } {
  const view = computePeek(v);
  const html = renderToStaticMarkup(
    <PeekingFigureView id={PEEK_ID} view={view} controls={<InertPeekingControls id={PEEK_ID} values={view.values} />} />,
  );
  return { view, html };
}

const ALL: PeekValues[] = [];
for (let looks = 1; looks <= PEEK_MAX_LOOKS; looks += 1) {
  for (const fix of ['naive', 'obf', 'cs'] as const) ALL.push({ looks, mode: 'daily', fix });
  ALL.push({ looks, mode: 'once', fix: 'naive' });
}
const DRAWN = ALL.map(draw);
const label = (v: PeekValues) => `${v.mode}/${v.mode === 'once' ? '' : `${v.fix}/`}${v.looks}`;

/** The chart of one layout: the paths' and the dot's values, and the tick labels. */
function chart(html: string, layout: 'wide' | 'narrow') {
  const svg = html.match(new RegExp(`<svg[^>]*data-layout="${layout}"[\\s\\S]*?</svg>\\s*(?:<style>[\\s\\S]*?</style>)?(?=<svg|</div>)`))?.[0] ?? '';
  const series = (name: string) => {
    const tag = svg.match(new RegExp(`<path[^>]*data-series="${name}"[^>]*>`))?.[0];
    return tag === undefined ? null : attr(tag, 'data-values')!.split(' ').map(Number);
  };
  const dot = svg.match(/<circle[^>]*data-series="current"[^>]*>/)?.[0];
  const ticks = (axis: 'x' | 'y') => [...svg.matchAll(new RegExp(`<text[^>]*data-tick="${axis}"[^>]*>(?:<tspan>)?([^<]*)<`, 'g'))].map((m) => m[1]);
  return {
    svg,
    ghost: series('ghost'),
    selected: series('selected'),
    dot: dot === undefined ? null : { look: Number(attr(dot, 'data-look')), value: Number(attr(dot, 'data-value')), stroke: attr(dot, 'stroke'), fill: attr(dot, 'fill') },
    xTicks: ticks('x'),
    yTicks: ticks('y'),
    annotation: text(svg.match(/<text[^>]*data-annotation=""[^>]*>[^<]*<\/text>/)?.[0] ?? ''),
    nominal: svg.match(/<line[^>]*data-nominal=""[^>]*>/)?.[0],
  };
}

describe('the values the page loads at once', () => {
  it('match the model: the same looks, the same preset and the same visitors per look', () => {
    expect(PEEK_SCHEMA.looks).toEqual({ kind: 'number', min: 1, max: PEEK_MAX_LOOKS, step: 1 });
    expect(PEEK_SCHEMA.mode.values).toEqual(['daily', 'once']);
    expect(PEEK_SCHEMA.fix.values).toEqual(['naive', 'obf', 'cs']);
    expect(PEEK_PRESETS.default).toEqual(PEEK_PRESET);
    // The interview deep link is the same view: daily, 20 looks, no fix.
    expect(PEEK_PRESETS.interview).toEqual({ looks: 20, mode: 'daily', fix: 'naive' });
    expect(Object.keys(PEEK_PRESETS).sort()).toEqual(['default', 'interview']);
    expect(PEEK_VISITORS_PER_LOOK).toBe(PEEK_TABLE_MANIFEST.nPerLook);
    expect(PEEK_ID).toBe('peeking');
    expect(PEEK_TITLE).toBe('More looks, more false winners');
  });

  it('read a hostile or unknown URL as values inside the schema, never throwing', () => {
    const read = (q: string) => readFigureParams(new URLSearchParams(q), PEEK_ID, PEEK_SCHEMA, PEEK_PRESETS);
    expect(read('').values).toEqual(PEEK_PRESET);
    expect(read('peeking.preset=interview')).toEqual({ values: PEEK_PRESET, preset: 'interview' });
    expect(read('peeking.looks=999').values.looks).toBe(50);
    expect(read('peeking.looks=0').values.looks).toBe(1);
    expect(read('peeking.looks=-Infinity').values.looks).toBe(1);
    expect(read('peeking.looks=7.6').values.looks).toBe(8);
    expect(read('peeking.looks=abc').values.looks).toBe(20);
    expect(read('peeking.mode=__proto__&peeking.fix=toString&peeking.preset=constructor')).toEqual({ values: PEEK_PRESET, preset: 'default' });
    expect(read('peeking.mode=once&peeking.fix=cs&peeking.looks=50').values).toEqual({ looks: 50, mode: 'once', fix: 'cs' });
    expect(read('planner.looks=5&peekingx.looks=5&looks=5').values).toEqual(PEEK_PRESET);
  });

  it('name the controls in words, and the looks with the visitors they add up to', () => {
    expect(MODE_OPTIONS.map((o) => o.value)).toEqual(PEEK_SCHEMA.mode.values);
    expect(FIX_OPTIONS.map((o) => o.value)).toEqual(PEEK_SCHEMA.fix.values);
    expect([...MODE_OPTIONS, ...FIX_OPTIONS].map((o) => o.label).join(' ')).not.toMatch(/\d/);
    expect(ONCE_FIX_REASON).not.toMatch(/\d/);
    expect(looksReadout(20)).toBe('2,000 per group');
    expect(looksReadout(1)).toBe('100 per group');
    expect(looksValueText(20, 'daily')).toBe('20 looks, 2,000 visitors per group by the last');
    expect(looksValueText(1, 'daily')).toBe('1 look, 100 visitors per group');
    expect(looksValueText(50, 'once')).toBe('one look after 5,000 visitors per group');
  });
});

describe('the Figure as the server draws it', () => {
  const html = renderToStaticMarkup(<PeekingFigure />);

  it('states the relationship as its title and badges its data as simulated', () => {
    expect(html).toContain(`<h3 id="peeking-title" class="text-xl font-semibold">${PEEK_TITLE}</h3>`);
    expect(text(html)).toContain('Simulated');
    expect(html).toContain('data-island="idle"');
  });

  it('draws the interview preset: daily, 20 looks, no fix, 22.1% of the runs', () => {
    const preset = computePeek(PEEK_PRESET);
    expect(preset.selected.falsePositiveRate).toBe(0.221);
    expect(prose(result(html))).toBe(
      `Under these simulation assumptions, 22.1% of 1,000 runs found a false winner by look 20 (95% Monte Carlo range ${pct(preset.mc.lower, 1)} to ${pct(preset.mc.upper, 1)}): above the nominal 5%.`,
    );
    expect(html).toMatch(/<input type="radio"[^>]*name="peeking-mode"[^>]*checked=""[^>]*value="daily"/);
    expect(html).toMatch(/<input type="radio"[^>]*name="peeking-fix"[^>]*checked=""[^>]*value="naive"/);
  });

  it('holds no stray number', () => {
    expect(audit(html)).toEqual([]);
  });

  it('takes another id for every name it writes', () => {
    const other = renderToStaticMarkup(<PeekingFigure id="peek-two" />);
    expect(other).toContain('id="peek-two-title"');
    expect(other).toContain('name="peek-two-mode"');
    expect(other).toContain('id="peek-two-looks"');
    expect(other).not.toContain('"peeking');
  });
});

describe('every one of the 200 states', () => {
  it.each(DRAWN.map((d) => [label(d.view.values), d] as const))('%s: one tuple across chart, result, table and caption', (_, { view, html }) => {
    const { values, selected, naive } = view;
    const L = values.looks;
    // no stray number, and every printed number is simulated
    expect(audit(html)).toEqual([]);
    for (const tag of html.match(/<data [^>]*>/g) ?? []) expect(attr(tag, 'data-derived')).toBe('simulated');
    // the result line holds the selected rate, the runs and the Monte Carlo range of this tuple
    const line = prose(result(html));
    expect(line.startsWith(`Under these simulation assumptions, ${pct(selected.falsePositiveRate, 1)} of 1,000 runs found a false winner `)).toBe(true);
    expect(line).toContain(`(95% Monte Carlo range ${pct(view.mc.lower, 1)} to ${pct(view.mc.upper, 1)}): `);
    // the announcement is the result line in words
    expect(peekAnnouncement(view)).toBe(line);
    const key = /<p data-nominal-key=""[^>]*>([\s\S]*?)<\/p>/.exec(html);
    expect(key, 'the dotted-line key').not.toBeNull();
    expect(text(key![1]!)).toBe('Dotted line: nominal 5%');
    expect(key![1]).toMatch(/<svg aria-hidden="true"[^>]*><line [^>]*stroke-dasharray="2 3"/);
    expect(key![1]).toContain('data-derived="simulated"');
    for (const layout of ['wide', 'narrow'] as const) {
      const c = chart(html, layout);
      expect(c.svg, layout).not.toBe('');
      // the current dot: the selected rate at the last look, orange with a background ring
      expect(c.dot).toEqual({ look: L, value: selected.falsePositiveRate, stroke: 'var(--color-bg)', fill: 'var(--color-series-2)' });
      // the nominal line, keyed under the chart (no label on the chart, where it would sit on the curves)
      expect(c.nominal).toBeDefined();
      expect(c.annotation).toBe('');
      // y from 0 to 40%, x from look 1 to the last look (0 to 1 for one look, with one tick at 1)
      expect(c.yTicks).toEqual(layout === 'wide' ? ['10%', '20%', '30%', '40%', '0%'] : ['20%', '40%', '0%']);
      expect(c.xTicks[0]).toBe('1');
      expect(c.xTicks.at(-1)).toBe(String(L));
      if (L === 1) expect(c.xTicks).toEqual(['1']);
      // the plotted series are the table's columns
      if (values.mode === 'once') {
        expect(c.selected).toBeNull();
        expect(c.ghost).toEqual(L > 1 ? naive.cumulativeByLook : null);
      } else {
        expect(c.selected).toEqual(L > 1 ? selected.cumulativeByLook : null);
        expect(c.ghost).toEqual(values.fix !== 'naive' && L > 1 ? naive.cumulativeByLook : null);
      }
    }
    // the table is the model's, drawn once (open without JavaScript, folded with it)
    const cells = [...html.matchAll(/<td[^>]*data-num=""[^>]*>([^<]*)<\/td>/g)].map((m) => m[1]);
    expect(cells.length).toBe(view.table.rows.flat().filter((v) => typeof v === 'number').length);
    // the caption reads its values from the tuple's metadata
    const words = prose(caption(html));
    expect(words).toContain(`both groups convert at ${pct(selected.p, 0)}`);
    expect(words).toContain(`${formatValue(selected.runs, 'count')} runs from seed ${selected.seed}`);
    expect(words).toContain('Evan Miller, “How Not To Run an A/B Test”');
    if (values.mode === 'once') {
      expect(words).toContain(`one check after ${formatValue(selected.nPerLook, 'count')} visitors per group`);
      if (L === 1) {
        // one look: the comparison gives the same share, so its pale dot is under the ringed dot
        expect(naive.falsePositiveRate).toBe(selected.falsePositiveRate);
        expect(words).toContain(`The comparison schedule is ${naive.looks} daily look of ${naive.nPerLook} visitors per group with no fix.`);
      } else {
        expect(words).toContain(`The pale line is the comparison schedule: ${naive.looks} daily looks of ${naive.nPerLook} visitors per group with no fix.`);
      }
    } else {
      expect(words).toContain(`Each scheduled look adds ${selected.nPerLook} visitors per group.`);
    }
    // never the deck's stale 25% in the title, result, caption or announcement (as text or as a
    // marked value), and never a zero printed with a decimal
    for (const part of [result(html), caption(html), html.match(/<h3[^>]*>[\s\S]*?<\/h3>/)![0]]) {
      expect(text(part)).not.toMatch(/(?<![\d.])25\s?%/);
      expect(part).not.toMatch(/value="0?\.25"/);
    }
    expect(peekAnnouncement(view)).not.toMatch(/(?<![\d.])25\s?%/);
    expect(text(html)).not.toMatch(/(?<![\d.])0\.0%/);
    // separate simulations per look count: nothing claims a step per look
    expect(text(result(html) + caption(html))).not.toMatch(/each (extra|more|additional) look (adds|raises)|always (raises|rises)/i);
  });
});

describe('the copy of each method', () => {
  const at = (v: PeekValues) => DRAWN.find((d) => label(d.view.values) === label(v))!;
  const relation = (view: PeekView) => (view.mc.lower > 0.05 ? 'above' : view.mc.upper < 0.05 ? 'below' : 'about');

  it('says how the rate stands against the nominal 5%: from the range with no fix or once, per method with a fix', () => {
    for (const { view, html } of DRAWN) {
      const line = prose(result(html));
      const { mode, fix } = view.values;
      const expected = mode === 'daily' && fix === 'obf' ? 'close to or under' : mode === 'daily' && fix === 'cs' ? 'well under' : relation(view);
      expect(line, label(view.values)).toContain(`): ${expected} the nominal 5%.`);
      // "about" only where the Monte Carlo range holds 5% (no fix or once), never for a fix
      if (mode === 'daily' && fix !== 'naive') expect(line).not.toMatch(/about (the nominal )?5%(?! higher)/);
      if (line.includes('about the nominal')) expect(view.mc.lower <= 0.05 && view.mc.upper >= 0.05).toBe(true);
      // the per-method words hold at every look count
      if (mode === 'daily' && fix === 'cs') expect(view.mc.upper).toBeLessThan(0.05);
      if (mode === 'daily' && fix === 'obf') expect(view.mc.lower).toBeLessThan(0.05);
    }
    // the cases the copy rests on
    expect(relation(at({ looks: 20, mode: 'daily', fix: 'naive' }).view)).toBe('above');
    expect(relation(at({ looks: 1, mode: 'daily', fix: 'naive' }).view)).toBe('about');
    for (const looks of [1, 20, 50]) expect(relation(at({ looks, mode: 'once', fix: 'naive' }).view)).toBe('about');
    // O'Brien-Fleming below 5% at 4, 16 and 17 looks and highest at 28 (6.1%), all "close to or under"
    for (const looks of [4, 16, 17]) expect(relation(at({ looks, mode: 'daily', fix: 'obf' }).view)).toBe('below');
    expect(at({ looks: 28, mode: 'daily', fix: 'obf' }).view.selected.falsePositiveRate).toBe(0.061);
    for (const looks of [4, 16, 17, 28]) expect(prose(result(at({ looks, mode: 'daily', fix: 'obf' }).html))).toContain('): close to or under the nominal 5%.');
    for (const looks of [1, 34]) expect(prose(result(at({ looks, mode: 'daily', fix: 'cs' }).html))).toContain('): well under the nominal 5%.');
  });

  it("O'Brien-Fleming: the last-look bar over one look's as an approximate whole percent, and no extra bar at one look", () => {
    const one = prose(result(at({ looks: 1, mode: 'daily', fix: 'obf' }).html));
    expect(one).toContain('With one look there is no extra bar: this is the fixed design.');
    expect(one).not.toMatch(/higher/);
    expect(one).not.toMatch(/(?<![\d.])0%/);
    for (const [looks, price] of [[2, '1%'], [10, '7%'], [20, '8%'], [50, '11%']] as const) {
      const { view, html } = at({ looks, mode: 'daily', fix: 'obf' });
      expect(view.cost).toEqual({ kind: 'boundary', ratio: expect.any(Number) });
      expect(pct(view.cost!.ratio - 1, 0)).toBe(price);
      expect(prose(result(html))).toContain(
        `At the last look the bar for a winner is about ${price} higher than for one look at the end; early looks need stronger evidence.`,
      );
    }
  });

  it('the confidence sequence: conservative here, not a guarantee, and its width at the same planning sample', () => {
    for (const looks of [1, 2, 20, 50]) {
      const line = prose(result(at({ looks, mode: 'daily', fix: 'cs' }).html));
      expect(line).toContain('well under the nominal 5%.');
      expect(line).toContain('It is conservative here; that is not a guarantee for every population.');
      expect(line).toContain("At the planned sample, the confidence sequence's interval is about 55% wider than a single fixed test's.");
      // never a claim that the price changes with the number of looks, nor a sample or power cost
      expect(line).not.toMatch(/more looks|fewer looks|grows|rises|shrinks|more visitors|power/i);
    }
  });

  it('no fix and looking once state no price', () => {
    for (const v of [{ looks: 20, mode: 'daily', fix: 'naive' }, { looks: 20, mode: 'once', fix: 'obf' }] as const) {
      const line = prose(result(at({ ...v, fix: v.mode === 'once' ? 'naive' : v.fix }).html));
      expect(line).not.toMatch(/higher|wider|price/);
    }
  });

  it('looking once ignores the fix and keeps the daily schedule’s total sample', () => {
    for (const looks of [20, 50]) {
      const asNaive = computePeek({ looks, mode: 'once', fix: 'naive' });
      for (const fix of ['obf', 'cs'] as const) {
        const other = computePeek({ looks, mode: 'once', fix });
        expect(other.values.fix).toBe(fix);
        expect({ ...other, values: asNaive.values }).toEqual(asNaive);
      }
      expect(asNaive.selected.looks).toBe(1);
      expect(asNaive.selected.nPerLook).toBe(looks * PEEK_VISITORS_PER_LOOK);
      expect(asNaive.naive.looks).toBe(looks);
      expect(asNaive.naive.nPerLook).toBe(PEEK_VISITORS_PER_LOOK);
    }
    expect(prose(caption(at({ looks: 20, mode: 'once', fix: 'naive' }).html))).toContain('one check after 2,000 visitors per group');
    expect(prose(caption(at({ looks: 50, mode: 'once', fix: 'naive' }).html))).toContain('one check after 5,000 visitors per group');
  });

  it('looking once: a table with no empty numeric cell, the daily looks and then the one look', () => {
    for (const looks of [1, 20, 50]) {
      const { view } = at({ looks, mode: 'once', fix: 'naive' });
      expect(view.table.columns).toEqual(['Look', 'Schedule', 'False winners so far (%)']);
      expect(view.table.rows).toHaveLength(looks + 1);
      for (const row of view.table.rows) {
        expect(typeof row[0]).toBe('number');
        expect(typeof row[2]).toBe('number');
      }
      expect(view.table.rows.slice(0, looks).map((r) => r[1])).toEqual(Array(looks).fill('Peeking daily, no fix'));
      expect(view.table.rows.at(-1)).toEqual([looks, 'One look at the end', Math.round(view.selected.falsePositiveRate * 1000) / 10]);
    }
  });

  it('never names a pale dot as if it showed when the ringed dot covers it (one look, the same share)', () => {
    const once = prose(caption(at({ looks: 1, mode: 'once', fix: 'naive' }).html));
    expect(once).toContain('With one look the comparison schedule gives the same share, so its pale dot sits under the ringed dot.');
    expect(once).not.toContain('The pale dot is');
    const obf = prose(caption(at({ looks: 1, mode: 'daily', fix: 'obf' }).html));
    expect(obf).toContain('The comparison is the same 1 daily look of 100 visitors per group with no fix; with one look the fix changes nothing, so the pale dot sits under the ringed dot.');
    expect(obf).not.toContain('The pale dot is');
    // the confidence sequence at one look differs from the comparison, so its pale dot shows
    const cs = at({ looks: 1, mode: 'daily', fix: 'cs' });
    expect(cs.view.naive.falsePositiveRate).not.toBe(cs.view.selected.falsePositiveRate);
    expect(prose(caption(cs.html))).toContain('The pale dot is the same 1 daily look of 100 visitors per group with no fix; the ringed dot uses the fix.');
  });

  it('says what the Monte Carlo range is: where the rate would settle with far more runs', () => {
    for (const { html } of DRAWN) {
      const words = prose(caption(html));
      expect(words).toContain('the 95% Monte Carlo range is a Wilson interval over the runs: where the rate would settle with far more runs.');
      expect(words).not.toMatch(/another seed/);
    }
  });

  it('says each setting is its own simulation', () => {
    expect(prose(caption(at({ looks: 20, mode: 'daily', fix: 'naive' }).html))).toContain(
      'Each setting is its own simulation, so nearby look counts can differ by a few points.',
    );
  });

  it('names each criterion in the caption', () => {
    expect(prose(caption(at({ looks: 20, mode: 'daily', fix: 'naive' }).html))).toContain(
      'A run counts as a false winner the first time its p-value (pooled z-test, two-sided) falls below 0.05.',
    );
    expect(prose(caption(at({ looks: 20, mode: 'daily', fix: 'obf' }).html))).toContain(
      "A run counts as a false winner the first time the size of its z statistic reaches the O'Brien-Fleming bar for that look, set for an overall two-sided level of 0.05.",
    );
    expect(prose(caption(at({ looks: 20, mode: 'daily', fix: 'cs' }).html))).toContain(
      'A run counts as a false winner the first time the 95% confidence sequence for the difference excludes zero.',
    );
    expect(prose(caption(at({ looks: 20, mode: 'once', fix: 'naive' }).html))).toContain(
      'A run counts as a false winner if its p-value (pooled z-test, two-sided) at that one look falls below 0.05.',
    );
  });

  it('describes the chart in words only, with the data left to the table and the result', () => {
    for (const { view, html } of DRAWN) {
      const names = [...html.matchAll(/<svg[^>]*role="img"[^>]*aria-label="([^"]*)"/g)].map((m) => decode(m[1]!));
      expect(names, label(view.values)).toHaveLength(2);
      for (const name of names) expect(name).not.toMatch(/\d/);
    }
  });
});

describe('the controls', () => {
  const daily = draw({ looks: 20, mode: 'daily', fix: 'obf' }).html;
  const once = draw({ looks: 20, mode: 'once', fix: 'obf' }).html;
  const fixGroup = (html: string) => html.match(/<fieldset[^>]*>(?:(?!<\/fieldset>)[\s\S])*name="peeking-fix"[\s\S]*?<\/fieldset>/)?.[0] ?? '';
  const reason = (html: string) => html.match(/<p[^>]*data-peek-fix-reason=""[^>]*>[^<]*<\/p>/)?.[0] ?? '';

  it('sit in a group named by the Figure title: looks, schedule, fix and Reset, four controls', () => {
    const group = daily.match(/<div role="group" aria-labelledby="peeking-title"[^>]*>[\s\S]*$/)?.[0] ?? '';
    expect(group).not.toBe('');
    const words = text(group);
    for (const w of ['Looks', 'Schedule', 'Peek daily', 'Look once', 'Fix', 'None', "O'Brien-Fleming", 'Confidence sequence', 'Reset']) {
      expect(words).toContain(w);
    }
    expect(daily.match(/type="range"/g)).toHaveLength(1);
    expect(daily.match(/<fieldset/g)).toHaveLength(2);
    expect(daily.match(/>Reset<\/button>/g)).toHaveLength(1);
  });

  it('keeps Looks selectable when looking once, and disables Fix with its reason in view', () => {
    expect(fixGroup(daily)).not.toMatch(/<fieldset[^>]*disabled/);
    expect(fixGroup(once)).toMatch(/<fieldset[^>]*disabled=""/);
    // the fix is kept, so a switch back to daily restores it
    expect(once).toMatch(/<input type="radio"[^>]*name="peeking-fix"[^>]*checked=""[^>]*value="obf"/);
    expect(once).not.toMatch(/<input[^>]*type="range"[^>]*\sdisabled=""/);
    expect(text(reason(once))).toBe(ONCE_FIX_REASON);
    expect(reason(once)).not.toMatch(/invisible|aria-hidden/);
    // daily keeps the line's room, hidden, so the row does not move
    expect(reason(daily)).toMatch(/invisible/);
    expect(reason(daily)).toMatch(/aria-hidden="true"/);
  });

  it('describe the disabled Fix group by its reason, and the enabled group by nothing', () => {
    expect(reason(once)).toMatch(/<p id="peeking-fix-reason"/);
    expect(fixGroup(once)).toMatch(/<fieldset[^>]*aria-describedby="peeking-fix-reason"/);
    expect(fixGroup(daily)).not.toContain('aria-describedby');
    // exactly one element carries the id the group points at
    expect(once.match(/ id="peeking-fix-reason"/g)).toHaveLength(1);
  });

  it('give the looks with the visitors they add up to, under a simulated marker', () => {
    expect(daily).toMatch(/<div data-slider="[^"]*" data-js-only="[^"]*" data-derived="simulated"/);
    expect(daily).toContain('aria-valuetext="20 looks, 2,000 visitors per group by the last"');
    expect(once).toContain('aria-valuetext="one look after 2,000 visitors per group"');
    expect(text(daily)).toContain('2,000 per group');
  });
});
