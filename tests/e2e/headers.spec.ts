import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { E2E_EXCLUDE_TOKEN as TOKEN } from './constants';
import { test } from './fixtures';

// The production build the Playwright server runs sends the baseline security headers. These specs
// also prove the policy does not break the site: Next's inline bootstrap must run under it.

// Both channels end up in this one pattern: the browser's own console message, and the line the
// securitypolicyviolation listener below writes ("Content Security Policy violation: <directive> <uri>").
const POLICY_ERROR = /content security policy|refused to (load|execute|apply|connect)/i;

/** Loads a page and returns every CSP violation the browser reported, by either channel. */
async function violationsOn(page: Page, path: string): Promise<string[]> {
  const seen: string[] = [];
  page.on('console', (m) => {
    if (POLICY_ERROR.test(m.text())) seen.push(`console: ${m.text()}`);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  const response = await page.goto(path);
  expect(response?.ok(), path).toBe(true);
  await page.waitForLoadState('networkidle');
  return seen;
}

for (const path of ['/', '/kitchen-sink']) {
  test(`${path} sends the baseline headers and loads without a CSP violation`, async ({ page }) => {
    const seen = await violationsOn(page, path);
    expect(seen).toEqual([]);
    const response = await page.request.get(path);
    const csp = response.headers()['content-security-policy'] ?? '';
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(response.headers()['permissions-policy']).toContain('geolocation=()');
  });
}

test('the CSP detector catches a third-party request, by event and by console', async ({ page }) => {
  const seen = await violationsOn(page, '/');
  expect(seen).toEqual([]);
  await page.evaluate(() => fetch('https://example.invalid/').catch(() => {}));
  await expect.poll(() => seen.some((line) => /violation: connect-src/.test(line)), 'the securitypolicyviolation event').toBe(true);
  await expect.poll(() => seen.some((line) => /Refused to connect/i.test(line)), "the browser's console message").toBe(true);
});

test('the page hydrates under the policy', async ({ page }) => {
  const seen = await violationsOn(page, '/');
  // The inline script in the document head sets this attribute before anything else runs.
  await expect(page.locator('html')).toHaveAttribute('data-js', '');
  expect(seen).toEqual([]);
});

test('/exclude sends no referrer and is not cached', async ({ page }) => {
  const response = await page.request.get('/exclude');
  expect(response.status()).toBe(200);
  expect(response.headers()['referrer-policy']).toBe('no-referrer');
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(response.headers()['content-security-policy']).toContain("connect-src 'self'");
});

test('/exclude is not indexed and shows its heading', async ({ page }) => {
  const seen = await violationsOn(page, '/exclude#');
  expect(seen).toEqual([]);
  await expect(page.locator('h1')).toHaveText('Leave this browser out of the experiment');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});

test('a wrong token sets no cookie', async ({ page, context }) => {
  const response = await page.request.post('/api/exclude', { data: { t: 'not-the-token' } });
  expect(response.status()).toBe(403);
  expect(response.headers()['set-cookie']).toBeUndefined();
  expect(await context.cookies()).toEqual([]);
});

test('the private link sets the owner cookie, clears the fragment, and the button clears the cookie', async ({ page, context, browserName }) => {
  // WebKit refuses a Secure cookie over plain http://localhost; production is https.
  test.skip(browserName === 'webkit', 'WebKit stores no Secure cookie over http');
  const requests: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  await page.goto(`/exclude#t=${TOKEN}`);
  await expect(page.getByRole('status')).toHaveText('This browser is now left out of the counts.');

  // The token travels once, in the body of the POST to /api/exclude, and in no URL.
  expect(requests.filter((r) => r.url.includes(TOKEN))).toEqual([]);
  expect(requests.filter((r) => r.body?.includes(TOKEN))).toEqual([
    expect.objectContaining({ method: 'POST', url: expect.stringMatching(/\/api\/exclude$/) }),
  ]);

  // The fragment is gone from the address bar and from every navigation entry.
  expect(page.url()).not.toContain(TOKEN);
  expect(page.url()).not.toContain('#');
  expect(await page.evaluate(() => location.hash)).toBe('');
  if (browserName === 'chromium') {
    const entries = await page.evaluate(() =>
      (window as unknown as { navigation: { entries(): { url: string }[] } }).navigation.entries().map((e) => e.url),
    );
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.filter((u) => u.includes(TOKEN) || u.includes('#'))).toEqual([]);
  }

  const [cookie] = await context.cookies();
  expect(cookie).toMatchObject({ name: 'exp-self', path: '/api/e', httpOnly: true, secure: true, sameSite: 'Strict' });
  expect(cookie?.value).toMatch(/^[0-9a-f]{64}$/);
  expect(cookie?.value).not.toContain(TOKEN);
  // Scripts cannot read it, and no Web Storage was written.
  expect(await page.evaluate(() => document.cookie)).toBe('');
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);

  await page.getByRole('button', { name: 'Count this browser again' }).click();
  await expect(page.getByRole('status')).toHaveText('This browser is counted again.');
  expect(await context.cookies()).toEqual([]);
});

test('a wrong fragment token says so and sets no cookie', async ({ page, context }) => {
  await page.goto('/exclude#t=wrong');
  await expect(page.getByRole('status')).toHaveText('The link was not accepted. Check it and try again.');
  expect(await context.cookies()).toEqual([]);
});

test('without a fragment the page waits for the private link', async ({ page, context }) => {
  await page.goto('/exclude');
  await expect(page.getByRole('status')).toHaveText(/private link/);
  expect(await context.cookies()).toEqual([]);
});
