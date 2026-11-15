// The Work directory at /work: every case study and build note as a lean card, in two groups of four:
// experiments and analytics (Audible, Retention, Pulse, Weather) and automation and agents (the
// test-account tool on the Audible page, Docproof, n8n, MarketingWS). Each card is a provenance chip,
// the title, one bold "Shows:" line and one plain line. The chip carries the project's limit, so the
// line does not repeat it. The page prints the lines of content/work.tsx and nothing else.
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
import { withoutCta } from '../page-cta';
import { FACTS, FACT_DISPLAYS } from '@/lib/facts';
import { prefetchFor } from '@/lib/nav';
import { withSiteName } from '@/lib/seo/metadata';
import { LIVE_ROUTES, NAV } from '@/lib/site';
import { HOME_SITE } from '../../../content/home.ts';
import { seoEntry } from '../../../content/seo.ts';
import { WORK_GROUPS, WORK_SITE } from '../../../content/work.tsx';
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

const PAGE = withoutCta(renderToStaticMarkup(<WorkPage />));

/** The directory, in page order: four experiments and analytics cards, then four automation cards. */
const ORDER = [
  ['/work/audible', 'Experimentation at Audible (Amazon)'],
  ['/work/retention', 'Customer retention and reactivation analysis'],
  ['/work/pulse', 'Pulse: a tracking plan for product analytics'],
  ['/work/weather', 'Weather: a SQL pipeline that stops on bad data'],
  ['/work/audible#automation', 'Test-account automation'],
  ['/work/docproof', "Docproof: agents that check each other's work"],
  ['/work/n8n', 'E-invoice intake and error alerts in n8n'],
  ['/work/marketingws', 'MarketingWS: marketing copy from one brief, with a fact check'],
] as const;

/** Each group: its anchor id, its heading, the chip that names the kind, and its number of cards. */
const GROUPS = [
  ['experimentation', 'Experiments and analytics', 'Case studies', 4],
  ['automation', 'Automation and agents', 'Build notes', 4],
] as const;

/** Every item as rendered: its card (one link holding the title, the line and the type) and its text. */
const rows = () =>
  [...PAGE.matchAll(/<li data-work-item="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => {
    const body = m[2]!;
    const links = [...body.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map((l) => ({
      href: decode(/href="([^"]+)"/.exec(l[1]!)![1]!),
      attrs: l[1]!,
      title: text(/<h3[^>]*>([\s\S]*?)<\/h3>/.exec(l[2]!)?.[1] ?? ''),
      description: text(/<\/h3><p[^>]*>([\s\S]*?)<\/p>/.exec(l[2]!)?.[1] ?? ''),
      chip: text(/<span data-work-chip=""[^>]*>([\s\S]*?)<\/span><\/span>/.exec(l[2]!)?.[1] ?? ''),
      shows: text(/<strong data-work-shows=""[^>]*>([\s\S]*?)<\/strong>/.exec(l[2]!)?.[1] ?? ''),
      line: text(/<span data-work-line=""[^>]*>([\s\S]*?)<\/span><\/p>/.exec(l[2]!)?.[1] ?? ''),
    }));
    return { key: m[1], body, links, text: text(body) };
  });

describe('the outline', () => {
  it('has unique ids, so each card link is named and described by its own text', () => {
    // LeanCard derives its ids from the href: two cards to one destination would share them.
    const ids = [...PAGE.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('has one h1 under the chip "Work", the navigation label, then what the page holds and what the two kinds are', () => {
    expect(WORK_TITLE).toBe('Work');
    expect(NAV.find((n) => n.href === '/work')?.label).toBe(WORK_TITLE);
    expect([...PAGE.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
    // The page's chip carries the navigation label; the h1 is the headline in two tones.
    expect(PAGE).toMatch(/<span data-chip="">Work<\/span><h1 id="work-title"[^>]*>Open the work <span data-quiet="">and see how it was done\.<\/span><\/h1>/);
    const intro = /<span data-work-intro="">([\s\S]*?)<\/span>/.exec(PAGE);
    expect(text(intro?.[1] ?? '')).toBe('Seven projects with their code, their sources and their limits. Start with Audible.');
    // One muted line under it explains the two kinds, once, before the first group.
    const kinds = /<span data-work-kinds="" class="([^"]*)">([\s\S]*?)<\/span>/.exec(PAGE);
    expect(text(kinds?.[2] ?? '')).toBe(
      'Case studies are analyses with a question and a finding. Build notes are things I built, and how I tested them.',
    );
    expect(kinds![1]!.split(/\s+/)).toEqual(expect.arrayContaining(['block', 'text-sm']));
    expect(PAGE.indexOf('data-work-kinds')).toBeLessThan(PAGE.indexOf('<section'));
    expect(PAGE.slice(0, PAGE.indexOf('<section'))).toMatch(/<p class="[^"]*text-muted[^"]*"><span data-work-intro="">/);
  });

  it('has the two groups as sections, each named by its own h2 that rises as a heading, in this order', () => {
    const sections = [
      ...PAGE.matchAll(/<section id="([^"]+)" aria-labelledby="([^"]+)"[^>]*>[\s\S]*?<h2 id="([^"]+)"([^>]*)>([^<]+)<\/h2>/g),
    ].map((m) => [m[1], m[2], m[3], m[4], decode(m[5]!)] as const);
    expect(sections.map(([id, , , , title]) => [id, title])).toEqual(GROUPS.map(([id, title]) => [id, title]));
    for (const [id, labelledBy, headingId, attrs] of sections) {
      expect(labelledBy).toBe(`${id}-title`);
      expect(headingId).toBe(`${id}-title`);
      expect(attrs).toContain('class="text-h2-sm md:text-h2"');
    }
    expect(WORK_SECTIONS.map((s) => [s.id, s.label])).toEqual(GROUPS.map(([id, title]) => [id, title]));
    expect([...PAGE.matchAll(/<h2[\s>]/g)]).toHaveLength(GROUPS.length + 1);
    // each group holds its own items, as one list whose rule draws on entry
    for (const [id, , , count] of GROUPS) {
      const start = PAGE.indexOf(`<section id="${id}"`);
      const body = PAGE.slice(start, PAGE.indexOf('</section>', start));
      expect([...body.matchAll(/<ul[\s>]/g)], id).toHaveLength(1);
      // The rule that draws in is its own decorative element: the list itself is never transformed.
      expect(body, id).toMatch(/<span data-depth-draw="" aria-hidden="true"[^>]*><\/span><ul /);
      expect(body, id).not.toMatch(/<ul[^>]*data-depth-draw/);
      expect([...body.matchAll(/<li data-work-item=/g)], id).toHaveLength(count);
    }
    // no group of one card: the data-pipelines group is gone, and Weather sits with the analyses
    expect(PAGE).not.toContain('Data pipelines');
    expect(PAGE).not.toContain('id="pipelines"');
  });

  it('names the kind in each group chip, never the heading again', () => {
    for (const [id, title, kind] of GROUPS) {
      const start = PAGE.indexOf(`<section id="${id}"`);
      const chip = /<span data-chip="">([^<]*)<\/span><h2 /.exec(PAGE.slice(start))?.[1];
      expect(chip, id).toBe(kind);
      expect(title.toLowerCase(), id).not.toContain(chip!.toLowerCase());
    }
  });

  it('names each item by an h3 inside its one card link, with no level skipped', () => {
    const headings = [...PAGE.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    // the last h2 is the live test tile, after the two groups
    expect(headings).toEqual([1, 2, 3, 3, 3, 3, 2, 3, 3, 3, 3, 2]);
    for (const row of rows()) {
      expect(row.links, row.key).toHaveLength(1);
      expect(row.body, row.key).toMatch(/^<a [^>]*><h3[^>]*>[\s\S]*?<\/h3>/);
    }
  });
});

describe('the layout', () => {
  it('gives each group a full-width grid of even cards: two across from md, one below, so four cards leave no orphan', () => {
    for (const [id] of GROUPS) {
      const start = PAGE.indexOf(`<section id="${id}"`);
      const body = PAGE.slice(start, PAGE.indexOf('</section>', start));
      expect(body, id).not.toMatch(/<section [^>]*max-w-/);
      const ul = /<ul [^>]*class="([^"]*)"/.exec(body)![1]!.split(/\s+/);
      expect(ul, id).toEqual(expect.arrayContaining(['grid', 'grid-cols-1', 'md:grid-cols-2']));
      expect(ul.filter((c) => /grid-cols-[34]/.test(c)), id).toEqual([]);
    }
  });

  it('sets the page title and the group headings in the section scale', () => {
    const h1 = /<h1 id="work-title" class="([^"]*)"/.exec(PAGE)![1]!.split(/\s+/);
    expect(h1).toEqual(expect.arrayContaining(['text-h2-sm', 'md:text-h2']));
    for (const [id] of GROUPS) {
      const h2 = new RegExp(`<h2 id="${id}-title" class="([^"]*)"`).exec(PAGE)![1]!.split(/\s+/);
      expect(h2, id).toEqual(expect.arrayContaining(['text-h2-sm', 'md:text-h2']));
    }
  });

  it('names each card by its title only, and describes it by the chip, the "Shows:" line and the plain line', () => {
    for (const row of rows()) {
      const attrs = row.links[0]!.attrs;
      const labelled = /aria-labelledby="([^"]+)"/.exec(attrs)?.[1];
      const described = /aria-describedby="([^"]+)"/.exec(attrs)?.[1];
      expect(labelled, row.key).toBeDefined();
      expect(described, row.key).toBeDefined();
      expect(labelled).not.toBe(described);
      expect(row.body, row.key).toMatch(new RegExp(`<h3 id="${labelled}"`));
      expect(row.body, row.key).toMatch(new RegExp(`<p id="${described}"`));
      // The chip is inside the description, so a screen reader hears the provenance with the link.
      const link = row.links[0]!;
      expect(link.description, row.key).toBe(`${link.chip} ${link.shows} ${link.line}`);
    }
  });

  it('draws the chip above the title: the description lays its parts out in the card, and the chip comes first', () => {
    for (const row of rows()) {
      const li = decode(/^<li data-work-item="[^"]*" class="([^"]*)"/.exec(PAGE.slice(PAGE.indexOf(`<li data-work-item="${row.key}"`)))![1]!).split(/\s+/);
      expect(li, row.key).toContain('[&_p]:contents');
      const chip = /<span data-work-chip="" class="([^"]*)"><span data-chip="">/.exec(row.body)![1]!.split(/\s+/);
      expect(chip, row.key).toContain('order-first');
      // the empty meta line of the card is not drawn
      expect(li, row.key).toContain('[&_[data-depth-meta]]:hidden');
      expect(row.body, row.key).toContain('<span data-depth-meta=""></span>');
    }
  });

  it('ends with a tile that links to the live test, in the Home site tile words, with the sketch Home shows there', async () => {
    const start = PAGE.indexOf('<div data-tile="" data-work-site=""');
    expect(start).toBeGreaterThan(PAGE.lastIndexOf('</section>'));
    const tile = PAGE.slice(start);
    expect(tile).toMatch(/<span data-chip=""><span data-chip-dot="live" aria-hidden="true"><\/span>Live test<\/span><h2[^>]*>This site is <span data-quiet="">part of the evidence\.<\/span><\/h2>/);
    const words = tile.slice(0, tile.indexOf('<div data-work-site-sketch'));
    expect(text(words)).toBe(`Live test ${WORK_SITE.title} ${WORK_SITE.text} ${HOME_SITE.live}`);
    expect(WORK_SITE.text).toContain('the three experiment cards on the Home page');
    expect(WORK_SITE.text).not.toContain('cards above');
    expect([...tile.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])).toEqual(['/experiment']);
    // Its heading is a section heading like the groups', never as large as the page title.
    const h2 = /<h2 class="([^"]*)"/.exec(tile)![1]!.split(/\s+/);
    expect(h2).toEqual(expect.arrayContaining(['text-h2-sm', 'md:text-h2']));
    // The sketch is the shared one, decorative, and it stays still here: no entry turn and no pointer follow.
    const { ConfidenceSketch } = await import('@/components/frame/sketches');
    const sketch = tile.slice(tile.indexOf('<div data-work-site-sketch'));
    expect(sketch).toContain(html(createElement(ConfidenceSketch)));
    expect(sketch).toMatch(/^<div data-work-site-sketch="" aria-hidden="true"/);
    expect(tile).not.toMatch(/data-depth-turn|data-depth-follow/);
  });
});

describe("the cards' sketches", () => {
  const sketchOf = (body: string) => /data-sketch="([^"]+)"/.exec(body)?.[1] ?? null;

  it("ends each card in Home's sketch for the same project; Weather keeps its checks", () => {
    expect(rows().map((r) => [r.key, sketchOf(r.body)])).toEqual([
      ['/work/audible', 'process'],
      ['/work/retention', 'cohorts'],
      ['/work/pulse', 'events'],
      ['/work/weather', 'checks'],
      ['/work/audible#automation', 'steps'],
      ['/work/docproof', 'agents'],
      ['/work/n8n', 'workflow'],
      ['/work/marketingws', 'variants'],
    ]);
  });

  it('draws each sketch exactly as Home does, from the one shared module', async () => {
    const shared = await import('@/components/frame/sketches');
    const same = {
      '/work/audible': shared.ProcessSketch,
      '/work/retention': shared.CohortsSketch,
      '/work/pulse': shared.EventsSketch,
      '/work/weather': shared.ChecksSketch,
      '/work/audible#automation': shared.StepsSketch,
      '/work/docproof': shared.AgentsSketch,
      '/work/n8n': shared.WorkflowSketch,
      '/work/marketingws': shared.VariantsSketch,
    } as const;
    for (const r of rows()) {
      const vignette = /<div data-vignette=""[\s\S]*$/.exec(r.body)![0];
      expect(vignette, r.key).toContain(html(createElement(same[r.key as keyof typeof same])));
    }
    expect(existsSync(join(repo, 'src/components/work/WorkVignettes.tsx'))).toBe(false);
    expect(existsSync(join(repo, 'src/components/home/Sketches.tsx'))).toBe(false);
    // The Audible card shows how a test is run, never a result: no outcome word on it.
    const audible = rows().find((r) => r.key === '/work/audible')!;
    expect(text(/<div data-vignette=""[\s\S]*$/.exec(audible.body)![0])).not.toMatch(/higher|lower|clear|neutral|held|intact/i);
  });

  it('keeps every sketch decorative, digit-free and labelled "Illustration"', () => {
    for (const r of rows()) {
      const vignette = /<div data-vignette="" aria-hidden="true">([\s\S]*)$/.exec(r.body);
      expect(vignette, r.key).not.toBeNull();
      expect(vignette![1]).toContain('<span data-vignette-label="">Illustration</span>');
      expect(text(vignette![1]!), r.key).not.toMatch(/\d/);
    }
  });
});

describe('the directory', () => {
  it('lists Audible, Retention, Pulse and Weather, then the test-account tool, Docproof, n8n and MarketingWS', () => {
    expect(rows().map((r) => [r.links[0]!.href, r.links[0]!.title])).toEqual(ORDER.map(([href, title]) => [href, title]));
    expect(rows().map((r) => r.key)).toEqual(ORDER.map(([href]) => href));
  });

  it('opens the Audible card at the top of its page, and the tool card at its section', () => {
    expect(rows()[0]!.links[0]!.href).toBe('/work/audible');
    expect(rows()[4]!.links[0]!.href).toBe('/work/audible#automation');
  });

  it('follows the content data exactly: no item added, dropped or reordered', () => {
    expect(WORK_GROUPS.map((g) => [g.label, g.kind])).toEqual(GROUPS.map(([, title, kind]) => [title, kind]));
    expect(rows().map((r) => r.links[0]?.href)).toEqual(WORK_GROUPS.flatMap((g) => g.items.map((i) => i.href)));
  });

  // The exact wording of every card, so a change is always deliberate here: the provenance chip, the
  // title, the "Shows:" line and the plain line.
  it('prints exactly these cards', () => {
    expect(rows().map((r) => [r.links[0]!.chip, r.links[0]!.title, r.links[0]!.shows, r.links[0]!.line])).toEqual([
      [
        'Work experience',
        'Experimentation at Audible (Amazon)',
        'Shows: I plan a test, say plainly what it shows and write a recommendation teams act on.',
        'Nearly two years of A/B tests on the Audible website and app. The results are confidential, so the page shows the method.',
      ],
      [
        'Public data, rebuilt 2026',
        'Customer retention and reactivation analysis',
        'Shows: I clean the data before I trust a number, and I do not mistake a prediction for proof.',
        'Two years of orders from a UK online gift retailer: a cleaning error, who orders again, and the test I would run next.',
      ],
      [
        'Demo, no real users',
        'Pulse: a tracking plan for product analytics',
        'Shows: I decide what to track from the product question, not from what is easy to capture.',
        'A demo dashboard I designed and built, with 7 named events.',
      ],
      [
        'Public data, rebuilt 2026',
        'Weather: a SQL pipeline that stops on bad data',
        'Shows: My pipelines refuse to load bad data quietly.',
        'A tested SQL pipeline on weather observations: a star schema, data-quality checks and a quarantine for sensor errors.',
      ],
      [
        'Work experience',
        'Test-account automation',
        'Shows: I turn repeated manual steps into tools a whole team can use.',
        'Tampermonkey with a step recorder. It cut test-account setup at Audible from about 20 to about 3 minutes and was adopted team-wide.',
      ],
      [
        'Open source',
        "Docproof: agents that check each other's work",
        'Shows: I build AI tools in which code, not the model, has the last word on facts.',
        'Separate agents write, audit and review a document, and deterministic checks decide what reaches the reader. Tested in CI, no users yet.',
      ],
      [
        'Personal project',
        'E-invoice intake and error alerts in n8n',
        'Shows: I can automate a back-office process and prove it works with tests.',
        'Document and process automation in n8n: e-invoice intake (XRechnung, ZUGFeRD) and error alerts, with 270+ automated tests.',
      ],
      [
        "Master's thesis, rebuilt 2026",
        'MarketingWS: marketing copy from one brief, with a fact check',
        'Shows: I took a generative AI idea from thesis to a live web app with checks.',
        "A generative AI web service for content marketing. The live demo depends on Groq's free tier.",
      ],
    ]);
    for (const [i, item] of WORK_GROUPS.flatMap((g) => g.items).entries()) {
      expect(rows()[i]?.links[0]?.line).toBe(text(html(item.description)));
      expect(rows()[i]?.links[0]?.shows).toBe(`Shows: ${item.shows}`);
      expect(rows()[i]?.links[0]?.chip).toBe(item.chip);
    }
  });

  it('uses only the provenance chips of the list, and never repeats a chip in its own card body', () => {
    const allowed = ['Work experience', 'Public data, rebuilt 2026', 'Demo, no real users', 'Open source', 'Personal project', "Master's thesis, rebuilt 2026"];
    for (const r of rows()) {
      const link = r.links[0]!;
      expect(allowed, r.key).toContain(link.chip);
      // The chip carries the limit, so the body does not say it again.
      for (const said of ['rebuilt in 2026', 'public dataset', 'no real users', 'Open source', 'portfolio project', "Master's thesis"]) {
        expect(`${link.shows} ${link.line}`, `${r.key}: ${said}`).not.toContain(said);
      }
      expect(`${link.shows} ${link.line}`, r.key).not.toMatch(/honest/i);
    }
  });

  it('keeps each body short: one "Shows:" sentence and a plain line of at most two sentences', () => {
    for (const r of rows()) {
      const link = r.links[0]!;
      expect(link.shows, r.key).toMatch(/^Shows: [^.]*\.$/);
      expect(link.line.length, r.key).toBeLessThanOrEqual(140);
      expect(link.line.split(/\. (?=[A-Z])/).length, r.key).toBeLessThanOrEqual(2);
    }
  });

  it('keeps the Audible truth on its two cards: no figure of the tests, the tool named exactly, no markets beside tests', () => {
    const [audible, tool] = [rows()[0]!, rows()[4]!];
    expect(audible.body).not.toContain('data-fact=');
    expect(audible.text).not.toMatch(/adopt|\d/);
    expect(tool.text).toContain('Tampermonkey with a step recorder');
    expect([...tool.body.matchAll(/data-fact="([^"]+)"/g)].map((m) => m[1])).toEqual([
      'profile.audible.setup_minutes_before',
      'profile.audible.setup_minutes_after',
    ]);
    expect(PAGE).not.toContain('profile.audible.markets');
    expect(PAGE).not.toContain('profile.audible.experiments');
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

  it('has no figures, images, buttons or tables, one decorative sketch drawing, and one link besides the eight cards: the live test', () => {
    expect([...PAGE.matchAll(/<a[\s>]/g)]).toHaveLength(ORDER.length + 1);
    expect(PAGE).not.toMatch(/<(figure|img|button|table)[\s>]/);
    expect(PAGE).not.toMatch(/data-figure|data-provenance/);
    // the only drawing is the live test tile's sketch, hidden from assistive technology
    const svgs = [...PAGE.matchAll(/<svg [^>]*>/g)].map((m) => m[0]);
    expect(svgs).toHaveLength(1);
    expect(svgs[0]).toContain('aria-hidden="true"');
    expect(PAGE.indexOf('<svg')).toBeGreaterThan(PAGE.indexOf('data-work-site-sketch'));
  });

  it('prints its figures through their facts, and no number, banned phrase or character the checks report', () => {
    expect([...PAGE.matchAll(/data-fact="([^"]+)"/g)].map((m) => m[1])).toEqual([
      'pulse.events.count',
      'profile.audible.setup_minutes_before',
      'profile.audible.setup_minutes_after',
      'profile.n8n.automated_tests',
    ]);
    const doc = `<!doctype html><html><head><title>Work</title></head><body><main>${PAGE}</main></body></html>`;
    const ctx = { route: '/work', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] };
    expect(auditHtml(doc, ctx)).toEqual([]);
    // The rendered text is linted as content (the lint keys its content rules on the extension).
    expect(lintSource(text(PAGE), 'content/work.mdx')).toEqual([]);
    for (const file of ['src/components/work/WorkPage.tsx', 'src/app/work/page.tsx', 'content/work.tsx']) {
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
    // The words are the sharing data's (content/seo.ts, pinned by the metadata tests); here, that the route uses them.
    expect(mod.metadata.title).toBe(withSiteName(seoEntry('/work').title));
    expect(mod.metadata.description).toBe(seoEntry('/work').description);
    expect(String(mod.metadata.title)).toMatch(/^Work\b.* \| Mahmoud El Bergui$/);
    expect(withoutCta(html(mod.default()))).toBe(PAGE);
  });
});
