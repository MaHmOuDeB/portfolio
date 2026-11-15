// The Pulse case study and its local dashboard. The page follows the analysis template (a summary,
// then problem, data, method, the taxonomy, the dashboard, findings, how I checked this, limits and
// links), and every claim on it is pinned here by its exact rendered wording. The taxonomy table is
// the vendored export word for word, in the same section as the sentences that call its questions
// design hypotheses. The dashboard is a local copy with made-up numbers: its event stream lives in
// memory, every event goes through the taxonomy's bus, and its Figure is badged "Simulated" in
// every view. Every number is a <Fact> or names its source (the build's truth audit).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ComponentProps, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { withoutCta } from '../page-cta';
import { describe, expect, expectTypeOf, it } from 'vitest';
import PulseRoute, { metadata } from '@/app/work/pulse/page';
import type { EagerOrIntent } from '@/components/figures/EagerOrIntent';
import { PulseFigure } from '@/components/pulse/PulseFigure';
import { PULSE_SECTIONS, PULSE_TITLE, PulsePage } from '@/components/pulse/PulsePage';
import { PULSE_FIGURE_TITLE, PulseFigureView } from '@/components/pulse/PulseView';
import { FACTS, FACT_DISPLAYS } from '@/lib/facts';
import { createAnnouncer, pulseMessages } from '@/lib/pulse/announce';
import { DEMO_PROMPT_VERSION, createPulseBus, type PulseEvent } from '@/lib/pulse/bus';
import {
  CHANNELS,
  CHARTS,
  PULSE_ID,
  PULSE_PRESETS,
  PULSE_SCHEMA,
  RANGES,
  chartSummary,
  dashboardCsv,
  dashboardRows,
  dashboardTable,
  rangeDays,
  type DashboardView,
} from '@/lib/pulse/dashboard';
import { PULSE_EVENT_NAMES } from '@/lib/pulse/names';
import {
  STREAM_LIMIT,
  VIEW_NAME,
  appendEvent,
  connectDashboard,
  propertyRefs,
  pulseEvents,
  resetDashboard,
  type Stream,
} from '@/lib/pulse/session';
import { taxonomyTable } from '@/lib/pulse/tables';
import { pulseTaxonomy } from '@/lib/pulse/taxonomy';
import { LIVE_ROUTES } from '@/lib/site';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntry } from '../../../content/seo';
import { parseFragment, type DefaultTreeAdapterTypes as P } from 'parse5';
import { auditHtml } from '../../../scripts/truth-audit.ts';

const repo = join(import.meta.dirname, '../../..');
const SOURCE = JSON.parse(readFileSync(join(repo, 'data/sources/pulse.json'), 'utf8')) as {
  facts: Record<string, { value: number }>;
  tables: { events: { name: string; fires_when: string; question: string; properties: string[] }[] };
};

const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** Visible text: tags removed, entities decoded, whitespace collapsed, no space before punctuation. */
const text = (markup: string) =>
  decode(markup.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/ ([.,:;)?])/g, '$1')
    .replace(/\( /g, '(')
    .trim();
/** The markup of the section with this id (page sections do not nest). */
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

const PAGE = withoutCta(renderToStaticMarkup(<PulsePage />));
const ctx = { route: '/work/pulse', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] };
const TAXONOMY = pulseTaxonomy();
const PRESET: DashboardView = { channel: 'all', range: '30d' };

const ORDER = [
  ['dashboard', 'The dashboard, on this page'],
  ['taxonomy', 'The events and the questions behind them'],
  ['how-i-checked-this', 'How I built and checked it'],
  ['limits', 'Limits'],
  ['sources', 'Sources and links'],
] as const;

/** Words that would claim an outcome, an observed behaviour or a result of real use. */
const OUTCOME = /\d+(\.\d+)?\s*%|conversion rate|retention rate|\blift\b|uplift|increased|improved|users (came|come) back|our users|customers/i;
/** The markup of every native details row, keyed by its summary text. */
const detailsRows = (markup: string) =>
  Object.fromEntries(
    [...markup.matchAll(/<details data-method=""[^>]*>([\s\S]*?)<\/details>/g)].map((m) => [
      text(/<summary[^>]*>([\s\S]*?)<\/summary>/.exec(m[1]!)![1]!),
      m[1]!.slice(m[1]!.indexOf('</summary>')),
    ]),
  );
const between = (markup: string, from: string, to: string) => markup.slice(markup.indexOf(from), markup.indexOf(to, markup.indexOf(from)));

describe('the outline', () => {
  it('has one h1: the event count as a Fact, each designed to answer a product question', () => {
    expect([...PAGE.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
    const h1 = /<h1 id="pulse-page-title"[^>]*>([\s\S]*?)<\/h1>/.exec(PAGE)![1]!;
    expect(h1).toBe('<data value="7" data-fact="pulse.events.count">7</data> events, each designed to answer a product question');
    expect(text(renderToStaticMarkup(<>{PULSE_TITLE}</>))).toBe('7 events, each designed to answer a product question');
  });

  it('opens with the sub, then the plain-words opening that defines an event, then the repository button', () => {
    const head = between(PAGE, '</h1>', '<section aria-label="At a glance"');
    const paragraphs = blocks(head).map(text);
    expect(paragraphs).toEqual([
      'A small dashboard I designed and built to show one thing: a tracking plan in which every event answers a product question.',
      'Most products record every click first and ask what the clicks mean later. Pulse works the other way round: 7 tracked actions, each chosen because it answers a question a product team would ask. It shows a tracking plan, not results. An event is one recorded user action, with a name.',
    ]);
    expect(head).toMatch(/data-plain-opening=""[\s\S]*data-fact="pulse\.events\.count"/);
    const lock = JSON.parse(readFileSync(join(repo, 'sources.lock.json'), 'utf8')) as { sources: { pulse: { repo: string; commit: string } } };
    const actions = /<div data-case-actions=""[^>]*>([\s\S]*?)<\/div>/.exec(head)![1]!;
    const links = [...actions.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], text(m[2]!)]);
    expect(links).toEqual([[`https://github.com/${lock.sources.pulse.repo}/tree/${lock.sources.pulse.commit}`, 'See the code on GitHub']]);
  });

  it('has the glance card: two pull figures from the export, one sentence, the facts and the scope', () => {
    const glance = between(PAGE, '<section aria-label="At a glance"', '</section>');
    const points = /<ul role="list" data-glance-points=""[^>]*>([\s\S]*?)<\/ul>/.exec(glance)![1]!;
    expect(points).toContain('data-fact="pulse.events.count"');
    expect(points).toContain('data-fact="pulse.identity.user_properties"');
    expect(text(points)).toBe('7 events, each tied to one product question 4 user properties, so events can be split by user');
    expect(text(/<p data-glance-outcome="">([\s\S]*?)<\/p>/.exec(glance)![1]!)).toBe(
      'Each event exists to answer one product question: the original sends them to Amplitude, and the copy on this page sends them to a list in your browser.',
    );
    expect(text(glance)).toContain('Scope A demo. No real users, so the questions are still open.');
  });

  it('puts the visible sections in the reading order, each named by its own h2, and no Summary block', () => {
    const sections = [...PAGE.matchAll(/<section id="([^"]+)" aria-labelledby="([^"]+)"[^>]*>\s*<h2 id="([^"]+)"[^>]*>([^<]+)<\/h2>/g)].map(
      (m) => [m[1], m[2], m[3], decode(m[4]!)],
    );
    expect(sections.map(([id, , , title]) => [id, title])).toEqual(ORDER.map(([id, title]) => [id, title]));
    for (const [id, labelledBy, headingId] of sections) {
      expect(labelledBy).toBe(`${id}-title`);
      expect(headingId).toBe(`${id}-title`);
    }
    expect(PULSE_SECTIONS.map((s) => s.id)).toEqual(ORDER.map(([id]) => id));
    // The sections, the close, and the call to action's own h2 is outside the page markup under test.
    const h2s = [...PAGE.matchAll(/<h2 [^>]*>([\s\S]*?)<\/h2>/g)].map((m) => text(m[1]!));
    expect(h2s).toEqual([...ORDER.map(([, title]) => title), 'What this shows about how I work']);
    expect(PAGE).not.toContain('id="summary"');
    expect(text(PAGE)).not.toMatch(/\bSummary\b|Next step/);
  });

  it('never skips a heading level', () => {
    const levels = [...PAGE.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    for (let i = 1; i < levels.length; i++) expect(levels[i]! - levels[i - 1]!, `heading ${i}`).toBeLessThanOrEqual(1);
  });

  it('has in-page links whose targets exist and are visible headings, in page order', () => {
    const nav = /<nav aria-label="On this page"[^>]*>([\s\S]*?)<\/nav>/.exec(PAGE);
    expect(nav).not.toBeNull();
    const links = [...nav![1]!.matchAll(/<a [^>]*href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], text(m[2]!)]);
    expect(links.map(([href]) => href)).toEqual(ORDER.map(([id]) => id));
    expect(links.map(([, label]) => label)).toEqual(['Dashboard', 'Events', 'How I checked this', 'Limits', 'Sources']);
    for (const [href] of links) {
      const at = PAGE.indexOf(`id="${href}"`);
      expect(at).toBeGreaterThan(0);
      // No target sits inside a details row.
      const before = PAGE.slice(0, at);
      expect(before.split('<details').length, href).toBe(before.split('</details>').length);
    }
  });

  it('keeps every element id unique', () => {
    const ids = [...PAGE.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no motion and no card grid of its own', () => {
    // The kit's buttons change colour on hover (transition-colors); nothing on the page moves.
    const own = PAGE.replace(/<figure [\s\S]*?<\/figure>/g, '').replace(/ transition-colors/g, '');
    expect(own).not.toMatch(/animate-|transition|fade|slide-in/);
    expect(own).not.toMatch(/grid-cols-/);
  });

  it('has one Figure, the dashboard, first, in a sheet between its lead-in and its takeaway', () => {
    expect([...PAGE.matchAll(/<figure [^>]*data-figure="/g)]).toHaveLength(1);
    const s = section(PAGE, 'dashboard');
    expect(PAGE.indexOf('<section id="dashboard"')).toBeLessThan(PAGE.indexOf('<section id="taxonomy"'));
    const lead = s.indexOf('data-lead-in');
    const sheet = s.indexOf('data-figure-sheet');
    const fig = s.indexOf(`data-figure="${PULSE_ID}"`);
    const take = s.indexOf('data-takeaway');
    expect(lead).toBeGreaterThan(0);
    expect(lead).toBeLessThan(sheet);
    expect(sheet).toBeLessThan(fig);
    expect(fig).toBeLessThan(take);
    expect(text(s)).toContain(
      'Use the dashboard. Each action you take appears in the list below it as the event a product team would receive.',
    );
    expect(text(s)).toContain(
      'A short list of named events answers the product questions; automatic capture stays underneath as a safety net.',
    );
  });

  it('ends with the close, then previous Retention and next Docproof', () => {
    const close = between(PAGE, '<section data-page-close=""', '</section>');
    expect(close).toContain('id="what-this-shows"');
    expect(text(blocks(close)[0]!)).toBe(
      'I plan tracking from the questions backwards: each of the 7 events was named for a question a product team would ask, and the dashboard is only there to carry them.',
    );
    const next = /<nav aria-label="More work" data-next-row=""[^>]*>([\s\S]*?)<\/nav>/.exec(PAGE)![1]!;
    const links = [...next.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], text(m[2]!)]);
    expect(links).toEqual([
      ['/work/retention', 'Previous Retention'],
      ['/work/docproof', 'Next Docproof'],
    ]);
    expect(PAGE.indexOf('data-page-close')).toBeLessThan(PAGE.indexOf('data-next-row'));
  });
});

describe('Pulse truth', () => {
  const rows = detailsRows(section(PAGE, 'how-i-checked-this'));

  it('puts the data, the method and the checks in details rows under one heading, text unchanged', () => {
    expect(Object.keys(rows)).toEqual(['The data', 'Method', 'How I checked this']);
    expect(blocks(rows['The data']!).map(text)).toEqual([
      'Pulse has no backend: its dashboard numbers are generated in the browser. The events on this page, with their triggers, properties and questions, come from an export of its code and README, pinned by commit.',
    ]);
    expect(blocks(rows.Method!).map(text)).toEqual([
      'Autocapture records what users click, but not which product question a click should answer. Pulse puts a deliberate taxonomy first: 7 named events, each tied to a specific product question. The dashboard around them is the vehicle.',
      "I built Pulse with React, TypeScript, Vite, Tailwind CSS and Recharts, and tracked it with Amplitude's unified SDK.",
      'Each of the 7 events is tracked by name, with its own properties. The demo user is identified with a user ID and 4 user properties: role, plan, company size and signup date. Without this identification every event would be anonymous and could not be segmented by user.',
      'Autocapture and Session Replay run underneath the named events.',
    ]);
    expect(rows.Method).toMatch(/a user ID and <data [^>]*data-fact="pulse\.identity\.user_properties"[^>]*>4<\/data> user properties/);
    expect(blocks(rows['How I checked this']!).map(text)).toEqual([
      'I tested every tracked interaction by hand. TypeScript runs in strict mode with no type errors, secrets stay out of git, and every push to GitHub deploys to Vercel.',
      'On this page, the events come from an export of the project\'s code and README, pinned by commit and by a hash of its content. Tests check that the dashboard copy sends only those events, each with exactly its properties, and that Reset leaves one new Viewed Dashboard.',
    ]);
  });

  it('pins at least two concrete limits, visible', () => {
    const limits = blocks(section(PAGE, 'limits')).map(text);
    expect(section(PAGE, 'limits')).not.toContain('<details');
    expect(limits).toEqual([
      'Pulse has no real users and no production traffic, so its events show what the tracking was designed to capture, not how anyone behaved.',
      'The questions are design hypotheses. Nothing here tests whether an event predicts an outcome, such as a saved view predicting a return.',
      "The copy on this page reuses the event names and properties, but not the original's Amplitude tracking, user identification or Session Replay, and its numbers are made up.",
      "Its property keys match the original's. Apart from the date ranges and the CSV format, its values are its own, such as filter_type and its prompt version, demo-v1, and so are its charts and channels.",
    ]);
    const old = [
      'Without them every event would be anonymous',
      'The tracked events, as the source code states them',
      'Names, triggers, properties and questions as the source code states them',
      'export of its source code',
      'export of the source code',
      'Unit tests check',
      'the original sends a different value',
      'It sends its own prompt version',
      'with made-up numbers. It does not load',
      'Each action sends its event',
      'to a list beside the charts',
      'Each action adds its event',
      'A copy of the Pulse dashboard, with made-up numbers',
    ];
    for (const s of old) expect(text(PAGE), s).not.toContain(s);
  });

  it('says "no real users" once in the scope and once under Limits, and nowhere else', () => {
    const all = text(PAGE).match(/no real users/gi) ?? [];
    expect(all).toHaveLength(2);
    expect(text(between(PAGE, '<section aria-label="At a glance"', '</section>'))).toMatch(/No real users/);
    expect(text(section(PAGE, 'limits'))).toMatch(/no real users/);
  });

  it('links the source at its pinned commit, the export it reads and another case study, and never the e-mail address', () => {
    const lock = JSON.parse(readFileSync(join(repo, 'sources.lock.json'), 'utf8')) as { sources: { pulse: { repo: string; commit: string; path: string } } };
    const { repo: name, commit, path } = lock.sources.pulse;
    const links = [...section(PAGE, 'sources').matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], text(m[2]!)]);
    expect(links).toEqual([
      [`https://github.com/${name}/tree/${commit}`, `Pulse, at commit ${commit.slice(0, 7)}`],
      [`https://github.com/${name}/blob/${commit}/${path}`, 'Export of the event taxonomy that this page reads'],
      ['/work/retention', 'Customer retention and reactivation analysis, another case study'],
      ['https://www.linkedin.com/in/melbergui', 'My LinkedIn profile'],
    ]);
    // The site prints no e-mail address anywhere (LinkedIn and the contact form are the contact routes).
    expect(PAGE).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    expect(PAGE).not.toContain('mailto:');
  });

  it('says "designed and built" and claims no outcome anywhere', () => {
    expect(text(PAGE)).toContain('designed and built');
    expect(text(PAGE)).not.toMatch(OUTCOME);
  });

  it('has no em or en dash in its own words', () => {
    expect(text(PAGE)).not.toMatch(/[–—]/);
  });

  it('loads no analytics SDK: no Pulse file imports Amplitude or a tracking API', () => {
    for (const file of ['PulsePage.tsx', 'PulseFigure.tsx', 'PulseFigureClient.tsx', 'PulseInteractive.tsx', 'PulseView.tsx']) {
      const src = readFileSync(join(repo, 'src/components/pulse', file), 'utf8');
      expect(src, file).not.toMatch(/from ['"]@amplitude|amplitude\.|\bfetch\(|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie/);
    }
    for (const file of ['dashboard.ts', 'session.ts', 'names.ts', 'tables.ts']) {
      const src = readFileSync(join(repo, 'src/lib/pulse', file), 'utf8');
      expect(src, file).not.toMatch(/from ['"]@amplitude|amplitude\.|\bfetch\(|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie/);
    }
    expect(PAGE).not.toMatch(/<script[^>]*amplitude/i);
  });
});

/** The export's question, in the page's plain punctuation (the README's dashes become a colon or a comma). */
const PLAIN: Record<string, string> = {
  'Activation — did the user reach the core screen this session?': 'Activation: did the user reach the core screen this session?',
  'Feature engagement — which chart drives deeper investigation?': 'Feature engagement: which chart drives deeper investigation?',
  'Conversion to an outside-the-product action — a strong intent signal.': 'Conversion to an action outside the product, a strong sign of intent.',
  'Retention driver — saving a view predicts the user will come back.': 'Retention driver: saving a view predicts the user will come back.',
};
const plain = (q: string) => PLAIN[q] ?? q;

describe('the taxonomy section', () => {
  const s = section(PAGE, 'taxonomy');

  it('holds the design-hypothesis lead-in and the question table in one section element', () => {
    const paragraphs = blocks(s.slice(0, s.indexOf('<table'))).map(text);
    expect(paragraphs).toContain('Read each question as a design hypothesis: what the event was meant to help answer, not a finding.');
    const start = PAGE.indexOf('<section id="taxonomy"');
    const end = PAGE.indexOf('</section>', start);
    const context = PAGE.indexOf('Read each question as a design hypothesis', start);
    const table = PAGE.indexOf('<table', start);
    const predictive = PAGE.indexOf('saving a view predicts the user will come back', start);
    expect(context).toBeGreaterThan(start);
    expect(table).toBeGreaterThan(context);
    expect(predictive).toBeGreaterThan(table);
    for (const at of [context, table, predictive]) expect(at).toBeLessThan(end);
    // The predictive wording appears nowhere outside that section.
    expect(PAGE.replace(s, '')).not.toContain('predicts the user will come back');
  });

  it('tabulates the export: name, trigger, properties and question, the dashes in plain punctuation, no grouping', () => {
    expect(taxonomyTable(TAXONOMY)).toEqual({
      columns: ['Event', 'Fires when', 'Properties', 'Question it was designed to answer'],
      rows: SOURCE.tables.events.map((e) => [e.name, e.fires_when, e.properties.join(', '), e.question]),
      note: 'Names and properties as the source code states them; triggers and questions as the project\'s README states them.',
      refs: ['source:pulse'],
    });
    // Every dashed cell of the export has its plain wording, and nothing else changes.
    expect(SOURCE.tables.events.filter((e) => /—/.test(e.question)).map((e) => e.question).sort()).toEqual(Object.keys(PLAIN).sort());
    const rows = [...s.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => decode(c[1]!)));
    expect(rows).toEqual([
      ['Event', 'Fires when', 'Properties', 'Question it was designed to answer'],
      ...SOURCE.tables.events.map((e) => [e.name, e.fires_when, e.properties.join(', '), plain(e.question)]),
    ]);
    expect(rows.length - 1).toBe(SOURCE.facts['events.count']!.value);
    for (const [, attrs] of s.matchAll(/<td ([^>]*)>/g)) expect(attrs).toContain('data-derived="source:pulse"');
    expect(s).not.toMatch(/categor/i);
    expect(text(s)).toContain("triggers and questions as the project's README states them, in plain punctuation.");
    expect(text(/<caption[^>]*>([\s\S]*?)<\/caption>/.exec(s)![1]!)).toBe("The tracked events, as the project's code and README state them");
  });

  it('wraps its sentences in place: no sideways-scrolling region, no one-line cells, a column name on every stacked cell', () => {
    // The kit DataTable keeps cells on one line in an overflow-x-auto region; this text table wraps.
    expect(s).not.toMatch(/overflow-x-auto/);
    expect(s).not.toMatch(/<td [^>]*class="[^"]*(?<!md:)whitespace-nowrap/);
    const table = /<table ([^>]*)>/.exec(s)![1]!;
    expect(table).toContain('role="table"');
    expect(table).toContain('aria-labelledby="pulse-events-caption"');
    expect(table).toContain('data-stacked-table=""');
    // Below md each row stacks and every cell after the event names its column (drawn from data-label).
    const labels = [...s.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
      .slice(1)
      .map((m) => [...m[1]!.matchAll(/<td ([^>]*)>/g)].map((c) => /data-label="([^"]*)"/.exec(c[1]!)?.[1] ?? null));
    for (const row of labels) expect(row).toEqual([null, 'Fires when', 'Properties', 'Question it was designed to answer']);
  });
});

describe('the dashboard Figure', () => {
  const figure = figureOf(PAGE, PULSE_ID);
  const s = section(PAGE, 'dashboard');

  it('says how the copy works, local and simulated, one click deeper', () => {
    const rows = detailsRows(s);
    expect(Object.keys(rows)).toEqual(['How this copy of the dashboard works']);
    expect(blocks(rows['How this copy of the dashboard works']!).map(text)).toEqual([
      'This is a small copy of the dashboard, rebuilt for this page with its own charts, channels and made-up numbers. It does not load Amplitude. Each action with an event in the table below sends that event, with the same name and properties as in the table, to a list below the charts.',
      "The list is kept in this page's memory only: nothing is sent anywhere, and it is gone when you leave the page or press Reset. It is a simulation, not part of this site's own experiment.",
    ]);
  });

  it('draws the preset on the server: title, result, caption and the Simulated badge', () => {
    expect(PULSE_FIGURE_TITLE).toBe('Each dashboard action with a product question behind it sends one event');
    // Exactly true for every action: closing a detail has no question behind it and sends nothing, and
    // Reset's one Viewed Dashboard is not contradicted. No fixed number: the title is a relationship.
    expect(PULSE_FIGURE_TITLE).not.toMatch(/\d|every|tracked event/i);
    expect(figure).toMatch(/<h3 id="pulse-title"[^>]*>Each dashboard action with a product question behind it sends one event<\/h3>/);
    expect(text(/<p data-figure-result=""[^>]*>([\s\S]*?)<\/p>/.exec(figure)![1]!)).toBe('Showing all channels over the last 30d.');
    expect(text(figure)).toContain(
      "A copy of the Pulse dashboard, with its own charts and channels and made-up numbers for a made-up product. Each action that sends an event adds it to the list, newest first. The events stay in this page and are not part of this site's own experiment.",
    );
    expect(figure).toMatch(SIMULATED_BADGE);
  });

  it('has one control row of three: Channel, Date range and Reset', () => {
    const row = /<div data-js-only="" data-figure-controls="" role="group" aria-label="Controls"[^>]*>([\s\S]*?)<\/div><p data-figure-result/.exec(figure)![1]!;
    expect([...row.matchAll(/<legend[^>]*>([^<]+)<\/legend>/g)].map((m) => m[1])).toEqual(['Channel', 'Date range']);
    expect([...row.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1]!))).toEqual(['Reset']);
    const options = (name: string) => [...row.matchAll(new RegExp(`<input type="radio" id="pulse-${name}-([^"]+)"`, 'g'))].map((m) => m[1]);
    expect(options('channel')).toEqual(CHANNELS.map((c) => c.value));
    expect(options('range')).toEqual([...RANGES]);
    // The range labels carry the source's refs: they are the source's own 7d / 30d / 90d.
    expect(row).toMatch(/<div data-derived="source:pulse"[^>]*><fieldset[\s\S]*Date range/);
  });

  it('puts the dashboard actions in the labelled dashboard content as native buttons, not in the control row', () => {
    const dashboard = /<div role="region" aria-labelledby="pulse-dashboard-title"[\s\S]*?<div role="region" aria-labelledby="pulse-stream-title"/.exec(figure)![0];
    expect(dashboard).toMatch(/<h4 id="pulse-dashboard-title"[^>]*>Dashboard<\/h4>/);
    const buttons = [...dashboard.matchAll(/<button ([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => [m[1]!, text(m[2]!)]);
    // The accessible name: aria-label where there is one (it starts with the visible word), otherwise the text.
    // An sr-only span would not do: browsers put a space before an absolutely positioned child ("Detail : ...").
    const name = ([attrs, visible]: string[]) => /aria-label="([^"]*)"/.exec(attrs!)?.[1] ?? visible!;
    expect(buttons.map(name)).toEqual(['Detail: Sign-ups', 'Detail: Trials started', 'Export CSV', 'Save view', 'Load saved view']);
    expect(buttons.slice(0, 2).map(([, visible]) => visible)).toEqual(['Detail', 'Detail']);
    for (const [attrs] of buttons) expect(attrs).toContain('type="button"');
    const load = buttons.find(([, label]) => label === 'Load saved view')![0];
    expect(load).toMatch(/disabled=""/);
    expect(load).toContain('aria-describedby="pulse-load-reason"');
    expect(text(/<p id="pulse-load-reason"[^>]*>([\s\S]*?)<\/p>/.exec(dashboard)![1]!)).toBe('Save a view first; then Load saved view brings it back.');
  });

  it('shows the stream bound and the local demo prompt version, both as derived values', () => {
    const stream = figure.slice(figure.indexOf('<div role="region" aria-labelledby="pulse-stream-title"'));
    expect(stream).toMatch(/<h4 id="pulse-stream-title"[^>]*>Events sent<\/h4>/);
    expect(text(stream)).toContain('The last 20 events this dashboard sent, newest first.');
    expect(stream).toContain(`<data value="${STREAM_LIMIT}" data-derived="simulated">20</data>`);
    expect(text(stream)).toContain("Local demo prompt version: demo-v1. It is this copy's own value, not the original's.");
    expect(stream).toContain('<code data-derived="simulated">demo-v1</code>');
    expect(text(stream)).toContain('No events yet. Viewed Dashboard arrives as soon as the dashboard has loaded.');
    expect(text(stream)).toContain('The list needs JavaScript: without it, this copy sends no events.');
  });

  it('carries the Simulated badge in the server preview, the no-JS view and the error fallback', () => {
    // The server preview, as the island's loader gets it.
    const preview = renderToStaticMarkup(<PulseFigure />);
    expect(preview).toContain('data-island="idle"');
    expect(preview).toMatch(SIMULATED_BADGE);
    // The no-JS table view.
    const noJs = renderToStaticMarkup(<PulseFigureView view={PRESET} state={{ runtime: 'no-js' }} />);
    expect(noJs).toMatch(SIMULATED_BADGE);
    expect(noJs).toMatch(/<table[\s>]/);
    // The error fallback.
    const failed = renderToStaticMarkup(<PulseFigureView view={PRESET} state={{ runtime: 'error' }} />);
    expect(failed).toMatch(SIMULATED_BADGE);
    expect(text(failed)).toContain('This chart could not load. The numbers are in the table below.');
    expect(failed).toMatch(/<table[\s>]/);
  });

  it('lists a full stream with the exact names and properties, each value marked with its refs, newest first', () => {
    let stream: Stream = [];
    const bus = createPulseBus(TAXONOMY);
    bus.subscribe((e) => (stream = appendEvent(stream, e)));
    for (const event of allSeven()) bus.emit(event);
    const html = renderToStaticMarkup(<PulseFigureView view={PRESET} stream={stream} />);
    const items = [...html.matchAll(/<li data-pulse-event="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => [m[1], text(m[2]!)]);
    expect(items).toEqual([
      ['Loaded Saved View', `Loaded Saved View view_name: ${VIEW_NAME}`],
      ['Saved View', `Saved View view_name: ${VIEW_NAME}`],
      ['Exported Report', 'Exported Report format: csv'],
      ['Viewed Chart Detail', 'Viewed Chart Detail chart: sign_ups'],
      ['Changed Date Range', 'Changed Date Range range: 7d'],
      ['Applied Filter', 'Applied Filter filter_type: channel value: email'],
      ['Viewed Dashboard', 'Viewed Dashboard prompt_version: demo-v1'],
    ]);
    expect(html).toContain('<code data-derived="source:pulse">7d</code>');
    expect(html).toContain('<code data-derived="simulated">demo-v1</code>');
    expect(auditHtml(html, ctx)).toEqual([]);
  });
});

/** One of each event, in taxonomy order. */
function allSeven(): PulseEvent[] {
  return [
    pulseEvents.viewedDashboard(),
    pulseEvents.appliedFilter('email'),
    pulseEvents.changedDateRange('7d'),
    pulseEvents.viewedChartDetail('sign_ups'),
    pulseEvents.exportedReport(),
    pulseEvents.savedView(),
    pulseEvents.loadedSavedView(),
  ];
}

describe('the local event session', () => {
  it('builds each action event with the exact export name and properties, accepted by the taxonomy bus', () => {
    const events = allSeven();
    expect(events.map((e) => e.name)).toEqual([...PULSE_EVENT_NAMES]);
    expect(events.map((e) => e.properties)).toEqual([
      { prompt_version: 'demo-v1' },
      { filter_type: 'channel', value: 'email' },
      { range: '7d' },
      { chart: 'sign_ups' },
      { format: 'csv' },
      { view_name: VIEW_NAME },
      { view_name: VIEW_NAME },
    ]);
    for (const [i, row] of TAXONOMY.entries()) expect(Object.keys(events[i]!.properties).sort()).toEqual([...row.properties].sort());
    const bus = createPulseBus(TAXONOMY);
    const got: PulseEvent[] = [];
    bus.subscribe((e) => got.push(e));
    for (const e of events) bus.emit(e);
    expect(got).toEqual(events);
    expect(pulseEvents.viewedDashboard().properties.prompt_version).toBe(DEMO_PROMPT_VERSION.value);
  });

  it('emits Viewed Dashboard once per mounted dashboard, also when an effect runs twice', () => {
    const bus = createPulseBus(TAXONOMY);
    let stream: Stream = [];
    const update = (fn: (s: Stream) => Stream) => (stream = fn(stream));
    const mounted = { current: false };
    // A strict-mode effect: connect, disconnect, connect again on the same mount.
    connectDashboard(bus, update, mounted)();
    const off = connectDashboard(bus, update, mounted);
    expect(stream.map((e) => e.event.name)).toEqual(['Viewed Dashboard']);
    off();
    // After the unsubscribe nothing reaches the old stream: no leaked subscription.
    bus.emit(pulseEvents.exportedReport());
    expect(stream).toHaveLength(1);
    // A new mount has its own bus, state and flag, and sends its own single Viewed Dashboard.
    const next = createPulseBus(TAXONOMY);
    let fresh: Stream = [];
    const offNext = connectDashboard(next, (fn) => (fresh = fn(fresh)), { current: false });
    expect(fresh.map((e) => e.event)).toEqual([pulseEvents.viewedDashboard()]);
    offNext();
  });

  it('Reset clears the stream and then leaves exactly one new Viewed Dashboard', () => {
    const bus = createPulseBus(TAXONOMY);
    let stream: Stream = [];
    const off = connectDashboard(bus, (fn) => (stream = fn(stream)), { current: false });
    for (const e of allSeven().slice(1)) bus.emit(e);
    expect(stream).toHaveLength(7);
    resetDashboard(bus);
    expect(stream.map((e) => e.event)).toEqual([pulseEvents.viewedDashboard()]);
    off();
  });

  it('keeps only the last 20 events, newest first, with unique keys', () => {
    expect(STREAM_LIMIT).toBe(20);
    let stream: Stream = [];
    for (let i = 0; i < 45; i++) stream = appendEvent(stream, i % 2 === 0 ? pulseEvents.changedDateRange('7d') : pulseEvents.appliedFilter('search'));
    expect(stream).toHaveLength(STREAM_LIMIT);
    expect(new Set(stream.map((e) => e.seq)).size).toBe(STREAM_LIMIT);
    expect(stream[0]!.seq).toBeGreaterThan(stream[1]!.seq);
    expect(stream[0]!.event.name).toBe('Changed Date Range');
  });

  it('marks source values with the source and the copy’s own values as simulated', () => {
    expect(propertyRefs('range')).toEqual(['source:pulse']);
    expect(propertyRefs('format')).toEqual(['source:pulse']);
    expect(propertyRefs('prompt_version')).toEqual(DEMO_PROMPT_VERSION.refs);
    for (const key of ['filter_type', 'value', 'chart', 'view_name']) expect(propertyRefs(key), key).toEqual(['simulated']);
  });
});

describe('the made-up dashboard data', () => {
  it('uses the stable keys channel and range, with all channels over 30d as the preset', () => {
    expect(PULSE_ID).toBe('pulse');
    expect(PULSE_SCHEMA).toEqual({
      channel: { kind: 'enum', values: ['all', 'email', 'search', 'social'] },
      range: { kind: 'enum', values: ['7d', '30d', '90d'] },
    });
    expect(PULSE_PRESETS).toEqual({ default: { channel: 'all', range: '30d' } });
    expect(CHANNELS.map((c) => c.label)).toEqual(['All channels', 'Email', 'Search', 'Social']);
    expect(CHARTS.map((c) => [c.key, c.label])).toEqual([
      ['sign_ups', 'Sign-ups'],
      ['trials_started', 'Trials started'],
    ]);
  });

  it('takes the range labels from the source trigger and reads their days from them', () => {
    expect(SOURCE.tables.events.find((e) => e.name === 'Changed Date Range')!.fires_when).toBe(`${RANGES.join(' / ')} toggle changed`);
    expect(RANGES.map(rangeDays)).toEqual([7, 30, 90]);
  });

  it('has one row per day of the range, the same on every call, and all channels is the sum of the others', () => {
    for (const range of RANGES) {
      const rows = dashboardRows({ channel: 'all', range });
      expect(rows.map((r) => r.day)).toEqual(Array.from({ length: rangeDays(range) }, (_, i) => i + 1));
      expect(dashboardRows({ channel: 'all', range })).toEqual(rows);
      const parts = (['email', 'search', 'social'] as const).map((channel) => dashboardRows({ channel, range }));
      for (const [i, row] of rows.entries()) {
        expect(row.sign_ups).toBe(parts.reduce((s, p) => s + p[i]!.sign_ups, 0));
        expect(row.trials_started).toBe(parts.reduce((s, p) => s + p[i]!.trials_started, 0));
        expect(row.trials_started).toBeLessThanOrEqual(row.sign_ups);
      }
    }
    // A shorter range is the end of a longer one.
    expect(dashboardRows({ channel: 'email', range: '7d' }).map((r) => r.sign_ups)).toEqual(
      dashboardRows({ channel: 'email', range: '30d' }).slice(-7).map((r) => r.sign_ups),
    );
  });

  it('tabulates the shown rows as simulated, and exports the same rows as CSV, never the visitor events', () => {
    const view: DashboardView = { channel: 'search', range: '7d' };
    const rows = dashboardRows(view);
    expect(dashboardTable(view)).toEqual({
      columns: ['Day', 'Sign-ups', 'Trials started'],
      rows: rows.map((r) => [r.day, r.sign_ups, r.trials_started]),
      formats: ['count', 'count', 'count'],
      note: 'Made-up numbers per day for the channel and range shown, oldest day first.',
      refs: ['simulated'],
    });
    const csv = dashboardCsv(view).split('\n');
    expect(csv[0]).toBe('channel,range,day,sign_ups,trials_started');
    expect(csv.slice(1)).toEqual(rows.map((r) => `search,7d,${r.day},${r.sign_ups},${r.trials_started}`));
    for (const name of PULSE_EVENT_NAMES) expect(dashboardCsv(view)).not.toContain(name);
  });

  it('summarises a chart for its detail: the total and the busiest day of the rows shown', () => {
    const view: DashboardView = { channel: 'social', range: '30d' };
    const rows = dashboardRows(view);
    const peak = Math.max(...rows.map((r) => r.sign_ups));
    expect(chartSummary(view, 'sign_ups')).toEqual({
      total: rows.reduce((s, r) => s + r.sign_ups, 0),
      peak,
      peakDay: rows.find((r) => r.sign_ups === peak)!.day,
    });
  });
});

describe('the island contract', () => {
  it('mounts the island through EagerOrIntent with its own id only, and takes the taxonomy rows and the preview', () => {
    const client = readFileSync(join(repo, 'src/components/pulse/PulseFigureClient.tsx'), 'utf8');
    expect(client).toMatch(/^'use client';/);
    expect(client).toContain("import { EagerOrIntent } from '@/components/figures/EagerOrIntent';");
    expect(client).toMatch(/<EagerOrIntent ids=\{\[PULSE_ID\]\} preview=\{preview\}>/);
    expectTypeOf<ComponentProps<typeof EagerOrIntent>['ids']>().toEqualTypeOf<readonly string[]>();
    type ClientProps = ComponentProps<typeof import('@/components/pulse/PulseFigureClient').PulseFigureClient>;
    expectTypeOf<ClientProps['taxonomy']>().toEqualTypeOf<ReturnType<typeof pulseTaxonomy>>();
    expectTypeOf<ClientProps['preview']>().toEqualTypeOf<ReactNode>();
  });

  it('keeps the island browser-safe: it imports the names, the bus and the session, never the taxonomy module', () => {
    for (const file of ['PulseFigureClient.tsx', 'PulseInteractive.tsx', 'PulseView.tsx']) {
      const src = readFileSync(join(repo, 'src/components/pulse', file), 'utf8');
      expect(src, file).not.toMatch(/^import (?!type)[^;]*from '@\/lib\/pulse\/taxonomy'/m);
      expect(src, file).not.toMatch(/from '@\/lib\/sources'/);
    }
  });
});

describe('numbers and the route', () => {
  it('passes the truth audit: every number, in text and in aria, is a Fact or names its source', () => {
    expect(auditHtml(PAGE, ctx)).toEqual([]);
    for (const view of RANGES.map((range) => ({ channel: 'email' as const, range }))) {
      const html = renderToStaticMarkup(<PulseFigureView view={view} saved={view} detail="trials_started" />);
      expect(auditHtml(html, ctx), view.range).toEqual([]);
    }
  });

  it('has no digit in an aria-label or aria-valuetext outside a data-fact or data-derived element', () => {
    expect(unmarkedAriaDigits('<div aria-label="3 things"></div>')).toEqual(['aria-label="3 things"']);
    expect(unmarkedAriaDigits(PAGE)).toEqual([]);
  });

  it('shows the saved view and an open detail with derived numbers', () => {
    const view: DashboardView = { channel: 'email', range: '90d' };
    const html = renderToStaticMarkup(<PulseFigureView view={view} saved={view} detail="sign_ups" />);
    const { total, peak, peakDay } = chartSummary(view, 'sign_ups');
    const fmt = (n: number) => n.toLocaleString('en-GB');
    expect(text(/<div id="pulse-detail-sign_ups"[^>]*>([\s\S]*?)<\/div>/.exec(html)![1]!)).toBe(
      `Over the range: ${fmt(total)} in all, and ${fmt(peak)} on the busiest day, day ${peakDay}.`,
    );
    expect(text(/<p id="pulse-load-reason"[^>]*>([\s\S]*?)<\/p>/.exec(html)![1]!)).toBe('Saved view: Email over the last 90d.');
    expect(html).not.toMatch(/<button [^>]*disabled=""[^>]*>Load saved view/);
  });

  it('ships at /work/pulse with its own metadata', () => {
    expect(LIVE_ROUTES).toContain('/work/pulse');
    expect(metadata).toEqual(pageMetadata(seoEntry('/work/pulse'), canonicalOrigin()));
    expect(metadata).toMatchObject({
      title: 'Pulse: a tracking plan for product analytics | Mahmoud El Bergui',
      description: 'A tracking plan of 7 events, each tied to one product question, in a demo dashboard I designed and built.',
    });
    expect(withoutCta(renderToStaticMarkup(<PulseRoute />))).toBe(PAGE);
  });
});

describe('the polite announcements', () => {
  const island = readFileSync(join(repo, 'src/components/pulse/PulseInteractive.tsx'), 'utf8');

  it('names the value in each message that has one', () => {
    expect(pulseMessages.filter('email')).toBe('Applied Filter sent. Showing Email.');
    expect(pulseMessages.filter('all')).toBe('Applied Filter sent. Showing all channels.');
    expect(pulseMessages.range('90d')).toBe('Changed Date Range sent. Showing the last 90d.');
    expect(pulseMessages.detail('trials_started')).toBe('Viewed Chart Detail sent. The Trials started detail is open.');
    expect(pulseMessages.exported()).toBe('Exported Report sent. The CSV file of the made-up numbers is downloading.');
    expect(pulseMessages.saved({ channel: 'email', range: '7d' })).toBe('Saved View sent. The saved view is Email over the last 7d.');
    expect(pulseMessages.loaded({ channel: 'all', range: '7d' })).toBe('Loaded Saved View sent. Showing all channels over the last 7d.');
    expect(pulseMessages.reset()).toBe('Dashboard reset. Viewed Dashboard sent.');
    // The old fixed strings are gone, and the island writes no message of its own.
    for (const old of ['The charts show the new range', 'The current channel and range are saved on this page', 'The saved channel and range are back']) {
      expect(island).not.toContain(old);
    }
    expect(island).not.toMatch(/sent\./);
    expect(island).toContain('createAnnouncer(');
    // The pending repeat frame is cancelled when the island unmounts.
    expect(island).toMatch(/useEffect\(\(\) => \(\) => announcer\.dispose\(\), \[announcer\]\)/);
    expect(island).toContain('window.cancelAnimationFrame');
  });

  /** The live region's text over time, written as React writes it: only when the string differs. */
  function region() {
    const texts = [''];
    const frames = new Map<number, () => void>();
    const cancelled: number[] = [];
    let next = 0;
    const { announce, dispose } = createAnnouncer(
      (said) => {
        if (said !== texts.at(-1)) texts.push(said);
      },
      {
        request: (fn) => {
          frames.set(++next, fn);
          return next;
        },
        cancel: (id) => {
          cancelled.push(id);
          frames.delete(id);
        },
      },
    );
    const frame = () => {
      const due = [...frames.values()];
      frames.clear();
      for (const fn of due) fn();
    };
    return { texts, announce, dispose, frame, frames, cancelled };
  }

  it('cancels a pending repeat frame on unmount, so nothing is set after it', () => {
    const { texts, announce, dispose, frame, frames, cancelled } = region();
    const said = pulseMessages.exported();
    announce(said);
    announce(said);
    expect(frames.size).toBe(1);
    dispose();
    expect(cancelled).toEqual([1]);
    expect(frames.size).toBe(0);
    frame();
    expect(texts).toEqual(['', said, '']);
    // Disposing with nothing pending cancels nothing.
    const idle = region();
    idle.announce(said);
    idle.dispose();
    expect(idle.cancelled).toEqual([]);
  });

  it('changes the live region text for two identical actions in a row', () => {
    for (const said of [pulseMessages.exported(), pulseMessages.loaded({ channel: 'email', range: '7d' }), pulseMessages.reset()]) {
      const { texts, announce, frame } = region();
      announce(said);
      frame();
      announce(said);
      frame();
      // Three text changes: the message, the cleared region, the message again; so it is read twice.
      expect(texts).toEqual(['', said, '', said]);
      expect(texts.length - 1).toBe(3);
    }
  });

  it('a different message before the next frame wins over a pending repeat', () => {
    const { texts, announce, frame } = region();
    const exported = pulseMessages.exported();
    const range = pulseMessages.range('7d');
    announce(exported);
    announce(exported);
    announce(range);
    frame();
    expect(texts.at(-1)).toBe(range);
    expect(texts).toEqual(['', exported, '', range]);
  });

  it('two different range changes in a row are two different texts', () => {
    const { texts, announce, frame } = region();
    announce(pulseMessages.range('90d'));
    announce(pulseMessages.range('7d'));
    frame();
    expect(texts).toEqual(['', 'Changed Date Range sent. Showing the last 90d.', 'Changed Date Range sent. Showing the last 7d.']);
  });
});
