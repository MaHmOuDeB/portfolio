// /demo in a browser: the interview links. The page is served noindex/follow and sends nothing to
// /api/e. Each forced link opens the home page in the asked group through the existing proxy, and the
// real beacon refuses that view as forced: nothing of it is counted in the local store, whatever the
// visitor does next. What the view shows follows the frozen design (group A's headlines in both groups
// during the calibration). The Lab links open their Figures with the linked settings once the islands
// load. At 1024x576 CSS px (1280x720 at 125%), every link is visible and reachable with the keyboard.
import { expect, type Page, type Request } from '@playwright/test';
import { createRedisRest } from '../../src/lib/experiment/redis-rest';
import { readView } from '../../src/lib/experiment/store';
import { EXPERIMENT } from '../../src/experiment.values';
import { E2E_FAKE_UPSTASH_URL, E2E_KV_READ_TOKEN } from './constants';
import { expectNoA11yViolations, test } from './fixtures';

const DEMO = '/demo';
const FORCED = [
  ['a', "Group A's home page", '/?variant=a'],
  ['b', "Group B's home page", '/?variant=b'],
] as const;
const PEEKING = ['Peeking at results', '/lab/peeking?peeking.preset=interview'] as const;
const PLANNER = ['Sample size for a small rise', '/lab?planner.baseline=0.05&planner.risePoints=1&duration.traffic=1000#sample-size'] as const;
const LAB = ['All the examples in the Lab', '/lab'] as const;
const HREFS = [...FORCED.map(([, , href]) => href), PEEKING[1], PLANNER[1], LAB[1]];
// The entry, then every event a counted view could add to the store.
const OUTCOMES = ['entry', 'inview', 'engaged', 'card', 'secondary', 'contact', 'cv'] as const;
const CARDS = '[data-experiment="cards"]';

const read = createRedisRest({ url: E2E_FAKE_UPSTASH_URL, token: E2E_KV_READ_TOKEN });

type Batch = { v: 1; ns: string; pv: string; arm: 'a' | 'b'; events: { type: string; reject?: string }[] };
type Sent = { batch: Batch; request: Request; response: Promise<Record<string, unknown> | null> };

/**
 * One visitor whose browser does not report automation (otherwise the beacon refuses it as a bot
 * before it can look at the forced flag), with every batch it posts to /api/e and its response.
 */
async function visitor(page: Page, headers: Record<string, string> | undefined): Promise<Sent[]> {
  await page.setExtraHTTPHeaders({ ...headers });
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
  });
  const sent: Sent[] = [];
  page.on('request', (request) => {
    if (!request.url().endsWith('/api/e') || request.method() !== 'POST') return;
    let batch: Batch | null = null;
    try {
      batch = JSON.parse(request.postData() ?? 'null') as Batch | null;
    } catch {
      batch = null;
    }
    // A sendBeacon body is not always readable here; it still counts as a request to /api/e.
    const response = request
      .response()
      .then((r) => (r === null ? null : r.json().catch(() => null)))
      .catch(() => null) as Promise<Record<string, unknown> | null>;
    sent.push({ batch: batch ?? ({ v: 1, ns: '', pv: '', arm: 'a', events: [] } as Batch), request, response });
  });
  return sent;
}

/**
 * What the store holds for this view. The event route reserves every entry before it looks at the
 * reason to refuse it (a `pending:<owner>` claim that dedupes a re-sent entry and expires with the
 * view's id), and only a counted entry turns that claim into its group. So a view that was not
 * counted has no entry claim or an unfinished reservation with an expiry, and no other claim.
 */
async function expectNotCounted(ns: string, pv: string): Promise<void> {
  const view = await readView(read, { ns, pv, closed: false, expiry: true });
  const entry = view.claims.entry ?? null;
  expect(entry === null || /^pending:[0-9a-f]+$/.test(entry), `entry claim ${entry}`).toBe(true);
  if (entry !== null) expect(view.entryExpiry, 'the reservation expires').toBeGreaterThan(0);
  expect(OUTCOMES.slice(1).map((type) => view.claims[type] ?? null)).toEqual(OUTCOMES.slice(1).map(() => null));
}

const main = (page: Page) => page.getByRole('main');

test.describe('/demo', () => {
  test('is served as HTML that may be followed but not indexed, and lists its links in order', async ({ page, request }) => {
    const response = await request.get(DEMO);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toMatch(/<meta name="robots" content="noindex, follow"\/>/);
    await page.goto(DEMO);
    await expect(page).toHaveTitle('Interview links');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Interview links');
    const hrefs = await main(page).getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs).toEqual(HREFS);
    await expectNoA11yViolations(page);
  });

  test('sends nothing to /api/e and stores nothing in the browser', async ({ page, context, extraHTTPHeaders }) => {
    const sent = await visitor(page, extraHTTPHeaders);
    // the page itself, not the 404 page: an absent route would pass the rest vacuously
    expect((await page.goto(DEMO))?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Interview links');
    await page.waitForLoadState('networkidle');
    await page.mouse.wheel(0, 2000);
    await page.mouse.click(5, 5);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(1500);
    await page.goto('about:blank');
    expect(sent).toEqual([]);
    expect(await context.cookies()).toEqual([]);
  });

  for (const [arm, label] of FORCED) {
    test(`"${label}" opens group ${arm}, the beacon refuses the view as forced, and nothing of it is counted`, async ({ page, context, extraHTTPHeaders }) => {
      const sent = await visitor(page, extraHTTPHeaders);
      await page.goto(DEMO);
      await page.waitForLoadState('networkidle');
      expect(sent, 'the demo page itself posts nothing').toEqual([]);

      await main(page).getByRole('link', { name: label, exact: true }).click();
      await page.waitForURL((url) => url.pathname === '/' && url.search === `?variant=${arm}`);
      // a full document load of the forced address, which the proxy assigned (not a soft navigation)
      expect(await page.evaluate(() => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).name)).toMatch(new RegExp(`/\\?variant=${arm}$`));

      // The real beacon: one refused entry, for the asked group, refused as forced by the server.
      await expect.poll(() => sent.length, { timeout: 10_000 }).toBeGreaterThan(0);
      const first = sent[0]!;
      expect(first.batch.events).toEqual([{ type: 'entry', reject: 'forced' }]);
      expect(first.batch.arm).toBe(arm);
      expect(await first.response).toEqual({ ok: false, reason: 'forced' });

      // The frozen design: group A's headlines in both groups while calibrating, the asked group's in the A/B.
      const shown = EXPERIMENT.phase === 'calibration' ? 'a' : arm;
      await expect(page.locator(`[data-headline-twin="${shown}"]:not([aria-hidden="true"])`)).toHaveCount(3);
      await expect(page.locator('[data-headline-twin]:not([aria-hidden="true"])')).toHaveCount(3);

      // Everything a counted view would do next: the cards in view past the dwell, an interaction,
      // a key press and leaving the page. None of it is sent or counted.
      await page.locator(CARDS).scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);
      await page.mouse.wheel(0, 200);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
      await page.goto('about:blank');
      await page.waitForTimeout(500);
      expect(sent.map((s) => s.batch.events), 'one refused entry and nothing else').toEqual([[{ type: 'entry', reject: 'forced' }]]);
      await expectNotCounted(first.batch.ns, first.batch.pv);
      expect(await context.cookies()).toEqual([]);
    });
  }

  test('clicking the forced links in turn in one tab always opens the asked group', async ({ page, extraHTTPHeaders }) => {
    // The prefetches of / (the header wordmark) and of both links are in place before any click, so
    // a link that reused a cached payload would show the wrong group here.
    const sent = await visitor(page, extraHTTPHeaders);
    await page.goto(DEMO);
    await page.waitForLoadState('networkidle');
    for (const [arm, label] of [FORCED[1], FORCED[0], FORCED[1]]) {
      const from = sent.length;
      await main(page).getByRole('link', { name: label, exact: true }).click();
      await page.waitForURL((url) => url.pathname === '/' && url.search === `?variant=${arm}`);
      await expect.poll(() => sent.length, { timeout: 10_000 }).toBeGreaterThan(from);
      expect(sent[from]!.batch.arm, label).toBe(arm);
      expect(sent[from]!.batch.events, label).toEqual([{ type: 'entry', reject: 'forced' }]);
      // answered before leaving, so no unload flush of this view lands among the next click's batches
      expect(await sent[from]!.response, label).toEqual({ ok: false, reason: 'forced' });
      // back to the same /demo document when the browser keeps it (back/forward cache), whose
      // router still holds its prefetches; no idle wait, which a restored page may never reach
      await page.goBack();
      await expect(page).toHaveURL(/\/demo$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Interview links');
    }
  });

  test('the peeking link opens the interview preset after hydration', async ({ page }) => {
    await page.goto(DEMO);
    await main(page).getByRole('link', { name: PEEKING[0], exact: true }).click();
    await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === PEEKING[1]);
    const figure = page.locator('figure[data-figure="peeking"]');
    await expect(page.locator('[data-island]', { has: figure })).toHaveAttribute('data-island', 'ready');
    await expect(figure.getByRole('slider', { name: 'Looks' })).toHaveValue('20');
    await expect(figure.getByRole('radio', { name: 'Peek daily' })).toBeChecked();
    await expect(figure.getByRole('radio', { name: 'None' })).toBeChecked();
  });

  test('the planner link opens the planner section with its baseline, rise and traffic after hydration', async ({ page }) => {
    await page.goto(DEMO);
    await main(page).getByRole('link', { name: PLANNER[0], exact: true }).click();
    await expect(page).toHaveURL((url) => `${url.pathname}${url.search}${url.hash}` === PLANNER[1]);
    const planner = page.locator('figure[data-figure="planner"]');
    const duration = page.locator('figure[data-figure="duration"]');
    await expect(page.locator('[data-island]', { has: planner })).toHaveAttribute('data-island', 'ready');
    await expect(planner.getByRole('slider', { name: 'Baseline conversion' })).toHaveValue('0.05');
    await expect(planner.getByRole('slider', { name: 'Rise to detect' })).toHaveValue('1');
    await expect(planner.getByRole('radio', { name: 'Points' })).toBeChecked();
    await expect(duration.getByRole('slider', { name: 'Total visitors per day' })).toHaveValue('1000');
    await expect(page.locator('#sample-size-title')).toBeInViewport();
  });

  test('without JavaScript: the links are plain links, and the planner link shows the default settings, as the page says', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(DEMO);
    const hrefs = await main(page).getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs).toEqual(HREFS);
    await expect(main(page)).toContainText('Without JavaScript, the planner shows its default settings instead.');
    await page.goto(PLANNER[1]);
    const planner = page.locator('figure[data-figure="planner"]');
    await expect(planner.getByText('Controls need JavaScript.')).toBeVisible();
    await expect(planner.locator('[data-figure-result]')).toContainText('from 29% to 34%');
    await context.close();
  });

  test('every link resolves, and the planner link lands on a section that exists', async ({ request, page }) => {
    for (const href of HREFS) {
      const res = await request.get(href, { maxRedirects: 0 });
      expect(res.status(), href).toBe(200);
    }
    await page.goto(PLANNER[1]);
    await expect(page.locator('#sample-size')).toHaveCount(1);
  });

  test('@matrix at 1024x576 every link is visible, unclipped and reachable with Tab, without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 576 });
    await page.goto(DEMO);
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const focused: string[] = [];
    for (let i = 0; i < 40 && focused.length < HREFS.length; i++) {
      await page.keyboard.press('Tab');
      const href = await page.evaluate(() => {
        const el = document.activeElement;
        return el instanceof HTMLAnchorElement && el.closest('main') !== null ? el.getAttribute('href') : null;
      });
      if (href === null || focused.includes(href)) continue;
      focused.push(href);
      const link = main(page).locator(`a[href="${href}"]`);
      await expect(link, href).toBeFocused();
      await expect(link, href).toBeInViewport({ ratio: 1 });
      const box = (await link.boundingBox())!;
      expect(box.x, href).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, href).toBeLessThanOrEqual(width);
      expect(box.height, href).toBeGreaterThanOrEqual(44);
      // the whole label shows: nothing is cut off inside the link
      expect(await link.evaluate((a) => a.scrollWidth <= a.clientWidth + 1), href).toBe(true);
    }
    expect(focused).toEqual(HREFS);
  });
});
