// The German privacy notice: the English notice's outline, anchors, numbers and version date, in
// German, with exactly two additions of its own (the English version is binding, and the language
// choice is stored nowhere and read from no header). The registry of German pages is mocked with the
// pages the notice links to.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n/pages', () => ({ DE_PAGES: ['/', '/privacy', '/contact'] }));

import { LAUNCH_FACTS, PRIVACY_EN, type PrivacyBlock } from '../../../content/privacy.ts';
import { PRIVACY_DE } from '../../../content/de/privacy.ts';
import { CONTACT_DE } from '../../../content/de/contact.ts';
import { CONTACT } from '../../../src/lib/site.ts';
import EnglishPrivacyPage from '../../../src/app/(en)/privacy/page.tsx';
import GermanPrivacyPage, { metadata } from '../../../src/app/de/privacy/page.tsx';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS_DE } from '../../../src/lib/facts/facts.generated.ts';

const ROOT = resolve(import.meta.dirname, '../../..');

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

const html = renderToStaticMarkup(<GermanPrivacyPage />);
const all = elements(parse(html));
const pageText = text(parse(html));
const enAll = elements(parse(renderToStaticMarkup(<EnglishPrivacyPage />)));

/** The text of the section whose h2 has this id. */
function sectionText(id: string): string {
  const section = all.find((el) => el.tagName === 'section' && el.childNodes.some((h) => 'tagName' in h && h.tagName === 'h2' && attr(h as T.Element, 'id') === id));
  if (section === undefined) throw new Error(`no section ${id}`);
  return text(section);
}

/** German legal citations, protocol names and years: numerals that are not claims. */
const CITATION = /\b20(?:0[89]|[12]\d|30)\b|Art\.[  ]\d+(?:[  ]Abs\.[  ]\d+)?(?:[  ]lit\.[  ][a-z])?|§[  ]\d+(?:[  ]Abs\.[  ]\d+)?(?:[  ]Nr\.[  ]\d+)?|IPv[46]/g;

function unmarkedNumerals(nodes: T.ChildNode[], marked = false, out: string[] = []): string[] {
  for (const child of nodes) {
    if (child.nodeName === '#text') {
      if (marked) continue;
      const value = (child as T.TextNode).value;
      const covered = [...value.matchAll(CITATION)].map((m) => [m.index, m.index + m[0].length] as const);
      for (const m of value.matchAll(/\d[\d.,]*/g)) {
        if (!covered.some(([a, b]) => a <= m.index && m.index < b)) out.push(`${m[0]} in "${value.trim().slice(0, 80)}"`);
      }
    } else if ('tagName' in child) {
      const el = child as T.Element;
      unmarkedNumerals(el.childNodes, marked || el.tagName === 'time' || attr(el, 'data-derived') !== undefined, out);
    }
  }
  return out;
}

/** A block's shape without its words: what must be the same in both languages. */
function shape(block: PrivacyBlock): string {
  if (typeof block === 'string') return 'text';
  if ('derived' in block) return `derived:${block.derived}:${block.unit}`;
  if ('link' in block) return `link:${block.link.href}:${block.link.external ?? false}`;
  if ('updatedOn' in block) return 'updatedOn';
  return `placeholder:${block.launchPlaceholder}`;
}
/** A paragraph's shape: its blocks' shapes, with neighbouring text pieces merged. */
const paragraphShape = (p: PrivacyBlock[]) => p.map(shape).filter((s, i, a) => !(s === 'text' && a[i - 1] === 'text'));

const BINDING = 'Diese Seite ist eine Übersetzung der englischen Fassung. Wo beide voneinander abweichen, ist die englische Fassung maßgeblich.';
const LANGUAGE =
  'Diese Website speichert Ihre Sprachwahl weder in einem Cookie noch im Speicher Ihres Browsers. Die Links „English“ und „Deutsch“ sind gewöhnliche Links. Diese Website wertet die Spracheinstellung, die Ihr Browser mit jeder Anfrage mitsendet, nicht aus; welche Sprache Sie sehen, hängt allein von der Adresse ab.';

describe('the German privacy page', () => {
  it('is titled Datenschutz, with one two-tone h1', () => {
    expect(metadata.title).toBe('Datenschutz | Mahmoud El Bergui');
    expect(all.filter((el) => el.tagName === 'h1').map(text)).toEqual([`${PRIVACY_DE.title}: ${PRIVACY_DE.quiet}`]);
    expect(PRIVACY_DE.title).toBe('Datenschutz');
    const quiet = all.find((el) => el.tagName === 'span' && attr(el, 'data-quiet') !== undefined)!;
    expect(text(quiet)).toBe(PRIVACY_DE.quiet);
  });

  it('keeps the English page and its copy in step: the head and the section links read PRIVACY_EN', () => {
    expect(enAll.find((el) => el.tagName === 'nav' && attr(el, 'aria-label') === PRIVACY_EN.navLabel)).toBeDefined();
    const quiet = enAll.find((el) => el.tagName === 'span' && attr(el, 'data-quiet') !== undefined)!;
    expect(text(quiet)).toBe(PRIVACY_EN.quiet);
    expect(enAll.filter((el) => el.tagName === 'h1').map(text)).toEqual([`${PRIVACY_EN.title}: ${PRIVACY_EN.quiet}`]);
    expect(enAll.some((el) => text(el) === PRIVACY_EN.chip && attr(el, 'data-chip') !== undefined)).toBe(true);
  });

  it('has the English outline and anchors, with German headings in the section links', () => {
    const ids = (els: T.Element[]) => els.filter((el) => el.tagName === 'h2').map((h) => attr(h, 'id'));
    expect(ids(all)).toEqual(ids(enAll));
    expect(ids(all)).toContain('contact-form');
    const nav = all.find((el) => el.tagName === 'nav')!;
    expect(attr(nav, 'aria-label')).toBe('Abschnitte');
    expect(attr(nav, 'data-section-nav')).toBe('');
    const links = elements(nav).filter((el) => el.tagName === 'a');
    expect(links.map(text)).toEqual(PRIVACY_DE.sections.map((s) => s.heading));
    expect(links.map((a) => attr(a, 'href'))).toEqual(ids(all).map((id) => `#${id}`));
    const order = all.filter((el) => el.tagName === 'h1' || el === nav || el.tagName === 'section');
    expect(order.slice(0, 3).map((el) => el.tagName)).toEqual(['h1', 'nav', 'section']);
    for (const section of all.filter((el) => el.tagName === 'section')) expect(attr(section, 'data-rule')).toBe('');
  });

  it('says what the English notice says, block for block, plus exactly its two additions', () => {
    expect(PRIVACY_DE.sections).toHaveLength(PRIVACY_EN.sections.length);
    PRIVACY_EN.sections.forEach((en, i) => {
      const de = PRIVACY_DE.sections[i]!;
      expect(de.paragraphs.map(paragraphShape), en.heading).toEqual(en.paragraphs.map(paragraphShape));
      expect(en.extra, en.heading).toBeUndefined();
    });
    const withExtra = PRIVACY_DE.sections.filter((s) => s.extra !== undefined).map((s) => s.id);
    expect(withExtra).toEqual(['cookies-and-storage', 'changes']);
    expect(sectionText('changes')).toContain(BINDING);
    expect(sectionText('cookies-and-storage')).toContain(LANGUAGE);
  });

  it('shares the English version date, printed dd.mm.yyyy in a <time>', () => {
    expect(PRIVACY_DE.updatedOn).toBe(PRIVACY_EN.updatedOn);
    const times = all.filter((el) => el.tagName === 'time');
    expect(times.map((t) => attr(t, 'datetime') ?? attr(t, 'dateTime'))).toEqual([PRIVACY_EN.updatedOn]);
    const [y, m, d] = PRIVACY_EN.updatedOn.split('-');
    expect(text(times[0]!)).toBe(`${d}.${m}.${y}`);
    expect(sectionText('changes')).toContain(`Diese Fassung ist vom ${d}.${m}.${y}.`);
  });

  it('cites the law in its German form, and names the framework by its official German name', () => {
    for (const needle of [
      'Art. 6 Abs. 1 lit. f DSGVO',
      'Art. 6 Abs. 1 lit. b DSGVO',
      'Art. 11 Abs. 2 DSGVO',
      'Art. 21 DSGVO',
      'Art. 77 DSGVO',
      '§ 25 Abs. 2 Nr. 2 TDDDG',
      'Datenschutzrahmen EU-USA',
      'Standardvertragsklauseln',
      'Berliner Beauftragten für Datenschutz und Informationsfreiheit',
      'Frankfurt',
      'Vercel',
      'Upstash',
      'Resend (Plus Five Five, Inc.)',
      'Gmail',
      'Google Ireland Limited',
      'Google LLC',
      'Global Privacy Control',
      'Do Not Track',
    ]) {
      expect(pageText, needle).toContain(needle);
    }
  });

  it('leaks no English', () => {
    for (const en of [
      ...PRIVACY_EN.sections.map((s) => s.heading),
      'GDPR',
      'Sections',
      'what this site collects',
      'Not confirmed yet',
      'Contact form',
      'minutes',
      'I will',
      'Privacy:',
      'the EU-US Data Privacy Framework',
    ]) {
      expect(pageText, en).not.toContain(en);
    }
  });

  it('marks every numeral as derived from the build or as a time, except legal citations, and passes the audit', () => {
    expect(unmarkedNumerals(parse(html).childNodes)).toEqual([]);
    const findings = auditHtml(`<!doctype html><html lang="de"><head><title>t</title></head><body>${html}</body></html>`, {
      route: '/de/privacy',
      factIds: new Set(Object.keys(FACTS)),
      factDisplays: FACT_DISPLAYS_DE,
      denylist: [],
      pages: ['/', '/privacy', '/contact'],
    });
    expect(findings).toEqual([]);
    const derived = (els: T.Element[]) => els.filter((el) => attr(el, 'data-derived') !== undefined).map((el) => `${attr(el, 'data-derived')}:${attr(el, 'value')}`);
    expect(derived(all)).toEqual(derived(enAll));
  });

  it('links the German contact page and LinkedIn, and loads nothing itself', () => {
    const links = all.filter((el) => el.tagName === 'a').filter((a) => !(attr(a, 'href') ?? '').startsWith('#'));
    expect(links.map((a) => attr(a, 'href'))).toEqual(['/de/contact', CONTACT.linkedin]);
    expect(text(links[0]!)).toBe('Kontaktformular');
    for (const el of all) expect(['img', 'iframe', 'script', 'link'].includes(el.tagName), el.tagName).toBe(false);
    expect(sectionText('your-rights')).toContain('„Datenschutz oder Auskunftsanfrage“');
  });

  it('has a German question for every provider fact, should a placeholder ever show', () => {
    expect(PRIVACY_DE.placeholder.sentence).toContain('{question}');
    expect(PRIVACY_EN.placeholder.sentence).toContain('{question}');
    expect(Object.keys(PRIVACY_DE.placeholder.questions ?? {}).sort()).toEqual(LAUNCH_FACTS.map((f) => f.id).sort());
    expect(all.some((el) => attr(el, 'data-launch-placeholder') !== undefined)).toBe(false);
  });

  it('keeps the house style: formal Sie, German quotes, group never arm, no banned words or marks', () => {
    expect(pageText).toMatch(/\bSie\b/);
    expect(pageText).not.toMatch(/\b(?:du|dich|dir|dein\w*)\b/i);
    expect(pageText).not.toMatch(/"/);
    expect(pageText).not.toMatch(/[–—]/);
    expect(pageText).not.toMatch(/[←-⇿⟰-⟿⤀-⥿]|->|=>/);
    expect(pageText).not.toMatch(/[·•⋅‧]/);
    expect(pageText).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(pageText).not.toMatch(/\barms?\b/i);
    expect(pageText).not.toMatch(/KI-gest|KI-basiert|leidenschaft|rockstar|anonym/i);
    expect(pageText).not.toMatch(/(?:\+|\b0)\d[\d\s/-]{6,}\d/);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.(?:tsx?|mjs|js)$/.test(n) ? [p] : [];
  });
}

describe('"Diese Website speichert Ihre Sprachwahl weder in einem Cookie noch im Speicher Ihres Browsers" and the Accept-Language header is not read', () => {
  it('no source file reads the Accept-Language header or the browser language', () => {
    const files = [...sourceFiles(join(ROOT, 'src')), join(ROOT, 'next.config.ts')];
    const readers = files.filter((f) => /accept-language|navigator\.languages?\b/i.test(readFileSync(f, 'utf8')));
    expect(readers).toEqual([]);
  });

  it('the language links set no cookie and write no storage', () => {
    for (const f of ['src/components/shell/LanguageMenu.tsx', 'src/lib/i18n/language.ts']) {
      expect(readFileSync(join(ROOT, f), 'utf8'), f).not.toMatch(/cookie|localStorage|sessionStorage|indexedDB/i);
    }
  });

  it('quotes the contact form option exactly as the German form labels it', () => {
    const label = CONTACT_DE.form.reasons.privacy;
    expect(JSON.stringify(PRIVACY_DE)).toContain(`„${label}“`);
  });
});
