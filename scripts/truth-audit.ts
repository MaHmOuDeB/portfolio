// The stray-number truth audit. It parses every built page under .next/server/app and fails on any
// numeral that is not inside a data-fact / data-derived marker, not a fact display in the head and
// not allowed by truth-audit.allow.ts; on an unknown fact id or a bad derived ref; on a deny-listed
// term; on a banned phrase; and on any e-mail address anywhere in the HTML (the site's contact route
// is LinkedIn, so no page carries one). The public client scripts under .next/static are checked
// against the deny-list only: minified code is full of numerals that are not claims.
//
//   npm run build && npm run truth:audit
//
// The deny-list comes from TRUTH_DENYLIST, one term per line. Each line is literal text, never a
// regular expression: it matches as a substring, ignoring case and invisible characters, with any
// run of whitespace matching any other. Write the phrases themselves, not patterns. A finding names
// a deny-list term only by its 1-based index, never by its text, because the CI logs are public. In
// CI a missing or empty TRUTH_DENYLIST fails the audit; locally it is skipped with a notice.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import { KIT_TEXT_EN } from '../src/components/kit/text.ts';
import { SHELL_EN } from '../content/shell.ts';
import { FACTS, FACT_DISPLAYS, FACT_DISPLAYS_DE } from '../src/lib/facts/facts.generated.ts';
import { DE_PAGES } from '../src/lib/i18n/pages.ts';
import { localHrefWith } from '../src/lib/i18n/href.ts';
import { SOURCE_IDS } from '../src/lib/facts/types.ts';
import { ALLOW, ALLOW_DE, FRAMEWORK_ROUTES } from './truth-audit.allow.ts';

export type FindingKind =
  | 'stray-number'
  | 'unknown-fact'
  | 'bad-derived'
  | 'denylisted'
  | 'banned-phrase'
  | 'email-address'
  | 'wrong-lang'
  | 'english-leak'
  | 'bad-link';
export type Finding = { route: string; kind: FindingKind; detail: string }; // route and detail never contain a deny-list term
export type AuditContext = {
  route: string;
  factIds: ReadonlySet<string>;
  factDisplays: readonly string[];
  denylist: readonly string[];
  /** The English paths that have a German twin; the link check reads it (default: the site's list). */
  pages?: readonly string[];
  /**
   * A whole built page, not a fragment: also check `<html lang>` and that a German page has internal
   * links to examine. The build audit sets it; a unit test that audits a rendered component leaves it off.
   */
  document?: boolean;
};

/** A German page: `/de` or anything under it (never `/design`). */
export const isGermanRoute = (route: string) => route === '/de' || route.startsWith('/de/');
/** The fact displays that cover a head number on `route`: the German ones on a German page. */
export const displaysFor = (route: string): readonly string[] => (isGermanRoute(route) ? FACT_DISPLAYS_DE : FACT_DISPLAYS);

const NUMBER = /\d[\d.,]*/g;
// Characters that render as nothing: zero-width space, non-joiner and joiner, word joiner, byte-order
// mark and soft hyphen. They are stripped before matching, so they cannot split a word.
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
const stripInvisible = (s: string) => s.replace(INVISIBLE, '');
// "AI-powered" with a space or any hyphen or dash between the words (U+2010 to U+2015, minus sign).
const BANNED = /\bAI[\s\-\u2010-\u2015\u2212]*powered\b|\bpassionate\b|\brockstar\b/gi;
// The German phrases, on German pages only, in every inflection ("KI-gestützte", "leidenschaftlichen",
// "Rockstars"): "KI" and "gestützt" or "basiert" with a space or any hyphen between them.
const BANNED_DE = /\bKI[\s\-\u2010-\u2015\u2212]*(?:gestützt|basiert)[a-zäöüß]*|\bleidenschaftlich[a-zäöüß]*|\brockstar[a-zäöüß]*/gi;
// An e-mail address: a local part, "@", and a domain whose last label is letters. A package or font
// version ("x@1.2.3"), a CSS at-rule ("@media") or a scoped package name ("/@scope/pkg") does not match.
const EMAIL = /[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b/g;
// A finding shows only the first character of the local part and the domain, never the address.
const maskEmail = (address: string) => {
  const at = address.lastIndexOf('@');
  return `${address[0]}\u2026@${address.slice(at + 1)}`;
};
const SKIPPED = new Set(['script', 'style', 'template']);
const SCANNED_ATTRS = ['aria-label', 'aria-valuetext', 'aria-description', 'aria-roledescription', 'alt', 'title', 'placeholder'];
// The meta tags whose content is text a visitor or a link preview shows; og:image, og:url and the
// like carry URLs and sizes, whose digits are not claims.
const META_TEXT = new Set(['description', 'og:title', 'og:description', 'og:image:alt', 'twitter:title', 'twitter:description', 'twitter:image:alt']);
const DERIVED_KEYWORDS = new Set(['simulated', 'live', 'build', ...SOURCE_IDS.map((id) => `source:${id}`)]);
// Words the English strings share with German on purpose (names, a loan word, and the language menu's own labels).
const LEAK_EXEMPT = new Set(['English', 'Deutsch', 'LinkedIn', 'final']);
const MIN_LEAK = 5;
const SENTINEL = '\u0000';

// The text of a ReactNode built by the kit's `seq`: strings, arrays and fragment children.
function nodeText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  const children = (node as { props?: { children?: unknown } } | null)?.props?.children;
  return children === undefined ? '' : nodeText(children);
}

function collectStrings(value: unknown, out: Set<string>): void {
  if (typeof value === 'string') {
    // A template's placeholders split it: "{n} characters left" leaves " characters left".
    for (const part of value.split(/\{[A-Za-z]+\}/)) out.add(part);
  } else if (typeof value === 'function') {
    try {
      // Every field of the argument is a sentinel, so the sentence falls apart around its values.
      const sentence = nodeText((value as (p: unknown) => unknown)(new Proxy({}, { get: () => SENTINEL })));
      for (const part of sentence.split(SENTINEL)) out.add(part);
    } catch {
      // A sentence that needs a real value is skipped; its plain parts are in the other strings.
    }
  } else if (value !== null && typeof value === 'object' && !('props' in value)) {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
}

let leakCache: readonly string[] | undefined;
/**
 * The English words that must not reach a German page: every string of the kit's English text and the
 * shell's English labels, whole phrases of at least five characters, without the words both languages
 * share. Read from the source objects, so a new English string is covered at once.
 */
export function englishLeakStrings(): readonly string[] {
  if (leakCache === undefined) {
    const all = new Set<string>();
    collectStrings(KIT_TEXT_EN, all);
    collectStrings(SHELL_EN, all);
    leakCache = [...all]
      .map((s) => s.trim())
      .filter((s) => s.length >= MIN_LEAK && /\p{L}{3}/u.test(s) && !LEAK_EXEMPT.has(s))
      .sort();
  }
  return leakCache;
}
const leakPatterns = () =>
  englishLeakStrings().map((s) => ({ s, re: new RegExp(`(?<!\\p{L})${escapeRegExp(s)}(?!\\p{L})`, 'u') }));

const HTML_NS = 'http://www.w3.org/1999/xhtml';
const ALLOW_GLOBAL = ALLOW.map((a) => ({
  ...a,
  pattern: new RegExp(a.pattern.source, a.pattern.flags.includes('g') ? a.pattern.flags : `${a.pattern.flags}g`),
}));

const ALLOW_DE_GLOBAL = ALLOW_DE.map((a) => ({
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
  const entries = isGermanRoute(route) ? [...ALLOW_GLOBAL, ...ALLOW_DE_GLOBAL] : ALLOW_GLOBAL;
  return entries.filter((a) => a.routes === undefined || a.routes.includes(route)).flatMap((a) =>
    [...text.matchAll(a.pattern)].map((m): Span => [m.index, m.index + m[0].length]),
  );
}

// Deny-list matching ignores case and invisible characters, and treats any run of whitespace
// (U+00A0 included) as one space.
const normalize = (s: string) => stripInvisible(s).toLowerCase().replace(/\s+/g, ' ');

/** The 0-based indexes of the deny-list terms (already normalized) that occur in `text`. */
function denyIndexes(text: string, normalizedTerms: readonly string[]): number[] {
  const t = normalize(text);
  return normalizedTerms.flatMap((term, i) => (term.trim() !== '' && t.includes(term) ? [i] : []));
}

function redact(detail: string, denylist: readonly string[]): string {
  return denylist.reduce((out, term, i) => {
    const t = normalize(term).trim();
    if (t === '') return out;
    // The page may hide the term with invisible characters, so they are allowed between its letters.
    const gap = '[\\u200B-\\u200D\\u2060\\uFEFF\\u00AD]*';
    const pattern = new RegExp([...t].map((c) => (c === ' ' ? '\\s+' : escapeRegExp(c))).join(gap), 'gi');
    return out.replace(pattern, `[deny-list term #${i + 1}]`);
  }, detail);
}

// The label for a meta tag the audit reads, or undefined for any other meta tag.
function metaLabel(attrs: ReadonlyMap<string, string>): string | undefined {
  const name = attrs.get('name')?.toLowerCase();
  const property = attrs.get('property')?.toLowerCase();
  return [name, property].find((label) => label !== undefined && META_TEXT.has(label));
}

export function auditHtml(html: string, ctx: AuditContext): Finding[] {
  const findings: Finding[] = [];
  const add = (kind: FindingKind, detail: string) =>
    findings.push({ route: redact(ctx.route, ctx.denylist), kind, detail: redact(detail, ctx.denylist) });
  const denyHits = new Set<number>();
  const denylist = ctx.denylist.map(normalize);
  const checkDenylist = (text: string) => {
    for (const i of denyIndexes(text, denylist)) denyHits.add(i);
  };
  const textParts: string[] = [];
  const german = isGermanRoute(ctx.route);
  const leaks = german ? leakPatterns() : [];
  const pages = ctx.pages ?? DE_PAGES;
  let htmlLang: string | undefined;
  let linksExamined = 0;

  // The deny-list check runs before the early return for marked text.
  const scan = (text: string, where: string, cover: Cover) => {
    checkDenylist(text);
    for (const m of stripInvisible(text).matchAll(BANNED)) add('banned-phrase', `"${m[0]}" in ${where}`);
    if (german) {
      for (const m of stripInvisible(text).matchAll(BANNED_DE)) add('banned-phrase', `"${m[0]}" in ${where}`);
      for (const { s, re } of leaks) if (re.test(text)) add('english-leak', `"${s}" in ${where}`);
    }
    if (cover === 'marked') return;
    for (const m of text.matchAll(NUMBER)) {
      const token = m[0].replace(/[.,]+$/, '');
      const start = m.index;
      const end = start + token.length;
      if (cover === 'display' && contains(displaySpans(text, ctx.factDisplays), start, end)) continue;
      if (contains(allowSpans(text, ctx.route), start, end)) continue;
      if (FRAMEWORK_ROUTES.includes(ctx.route)) continue;
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
      if (el.tagName === 'html') htmlLang = attrs.get('lang');
      // The language menu's English link leaves German on purpose: it says so with hreflang="en".
      const href = el.tagName === 'a' && attrs.get('hreflang') !== 'en' ? attrs.get('href') : undefined;
      if (german && href !== undefined && href.startsWith('/') && !href.startsWith('//')) {
        linksExamined += 1;
        const path = href.split(/[?#]/)[0] ?? href;
        const stays = path === '/de' || path.startsWith('/de/') || localHrefWith(pages, 'de', href) === href;
        if (!stays) add('bad-link', `"${href}" does not stay in German`);
      }
      for (const name of SCANNED_ATTRS) {
        const value = attrs.get(name);
        if (value !== undefined) scan(value, name, covered ? 'marked' : 'none');
      }
      // An input's value is text the visitor sees (the other elements' value is not). A hidden input
      // is form plumbing, such as the JSON React puts in a form action's fields; the raw-HTML
      // deny-list pass still covers its text.
      const isInput = el.tagName === 'input' && attrs.get('type')?.toLowerCase() !== 'hidden';
      const inputValue = isInput ? attrs.get('value') : undefined;
      if (inputValue !== undefined) scan(inputValue, 'value', covered ? 'marked' : 'none');
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
  if (ctx.document && german && linksExamined === 0) add('bad-link', 'no internal links were examined');
  const expectedLang = german ? 'de' : 'en';
  if (ctx.document && !FRAMEWORK_ROUTES.includes(ctx.route) && htmlLang !== expectedLang) {
    add('wrong-lang', `<html lang="${htmlLang ?? ''}">, expected "${expectedLang}"`);
  }
  checkDenylist(textParts.join(''));
  checkDenylist(html);
  for (const i of [...denyHits].sort((a, b) => a - b)) add('denylisted', `deny-list term #${i + 1}`);
  // The raw HTML, so an address in an href, the RSC payload or JSON-LD counts too. Each once.
  for (const address of new Set([...html.matchAll(EMAIL)].map((m) => m[0]))) add('email-address', `"${maskEmail(address)}" in the HTML`);
  return findings;
}

/**
 * The deny-list check alone, for a public client script under .next/static. `route` is the script's
 * public path. A hit is named by its index only, like every other finding.
 */
export function auditScript(js: string, ctx: Pick<AuditContext, 'route' | 'denylist'>): Finding[] {
  return denyIndexes(js, ctx.denylist.map(normalize)).map((i) => ({
    route: redact(ctx.route, ctx.denylist),
    kind: 'denylisted',
    detail: `deny-list term #${i + 1}`,
  }));
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
  const findings: Finding[] = pages.flatMap((p) =>
    auditHtml(readFileSync(join(appDir, p), 'utf8'), { route: routeOf(p), factIds, factDisplays: displaysFor(routeOf(p)), denylist, document: true }),
  );
  // The client scripts are public too; with no deny-list there is nothing to check them for.
  const staticDir = join(process.cwd(), '.next/static');
  const scripts =
    denylist.length > 0 && existsSync(staticDir)
      ? readdirSync(staticDir, { recursive: true, encoding: 'utf8' })
          .filter((f) => f.endsWith('.js'))
          .sort()
      : [];
  for (const s of scripts) {
    const route = `/_next/static/${s.split(sep).join('/')}`;
    findings.push(...auditScript(readFileSync(join(staticDir, s), 'utf8'), { route, denylist }));
  }
  for (const f of findings) console.log(`${redact(f.route, denylist)} ${f.kind} ${redact(f.detail, denylist)}`);
  // Fail closed: with a deny-list, a build without client scripts means the scan did not happen.
  if (denylist.length > 0 && scripts.length === 0) {
    console.error('no client scripts under .next/static to check against the deny-list (run npm run build first)');
    return 1;
  }
  if (scripts.length > 0) console.log(`client scripts: ${scripts.length} checked against the deny-list`);
  if (findings.length > 0) return 1;
  console.log(`truth audit: ${pages.length} pages, 0 findings`);
  return 0;
}

if (process.argv[1]?.endsWith('truth-audit.ts')) process.exitCode = main();
