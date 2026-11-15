// The Lab's two static routes: /lab, four ways an A/B test can mislead and how I catch each one, as one
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
import { CURSE_PRESETS, CURSE_SCHEMA, SRM_PRESETS, SRM_SCHEMA } from '@/lib/lab/diagnostics-values';
import { LAB_PLAN_PRESETS, LAB_PLAN_SCHEMA } from '@/lib/lab/full-planner-values';
import { PLANNER_POWER } from '@/lib/lab/planner-values';
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
  ['sample-size', 'Sample size and power', 'Is the test big enough?', 'Before the test', ['planner']],
  ['split-check', 'Sample ratio mismatch', 'Did each group get its share?', 'While it runs', ['srm']],
  ['peeking-at-results', 'Peeking', 'Did we stop too early?', 'When reading it', ['peeking']],
  ['exaggeration', "Winner's curse (type M error)", 'Is the win as big as it looks?', 'After a win', ['curse']],
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
    expect(text(h1![1]!)).toBe('Four ways an A/B test can mislead you, and how I catch each one.');
    expect(h1![1]).toContain('<span data-quiet="">and how I catch each one.</span>');
    expect(LAB.slice(0, LAB.indexOf('<h1'))).toContain('<span data-chip="">Lab</span>');
    // the document title stays the navigation's word
    expect(LAB_TITLE).toBe('Lab');
    const opening = text(LAB.slice(LAB.indexOf('</h1>'), LAB.indexOf('<nav')));
    expect(opening).toBe(
      'An A/B test shows two versions of a page to two groups of visitors. Then it compares what each group does. Show both groups the same page, and their results still differ a little, by luck. So a test calls a winner only when the gap clears a bar. The bar is set so that luck alone rarely clears it. A wrong call can ship a change that does nothing, or drop one that works. These are the four checks I make before I trust a result. Every number below is made up or simulated.',
    );
    // the no-JS view has static Figures, so the opening never asks the reader to play with them
    expect(opening).not.toMatch(/play with/);
    expect(text(LAB)).not.toMatch(/honestly/i);
    // the cards' lines, in plain words (card 2 says a gap matters only beyond what luck allows)
    expect(LAB_SECTIONS.map((s) => s.line)).toEqual([
      'With too few visitors, luck can hide a real gain. So I work out the visitors a test needs before it starts.',
      'The groups should come out close to half each. A bigger gap than luck allows means the setup is broken. Then no result can be trusted, however good it looks.',
      'Check daily and stop at the first win, and luck can pick your winner.',
      'A test too small for the effect wins only on a lucky reading. So its wins look bigger than they are.',
    ]);
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
    ].map((m) => ({ id: m[1]!, labelledBy: m[2]!, chip: m[3] === undefined ? undefined : decode(m[3]), headingId: m[4]!, title: decode(m[5]!) }));
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
    expect(figures(LAB).map((f) => f.id)).toEqual(['planner', 'srm', 'peeking', 'curse']);
    // the duration Figure is the Retention page's only: the Lab has one planner Figure
    expect(LAB).not.toContain('data-figure="duration"');
    // no anchor of a section is a Figure id, so both can be linked; every anchor other pages use is there
    for (const [id] of ORDER) expect(figures(LAB).map((f) => f.id)).not.toContain(id);
    for (const id of ['sample-size', 'split-check', 'peeking-at-results', 'exaggeration', 'limits', 'planner', 'peeking', 'srm', 'curse']) {
      expect([...LAB.matchAll(new RegExp(`\\sid="${id}"`, 'g'))], id).toHaveLength(1);
    }
    // headings never skip a level: h1, then h2s, each card and Figure title an h3 under an h2
    const levels = [...LAB.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    expect(levels[0]).toBe(1);
    levels.forEach((level, i) => {
      if (i > 0) expect(level, `heading ${i}`).toBeLessThanOrEqual(levels[i - 1]! + 1);
    });
  });

  // Each check opens with its trap: one everyday picture of the mistake, without a number, in the
  // frame's lead-in labelled "The trap", right under the h2 and before the exhibit.
  const TRAPS: Record<string, string> = {
    'sample-size':
      'Toss a coin a few times and you may get mostly heads, just by luck. A test with few visitors swings by luck the same way. A small real rise can vanish inside those swings.',
    'split-check':
      'Each visitor is put in group A or B by a fair coin toss. A fair coin lands near half each, but rarely exactly half. A much bigger gap means something broke, say a page that fails on some phones. Then the groups differ in who is in them, not just in the page.',
    'peeking-at-results':
      'Roll a die until a six comes up, and one always does. Checking a test daily and stopping at the first win works the same way. Each check gives luck another roll.',
    exaggeration:
      'A cheap bathroom scale wobbles a little each day. Write down only the days it shows a big loss. Your notes will say you lost more than you really did. A small test is that scale: only its luckiest readings clear the bar.',
  };
  it('renders each check\'s trap under its h2, before the exhibit, in plain words without a number', () => {
    expect(LAB_SECTIONS.map((s) => [s.id, s.trap])).toEqual(Object.entries(TRAPS));
    const trapOf = (markup: string, id: string) => {
      const part = section(markup, id);
      const m = /<\/h2><div data-lead-in=""><p data-exhibit-label="">([\s\S]*?)<\/p><p data-exhibit-text="">([\s\S]*?)<\/p><\/div>/.exec(part);
      expect(m, id).not.toBeNull();
      // the trap comes before the exhibit's own lead-in
      expect(part.indexOf('data-lead-in'), id).toBeLessThan(part.indexOf('data-lab-exhibit'));
      return { label: text(m![1]!), body: text(m![2]!) };
    };
    for (const [id, trap] of Object.entries(TRAPS)) {
      expect(trapOf(LAB, id), id).toEqual({ label: 'The trap', body: trap });
      expect(trap, id).not.toMatch(/\d/);
    }
    // the peeking page shows the same trap
    expect(trapOf(PEEKING, 'peeking-at-results')).toEqual({ label: 'The trap', body: TRAPS['peeking-at-results'] });
    // one trap per section, never inside a Figure
    expect([...LAB.matchAll(/<p data-exhibit-label="">The trap<\/p>/g)]).toHaveLength(4);
    for (const { id, html } of figures(LAB)) expect(html, id).not.toContain('The trap');
  });

  // each method row names its own Figure, so a screen reader's list of rows is not four identical ones
  const METHOD_SUMMARY: Record<string, string> = {
    planner: 'How I worked out the size and the weeks',
    srm: 'How the split check works',
    peeking: 'How the simulation works',
    curse: 'How the overstatement is calculated',
  };
  // one short caption each: what the numbers are; the rest is in the method row
  const CAPTION: Record<string, string> = {
    planner: 'Made-up numbers to plan with. Visitors are split evenly between the two groups.',
    srm: 'Made-up visitor counts. Each group was meant to get half.',
    peeking: 'Simulated tests of two identical pages, each with a 35% sign-up rate.',
    curse: 'An exact calculation on made-up values, with no random draws.',
  };

  // On a phone the point sits between the Figure's title and its controls, so it reads as body text
  // (the base size, regular weight), not as the wide takeaway's large medium line that buries the
  // controls. Only the Lab's phone point: every other takeaway keeps its own look.
  it('sets the phone point as body text, so the controls stay close', () => {
    const css = readFileSync(join(repo, 'src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = /\[data-lab-point="phone"\] \[data-exhibit-text\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/font-size:\s*var\(--text-base\)/);
    expect(rule).toMatch(/line-height:\s*1\.6/);
    expect(rule).toMatch(/font-weight:\s*var\(--font-weight-regular\)/);
    // it comes after the takeaway's rule of the same specificity, so it wins
    expect(css.indexOf('[data-lab-point="phone"] [data-exhibit-text]')).toBeGreaterThan(css.indexOf('[data-takeaway] [data-exhibit-text]'));
    expect(css).toMatch(/\[data-takeaway\] \[data-exhibit-text\]\s*\{[^}]*font-size:\s*var\(--text-lg\)/);
  });

  it('frames every Figure as an exhibit: try it, the Figure on its sheet, what I do about it, the method one click deeper', () => {
    const all = exhibits(LAB);
    expect(all.map((e) => e.figure)).toEqual(['planner', 'srm', 'peeking', 'curse']);
    for (const e of all) {
      expect(e.order, e.figure).toEqual(['data-lead-in=""', 'data-figure-sheet=""', 'data-lab-point="wide"', 'data-method=""']);
      expect(e.leadIn, e.figure).toMatch(/^Try it [A-Z]/);
      expect(e.wide, e.figure).toMatch(/^What I do about it [A-Z]/);
      // on a phone the point comes before the controls: the same sentence as the Figure's lead
      expect(e.phone, e.figure).toBe(e.wide);
      expect(e.html.indexOf('data-lab-point="phone"'), e.figure).toBeLessThan(e.html.indexOf('data-figure-controls'));
      expect(e.html, e.figure).toMatch(/<div data-lab-point="phone" class="sm:hidden">/);
      expect(e.html, e.figure).toMatch(/<div data-lab-point="wide" class="max-sm:hidden">/);
      // the caption under the chart is short and exact; the rest is in the method row, closed at first
      expect(e.caption, e.figure).toBe(CAPTION[e.figure ?? '']);
      expect(e.method.startsWith(`${METHOD_SUMMARY[e.figure ?? '']} `), e.figure).toBe(true);
      expect(e.html, e.figure).not.toMatch(/<details data-method="" open/);
      // every takeaway ends in a decision of mine, in the first person
      expect(e.wide, e.figure).toMatch(/\bI\b/);
    }
    // the old labels are gone from the Lab
    expect(text(LAB)).not.toMatch(/What to look at|What it means|Try this/);
    const by = Object.fromEntries(all.map((e) => [e.figure, e]));
    expect(by.planner!.leadIn).toBe(
      'Try it Make the smallest rise smaller and watch the visitors climb. Halve the rise, and each group needs about four times as many.',
    );
    expect(by.planner!.wide).toBe(
      'What I do about it Before a test, I agree on the smallest rise worth acting on. Some pages get too few visitors to show it within weeks. For those, I test a bolder change or a busier page instead of waiting months.',
    );
    expect(by.srm!.wide).toBe(
      'What I do about it It is not close enough. I make this check before I read any result. When it flags, I find what broke the split before anything else. Otherwise a winner may only reflect who ended up in each group.',
    );
    expect(by.peeking!.leadIn).toBe('Try it Both pages here are the same, so every winner is a false winner. Drag the days checked and watch how many of 1,000 tests find one.');
    expect(by.curse!.leadIn).toBe('Try it Drag the slider right, toward a bigger test. Watch the wins shrink toward the real effect.');
    // the method text: the formula, the test, the criterion, the assumptions, and the live statistics moved there
    expect(by.planner!.method).toContain("Sample sizes from Cohen's h for a two-sided test at a significance level of 5% and a power of 80%");
    expect(by.planner!.method).toContain('Either way the sample is the same.');
    expect(by.planner!.method).toContain('in whole weeks, rounded up.');
    expect(by.planner!.method).toContain('The traffic is a number to plan with, not a promise of actual traffic');
    expect(by.srm!.method).toContain('How the split check works Each visitor is assigned at random, like a fair coin toss. Split check (sample ratio mismatch):');
    expect(by.srm!.method).toContain('The check is a chi-square test with one degree of freedom on the counts against that share.');
    expect(by.srm!.method).toContain('The Lab fixes the planned share at half; the check works against any planned share.');
    expect(by.srm!.method).toMatch(/For your setting: chi-square 11\.56, one degree of freedom, p-value below 0\.001\./);
    expect(by.peeking!.method).toContain('A run counts as a false winner the first time its p-value (pooled z-test, two-sided) falls below 0.05.');
    expect(by.peeking!.method).toContain('Idea credited to Evan Miller');
    expect(by.peeking!.method).toMatch(/Checked once at the end, after the same [\d,]+ visitors per group, the simulated rate is [\d.]+%\./);
    expect(by.curse!.method).toContain('Reporting only those is the selection that creates the exaggeration.');
    expect(by.curse!.method).toContain('Gelman and Carlin');
    expect(by.curse!.method).toMatch(/your setting is a ratio of 1\.00/);
    // each term is defined once, in its method row, with the expert name beside the plain one
    for (const term of [
      'Sample size',
      'Minimum detectable effect',
      'Power',
      'Significance level',
      'Split check (sample ratio mismatch)',
      'Peeking',
      'False winner (false positive)',
      "Stricter early checks (O'Brien-Fleming)",
      'Always-valid check (confidence sequence)',
      "Winner's curse (type M error)",
    ]) {
      expect(LAB.split(`<strong class="font-semibold">${term.replaceAll("'", '&#x27;')}</strong>`), term).toHaveLength(2);
    }
    // the live statistics are in the method rows, not on the result lines
    for (const id of ['srm', 'curse']) {
      const result = text(/<p data-figure-result=""[^>]*>([\s\S]*?)<\/p>/.exec(figures(LAB).find((f) => f.id === id)!.html)?.[1] ?? '');
      expect(result, id).not.toMatch(/chi-square|p-value|ratio|standard error|power/i);
    }
  });

  it('quotes the starting numbers in a lead-in as the Figure prints them at its preset, and keeps every takeaway free of numbers', () => {
    const by = Object.fromEntries(exhibits(LAB).map((e) => [e.figure, e]));
    const figure = (id: string) => figures(LAB).find((f) => f.id === id)!.html;
    // what I do about it holds at every setting, so no takeaway quotes a number
    for (const e of exhibits(LAB)) expect(e.wide, e.figure).not.toMatch(/\d/);
    // the split check: the two counts of the preset, and a takeaway worded for the starting numbers
    expect(by.srm!.leadIn).toBe(
      'Try it Here group A got 5,170 visitors and group B 4,830. That looks close. Is it? Move group B closer to group A and watch the verdict.',
    );
    expect(figure('srm')).toMatch(/id="srm-nA"[^>]*value="5170"/);
    expect(figure('srm')).toMatch(/id="srm-nB"[^>]*value="4830"/);
    expect(text(figure('srm'))).toContain('Flagged: a fair coin leaves a gap this big or bigger less than 1 time in 1,000.');
    expect(by.srm!.wide).toContain('It is not close enough.');
    // peeking: the result line shows the contrast of daily checks and one check; the takeaway is the read plan
    expect(by.peeking!.wide).toBe(
      'What I do about it I decide how to read a test before it starts. I read it once at the end, or with a method built for daily checks. The price of checking often: a winner needs stronger proof. The live test on this site uses the always-valid check.',
    );
    expect(text(figure('peeking'))).toContain('Checked daily for 20 days, 22.1% of 1,000 tests found a false winner. Checked once at the end, about 5% would.');
    // the winner's curse: the slider's power and the readout's factor at the preset
    expect(figure('curse')).toMatch(/id="curse-power"[^>]*value="17"/);
    expect(text(figure('curse'))).toContain('17% of the time');
    const factor = text(/<span data-curse-exaggeration=""[^>]*>([^<]*)<\/span>/.exec(figure('curse'))![1]!);
    expect(factor).toBe('2.5');
    expect(by.curse!.wide).toBe(
      'What I do about it A forecast built on a win like this would overpromise. So I treat a surprising win from a small test as a lead. I test it again at full size before anyone plans on that number.',
    );
    expect(text(figure('curse'))).toContain(`At this setting, results that clear the bar average ${factor} times the real effect. Of those, 0.9% of them point the wrong way.`);
  });

  it('links another setting under each exhibit, each a real key of its Figure with a value other than the preset', () => {
    const links = [...LAB.matchAll(/<a href="([^"]+)"[^>]*data-full-load=""[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [decode(m[1]!), text(m[2]!)]);
    expect(links).toEqual([
      ['?planner.risePoints=2#sample-size', 'Try a smaller rise: 2 points'],
      ['/lab?srm.preset=even#split-check', 'See an even split pass'],
      ['?peeking.fix=obf#peeking-at-results', 'Try stricter early checks'],
      ['?peeking.fix=cs#peeking-at-results', 'Try the always-valid check'],
      [`?curse.power=${PLANNER_POWER}#exaggeration`, 'See a test sized as in check 1'],
    ]);
    // each link is a flex row, so its label is one item: a number inside it keeps its spaces
    const labels = [...LAB.matchAll(/<a href="[^"]+"[^>]*data-full-load=""[^>]*>([\s\S]*?)<\/a>/g)].map((m) => m[1]!);
    for (const label of labels) expect(label).toMatch(/^<span>(?:(?!<\/?span)[\s\S])*<\/span>$/);
    expect(labels[0]).toBe('<span>Try a smaller rise: <data value="2" data-derived="simulated">2</data> points</span>');
    // "check 1" is the planner card's own number, marked as the card marks it
    expect(labels[4]).toBe('<span>See a test sized as in check <data value="1" data-derived="build">1</data></span>');
    expect(LAB_SECTIONS[0]!.figure).toBe('planner');
    expect(LAB_PLAN_PRESETS.default.risePoints).toBeGreaterThan(2);
    expect(readFigureParams(new URLSearchParams('planner.risePoints=2'), 'planner', LAB_PLAN_SCHEMA, LAB_PLAN_PRESETS).values).toEqual({ ...LAB_PLAN_PRESETS.default, risePoints: 2 });
    expect(readFigureParams(new URLSearchParams('srm.preset=even'), 'srm', SRM_SCHEMA, SRM_PRESETS).values).not.toEqual(SRM_PRESETS.default);
    for (const fix of ['obf', 'cs'] as const) {
      expect(readFigureParams(new URLSearchParams(`peeking.fix=${fix}`), 'peeking', PEEK_SCHEMA, PEEK_PRESETS).values).toEqual({ ...PEEK_PRESETS.default, fix });
    }
    // the curse link is a test sized as the planner sizes it: its power, from the planner's constant
    expect(readFigureParams(new URLSearchParams(`curse.power=${PLANNER_POWER}`), 'curse', CURSE_SCHEMA, CURSE_PRESETS).values).toEqual({ power: PLANNER_POWER });
    expect(CURSE_PRESETS.default.power).not.toBe(PLANNER_POWER);
    // the old keys are ignored on the Lab and fall back to the preset
    expect(readFigureParams(new URLSearchParams('curse.trueEffect=3&curse.se=0.5'), 'curse', CURSE_SCHEMA, CURSE_PRESETS).values).toEqual(CURSE_PRESETS.default);
    expect(readFigureParams(new URLSearchParams('srm.shareA=0.9'), 'srm', SRM_SCHEMA, SRM_PRESETS).values).toEqual(SRM_PRESETS.default);
    expect(readFigureParams(new URLSearchParams('peeking.mode=once'), 'peeking', PEEK_SCHEMA, PEEK_PRESETS).values).toEqual(PEEK_PRESETS.default);
    expect(readFigureParams(new URLSearchParams('duration.traffic=500&planner.mode=relative'), 'planner', LAB_PLAN_SCHEMA, LAB_PLAN_PRESETS).values).toEqual(LAB_PLAN_PRESETS.default);
  });

  it('adds no animation of its own, and keeps the prose in the readable column', () => {
    const own = LAB.replace(/<figure [\s\S]*?<\/figure>/g, '');
    expect(own).not.toMatch(/animate-|fade-up|slide-in|rounded-lg|shadow/);
    expect(LAB.slice(0, LAB.indexOf('<nav'))).toMatch(/class="[^"]*max-w-text/);
    // the limits' rule runs from rail to rail; only its text is held to the readable column
    expect(section(LAB, 'limits')).toMatch(/^<section id="limits" aria-labelledby="limits-title" data-rule="" class="mt-12 pt-12 md:mt-16 md:pt-16">/);
    expect(section(LAB, 'limits')).toMatch(/<div class="max-w-text mt-4">/);
  });

  it('says in the visible limits what the planner assumes, and in its method row that every visitor enters the test', () => {
    expect(text(section(LAB, 'limits'))).toContain(
      'The planner assumes two equal groups, the same traffic every day and one reading at the end. Checking as you go needs a different plan, as the peeking example shows.',
    );
    const planner = exhibits(LAB).find((e) => e.figure === 'planner')!;
    expect(planner.method).toContain('it assumes every one of them enters the test and the same number arrives every day.');
  });

  it('ends with what the page shows about how I work, two onward links and the shared call to action', () => {
    const close = /<section data-page-close=""[^>]*aria-labelledby="lab-close"[^>]*>([\s\S]*?)<\/section>/.exec(LAB);
    expect(close).not.toBeNull();
    expect(text(/<h2 id="lab-close"[^>]*>([\s\S]*?)<\/h2>/.exec(close![1]!)![1]!)).toBe('What this shows about how I work');
    expect(text(close![1]!)).toContain(
      "I size a test before it starts. I check the split before I read anything. I decide in advance how often I will look. And I treat a surprising win from a small test with suspicion. The live test on this site follows the same rules on real visitors. Its plan was written down before the first visitor was counted. It checks its split after every completed day. It uses the always-valid check, so it can be read every day. With this site's traffic it can only catch a large effect, and the plan says so.",
    );
    // the live test is never said to size itself or to work "the same way" in every check
    expect(text(close![1]!)).not.toMatch(/sizes itself|works the same way|planned tests/);
    expect([...close![1]!.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], text(m[2]!)])).toEqual([
      ['/experiment', 'See the live test'],
      ['/work/audible', 'See how I sized and evaluated tests at Audible'],
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
    expect(text(s)).toContain("Every number here is made up or simulated. None comes from a real test or from this site's live test.");
    expect([...s.matchAll(/<li[\s>]/g)]).toHaveLength(4);
    expect(text(s)).toContain('The peeking numbers come from one simulation with one sign-up rate. Other settings give other rates.');
    expect(text(s)).toContain('The split check and the overstatement example use simple, standard formulas. They tell you when to look closer. They are not a verdict on a real test.');
  });

  it('badges every Figure Simulated, never Public data or Live, and server-renders each open table', () => {
    const all = figures(LAB);
    expect(all).toHaveLength(4);
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
  it('names only its own controls and columns: no unit toggle, no expected-share slider, no schedule toggle, one curse slider', () => {
    const names = (re: RegExp) => [...new Set([...LAB.matchAll(re)].map((m) => text(m[1]!)))].sort();
    expect({
      labels: names(/<label\b[^>]*>([\s\S]*?)<\/label>/g),
      legends: names(/<legend\b[^>]*>([\s\S]*?)<\/legend>/g),
      columns: names(/<th\b[^>]*scope="col"[^>]*>([\s\S]*?)<\/th>/g),
    }).toEqual({
      labels: [
        'Always-valid check',
        'Days checked',
        'Days checked, exact value',
        'Group A visitors',
        'Group A visitors, exact value',
        'Group B visitors',
        'Group B visitors, exact value',
        'How often the test clears the bar',
        'How often the test clears the bar, percent',
        'No fix',
        'Sign-up rate today',
        'Sign-up rate today, percent',
        'Smallest rise worth acting on',
        'Smallest rise worth acting on, points',
        'Stricter early checks',
        'Visitors per day',
        'Visitors per day, exact value',
      ],
      legends: ['Fix'],
      columns: [
        'Day',
        'Expected visitors',
        'False winners so far, no fix (%)',
        'Group',
        'How often the test clears the bar (power)',
        'Input or result',
        'Overstatement among results that clear the bar',
        'Planned share',
        'Ratio of effect to noise',
        'Results that clear the bar but point the wrong way',
        'Value',
        'Visitors',
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
    expect(text(section(PEEKING, 'peeking-at-results'))).toMatch(/^Did we stop too early\? The trap Roll a die [^]*? Try it Both pages /);
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

  it('the interview link opens the same view as the default: 20 days checked, no fix', () => {
    expect(PEEK_PRESETS.interview).toEqual(PEEK_PRESETS.default);
    expect(PEEK_PRESETS.interview).toEqual({ looks: 20, fix: 'naive' });
    const read = readFigureParams(new URLSearchParams('peeking.preset=interview'), 'peeking', PEEK_SCHEMA, PEEK_PRESETS);
    expect(read).toEqual({ values: { looks: 20, fix: 'naive' }, preset: 'interview' });
    // an old link with the removed schedule toggle still opens the interview view
    expect(readFigureParams(new URLSearchParams('peeking.preset=interview&peeking.mode=once'), 'peeking', PEEK_SCHEMA, PEEK_PRESETS)).toEqual(read);
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
