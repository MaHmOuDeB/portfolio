// Canonical metadata, robots and the sharing images on the built site. The e2e build has no
// VERCEL_ENV, so its canonical origin is the fixed test origin.
import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, type Response } from '@playwright/test';
import { SEO_EXCLUDED_ROUTES, SEO_PAGES, shareTitle } from '../../content/seo.ts';
import { test } from './fixtures';

const ORIGIN = 'https://canonical.invalid';

type Head = {
  canonicals: string[];
  title: string;
  robots: string[];
  meta: Record<string, string[]>;
};

async function readHead(page: Page): Promise<Head> {
  return page.evaluate(() => {
    const meta: Record<string, string[]> = {};
    for (const el of document.head.querySelectorAll('meta')) {
      const key = el.getAttribute('property') ?? el.getAttribute('name');
      if (key) (meta[key] ??= []).push(el.getAttribute('content') ?? '');
    }
    return {
      canonicals: [...document.querySelectorAll('link[rel="canonical"]')].map((el) => el.getAttribute('href') ?? ''),
      title: document.title,
      robots: meta.robots ?? [],
      meta,
    };
  });
}

/**
 * A URL in its normal form: Next prints the root canonical without its trailing slash
 * ("https://host"), which is the same URL as "https://host/".
 */
const normal = (urls: readonly string[] | undefined) => (urls ?? []).map((u) => new URL(u).href);

/** Width and height from a PNG's IHDR chunk. */
function pngSize(body: Buffer): [number, number] {
  expect(body.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return [body.readUInt32BE(16), body.readUInt32BE(20)];
}

function expectIndexable(response: Response | null, head: Head): void {
  // Index and follow: no noindex, nofollow or none, in a robots meta tag or in X-Robots-Tag.
  expect(response?.headers()['x-robots-tag'] ?? '').not.toMatch(/noindex|nofollow|none/i);
  for (const value of head.robots) expect(value).not.toMatch(/noindex|nofollow|none/i);
}

test.describe('canonicalAndRobots', () => {
  for (const entry of SEO_PAGES) {
    test(`${entry.path} has one absolute canonical, its sharing fields and a 1200 x 630 image`, async ({ page, request }) => {
      const response = await page.goto(entry.path);
      expect(response?.status()).toBe(200);
      const head = await readHead(page);
      const url = `${ORIGIN}${entry.path}`;
      const image = `${ORIGIN}${entry.image}`;
      expect(normal(head.canonicals)).toEqual([url]);
      expect(head.title).toBe(entry.title);
      expect(head.meta.description).toEqual([entry.description]);
      expect(head.meta['og:title']).toEqual([shareTitle(entry)]);
      expect(head.meta['og:description']).toEqual([entry.description]);
      expect(normal(head.meta['og:url'])).toEqual([url]);
      expect(head.meta['og:type']).toEqual(['website']);
      expect(normal(head.meta['og:image'])).toEqual([image]);
      expect(head.meta['og:image:width']).toEqual(['1200']);
      expect(head.meta['og:image:height']).toEqual(['630']);
      expect(head.meta['og:image:alt']).toEqual([entry.imageAlt]);
      expect(head.meta['twitter:card']).toEqual(['summary_large_image']);
      expect(head.meta['twitter:title']).toEqual([shareTitle(entry)]);
      expect(normal(head.meta['twitter:image'])).toEqual([image]);
      expectIndexable(response, head);

      const png = await request.get(entry.image);
      expect(png.status()).toBe(200);
      expect(png.headers()['content-type']).toBe('image/png');
      expect(pngSize(await png.body())).toEqual([1200, 630]);
    });
  }

  for (const arm of ['a', 'b'] as const) {
    test(`/ is indexable with the canonical / in group ${arm}`, async ({ page }) => {
      const response = await page.goto(`/?variant=${arm}`);
      expect(response?.status()).toBe(200);
      expect(response?.headers()['x-arm']).toBe(arm);
      const head = await readHead(page);
      expect(normal(head.canonicals)).toEqual([`${ORIGIN}/`]);
      expect(normal(head.meta['og:url'])).toEqual([`${ORIGIN}/`]);
      expectIndexable(response, head);
    });

    test(`a direct request for /v/${arm} is the 404 page`, async ({ request }) => {
      expect((await request.get(`/v/${arm}`)).status()).toBe(404);
    });
  }

  test('/exclude is kept out of search', async ({ page }) => {
    await page.goto('/exclude');
    const head = await readHead(page);
    expect(head.robots.join(',')).toMatch(/noindex/);
    expect(head.canonicals).toEqual([]);
  });

  test('/demo is noindex, follow', async ({ page }) => {
    test.skip(!fs.existsSync(path.resolve('src/app/demo/page.tsx')), 'the /demo page is not on this branch yet');
    await page.goto('/demo');
    const head = await readHead(page);
    expect(head.robots.join(',')).toMatch(/noindex/);
    expect(head.robots.join(',')).not.toMatch(/nofollow/);
  });

  test('the sitemap lists exactly the indexable pages on the canonical origin', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/xml/);
    const locs = [...(await response.text()).matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(SEO_PAGES.map((entry) => `${ORIGIN}${entry.path}`));
    for (const loc of locs) {
      expect(loc).not.toMatch(/[?#]|\/api\/|\/v\/|kitchen-sink|data\.json/);
      for (const excluded of SEO_EXCLUDED_ROUTES) expect(new URL(loc!).pathname).not.toBe(excluded);
    }
  });

  test('robots.txt allows the site, keeps the API out and names the sitemap', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toMatch(/^User-Agent: \*$/m);
    expect(text).toMatch(/^Allow: \/$/m);
    expect(text).toMatch(/^Disallow: \/api\/$/m);
    expect(text).toMatch(new RegExp(`^Sitemap: ${ORIGIN}/sitemap\\.xml$`, 'm'));
    expect(text).not.toMatch(/^Disallow: \/$/m);
  });
});
