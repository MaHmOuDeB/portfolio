import fs from 'node:fs';
import path from 'node:path';
import { SEO_PAGES_DE } from '../../../content/de/seo';
import { DE_PAGES } from '@/lib/i18n/pages';

const app = path.resolve(import.meta.dirname, '../../../src/app');

/** The URL of every page file under a folder; `_private` folders and (groups) add no segment, `[...rest]` is the 404 catch-all. */
function pageRoutes(dir: string, segments: string[] = [], skipDe = false): string[] {
  const routes: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('_') || entry.name.startsWith('[...')) continue;
      if (skipDe && segments.length === 0 && entry.name === 'de') continue;
      const segment = /^\(.*\)$/.test(entry.name) ? [] : [entry.name];
      routes.push(...pageRoutes(path.join(dir, entry.name), [...segments, ...segment], skipDe));
    } else if (/^page\.(tsx|ts|jsx|js|mdx)$/.test(entry.name)) {
      routes.push(`/${segments.join('/')}`);
    }
  }
  return routes;
}

/** The English paths with a German page: /de stands for /, /de/x for /x. */
const germanPages = pageRoutes(path.join(app, 'de')).map((r) => (r === '/' ? '/' : r));
const englishPages = pageRoutes(app, [], true).map((r) => (r === '/v/[arm]' ? '/' : r));

describe('DE_PAGES', () => {
  it('lists every German page under src/app/de and no other', () => {
    expect([...DE_PAGES].sort()).toEqual([...germanPages].sort());
  });

  it('has no duplicate', () => {
    expect(new Set(DE_PAGES).size).toBe(DE_PAGES.length);
  });

  it('gives every entry a German page, a German SEO entry and an English twin', () => {
    for (const page of DE_PAGES) {
      const file = path.join(app, 'de', page === '/' ? '' : page, 'page.tsx');
      expect(fs.existsSync(file), `German page for ${page}`).toBe(true);
      expect(Object.keys(SEO_PAGES_DE), `German SEO entry for ${page}`).toContain(page);
      expect(englishPages, `English twin of ${page}`).toContain(page);
    }
  });
});
