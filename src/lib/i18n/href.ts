import { DE_PAGES } from './pages.ts';
import type { Locale } from './locale.ts';

/** `localHref` over an explicit page list (the unit tests inject theirs). */
export function localHrefWith(pages: readonly string[], locale: Locale, path: string): string {
  if (locale === 'en') return path;
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  const cut = path.search(/[?#]/);
  const raw = cut === -1 ? path : path.slice(0, cut);
  const rest = cut === -1 ? '' : path.slice(cut);
  // A group page is the home page for the reader, so it goes where the home page goes.
  const pathname = /^\/v\/[^/]+$/.test(raw) ? '/' : raw;
  if (!pages.includes(pathname)) return pathname === raw ? path : `${pathname}${rest}`;
  return pathname === '/' ? `/de${rest}` : `/de${pathname}${rest}`;
}

/** The address of an English path in `locale`: a registered page gets its German twin, anything else is unchanged. */
export function localHref(locale: Locale, path: string): string {
  return localHrefWith(DE_PAGES, locale, path);
}
