// Shared readers for the build-note page tests: visible text, one section's markup, the outline and
// the words a visitor reads. The pages are rendered once on the server, as the route serves them.
import { FACTS, FACT_DISPLAYS } from '@/lib/facts';
import { auditHtml } from '../../../scripts/truth-audit.ts';

export const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Visible text: tags removed, entities decoded, whitespace collapsed, no space before punctuation. */
export const text = (markup: string) =>
  decode(markup.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/ ([.,:;)])/g, '$1')
    .replace(/\( /g, '(')
    .trim();

/** The markup of the section with this id (sections do not nest). */
export const section = (markup: string, id: string) => {
  const start = markup.indexOf(`<section id="${id}"`);
  if (start < 0) throw new Error(`no section ${id}`);
  return markup.slice(start, markup.indexOf('</section>', start));
};

/** Each section as [id, aria-labelledby, h2 id, h2 text], in page order. */
export const outline = (markup: string) =>
  [...markup.matchAll(/<section id="([^"]+)" aria-labelledby="([^"]+)"[^>]*>\s*<h2 id="([^"]+)"[^>]*>([^<]+)<\/h2>/g)].map((m): [id: string, labelledBy: string, headingId: string, title: string] => [
    m[1]!,
    m[2]!,
    m[3]!,
    decode(m[4]!),
  ]);

/** The section links under "On this page", as [href, label]. */
export const sectionLinks = (markup: string) => {
  const nav = /<nav aria-label="On this page"[^>]*>([\s\S]*?)<\/nav>/.exec(markup);
  if (!nav) throw new Error('no section links');
  return [...nav[1]!.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m): [href: string, label: string] => [m[1]!, text(m[2]!)]);
};

/** The words of the prose a visitor reads: the article without its diagram and its tables. */
export const proseWords = (markup: string) =>
  text(markup.replace(/<figure [\s\S]*?<\/figure>/g, ' ').replace(/<table[\s\S]*?<\/table>/g, ' '))
    .split(' ')
    .filter((w) => /[A-Za-z0-9]/.test(w)).length;

export const audit = (markup: string, route: string) =>
  auditHtml(`<!doctype html><html><head><title>t</title></head><body>${markup}</body></html>`, {
    route,
    factIds: new Set(Object.keys(FACTS)),
    factDisplays: FACT_DISPLAYS,
    denylist: [],
  });

/** The build-note sections: problem, architecture, verification, outcome, limits, links. */
export const BUILD_NOTE_SECTIONS = [
  ['problem', 'The problem'],
  ['architecture', 'Architecture'],
  ['how-i-checked-this', 'How I checked this'],
  ['outcome', 'Outcome'],
  ['limits', 'Limits'],
  ['sources', 'Sources and links'],
] as const;

export const BUILD_NOTE_LINKS = ['Problem', 'Architecture', 'How I checked this', 'Outcome', 'Limits', 'Sources'];
