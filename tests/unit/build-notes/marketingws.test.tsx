// The MarketingWS build note: a short page in the build-note template (the problem, the
// architecture as a diagram, how I checked it, the outcome, the limits, then the code and the demo).
// The copy is pinned word for word, so any change to it is a deliberate change here. The page prints
// no figure, links the repository at pinned commits, keeps the demo's free-tier note beside the demo
// link, and loads nothing from another site.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MARKETINGWS_SECTIONS, MARKETINGWS_TITLE, MarketingwsPage } from '@/components/marketingws/MarketingwsPage';
import { FACTS, FACT_DISPLAYS } from '@/lib/facts';
import { LIVE_ROUTES } from '@/lib/site';
import { lintSource } from '../../../scripts/design-lint.ts';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import {
  GROQ_NOTE,
  MARKETINGWS_COMMIT,
  MARKETINGWS_DEMO,
  MARKETINGWS_REPO,
  MARKETINGWS_THESIS_COMMIT,
} from '../../../content/marketingws.tsx';
import { WORK_GROUPS } from '../../../content/work.tsx';

const repo = join(import.meta.dirname, '../../..');
const ROUTE = '/work/marketingws';

const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** Visible text: tags removed, entities decoded, whitespace collapsed, no space before punctuation. */
const text = (markup: string) =>
  decode(markup.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/ ([.,:;)])/g, '$1')
    .replace(/\( /g, '(')
    .trim();
/** The markup of the section with this id (sections do not nest). */
const section = (markup: string, id: string) => {
  const start = markup.indexOf(`<section id="${id}"`);
  if (start < 0) throw new Error(`no section ${id}`);
  return markup.slice(start, markup.indexOf('</section>', start));
};

const PAGE = renderToStaticMarkup(<MarketingwsPage />);
const PAGE_TEXT = text(PAGE);
const ctx = { route: ROUTE, factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] };

const ORDER = [
  ['problem', 'The problem', 'Problem'],
  ['architecture', 'Architecture', 'Architecture'],
  ['how-i-checked-this', 'How I checked this', 'How I checked this'],
  ['outcome', 'Outcome', 'Outcome'],
  ['limits', 'Limits', 'Limits'],
  ['code-and-demo', 'Code and demo', 'Code and demo'],
] as const;

/** Every visible word of each section, exactly as a visitor reads it. */
const SECTION_TEXT: Record<(typeof ORDER)[number][0], string> = {
  problem:
    "The problem Marketing copy starts from a brief: the campaign, the channel, the tone and the audience. A language model can draft from it, but it can also add figures and promises the brief never gave it. I built MarketingWS for my Master's thesis in 2025 and rebuilt it in 2026. The rebuild drafts social posts, emails and ads from a brief, revises the current draft with the marketer's feedback instead of starting again, and turns figures and promises it cannot support into placeholders.",
  architecture:
    'Architecture The rebuild is a FastAPI service with a web app, deployed on Vercel. The model provider is a setting. Every draft is checked against the brief Brief Campaign type, platform, tone, audience and language. Draft A first draft, a revision of the current draft with feedback, or copy variants from different angles. Check Figures and promises the brief does not support become placeholders such as [X%]; a short model review catches invented features. Translate On request, the current draft in German, French, Spanish, Italian, Portuguese or Dutch, keeping hashtags and placeholders. Output The copy, which the marketer can send back with new feedback. One request, step by step. Translation starts from the current draft rather than writing a new one.',
  'how-i-checked-this':
    'How I checked this Offline tests cover the service and its API with the model replaced by stand-ins, so they run in GitHub Actions without an API key. A separate behavioural evaluation calls the real model: each refinement must change the draft as asked, translations must keep placeholders and hashtags, and the copy variants must differ. It costs model calls, so it is not part of CI.',
  outcome:
    'Outcome The rebuild has been live since September 2026. The thesis version is kept in the repository under its own tag. Professional marketers evaluated the thesis version in two rounds. That evaluation does not cover what the rebuild added: revising the current draft, translating it, the copy variants and the check.',
  limits:
    "Limits The live demo depends on Groq's free tier, so I cannot promise it answers when you try it. The check in code looks for figures and promises; softer claims can slip through the model review. I have no evaluation of the translated copy by native readers, so I make no claim about its quality.",
  'code-and-demo':
    "Code and demo The MarketingWS repository, at the commit this page describes The thesis version, under the tag thesis-2025 The live demo, on another site The live demo depends on Groq's free tier. Without an API key it runs in an offline demo mode; the repository's README explains how to run it locally.",
};

describe('the outline', () => {
  it('has one h1, the name, and the line under it', () => {
    expect([...PAGE.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
    expect(PAGE).toMatch(/<h1 id="marketingws-title"[^>]*>MarketingWS<\/h1>/);
    expect(MARKETINGWS_TITLE).toBe('MarketingWS');
    const intro = PAGE.slice(PAGE.indexOf('</h1>'), PAGE.indexOf('<nav'));
    expect(text(intro)).toBe(
      "My Master's thesis, a generative AI web service for content marketing, rebuilt in 2026 as a live web app.",
    );
  });

  it('has the six build-note sections in order, each named by its own h2', () => {
    const sections = [...PAGE.matchAll(/<section id="([^"]+)" aria-labelledby="([^"]+)"[^>]*>\s*<h2 id="([^"]+)"[^>]*>([^<]+)<\/h2>/g)].map(
      (m) => [m[1], m[2], m[3], decode(m[4]!)],
    );
    expect(sections.map(([id, , , title]) => [id, title])).toEqual(ORDER.map(([id, title]) => [id, title]));
    for (const [id, labelledBy, headingId] of sections) {
      expect(labelledBy).toBe(`${id}-title`);
      expect(headingId).toBe(`${id}-title`);
    }
    expect(MARKETINGWS_SECTIONS.map((s) => s.id)).toEqual(ORDER.map(([id]) => id));
    expect([...PAGE.matchAll(/<h2[\s>]/g)]).toHaveLength(ORDER.length);
  });

  it('has short section links whose targets exist, under a named navigation', () => {
    const nav = /<nav aria-label="On this page"[^>]*>([\s\S]*?)<\/nav>/.exec(PAGE);
    expect(nav).not.toBeNull();
    const links = [...nav![1]!.matchAll(/<a [^>]*href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], text(m[2]!)]);
    expect(links).toEqual(ORDER.map(([id, , label]) => [id, label]));
    expect(PAGE.indexOf('<nav aria-label="On this page"')).toBeLessThan(PAGE.indexOf('<section id="problem"'));
  });

  it('keeps every element id unique, and no anchor equals the Figure id', () => {
    const ids = [...PAGE.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ORDER.map(([id]) => id)).not.toContain('marketingws-steps');
  });

  it('keeps prose in the readable column, and the page itself has no motion', () => {
    for (const [id] of ORDER) expect(section(PAGE, id), id).toMatch(/class="[^"]*max-w-text/);
    const own = PAGE.replace(/<figure [\s\S]*?<\/figure>/g, '');
    expect(own).not.toMatch(/animate-|transition|fade|slide-in/);
    expect(own).not.toMatch(/grid-cols-/);
  });
});

describe('the copy', () => {
  it.each(ORDER.map(([id]) => id))('section %s reads exactly as written', (id) => {
    expect(text(section(PAGE, id))).toBe(SECTION_TEXT[id]);
  });

  it('is a short note of about four hundred words', () => {
    const words = PAGE_TEXT.split(' ').filter((w) => /\w/.test(w)).length;
    expect(words).toBeGreaterThanOrEqual(340);
    expect(words).toBeLessThanOrEqual(480);
  });

  it('lists at least two limits', () => {
    expect([...section(PAGE, 'limits').matchAll(/<li[\s>]/g)].length).toBeGreaterThanOrEqual(2);
  });

  it('opens with the same words as its line in the Work directory', () => {
    const item = WORK_GROUPS.flatMap((g) => g.items).find((i) => i.href === HOME_LINKS.marketingws);
    expect(item?.href).toBe(ROUTE);
    expect(item?.title).toBe(MARKETINGWS_TITLE);
    const description = text(renderToStaticMarkup(<>{item!.description}</>));
    const intro = text(PAGE.slice(PAGE.indexOf('</h1>'), PAGE.indexOf('<nav')));
    expect(description).toBe(`${intro} ${GROQ_NOTE}`);
  });
});

describe('the architecture diagram', () => {
  const figure = /<figure [^>]*data-figure="marketingws-steps"[\s\S]*?<\/figure>/.exec(section(PAGE, 'architecture'))?.[0] ?? '';

  it('is a diagram Figure in the architecture section, after the prose', () => {
    expect(figure).not.toBe('');
    expect([...PAGE.matchAll(/<figure [^>]*data-figure="/g)]).toHaveLength(1);
    const s = section(PAGE, 'architecture');
    expect(s.indexOf('<p')).toBeLessThan(s.indexOf('data-figure="marketingws-steps"'));
    // a diagram: no provenance badge, no controls and no table
    expect(figure).not.toMatch(/data-provenance|<table|data-figure-controls|role="group"/);
  });

  it('draws the steps as an ordered list of text: brief, draft, check, translate, output', () => {
    expect([...figure.matchAll(/data-step="([^"]+)"/g)].map((m) => m[1])).toEqual(['input', 'draft', 'check', 'translate', 'output']);
    const list = /<ol[\s\S]*<\/ol>/.exec(figure)?.[0] ?? '';
    expect([...list.matchAll(/<li[\s>]/g)]).toHaveLength(5);
    // the connectors are drawing only; the list carries the order
    for (const m of figure.matchAll(/<(span|svg)[^>]*data-connector[^>]*>/g)) expect(m[0]).toContain('aria-hidden="true"');
  });
});

describe('links and loading', () => {
  const links = [...PAGE.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ attrs: m[1]!, body: text(m[2]!) }));
  const href = (attrs: string) => /href="([^"]*)"/.exec(attrs)?.[1] ?? '';
  const external = links.filter((l) => !href(l.attrs).startsWith('#'));

  it('links the repository and the thesis version at full commit ids, and the live demo', () => {
    expect(external.map((l) => [href(l.attrs), l.body])).toEqual([
      [`${MARKETINGWS_REPO}/tree/${MARKETINGWS_COMMIT}`, 'The MarketingWS repository, at the commit this page describes'],
      [`${MARKETINGWS_REPO}/tree/${MARKETINGWS_THESIS_COMMIT}`, 'The thesis version, under the tag thesis-2025'],
      [MARKETINGWS_DEMO, 'The live demo, on another site'],
    ]);
    expect(MARKETINGWS_COMMIT).toMatch(/^[0-9a-f]{40}$/);
    expect(MARKETINGWS_THESIS_COMMIT).toMatch(/^[0-9a-f]{40}$/);
  });

  it('makes every link a 44 px target, and marks each external link', () => {
    for (const l of links) expect(l.attrs, l.body).toContain('data-touch-target');
    for (const l of external) expect(l.attrs, l.body).toContain('rel="noopener"');
  });

  it('keeps the free-tier note in the same list item as the demo link', () => {
    const item = /<li>(?:(?!<\/li>)[\s\S])*marketing-ws\.vercel\.app[\s\S]*?<\/li>/.exec(section(PAGE, 'code-and-demo'))?.[0] ?? '';
    expect(text(item)).toBe(`The live demo, on another site ${GROQ_NOTE}`);
  });

  it('embeds and loads nothing: no frame, script, image, media or stylesheet', () => {
    expect(PAGE).not.toMatch(/<(iframe|script|img|video|audio|source|object|embed|link)[\s>]/);
    expect(PAGE).not.toMatch(/\ssrc="/);
  });
});

describe('truth and design', () => {
  it('passes the truth audit', () => {
    expect(auditHtml(`<!doctype html><html><head><title>t</title></head><body>${PAGE}</body></html>`, ctx)).toEqual([]);
  });

  it('prints no number: its only digits are years', () => {
    expect(PAGE_TEXT.replace(/\b20(25|26)\b/g, '')).not.toMatch(/\d/);
  });

  it('passes the source design lint', () => {
    for (const file of ['content/marketingws.tsx', 'src/components/marketingws/MarketingwsPage.tsx', 'src/app/work/marketingws/page.tsx']) {
      expect(lintSource(readFileSync(join(repo, file), 'utf8'), file), file).toEqual([]);
    }
  });
});

describe('the route', () => {
  const route = readFileSync(join(repo, 'src/app/work/marketingws/page.tsx'), 'utf8');

  it('is a plain static page that renders the composition', async () => {
    expect(route).toMatch(/<MarketingwsPage \/>/);
    expect(route).not.toMatch(/revalidate|dynamic|searchParams|cookies\(|headers\(/);
    const mod = (await import('@/app/work/marketingws/page')) as {
      default: () => React.ReactNode;
      metadata: { title?: unknown; description?: unknown };
    };
    expect(mod.metadata.title).toBe('MarketingWS');
    expect(mod.metadata.description).toBe(
      "My Master's thesis, a generative AI web service for content marketing, rebuilt in 2026 as a live web app: how it works, how I checked it and its limits.",
    );
    expect(renderToStaticMarkup(<>{mod.default()}</>)).toBe(PAGE);
  });

  it('ships: the route is one of the live routes', () => {
    expect(LIVE_ROUTES).toContain(ROUTE);
  });
});
