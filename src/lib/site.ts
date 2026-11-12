export const SITE = {
  name: 'Mahmoud El Bergui',
  role: 'Experimentation & growth analyst',
  city: 'Berlin, Germany',
} as const;

// The four page links, in header order. `href` is the route; "Live test" is the /experiment page.
export const NAV = [
  { label: 'Work', href: '/work' },
  { label: 'Lab', href: '/lab' },
  { label: 'Live test', href: '/experiment' },
  { label: 'About', href: '/about' },
] as const;

export const CV_LINK = { label: 'CV (PDF)', href: '/cv.pdf' } as const;

// The only contact details on the site: no phone number, no street address.
export const CONTACT = {
  email: 'elberguimahmoud11@gmail.com',
  linkedin: 'https://www.linkedin.com/in/melbergui',
  github: 'https://github.com/MaHmOuDeB',
} as const;

export const PRIVACY_HREF = '/privacy';

// The routes that have a page today. next/link prefetches every in-view site link, and a prefetch of
// a page a later plan builds is a 404 in the console (Lighthouse Best Practices), so links to other
// paths are not prefetched (lib/nav.ts prefetchFor). tests/unit/live-routes.test.ts keeps this list
// equal to the pages under src/app: add a route here when its page lands.
export const LIVE_ROUTES: readonly string[] = [
  '/',
  '/exclude',
  '/lab',
  '/lab/peeking',
  '/privacy',
  '/work/docproof',
  '/work/marketingws',
  '/work/n8n',
  '/work/retention',
  '/work/weather',
];
