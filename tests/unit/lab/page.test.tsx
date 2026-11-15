// The Lab's two static routes: /lab, four ways an A/B test can mislead and the check for each, as one
// reading page in the order of a test's life (a head that says what the page is for, four cards, one
// exhibit per check, the limits, a close), and /lab/peeking, the peeking example alone for the
// interview link. Every Figure on them is simulated or computed from values the
// visitor sets, so each carries the Simulated badge and its table is in the server HTML. Nothing on
// them comes from the live experiment, and both are public, indexable pages.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LAB_SECTIONS } from '../../../content/lab';
import { HOME_LINKS } from '../../../content/home-destinations';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { LAB_TITLE, LabPage, LabPeekingPage } from '@/components/lab/LabPage';
import { FACTS, FACT_DISPLAYS } from '@/lib/facts';
import { readFigureParams } from '@/lib/figure/url-state';
import { CURSE_PRESETS, CURSE_SCHEMA } from '@/lib/lab/diagnostics-values';
import { FULL_PLAN_PRESETS, FULL_PLAN_SCHEMA } from '@/lib/lab/full-planner-values';
import { PEEK_PRESETS, PEEK_SCHEMA } from '@/lib/lab/peeking-values';
import { LIVE_ROUTES } from '@/lib/site';

const repo = join(import.meta.dirname, '../../..');

const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** Visible text: tags removed, entities decoded, whitespace collapsed, no space before punctuation. */
const text = (markup: string) =>
  decode(markup.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/ ([.,:;)])/g, '$1')
    .trim();
/** The markup of the section with this id (sections do not nest). */
const section = (markup: string, id: string) => {
  const start = markup.indexOf(`<section id="${id}"`);
  if (start < 0) throw new Error(`no section ${id}`);
  return markup.slice(start, markup.indexOf('</section>', start));
};
/** Each chart Figure's own markup, by its id. */
const figures = (markup: string) =>
  [...markup.matchAll(/<figure [^>]*data-figure="([^"]+)"[\s\S]*?<\/figure>/g)].map((m) => ({ id: m[1]!, html: m[0] }));
const audit = (markup: string, route: string) =>
  auditHtml(`<!doctype html><html><head><title>t</title></head><body>${markup}</body></html>`, {
    route,
    factIds: new Set(Object.keys(FACTS)),
    factDisplays: FACT_DISPLAYS,
    denylist: [],
  });

const LAB = renderToStaticMarkup(<LabPage />);
const PEEKING = renderToStaticMarkup(<LabPeekingPage />);

const ORDER = [
  ['sample-size', 'Sample size and duration', 'Is the test big enough?', 'Before the test', ['planner', 'duration']],
  ['split-check', 'Split check', 'Did each group get its share?', 'While it runs', ['srm']],
  ['peeking-at-results', 'Peeking at results', 'Did we stop too early?', 'When reading it', ['peeking']],
  ['exaggeration', 'Exaggeration', 'Is the win as big as it looks?', 'After a win', ['curse']],
] as const;

/** The exhibits of a piece of markup, each split into its parts in document order. */
const exhibits = (markup: string) =>
  markup
    .split('<div data-lab-exhibit="">')
    .slice(1)
    // an exhibit ends with its method row
    .map((rest) => rest.slice(0, rest.indexOf('</details>', rest.indexOf('<details data-method=""')) + '</details>'.length))
    .map((html) => ({
      html,
      order: [...html.matchAll(/<(?:div|details) (data-lead-in=""|data-figure-sheet=""|data-lab-point="wide"|data-method="")/g)].map((m) => m[1]),
      leadIn: text(/<div data-lead-in="">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? ''),
      phone: text(/<div data-lab-point="phone"[^>]*>([\s\S]*?)<\/div><\/div>/.exec(html)?.[1] ?? ''),
      wide: text(/<div data-lab-point="wide"[^>]*>([\s\S]*?)<\/div><\/div>/.exec(html)?.[1] ?? ''),
      caption: text(/<figcaption[^>]*><p[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? ''),
      method: text(/<details data-method="">([\s\S]*?)<\/details>/.exec(html)?.[1] ?? ''),
      figure: /<figure [^>]*data-figure="([^"]+)"/.exec(html)?.[1],
    }));

describe('the Lab page', () => {
  it('has one h1 that says what the page is for, under the chip Lab, and opens in plain words', () => {
    expect([...LAB.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
    const h1 = /<h1 id="lab-title"[^>]*>([\s\S]*?)<\/h1>/.exec(LAB);
    expect(text(h1![1]!)).toBe('Four ways an A/B test can mislead, and the check for each.');
    expect(h1![1]).toContain('<span data-quiet="">and the check for each.</span>');
    expect(LAB.slice(0, LAB.indexOf('<h1'))).toContain('<span data-chip="">Lab</span>');
    // the document title stays the navigation's word
    expect(LAB_TITLE).toBe('Lab');
    const opening = text(LAB.slice(LAB.indexOf('</h1>'), LAB.indexOf('<nav')));
    expect(opening).toBe(
      'An A/B test shows two versions of a page to two groups of visitors and compares what they do. It only helps a business if the result can be trusted. These are the four checks I make before I believe a result. Move the controls: every number is made up or simulated, none comes from a real test.',
    );
    expect(text(LAB)).not.toMatch(/\bI run\b|honestly/i);
  });

  it('lists the four checks as cards in the order of a test\'s life, each with its question, one line and a sketch', () => {
    const nav = /<nav aria-label="On this page"[^>]*>([\s\S]*?)<\/nav>/.exec(LAB);
    expect(nav).not.toBeNull();
    const items = [...nav![1]!.matchAll(/<li[^>]*data-lab-check="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)];
    expect(items.map((m) => m[1])).toEqual(ORDER.map(([id]) => id));
    items.forEach((m, i) => {
      const [id, , question, when] = ORDER[i]!;
      const item = m[2]!;
      const link = /<a ([^>]*)>/.exec(item)![1]!;
      expect(link, id).toContain(`href="#${id}"`);
      expect(link, id).toContain('data-touch-target=""');
      expect(link, id).toContain('data-depth-lean=""');
      // the card is named by its h3: when the check comes (with its place in the list), then the question
      const h3 = /<h3 id="([^"]+)"[^>]*>([\s\S]*?)<\/h3>/.exec(item)!;
      expect(link, id).toContain(`aria-labelledby="${h3[1]}"`);
      expect(text(h3[2]!), id).toBe(`${i + 1} ${when} ${question}`);
      expect(h3[2], id).toContain(`<data value="${i + 1}" data-derived="build">${i + 1}</data>`);
      // one plain line, no number
      const line = text(/<p id="[^"]+-description">([\s\S]*?)<\/p>/.exec(item)![1]!);
      expect(line, id).toBe(LAB_SECTIONS[i]!.line);
      expect(line, id).toMatch(/^[A-Z][\s\S]{20,}\.$/);
      expect(line, id).not.toMatch(/\d/);
      // the sketch: decorative, untagged, without a digit
      const sketch = /<div data-vignette="" aria-hidden="true">([\s\S]*?)<span data-depth-go/.exec(item);
      expect(sketch, id).not.toBeNull();
      expect(text(sketch![1]!), id).not.toMatch(/Illustration/);
      expect(text(sketch![1]!), id).not.toMatch(/\d/);
      expect(sketch![1], id).toContain(`data-lab-sketch="`);
      // only the peeking card says where a reader with one minute starts
      expect(item.includes('One minute? Start here.'), id).toBe(id === 'peeking-at-results');
    });
    // four different sketches
    expect(new Set([...nav![1]!.matchAll(/data-lab-sketch="([^"]+)"/g)].map((m) => m[1])).size).toBe(4);
    expect(LAB_SECTIONS.map((s) => s.figure)).toEqual(['planner', 'srm', 'peeking', 'curse']);
  });

  it('puts one section per check in that order: the short label as a chip, the question as the h2, its Figures, then what the examples cannot show', () => {
    const sections = [
      ...LAB.matchAll(/<section id="([^"]+)" aria-labelledby="([^"]+)"[^>]*>\s*(?:<span data-chip="">([^<]+)<\/span>)?<h2 id="([^"]+)"[^>]*>([^<]+)<\/h2>/g),
    ].map((m) => ({ id: m[1]!, labelledBy: m[2]!, chip: m[3], headingId: m[4]!, title: decode(m[5]!) }));
    expect(sections.map((s) => [s.id, s.chip, s.title])).toEqual([
      ...ORDER.map(([id, label, question]) => [id, label, question]),
      ['limits', undefined, 'What these examples cannot show'],
    ]);
    for (const s of sections) {
      expect(s.labelledBy).toBe(`${s.id}-title`);
      expect(s.headingId).toBe(`${s.id}-title`);
    }
    for (const [id, , , , ids] of ORDER) {
      const part = section(LAB, id);
      expect([...part.matchAll(/<figure [^>]*data-figure="([^"]+)"/g)].map((m) => m[1]), id).toEqual([...ids]);
      // the section headline is one clear step above the Figure's title
      expect(part, id).toMatch(/<h2 id="[^"]+"[^>]*class="[^"]*text-h2-xs md:text-h2-sm/);
    }
    expect(figures(LAB).map((f) => f.id)).toEqual(['planner', 'duration', 'srm', 'peeking', 'curse']);
    // no anchor of a section is a Figure id, so both can be linked; every anchor other pages use is there
    for (const [id] of ORDER) expect(figures(LAB).map((f) => f.id)).not.toContain(id);
    for (const id of ['sample-size', 'split-check', 'peeking-at-results', 'exaggeration', 'limits', 'planner', 'duration', 'peeking', 'srm', 'curse']) {
      expect([...LAB.matchAll(new RegExp(`\\sid="${id}"`, 'g'))], id).toHaveLength(1);
    }
    // headings never skip a level: h1, then h2s, each card and Figure title an h3 under an h2
    const levels = [...LAB.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    expect(levels[0]).toBe(1);
    levels.forEach((level, i) => {
      if (i > 0) expect(level, `heading ${i}`).toBeLessThanOrEqual(levels[i - 1]! + 1);
    });
  });

  // each method row names its own Figure, so a screen reader's list of rows is not five identical ones
  const METHOD_SUMMARY: Record<string, string> = {
    planner: 'The method behind the sample size',
    duration: 'The method behind the run time',
    srm: 'The method behind the split check',
    peeking: 'The method behind the peeking chart',
    curse: 'The method behind the exaggeration chart',
  };

  it('frames every Figure as an exhibit: what to look at, the Figure on its sheet, what it means, the method one click deeper', () => {
    const all = exhibits(LAB);
    expect(all.map((e) => e.figure)).toEqual(['planner', 'duration', 'srm', 'peeking', 'curse']);
    for (const e of all) {
      expect(e.order, e.figure).toEqual(['data-lead-in=""', 'data-figure-sheet=""', 'data-lab-point="wide"', 'data-method=""']);
      expect(e.leadIn, e.figure).toMatch(/^What to look at [A-Z]/);
      expect(e.wide, e.figure).toMatch(/^What it means [A-Z]/);
      // on a phone the point comes before the controls: the same sentence as the Figure's lead
      expect(e.phone, e.figure).toBe(e.wide);
      expect(e.html.indexOf('data-lab-point="phone"'), e.figure).toBeLessThan(e.html.indexOf('data-figure-controls'));
      expect(e.html, e.figure).toMatch(/<div data-lab-point="phone" class="sm:hidden">/);
      expect(e.html, e.figure).toMatch(/<div data-lab-point="wide" class="max-sm:hidden">/);
      // the caption under the chart is one sentence; the rest is in the method row, closed at first
      expect(e.caption.match(/[.?!](\s|$)/g) ?? [], e.figure).toHaveLength(1);
      expect(e.method.startsWith(`${METHOD_SUMMARY[e.figure ?? '']} `), e.figure).toBe(true);
      expect(e.html, e.figure).not.toMatch(/<details data-method="" open/);
    }
    const by = Object.fromEntries(all.map((e) => [e.figure, e]));
    expect(by.planner!.leadIn).toContain('The large number is how many visitors each group needs.');
    expect(by.planner!.wide).toContain('Halve the rise you want to detect and the test needs about four times the visitors.');
    expect(by.duration!.leadIn).toContain('Now set the daily traffic.');
    expect(by.duration!.wide).toContain('A quiet page can need months to show a small rise.');
    // the method text moved, unchanged: the formula, the test, the criterion, the assumptions
    expect(by.planner!.method).toContain("Sample sizes from Cohen's h for a two-sided test at a significance level of 5% and a power of 80%");
    expect(by.planner!.method).toContain('Either way the sample is the same.');
    expect(by.duration!.method).toContain('The traffic is a number to plan with, not a promise of actual traffic');
    expect(by.srm!.method).toContain('The check is a chi-square test with one degree of freedom on the counts against that share.');
    expect(by.peeking!.method).toContain('A run counts as a false winner the first time its p-value (pooled z-test, two-sided) falls below 0.05.');
    expect(by.peeking!.method).toContain('Idea credited to Evan Miller');
    expect(by.curse!.method).toContain('Reporting only those is the selection that creates the exaggeration.');
    // each term is defined once, in its method row
    for (const term of ['Sample size', 'Power', 'Split check (sample ratio mismatch)', 'Peeking', 'False winner (false positive)', "O'Brien-Fleming", 'Confidence sequence']) {
      expect(LAB.split(`<strong class="font-semibold">${term.replace("'", '&#x27;')}</strong>`), term).toHaveLength(2);
    }
  });

  it('quotes the starting numbers in a takeaway as the Figure prints them at its preset', () => {
    const by = Object.fromEntries(exhibits(LAB).map((e) => [e.figure, e]));
    const figure = (id: string) => figures(LAB).find((f) => f.id === id)!.html;
    // the split check: the two counts of the preset, and a takeaway worded for the starting numbers
    expect(by.srm!.leadIn).toContain('At the starting numbers, group A got 5,170 visitors and group B 4,830');
    expect(figure('srm')).toMatch(/id="srm-nA"[^>]*value="5170"/);
    expect(figure('srm')).toMatch(/id="srm-nB"[^>]*value="4830"/);
    expect(by.srm!.wide).toContain('At the starting numbers it is not.');
    // peeking: one in twenty is the nominal 5%, the days are the preset's looks, and the preset's rate is above one in five
    expect(by.peeking!.wide).toContain('Read once at the end, about 1 test in 20 raises a false alarm. At the starting setting, checked on each of 20 days, more than 1 in 5 does.');
    expect(text(figure('peeking'))).toContain('Checked every day for 20 days, 22.1% of 1,000 tests');
    expect(by.peeking!.leadIn).toContain('how many of 1,000 simulated tests');
    // exaggeration: the power and the factor of the preset's readout
    const power = text(/<span data-curse-power=""[^>]*>([^<]*)<\/span>/.exec(figure('curse'))![1]!);
    const factor = text(/<span data-curse-exaggeration=""[^>]*>([^<]*)<\/span>/.exec(figure('curse'))![1]!);
    expect(by.curse!.wide).toContain(`At the starting setting the test notices the effect only ${power} of the time, and when it does it reports about ${factor} times the truth.`);
  });

  it('links another setting under each exhibit, each a real key of its Figure with a value other than the preset', () => {
    const links = [...LAB.matchAll(/<a href="([^"]+)"[^>]*data-full-load=""[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [decode(m[1]!), text(m[2]!)]);
    expect(links).toEqual([
      ['?planner.risePoints=2#sample-size', 'Try a rise of 2 points'],
      ['/lab?srm.preset=even#split-check', 'See the same check on an even split'],
      ['?peeking.fix=obf#peeking-at-results', 'See it with stricter early looks'],
      ['?peeking.fix=cs#peeking-at-results', 'See it with an always-valid interval'],
      ['?curse.trueEffect=3#exaggeration', 'See a test with enough power'],
    ]);
    // each link is a flex row, so its label is one item: a number inside it keeps its spaces
    const labels = [...LAB.matchAll(/<a href="[^"]+"[^>]*data-full-load=""[^>]*>([\s\S]*?)<\/a>/g)].map((m) => m[1]!);
    for (const label of labels) expect(label).toMatch(/^<span>(?:(?!<\/?span)[\s\S])*<\/span>$/);
    expect(labels[0]).toBe('<span>Try a rise of <data value="2" data-derived="simulated">2</data> points</span>');
    expect(FULL_PLAN_PRESETS.default.risePoints).not.toBe(2);
    expect(readFigureParams(new URLSearchParams('planner.risePoints=2'), 'planner', FULL_PLAN_SCHEMA, FULL_PLAN_PRESETS).values.risePoints).toBe(2);
    for (const fix of ['obf', 'cs'] as const) {
      expect(readFigureParams(new URLSearchParams(`peeking.fix=${fix}`), 'peeking', PEEK_SCHEMA, PEEK_PRESETS).values).toEqual({ ...PEEK_PRESETS.default, fix });
    }
    expect(readFigureParams(new URLSearchParams('curse.trueEffect=3'), 'curse', CURSE_SCHEMA, CURSE_PRESETS).values).toEqual({ ...CURSE_PRESETS.default, trueEffect: 3 });
  });

  it('adds no animation of its own, and keeps the prose in the readable column', () => {
    const own = LAB.replace(/<figure [\s\S]*?<\/figure>/g, '');
    expect(own).not.toMatch(/animate-|fade-up|slide-in|rounded-lg|shadow/);
    expect(LAB.slice(0, LAB.indexOf('<nav'))).toMatch(/class="[^"]*max-w-text/);
    // the limits' rule runs from rail to rail; only its text is held to the readable column
    expect(section(LAB, 'limits')).toMatch(/^<section id="limits" aria-labelledby="limits-title" data-rule="" class="mt-12 pt-12 md:mt-16 md:pt-16">/);
    expect(section(LAB, 'limits')).toMatch(/<div class="max-w-text mt-4">/);
  });

  it('says in the visible limits what the duration row assumes: every visitor enters the test', () => {
    expect(text(section(LAB, 'limits'))).toContain(
      'The planner assumes two groups of equal size, a result read once at the end, the same traffic every day and every visitor entering the test.',
    );
  });

  it('ends with what the page shows about how I work, two onward links and the shared call to action', () => {
    const close = /<section data-page-close=""[^>]*aria-labelledby="lab-close"[^>]*>([\s\S]*?)<\/section>/.exec(LAB);
    expect(close).not.toBeNull();
    expect(text(/<h2 id="lab-close"[^>]*>([\s\S]*?)<\/h2>/.exec(close![1]!)![1]!)).toBe('What this shows about how I work');
    expect(text(close![1]!)).toContain(
      "I size a test before it starts, check the split before I read anything, decide in advance how often I will look, and treat a small test's win with suspicion. The live test on this site sizes itself, checks its split and fixes its looks in advance, on real visitors.",
    );
    expect([...close![1]!.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], text(m[2]!)])).toEqual([
      ['/experiment', 'See the live test'],
      ['/work/audible', 'See how I planned tests at Audible'],
    ]);
    for (const href of ['/experiment', '/work/audible']) expect(LIVE_ROUTES, href).toContain(href);
    // limits, then the close, then the call to action, last
    const order = ['<section id="limits"', '<section data-page-close=""', 'data-page-cta=""'].map((mark) => LAB.indexOf(mark));
    expect(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1]!))).toBe(true);
    expect(LAB.slice(order[2])).toContain('Write to me');
  });

  it('has at least two limits, among them that no number comes from a real test', () => {
    const s = section(LAB, 'limits');
    expect([...s.matchAll(/<li[\s>]/g)].length).toBeGreaterThanOrEqual(2);
    expect(text(s)).toContain('None of them comes from a real test');
  });

  it('badges every Figure Simulated, never Public data or Live, and server-renders each open table', () => {
    const all = figures(LAB);
    expect(all).toHaveLength(5);
    for (const { id, html } of all) {
      expect(text(html), id).toContain('Simulated');
      expect(html, id).not.toMatch(/Public data|Live from this site/);
      const nojs = /<div data-figure-tables=""[^>]*>[\s\S]*?<div [^>]*data-nojs-only=""[^>]*data-table-body=""[^>]*>([\s\S]*?)<\/table>/.exec(html);
      expect(nojs, `${id}: the open table`).not.toBeNull();
      expect(nojs![1]!, id).toMatch(/<tbody>[\s\S]*<td/);
    }
  });

  it('keeps every id unique', () => {
    const ids = [...LAB.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(20);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('passes the truth audit, and says nothing of the live test', () => {
    expect(audit(LAB, '/lab')).toEqual([]);
    expect(LAB).not.toMatch(/data-experiment|data-live|data-phase/);
    const all = `${text(LAB)} ${[...LAB.matchAll(/aria-label="([^"]*)"/g)].map((m) => decode(m[1]!)).join(' ')}`;
    expect(all).not.toMatch(/Live from this site|AI-powered|passionate|rockstar/i);
    expect(all).not.toMatch(/\barm\b|per arm/i);
  });

  // The quantities the Lab's examples measure are the hypothetical product's own: every control
  // label, control group legend and table column header, exactly.
  it('names only its own controls and columns', () => {
    const names = (re: RegExp) => [...new Set([...LAB.matchAll(re)].map((m) => text(m[1]!)))].sort();
    expect({
      labels: names(/<label\b[^>]*>([\s\S]*?)<\/label>/g),
      legends: names(/<legend\b[^>]*>([\s\S]*?)<\/legend>/g),
      columns: names(/<th\b[^>]*scope="col"[^>]*>([\s\S]*?)<\/th>/g),
    }).toEqual({
      labels: [
        'Always valid (confidence sequence)',
        'Baseline conversion',
        'Baseline conversion, exact value',
        'Check every day',
        'Check once at the end',
        'Daily checks',
        'Daily checks, exact value',
        'Expected share in group A',
        'Expected share in group A, exact value',
        'Group A visitors',
        'Group A visitors, exact value',
        'Group B visitors',
        'Group B visitors, exact value',
        'Noise (standard error)',
        'Noise (standard error), exact value',
        'None',
        'Percent of baseline',
        'Points',
        'Real effect',
        'Real effect, exact value',
        'Smallest rise worth detecting',
        'Smallest rise worth detecting, points',
        "Stricter early looks (O'Brien-Fleming)",
        'Total visitors per day',
        'Total visitors per day, exact value',
      ],
      legends: ['Correction', 'Rise to detect, in', 'Schedule'],
      columns: [
        'Exaggeration among significant estimates',
        'Expected share',
        'Expected visitors',
        'False winners so far, no fix (%)',
        'Group',
        'Input or result',
        'Look',
        'Power',
        'True effect \u00f7 standard error',
        'Value',
        'Visitors',
        'Wrong sign among significant estimates',
        'Your setting',
      ],
    });
  });
});

describe('the peeking page', () => {
  it('is the same peeking exhibit, id peeking, under its own headline, with a link back to the Lab', () => {
    expect([...PEEKING.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
    const h1 = /<h1 id="lab-title"[^>]*>([\s\S]*?)<\/h1>/.exec(PEEKING);
    expect(text(h1![1]!)).toBe('Peeking at results, why checking early finds false winners.');
    expect(text(PEEKING)).toContain('One example from the Lab: what happens when a test is checked every day and stopped at the first win.');
    // the same exhibit as on the Lab: lead-in, takeaway and method row
    expect(exhibits(PEEKING)).toEqual(exhibits(LAB).filter((e) => e.figure === 'peeking'));
    expect(text(section(PEEKING, 'peeking-at-results'))).toMatch(/^Did we stop too early\? What to look at /);
    expect(figures(PEEKING).map((f) => f.id)).toEqual(['peeking']);
    expect(figures(PEEKING)[0]!.html).toBe(figures(LAB).find((f) => f.id === 'peeking')!.html);
    const back = /<a ([^>]*)>All the examples in the Lab<\/a>/.exec(PEEKING);
    expect(back?.[1]).toContain('href="/lab"');
    expect(back?.[1]).toContain('data-touch-target=""');
    expect(section(PEEKING, 'peeking-at-results')).toContain('<h2 id="peeking-at-results-title"');
  });

  it('passes the truth audit, keeps its ids unique and badges the Figure Simulated with its open table', () => {
    expect(audit(PEEKING, '/lab/peeking')).toEqual([]);
    const ids = [...PEEKING.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    const { html } = figures(PEEKING)[0]!;
    expect(text(html)).toContain('Simulated');
    expect(html).toMatch(/<div data-figure-tables=""[^>]*>[\s\S]*?<div [^>]*data-nojs-only=""[^>]*data-table-body=""[\s\S]*?<tbody>/);
  });

  it('the interview link opens the same view as the default: daily, 20 looks, no fix', () => {
    expect(PEEK_PRESETS.interview).toEqual(PEEK_PRESETS.default);
    expect(PEEK_PRESETS.interview).toEqual({ looks: 20, mode: 'daily', fix: 'naive' });
    const read = readFigureParams(new URLSearchParams('peeking.preset=interview'), 'peeking', PEEK_SCHEMA, PEEK_PRESETS);
    expect(read).toEqual({ values: { looks: 20, mode: 'daily', fix: 'naive' }, preset: 'interview' });
  });
});

describe('the routes', () => {
  const routes = [
    ['/lab', 'src/app/lab/page.tsx', '<LabPage />', LAB, () => import('@/app/lab/page')],
    ['/lab/peeking', 'src/app/lab/peeking/page.tsx', '<LabPeekingPage />', PEEKING, () => import('@/app/lab/peeking/page')],
  ] as const;

  it.each(routes)('%s is a thin, plain static page that renders its composition, indexable', async (_route, file, jsx, markup, load) => {
    const source = readFileSync(join(repo, file), 'utf8');
    expect(source).toContain(jsx);
    expect(source).not.toMatch(/revalidate|dynamic|searchParams|cookies\(|headers\(|faultAfterChange|robots|noindex/);
    const mod = (await load()) as {
      default: () => React.ReactNode;
      metadata: { title?: unknown; description?: unknown; robots?: unknown };
    };
    expect(renderToStaticMarkup(<>{mod.default()}</>)).toBe(markup);
    expect(mod.metadata.robots).toBeUndefined();
    expect(typeof mod.metadata.title).toBe('string');
    // no numeric claim in the metadata
    expect(`${String(mod.metadata.title)} ${String(mod.metadata.description)}`).not.toMatch(/\d/);
  });

  it('both are live routes, as are the Lab and Retention links on the Home page', () => {
    expect(LIVE_ROUTES).toEqual(expect.arrayContaining(['/lab', '/lab/peeking', '/work/retention']));
    for (const href of [HOME_LINKS.lab, HOME_LINKS.retention]) expect(LIVE_ROUTES, href).toContain(href);
  });

  it('the dev hosts mount the same compositions', () => {
    const lab = readFileSync(join(repo, 'src/app/kitchen-sink/lab/page.dev.tsx'), 'utf8');
    const peeking = readFileSync(join(repo, 'src/app/kitchen-sink/lab/peeking/page.dev.tsx'), 'utf8');
    expect(lab).toContain('<LabPage />');
    expect(peeking).toContain('<LabPeekingPage />');
    for (const host of [lab, peeking]) expect(host).not.toMatch(/faultAfterChange/);
  });
});

describe('Figure titles', () => {
  it('end without a full stop, as on the other pages', () => {
    const titles = [...LAB.matchAll(/<figure [^>]*data-figure="[^"]+"[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => text(m[1]!));
    expect(titles.length).toBeGreaterThanOrEqual(4);
    for (const title of titles) expect(title).not.toMatch(/\.$/);
  });
});
