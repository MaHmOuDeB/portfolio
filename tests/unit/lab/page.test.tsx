// The Lab's two static routes: /lab, four worked examples of what a test can and cannot tell me as
// one reading page (copying the Retention page's structure), and /lab/peeking, the peeking example
// alone for the interview link. Every Figure on them is simulated or computed from values the
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
  ['sample-size', 'Sample size and duration', ['planner', 'duration']],
  ['peeking-at-results', 'Peeking at results', ['peeking']],
  ['split-check', 'Split check', ['srm']],
  ['exaggeration', 'Exaggeration', ['curse']],
] as const;

describe('the Lab page', () => {
  it('has one h1, Lab, and opens with what the examples are for', () => {
    expect([...LAB.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
    expect(LAB).toMatch(/<h1 id="lab-title"[^>]*>Lab<\/h1>/);
    expect(LAB_TITLE).toBe('Lab');
    const opening = text(LAB.slice(0, LAB.indexOf('<nav')));
    expect(opening).toContain('I use these examples to show what a test can and cannot tell me.');
  });

  it('links each example (planner, peeking, split check, exaggeration) with a plain sentence on what it is for', () => {
    const nav = /<nav aria-label="On this page"[^>]*>([\s\S]*?)<\/nav>/.exec(LAB);
    expect(nav).not.toBeNull();
    const items = [...nav![1]!.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]!);
    expect(items).toHaveLength(ORDER.length);
    items.forEach((item, i) => {
      const [id, title] = ORDER[i]!;
      const link = /<a [^>]*href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(item);
      expect(link?.[1]).toBe(id);
      expect(text(link![2]!)).toBe(title);
      expect(item, id).toContain('data-touch-target=""');
      // the purpose: a sentence of its own after the link, plain words, no number
      const purpose = text(item.slice(item.indexOf('</a>')));
      expect(purpose, id).toMatch(/^[A-Z][^.]{20,}\.$/);
      expect(purpose, id).not.toMatch(/\d/);
      expect(purpose).toBe(LAB_SECTIONS[i]!.purpose);
    });
    expect(LAB_SECTIONS.map((s) => s.figure)).toEqual(['planner', 'peeking', 'srm', 'curse']);
  });

  it('puts one section per example in that order, each named by its h2 and holding its Figures, then the limits', () => {
    const sections = [...LAB.matchAll(/<section id="([^"]+)" aria-labelledby="([^"]+)"[^>]*>\s*<h2 id="([^"]+)"[^>]*>([^<]+)<\/h2>/g)].map((m) => [
      m[1],
      m[2],
      m[3],
      decode(m[4]!),
    ]);
    expect(sections.map(([id, , , title]) => [id, title])).toEqual([...ORDER.map(([id, title]) => [id, title]), ['limits', 'Limits']]);
    for (const [id, labelledBy, headingId] of sections) {
      expect(labelledBy).toBe(`${id}-title`);
      expect(headingId).toBe(`${id}-title`);
    }
    for (const [id, , ids] of ORDER) {
      const s = section(LAB, id);
      expect([...s.matchAll(/<figure [^>]*data-figure="([^"]+)"/g)].map((m) => m[1]), id).toEqual([...ids]);
    }
    expect(figures(LAB).map((f) => f.id)).toEqual(['planner', 'duration', 'peeking', 'srm', 'curse']);
    // no anchor of a section is a Figure id, so both can be linked
    for (const [id] of ORDER) expect(figures(LAB).map((f) => f.id)).not.toContain(id);
    // every h2 is a section title, and nothing skips from h1 to h3
    expect([...LAB.matchAll(/<h2[\s>]/g)]).toHaveLength(ORDER.length + 1);
  });

  it('reads as one page: prose in the readable column, no grid of cards, no animation of its own', () => {
    const own = LAB.replace(/<figure [\s\S]*?<\/figure>/g, '');
    expect(own).not.toMatch(/grid-cols-|rounded-lg|shadow|card/);
    expect(own).not.toMatch(/animate-|transition|fade|slide-in/);
    expect(LAB.slice(0, LAB.indexOf('<section'))).toMatch(/class="max-w-text"/);
    expect(section(LAB, 'limits')).toMatch(/class="max-w-text/);
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

  it('passes the truth audit, and says nothing of the live test, Audible or its metrics', () => {
    expect(audit(LAB, '/lab')).toEqual([]);
    expect(LAB).not.toMatch(/data-experiment|data-live|data-phase/);
    const all = `${text(LAB)} ${[...LAB.matchAll(/aria-label="([^"]*)"/g)].map((m) => decode(m[1]!)).join(' ')}`;
    expect(all).not.toMatch(/Audible|revenue|listening minutes|churn|ILTV|Live from this site|AI-powered|passionate|rockstar/i);
    expect(all).not.toMatch(/\barm\b|per arm/i);
  });
});

describe('the peeking page', () => {
  it('is the same peeking Figure, id peeking, under the heading Lab, with a link back to the Lab', () => {
    expect([...PEEKING.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
    expect(PEEKING).toMatch(/<h1 id="lab-title"[^>]*>Lab<\/h1>/);
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
