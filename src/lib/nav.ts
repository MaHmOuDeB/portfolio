import { LIVE_ROUTES } from './site';

// A nav item is current on its own page and on every page below it (/work/pulse is under /work).
export function isCurrent(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

// next/link's `prefetch` for a site path: the default for a route that has a page, off otherwise.
export function prefetchFor(href: string): false | undefined {
  const path = href.split(/[?#]/)[0] || '/';
  return LIVE_ROUTES.includes(path) ? undefined : false;
}
