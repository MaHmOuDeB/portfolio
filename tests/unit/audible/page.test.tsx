// The Audible case study and its Figure. The page follows the reading model: a plain opening, a
// glance card with three pull figures, the in-page links, then the exhibits (the ship rule first,
// why so many recommendations were adopted, the tool I built with its two timings, the AI tools),
// the method with its details rows, the limits, the sources, the close and the next project. Every
// claim on it is pinned here by its exact rendered wording. The ship-rule Figure is a made-up product
// with made-up metric names, typed-in interval bounds and a "Simulated" badge in every view. Every
// number is a <Fact> or a <Derived> (the build's truth audit).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { withoutCta } from '../page-cta';
import { describe, expect, expectTypeOf, it } from 'vitest';
import AudibleRoute, { metadata } from '@/app/work/audible/page';
import { AUDIBLE_HEAD, AUDIBLE_SECTIONS, AUDIBLE_TITLE, AudiblePage } from '@/components/audible/AudiblePage';
import { FrameworkFigure } from '@/components/audible/FrameworkFigure';
import { DECISION_LABEL, FrameworkFigureView, frameworkAnnouncement, frameworkTable } from '@/components/audible/FrameworkView';
import type { EagerOrIntent } from '@/components/figures/EagerOrIntent';
import { FRAMEWORK_DEFAULTS, frameworkDecision, type FrameworkValues } from '@/lib/audible/framework';
import { FRAMEWORK_ID, FRAMEWORK_PRESETS, FRAMEWORK_SCHEMA, paramsToValues } from '@/lib/audible/framework-url';
import { FACTS, FACT_DISPLAYS } from '@/lib/facts';
import { factText } from '@/lib/facts/text';
import { withSiteName } from '@/lib/seo/metadata';
import { LIVE_ROUTES } from '@/lib/site';
import { parseFragment, type DefaultTreeAdapterTypes as P } from 'parse5';
import { seoEntry } from '../../../content/seo.ts';
import { auditHtml } from '../../../scripts/truth-audit.ts';

const repo = join(import.meta.dirname, '../../..');

const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** Visible text: tags removed, entities decoded, whitespace collapsed, no space before punctuation. */
const text = (markup: string) =>
  decode(markup.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/ ([.,:;)?])/g, '$1')
    .replace(/\( /g, '(')
    .trim();
/** The markup of the section with this id (sections do not nest). */
const section = (markup: string, id: string) => {
  const start = markup.indexOf(`<section id="${id}"`);
  if (start < 0) throw new Error(`no section ${id}`);
  return markup.slice(start, markup.indexOf('</section>', start));
};
/** Every paragraph-level block (p, li, dd) of some markup, as markup. */
const blocks = (markup: string) => [...markup.matchAll(/<(p|li|dd)[\s>][\s\S]*?<\/\1>/g)].map((m) => m[0]);
/** The kit's "Simulated" provenance badge, inside the Figure's caption. */
const SIMULATED_BADGE = /<figcaption[\s\S]*<span class="[^"]*border-muted[^"]*">Simulated<\/span>/;
/** The markup of the Figure with this id. */
const figureOf = (markup: string, id: string) => {
  const start = markup.indexOf(`<figure id="${id}"`);
  if (start < 0) throw new Error(`no figure ${id}`);
  return markup.slice(start, markup.indexOf('</figure>', start) + '</figure>'.length);
};

/** Every aria-label or aria-valuetext with a digit whose element and ancestors carry no data-fact or data-derived. */
function unmarkedAriaDigits(markup: string): string[] {
  const found: string[] = [];
  const walk = (node: P.ParentNode, marked: boolean) => {
    for (const child of node.childNodes) {
      if (!('tagName' in child)) continue;
      const el = child as P.Element;
      const own = el.attrs.some((a) => a.name === 'data-fact' || a.name === 'data-derived');
      for (const a of el.attrs) {
        if ((a.name === 'aria-label' || a.name === 'aria-valuetext') && /\d/.test(a.value) && !(marked || own)) found.push(`${a.name}="${a.value}"`);
      }
      walk(el, marked || own);
    }
  };
  walk(parseFragment(markup), false);
  return found;
}

const PAGE = withoutCta(renderToStaticMarkup(<AudiblePage />));
const ctx = { route: '/work/audible', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] };

/** The page's own sections, in page order: the exhibits first, then the method, the limits and the sources. */
const ORDER = [
  ['ship-rule', 'When to ship: try the rule yourself'],
  ['why-so-many', 'Why so many were adopted'],
  ['automation', 'Test-account automation'],
  ['ai-tools', 'AI tools for the team'],
  ['method', 'Method'],
  ['limits', 'Limits'],
  ['sources', 'Sources and links'],
] as const;

/** The real metric names of the role: prose may name them, the made-up Figure never does. */
const REAL_METRICS = /revenue|listening|churn|ILTV|long-term value|Audible|Amazon/i;

/** The glance card, and one of its facts by its term. */
const GLANCE = /<section aria-label="At a glance"[\s\S]*?<\/section>/.exec(PAGE)?.[0] ?? '';
const glanceFact = (term: string) => text(new RegExp(`<dt>${term}</dt><dd>([\\s\\S]*?)</dd>`).exec(GLANCE)?.[1] ?? '');
/** The details rows of some markup: the summary's words and the body's paragraph-level blocks. */
const rowsOf = (markup: string) =>
  [...markup.matchAll(/<details data-method=""([^>]*)><summary[^>]*>([\s\S]*?)<\/summary><div data-method-body="">([\s\S]*?)<\/div><\/details>/g)].map(
    (m) => ({ attrs: m[1]!, summary: text(m[2]!), summaryHtml: m[2]!, body: blocks(m[3]!).map(text), html: m[3]! }),
  );

describe('the outline', () => {
  it('has one h1: the test count as a Fact, the employer, and the quiet clause', () => {
    expect(AUDIBLE_TITLE).toBe(`${factText('profile.audible.experiments')} A/B tests at Audible (Amazon)`);
    expect(AUDIBLE_TITLE).toBe('25+ A/B tests at Audible (Amazon)');
    expect(AUDIBLE_TITLE.length).toBeLessThanOrEqual(60);
    expect(AUDIBLE_HEAD.quiet).toBe('from the plan to the recommendation.');
    expect([...PAGE.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
    const h1 = /<h1 id="audible-title"[^>]*>([\s\S]*?)<\/h1>/.exec(PAGE)![1]!;
    expect(h1).toMatch(/^<data [^>]*data-fact="profile\.audible\.experiments"[^>]*>25\+<\/data> A\/B tests at Audible \(Amazon\), <span data-quiet="">from the plan to the recommendation\.<\/span>$/);
    // The title as a string (the sharing card and the metadata read it) says what the h1's lead says.
    expect(text(h1.replace(/<\/?data[^>]*>/g, ''))).toBe(`${AUDIBLE_TITLE}, ${AUDIBLE_HEAD.quiet}`);
    expect(PAGE).toMatch(/<span data-chip="">Case study<\/span><h1 /);
  });

  it('opens in plain words: what I did, with team verbs, and who decided', () => {
    const head = PAGE.slice(PAGE.indexOf('</h1>'), PAGE.indexOf('<section aria-label="At a glance"'));
    const intro = head.slice(0, head.indexOf('<div data-case-actions'));
    expect(text(intro)).toBe(
      'For nearly two years as a working student at Audible I helped teams decide which changes to the website and app should stay. I contributed to the A/B tests, did the sample-size planning and the significance testing myself, and wrote a recommendation from each analysis; my manager made the decision.',
    );
    // No disclaimer first, and no jargon in the opening.
    expect(text(intro)).not.toMatch(/confidential|ILTV|guardrail|habituated|baseline/i);
    expect(text(intro)).not.toMatch(/I (planned|ran|designed|defined) (each|the|every)/);
  });

  it('offers one action under the opening: ask me about this work', () => {
    const actions = /<div data-case-actions=""[^>]*>([\s\S]*?)<\/div>/.exec(PAGE)![1]!;
    const links = [...actions.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], text(m[2]!)]);
    expect(links).toEqual([['/contact', 'Ask me about this work']]);
  });

  it('puts the sections in the reading order, each named by its own h2 that rises as a heading', () => {
    const sections = [...PAGE.matchAll(/<section id="([^"]+)" aria-labelledby="([^"]+)"[^>]*>\s*<h2 id="([^"]+)"([^>]*)>([^<]+)<\/h2>/g)].map(
      (m) => [m[1], m[2], m[3], decode(m[5]!), m[4]] as const,
    );
    expect(sections.map(([id, , , title]) => [id, title])).toEqual(ORDER.map(([id, title]) => [id, title]));
    for (const [id, labelledBy, headingId, , attrs] of sections) {
      expect(labelledBy).toBe(`${id}-title`);
      expect(headingId).toBe(`${id}-title`);
      // A section headline sits a clear step above a Figure's title.
      expect(attrs).toContain('text-h2-xs md:text-h2-sm');
      expect(attrs).toContain('data-depth-rise="heading"');
    }
    expect(AUDIBLE_SECTIONS.map((s) => s.id)).toEqual(ORDER.map(([id]) => id));
    // the page's own sections, then the close
    expect([...PAGE.matchAll(/<h2[\s>]/g)]).toHaveLength(ORDER.length + 1);
    expect(PAGE.lastIndexOf('<h2')).toBe(PAGE.indexOf('<h2 id="what-this-shows"'));
  });

  it('skips no heading level: h1, then h2 sections, with h3 only for the Figure inside a section', () => {
    const levels = [...PAGE.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    expect(levels[0]).toBe(1);
    for (const [i, level] of levels.entries()) if (i > 0) expect(level - levels[i - 1]!, `heading ${i}`).toBeLessThanOrEqual(1);
    expect(levels.filter((l) => l === 3)).toHaveLength(1);
  });

  it('has no summary block, no problem, data or findings section, and no bar chart', () => {
    for (const id of ['summary', 'problem', 'data', 'findings']) expect(PAGE, id).not.toContain(`<section id="${id}"`);
    expect(PAGE).not.toContain('>Summary<');
    expect(PAGE).not.toContain('data-figure="setup-time"');
    expect(existsSync(join(repo, 'src/components/audible/AutomationFigure.tsx'))).toBe(false);
    expect([...PAGE.matchAll(/<figure [^>]*data-figure="/g)]).toHaveLength(1);
  });

  it('keeps the anchors other pages link to', () => {
    for (const id of ['why-so-many', 'ship-rule', 'automation', 'limits']) expect(PAGE, id).toContain(`<section id="${id}"`);
    // "How I checked this" is a details row now; its anchor is on the row's visible summary.
    expect([...PAGE.matchAll(/id="how-i-checked-this"/g)]).toHaveLength(1);
    expect(PAGE).toMatch(/<summary[^>]*><span><span id="how-i-checked-this">How I checked this<\/span><\/span>/);
  });

  it('has in-page links under a named navigation, in page order, only to visible headings', () => {
    const nav = /<nav aria-label="On this page"[^>]*>([\s\S]*?)<\/nav>/.exec(PAGE);
    expect(nav).not.toBeNull();
    const links = [...nav![1]!.matchAll(/<a [^>]*href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], text(m[2]!)]);
    expect(links).toEqual([
      ['ship-rule', 'When to ship'],
      ['why-so-many', 'Why so many?'],
      ['automation', 'Automation'],
      ['ai-tools', 'AI tools'],
      ['method', 'Method'],
      ['limits', 'Limits'],
      ['sources', 'Sources'],
    ]);
    // Every target is a section whose h2 is outside any details row.
    const closed = [...PAGE.matchAll(/<details[\s\S]*?<\/details>/g)].map((m) => m[0]).join('');
    for (const [id] of links) {
      expect(PAGE, id).toContain(`<section id="${id}"`);
      expect(closed, id).not.toContain(`id="${id}-title"`);
    }
    // the links come right after the glance card, before the first section
    expect(PAGE.indexOf('data-section-nav')).toBeGreaterThan(PAGE.indexOf('data-glance=""'));
    expect(PAGE.indexOf('data-section-nav')).toBeLessThan(PAGE.indexOf('<section id="ship-rule"'));
  });

  it('keeps every element id unique', () => {
    const ids = [...PAGE.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps prose in the readable column, and has no motion of its own', () => {
    for (const [id] of ORDER) {
      const s = section(PAGE, id);
      expect(s.slice(s.indexOf('</h2>') + '</h2>'.length), id).toMatch(/^<div class="mt-4 max-w-text[ "]/);
    }
    const own = PAGE.replace(/<figure [\s\S]*?<\/figure>/g, '');
    expect(own).not.toMatch(/animate-|fade|slide-in/);
    // The only transition is the kit button's colour answering the pointer (the action, the close's links).
    expect(own.replace(/<a [^>]*>/g, '')).not.toMatch(/transition/);
  });
});

describe('the glance card', () => {
  const points = [...GLANCE.matchAll(/<li data-glance-point="">([\s\S]*?)<\/li>/g)].map((m) => m[1]!);

  it('opens on three pull figures, each a Fact with one short label', () => {
    expect(points.map((p) => text(p.replace(/<\/?data[^>]*>/g, '')))).toEqual([
      '25+ A/B tests across web and mobile',
      '20+ recommendations adopted Why so many?',
      'about 3 min to set up a test account, down from about 20, with a tool I built',
    ]);
    expect(points.map((p) => [...p.matchAll(/data-fact="([^"]+)"/g)].map((m) => m[1]))).toEqual([
      ['profile.audible.experiments'],
      ['profile.audible.recommendations_adopted'],
      ['profile.audible.setup_minutes_after', 'profile.audible.setup_minutes_before'],
    ]);
    // the words around the last figure are the smaller unit, as in the Home proof band
    expect(points[2]).toMatch(/<span data-proof-unit="">about <\/span><data [^>]*>3<\/data><span data-proof-unit=""> min<\/span>/);
  });

  it('gives the adoption figure its context link, small and under the label, as a full touch target', () => {
    const link = /<span class="([^"]*)"><a ([^>]*)>Why so many\?<\/a><\/span>/.exec(points[1]!);
    expect(link).not.toBeNull();
    expect(link![1]!.split(/\s+/)).toEqual(expect.arrayContaining(['block', 'text-sm']));
    expect(link![2]).toContain('href="#why-so-many"');
    expect(link![2]).toContain('data-touch-target=""');
    expect(link![2]).toContain('min-h-(--size-target)');
  });

  it('says the job in one sentence, then When, Role, Methods, Tools and Scope', () => {
    expect(text(/<p data-glance-outcome="">([\s\S]*?)<\/p>/.exec(GLANCE)![1]!)).toBe(
      'Each test needed a plan before it started and a recommendation when it ended: roll the change out permanently, or not.',
    );
    expect([...GLANCE.matchAll(/<dt>([^<]+)<\/dt>/g)].map((m) => m[1])).toEqual(['When', 'Role', 'Methods', 'Tools', 'Scope']);
    expect(glanceFact('When')).toBe('Aug 2023 to Apr 2025.');
    expect(glanceFact('Role')).toBe('Working student. I recommended; my manager decided.');
    expect(glanceFact('Methods')).toBe(
      'Primary, secondary and guardrail metrics per team, sample-size and duration planning, significance testing, SQL segmentation.',
    );
    expect(glanceFact('Tools')).toBe(
      "Amazon's internal experimentation platforms, SQL, Excel, Tableau as a data source, Tampermonkey with a step recorder.",
    );
    expect(glanceFact('Scope')).toBe('Method and role. The results are confidential.');
  });
});

describe('Audible truth', () => {
  it('never puts the experiments and the markets in one claim', () => {
    for (const b of blocks(PAGE)) {
      const both = b.includes('data-fact="profile.audible.experiments"') && b.includes('data-fact="profile.audible.markets"');
      expect(both, text(b)).toBe(false);
    }
    // Nor in one section: the markets belong to the automation tool alone.
    for (const [id] of ORDER) {
      const s = section(PAGE, id);
      if (s.includes('data-fact="profile.audible.markets"')) expect(s, id).not.toContain('data-fact="profile.audible.experiments"');
    }
    expect(GLANCE).not.toContain('profile.audible.markets');
    expect([...PAGE.matchAll(/data-fact="profile\.audible\.markets"/g)]).toHaveLength(1);
  });

  it('gives every short adoption claim the "why so many" link or its full context', () => {
    const claims = [...blocks(PAGE), ...[...PAGE.matchAll(/<li data-glance-point="">[\s\S]*?<\/li>/g)].map((m) => m[0])];
    let seen = 0;
    for (const b of claims) {
      if (!b.includes('data-fact="profile.audible.recommendations_adopted"')) continue;
      seen++;
      const inContext = section(PAGE, 'why-so-many').includes(b);
      expect(inContext || /href="#why-so-many"/.test(b), text(b)).toBe(true);
    }
    expect(seen).toBeGreaterThanOrEqual(2);
  });

  it('gives all three reasons for the adoption figure, with the 20+ of 25+ context', () => {
    const s = section(PAGE, 'why-so-many');
    expect(text(s)).toBe(
      [
        'Why so many were adopted',
        'Of my recommendations from 25+ tests, 20+ were adopted, which means rolled out permanently. That is not a win rate. Three things explain it.',
        'Strong bets. Most tests were machine-learning personalisation or carousel ordering, for habituated and not yet habituated members, against baselines without personalisation.',
        'Vetted ideas. Ideas reached a test through a pre-vetted, iterative pipeline in a mature team.',
        'A ship rule that allowed neutral results. A change could roll out with a neutral primary metric when the guardrails held and there was a product reason.',
      ].join(' '),
    );
  });

  it('names the automation tool exactly, with its figures as Facts, and no count of users', () => {
    const s = section(PAGE, 'automation');
    const before = s.slice(0, s.indexOf('<div data-figure-sheet'));
    const after = s.slice(s.indexOf('</div></div></div>', s.indexOf('<div data-figure-sheet')));
    expect(blocks(before).map(text)).toEqual([
      'Setting up a test account by hand took about 20 minutes. I noticed the bottleneck myself and built a tool for it: Tampermonkey with a step recorder. It cut the setup to about 3 minutes, about 85% less.',
    ]);
    expect(blocks(after).map(text)).toEqual([
      'To help the team adopt it, I wrote a guide to installing and using it, held a Q&A meeting with stakeholders, and recorded a video showing how to use it. I have no usage count for it.',
    ]);
    for (const id of ['setup_minutes_before', 'setup_minutes_after', 'setup_time_cut', 'markets']) {
      expect(s, id).toContain(`data-fact="profile.audible.${id}"`);
    }
    expect(text(s)).not.toMatch(/Tampermonkey(?! with a step recorder)/);
  });

  it('shows the two timings as two large figures in one sheet, with my own timings named as the source and no "Simulated" badge', () => {
    const s = section(PAGE, 'automation');
    const sheet = s.slice(s.indexOf('<div data-figure-sheet'), s.indexOf('To help the team'));
    const stats = [...sheet.matchAll(/<div><p class="text-3xl font-semibold">([\s\S]*?)<\/p><p class="mt-1 text-base">([\s\S]*?)<\/p><p class="mt-1 text-xs text-muted">([\s\S]*?)<\/p><\/div>/g)].map(
      (m) => [text(m[1]!.replace(/<\/?data[^>]*>/g, '')), text(m[2]!), text(m[3]!.replace(/<\/?data[^>]*>/g, ''))],
    );
    expect(stats).toEqual([
      ['about 20 min', 'by hand', 'My own timings, approximate.'],
      ['about 3 min', 'with the tool', 'Adopted team-wide, across 11 markets.'],
    ]);
    expect([...sheet.matchAll(/data-fact="([^"]+)"/g)].map((m) => m[1])).toEqual([
      'profile.audible.setup_minutes_before',
      'profile.audible.setup_minutes_after',
      'profile.audible.markets',
    ]);
    expect(s).not.toMatch(/Simulated|reconstruction|telemetry|<figure|<svg/);
    // the two figures are one labelled group, so the pair is announced as what it is
    expect(sheet).toMatch(/<div role="group" aria-label="Test-account setup time, by hand and with the tool"/);
  });

  it('describes the AI tools in the safe wording: Bedrock evaluated, tools built and adopted, nothing joining the two, no figure', () => {
    const paragraphs = blocks(section(PAGE, 'ai-tools')).map(text);
    expect(paragraphs).toEqual([
      'I evaluated Amazon Bedrock for team-efficiency use cases.',
      'I also built internal AI tools that the wider team adopted. One reviews past A/B tests and their results and suggests new test ideas. The other generates the standard content of the Jira ticket for a test launch: the hypothesis, the metrics and the standard fields. I have no usage or time-saving figures for them.',
    ]);
    // Bedrock and the tools never share a paragraph, and no word says the tools ran on it or came from it.
    for (const p of paragraphs) expect(/Bedrock/.test(p) && /tools/.test(p), p).toBe(false);
    const all = paragraphs.join(' ');
    expect(all).not.toMatch(/\b(on|with|using|after|then|so|from) (Amazon )?Bedrock|Bedrock[- ](based|powered)|automatically|created? (the )?tickets?|AI-powered/i);
    expect(section(PAGE, 'ai-tools')).not.toMatch(/data-fact|data-derived/);
    expect(text(section(PAGE, 'ai-tools'))).not.toMatch(/\d/);
    expect(text(PAGE).match(/Bedrock/g)).toHaveLength(1);
  });

  it('describes the method as team work: my own planning and testing visible, with the consent-aware SQL work', () => {
    const s = section(PAGE, 'method');
    const visible = s.slice(0, s.indexOf('<details'));
    expect(blocks(visible).map(text)).toEqual([
      'Before a test started, I planned its sample size and how long it had to run. When it ended, I did the significance testing and read the result against the metrics of the team that ran it.',
      'I also contributed to CRM-driven personalisation for opted-in and opted-out members on the Home and Discovery pages, and wrote the SQL segmentation queries within the consent rules of the Digital Markets Act (DMA).',
    ]);
    expect(text(visible)).not.toMatch(/cohort/i);
  });

  it('keeps the rest of the method one click deeper, in three details rows, text unchanged', () => {
    const rows = rowsOf(section(PAGE, 'method'));
    expect(rows.map((r) => r.summary)).toEqual(['The teams and their metrics', 'How I checked this', 'Why there are no results here']);
    for (const r of rows) expect(r.attrs, r.summary).not.toContain('open');
    expect(rows[0]!.body).toEqual([
      'Over my time there I worked with 3 teams, one after another as the teams were reorganised: Onsite & App Experience, Early Engagement and Emerging Member Experience.',
      'The metric frameworks were the teams\' own. In Onsite & App Experience, revenue was the primary metric and listening minutes the secondary one; in Early Engagement it was the other way round. Both used churn and incremental long-term value (ILTV) as guardrails: metrics that must not get worse.',
      'From the analysis I made a recommendation, and my manager signed off on the decision.',
    ]);
    expect(rows[1]!.body).toEqual([
      'I did the sample-size and duration planning before each test and the significance testing after it myself.',
      'I set up tests as well as analysing them.',
      'The ship rule on this page is unit-tested: every combination of bounds gives exactly one of the four calls, and the bounds at zero and at the guardrail limit fall on the stated side.',
    ]);
    expect(rows[2]!.body).toEqual([
      "The tests ran on Amazon's internal experimentation platforms, in the Audible app and on the website. Their results are not public, so the example on this page uses a made-up product.",
    ]);
    // Only the frameworks paragraph names a metric, and never for the third team.
    const frameworks = blocks(rows[0]!.html).find((b) => /revenue/.test(b))!;
    expect(frameworks).not.toContain('Emerging Member Experience');
    for (const b of blocks(PAGE)) {
      if (/revenue|listening minutes|churn|ILTV/i.test(b)) expect(b, text(b)).toBe(frameworks);
    }
    // The teams were one after another, never at once.
    expect(rows[0]!.body[0]).toContain('one after another');
  });

  it('pins the limits and the links', () => {
    const limits = blocks(section(PAGE, 'limits')).map(text);
    expect(limits).toEqual([
      'The results of these tests are confidential, so I cannot publish their effect sizes.',
      'The adoption count is not a win rate, and it does not represent all test ideas: the ideas were vetted before they reached a test, and a recommendation not to roll out is not counted.',
      'The ship rule on this page is simplified. You type the interval bounds in; nothing is estimated from observations, and a neutral result here needs no product reason.',
      'The automation timings are approximate, as I reported them.',
    ]);
    const links = [...section(PAGE, 'sources').matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], text(m[2]!)]);
    expect(links).toEqual([
      ['/work/retention', 'Customer retention and reactivation analysis, another case study'],
      ['https://www.linkedin.com/in/melbergui', 'My LinkedIn profile'],
    ]);
  });

  it('states each limit at most twice in the visible page: once near the top or its exhibit, once under Limits', () => {
    const visible = text(PAGE.replace(/<details[\s\S]*?<\/details>/g, '').replace(/<figure [\s\S]*?<\/figure>/g, ''));
    const count = (re: RegExp) => (visible.match(re) ?? []).length;
    expect(count(/confidential/gi)).toBe(2);
    expect(count(/not a win rate/gi)).toBe(3); // the section's own sentence, the limit, and the close's one clause
    expect(count(/approximate/gi)).toBe(2);
    expect(count(/made up|made-up/gi)).toBeLessThanOrEqual(2);
    expect(visible).not.toMatch(/honest/i);
    // The figures are not repeated across the page: the test count twice, the adoption count twice.
    expect([...PAGE.matchAll(/data-fact="profile\.audible\.experiments"/g)]).toHaveLength(3); // h1, glance, context
    expect([...PAGE.matchAll(/data-fact="profile\.audible\.recommendations_adopted"/g)]).toHaveLength(2);
  });

  it('never claims more than the role: a working student who recommended, with team verbs, and no banned word', () => {
    const all = text(PAGE);
    expect(all).toContain('working student');
    expect(all).not.toMatch(/I (defined|owned|led|decided|shipped)\b/);
    expect(all).not.toMatch(/win rate of|uplift of|lift of|conversion rate|passionate|rockstar|AI-powered/i);
    expect(all).not.toMatch(/[←-⇿·–—]/);
  });
});

describe('the close', () => {
  it('says what the page shows about how I work, with two onward links', () => {
    const close = /<section data-page-close=""[\s\S]*?<\/section>/.exec(PAGE)![0];
    expect(close).toMatch(/<h2 id="what-this-shows"[^>]*>What this shows about how I work<\/h2>/);
    expect(text(/<div data-page-close-body="">([\s\S]*?)<\/div>/.exec(close)![1]!)).toBe(
      'I plan before I test, separate my recommendation from the decision, and say plainly why a high adoption count is not a win rate.',
    );
    const links = [...close.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], text(m[2]!)]);
    expect(links).toEqual([
      ['/lab', 'Try the Lab'],
      ['/experiment', 'See the live test'],
    ]);
  });

  it('leads on to the next project, Retention, and has no previous one: this is the first page of the work', () => {
    const next = /<nav aria-label="More work" data-next-row="">([\s\S]*?)<\/nav>/.exec(PAGE)![1]!;
    const links = [...next.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => [/href="([^"]+)"/.exec(m[1]!)?.[1], /data-next="([^"]+)"/.exec(m[1]!)?.[1], text(m[2]!)]);
    expect(links).toEqual([['/work/retention', 'next', 'Next Retention']]);
    // order: the close, then the next row, then nothing but the closing space
    expect(PAGE.indexOf('data-page-close')).toBeLessThan(PAGE.indexOf('data-next-row'));
    expect(PAGE.slice(PAGE.indexOf('</nav>', PAGE.indexOf('data-next-row')))).toBe('</nav><div class="pb-12 md:pb-16"></div></article>');
  });
});

describe('the ship-rule section and its Figure', () => {
  const s = section(PAGE, 'ship-rule');
  const figure = figureOf(PAGE, FRAMEWORK_ID);

  it('introduces the made-up product, defines a guardrail once, and says teams also allowed neutral results', () => {
    expect(blocks(s.slice(0, s.indexOf('data-lead-in'))).map(text)).toEqual([
      'Chapter Club is a reading-club product I made up for this example. Its main metric is session completion, and its guardrail is help requests, where a rise is bad. A guardrail is a metric that must not get worse for a change to ship, even when the main metric improves.',
      'This illustrates the general approach; teams also allowed neutral results with guardrails intact.',
    ]);
  });

  it('says what to look at above the Figure and what it means below it, around one figure sheet', () => {
    const lead = /<div data-lead-in="">([\s\S]*?)<\/div>/.exec(s)![1]!;
    expect(text(lead)).toBe(
      'What to look at A change ships when the main number goes up and the safety number does not get worse. Move the ends of the two ranges and watch the call change.',
    );
    const takeaway = /<div data-takeaway="">([\s\S]*?)<\/div>/.exec(s)![1]!;
    expect(text(takeaway)).toBe(
      'What it means The call follows from where the ranges fall, by a rule fixed in advance, not from how anyone feels about the change.',
    );
    // lead-in, then the sheet with the Figure, then the takeaway; the sheet is the section's own child
    expect(s.indexOf('data-lead-in')).toBeLessThan(s.indexOf('<div data-figure-sheet="">'));
    expect(s.indexOf('<div data-figure-sheet="">')).toBeLessThan(s.indexOf(`data-figure="${FRAMEWORK_ID}"`));
    expect(s.indexOf(`data-figure="${FRAMEWORK_ID}"`)).toBeLessThan(s.indexOf('data-takeaway'));
    expect(s).toMatch(/<\/p><\/div><div data-figure-sheet="">/);
  });

  it('says under each slider what its end stands for, in plain words', () => {
    const hints = [...figure.matchAll(/<span data-slider-readout=""[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(hints).toEqual([
      '+1.0 points, lowest plausible change',
      '+4.0 points, highest plausible change',
      '+1.0 points, highest plausible change',
    ]);
  });

  it('draws the preset on the server: title, ship decision, the badge, and no real metric names', () => {
    expect(figure).toMatch(/<h3 id="framework-title"[^>]*>Where the two intervals fall decides the call<\/h3>/);
    expect(text(figure)).toContain('Ship: the main metric rose, guardrail intact.');
    expect(figure).toMatch(SIMULATED_BADGE);
    expect(figure).not.toMatch(REAL_METRICS);
  });

  it('has three sliders and Reset, named for the made-up metrics', () => {
    const labels = [...figure.matchAll(/<label for="(framework-[a-z]+)"[^>]*>([^<]+)<\/label>/g)].map((m) => [m[1], m[2]]);
    expect(labels).toEqual([
      ['framework-lower', 'Session completion, lower end'],
      ['framework-upper', 'Session completion, upper end'],
      ['framework-guardrail', 'Help requests, upper end'],
    ]);
    expect(figure).toMatch(/<button[^>]*>[\s\S]*Reset[\s\S]*<\/button>/);
  });

  it('keeps the badge, the caption and the table in the no-JS view and in the error fallback', () => {
    for (const runtime of ['no-js', 'error'] as const) {
      const html = renderToStaticMarkup(<FrameworkFigureView values={FRAMEWORK_DEFAULTS} state={{ runtime }} />);
      expect(html, runtime).toMatch(SIMULATED_BADGE);
      expect(text(html), runtime).toContain('Chapter Club, session completion and help requests are made up.');
      expect(html, runtime).toMatch(/<table[\s>]/);
      expect(html, runtime).not.toMatch(REAL_METRICS);
    }
    expect(text(renderToStaticMarkup(<FrameworkFigureView values={FRAMEWORK_DEFAULTS} state={{ runtime: 'error' }} />))).toContain(
      'This chart could not load. The numbers are in the table below.',
    );
  });

  it('labels every decision', () => {
    expect(DECISION_LABEL).toEqual({
      ship: 'Ship: the main metric rose, guardrail intact',
      'ship-neutral': 'May ship: neutral on the main metric, guardrail intact',
      harm: 'Stop: the main metric fell',
      hold: "Hold: the guardrail's upper end is past its limit",
    });
    const cases: [FrameworkValues, keyof typeof DECISION_LABEL][] = [
      [{ primaryLower: 1, primaryUpper: 4, guardrailUpper: 1 }, 'ship'],
      [{ primaryLower: -1, primaryUpper: 3, guardrailUpper: 1 }, 'ship-neutral'],
      [{ primaryLower: -3, primaryUpper: -1, guardrailUpper: 1 }, 'harm'],
      [{ primaryLower: 1, primaryUpper: 4, guardrailUpper: 2.1 }, 'hold'],
    ];
    for (const [values, decision] of cases) {
      expect(frameworkDecision(values)).toBe(decision);
      const html = renderToStaticMarkup(<FrameworkFigureView values={values} />);
      expect(text(html)).toContain(`${DECISION_LABEL[decision]}.`);
      expect(html).not.toMatch(REAL_METRICS);
      expect(auditHtml(html, ctx)).toEqual([]);
    }
  });

  it('announces the decision and the bounds in words', () => {
    expect(frameworkAnnouncement({ primaryLower: -1, primaryUpper: 3, guardrailUpper: 1 })).toBe(
      'May ship: neutral on the main metric, guardrail intact. Session completion: −1.0 to +3.0 points; help requests: at most +1.0 points, against a limit of +2.',
    );
  });

  it('tabulates the bounds and the limit, with the simulated ref on every cell', () => {
    expect(frameworkTable(FRAMEWORK_DEFAULTS)).toEqual({
      columns: ['Bound', 'Points'],
      rows: [
        ['Session completion, lower end', 1],
        ['Session completion, upper end', 4],
        ['Help requests, upper end', 1],
        ['Help requests, limit', 2],
      ],
      formats: ['number', 'signedPoints'],
      rowDigits: [1, 1, 1, 0],
      note: 'Points are percentage points. Every value is made up.',
      refs: ['simulated'],
    });
  });
});

describe('the URL state and the island contract', () => {
  it('uses the stable keys lower, upper and guardrail on the -10 to 10 grid, with the model defaults', () => {
    expect(FRAMEWORK_ID).toBe('framework');
    expect(Object.keys(FRAMEWORK_SCHEMA)).toEqual(['lower', 'upper', 'guardrail']);
    for (const spec of Object.values(FRAMEWORK_SCHEMA)) expect(spec).toEqual({ kind: 'number', min: -10, max: 10, step: 0.1 });
    expect(FRAMEWORK_PRESETS).toEqual({ default: { lower: 1, upper: 4, guardrail: 1 } });
    expect(paramsToValues(FRAMEWORK_PRESETS.default)).toEqual(FRAMEWORK_DEFAULTS);
    // A shared URL with the ends crossed is put in order by the model.
    expect(paramsToValues({ lower: 5, upper: -2, guardrail: 0 })).toEqual({ primaryLower: 5, primaryUpper: 5, guardrailUpper: 0 });
  });

  it('mounts the island through EagerOrIntent with its own id only', () => {
    const client = readFileSync(join(repo, 'src/components/audible/FrameworkFigureClient.tsx'), 'utf8');
    expect(client).toMatch(/^'use client';/);
    expect(client).toContain("import { EagerOrIntent } from '@/components/figures/EagerOrIntent';");
    expect(client).toMatch(/<EagerOrIntent ids=\{\[FRAMEWORK_ID\]\} preview=\{preview\}>/);
    expectTypeOf<ComponentProps<typeof EagerOrIntent>['ids']>().toEqualTypeOf<readonly string[]>();
    type ClientProps = ComponentProps<typeof import('@/components/audible/FrameworkFigureClient').FrameworkFigureClient>;
    expectTypeOf<ClientProps['initial']>().toEqualTypeOf<FrameworkValues>();
    expectTypeOf<ClientProps['preview']>().toEqualTypeOf<import('react').ReactNode>();
  });

  it('server-renders the preset Figure as the island preview', () => {
    const html = renderToStaticMarkup(<FrameworkFigure />);
    expect(html).toContain('data-island="idle"');
    expect(html).toContain('data-figure="framework"');
    expect(html).toMatch(SIMULATED_BADGE);
  });
});

describe('numbers and the route', () => {
  it('passes the truth audit: every number, in text and in aria, is a Fact or names its source', () => {
    expect(auditHtml(PAGE, ctx)).toEqual([]);
  });

  it('has no digit in an aria-label or aria-valuetext outside a data-fact or data-derived element', () => {
    // The check fails on an unmarked digit, and passes one marked on the element or an ancestor.
    expect(unmarkedAriaDigits('<div aria-label="3 things"></div>')).toEqual(['aria-label="3 things"']);
    expect(unmarkedAriaDigits('<div data-derived="simulated"><input aria-valuetext="+1.0 points"></div>')).toEqual([]);
    expect(unmarkedAriaDigits(PAGE)).toEqual([]);
    // The page has such attributes to check: the sliders' value texts.
    expect(PAGE).toMatch(/aria-valuetext="[^"]*\d/);
  });

  it('ships at /work/audible with its own metadata', () => {
    expect(LIVE_ROUTES).toContain('/work/audible');
    // The words are the sharing data's (content/seo.ts, pinned by the metadata tests); here, that the route uses them.
    expect(metadata.title).toBe(withSiteName(seoEntry('/work/audible').title));
    expect(metadata.description).toBe(seoEntry('/work/audible').description);
    expect(String(metadata.title)).toMatch(/Audible \(Amazon\) \| Mahmoud El Bergui$/);
    expect(metadata.robots).toBeUndefined();
    expect(withoutCta(renderToStaticMarkup(<AudibleRoute />))).toBe(PAGE);
  });
});

// Under sm the framework chart draws its own narrow layout: short category names that never run into
// each other at 320 px, and only the short side words in the right margin, so no word is cut by the
// figure's edge. From sm up it keeps the full names and the zero-line words.
describe('the framework chart at each width', () => {
  const framework = (() => {
    const fig = figureOf(PAGE, FRAMEWORK_ID);
    const starts = [...fig.matchAll(/<div class="([^"]*)"><div data-chart="framework-chart"/g)].map((m) => ({ at: m.index, wrapper: m[1]! }));
    return starts.map(({ at, wrapper }, i) => {
      const body = fig.slice(at, starts[i + 1]?.at ?? fig.indexOf('</figure>'));
      return { wrapper, layout: /<svg data-chart-frame="" data-layout="(narrow|wide)"/.exec(body)?.[1], body };
    });
  })();
  const xTicks = (body: string) => [...body.matchAll(/<text data-tick="x"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

  it('draws one frame per layout, each shown only at its own width', () => {
    expect(framework.map((f) => f.layout)).toEqual(['narrow', 'wide']);
    expect(framework[0]!.wrapper).toBe('sm:hidden');
    expect(framework[1]!.wrapper).toBe('max-sm:hidden');
  });

  it('names the metrics briefly in the narrow layout and in full in the wide one', () => {
    expect(xTicks(framework[0]!.body)).toEqual(['Completion', 'Help requests']);
    expect(xTicks(framework[1]!.body)).toEqual(['Session completion', 'Help requests']);
  });

  it('keeps only the short side words in the narrow right margin', () => {
    expect(framework[0]!.body).not.toContain('data-zero-label');
    expect(framework[0]!.body).toContain('>higher</text>');
    expect(framework[0]!.body).toContain('>lower</text>');
    expect(framework[1]!.body).toMatch(/data-zero-label[\s\S]*no change/);
  });
});
