// The stray-number truth audit. It parses every built page under .next/server/app and fails on any
// numeral that is not inside a data-fact / data-derived marker, not a fact display in the head and
// not allowed by truth-audit.allow.ts; on an unknown fact id or a bad derived ref; on a deny-listed
// term; and on a banned phrase.
//
//   npm run build && npm run truth:audit
//
// The deny-list comes from TRUTH_DENYLIST (newline-separated). A finding names a deny-list term
// only by its 1-based index, never by its text, because the CI logs are public. In CI a missing or
// empty TRUTH_DENYLIST fails the audit; locally it is skipped with a notice.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import { FACTS, FACT_DISPLAYS } from '../src/lib/facts/facts.generated.ts';
import { SOURCE_IDS } from '../src/lib/facts/types.ts';
import { ALLOW } from './truth-audit.allow.ts';

export type FindingKind = 'stray-number' | 'unknown-fact' | 'bad-derived' | 'denylisted' | 'banned-phrase';
export type Finding = { route: string; kind: FindingKind; detail: string }; // detail never contains a deny-list term
export type AuditContext = {
  route: string;
  factIds: ReadonlySet<string>;
  factDisplays: readonly string[];
  denylist: readonly string[];
};

const NUMBER = /\d[\d.,]*/g;
const BANNED = /\bAI-powered\b|\bpassionate\b|\brockstar\b/gi;
const SKIPPED = new Set(['script', 'style', 'template']);
const SCANNED_ATTRS = ['aria-label', 'aria-valuetext', 'alt', 'title', 'placeholder'];
const DERIVED_KEYWORDS = new Set(['simulated', 'live', 'build', ...SOURCE_IDS.map((id) => `source:${id}`)]);
const HTML_NS = 'http://www.w3.org/1999/xhtml';
const ALLOW_GLOBAL = ALLOW.map((a) => ({
  ...a,
  pattern: new RegExp(a.pattern.source, a.pattern.flags.includes('g') ? a.pattern.flags : `${a.pattern.flags}g`),
}));

// 'marked': under a data-fact / data-derived element, so every number is covered.
// 'display': head text (title, meta), where a number is covered by an occurrence of a fact display.
type Cover = 'marked' | 'display' | 'none';
type Span = readonly [start: number, end: number];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const contains = (spans: readonly Span[], start: number, end: number) =>
  spans.some(([s, e]) => s <= start && end <= e);

function displaySpans(text: string, displays: readonly string[]): Span[] {
  const spans: Span[] = [];
  for (const d of displays) {
    if (d === '') continue;
    for (let i = text.indexOf(d); i !== -1; i = text.indexOf(d, i + 1)) spans.push([i, i + d.length]);
  }
  return spans;
}

function allowSpans(text: string, route: string): Span[] {
  return ALLOW_GLOBAL.filter((a) => a.routes === undefined || a.routes.includes(route)).flatMap((a) =>
    [...text.matchAll(a.pattern)].map((m): Span => [m.index, m.index + m[0].length]),
  );
}

// Deny-list matching ignores case and treats any run of whitespace (U+00A0 included) as one space.
const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');

function redact(detail: string, denylist: readonly string[]): string {
  return denylist.reduce((out, term, i) => {
    const t = normalize(term).trim();
    if (t === '') return out;
    const pattern = new RegExp(escapeRegExp(t).replaceAll(' ', '\\s+'), 'gi');
    return out.replace(pattern, `[deny-list term #${i + 1}]`);
  }, detail);
}

// The label for a meta tag the audit reads, or undefined for any other meta tag.
function metaLabel(attrs: ReadonlyMap<string, string>): string | undefined {
  const name = attrs.get('name')?.toLowerCase();
  const property = attrs.get('property')?.toLowerCase();
  if (name === 'description' || name?.startsWith('twitter:')) return name;
  if (property?.startsWith('og:')) return property;
  return undefined;
}

export function auditHtml(html: string, ctx: AuditContext): Finding[] {
  const findings: Finding[] = [];
  const add = (kind: FindingKind, detail: string) =>
    findings.push({ route: ctx.route, kind, detail: redact(detail, ctx.denylist) });
  const denyHits = new Set<number>();
  const denylist = ctx.denylist.map(normalize);
  const checkDenylist = (text: string) => {
    const t = normalize(text);
    denylist.forEach((term, i) => {
      if (term.trim() !== '' && t.includes(term)) denyHits.add(i);
    });
  };
  const textParts: string[] = [];

  // The deny-list check runs before the early return for marked text.
  const scan = (text: string, where: string, cover: Cover) => {
    checkDenylist(text);
    for (const m of text.matchAll(BANNED)) add('banned-phrase', `"${m[0]}" in ${where}`);
    if (cover === 'marked') return;
    for (const m of text.matchAll(NUMBER)) {
      const token = m[0].replace(/[.,]+$/, '');
      const start = m.index;
      const end = start + token.length;
      if (cover === 'display' && contains(displaySpans(text, ctx.factDisplays), start, end)) continue;
      if (contains(allowSpans(text, ctx.route), start, end)) continue;
      add('stray-number', `"${token}" in ${where}`);
    }
  };

  // Validates the element's markers and reports whether it carries one.
  const checkMarkers = (attrs: ReadonlyMap<string, string>): boolean => {
    const fact = attrs.get('data-fact');
    const derived = attrs.get('data-derived');
    if (fact !== undefined && !ctx.factIds.has(fact)) add('unknown-fact', `data-fact "${fact}"`);
    if (derived !== undefined) {
      const refs = derived.split(/\s+/).filter(Boolean);
      const bad = refs.filter((r) => !ctx.factIds.has(r) && !DERIVED_KEYWORDS.has(r));
      if (refs.length === 0) add('bad-derived', 'data-derived is empty');
      else if (bad.length > 0) add('bad-derived', `data-derived "${bad.join(' ')}"`);
    }
    return fact !== undefined || derived !== undefined;
  };

  const walk = (parent: T.ParentNode, marked: boolean, inTitle: boolean) => {
    for (const node of parent.childNodes) {
      if (node.nodeName === '#text') {
        const text = (node as T.TextNode).value;
        textParts.push(text);
        if (inTitle) scan(text, '<title>', 'display');
        else scan(text, 'text', marked ? 'marked' : 'none');
        continue;
      }
      // Comments and the doctype have no tagName; template content is not in childNodes.
      if (!('tagName' in node) || SKIPPED.has(node.tagName)) continue;
      const el = node as T.Element;
      const attrs = new Map(el.attrs.map((a) => [a.name, a.value]));
      const covered = checkMarkers(attrs) || marked;
      for (const name of SCANNED_ATTRS) {
        const value = attrs.get(name);
        if (value !== undefined) scan(value, name, covered ? 'marked' : 'none');
      }
      const label = el.tagName === 'meta' ? metaLabel(attrs) : undefined;
      const content = attrs.get('content');
      if (label !== undefined && content !== undefined) scan(content, `meta ${label}`, 'display');
      walk(el, covered, el.tagName === 'title' && el.namespaceURI === HTML_NS);
    }
  };

  // scriptingEnabled: false parses <noscript> content as markup instead of raw text.
  walk(parse(html, { scriptingEnabled: false }), false, false);
  // A term split across nodes (inline markup, React's <!-- --> separators) is caught in the joined
  // text; one that ships outside scanned text (RSC payload, JSON-LD, href slugs) in the raw HTML.
  checkDenylist(textParts.join(''));
  checkDenylist(html);
  for (const i of [...denyHits].sort((a, b) => a - b)) add('denylisted', `deny-list term #${i + 1}`);
  return findings;
}

// Maps ".next/server/app/work/retention.html" to "/work/retention" and "index.html" to "/".
export function routeOf(file: string): string {
  const posix = file.replaceAll('\\', '/');
  const at = posix.lastIndexOf('server/app/');
  const rel = (at === -1 ? posix : posix.slice(at + 'server/app/'.length)).replace(/\.html$/, '');
  return rel === 'index' ? '/' : `/${rel}`;
}

export function parseDenylist(raw: string | undefined): string[] {
  return (raw ?? '')
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => t !== '');
}

function main(): number {
  // An unset Actions secret arrives as an empty string, so empty counts as missing.
  const denylist = parseDenylist(process.env.TRUTH_DENYLIST);
  if (denylist.length === 0) {
    if (process.env.CI === 'true') {
      console.error('TRUTH_DENYLIST missing in CI');
      return 1;
    }
    console.log('deny-list skipped (no TRUTH_DENYLIST)');
  }
  const appDir = join(process.cwd(), '.next/server/app');
  const pages = existsSync(appDir)
    ? readdirSync(appDir, { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.html'))
        .sort()
    : [];
  if (pages.length === 0) {
    console.error('no built pages under .next/server/app (run npm run build first)');
    return 1;
  }
  const factIds = new Set(Object.keys(FACTS));
  const findings = pages.flatMap((p) =>
    auditHtml(readFileSync(join(appDir, p), 'utf8'), { route: routeOf(p), factIds, factDisplays: FACT_DISPLAYS, denylist }),
  );
  for (const f of findings) console.log(`${f.route} ${f.kind} ${f.detail}`);
  if (findings.length > 0) return 1;
  console.log(`truth audit: ${pages.length} pages, 0 findings`);
  return 0;
}

if (process.argv[1]?.endsWith('truth-audit.ts')) process.exit(main());
