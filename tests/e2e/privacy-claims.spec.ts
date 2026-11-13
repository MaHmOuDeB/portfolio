// What the privacy page says a visitor's browser gets, checked in a browser on every page that
// ships: no request to another site, no cookie, no Web Storage, no IndexedDB, and no Content
// Security Policy violation. The two request channels complement each other: a request the browser
// makes is recorded, and one the policy blocks before it is made shows up as a violation. A page added to LIVE_ROUTES is covered automatically. The one cookie the
// site ever sets is the owner's exclusion cookie, scoped to the event endpoint.
import { expect, type Page } from '@playwright/test';
import { LIVE_ROUTES } from '../../src/lib/site';
import { E2E_EXCLUDE_TOKEN as TOKEN } from './constants';
import { test } from './fixtures';
import { markSlow } from './slow';
import { useEveryControl } from './use-controls';

/** Collects every request URL and every CSP violation from the first byte of the page. */
async function record(page: Page): Promise<{ urls: string[]; violations: string[] }> {
  const urls: string[] = [];
  const violations: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  page.on('console', (m) => {
    if (/content security policy|securitypolicyviolation/i.test(m.text())) violations.push(m.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`securitypolicyviolation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  return { urls, violations };
}

/** Everything the browser keeps for this site: cookies, both Web Storages and IndexedDB. */
async function stored(page: Page): Promise<{ cookies: unknown[]; local: number; session: number; idb: string[] }> {
  const cookies = await page.context().cookies();
  const inPage = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    idb: typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map((d) => d.name ?? '') : [],
  }));
  return { cookies, ...inPage };
}

for (const route of LIVE_ROUTES) {
  test(`${route}: only same-origin requests, nothing stored in the browser, no CSP violation`, async ({ page, baseURL }) => {
    // Test too strict: the default 30 s does not fit the long Retention page on a loaded WebKit runner
    // (it timed out mid-run, not hung). Only that route is slow; the others keep the default.
    markSlow('the long Retention page timed out at 30 s on a loaded WebKit runner', route === '/work/retention');
    const seen = await record(page);
    const response = await page.goto(route);
    expect(response?.ok(), route).toBe(true);
    await page.waitForLoadState('networkidle');

    // Interact: scroll to the end and back, and click the first button in the page's main content.
    await page.mouse.wheel(0, 4000);
    await page.evaluate(() => window.scrollTo(0, 0));
    const button = page.locator('main button:visible').first();
    if ((await button.count()) > 0) await button.click();
    await page.waitForLoadState('networkidle');
    // Leaving the page sends any last beacon (pagehide); it must be same-origin too.
    await page.goto('about:blank');

    const origin = new URL(baseURL!).origin;
    const foreign = seen.urls.filter((u) => !u.startsWith('about:') && !u.startsWith('data:') && new URL(u).origin !== origin);
    expect(foreign, 'requests to another origin').toEqual([]);
    expect(seen.violations).toEqual([]);

    await page.goto(route);
    expect(await stored(page)).toEqual({ cookies: [], local: 0, session: 0, idb: [] });
  });
}

// The static analysis pages: after every Figure on them is used (each slider moved by key, each
// option switched and each Reset pressed), still no request to another site, no beacon or other call
// to the site's API, nothing stored and no CSP violation. The Lab and Retention pages read no live
// data and count nothing.
for (const route of ['/lab', '/lab/peeking?peeking.preset=interview', '/work/retention']) {
  test(`${route}: every control used, still no beacon, no foreign request and nothing stored`, async ({ page, baseURL }) => {
    test.slow();
    const seen = await record(page);
    const response = await page.goto(route);
    expect(response?.ok(), route).toBe(true);
    await expect(page.locator('[data-island="idle"]')).toHaveCount(0, { timeout: 15_000 });
    const figures = page.locator('main figure[data-figure]');
    const count = await figures.count();
    expect(count).toBeGreaterThan(0);
    let used = 0;
    for (let i = 0; i < count; i++) {
      const f = figures.nth(i);
      const ranges = f.locator('input[type="range"]:enabled');
      for (let r = 0; r < (await ranges.count()); r++) {
        await ranges.nth(r).focus();
        await page.keyboard.press('ArrowLeft');
        used++;
      }
      const radios = f.locator('input[type="radio"]:enabled:not(:checked)');
      if ((await radios.count()) > 0) {
        await radios.first().locator('xpath=ancestor::label[1]').click();
        used++;
      }
      const reset = f.getByRole('button', { name: 'Reset' });
      if ((await reset.count()) > 0) {
        await reset.click();
        used++;
      }
    }
    expect(used, 'controls used').toBeGreaterThan(count);
    await page.waitForLoadState('networkidle');
    await page.goto('about:blank');

    const origin = new URL(baseURL!).origin;
    const urls = seen.urls.filter((u) => !u.startsWith('about:') && !u.startsWith('data:'));
    expect(urls.filter((u) => new URL(u).origin !== origin), 'requests to another origin').toEqual([]);
    // A prefetch of the Live test page itself (/experiment, the header's link) is a page, not a beacon or
    // the data endpoint (/experiment/data.json).
    expect(urls.filter((u) => /^\/(api(\/|$)|experiment\/)/.test(new URL(u).pathname)), 'beacons or API calls').toEqual([]);
    expect(seen.violations).toEqual([]);

    await page.goto(route);
    expect(await stored(page)).toEqual({ cookies: [], local: 0, session: 0, idb: [] });
  });
}

// Every page, with every control on it used (each Figure's sliders, options, selects, steps and
// Reset; every disclosure; a form's fields typed into, never sent): still only same-origin requests,
// nothing stored and no CSP violation. Only the home page counts views (its beacon) and only the
// owner's /exclude page talks to the event endpoint; no other page calls the site's API or the
// published data.
const COUNTING = new Set(['/', '/exclude']);
for (const route of LIVE_ROUTES) {
  test(`${route}: every control used, still same-origin only, nothing stored, no CSP violation`, async ({ page, baseURL }) => {
    test.slow();
    const seen = await record(page);
    const response = await page.goto(route);
    expect(response?.ok(), route).toBe(true);
    const used = await useEveryControl(page);
    if (used.controlled > 0) expect(used.actions + used.resets, `${route}: controls used`).toBeGreaterThan(0);
    await page.waitForLoadState('networkidle');
    await page.goto('about:blank');

    const origin = new URL(baseURL!).origin;
    const urls = seen.urls.filter((u) => !u.startsWith('about:') && !u.startsWith('data:'));
    expect(urls.filter((u) => new URL(u).origin !== origin), 'requests to another origin').toEqual([]);
    if (!COUNTING.has(route)) {
      expect(urls.filter((u) => /^\/(api(\/|$)|experiment\/data\.json)/.test(new URL(u).pathname)), 'API or data calls').toEqual([]);
    }
    expect(seen.violations).toEqual([]);

    await page.goto(route);
    expect(await stored(page)).toEqual({ cookies: [], local: 0, session: 0, idb: [] });
  });
}

test('the only cookie is the owner cookie, scoped to /api/e, and "Count this browser again" removes it', async ({ page, context, browserName }) => {
  // WebKit refuses a Secure cookie over plain http://localhost; production is https.
  test.skip(browserName === 'webkit', 'WebKit stores no Secure cookie over http');
  await page.goto(`/exclude#t=${TOKEN}`);
  await expect(page.getByRole('status')).toHaveText('This browser is now left out of the counts.');
  const cookies = await context.cookies();
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatchObject({ name: 'exp-self', path: '/api/e', httpOnly: true, secure: true, sameSite: 'Strict' });

  // Visiting other pages adds nothing.
  for (const route of LIVE_ROUTES) {
    await page.goto(route);
    await page.waitForLoadState('load');
  }
  expect((await context.cookies()).map((c) => c.name)).toEqual(['exp-self']);

  await page.goto('/exclude');
  await page.getByRole('button', { name: 'Count this browser again' }).click();
  await expect(page.getByRole('status')).toHaveText('This browser is counted again.');
  expect(await context.cookies()).toEqual([]);
});

test('the detectors are not vacuous: they see a foreign request, a cookie, Web Storage and IndexedDB', async ({ page, baseURL }) => {
  const seen = await record(page);
  await page.goto('/privacy');
  await page.evaluate(async () => {
    await fetch('https://example.invalid/').catch(() => {});
    document.cookie = 'probe=1; path=/';
    localStorage.setItem('probe', '1');
    sessionStorage.setItem('probe', '1');
    await new Promise<void>((resolve) => {
      const open = indexedDB.open('probe');
      open.onsuccess = () => {
        open.result.close();
        resolve();
      };
      open.onerror = () => resolve();
    });
  });
  // The policy blocks a script's request to another origin before it is made, so the browser never
  // reports it as a request: the violation channel is what catches it.
  await expect.poll(() => seen.violations.length, 'the CSP violation of the foreign request').toBeGreaterThan(0);
  const s = await stored(page);
  expect(s.cookies).toHaveLength(1);
  expect([s.local, s.session]).toEqual([1, 1]);
  expect(s.idb).toContain('probe');
  // A request the policy does not govern (a navigation) is seen by the request recorder.
  await page.goto('https://example.invalid/').catch(() => {});
  const origin = new URL(baseURL!).origin;
  expect(seen.urls.filter((u) => !u.startsWith('about:') && new URL(u).origin !== origin)).toContain('https://example.invalid/');
});
