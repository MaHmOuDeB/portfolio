// The peeking Figure ("More checks, more false winners"): a lookup of seeded A/A simulations, never a
// simulation in the browser. One set of control values gives one PeekView, and the chart, the result
// line, the caption, the announcement and the table are all drawn from it, so they always agree.
// - Every numeral is marked simulated: the audit finds no stray number in any of the 200 states.
// - The result line states, in plain words, the rate over the runs and how it stands against the
//   5% a single check allows; the method row gives its 95% Monte Carlo range and the same word: with no fix and
//   looking once read from that range (above, about when the range holds 5%, or below);
//   O'Brien-Fleming "close to or under", the confidence sequence "well under", true at every look count.
// - O'Brien-Fleming's price is its last-look bar over one look's, as an approximate whole percent
//   (none at one look); the confidence sequence's is its interval width at the planned sample, the
//   same at every look count, so no copy ties it to the looks.
// - Neighbouring look counts are separate simulations, so no copy says a rate grows by a fixed step
//   per look, and the deck's stale 25% never appears in the rendered words.
// - The controls check daily: days checked, the fix and Reset. Looking once is no longer a control;
//   the method row of every daily view quotes the check-once rate, and the model still draws a
//   check-once view (one check after 100 visitors per group per day of the daily schedule).
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
  PEEK_ID,
  PEEK_LABELS,
  PEEK_PRESET_LINKS,
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
/** The sentence under the chart: what is simulated. */
const underChart = (html: string) => html.match(/<figcaption[^>]*><p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
/** The method row's text for the setting drawn: the rate's range, the schedule, the criterion, the marks, the runs. */
const method = (html: string) => html.match(/<p data-method-text="" data-peek-method="">([\s\S]*?)<\/p>/)?.[1] ?? '';
/** What was one caption: the sentence under the chart, then the method row's text. */
const caption = (html: string) => `${underChart(html)} ${method(html)}`;
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
    <PeekingFigureView id={PEEK_ID} view={view} controls={<InertPeekingControls id={PEEK_ID} values={{ looks: view.values.looks, fix: view.values.fix }} />} />,
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
  const ticks = (axis: 'x' | 'y') => [...svg.matchAll(new RegExp(`<text[^>]*data-tick="${axis}"[^>]*>(?:<tspan[^>]*>)?([^<]*)<`, 'g'))].map((m) => m[1]);
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
    expect(Object.keys(PEEK_SCHEMA)).toEqual(['looks', 'fix']);
    expect(PEEK_SCHEMA.fix.values).toEqual(['naive', 'obf', 'cs']);
    expect({ ...PEEK_PRESETS.default, mode: 'daily' }).toEqual(PEEK_PRESET);
    // The interview deep link is the same view: daily, 20 days, no fix.
    expect(PEEK_PRESETS.interview).toEqual({ looks: 20, fix: 'naive' });
    expect(PEEK_PRESETS.default).toEqual(PEEK_PRESETS.interview);
    expect(Object.keys(PEEK_PRESETS).sort()).toEqual(['default', 'interview']);
    expect(PEEK_VISITORS_PER_LOOK).toBe(PEEK_TABLE_MANIFEST.nPerLook);
    expect(PEEK_ID).toBe('peeking');
    expect(PEEK_TITLE).toBe('More checks, more false winners');
  });

  it('read a hostile or unknown URL as values inside the schema, never throwing', () => {
    const read = (q: string) => readFigureParams(new URLSearchParams(q), PEEK_ID, PEEK_SCHEMA, PEEK_PRESETS);
    const PRESET = { looks: PEEK_PRESET.looks, fix: PEEK_PRESET.fix };
    expect(read('').values).toEqual(PRESET);
    expect(read('peeking.preset=interview')).toEqual({ values: PRESET, preset: 'interview' });
    expect(read('peeking.looks=999').values.looks).toBe(50);
    expect(read('peeking.looks=0').values.looks).toBe(1);
    expect(read('peeking.looks=-Infinity').values.looks).toBe(1);
    expect(read('peeking.looks=7.6').values.looks).toBe(8);
    expect(read('peeking.looks=abc').values.looks).toBe(20);
    expect(read('peeking.mode=__proto__&peeking.fix=toString&peeking.preset=constructor')).toEqual({ values: PRESET, preset: 'default' });
    expect(read('peeking.fix=cs&peeking.looks=50').values).toEqual({ looks: 50, fix: 'cs' });
    expect(read('planner.looks=5&peekingx.looks=5&looks=5').values).toEqual(PRESET);
  });

  it('ignore an old link that chose to check once: the Figure checks daily and nothing throws', () => {
    const read = (q: string) => readFigureParams(new URLSearchParams(q), PEEK_ID, PEEK_SCHEMA, PEEK_PRESETS);
    expect(read('peeking.mode=once').values).toEqual({ looks: 20, fix: 'naive' });
    expect(read('peeking.mode=once&peeking.fix=cs&peeking.looks=50').values).toEqual({ looks: 50, fix: 'cs' });
    expect('mode' in read('peeking.mode=once').values).toBe(false);
  });

  it('name the controls in plain words, and the days with the visitors they add up to', () => {
    expect(PEEK_LABELS).toEqual({ looks: 'Days checked', fix: 'Fix' });
    expect(FIX_OPTIONS.map((o) => o.value)).toEqual(PEEK_SCHEMA.fix.values);
    expect(FIX_OPTIONS.map((o) => o.label)).toEqual(['No fix', 'Stricter early checks', 'Always-valid check']);
    expect(FIX_OPTIONS.map((o) => o.label).join(' ')).not.toMatch(/\d|O'Brien|sequence/);
    expect(looksReadout(20)).toBe('20 days');
    expect(looksReadout(1)).toBe('1 day');
    expect(looksValueText(20)).toBe('20 days, 2,000 visitors per group by the last');
    expect(looksValueText(1)).toBe('1 day, 100 visitors per group');
    expect(PEEK_PRESET_LINKS.map((l) => l.label)).toEqual(['Try stricter early checks', 'Try the always-valid check']);
  });
});

describe('the Figure as the server draws it', () => {
  const html = renderToStaticMarkup(<PeekingFigure />);

  it('states the relationship as its title and badges its data as simulated', () => {
    expect(html).toContain(`<h3 id="peeking-title" class="text-xl font-semibold">${PEEK_TITLE}</h3>`);
    expect(text(html)).toContain('Simulated');
    expect(html).toContain('data-island="idle"');
  });

  it('draws the interview preset: daily, 20 days, no fix, 22.1% of the runs', () => {
    const preset = computePeek(PEEK_PRESET);
    expect(preset.selected.falsePositiveRate).toBe(0.221);
    // plain first: how it was checked, what happened, and what one reading at the end would give
    expect(prose(result(html))).toBe('Checked daily for 20 days, 22.1% of 1,000 tests found a false winner. Checked once at the end, about 5% would.');
    // the Monte Carlo range of that rate is one click deeper, in the method row
    expect(prose(method(html))).toContain(
      `Under these simulation assumptions the rate is 22.1% (95% Monte Carlo range ${pct(preset.mc.lower, 1)} to ${pct(preset.mc.upper, 1)}): above the nominal 5%.`,
    );
    expect(prose(result(html))).not.toMatch(/Monte Carlo/);
    // the sentence under the chart is one sentence; the rest of the method is in the row
    expect(prose(underChart(html))).toBe(`Simulated tests of two identical pages, each with a ${pct(preset.selected.p, 0)} sign-up rate.`);
    // A/A, the nominal level and the check-once simulated rate are one click deeper
    const once = computePeek({ ...PEEK_PRESET, mode: 'once' }).selected;
    expect(once.falsePositiveRate).toBe(0.044);
    expect(prose(method(html))).toContain('These are A/A tests: both groups see the same version, so every winner is a false one.');
    expect(prose(method(html))).toContain('Checked once at the end, after the same 2,000 visitors per group, the simulated rate is 4.4%.');
    expect(html).not.toContain('name="peeking-mode"');
    expect(html).toMatch(/<input type="radio"[^>]*name="peeking-fix"[^>]*checked=""[^>]*value="naive"/);
  });

  it('says the point above and below the Figure in plain words, and ends in my decision', () => {
    const t = prose(html);
    // above: the one control to move and what to watch
    expect(t).toContain('Both pages here are the same, so every winner is a false winner. Drag the days checked and watch how many of 1,000 tests find one.');
    // below: the read plan, the same at every setting, so it quotes no number
    const decision =
      'I decide how to read a test before it starts. I read it once at the end, or with a method built for daily checks. The price of checking often: a winner needs stronger proof. The live test on this site uses the always-valid check.';
    expect(t).toContain(decision);
    expect(decision).not.toMatch(/\d/);
    expect(t).toContain('How the simulation works');
    expect(t).not.toMatch(/false alarm/);
  });

  it('holds no stray number', () => {
    expect(audit(html)).toEqual([]);
  });

  it('takes another id for every name it writes', () => {
    const other = renderToStaticMarkup(<PeekingFigure id="peek-two" />);
    expect(other).toContain('id="peek-two-title"');
    expect(other).toContain('name="peek-two-fix"');
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
    // the result line holds how the tests were checked, the selected rate and the runs of this tuple
    const line = prose(result(html));
    const opening =
      values.mode === 'once'
        ? `Checked once at the end, after ${formatValue(selected.nPerLook, 'count')} visitors per group, `
        : values.fix === 'cs'
          ? 'With the always-valid check, '
          : L === 1
            ? 'With a single check, '
            : values.fix === 'obf'
              ? 'With stricter early checks, '
              : `Checked daily for ${L} days, `;
    expect(line.startsWith(`${opening}${pct(selected.falsePositiveRate, 1)} of 1,000 tests found a false winner`), line).toBe(true);
    expect(line.includes(' Checked once at the end, about 5% would.')).toBe(values.mode === 'daily' && values.fix === 'naive' && L > 1);
    // the level a single check allows is named in every line, and no statistics word is
    expect(line).toMatch(/5%/);
    expect(line).not.toMatch(/nominal|Monte Carlo|O'Brien|confidence sequence|A\/A/);
    // the Monte Carlo range of this tuple's rate is in the method row
    expect(prose(method(html))).toContain(
      `the rate is ${pct(selected.falsePositiveRate, 1)} (95% Monte Carlo range ${pct(view.mc.lower, 1)} to ${pct(view.mc.upper, 1)}): `,
    );
    // the announcement is the result line in words
    expect(peekAnnouncement(view)).toBe(line);
    const key = /<p data-nominal-key=""[^>]*>([\s\S]*?)<\/p>/.exec(html);
    expect(key, 'the dotted-line key').not.toBeNull();
    expect(prose(key![1]!)).toBe('Dotted line: 5%, the false winners one check at the end allows');
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
    expect(words).toContain(`each with a ${pct(selected.p, 0)} sign-up rate`);
    expect(words).toContain(`${formatValue(selected.runs, 'count')} runs from seed ${selected.seed}`);
    expect(words).toContain('Evan Miller, “How Not To Run an A/B Test”');
    if (values.mode === 'once') {
      expect(words).toContain(`one check after ${formatValue(selected.nPerLook, 'count')} visitors per group`);
      if (L === 1) {
        // one look: the comparison gives the same share, so its pale dot is under the ringed dot
        expect(naive.falsePositiveRate).toBe(selected.falsePositiveRate);
        expect(words).toContain(`The comparison schedule is ${naive.looks} daily check of ${naive.nPerLook} visitors per group with no fix.`);
      } else {
        expect(words).toContain(`The pale line is the comparison schedule: ${naive.looks} daily checks of ${naive.nPerLook} visitors per group with no fix.`);
      }
    } else {
      expect(words).toContain(`Each day checked adds ${selected.nPerLook} visitors per group.`);
      const once = computePeek({ ...values, mode: 'once' }).selected;
      expect(words).toContain(
        `Checked once at the end, after the same ${formatValue(once.nPerLook, 'count')} visitors per group, the simulated rate is ${pct(once.falsePositiveRate, 1)}.`,
      );
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
      const line = prose(method(html));
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
    for (const looks of [4, 16, 17, 28]) expect(prose(method(at({ looks, mode: 'daily', fix: 'obf' }).html))).toContain('): close to or under the nominal 5%.');
    for (const looks of [1, 34]) expect(prose(method(at({ looks, mode: 'daily', fix: 'cs' }).html))).toContain('): well under the nominal 5%.');
  });

  it("O'Brien-Fleming: the last-look bar over one look's as an approximate whole percent, and no extra bar at one look", () => {
    const one = prose(result(at({ looks: 1, mode: 'daily', fix: 'obf' }).html));
    expect(one).toBe(`With a single check, ${pct(at({ looks: 1, mode: 'daily', fix: 'obf' }).view.selected.falsePositiveRate, 1)} of 1,000 tests found a false winner, close to or under the 5% a single check allows. With one check there is nothing to correct.`);
    expect(one).not.toMatch(/every day for 1 day/);
    expect(one).not.toMatch(/higher/);
    expect(one).not.toMatch(/(?<![\d.])0%/);
    for (const [looks, price] of [[2, '1%'], [10, '7%'], [20, '8%'], [50, '11%']] as const) {
      const { view, html } = at({ looks, mode: 'daily', fix: 'obf' });
      expect(view.cost).toEqual({ kind: 'boundary', ratio: expect.any(Number) });
      expect(pct(view.cost!.ratio - 1, 0)).toBe(price);
      expect(prose(result(html))).toContain(
        `close to or under the 5% a single check allows. The price: at the last check, the bar is about ${price} higher than for one check.`,
      );
    }
  });

  it('the confidence sequence: well under here, how far depends on the setting, and its width at the same planning sample', () => {
    for (const looks of [1, 2, 20, 50]) {
      const line = prose(result(at({ looks, mode: 'daily', fix: 'cs' }).html));
      expect(prose(method(at({ looks, mode: 'daily', fix: 'cs' }).html))).toContain('well under the nominal 5%.');
      expect(line).toContain('That is well under the 5% a single check allows. How far under depends on the setting.');
      // the validity at 5% is never put in doubt, only how far under it lands
      expect(line).not.toMatch(/not guaranteed|not a guarantee/);
      expect(line).toContain("The price: at the last check, its margin of error is about 55% wider than one check's.");
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
    expect(once).toContain('With one check the comparison schedule gives the same share, so its pale dot sits under the ringed dot.');
    expect(once).not.toContain('The pale dot is');
    const obf = prose(caption(at({ looks: 1, mode: 'daily', fix: 'obf' }).html));
    expect(obf).toContain('The comparison is the same 1 daily check of 100 visitors per group with no fix; with one check the fix changes nothing, so the pale dot sits under the ringed dot.');
    expect(obf).not.toContain('The pale dot is');
    // the confidence sequence at one look differs from the comparison, so its pale dot shows
    const cs = at({ looks: 1, mode: 'daily', fix: 'cs' });
    expect(cs.view.naive.falsePositiveRate).not.toBe(cs.view.selected.falsePositiveRate);
    expect(prose(caption(cs.html))).toContain('The pale dot is the same 1 daily check of 100 visitors per group with no fix; the ringed dot uses the fix.');
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
      'Each setting is its own simulation, so nearby numbers of days can differ by a few points.',
    );
  });

  it('names each criterion in the caption', () => {
    expect(prose(caption(at({ looks: 20, mode: 'daily', fix: 'naive' }).html))).toContain(
      'A run counts as a false winner the first time its p-value (pooled z-test, two-sided) falls below 0.05.',
    );
    expect(prose(caption(at({ looks: 20, mode: 'daily', fix: 'obf' }).html))).toContain(
      "A run counts as a false winner the first time the size of its z statistic reaches the O'Brien-Fleming bar for that check, set for an overall two-sided level of 0.05.",
    );
    expect(prose(caption(at({ looks: 20, mode: 'daily', fix: 'cs' }).html))).toContain(
      'A run counts as a false winner the first time the 95% confidence sequence for the difference excludes zero.',
    );
    expect(prose(caption(at({ looks: 20, mode: 'once', fix: 'naive' }).html))).toContain(
      'A run counts as a false winner if its p-value (pooled z-test, two-sided) at that one check falls below 0.05.',
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

  it('sit in a group named by the Figure title: days checked, the fix and Reset, three controls, no schedule', () => {
    const group = daily.match(/<div role="group" aria-labelledby="peeking-title"[^>]*>[\s\S]*$/)?.[0] ?? '';
    expect(group).not.toBe('');
    // the row ends at its Reset button
    const words = text(group.slice(0, group.indexOf('>Reset</button>') + '>Reset</button>'.length));
    for (const w of ['Days checked', 'Fix', 'No fix', 'Stricter early checks', 'Always-valid check', 'Reset']) {
      expect(words).toContain(w);
    }
    for (const w of ['Schedule', 'Check every day', 'Check once at the end', 'Correction', "O'Brien-Fleming", 'confidence sequence']) {
      expect(words).not.toContain(w);
    }
    expect(daily.match(/type="range"/g)).toHaveLength(1);
    expect(daily.match(/<fieldset/g)).toHaveLength(1);
    expect(daily.match(/>Reset<\/button>/g)).toHaveLength(1);
    expect(daily).not.toContain('data-peek-fix-reason');
    expect(daily).not.toMatch(/<fieldset[^>]*disabled/);
  });

  it('give the days with the visitors they add up to, under a simulated marker', () => {
    expect(daily).toMatch(/<div data-slider="[^"]*" data-js-only="[^"]*" data-derived="simulated"/);
    expect(daily).toContain('aria-valuetext="20 days, 2,000 visitors per group by the last"');
    expect(text(daily)).toContain('20 days');
  });
});
