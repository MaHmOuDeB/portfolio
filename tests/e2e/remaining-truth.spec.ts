// The whole site's claims, in what a browser gets: the served HTML (with its hidden and no-JS
// markup and its metadata), the hydrated page after every control on it is used, after Reset, and
// with the Figure islands failing to load. On every page:
//
// - the Audible claim rules (tests/e2e/site-claims.ts): the number of tests and the number of
//   markets are never in one claim, a count of teams always says it was over my time there, and no
//   significance threshold appears;
// - the truth audit and the hydrated checks (every number under a source marker, also in input
//   values and accessible names; no Infinity or NaN);
// - every same-origin link and fragment resolves.
//
// Page by page: the Live test page never calls its data "anonymous", and on the Pulse page every
// question that reads like a prediction sits in a section that says the questions are design
// hypotheses.
import { expect } from '@playwright/test';
import { LIVE_ROUTES } from '../../src/lib/site';
import { test, waitForIslands } from './fixtures';
import { htmlClaimFindings } from './site-claims';
import { auditLive } from './truth-live';
import { useEveryControl } from './use-controls';

const CHUNK_ERRORS = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|net::ERR_FAILED|Importing a module script failed/;

test.describe('the site-wide claims', () => {
  for (const route of LIVE_ROUTES) {
    test(`${route}: the served HTML keeps the claim rules, in its text, hidden markup, attributes and metadata`, async ({ request }) => {
      const response = await request.get(route);
      expect(response.ok(), route).toBe(true);
      expect(htmlClaimFindings(await response.text(), route)).toEqual([]);
    });
  }

  for (const route of LIVE_ROUTES) {
    test(`${route}: the hydrated page keeps the claim rules and the truth audit after every control, after Reset and with failed islands`, async ({ page }) => {
      test.slow();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(route);
      await waitForIslands(page);
      expect(htmlClaimFindings(await page.content(), route), 'loaded').toEqual([]);
      await auditLive(page, route, 'loaded');

      const used = await useEveryControl(page, { reset: false });
      expect(htmlClaimFindings(await page.content(), route), 'every control used').toEqual([]);
      await auditLive(page, route, 'every control used');

      if (used.figures > 0) {
        for (const reset of await page.locator('main figure[data-figure]').getByRole('button', { name: 'Reset' }).all()) await reset.click();
        expect(htmlClaimFindings(await page.content(), route), 'after Reset').toEqual([]);
        await auditLive(page, route, 'after Reset');
      }

      expect(errors, 'page errors before the islands are made to fail').toEqual([]);

      // The islands fail to load: block the scripts before the islands are asked for, then ask.
      const islands = await page.locator('[data-island]').count();
      if (islands > 0) {
        let block = false;
        await page.route('**/_next/static/**/*.js', (r) => (block ? r.abort() : r.continue()));
        await page.goto(route);
        await page.waitForLoadState('load');
        block = true;
        for (const h of await page.locator('main figure[data-figure] h3').all()) await h.hover().catch(() => {});
        await expect(page.locator('[data-island="idle"]')).toHaveCount(0, { timeout: 15_000 });
        expect(htmlClaimFindings(await page.content(), route), 'islands failed').toEqual([]);
        await auditLive(page, route, 'islands failed');
        await page.unroute('**/_next/static/**/*.js');
        expect(errors.filter((m) => !CHUNK_ERRORS.test(m)), 'page errors other than the blocked scripts').toEqual([]);
      }
    });
  }

  test('/experiment: never calls its data anonymous, in the served HTML, its React payload or the hydrated page', async ({ page, request }) => {
    expect(await (await request.get('/experiment')).text()).not.toMatch(/(?<!\bnot )\banonym/i);
    await page.goto('/experiment');
    await useEveryControl(page);
    expect(await page.content()).not.toMatch(/(?<!\bnot )\banonym/i);
  });

  test('/work/pulse: every question that reads like a prediction is in a section that calls the questions design hypotheses', async ({ page }) => {
    await page.goto('/work/pulse');
    await useEveryControl(page, { reset: false });
    const found = await page.evaluate(() => {
      const out: { text: string; context: boolean }[] = [];
      for (const el of document.querySelectorAll('main td, main th, main li, main p, main dd, main figcaption, main caption')) {
        const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (!/\bpredict/i.test(t)) continue;
        const section = el.closest('section[id]');
        out.push({ text: t.slice(0, 120), context: /design hypothes/i.test(section?.textContent ?? '') });
      }
      return out;
    });
    expect(found.length, 'the Pulse page has questions that read like predictions').toBeGreaterThan(0);
    expect(found.filter((f) => !f.context)).toEqual([]);
  });
});

test.describe('every same-origin link and fragment resolves', () => {
  test('from every page: each linked page answers 200 and each fragment is an id on its page', async ({ request, baseURL }) => {
    test.slow();
    const origin = new URL(baseURL!).origin;
    const html = new Map<string, string>();
    const get = async (path: string) => {
      if (!html.has(path)) {
        const r = await request.get(path);
        expect(r.status(), path).toBe(200);
        html.set(path, await r.text());
      }
      return html.get(path)!;
    };
    const links = new Map<string, string>();
    for (const route of LIVE_ROUTES) {
      for (const m of (await get(route)).matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
        const href = m[1]!.replace(/&amp;/g, '&');
        const url = new URL(href, `${origin}${route}`);
        if (url.origin !== origin) continue;
        links.set(`${url.pathname}${url.search}${url.hash}`, route);
      }
    }
    expect(links.size).toBeGreaterThan(LIVE_ROUTES.length);
    const missing: string[] = [];
    for (const [target, from] of links) {
      const url = new URL(target, origin);
      const r = await request.get(`${url.pathname}${url.search}`);
      if (r.status() !== 200) {
        missing.push(`${from} links ${target}: ${r.status()}`);
        continue;
      }
      if (url.hash.length > 1) {
        const id = decodeURIComponent(url.hash.slice(1));
        const body = (r.headers()['content-type'] ?? '').includes('html') ? await r.text() : '';
        if (!body.includes(`id="${id}"`)) missing.push(`${from} links ${target}: no element with that id`);
      }
    }
    expect(missing).toEqual([]);
  });

  test('the CV page resolves, and links the PDF only when the build offers one that answers', async ({ page, request }) => {
    await page.goto('/cv');
    const pdfLinks = page.locator('a[href="/cv.pdf"]');
    if ((await pdfLinks.count()) > 0) {
      const r = await request.get('/cv.pdf');
      expect(r.status()).toBe(200);
      expect(r.headers()['content-type']).toContain('application/pdf');
    } else {
      // No checked PDF in this build: nothing links one, and none is served.
      expect((await request.get('/cv.pdf')).status()).toBe(404);
    }
    await waitForIslands(page);
  });
});
