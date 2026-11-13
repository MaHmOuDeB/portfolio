// The site-wide claim rules for the Audible facts, shared by the browser spec (served and hydrated
// HTML), the unit tests (sharing metadata and image text) and the CV PDF test (the PDF's text):
//
// - the number of tests and the number of markets are never in one claim: the tests were web and
//   mobile, the markets belong to the automation tool;
// - a count of teams always says it was over my time there (one team after another);
// - no significance threshold (a "p <" value or the words) appears anywhere.
//
// A claim is the smallest text block a reader takes as one statement: a paragraph, a list item, a
// table cell, a caption, a heading, a label, a meta description, an attribute's text. A layout
// ancestor (body, main, a section, a card) is never one claim, so two neighbouring paragraphs are
// two claims. Pure: no browser and no file access.
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';

const EXPERIMENTS_FACT = 'profile.audible.experiments';
const MARKETS_FACT = 'profile.audible.markets';
const TEAMS_FACT = 'profile.audible.teams';

const NUMBER_WORD = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty-five|several|many|multiple|dozens(?:\\s+of)?)';
/** A count of tests or experiments ("25+ A/B tests", "25+ experiments"). */
const EXPERIMENTS = new RegExp(`(?:\\d[\\d,.]*\\+?|${NUMBER_WORD})\\s+(?:A\\/B\\s+|controlled\\s+|online\\s+)?(?:tests|experiments)\\b`, 'i');
/** A count of markets, marketplaces or countries. */
const MARKETS = new RegExp(`(?:\\d[\\d,.]*\\+?|${NUMBER_WORD})\\s+(?:[\\w-]+\\s+)?(?:markets|marketplaces|countries)\\b`, 'i');
/** A count of teams ("3 teams", "three product teams"). */
const TEAMS = new RegExp(`(?:\\d[\\d,.]*\\+?|${NUMBER_WORD})\\s+(?:[\\w&-]+\\s+){0,2}?teams\\b`, 'i');
/** A count of two teams, which is never a figure the site gives. */
const TWO_TEAMS = /\b(?:2|two)\s+(?:[\w&-]+\s+){0,2}?teams\b/i;
/** The tenure qualifier every team count carries. */
const OVER_TIME = /\bover my time\b|\bover the tenure\b|\bone after another\b|\bafter re-?orgs?\b/i;
/**
 * A significance threshold: "p < 0.05", "p≤.01", "p-value < 0.01", or the words. An equals form is
 * not a threshold; a p-value numeral off the facts path fails the truth audit and the CV numeral join.
 */
const THRESHOLD = /(?:^|[^\w])p\s*(?:-?\s*value)?\s*[<≤]|significance threshold/i;

export type ClaimFinding = { where: string; rule: 'experiments-with-markets' | 'teams-without-tenure' | 'two-teams' | 'significance-threshold'; text: string };

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The rules on one claim's text, and on the fact ids it renders when known. */
export function claimFindings(text: string, where: string, facts: readonly string[] = []): ClaimFinding[] {
  const t = squash(text);
  const out: ClaimFinding[] = [];
  const add = (rule: ClaimFinding['rule']) => out.push({ where, rule, text: t.slice(0, 160) });
  const hasExperiments = facts.includes(EXPERIMENTS_FACT) || EXPERIMENTS.test(t);
  const hasMarkets = facts.includes(MARKETS_FACT) || MARKETS.test(t);
  if (hasExperiments && hasMarkets) add('experiments-with-markets');
  if ((facts.includes(TEAMS_FACT) || TEAMS.test(t)) && !OVER_TIME.test(t)) add('teams-without-tenure');
  if (TWO_TEAMS.test(t)) add('two-teams');
  if (THRESHOLD.test(t)) add('significance-threshold');
  return out;
}

/** Elements whose text is one claim, even when they hold inline markup. */
const CLAIM_TAGS = new Set([
  'p', 'li', 'dt', 'dd', 'td', 'th', 'caption', 'figcaption', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'summary', 'legend', 'label', 'title', 'output', 'button', 'option',
]);
/** Layout elements: never one claim, whatever they hold. */
const LAYOUT_TAGS = new Set(['html', 'head', 'body', 'main', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'figure', 'form', 'fieldset', 'table', 'tbody', 'thead', 'tfoot', 'tr', 'ul', 'ol', 'dl', 'details']);
/** Inline elements: part of the claim around them. */
const INLINE_TAGS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 's', 'samp', 'small',
  'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr',
]);
/** Attributes that carry text a reader or a screen reader gets. */
const TEXT_ATTRIBUTES = ['aria-label', 'aria-description', 'aria-valuetext', 'title', 'alt', 'placeholder'];
/** Meta tags whose content is a claim (search results and link previews). */
const META_NAMES = /^(?:description|og:title|og:description|og:image:alt|twitter:title|twitter:description|twitter:image:alt)$/;

const attr = (el: T.Element, name: string) => el.attrs.find((a) => a.name === name)?.value;
const isElement = (n: T.Node | null | undefined): n is T.Element => !!n && 'tagName' in n;

/**
 * The claim a node's text belongs to: the nearest claim element around it, or else the nearest
 * element that is neither inline nor layout (a div holding a sentence). Text that sits directly in
 * a layout element is a claim of that element's own text only (`loose`).
 */
function claimOf(node: T.Node): { el: T.Element; loose: boolean } | null {
  let n: T.Node | null = isElement(node) ? node : ('parentNode' in node ? (node.parentNode as T.Node | null) : null);
  while (isElement(n)) {
    if (CLAIM_TAGS.has(n.tagName)) return { el: n, loose: false };
    if (LAYOUT_TAGS.has(n.tagName)) return { el: n, loose: true };
    if (!INLINE_TAGS.has(n.tagName)) return { el: n, loose: false };
    n = n.parentNode as T.Node | null;
  }
  return null;
}

function textOf(node: T.ParentNode, ownOnly = false): string {
  let s = '';
  for (const c of node.childNodes) {
    if (c.nodeName === '#text') s += (c as T.TextNode).value;
    else if (ownOnly) continue;
    else if (isElement(c) && c.tagName === 'template') s += ` ${textOf((c as T.Template).content)} `;
    else if (isElement(c) && c.tagName !== 'script' && c.tagName !== 'style') s += ` ${textOf(c)} `;
  }
  return s;
}

function walk(node: T.ParentNode, visit: (n: T.Node) => void) {
  for (const c of node.childNodes) {
    visit(c);
    if (isElement(c)) {
      walk(c, visit);
      if (c.tagName === 'template') walk((c as T.Template).content, visit);
    }
  }
}

/**
 * The rules over one HTML document, hidden markup included (noscript content is parsed as markup,
 * aria-hidden twins and templates are read): every claim with the facts it renders, every text
 * attribute, every meta description and sharing tag, and the title.
 */
export function htmlClaimFindings(html: string, route: string): ClaimFinding[] {
  const doc = parse(html, { scriptingEnabled: false });
  const out: ClaimFinding[] = [];
  const claims = new Map<T.Element, { loose: boolean; facts: Set<string> }>();
  const claim = (c: { el: T.Element; loose: boolean }) => {
    if (!claims.has(c.el)) claims.set(c.el, { loose: c.loose, facts: new Set() });
    return claims.get(c.el)!;
  };
  walk(doc, (n) => {
    if (n.nodeName === '#text') {
      const parent = n.parentNode as T.Node | null;
      if (!/\S/.test((n as T.TextNode).value) || (isElement(parent) && (parent.tagName === 'script' || parent.tagName === 'style'))) return;
      const c = claimOf(n);
      if (c) claim(c);
      return;
    }
    if (!isElement(n)) return;
    const fact = attr(n, 'data-fact');
    if (fact) {
      const c = claimOf(n.parentNode as T.Node);
      if (c) claim(c).facts.add(fact);
    }
    for (const name of TEXT_ATTRIBUTES) {
      const v = attr(n, name);
      if (v) out.push(...claimFindings(v, `${route} ${n.tagName}[${name}]`));
    }
    if (n.tagName === 'meta') {
      const key = attr(n, 'name') ?? attr(n, 'property') ?? '';
      const content = attr(n, 'content');
      if (META_NAMES.test(key) && content) out.push(...claimFindings(content, `${route} meta ${key}`));
    }
  });
  for (const [el, c] of claims) {
    const where = `${route} <${el.tagName}${attr(el, 'id') ? `#${attr(el, 'id')}` : ''}>${c.loose ? ' text' : ''}`;
    out.push(...claimFindings(textOf(el, c.loose), where, c.loose ? [] : [...c.facts]));
  }
  return dedupe(out);
}

function dedupe(list: ClaimFinding[]): ClaimFinding[] {
  const seen = new Set<string>();
  return list.filter((f) => {
    const k = `${f.where}|${f.rule}|${f.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
