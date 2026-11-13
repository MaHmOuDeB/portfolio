// The whole site's claims, in what a browser gets: the served HTML (with its hidden and no-JS
// markup and its metadata), the hydrated page after every control on it is used, after Reset, and
// with the Figure islands failing to load. On every page:
//
// - the Audible claim rules (tests/e2e/site-claims.ts): the number of tests and the number of
//   markets are never in one claim, a count of teams always says it was over my time there, and no
//   significance threshold appears;
// - the truth audit and the hydrated checks (every number under a source marker, also in input
//   values and accessible names; no Infinity or NaN);
// - the Figure invariants (tests/e2e/figure-invariants.ts): every chart Figure keeps a whole table,
//   every <time> prints its dateTime the site's way in Europe/Berlin, and the minus, zero, percent
//   and "±" rules hold;
// - each Figure that can throw (every interactive Figure, on the dev hosts that set the test seam,
//   since the routes cannot): its error fallback keeps all of the above;
// - every same-origin link and fragment resolves.
//
// Page by page: the Live test page never calls its data "anonymous", and on the Pulse page every
// question that reads like a prediction sits in a section that says the questions are design
// hypotheses.
import { expect, type Page } from '@playwright/test';
import { LIVE_ROUTES } from '../../src/lib/site';
import { test, waitForIslands } from './fixtures';
import { htmlClaimFindings } from './site-claims';
import { figureInvariants } from './figure-invariants';
import { auditLive } from './truth-live';
import { useEveryControl } from './use-controls';

/** Every check of one phase: the claim rules, the truth audit and the Figure invariants. */
async function holds(page: Page, route: string, when: string) {
  expect(htmlClaimFindings(await page.content(), route), `${route} ${when}`).toEqual([]);
  await auditLive(page, route, when);
  expect(await figureInvariants(page), `${route} ${when}: Figure invariants`).toEqual([]);
}

// Served pages beyond the route list: the home page in each forced group, and the not-found page.
const SERVED_EXTRA = ['/?variant=a', '/?variant=b', '/this-page-does-not-exist'];

// Every interactive Figure, on the dev host that sets its test seam: its chart throws on the first
// render after a change.
const FAULT_HOSTS = [
  '/kitchen-sink/audible/faults',
  '/kitchen-sink/lab/faults',
  '/kitchen-sink/lab/peeking/faults',
  '/kitchen-sink/lab/diagnostics/faults',
  '/kitchen-sink/pulse/faults',
  '/kitchen-sink/retention/faults',
];

const CHUNK_ERRORS = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|net::ERR_FAILED|Importing a module script failed/;

test.describe('the site-wide claims', () => {
  for (const route of LIVE_ROUTES) {
    test(`${route}: the served HTML keeps the claim rules, in its text, hidden markup, attributes and metadata`, async ({ request }) => {
      const response = await request.get(route);
      expect(response.ok(), route).toBe(true);
      expect(htmlClaimFindings(await response.text(), route)).toEqual([]);
    });
  }

  for (const route of SERVED_EXTRA) {
    test(`${route}: the served HTML keeps the claim rules`, async ({ request }) => {
      const response = await request.get(route);
      expect(response.status(), route).toBe(route.startsWith('/this-') ? 404 : 200);
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
      await holds(page, route, 'loaded');

      const used = await useEveryControl(page, { reset: false });
      expect(used.idle, `${route}: every Figure with a control had one used`).toEqual([]);
      await holds(page, route, 'every control used');

      if (used.figures > 0) {
        for (const reset of await page.locator('main figure[data-figure]').getByRole('button', { name: 'Reset' }).all()) await reset.click();
        await holds(page, route, 'after Reset');
      }

      expect(errors, 'page errors before the islands are made to fail').toEqual([]);

      // The islands fail to load: every script the served page names (its own and its payload's)
      // loads, so the page hydrates; every other script, which is what a lazy island fetches, is
      // refused from the start, so an island asked for on idle cannot load before the block.
      const islands = await page.locator('[data-island]').count();
      if (islands > 0) {
        const served = await (await page.request.get(route)).text();
        const named = new Set([...served.matchAll(/static\/chunks\/[^"'\\\s]+?\.js/g)].map((m) => m[0]));
        await page.route('**/_next/static/**/*.js', (r) => {
          const path = new URL(r.request().url()).pathname;
          if (!path.includes('/static/chunks/')) return r.continue();
          return named.has(path.replace(/^.*?(static\/chunks\/)/, '$1')) ? r.continue() : r.abort();
        });
        await page.goto(route);
        await page.waitForLoadState('load');
        for (const h of await page.locator('main figure[data-figure] h3').all()) await h.hover().catch(() => {});
        await expect(page.locator('[data-island="idle"]')).toHaveCount(0, { timeout: 15_000 });
        await expect(page.locator('[data-island="failed"]'), 'an island failed').not.toHaveCount(0, { timeout: 15_000 });
        await holds(page, route, 'islands failed');
        await page.unroute('**/_next/static/**/*.js');
        expect(errors.filter((m) => !CHUNK_ERRORS.test(m)), 'page errors other than the blocked scripts').toEqual([]);
      }
    });
  }

  for (const host of FAULT_HOSTS) {
    test(`${host}: each Figure's error fallback keeps the claim rules, the truth audit and the Figure invariants`, async ({ page }) => {
      test.slow();
      await page.goto(host);
      const ids = await page.locator('main figure[data-figure]').evaluateAll((fs) =>
        fs.filter((f) => f.querySelector('input[type="range"], input[type="radio"], select') !== null || f.closest('[data-island]') !== null).map((f) => f.id),
      );
      expect(ids.length, `${host}: Figures to break`).toBeGreaterThan(0);
      for (const id of ids) {
        await page.goto(host);
        const figure = page.locator(`figure[data-figure="${id}"]`);
        await figure.locator('h3').hover();
        await expect(page.locator('[data-island]', { has: figure }).first()).toHaveAttribute('data-island', 'ready');
        const control = figure.locator('input[type="range"], input[type="radio"]:not(:checked), select').first();
        if ((await control.count()) === 0) continue; // a Figure driven by another's controls breaks with it
        if ((await control.evaluate((e) => e.tagName)) === 'SELECT') {
          const values = await control.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
          await control.selectOption(values[values.length - 1]!);
        } else if ((await control.getAttribute('type')) === 'radio') {
          await control.locator('xpath=ancestor::label[1]').click();
        } else {
          await control.focus();
          await page.keyboard.press('ArrowRight');
        }
        await expect(figure.locator('[data-figure-fallback] [role="status"]'), `${id}: the error state`).toBeVisible();
        await holds(page, host, `${id} error state`);
      }
    });
  }

  test('/kitchen-sink/home/scroll/chart-error: the Home chart error state keeps the claim rules, the truth audit and the Figure invariants', async ({ page }) => {
    await page.goto('/kitchen-sink/home/scroll/chart-error');
    await expect(page.locator('[data-home-chart] > [data-figure-fallback]').first()).toBeAttached({ timeout: 15_000 });
    await holds(page, '/', 'chart error state');
  });

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
      const out: { tag: string; text: string; context: boolean }[] = [];
      for (const el of document.querySelectorAll('main td, main th, main li, main p, main dd, main figcaption, main caption')) {
        const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        // A question that reads like a finding: a prediction, a driver, a signal or a confirmation.
        if (!/\bpredict|\bdrives?\b|\bdriver\b|\bsignal\b|\bconfirms\b/i.test(t)) continue;
        const section = el.closest('section[id]');
        out.push({ tag: el.tagName, text: t.slice(0, 120), context: /design hypothes/i.test(section?.textContent ?? '') });
      }
      return out;
    });
    // The event table's own cells are among them, not only the paragraphs that explain them.
    const cells = found.filter((f) => f.tag === 'TD' || f.tag === 'TH').map((f) => f.text);
    expect(cells.some((t) => /predicts the user will come back/.test(t)), 'the "predicts" question').toBe(true);
    expect(cells.some((t) => /drives deeper investigation/.test(t)), 'the "drives" question').toBe(true);
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
