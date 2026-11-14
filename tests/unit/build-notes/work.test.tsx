// The Work directory at /work: every case study and build note as a lean card, in three groups:
// experiments and analytics (Audible, Retention, Pulse), automation and agents (Docproof, n8n,
// MarketingWS) and data pipelines (Weather, which is a tested SQL pipeline, not an automation). The
// page prints the sourced lines of content/work.tsx and nothing else: no figures, no outcome claims.
//
// Every destination must resolve: its path is a page that ships (LIVE_ROUTES, which
// tests/unit/live-routes.test.ts keeps equal to the pages under src/app), and a #fragment is the id
// of an element on that page's rendered markup. A link to a page that is not built yet fails here.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WORK_SECTIONS, WORK_TITLE, WorkPage } from '@/components/work/WorkPage';
import { FACTS, FACT_DISPLAYS } from '@/lib/facts';
import { prefetchFor } from '@/lib/nav';
import { LIVE_ROUTES, NAV } from '@/lib/site';
import { HOME_CASES } from '../../../content/home.ts';
import { WORK_GROUPS } from '../../../content/work.tsx';
import { lintSource } from '../../../scripts/design-lint.ts';
import { auditHtml } from '../../../scripts/truth-audit.ts';

const repo = join(import.meta.dirname, '../../..');

const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** Visible text: tags removed, entities decoded, whitespace collapsed, no space before punctuation. */
const text = (markup: string) =>
  decode(markup.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/ ([.,:;)])/g, '$1')
    .replace(/\( /g, '(')
    .trim();
const html = (node: ReactNode) => renderToStaticMarkup(createElement(Fragment, null, node));

const PAGE = renderToStaticMarkup(<WorkPage />);

/** The directory, in page order: three experiments pages, three automation pages, then Weather. */
const ORDER = [
  ['/work/audible#why-so-many', 'Experimentation at Audible (Amazon)'],
  ['/work/retention', 'Customer retention and reactivation analysis'],
  ['/work/pulse', 'Pulse: analytics instrumentation demo'],
  ['/work/docproof', 'Docproof'],
  ['/work/n8n', 'n8n Workflow Library'],
  ['/work/marketingws', 'MarketingWS'],
  ['/work/weather', 'Weather data quality'],
] as const;

const GROUPS = [
  ['experimentation', 'Experiments and analytics', 3],
  ['automation', 'Automation and agents', 3],
  ['pipelines', 'Data pipelines', 1],
] as const;

/** Every item as rendered: its card (one link holding the title, the line and the type) and its text. */
const rows = () =>
  [...PAGE.matchAll(/<li data-work-item="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => {
    const body = m[2]!;
    const links = [...body.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map((l) => ({
      href: decode(/href="([^"]+)"/.exec(l[1]!)![1]!),
      attrs: l[1]!,
      title: text(/<h3[^>]*>([\s\S]*?)<\/h3>/.exec(l[2]!)?.[1] ?? ''),
      line: text(/<\/h3><p[^>]*>([\s\S]*?)<\/p>/.exec(l[2]!)?.[1] ?? ''),
      kind: /<span data-depth-meta="">([^<]*)<\/span>/.exec(l[2]!)?.[1] ?? null,
    }));
    return { key: m[1], body, links, text: text(body) };
  });

describe('the outline', () => {
  it('has one h1, "Work", the navigation label, with a one-line intro', () => {
    expect(WORK_TITLE).toBe('Work');
    expect(NAV.find((n) => n.href === '/work')?.label).toBe(WORK_TITLE);
    expect([...PAGE.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
    expect(PAGE).toMatch(/<h1 id="work-title"[^>]*>Work<\/h1>/);
    const intro = /<p data-work-intro=""[^>]*>([\s\S]*?)<\/p>/.exec(PAGE);
    expect(text(intro?.[1] ?? '')).toBe("Experiments and analyses first, then the tools I've built.");
  });

  it('has the three groups as sections, each named by its own h2 that rises as a heading, in this order', () => {
    const sections = [
      ...PAGE.matchAll(/<section id="([^"]+)" aria-labelledby="([^"]+)"[^>]*>\s*<h2 id="([^"]+)"([^>]*)>([^<]+)<\/h2>/g),
    ].map((m) => [m[1], m[2], m[3], m[4], decode(m[5]!)] as const);
    expect(sections.map(([id, , , , title]) => [id, title])).toEqual(GROUPS.map(([id, title]) => [id, title]));
    for (const [id, labelledBy, headingId, attrs] of sections) {
      expect(labelledBy).toBe(`${id}-title`);
      expect(headingId).toBe(`${id}-title`);
      expect(attrs).toContain('data-depth-rise="heading"');
    }
    expect(WORK_SECTIONS.map((s) => [s.id, s.label])).toEqual(GROUPS.map(([id, title]) => [id, title]));
    expect([...PAGE.matchAll(/<h2[\s>]/g)]).toHaveLength(GROUPS.length + 1);
    // each group holds its own items, as one list whose rule draws on entry
    for (const [id, , count] of GROUPS) {
      const start = PAGE.indexOf(`<section id="${id}"`);
      const body = PAGE.slice(start, PAGE.indexOf('</section>', start));
      expect([...body.matchAll(/<ul[\s>]/g)], id).toHaveLength(1);
      expect(body, id).toMatch(/<ul data-depth-draw=""/);
      expect([...body.matchAll(/<li data-work-item=/g)], id).toHaveLength(count);
    }
  });

  it('names each item by an h3 inside its one card link, with no level skipped', () => {
    const headings = [...PAGE.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    // the last h2 is the live test tile, after the three groups
    expect(headings).toEqual([1, 2, 3, 3, 3, 2, 3, 3, 3, 2, 3, 2]);
    for (const row of rows()) {
      expect(row.links, row.key).toHaveLength(1);
      expect(row.body, row.key).toMatch(/^<a [^>]*><h3[^>]*>[\s\S]*?<\/h3>/);
    }
  });
});

describe('the layout', () => {
  it('gives each group a full-width card grid: three across from lg, two from md, one below', () => {
    for (const [id] of GROUPS) {
      const start = PAGE.indexOf(`<section id="${id}"`);
      const body = PAGE.slice(start, PAGE.indexOf('</section>', start));
      const open = /<section [^>]*class="([^"]*)"/.exec(body)![1]!;
      expect(open, id).not.toMatch(/max-w-/);
      const ul = /<ul [^>]*class="([^"]*)"/.exec(body)![1]!.split(/\s+/);
      expect(ul, id).toEqual(expect.arrayContaining(['grid', 'md:grid-cols-2', 'lg:grid-cols-3']));
    }
  });

  it('sets each group heading as a large display heading, with the lede muted under it', () => {
    for (const [id] of GROUPS) {
      const h2 = new RegExp(`<h2 id="${id}-title" class="([^"]*)"`).exec(PAGE)![1]!.split(/\s+/);
      expect(h2, id).toEqual(expect.arrayContaining(['text-display-sm', 'md:text-display']));
    }
    const ledes = [...PAGE.matchAll(/<p data-work-lede="" class="([^"]*)">([^<]*)<\/p>/g)];
    expect(ledes.map((m) => decode(m[2]!))).toEqual([
      'How I plan a test, read it honestly and get to a decision.',
      'Tools I built so that people, including me, stop doing the same thing by hand.',
    ]);
    for (const m of ledes) expect(m[1]).toContain('text-muted');
  });

  it('names each card by its title only, and describes it by the line', () => {
    for (const row of rows()) {
      const attrs = row.links[0]!.attrs;
      const labelled = /aria-labelledby="([^"]+)"/.exec(attrs)?.[1];
      const described = /aria-describedby="([^"]+)"/.exec(attrs)?.[1];
      expect(labelled, row.key).toBeDefined();
      expect(described, row.key).toBeDefined();
      expect(labelled).not.toBe(described);
      expect(row.body, row.key).toMatch(new RegExp(`<h3 id="${labelled}"`));
      expect(row.body, row.key).toMatch(new RegExp(`<p id="${described}"`));
    }
  });

  it('ends with a tile that links to the live test, in the Home site tile words', () => {
    const tile = /<div data-tile=""[^>]*data-work-site=""[^>]*>([\s\S]*?)<\/div>/.exec(PAGE)?.[1] ?? '';
    expect(tile).toMatch(/^<h2[^>]*>This site is part of the evidence\.<\/h2>/);
    expect(text(tile)).toBe(
      'This site is part of the evidence. It runs its own pre-registered A/B test on the three experiment cards on the Home page. I built it with coding agents, and every change passes its automated checks before it ships. See the live test',
    );
    expect(/<a [^>]*href="([^"]+)"/.exec(tile)![1]).toBe('/experiment');
    expect(PAGE.indexOf('data-work-site')).toBeGreaterThan(PAGE.lastIndexOf('</section>'));
  });
});

describe('the directory', () => {
  it('lists Audible, Retention and Pulse, then Docproof, n8n and MarketingWS, then Weather', () => {
    expect(rows().map((r) => [r.links[0]!.href, r.links[0]!.title])).toEqual(ORDER.map(([href, title]) => [href, title]));
    expect(rows().map((r) => r.key)).toEqual(ORDER.map(([href]) => href));
  });

  it('puts Weather under "Data pipelines": its page describes a tested SQL pipeline, not an automation', () => {
    expect(WORK_GROUPS.find((g) => g.label === 'Data pipelines')?.items.map((i) => i.href)).toEqual(['/work/weather']);
    expect(WORK_GROUPS.flatMap((g) => g.items).find((i) => i.href === '/work/weather')?.description).toContain(
      'A tested SQL pipeline',
    );
  });

  it('follows the content data exactly: no item added, dropped or reordered', () => {
    expect(WORK_GROUPS.map((g) => g.label)).toEqual(GROUPS.map(([, title]) => title));
    expect(rows().map((r) => r.links[0]?.href)).toEqual(WORK_GROUPS.flatMap((g) => g.items.map((i) => i.href)));
  });

  it('keeps the titles the index showed before: the topic names, not the experiment headlines', () => {
    expect(WORK_GROUPS.flatMap((g) => g.items.map((i) => i.title))).toEqual([
      'Experimentation at Audible (Amazon)',
      'Customer retention and reactivation analysis',
      'Pulse: analytics instrumentation demo',
      'Docproof',
      'n8n Workflow Library',
      'MarketingWS',
      'Weather data quality',
    ]);
  });

  // The exact wording of every card, title then line, so a change is always deliberate here.
  it('prints exactly these lines', () => {
    expect(rows().map((r) => [r.links[0]!.title, r.links[0]!.line])).toEqual([
      [
        'Experimentation at Audible (Amazon)',
        'How I plan and analyse experiments, and why so many of my recommendations were adopted. The tests are confidential, so the page shows none of their results.',
      ],
      [
        'Customer retention and reactivation analysis',
        'Two years of orders from a UK online gift retailer (public dataset, rebuilt in 2026): cleaning the returns, cohorts, customer segments, a model of who orders again and a win-back sample size. Nobody was contacted and no test was run.',
      ],
      ['Pulse: analytics instrumentation demo', 'A demo dashboard with a deliberate event taxonomy. Designed and built; no real users.'],
      [
        'Docproof',
        'Three agents propose changes to a document, and deterministic checks decide what reaches the reader. Open source, tested in CI, no users yet.',
      ],
      [
        'n8n Workflow Library',
        'Document and process automation in n8n: e-invoice intake (XRechnung, ZUGFeRD) and error alerts, with 270+ automated tests. A portfolio project with no production use.',
      ],
      [
        'MarketingWS',
        "My Master's thesis, a generative AI web service for content marketing, rebuilt in 2026 as a live web app. The live demo depends on Groq's free tier.",
      ],
      [
        'Weather data quality',
        'A tested SQL pipeline on a public dataset of weather observations, rebuilt in 2026: a star schema, data-quality checks and a quarantine for sensor errors.',
      ],
    ]);
    for (const [i, item] of WORK_GROUPS.flatMap((g) => g.items).entries()) {
      expect(rows()[i]?.links[0]?.line).toBe(text(html(item.description)));
    }
  });

  // The type of each entry comes from data the site already has: the Home page's featured case studies
  // are case studies, every other page is a build note. No year: no fact holds one.
  it('labels each case study and build note from existing data', () => {
    const cases = new Set(HOME_CASES.map((c) => c.href));
    const expected = WORK_GROUPS.flatMap((g) => g.items.map((i) => (cases.has(i.href) ? 'Case study' : 'Build note')));
    expect(rows().map((r) => r.links[0]!.kind)).toEqual(expected);
    expect(expected).toEqual(['Case study', 'Case study', 'Case study', 'Build note', 'Build note', 'Build note', 'Build note']);
  });

  it('draws every item as a lean card that rises on entry: the link carries the lean, rise and tile attributes', () => {
    for (const row of rows()) {
      const attrs = row.links[0]!.attrs;
      for (const a of ['data-depth-lean=""', 'data-depth-rise=""', 'data-tile=""']) expect(attrs, row.key).toContain(a);
      expect(row.body, row.key).toContain('<span data-depth-go="" aria-hidden="true">+</span>');
    }
  });

  it('gives a link to the home page no prefetch, and leaves the links to pages that ship at the default', () => {
    expect(prefetchFor('/')).toBe(false);
    const homeLinks = rows().filter((r) => r.links[0]!.href.split(/[?#]/)[0] === '/');
    expect(homeLinks).toEqual([]);
    for (const row of rows()) expect(prefetchFor(row.links[0]!.href), row.key).toBeUndefined();
    // no card links to the home page
    expect(PAGE).not.toMatch(/href="\/"/);
  });

  it('has no figures, images, buttons or tables, and one link besides the seven cards: the live test', () => {
    expect([...PAGE.matchAll(/<a[\s>]/g)]).toHaveLength(ORDER.length + 1);
    expect(PAGE).not.toMatch(/<(figure|img|button|table|svg)[\s>]/);
    expect(PAGE).not.toMatch(/data-figure|data-provenance/);
  });

  it('prints its one figure through its fact, and no number, banned phrase or character the checks report', () => {
    expect([...PAGE.matchAll(/data-fact="([^"]+)"/g)].map((m) => m[1])).toEqual(['profile.n8n.automated_tests']);
    const doc = `<!doctype html><html><head><title>Work</title></head><body><main>${PAGE}</main></body></html>`;
    const ctx = { route: '/work', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] };
    expect(auditHtml(doc, ctx)).toEqual([]);
    // The rendered text is linted as content (the lint keys its content rules on the extension).
    expect(lintSource(text(PAGE), 'content/work.mdx')).toEqual([]);
    for (const file of ['src/components/work/WorkPage.tsx', 'src/app/work/page.tsx']) {
      expect(lintSource(readFileSync(join(repo, file), 'utf8'), file), file).toEqual([]);
    }
  });
});

/** The page file of a site path, or null when no page ships there. */
const pageFile = (path: string) => {
  const file = join(repo, 'src/app', path, 'page.tsx');
  return existsSync(file) ? file : null;
};

/** The markup a route renders: its default export, awaited when the page is async. */
async function renderRoute(path: string): Promise<string> {
  const file = pageFile(path);
  if (!file) throw new Error(`no page at ${path}`);
  const mod = (await import(/* @vite-ignore */ file)) as { default: (props: object) => ReactNode | Promise<ReactNode> };
  return html(await mod.default({}));
}

describe('every destination resolves', () => {
  it.each(ORDER.map(([href]) => href))('%s is a page that ships, and its fragment is on that page', async (href) => {
    const [path = '', fragment] = href.split('#');
    expect(LIVE_ROUTES, `${path} is not a live route on this branch`).toContain(path);
    expect(pageFile(path), `no src/app${path}/page.tsx`).not.toBeNull();
    // a link to a page that ships keeps next/link's default prefetch
    expect(prefetchFor(href)).toBeUndefined();
    if (fragment !== undefined) expect(await renderRoute(path)).toContain(`id="${fragment}"`);
  });
});

describe('the route', () => {
  const route = readFileSync(join(repo, 'src/app/work/page.tsx'), 'utf8');

  it('ships at /work, the navigation target', () => {
    expect(LIVE_ROUTES).toContain('/work');
    expect(prefetchFor('/work')).toBeUndefined();
  });

  it('is a plain static page that renders the composition, with its title and description', async () => {
    expect(route).toMatch(/<WorkPage \/>/);
    expect(route).not.toMatch(/revalidate|dynamic|searchParams|cookies\(|headers\(/);
    const mod = (await import('@/app/work/page')) as {
      default: () => ReactNode;
      metadata: { title?: unknown; description?: unknown };
    };
    expect(mod.metadata.title).toBe('Work');
    expect(mod.metadata.description).toBe(
      "Every case study and build note on this site: experiments and analyses first, then the tools I've built.",
    );
    expect(html(mod.default())).toBe(PAGE);
  });
});
