// Every site path the Home page links to, in one place. This module has no imports on purpose:
// scripts run with Node's type stripping (the launch checker) load it with a relative `.ts`
// specifier, so it must not use the `@/` alias or any TSX.
//
// A path with a `#fragment` names a section that its page has to provide. External and mail links
// are not listed here.
export const HOME_LINKS = {
  /** The Audible page section that explains the adoption figures; also the Audible card. */
  whySoMany: '/work/audible#why-so-many',
  /** The Audible page section on the test-account automation tool. */
  automation: '/work/audible#automation',
  /** The Audible page itself, from the FAQ. */
  audible: '/work/audible',
  retention: '/work/retention',
  pulse: '/work/pulse',
  docproof: '/work/docproof',
  n8n: '/work/n8n',
  marketingws: '/work/marketingws',
  /** The Work index, from the hero's proof line. */
  work: '/work',
  lab: '/lab',
  experiment: '/experiment',
  cv: '/cv',
} as const;

export const HOME_DESTINATIONS: readonly string[] = Object.values(HOME_LINKS);
