// Where the language links of the header and the Menu point. Client-safe: no copy, no imports of the
// dictionaries. A page maps to the same page in the other language when that page exists there;
// otherwise the visitor lands on the other language's home page.
import { LIVE_ROUTES } from '../site.ts';
import { localHrefWith } from './href.ts';
import { DE_PAGES } from './pages.ts';

export type LanguageTargets = { en: string; de: string };

const GROUP_PAGE = /^\/v\/[^/]+$/;

function clean(pathname: string | null): string {
  if (pathname === null || pathname === '') return '/';
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return p === '' ? '/' : p;
}

/**
 * The address of the current page in each language. `pages` is the German registry and `routes` the
 * English pages that exist; the unit tests inject theirs.
 */
export function languageTargets(
  pathname: string | null,
  pages: readonly string[] = DE_PAGES,
  routes: readonly string[] = LIVE_ROUTES,
): LanguageTargets {
  const path = clean(pathname);
  if (path === '/de' || path.startsWith('/de/')) {
    const english = path === '/de' ? '/' : path.slice(3);
    return { en: routes.includes(english) ? english : '/', de: path === '/de' || routes.includes(english) ? path : '/de' };
  }
  // A group page is the home page for the reader.
  const english = GROUP_PAGE.test(path) ? '/' : path;
  const german = localHrefWith(pages, 'de', english);
  return {
    en: routes.includes(english) ? english : '/',
    de: german === english ? '/de' : german,
  };
}

/** `href` with the page's own query and hash, which carry a Figure's setting from one language to the other. */
export function appendLocation(href: string, search: string, hash: string): string {
  return `${href}${search}${hash}`;
}

/** The address a language link opens, from the browser's location. */
export function languageHref(target: string, location: Pick<Location, 'search' | 'hash'>): string {
  return appendLocation(target, location.search, location.hash);
}
