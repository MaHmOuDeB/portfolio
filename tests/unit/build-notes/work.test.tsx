// The Work directory at /work: every case study and build note, in two groups, the live test,
// Audible, Retention and Pulse first, then MarketingWS, Docproof, Weather and n8n. The page prints
// the sourced lines of content/work.tsx and nothing else: no cards, no figures, no outcome claims.
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

/** The directory, in page order: the live test, Audible, Retention and Pulse, then the four tools. */
const ORDER = [
  ['/experiment', 'Live test'],
  ['/work/audible#why-so-many', 'Experimentation at Audible (Amazon)'],
  ['/work/retention', 'Customer retention and reactivation analysis'],
  ['/work/pulse', 'Pulse: analytics instrumentation demo'],
  ['/work/marketingws', 'MarketingWS'],
  ['/work/docproof', 'Docproof'],
  ['/work/weather', 'Weather data quality'],
  ['/work/n8n', 'n8n Workflow Library'],
] as const;

const GROUPS = [
  ['experimentation', 'Experimentation & analytics', 4],
  ['tools', "Tools I've built", 4],
] as const;

/** Every item as rendered: its section, its link (href and text) and the visible text of the row. */
const rows = () =>
  [...PAGE.matchAll(/<li data-work-item="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => {
    const body = m[2]!;
    const links = [...body.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((l) => [decode(l[1]!), text(l[2]!)]);
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

  it('has the two groups as sections, each named by its own h2, in this order', () => {
    const sections = [...PAGE.matchAll(/<section id="([^"]+)" aria-labelledby="([^"]+)"[^>]*>\s*<h2 id="([^"]+)"[^>]*>([^<]+)<\/h2>/g)].map(
      (m) => [m[1], m[2], m[3], decode(m[4]!)],
    );
    expect(sections.map(([id, , , title]) => [id, title])).toEqual(GROUPS.map(([id, title]) => [id, title]));
    for (const [id, labelledBy, headingId] of sections) {
      expect(labelledBy).toBe(`${id}-title`);
      expect(headingId).toBe(`${id}-title`);
    }
    expect(WORK_SECTIONS.map((s) => [s.id, s.label])).toEqual(GROUPS.map(([id, title]) => [id, title]));
    expect([...PAGE.matchAll(/<h2[\s>]/g)]).toHaveLength(GROUPS.length);
    // each group holds its own items, as one list
    for (const [id, , count] of GROUPS) {
      const start = PAGE.indexOf(`<section id="${id}"`);
      const body = PAGE.slice(start, PAGE.indexOf('</section>', start));
      expect([...body.matchAll(/<ul[\s>]/g)], id).toHaveLength(1);
      expect([...body.matchAll(/<li data-work-item=/g)], id).toHaveLength(count);
    }
  });

  it('names each item by an h3 that holds its one link, with no level skipped', () => {
    const headings = [...PAGE.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    expect(headings).toEqual([1, 2, 3, 3, 3, 3, 2, 3, 3, 3, 3]);
    for (const row of rows()) {
      expect(row.links, row.key).toHaveLength(1);
      expect(row.body, row.key).toMatch(/^\s*<h3[^>]*>\s*<a [^>]*>[\s\S]*?<\/a>\s*<\/h3>/);
    }
  });
});

describe('the directory', () => {
  it('lists the live test, Audible, Retention and Pulse, then MarketingWS, Docproof, Weather and n8n last', () => {
    expect(rows().map((r) => r.links[0])).toEqual(ORDER.map(([href, title]) => [href, title]));
    expect(rows().at(-1)?.links[0]?.[0]).toBe('/work/n8n');
  });

  it('follows the content data exactly: no item added, dropped or reordered', () => {
    expect(WORK_GROUPS.map((g) => g.label)).toEqual(GROUPS.map(([, title]) => title));
    expect(rows().map((r) => r.links[0]?.[0])).toEqual(WORK_GROUPS.flatMap((g) => g.items.map((i) => i.href)));
  });

  // The exact wording of every row, title then line, so a change is always deliberate here.
  it('prints exactly these rows', () => {
    expect(rows().map((r) => r.text)).toEqual([
      "Live test The experiment on this site's own visitors: its design, its checks and the counts that are safe to publish.",
      'Experimentation at Audible (Amazon) How I plan and analyse experiments, and why so many of my recommendations were adopted.',
      'Customer retention and reactivation analysis Two years of orders from a UK online gift retailer (public dataset, rebuilt in 2026): cleaning the returns, cohorts, customer segments, a model of who orders again and a win-back sample size.',
      'Pulse: analytics instrumentation demo A demo dashboard with a deliberate event taxonomy. Designed and built; no real users.',
      "MarketingWS My Master's thesis, a generative AI web service for content marketing, rebuilt in 2026 as a live web app. The live demo depends on Groq's free tier.",
      'Docproof Document verification with multi-agent orchestration and automated checks.',
      'Weather data quality A tested SQL pipeline on a public dataset of weather observations, rebuilt in 2026: a star schema, data-quality checks and a quarantine for sensor errors.',
      'n8n Workflow Library Document and process automation in n8n: e-invoice intake (XRechnung, ZUGFeRD) and error alerts, with 270+ automated tests. A portfolio project with no production use.',
    ]);
    for (const [i, item] of WORK_GROUPS.flatMap((g) => g.items).entries()) {
      expect(rows()[i]?.text).toBe(`${item.title} ${text(html(item.description))}`);
    }
  });

  it('has no cards, figures, images, buttons or extra links: a list of eight links', () => {
    expect([...PAGE.matchAll(/<a[\s>]/g)]).toHaveLength(ORDER.length);
    expect(PAGE).not.toMatch(/<(figure|img|button|table|article [^>]*data-case-card)[\s>]/);
    expect(PAGE).not.toMatch(/data-figure|data-provenance/);
  });

  // The interval glyph is the row marker: decorative, so hidden from assistive technology, and the
  // only drawing on the page. It sits in the link, on the first line of the title, at the phone
  // header's 28 px length, so a short title stays on one line at 375 px.
  it('marks each row with one decorative interval glyph, before the title, inside its link', () => {
    expect([...PAGE.matchAll(/<svg[\s>]/g)]).toHaveLength(ORDER.length);
    for (const row of rows()) {
      const svgs = [...row.body.matchAll(/<svg [^>]*>/g)].map((m) => m[0]);
      expect(svgs, row.key).toHaveLength(1);
      expect(svgs[0], row.key).toContain('aria-hidden="true"');
      expect(svgs[0], row.key).toContain('width="28"');
      expect(svgs[0], row.key).not.toMatch(/role=|aria-label=/);
      const link = /<h3[^>]*>\s*<a [^>]*>([\s\S]*?)<\/a>\s*<\/h3>/.exec(row.body)?.[1] ?? '';
      expect(link.indexOf('<svg'), row.key).toBeGreaterThan(-1);
      expect(link.indexOf('<svg'), row.key).toBeLessThan(link.indexOf(row.links[0]![1].slice(0, 4)));
    }
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
