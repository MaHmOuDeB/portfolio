// The real home page, served at / (the proxy rewrites it to /v/a or /v/b), end to end: its sections in
// page order, the headlines of the reader's group with both strings in the HTML for sizing, the same
// card geometry in both groups (forced with ?variant=, never a header bypass), the real next/link card
// counted once with its secondary click, soft returns that never count a second entry, the uncounted
// middle click, the note's "as of" time by the reader's clock, and a payload with no raw statistic.
// The e2e run is in the calibration, so both groups show group A's headlines.
// The scroll moment's "your view" tick under the home page's own rule (ceiling day, stale at render)
// runs on the test build's host, whose fixtures fix the render time.
import { expect, type Page, type Request } from '@playwright/test';
import { readView } from '../../src/lib/experiment/store';
import { createRedisRest } from '../../src/lib/experiment/redis-rest';
import { E2E_FAKE_UPSTASH_URL, E2E_KV_READ_TOKEN } from './constants';
import { test, waitForIslands } from './fixtures';

const CARDS = '[data-experiment="cards"]';
const read = createRedisRest({ url: E2E_FAKE_UPSTASH_URL, token: E2E_KV_READ_TOKEN });

type Item = { type: string; reject?: string };
type Batch = { v: 1; ns: string; pv: string; arm: 'a' | 'b'; events: Item[] };
type Sent = { batch: Batch; request: Request; response: Promise<Record<string, unknown> | null> };

/** One visitor: its own address, every request to anything named /api/e, and the batches it could read. */
async function visitor(page: Page, extra: Record<string, string> | undefined, o: { counted: boolean }) {
  await page.setExtraHTTPHeaders({ ...extra });
  if (o.counted) {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
    });
  }
  const sent: Sent[] = [];
  const endpoints: URL[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.includes('/api/e')) return;
    endpoints.push(url);
    if (request.method() !== 'POST') return;
    let batch: Batch | null = null;
    try {
      batch = JSON.parse(request.postData() ?? 'null') as Batch | null;
    } catch {
      batch = null;
    }
    if (batch === null) return;
    const response = request
      .response()
      .then((r) => (r === null ? null : r.json().catch(() => null)))
      .catch(() => null) as Promise<Record<string, unknown> | null>;
    sent.push({ batch, request, response });
  });
  return { sent, endpoints };
}

async function countedEntry(sent: Sent[]): Promise<Batch> {
  await expect.poll(() => sent.some((s) => s.batch.events[0]?.type === 'entry'), { timeout: 10_000 }).toBe(true);
  const s = sent.find((x) => x.batch.events[0]?.type === 'entry')!;
  expect(s.batch.events).toEqual([{ type: 'entry' }]);
  expect(await s.response).toMatchObject({ ok: true, results: [{ type: 'entry', outcome: 'counted' }] });
  return s.batch;
}

async function claims(ns: string, pv: string, types: string[]): Promise<unknown> {
  const view = await readView(read, { ns, pv, closed: false, expiry: false });
  return types.map((type) => view.claims[type as 'entry'] ?? null);
}

/** The headline group each card shows, and how many headlines are announced. */
async function shownHeadlines(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-case-card]')].map((card) => ({
      shown: [...card.querySelectorAll('[data-headline-twin][data-headline-shown]')].map((t) => t.getAttribute('data-headline-twin')),
      hidden: [...card.querySelectorAll('[data-headline-twin]:not([data-headline-shown])')].map((t) => [t.getAttribute('data-headline-twin'), t.getAttribute('aria-hidden'), getComputedStyle(t).visibility]),
    })),
  );
}

test.describe('the home page at /', () => {
  test('its sections in page order, one h1, group A’s headlines in the calibration, both strings in the HTML', async ({ page, request }) => {
    for (const variant of ['a', 'b']) {
      const html = await (await request.get(`/?variant=${variant}`)).text();
      // Both strings of every card are in view-source (the hidden one keeps the card's size).
      expect(html.match(/data-headline-twin="a"/g)).toHaveLength(3);
      expect(html.match(/data-headline-twin="b"/g)).toHaveLength(3);
      await page.goto(`/?variant=${variant}`);
      const order = await page.evaluate(() =>
        [...document.querySelectorAll('[data-hero], [data-home-note], [data-experiment="cards"], [data-scroll-moment], [data-home-tools]')].map(
          (el) => ['data-hero', 'data-home-note', 'data-experiment', 'data-scroll-moment', 'data-home-tools'].find((a) => el.hasAttribute(a)),
        ),
      );
      expect(order).toEqual(['data-hero', 'data-home-note', 'data-experiment', 'data-scroll-moment', 'data-home-tools']);
      await expect(page.locator('h1')).toHaveCount(1);
      // The calibration shows group A's headlines to both groups; only the shown twin is visible and announced.
      expect(await shownHeadlines(page)).toEqual(Array.from({ length: 3 }, () => ({ shown: ['a'], hidden: [['b', 'true', 'hidden']] })));
    }
  });

  test('the same card geometry in both groups, forced with ?variant=', async ({ browser, baseURL }) => {
    const measure = async (variant: string, size: { width: number; height: number }) => {
      const context = await browser.newContext({ baseURL, viewport: size });
      const page = await context.newPage();
      // Measured once hydrated (the beacon has posted) and every island has settled: the note's
      // "Updated" time and the planner swap in only then, in both groups alike.
      const hydrated = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/e', { timeout: 15_000 });
      await page.goto(`/?variant=${variant}`);
      await hydrated;
      await waitForIslands(page);
      await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
      const boxes = await page.evaluate(() => {
        const out: Record<string, number[]> = {};
        const put = (k: string, el: Element | null) => {
          const r = el!.getBoundingClientRect();
          out[k] = [r.x + scrollX, r.y + scrollY, r.width, r.height].map((v) => Math.round(v * 10) / 10);
        };
        put('region', document.querySelector('[data-experiment="cards"]'));
        for (const card of document.querySelectorAll('[data-case-card]')) {
          const s = card.getAttribute('data-case-card');
          put(`${s}:card`, card);
          put(`${s}:headline`, card.querySelector('[data-case-headline]'));
          put(`${s}:link`, card.querySelector('[data-experiment-click="card"]'));
        }
        return out;
      });
      await context.close();
      return boxes;
    };
    for (const size of [{ width: 375, height: 812 }, { width: 1024, height: 576 }, { width: 1440, height: 900 }]) {
      expect(await measure('b', size), `${size.width}x${size.height}`).toEqual(await measure('a', size));
    }
  });

  test('a direct /v/a or /v/b stays the 404 page', async ({ request }) => {
    for (const path of ['/v/a', '/v/b']) expect((await request.get(path)).status(), path).toBe(404);
  });

  test('metadata: no relative canonical, no noindex', async ({ page }) => {
    await page.goto('/');
    // This build has no production host, so no canonical (a relative one is invalid); the production
    // build names https://<host>/ (unit-tested in page.test.tsx).
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    await expect(page).toHaveTitle('Mahmoud El Bergui');
  });

  test('the HTML and the RSC payload carry no raw statistic and no Home model field', async ({ request }) => {
    const bodies = [
      await (await request.get('/?variant=a')).text(),
      await (await request.get('/?variant=b')).text(),
      await (await request.get('/', { headers: { RSC: '1' } })).text(),
    ];
    for (const body of bodies) {
      for (const key of ['chi2', 'funnel', 'beaconsReceived', 'flaggedLook', 'detectable', 'ceilingDays', 'hasCeilingDay', 'testNote', 'splitStatus', 'closureMismatch', 'afterDecisionSrm', 'yourViewN', 'itt', 'looks']) {
        expect(body, key).not.toMatch(new RegExp(`\\\\?"${key}\\\\?":`));
      }
    }
    // The payload did hold the scroll moment's client props (else this would prove nothing). Whether a
    // chart entry (and its tickFrom) is in it depends on the store's counts at the last regeneration.
    expect(bodies[0]).toMatch(/\\"charts\\":\[/);
  });
});

test.describe('counting on the home page', () => {
  test('the real card link: entry, in view, card and secondary once each, one namespace, only POST /api/e', async ({ page, extraHTTPHeaders }) => {
    const { sent, endpoints } = await visitor(page, extraHTTPHeaders, { counted: true });
    await page.goto('/');
    const entry = await countedEntry(sent);
    await page.locator(CARDS).scrollIntoViewIfNeeded();
    await expect.poll(() => claims(entry.ns, entry.pv, ['inview']), { timeout: 10_000 }).toEqual([entry.arm]);
    const card = page.locator('[data-case-card="audible"] [data-experiment-click="card"]');
    await expect(card).toHaveAttribute('href', '/work/audible#why-so-many');
    // The link is prefetched, so the click navigates on the client: wait for the URL, not a request.
    await card.click();
    await expect(page).toHaveURL(/\/work\/audible#why-so-many$/);
    await expect(page.locator('#why-so-many')).toBeAttached();
    await expect.poll(() => claims(entry.ns, entry.pv, ['entry', 'inview', 'card', 'secondary']), { timeout: 10_000 }).toEqual([
      entry.arm, entry.arm, entry.arm, entry.arm,
    ]);
    const mine = sent.filter((s) => s.batch.pv === entry.pv);
    expect(new Set(sent.map((s) => s.batch.ns))).toEqual(new Set([entry.ns]));
    for (const type of ['entry', 'inview', 'card', 'secondary']) {
      expect(mine.flatMap((s) => s.batch.events).filter((e) => e.type === type).length, type).toBeLessThanOrEqual(1);
    }
    expect(endpoints.length).toBeGreaterThan(0);
    for (const url of endpoints) expect([url.pathname, url.search]).toEqual(['/api/e', '']);
  });

  test('soft returns (the wordmark, Back, a prefetched /) redraw group A’s headlines and never count a second entry', async ({ page, extraHTTPHeaders }) => {
    const { sent } = await visitor(page, extraHTTPHeaders, { counted: true });
    await page.goto('/');
    await countedEntry(sent);
    await page.evaluate(() => {
      (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
    });
    const sameDocument = () => page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument === true);
    const wordmark = page.locator('[data-site-header] a[href="/"]');
    const softTo = async (path: string) => {
      await page.evaluate((p) => (window as unknown as { next: { router: { push(h: string): void } } }).next.router.push(p), path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    };
    const expectHome = async () => {
      await expect(page.locator(CARDS)).toBeVisible();
      expect((await shownHeadlines(page)).map((c) => c.shown)).toEqual([['a'], ['a'], ['a']]);
    };
    await wordmark.click();
    await expectHome();
    await softTo('/exclude');
    await wordmark.click();
    await expect(page).toHaveURL(/\/$/);
    await expectHome();
    await softTo('/exclude');
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expectHome();
    expect(await sameDocument()).toBe(true);
    await page.waitForTimeout(1000);
    const entries = sent.filter((s) => s.batch.events[0]?.type === 'entry');
    expect(entries.filter((s) => s.batch.events[0]!.reject === undefined)).toHaveLength(1);
    expect(entries.slice(1).every((s) => s.batch.events[0]!.reject === 'not_entry')).toBe(true);
  });

  test('a middle click on a card is not counted (no auxclick listener)', async ({ page, extraHTTPHeaders }) => {
    const { sent } = await visitor(page, extraHTTPHeaders, { counted: true });
    await page.goto('/');
    const entry = await countedEntry(sent);
    const popup = page.context().waitForEvent('page', { timeout: 3000 }).catch(() => null);
    await page.locator('[data-case-card="retention"] [data-experiment-click="card"]').click({ button: 'middle' });
    await (await popup)?.close();
    await page.waitForTimeout(1500);
    expect(page.url()).toMatch(/\/$/);
    expect(sent.filter((s) => s.batch.pv === entry.pv).flatMap((s) => s.batch.events).map((e) => e.type)).not.toContain('card');
    expect(await claims(entry.ns, entry.pv, ['card', 'secondary'])).toEqual([null, null]);
  });
});

test.describe('the note’s time by the reader’s clock', () => {
  /** The note island's own props, read from the payload in the HTML. */
  async function timing(page: Page): Promise<{ readAt: string; plannedEnd: string }> {
    const html = await (await page.request.get('/?variant=a')).text();
    const readAt = /\\"readAt\\":\\"([^\\"]+)\\"/.exec(html)?.[1];
    const plannedEnd = /\\"plannedEnd\\":\\"([^\\"]+)\\"/.exec(html)?.[1];
    expect(readAt && plannedEnd, 'the note island is on the page').toBeTruthy();
    return { readAt: readAt!, plannedEnd: plannedEnd! };
  }
  const hydrated = (page: Page) => page.waitForRequest((r) => new URL(r.url()).pathname === '/api/e', { timeout: 15_000 });

  test('fresh by the reader’s clock: no time; past the planned end: the "Updated" time appears after hydration', async ({ page }) => {
    const t = await timing(page);
    await page.clock.setFixedTime(new Date(Date.parse(t.readAt) + 60_000));
    const ready = hydrated(page);
    await page.goto('/?variant=a');
    await ready;
    await page.waitForTimeout(500);
    await expect(page.locator('[data-home-note] time')).toHaveCount(0);

    await page.clock.setFixedTime(new Date(Date.parse(t.plannedEnd) + 86_400_000));
    const again = hydrated(page);
    await page.goto('/?variant=a');
    await again;
    await expect(page.locator('[data-home-note] time')).toHaveText(/^Updated /);
  });

  test('without JavaScript, no time is shown', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/?variant=a');
    await expect(page.locator('[data-home-note]')).toBeVisible();
    await expect(page.locator('[data-home-note] time')).toHaveCount(0);
    await context.close();
  });
});

test.describe('the "your view" tick under the home page’s own rule (test build host)', () => {
  const scroll = (state: string) => `/kitchen-sink/home/scroll/${state}`;
  for (const [state, drawn] of [['home-fresh', true], ['home-ceiling-day', false], ['home-stale-at-render', false]] as const) {
    test(`${state}: ${drawn ? 'a tick after a counted view of this group' : 'no tick start in the payload and none drawn after a counted view of this group'}`, async ({ browser, baseURL }) => {
      const html = await (await (await browser.newContext({ baseURL })).request.get(scroll(state))).text();
      const starts = [...html.matchAll(/\\"tickFrom\\":(null|\d+)/g)].map((m) => m[1]);
      expect(starts.length).toBeGreaterThan(0);
      if (drawn) expect(starts.some((s) => s !== 'null')).toBe(true);
      else expect(starts.every((s) => s === 'null')).toBe(true);

      const context = await browser.newContext({ baseURL, viewport: { width: 1024, height: 768 } });
      const page = await context.newPage();
      await page.goto(scroll(state));
      await expect(page.locator('[data-scroll-moment] [data-home-chart]:not([data-measured])')).toHaveCount(0, { timeout: 15_000 });
      await expect(page.locator('[data-scroll-canvas] [data-home-chart][data-measured]')).toHaveCount(1, { timeout: 15_000 });
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('experiment:counted', { detail: { arm: 'b', viewN: 1e9 } })));
      if (drawn) await expect(page.locator('[data-scroll-canvas] [data-your-view]')).toHaveCount(1);
      else {
        await page.waitForTimeout(500);
        await expect(page.locator('[data-scroll-moment] [data-your-view]')).toHaveCount(0);
      }
      await context.close();
    });
  }
});
