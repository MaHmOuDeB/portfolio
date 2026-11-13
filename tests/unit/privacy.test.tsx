// The privacy page, rendered to static HTML. Every sentence that states a fact about the code is
// tied to a test: here for the copy and its numbers, in privacy-claims.test.ts for what the code
// stores and sends, and in tests/e2e/privacy-claims.spec.ts for what a browser sees.
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import { LAUNCH_FACTS, PRIVACY, type PrivacyBlock } from '../../content/privacy.ts';
import { EXPERIMENT } from '../../src/experiment.values.ts';
import { CONTACT, SITE } from '../../src/lib/site.ts';
import PrivacyPage, { metadata } from '../../src/app/privacy/page.tsx';
import { auditHtml } from '../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS } from '../../src/lib/facts/facts.generated.ts';

const HEADINGS = [
  'Who is responsible',
  'What a page view sends',
  'What the script reads in your browser',
  'Cookies and storage',
  'Your IP address and browser type',
  'Purposes and legal bases',
  'Who processes the data',
  'How long',
  'Your rights',
  'Changes',
];

const html = renderToStaticMarkup(<PrivacyPage />);
const doc = parse(html);

function elements(node: T.ParentNode, out: T.Element[] = []): T.Element[] {
  for (const child of node.childNodes) {
    if ('tagName' in child) {
      out.push(child as T.Element);
      elements(child as T.Element, out);
    }
  }
  return out;
}
function text(node: T.ParentNode): string {
  return node.childNodes.map((c) => (c.nodeName === '#text' ? (c as T.TextNode).value : 'childNodes' in c ? text(c as T.ParentNode) : '')).join('');
}
const attr = (el: T.Element, name: string) => el.attrs.find((a) => a.name === name)?.value;
const all = elements(doc);
const pageText = text(doc);

/** The text of each section: from its h2 to the next one. */
function sectionText(heading: string): string {
  const section = all.find((el) => el.tagName === 'section' && all.some((h) => h.tagName === 'h2' && text(h) === heading && el.childNodes.includes(h)));
  if (section === undefined) throw new Error(`no section for ${heading}`);
  return text(section);
}

/** Legal citations, protocol names and years: numerals that are not claims. */
const CITATION = /Art\. \d+(?:\(\d+\))*(?:\([a-z]\))?|§\d+\(\d+\) No\. \d+|IPv[46]|\b20(?:0[89]|[12]\d|30)\b/g;

/** Numerals in text nodes under no data-derived or time element, outside citations. */
function unmarkedNumerals(node: T.ParentNode, marked = false, out: string[] = []): string[] {
  for (const child of node.childNodes) {
    if (child.nodeName === '#text') {
      if (marked) continue;
      const value = (child as T.TextNode).value;
      const covered = [...value.matchAll(CITATION)].map((m) => [m.index, m.index + m[0].length] as const);
      for (const m of value.matchAll(/\d[\d.,]*/g)) {
        if (!covered.some(([a, b]) => a <= m.index && m.index < b)) out.push(`${m[0]} in "${value.trim().slice(0, 80)}"`);
      }
    } else if ('tagName' in child) {
      const el = child as T.Element;
      unmarkedNumerals(el, marked || el.tagName === 'time' || attr(el, 'data-derived') !== undefined, out);
    }
  }
  return out;
}

describe('the privacy page', () => {
  it('is titled Privacy, with one h1 and the ten sections in order', () => {
    expect(metadata.title).toBe('Privacy');
    expect(all.filter((el) => el.tagName === 'h1').map(text)).toEqual(['Privacy']);
    expect(all.filter((el) => el.tagName === 'h2').map(text)).toEqual(HEADINGS);
    expect(PRIVACY.sections.map((s) => s.heading)).toEqual(HEADINGS);
  });

  it('names the providers, the legal bases and the browser signals it honours', () => {
    for (const needle of ['Frankfurt', 'Art. 6(1)(f)', 'Art. 11(2)', 'TDDDG', 'Vercel', 'Upstash', 'LinkedIn', 'Global Privacy Control', 'Do Not Track']) {
      expect(pageText, needle).toContain(needle);
    }
  });

  it('says none of the banned or overclaiming words, and no phone or street address', () => {
    for (const banned of [/anonymous IP/i, /cookie banner/i, /AI[\s-]*powered/i, /passionate/i, /\banonymous\b/i]) {
      expect(pageText, String(banned)).not.toMatch(banned);
    }
    // A phone number: a plus or a leading zero followed by at least seven digits (spaces allowed).
    expect(pageText).not.toMatch(/(?:\+|\b0)\d[\d\s/-]{6,}\d/);
    // A street address: a German or English street word followed by a house number, or a postcode.
    expect(pageText).not.toMatch(/(?:stra(?:ss|ß)e|str\.|weg|allee|platz|street|road|avenue)\s*\d/i);
    expect(pageText).not.toMatch(/\b\d{5}\s+Berlin\b/);
  });

  it('shows the controller exactly as the site data gives it: name, city and LinkedIn, and no placeholder', () => {
    const who = sectionText('Who is responsible');
    expect(who).toContain(SITE.name);
    expect(who).toContain(SITE.city);
    expect(who).toContain('You can reach me through my LinkedIn profile:');
    expect(who).toContain('linkedin.com/in/');
    const section = all.find((el) => el.tagName === 'section' && text(el) === who)!;
    expect(elements(section).some((el) => attr(el, 'data-launch-placeholder') !== undefined)).toBe(false);
    const links = elements(section).filter((el) => el.tagName === 'a');
    expect(links.map((a) => attr(a, 'href'))).toEqual([CONTACT.linkedin]);
    expect(links.map((a) => text(a))).toEqual(['linkedin.com/in/melbergui']);
  });

  it('says exactly how messages are handled', () => {
    const paragraphs = all.filter((el) => el.tagName === 'p').map((el) => text(el));
    for (const sentence of [
      'Replying to your messages: Art. 6(1)(b) GDPR when we talk about a job, and Art. 6(1)(f) GDPR otherwise.',
      'Messages you send me on LinkedIn are processed by LinkedIn under its own terms.',
      'Messages: deleted when the conversation is over, unless I need to keep them.',
      'You can reach me through my LinkedIn profile:',
    ]) {
      expect(paragraphs, sentence).toContain(sentence);
    }
  });

  it('marks every numeral as derived from the build or as a time, except legal citations', () => {
    // The unit-level rule: only <data data-derived> and <time> carry numbers...
    expect(unmarkedNumerals(doc)).toEqual([]);
    // ...and the built-page truth audit accepts the page as it is.
    const findings = auditHtml(html, { route: '/privacy', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] });
    expect(findings).toEqual([]);
    for (const el of all.filter((e) => attr(e, 'data-derived') !== undefined)) expect(attr(el, 'data-derived')).toBe('build');
  });

  it('derives its numbers from the pre-registered configuration', () => {
    const derived = all.filter((el) => el.tagName === 'data' && attr(el, 'data-derived') === 'build').map((el) => Number(attr(el, 'value')));
    const allowed = new Set([
      EXPERIMENT.pvTtlSeconds / 60,
      EXPERIMENT.rateLimit.keyTtlSeconds / 60,
      EXPERIMENT.guardrail.quickExitSeconds,
      EXPERIMENT.smallCellBelow,
      EXPERIMENT.smallCellBelow - 1,
    ]);
    expect(derived.length).toBeGreaterThan(0);
    for (const v of derived) expect(allowed.has(v), String(v)).toBe(true);
    expect(derived).toContain(EXPERIMENT.pvTtlSeconds / 60);
    expect(derived).toContain(EXPERIMENT.rateLimit.keyTtlSeconds / 60);
    // The per-view id's lifetime is said in the section on what a view sends, and the hash's in the
    // section on the IP address.
    expect(sectionText('What a page view sends')).toContain(`${EXPERIMENT.pvTtlSeconds / 60} minutes`);
    expect(sectionText('Your IP address and browser type')).toContain(`${EXPERIMENT.rateLimit.keyTtlSeconds / 60} minutes`);
  });

  it('dates this version in a <time> element', () => {
    const times = all.filter((el) => el.tagName === 'time');
    expect(times.map((t) => attr(t, 'dateTime') ?? attr(t, 'datetime'))).toEqual([PRIVACY.updatedOn]);
    const [y, m, d] = PRIVACY.updatedOn.split('-');
    expect(text(times[0]!)).toBe(`${d}.${m}.${y}`);
    expect(sectionText('Changes')).toContain(`${d}.${m}.${y}`);
  });

  it('presents the right to object in its own paragraph, with how to use it', () => {
    const rights = all.find((el) => el.tagName === 'section' && all.some((h) => h.tagName === 'h2' && text(h) === 'Your rights' && el.childNodes.includes(h)))!;
    const objection = elements(rights).filter((el) => el.tagName === 'p' && /object at any time/.test(text(el)));
    expect(objection).toHaveLength(1);
    expect(text(objection[0]!)).toMatch(/Art\. 6\(1\)\(f\) GDPR \(Art\. 21 GDPR\)/);
    expect(text(objection[0]!)).toBe(
      'You can object at any time to processing based on Art. 6(1)(f) GDPR (Art. 21 GDPR). For the experiment, the simplest way is to have your browser send Global Privacy Control or Do Not Track; otherwise send me a message on LinkedIn.',
    );
    expect(text(objection[0]!)).not.toMatch(/Art\. 15/);
  });

  it('says what the script reads as the code does, and never that the referrer stays in the browser', () => {
    const reads = sectionText('What the script reads in your browser');
    for (const needle of ["the page's own address", 'presses of a mouse button or a finger', 'scrolling', 'key presses', 'touches', "reads the link's address"]) {
      expect(reads, needle).toContain(needle);
    }
    expect(reads).not.toMatch(/clicks on links/);
    expect(pageText).not.toMatch(/stay in your browser/);
    expect(sectionText('What a page view sends')).toContain('The script does not send the referring site or the address of a link you click');
  });

  it('quotes the published small-cell value exactly', () => {
    expect(sectionText('How long')).toContain(`is shown as "<${EXPERIMENT.smallCellBelow}"`);
  });

  it('has no arrow, middle dot or emoji in its copy', () => {
    expect(pageText).not.toMatch(/[←-⇿⟰-⟿⤀-⥿]|->|=>/);
    expect(pageText).not.toMatch(/[·•⋅‧]/);
    expect(pageText).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('says group, never arm', () => {
    expect(pageText).not.toMatch(/\barms?\b/i);
  });

  it('shows a launch placeholder exactly for each fact that is still unverified', () => {
    const shown = all.filter((el) => attr(el, 'data-launch-placeholder') !== undefined).map((el) => attr(el, 'data-launch-placeholder'));
    const unverified = LAUNCH_FACTS.filter((f) => f.verified === null).map((f) => f.id);
    expect([...shown].sort()).toEqual([...unverified].sort());
    // A placeholder names a known fact, and a verified fact never shows one.
    const blocks: PrivacyBlock[] = PRIVACY.sections.flatMap((s) => s.paragraphs.flat());
    for (const b of blocks) {
      if (typeof b === 'object' && 'launchPlaceholder' in b) {
        const fact = LAUNCH_FACTS.find((f) => f.id === b.launchPlaceholder);
        expect(fact, b.launchPlaceholder).toBeDefined();
        expect(fact!.verified, b.launchPlaceholder).toBeNull();
      }
    }
  });

  it('records the source and date of every verified fact', () => {
    for (const f of LAUNCH_FACTS.filter((x) => x.verified !== null)) {
      expect(f.verified!.on, f.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.verified!.source.length, f.id).toBeGreaterThan(10);
    }
  });

  it('links only to LinkedIn or this site, and loads nothing itself', () => {
    for (const a of all.filter((el) => el.tagName === 'a')) {
      const href = attr(a, 'href') ?? '';
      expect(href === CONTACT.linkedin || href.startsWith('/') || href.startsWith('#'), href).toBe(true);
    }
    for (const el of all) expect(['img', 'iframe', 'script', 'link'].includes(el.tagName), el.tagName).toBe(false);
  });
});
