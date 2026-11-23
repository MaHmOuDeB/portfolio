// The German twin of privacy-claims.spec.ts: what the German privacy notice says a visitor's browser
// gets, checked in a browser on every German page. No request to another site, no cookie, no Web
// Storage, no IndexedDB and no Content Security Policy violation, with every control used; no German
// page counts views or calls the site's API. And the two sentences only the German notice has: the
// language choice is stored nowhere, and the page language never follows the browser's language.
import { expect, type Page } from '@playwright/test';
import { localHref } from '../../src/lib/i18n/href';
import { DE_PAGES } from '../../src/lib/i18n/pages';
import { test, waitForHydration } from './fixtures';
import { markSlow } from './slow';
import { useEveryControl } from './use-controls';

/** Every German page: the registered twins, and the notice itself. */
const DE_ROUTES = [...new Set([...DE_PAGES.map((p) => localHref('de', p)), '/de/privacy'])];

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

const NOTHING = { cookies: [], local: 0, session: 0, idb: [] };
const apiOrData = (u: string) => /^\/(api(\/|$)|experiment\/data\.json)/.test(new URL(u).pathname);

for (const route of DE_ROUTES) {
  test(`${route}: German, same-origin only, nothing stored, no beacon, no CSP violation, every control used`, async ({ page, baseURL }) => {
    test.slow();
    markSlow('the long Retention page timed out at 30 s on a loaded WebKit runner', route === '/de/work/retention');
    const seen = await record(page);
    const response = await page.goto(route);
    expect(response?.ok(), route).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    const used = await useEveryControl(page);
    expect(used.idle, `${route}: every Figure with a control had one used, not only Reset`).toEqual([]);
    await page.mouse.wheel(0, 4000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForLoadState('networkidle');
    // Leaving the page would send a last beacon (pagehide), if a German page had one.
    await page.goto('about:blank');

    const origin = new URL(baseURL!).origin;
    const urls = seen.urls.filter((u) => !u.startsWith('about:') && !u.startsWith('data:'));
    expect(urls.filter((u) => new URL(u).origin !== origin), 'requests to another origin').toEqual([]);
    // No German page is assigned or counted: no beacon, no API call and no read of the published data.
    expect(urls.filter(apiOrData), 'API or data calls').toEqual([]);
    expect(seen.violations).toEqual([]);

    await page.goto(route);
    expect(await stored(page)).toEqual(NOTHING);
  });
}

test('"Diese Website speichert Ihre Sprachwahl nirgends": switching language there and back stores nothing', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const seen = await record(page);
  await page.goto('/de/privacy#cookies-and-storage');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await waitForHydration(page.locator('[data-language-menu] a[hreflang="en"]'));
  await page.locator('[data-language-menu] summary').click();
  await page.locator('[data-language-menu] a[hreflang="en"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(new URL(page.url()).pathname).toBe('/privacy');
  expect(await stored(page)).toEqual(NOTHING);

  await page.locator('[data-language-menu] summary').click();
  await page.locator('[data-language-menu] a[hreflang="de"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  expect(new URL(page.url()).pathname).toBe('/de/privacy');
  expect(await stored(page)).toEqual(NOTHING);

  // A fresh visit to the English page is English again: nothing remembered the last choice.
  await page.goto('/privacy');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  const origin = new URL(baseURL!).origin;
  const urls = seen.urls.filter((u) => !u.startsWith('about:') && !u.startsWith('data:'));
  expect(urls.filter((u) => new URL(u).origin !== origin), 'requests to another origin').toEqual([]);
  expect(urls.filter(apiOrData), 'API or data calls').toEqual([]);
  expect(seen.violations).toEqual([]);
});

test('"Die Spracheinstellung ... wird nicht ausgewertet": the address alone picks the language', async ({ request }) => {
  for (const [path, acceptLanguage, lang] of [
    ['/privacy', 'de-DE,de;q=0.9', 'en'],
    ['/work', 'de', 'en'],
    ['/de/privacy', 'en-US,en;q=0.9', 'de'],
    ['/de/privacy', 'fr-FR', 'de'],
  ] as const) {
    const res = await request.get(path, { headers: { 'accept-language': acceptLanguage }, maxRedirects: 0 });
    expect(res.status(), `${path} with ${acceptLanguage}`).toBe(200);
    expect(await res.text(), `${path} with ${acceptLanguage}`).toMatch(new RegExp(`<html[^>]*\\slang="${lang}"`));
    // The response does not vary by the header, so no cache keeps one copy per browser language.
    expect((res.headers()['vary'] ?? '').toLowerCase(), path).not.toContain('accept-language');
  }
});

test('the home page in a German-language browser stays English at its own address', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await context.close();
});
