// No page prefetches the home page. The proxy draws a group afresh for every request to / (src/proxy.ts),
// and Next 16.4 re-requests a prefetched / whose segment comes back for the other group: in Chromium
// several of those requests never finish, so `networkidle` never arrives. Every link to / must therefore be
// `prefetch={false}`. This spec loads pages that link to /, in view and on hover, and checks that no
// request for / or one of its segments is made, and that the network goes idle.
import { expect, type Page } from '@playwright/test';
import { test, waitForHydration } from './fixtures';
import { markSlow } from './slow';

/** Records every request for / other than a document load: RSC payloads, segment and route prefetches. */
function homeRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.pathname !== '/' || r.resourceType() === 'document') return;
    const headers = r.headers();
    if (url.searchParams.has('_rsc') || headers.rsc !== undefined || headers['next-router-prefetch'] !== undefined) {
      seen.push(`${r.method()} ${url.pathname}${url.search} ${headers['next-router-segment-prefetch'] ?? ''}`.trim());
    }
  });
  return seen;
}

// /work/retention links to /#hero-planner near its end, so it is scrolled to the bottom as well.
for (const route of ['/', '/privacy', '/lab', '/work/retention']) {
  test(`${route}: no prefetch of /, and the network goes idle`, async ({ page }) => {
    markSlow('the long Retention page is loaded and scrolled to its end', route === '/work/retention');
    const requests = homeRequests(page);
    const response = await page.goto(route);
    expect(response?.ok(), route).toBe(true);
    // A short, explicit budget: under the 16.4 re-request loop this wait is what never ends.
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    // Hovering the wordmark is the other trigger of a prefetch, once the link is hydrated: a hover
    // that came earlier could not prefetch, and the check below would pass without testing it.
    await waitForHydration(page.locator('[data-site-header] a[href="/"]'));
    await page.locator('[data-site-header] a[href="/"]').hover();
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
    await page.waitForTimeout(1000);
    expect(requests, 'requests for / or its segments').toEqual([]);
  });
}
