// The addresses of a page in each language, for the head's hreflang links and the sitemap. Only a
// page in the German registry (src/lib/i18n/pages.ts) has a twin: English never advertises a German
// page that does not exist. Pure and client-safe: no copy.
import { DE_PAGES } from '../i18n/pages.ts';
import type { Locale } from '../i18n/locale.ts';

/** The German address of an English path: Home is /de, every other page is under /de. */
export function germanPath(path: string): string {
  return path === '/' ? '/de' : `/de${path}`;
}

/** The address of an English path in `locale`, whether or not the German page is registered. */
export function pathIn(locale: Locale, path: string): string {
  return locale === 'de' ? germanPath(path) : path;
}

/** True when the English path has a German twin in `pages`. */
export function hasTwin(path: string, pages: readonly string[] = DE_PAGES): boolean {
  return pages.includes(path);
}

/** hreflang to absolute URL for a twinned page: both languages, and x-default is English. */
export function languageAlternates(path: string, origin: URL): Record<string, string> {
  const en = new URL(path, origin).href;
  return { en, de: new URL(germanPath(path), origin).href, 'x-default': en };
}

/** The Open Graph locale of each language. */
export const OG_LOCALE: Record<Locale, 'en_GB' | 'de_DE'> = { en: 'en_GB', de: 'de_DE' };
