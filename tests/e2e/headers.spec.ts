import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test } from './fixtures';

// The production build the Playwright server runs sends the baseline security headers. These specs
// also prove the policy does not break the site: Next's inline bootstrap must run under it.

const POLICY_ERROR = /content security policy|refused to (load|execute|apply|connect)/i;

/** Loads a page and returns every CSP violation the browser reported, by either channel. */
async function violationsOn(page: Page, path: string): Promise<string[]> {
  const seen: string[] = [];
  page.on('console', (m) => {
    if (POLICY_ERROR.test(m.text())) seen.push(`console: ${m.text()}`);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`securitypolicyviolation ${e.violatedDirective} ${e.blockedURI}`);
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

// Must equal E2E_EXCLUDE_TOKEN in playwright.config.ts.
const TOKEN = 'e2e-exclude-token-0f3a9c1d';

test('a wrong token sets no cookie', async ({ page, context }) => {
  const response = await page.request.post('/api/exclude', { data: { t: 'not-the-token' } });
  expect(response.status()).toBe(403);
  expect(response.headers()['set-cookie']).toBeUndefined();
  expect(await context.cookies()).toEqual([]);
});

test('the private link sets the owner cookie, clears the fragment, and the button clears the cookie', async ({ page, context, browserName }) => {
  // WebKit refuses a Secure cookie over plain http://localhost; production is https.
  test.skip(browserName === 'webkit', 'WebKit stores no Secure cookie over http');
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(`/exclude#t=${TOKEN}`);
  await expect(page.getByRole('status')).toHaveText('This browser is now left out of the counts.');

  // The fragment never reaches the server, and is gone from the address bar and the history entry.
  expect(requests.filter((u) => u.includes(TOKEN))).toEqual([]);
  expect(page.url()).not.toContain(TOKEN);
  expect(page.url()).not.toContain('#');
  expect(await page.evaluate(() => `${location.href} ${history.length}`)).not.toContain(TOKEN);

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
