// A nav item is current on its own page and on every page below it (/work/pulse is under /work).
export function isCurrent(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
