// The Audible method page and its two Figures. The page follows the analysis template (a summary,
// then problem, data, method, the Figures' sections, findings, how I checked this, limits and
// links), and every claim on it is pinned here by its exact rendered wording. The ship-rule Figure
// is a made-up product with made-up metric names, typed-in interval bounds and a "Simulated" badge in
// every view; the automation Figure is a reconstruction from approximate reported timings, also
// badged "Simulated". Every number is a <Fact> or a <Derived> (the build's truth audit).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, expectTypeOf, it } from 'vitest';
import AudibleRoute, { metadata } from '@/app/work/audible/page';
import { AUDIBLE_SECTIONS, AUDIBLE_TITLE, AudiblePage } from '@/components/audible/AudiblePage';
import { AutomationFigure } from '@/components/audible/AutomationFigure';
import { FrameworkFigure } from '@/components/audible/FrameworkFigure';
import { DECISION_LABEL, FrameworkFigureView, frameworkAnnouncement, frameworkTable } from '@/components/audible/FrameworkView';
import type { EagerOrIntent } from '@/components/figures/EagerOrIntent';
import { FRAMEWORK_DEFAULTS, frameworkDecision, type FrameworkValues } from '@/lib/audible/framework';
import { FRAMEWORK_ID, FRAMEWORK_PRESETS, FRAMEWORK_SCHEMA, paramsToValues } from '@/lib/audible/framework-url';
import { FACTS, FACT_DISPLAYS } from '@/lib/facts';
import { LIVE_ROUTES } from '@/lib/site';
import { parseFragment, type DefaultTreeAdapterTypes as P } from 'parse5';
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

const PAGE = renderToStaticMarkup(<AudiblePage />);
const ctx = { route: '/work/audible', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] };

const ORDER = [
  ['summary', 'Summary'],
  ['problem', 'The problem'],
  ['data', 'The data'],
  ['method', 'Method'],
  ['ship-rule', 'The ship rule, on a made-up product'],
  ['why-so-many', 'Why so many were adopted'],
  ['automation', 'Test-account automation'],
  ['findings', 'Findings'],
  ['how-i-checked-this', 'How I checked this'],
  ['limits', 'Limits'],
  ['sources', 'Sources and links'],
] as const;

/** The real metric names of the role: prose may name them, the made-up Figure never does. */
const REAL_METRICS = /revenue|listening|churn|ILTV|long-term value|Audible|Amazon/i;

describe('the outline', () => {
  it('has one h1, the page title', () => {
    expect(AUDIBLE_TITLE).toBe('Most tests pitted personalisation against plain baselines');
    expect([...PAGE.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
    expect(PAGE).toMatch(/<h1 id="audible-title"[^>]*>Most tests pitted personalisation against plain baselines<\/h1>/);
  });

  it('says what the page is under the title', () => {
    const intro = PAGE.slice(PAGE.indexOf('</h1>'), PAGE.indexOf('<section id="summary"'));
    expect(text(intro)).toBe(
      'Experimentation at Audible (Amazon), where I was a working student for nearly two years: how I plan and analyse experiments, and why so many of my recommendations were adopted.',
    );
  });

  it('puts the sections in the template order, each named by its own h2', () => {
    const sections = [...PAGE.matchAll(/<section id="([^"]+)" aria-labelledby="([^"]+)"[^>]*>\s*<h2 id="([^"]+)"[^>]*>([^<]+)<\/h2>/g)].map(
      (m) => [m[1], m[2], m[3], decode(m[4]!)],
    );
    expect(sections.map(([id, , , title]) => [id, title])).toEqual(ORDER.map(([id, title]) => [id, title]));
    for (const [id, labelledBy, headingId] of sections) {
      expect(labelledBy).toBe(`${id}-title`);
      expect(headingId).toBe(`${id}-title`);
    }
    expect(AUDIBLE_SECTIONS.map((s) => s.id)).toEqual(ORDER.map(([id]) => id));
    expect([...PAGE.matchAll(/<h2[\s>]/g)]).toHaveLength(ORDER.length);
  });

  it('has the anchors other pages link to: why-so-many and automation', () => {
    expect(PAGE).toContain('<section id="why-so-many"');
    expect(PAGE).toContain('<section id="automation"');
  });

  it('has section links whose targets exist, in page order, under a named navigation', () => {
    const nav = /<nav aria-label="On this page"[^>]*>([\s\S]*?)<\/nav>/.exec(PAGE);
    expect(nav).not.toBeNull();
    const links = [...nav![1]!.matchAll(/<a [^>]*href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], text(m[2]!)]);
    expect(links.map(([href]) => href)).toEqual(ORDER.slice(1).map(([id]) => id));
    expect(links.map(([, label]) => label)).toEqual([
      'Problem',
      'Data',
      'Method',
      'Ship rule',
      'Why so many?',
      'Automation',
      'Findings',
      'How I checked this',
      'Limits',
      'Sources',
    ]);
  });

  it('keeps every element id unique', () => {
    const ids = [...PAGE.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('places each Figure in its own section, after the prose that explains it', () => {
    for (const [sectionId, figureId] of [
      ['ship-rule', FRAMEWORK_ID],
      ['automation', 'setup-time'],
    ] as const) {
      const s = section(PAGE, sectionId);
      expect(s, figureId).toContain(`data-figure="${figureId}"`);
      expect(s.indexOf('<p')).toBeLessThan(s.indexOf(`data-figure="${figureId}"`));
    }
    expect([...PAGE.matchAll(/<figure [^>]*data-figure="/g)]).toHaveLength(2);
  });

  it('keeps prose in the readable column, and has no motion and no card grid of its own', () => {
    // The summary is a readable-column box itself; every other section's body opens with a prose
    // wrapper in the readable column, right after its heading.
    expect(section(PAGE, 'summary')).toMatch(/^<section id="summary"[^>]*class="[^"]*max-w-text/);
    for (const [id] of ORDER.slice(1)) {
      const s = section(PAGE, id);
      expect(s.slice(s.indexOf('</h2>') + '</h2>'.length), id).toMatch(/^<div class="mt-4"><div class="max-w-text">/);
    }
    const own = PAGE.replace(/<figure [\s\S]*?<\/figure>/g, '');
    expect(own).not.toMatch(/animate-|transition|fade|slide-in/);
    expect(own).not.toMatch(/grid-cols-/);
  });
});

describe('the summary', () => {
  const summary = section(PAGE, 'summary');
  const items = [...summary.matchAll(/<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)].map((m) => [m[1], text(m[2]!)]);

  it('answers question, my role, method, result, decision and next step, in that order', () => {
    expect(items.map(([label]) => label)).toEqual(['Question', 'My role', 'Method', 'Result', 'Decision', 'Next step']);
  });

  it('pins every answer', () => {
    expect(Object.fromEntries(items)).toEqual({
      Question: 'Which changes to the Audible website and app should be rolled out permanently?',
      'My role':
        'A working student in marketing analytics and growth experimentation, mainly growth experimentation. I contributed to 25+ A/B tests across web and mobile, from the hypothesis to a recommendation, and worked with 3 teams over my time there, one after another.',
      Method:
        "Each test was read against its team's metrics, with a primary metric and guardrails. I did the sample-size and duration planning before a test started and the significance testing when it ended.",
      Result: 'Of my recommendations from those tests, 20+ were adopted, which means rolled out permanently. Why so many?',
      Decision: 'I made each recommendation from the analysis; my manager signed off.',
      'Next step':
        'Below: the ship rule on a made-up product, why so many recommendations were adopted, and the tool I built for test-account setup.',
    });
  });

  it('prints its figures as Facts and links the adoption figure to its context', () => {
    expect(summary).toContain('data-fact="profile.audible.experiments"');
    expect(summary).toContain('data-fact="profile.audible.teams"');
    expect(summary).toContain('data-fact="profile.audible.recommendations_adopted"');
    const result = blocks(summary).find((b) => b.includes('profile.audible.recommendations_adopted'))!;
    expect(result).toMatch(/<a [^>]*href="#why-so-many"[^>]*>[\s\S]*Why so many\?[\s\S]*<\/a>/);
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
  });

  it('gives every short adoption claim the "why so many" link or its full context', () => {
    for (const b of blocks(PAGE)) {
      if (!b.includes('data-fact="profile.audible.recommendations_adopted"')) continue;
      const inContext = section(PAGE, 'why-so-many').includes(b);
      expect(inContext || /href="#why-so-many"/.test(b), text(b)).toBe(true);
    }
  });

  it('gives all three reasons for the adoption figure, with the 20+ of 25+ context', () => {
    const s = section(PAGE, 'why-so-many');
    expect(text(s)).toBe(
      [
        'Why so many were adopted',
        'Of my recommendations from 25+ tests, 20+ were adopted, which means rolled out permanently. That is not a win rate, and three things made it high.',
        'Strong bets. Most tests were machine-learning personalisation or carousel ordering, for habituated and not yet habituated members, against baselines without personalisation.',
        'Vetted ideas. Ideas reached a test through a pre-vetted, iterative pipeline in a mature team.',
        'A ship rule that allowed neutral results. A change could roll out with a neutral primary metric when the guardrails held and there was a product reason.',
      ].join(' '),
    );
  });

  it('pins the problem and the data, with no result of any test', () => {
    expect(blocks(section(PAGE, 'problem')).map(text)).toEqual([
      'Teams at Audible tested changes to the website and the app before rolling them out to members. Each test needed a plan before it started and a recommendation when it ended: roll the change out permanently, or not.',
    ]);
    expect(blocks(section(PAGE, 'data')).map(text)).toEqual([
      "The tests ran on Amazon's internal experimentation platforms, in the Audible app and on the website. Their results are not public, so the example on this page uses a made-up product.",
    ]);
  });

  it('describes the method as team work, with the metric frameworks belonging to two named teams', () => {
    const s = section(PAGE, 'method');
    const paragraphs = blocks(s).map(text);
    expect(paragraphs).toEqual([
      'Over my time there I worked with 3 teams, one after another as the teams were reorganised: Onsite & App Experience, Early Engagement and Emerging Member Experience.',
      'Before a test started, I planned its sample size and how long it had to run. When it ended, I did the significance testing and read the result against the metrics of the team that ran it.',
      'The metric frameworks were the teams\' own. In Onsite & App Experience, revenue was the primary metric and listening minutes the secondary one; in Early Engagement it was the other way round. Both used churn and incremental long-term value (ILTV) as guardrails: metrics that must not get worse.',
      'From the analysis I made a recommendation, and my manager signed off on the decision.',
    ]);
    // Only this paragraph names a metric.
    const frameworks = blocks(s).find((b) => /revenue/.test(b))!;
    expect(frameworks).not.toContain('Emerging Member Experience');
    for (const b of blocks(PAGE)) {
      if (/revenue|listening minutes|churn|ILTV/i.test(b)) expect(b, text(b)).toBe(frameworks);
    }
  });

  it('names the automation tool exactly and its figures as Facts, with self-reported adoption and no count', () => {
    const s = section(PAGE, 'automation');
    const paragraphs = blocks(s.slice(0, s.indexOf('<figure'))).map(text);
    expect(paragraphs).toEqual([
      'Setting up a test account by hand took about 20 minutes. I noticed the bottleneck myself and built a tool for it: Tampermonkey with a step recorder. It cut the setup to about 3 minutes, about 85% less, across 11 markets.',
      'To help the team adopt it, I wrote a guide to installing and using it, held a Q&A meeting with stakeholders, and recorded a video showing how to use it. It was adopted team-wide. I did not track its usage, so there is no count of users.',
    ]);
    for (const id of ['setup_minutes_before', 'setup_minutes_after', 'setup_time_cut', 'markets']) {
      expect(s, id).toContain(`data-fact="profile.audible.${id}"`);
    }
  });

  it('pins the findings, the checks, the links and at least two concrete limits', () => {
    expect(blocks(section(PAGE, 'findings')).map(text)).toEqual([
      'Adoption says more about how tests were chosen and when a change could ship than about a win rate: most were strong bets against plain baselines, the ideas were vetted before they were tested, and a neutral result could ship with guardrails intact.',
      'The tool I owned outright changed the team\'s own workflow, not a product: test-account setup went from about 20 to about 3 minutes, and it was adopted team-wide.',
    ]);
    expect(blocks(section(PAGE, 'how-i-checked-this')).map(text)).toEqual([
      'I did the sample-size and duration planning before each test and the significance testing after it myself.',
      'I set up tests as well as analysing them.',
      'The ship rule on this page is unit-tested: every combination of bounds gives exactly one of the four calls, and the bounds at zero and at the guardrail limit fall on the stated side.',
    ]);
    const limits = blocks(section(PAGE, 'limits')).map(text);
    expect(limits.length).toBeGreaterThanOrEqual(2);
    expect(limits).toEqual([
      'The results of these tests are confidential, so I cannot publish their effect sizes.',
      'The adoption count is not a win rate, and it does not represent all test ideas: the ideas were vetted before they reached a test, and a recommendation not to roll out is not counted.',
      'The ship rule on this page is simplified. You type the interval bounds in; nothing is estimated from observations, and a neutral result here needs no product reason.',
      'The automation timings are approximate, as I reported them, and the before and after chart is a reconstruction from them, not measured data.',
    ]);
    const links = [...section(PAGE, 'sources').matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], text(m[2]!)]);
    expect(links).toEqual([
      ['/work/retention', 'Customer retention and reactivation analysis, another case study'],
      ['https://www.linkedin.com/in/melbergui', 'My LinkedIn profile'],
    ]);
  });
});

describe('the ship-rule section and its Figure', () => {
  const s = section(PAGE, 'ship-rule');
  const figure = figureOf(PAGE, FRAMEWORK_ID);

  it('introduces the made-up product and states that the bounds are hypothetical', () => {
    expect(blocks(s.slice(0, s.indexOf('<figure'))).map(text)).toEqual([
      'Chapter Club is a reading-club product I made up for this example. Its main metric is session completion, and its guardrail is help requests, where a rise is bad. You set the ends of each interval yourself: nothing is estimated from observations.',
      'This illustrates the general approach; teams also allowed neutral results with guardrails intact.',
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

describe('the automation Figure', () => {
  const figure = figureOf(PAGE, 'setup-time');
  const CAPTION = 'Illustrative reconstruction using approximate reported timings; not measured telemetry.';

  it('states the finding with Facts, badged Simulated, with the reconstruction caption', () => {
    expect(text(/<h3[^>]*>([\s\S]*?)<\/h3>/.exec(figure)![1]!)).toBe('Test-account setup fell from about 20 to about 3 minutes');
    expect(figure).toMatch(SIMULATED_BADGE);
    expect(text(figure)).toContain(`Minutes to set up one test account: by hand, and with the tool. ${CAPTION}`);
  });

  it('keeps reported figures on profile refs and reconstructed marks on simulated refs', () => {
    const cells = [...figure.matchAll(/<td ([^>]*)>([^<]*)<\/td>/g)];
    expect(cells.length).toBeGreaterThan(0);
    for (const [, attrs] of cells) {
      expect(attrs).toContain('data-derived="profile.audible.setup_minutes_before profile.audible.setup_minutes_after"');
    }
    // the kit draws the table once, open without JavaScript and behind its summary with it
    expect(cells.map((c) => c[2])).toEqual(['Before the tool', '20', 'With the tool', '3']);
    const ticks = [...figure.matchAll(/<text [^>]*data-tick="y"[^>]*>/g)].map((m) => m[0]);
    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) expect(tick).toContain('data-derived="simulated"');
  });

  it('keeps the badge and the caption in the no-JS view and the error fallback', () => {
    for (const runtime of ['no-js', 'error'] as const) {
      const html = renderToStaticMarkup(<AutomationFigure state={{ runtime }} />);
      expect(html, runtime).toMatch(SIMULATED_BADGE);
      expect(text(html), runtime).toContain(CAPTION);
      expect(html, runtime).toMatch(/<table[\s>]/);
    }
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
    expect(metadata).toMatchObject({
      title: 'Experimentation at Audible (Amazon)',
      description:
        'How I plan and analyse experiments, why so many of my recommendations were adopted, a ship rule on a made-up product and the tool I built for test-account setup.',
    });
    expect(metadata.robots).toBeUndefined();
    expect(renderToStaticMarkup(<AudibleRoute />)).toBe(PAGE);
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
