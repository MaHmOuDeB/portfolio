import fs from 'node:fs';
import path from 'node:path';
import { LIVE_ROUTES } from '@/lib/site';

const app = path.resolve(import.meta.dirname, '../../src/app');

/** The URL of every page under src/app. Dev-only `*.dev.tsx` pages (the kitchen sink) never ship. */
function pageRoutes(dir: string, segments: string[] = []): string[] {
  const routes: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // _private folders are not routes; (groups) add no URL segment.
      if (entry.name.startsWith('_')) continue;
      const segment = /^\(.*\)$/.test(entry.name) ? [] : [entry.name];
      routes.push(...pageRoutes(path.join(dir, entry.name), [...segments, ...segment]));
    } else if (/^page\.(tsx|ts|jsx|js|mdx)$/.test(entry.name)) {
      routes.push(`/${segments.join('/')}`);
    }
  }
  return routes;
}

/**
 * The URL a visitor uses for a page. The home page is one static page per group under /v/[arm]: the
 * proxy rewrites / to it and answers a direct /v/* with the 404 page, so it stands for /.
 */
function visitorRoute(route: string): string {
  return route === '/v/[arm]' ? '/' : route;
}

test('LIVE_ROUTES lists exactly the pages that ship', () => {
  expect([...LIVE_ROUTES].sort()).toEqual(pageRoutes(app).map(visitorRoute).sort());
});

test('the home page is the per-group page, and no other page sits at /', () => {
  const routes = pageRoutes(app);
  expect(routes).toContain('/v/[arm]');
  expect(routes).not.toContain('/');
});

test('the Retention case study ships at /work/retention', () => {
  expect(LIVE_ROUTES).toContain('/work/retention');
});

test('the Lab ships at /lab, and its peeking example at /lab/peeking for the interview link', () => {
  expect(LIVE_ROUTES).toEqual(expect.arrayContaining(['/lab', '/lab/peeking']));
});
