// The SEO entry of a page in a language. Server only: a page file calls it for its metadata, and no
// client file reaches the German copy through it.
import 'server-only';
import { SEO_ENTRIES_DE } from '../../../content/de/seo.ts';
import { SEO_PAGES, seoEntry, type SeoEntry } from '../../../content/seo.ts';
import type { Locale } from '../i18n/locale.ts';

/** Every entry in `locale`: the English manifest, or the German one. */
export function seoEntries(locale: Locale): readonly SeoEntry[] {
  return locale === 'de' ? SEO_ENTRIES_DE : SEO_PAGES;
}

/** The entry for an English path in `locale`; throws for a path with no entry. */
export function seoEntryFor(locale: Locale, path: string): SeoEntry {
  if (locale === 'en') return seoEntry(path);
  const found = SEO_ENTRIES_DE.find((e) => e.path === path);
  if (!found) throw new Error(`no German SEO entry for ${path}`);
  return found;
}
