// The German SEO data, the language-aware page metadata and the sitemap's twins.
import { DE_PAGES } from '@/lib/i18n/pages';
import { describe, expect, it } from 'vitest';
import { factText } from '@/lib/facts/text';
import { pageMetadata } from '@/lib/seo/metadata';
import { seoEntries, seoEntryFor } from '@/lib/seo/entries';
import { sitemapEntries } from '@/lib/seo/sitemap';
import { SITE } from '@/lib/site';
import { OG_CARDS_DE, SEO_ENTRIES_DE, SEO_PAGES_DE, HOME_SHARE_TITLE_DE, SITE_SHARING_HEADLINE_DE, SITE_SHARING_LINE_DE, type SeoPagesDe } from '../../../content/de/seo.ts';
import { OG_CARDS, SEO_EXCLUDED_ROUTES, SEO_PAGES, SEO_PATHS, seoEntry, shareTitle } from '../../../content/seo.ts';
import { SHELL_DE } from '../../../content/de/shell.ts';

const ORIGIN = new URL('https://site.example.com');

describe('SEO_PAGES_DE', () => {
  it('is keyed by exactly the English paths, and the cut list has no entry', () => {
    expect(Object.keys(SEO_PAGES_DE).sort()).toEqual(SEO_PAGES.map((e) => e.path).sort());
    expect([...SEO_PATHS].sort()).toEqual(SEO_PAGES.map((e) => e.path).sort());
    for (const route of SEO_EXCLUDED_ROUTES) expect(Object.keys(SEO_PAGES_DE)).not.toContain(route);
  });

  it('fails the typecheck when a page has no German entry', () => {
    // @ts-expect-error '/privacy' and every other path are missing
    const missing: SeoPagesDe = { '/': { title: 'a', description: 'b', card: 'site' } };
    expect(Object.keys(missing)).toHaveLength(1);
  });

  it('has a German card for every English card name, and every entry names one', () => {
    expect(OG_CARDS_DE.map((c) => c.name)).toEqual(OG_CARDS.map((c) => c.name));
    for (const entry of SEO_ENTRIES_DE) {
      expect(entry.locale).toBe('de');
      expect(entry.image, entry.path).toMatch(/^\/og\/de\/[a-z0-9-]+\.png$/);
      expect(OG_CARDS_DE.map((c) => `/og/de/${c.name}.png`), entry.path).toContain(entry.image);
      expect(entry.title.trim(), entry.path).not.toBe('');
      expect(entry.description.trim(), entry.path).not.toBe('');
      expect(entry.imageAlt.trim(), entry.path).not.toBe('');
    }
  });

  it('keeps the headline equal to the shell and writes every number from the facts in German', () => {
    expect(SITE_SHARING_HEADLINE_DE).toBe(`${SHELL_DE.headline.lead} ${SHELL_DE.headline.quiet}`);
    expect(HOME_SHARE_TITLE_DE).toBe(`${SITE.name}: ${SITE_SHARING_HEADLINE_DE}`);
    expect(SEO_PAGES_DE['/'].description).toBe(SITE_SHARING_LINE_DE);
    expect(SEO_PAGES_DE['/work/audible'].description).toContain(factText('profile.audible.experiments', { locale: 'de' }));
    expect(SEO_PAGES_DE['/work/audible'].description).toContain(factText('profile.audible.recommendations_adopted', { locale: 'de' }));
    expect(SEO_PAGES_DE['/work/pulse'].description).toContain(factText('pulse.events.count', { locale: 'de' }));
    expect(SEO_PAGES_DE['/work/n8n'].description).toContain(factText('profile.n8n.automated_tests', { locale: 'de' }));
  });

  it('uses no banned phrase, dash, arrow or middle dot, and no overclaim verb', () => {
    const text = [...SEO_ENTRIES_DE.flatMap((e) => [e.title, e.description, e.imageAlt]), ...OG_CARDS_DE.flatMap((c) => [c.title, c.sub])].join('\n');
    expect(text).not.toMatch(/KI-gestützt|KI-basiert|leidenschaftlich|Rockstar|AI-powered/i);
    expect(text).not.toMatch(/[–—→·]|->/);
    expect(text).not.toMatch(/verantwortet|geleitet|definiert/);
  });
});

describe('the entry accessor', () => {
  it('picks by language', () => {
    expect(seoEntries('en')).toBe(SEO_PAGES);
    expect(seoEntries('de')).toBe(SEO_ENTRIES_DE);
    expect(seoEntryFor('en', '/work')).toBe(seoEntry('/work'));
    expect(seoEntryFor('de', '/work').title).toBe(SEO_PAGES_DE['/work'].title);
    expect(() => seoEntryFor('de', '/demo')).toThrow();
  });

  it('gives the German Home its own link-preview title', () => {
    expect(shareTitle(seoEntryFor('de', '/'))).toBe(HOME_SHARE_TITLE_DE);
    expect(shareTitle(seoEntryFor('de', '/work'))).toBe(`${SEO_PAGES_DE['/work'].title} | ${SITE.name}`);
  });
});

describe('pageMetadata and the German registry', () => {
  it('an unregistered English page advertises no alternate and says en_GB', () => {
    const meta = pageMetadata(seoEntry('/work'), ORIGIN, []);
    expect(meta.alternates).toEqual({ canonical: 'https://site.example.com/work' });
    expect(meta.openGraph).toMatchObject({ locale: 'en_GB', url: 'https://site.example.com/work' });
    expect(meta.openGraph).not.toHaveProperty('alternateLocale');
  });

  it('an unregistered page advertises no twin: the same as with an empty registry', () => {
    const unregistered = SEO_PAGES.find((e) => !DE_PAGES.includes(e.path));
    if (unregistered === undefined) return; // every page has its twin
    expect(pageMetadata(unregistered, ORIGIN)).toEqual(pageMetadata(unregistered, ORIGIN, []));
    expect(pageMetadata(unregistered, ORIGIN).alternates).toEqual({ canonical: new URL(unregistered.path, ORIGIN).href });
  });

  it('a registered page carries both languages and x-default on both twins', () => {
    const languages = {
      en: 'https://site.example.com/work',
      de: 'https://site.example.com/de/work',
      'x-default': 'https://site.example.com/work',
    };
    const en = pageMetadata(seoEntry('/work'), ORIGIN, ['/work']);
    const de = pageMetadata(seoEntryFor('de', '/work'), ORIGIN, ['/work']);
    expect(en.alternates).toEqual({ canonical: 'https://site.example.com/work', languages });
    expect(de.alternates).toEqual({ canonical: 'https://site.example.com/de/work', languages });
    expect(en.openGraph).toMatchObject({ locale: 'en_GB', alternateLocale: 'de_DE' });
    expect(de.openGraph).toMatchObject({ locale: 'de_DE', alternateLocale: 'en_GB', url: 'https://site.example.com/de/work' });
    expect(de.title).toBe(`${SEO_PAGES_DE['/work'].title} | ${SITE.name}`);
    expect(de.description).toBe(SEO_PAGES_DE['/work'].description);
    expect(de.openGraph).toMatchObject({ images: [{ url: 'https://site.example.com/og/de/site.png' }] });
  });

  it('Home twins are / and /de', () => {
    const de = pageMetadata(seoEntryFor('de', '/'), ORIGIN, ['/']);
    expect(de.alternates).toEqual({
      canonical: 'https://site.example.com/de',
      languages: { en: 'https://site.example.com/', de: 'https://site.example.com/de', 'x-default': 'https://site.example.com/' },
    });
  });

  it('a German page that is not registered keeps its own canonical and advertises nothing', () => {
    const de = pageMetadata(seoEntryFor('de', '/work'), ORIGIN, []);
    expect(de.alternates).toEqual({ canonical: 'https://site.example.com/de/work' });
    expect(de.openGraph).toMatchObject({ locale: 'de_DE' });
    expect(de.openGraph).not.toHaveProperty('alternateLocale');
  });
});

describe('sitemapEntries', () => {
  it('without twins is the English list and nothing else', () => {
    const list = sitemapEntries(ORIGIN, []);
    expect(list).toEqual(SEO_PAGES.map((e) => ({ url: new URL(e.path, ORIGIN).href })));
    for (const item of list) expect(item).not.toHaveProperty('alternates');
  });

  it('adds the /de URL and the alternates on both for a registered page only', () => {
    const list = sitemapEntries(ORIGIN, ['/', '/work']);
    const languages = (path: string) => ({
      en: new URL(path, ORIGIN).href,
      de: new URL(path === '/' ? '/de' : `/de${path}`, ORIGIN).href,
      'x-default': new URL(path, ORIGIN).href,
    });
    expect(list).toHaveLength(SEO_PAGES.length + 2);
    expect(list.find((i) => i.url === 'https://site.example.com/')).toEqual({ url: 'https://site.example.com/', alternates: { languages: languages('/') } });
    expect(list.find((i) => i.url === 'https://site.example.com/de')).toEqual({ url: 'https://site.example.com/de', alternates: { languages: languages('/') } });
    expect(list.find((i) => i.url === 'https://site.example.com/de/work')).toEqual({ url: 'https://site.example.com/de/work', alternates: { languages: languages('/work') } });
    expect(list.find((i) => i.url === 'https://site.example.com/lab')).toEqual({ url: 'https://site.example.com/lab' });
    expect(list.some((i) => i.url.includes('/de/lab'))).toBe(false);
  });
});
