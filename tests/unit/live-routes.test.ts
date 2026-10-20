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

test('LIVE_ROUTES lists exactly the pages that ship', () => {
  expect([...LIVE_ROUTES].sort()).toEqual(pageRoutes(app).sort());
});
