// The live experiment in the browser, end to end: cookieless assignment in the proxy, the entry
// rules, the beacon's ordered batches, and the static pages regenerating from the store. The server
// writes to the local fake of the Upstash REST API (playwright.config.ts) and runs its clock after the
// fixture start, so a visit can be counted. The fake has no reset and the tests run in parallel, so
// nothing here asserts a global total: each test checks its own view (the beacon's own requests and
// responses, and the view's claims in the store, read with the read-only token).
import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, type Request } from '@playwright/test';
import { createRedisRest } from '../../src/lib/experiment/redis-rest';
import { keys } from '../../src/lib/experiment/keys';
import { srmTest } from '../../src/lib/stats/proportions';
import { E2E_FAKE_UPSTASH_URL, E2E_KV_READ_TOKEN } from './constants';
import { test } from './fixtures';

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const CARDS = '[data-experiment="cards"]';
const read = createRedisRest({ url: E2E_FAKE_UPSTASH_URL, token: E2E_KV_READ_TOKEN });

type Item = { type: string; reject?: string };
type Batch = { v: 1; ns: string; pv: string; arm: 'a' | 'b'; events: Item[] };
type Sent = { batch: Batch; request: Request; response: Promise<Record<string, unknown> | null> };

/** A fake client address per test, so each test has its own rate-limit bucket. */
function fakeAddress(): string {
  return `198.18.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

function addressHeaders(ip: string): Record<string, string> {
  // Under `next start` the client sends both; the route reads x-forwarded-for first.
  return { 'x-forwarded-for': ip, 'x-real-ip': ip };
}

/**
 * Prepares a page as one visitor: its own address (merged with the fixture's x-internal), the
 * requests it sends to /api/e, and the experiment:counted events. `counted` turns navigator.webdriver
 * off, which the beacon otherwise reports as a bot.
 */
async function visitor(page: Page, extra: Record<string, string> | undefined, o: { counted: boolean }): Promise<Sent[]> {
  await page.setExtraHTTPHeaders({ ...extra, ...addressHeaders(fakeAddress()) });
  if (o.counted) {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
    });
  }
  await page.addInitScript(() => {
    const w = window as unknown as { __counted: unknown[] };
    w.__counted = [];
    window.addEventListener('experiment:counted', (e) => w.__counted.push((e as CustomEvent).detail));
  });
  const sent: Sent[] = [];
  page.on('request', (request) => {
    if (!request.url().endsWith('/api/e') || request.method() !== 'POST') return;
    // A sendBeacon body (a Blob) is not always readable here; such a batch is left out.
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
  return sent;
}

/** Puts the cards region below the fold with an area, without touching the DOM React hydrates. */
async function cardsBelowTheFold(page: Page): Promise<void> {
  await page.addInitScript((selector) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`${selector} { display: block; margin-top: 150vh; min-height: 240px; }`);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }, CARDS);
}

/** What a featured case-study card will be: a same-origin link marked as a card, in the cards region. */
async function addCard(page: Page): Promise<void> {
  await page.evaluate((selector) => {
    const a = document.createElement('a');
    a.href = '/privacy';
    a.dataset.experimentClick = 'card';
    a.textContent = 'A featured case study';
    a.style.display = 'block';
    a.style.minHeight = '200px';
    document.querySelector(selector)!.append(a);
  }, CARDS);
}

/** Waits for the next batch that starts with an entry, and its response. */
async function entryResult(sent: Sent[], from: number): Promise<{ batch: Batch; body: Record<string, unknown> | null }> {
  await expect.poll(() => sent.slice(from).some((s) => s.batch.events[0]?.type === 'entry'), { timeout: 10_000 }).toBe(true);
  const s = sent.slice(from).find((x) => x.batch.events[0]?.type === 'entry')!;
  return { batch: s.batch, body: await s.response };
}

async function countedEntry(page: Page, sent: Sent[]): Promise<Batch> {
  const { batch, body } = await entryResult(sent, 0);
  expect(batch.events).toEqual([{ type: 'entry' }]);
  expect(body).toMatchObject({ ok: true, results: [{ type: 'entry', outcome: 'counted' }] });
  return batch;
}

async function expectRefusedEntry(sent: Sent[], from: number, reason: string): Promise<Batch> {
  const { batch, body } = await entryResult(sent, from);
  expect(batch.events).toEqual([{ type: 'entry', reject: reason }]);
  expect(body).toEqual({ ok: false, reason });
  return batch;
}

async function claims(ns: string, pv: string, types: string[]): Promise<unknown> {
  return read.command(['MGET', ...types.map((t) => keys.claim(ns, pv, t as 'entry'))]);
}

test.describe('assignment', () => {
  test('GET / 200 times: both groups, no sample-ratio mismatch, x-arm on every response, no cookie', async ({ request, extraHTTPHeaders }) => {
    const headers = { ...extraHTTPHeaders, ...addressHeaders(fakeAddress()), 'user-agent': CHROME };
    const n = { a: 0, b: 0 };
    for (let i = 0; i < 200; i++) {
      const res = await request.get('/', { headers, maxRedirects: 0 });
      expect(res.status()).toBe(200);
      const arm = res.headers()['x-arm'];
      expect(arm === 'a' || arm === 'b', `x-arm ${arm}`).toBe(true);
      expect(res.headers()['set-cookie']).toBeUndefined();
      n[arm as 'a' | 'b'] += 1;
    }
    expect(n.a).toBeGreaterThan(0);
    expect(n.b).toBeGreaterThan(0);
    expect(srmTest(n.a, n.b).flagged).toBe(false);
  });

  test('a Googlebot user agent is always group a', async ({ request, extraHTTPHeaders }) => {
    for (const path of ['/', '/?variant=b']) {
      const res = await request.get(path, { headers: { ...extraHTTPHeaders, 'user-agent': GOOGLEBOT } });
      expect(res.headers()['x-arm'], path).toBe('a');
    }
  });

  for (const path of ['/v/a', '/v/b', '/v/zz']) {
    test(`a direct ${path} is the site's 404 page`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(404);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    });
  }
});

test.describe('the entry rules', () => {
  test('?variant=b is group b, and its entry is refused as forced', async ({ page, extraHTTPHeaders }) => {
    const sent = await visitor(page, extraHTTPHeaders, { counted: true });
    const res = await page.goto('/?variant=b');
    expect(res?.headers()['x-arm']).toBe('b');
    const batch = await expectRefusedEntry(sent, 0, 'forced');
    expect(batch.arm).toBe('b');
  });

  test('a browser that reports navigator.webdriver is refused as a bot', async ({ page, extraHTTPHeaders }) => {
    const sent = await visitor(page, extraHTTPHeaders, { counted: false });
    await page.goto('/');
    await expectRefusedEntry(sent, 0, 'bot');
  });

  for (const [name, script] of [
    ['Global Privacy Control', () => Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true })],
    ['Do Not Track', () => Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1', configurable: true })],
  ] as const) {
    test(`a browser that sends ${name} makes no request to /api/e`, async ({ page, extraHTTPHeaders }) => {
      const sent = await visitor(page, extraHTTPHeaders, { counted: true });
      await page.addInitScript(script);
      await cardsBelowTheFold(page);
      await page.goto('/');
      await page.locator(CARDS).scrollIntoViewIfNeeded();
      await page.mouse.click(5, 5);
      await page.waitForTimeout(2000);
      expect(sent).toEqual([]);
    });
  }

  test('loading another page, whose header prefetches /, sends nothing', async ({ page, extraHTTPHeaders }) => {
    const sent = await visitor(page, extraHTTPHeaders, { counted: true });
    const prefetches: string[] = [];
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (url.pathname === '/' && (url.searchParams.has('_rsc') || r.headers()['next-router-prefetch'] !== undefined)) prefetches.push(r.url());
    });
    await page.goto('/privacy');
    await page.waitForLoadState('networkidle');
    // The header's wordmark link really prefetched / (else this test would prove nothing).
    await expect.poll(() => prefetches.length).toBeGreaterThan(0);
    await page.waitForTimeout(2000);
    expect(sent).toEqual([]);
  });
});

test.describe('a counted visit', () => {
  test('the entry counts; the cards in view for 1.2 s count an exposure, with viewN and the counted event', async ({ page, extraHTTPHeaders }) => {
    const sent = await visitor(page, extraHTTPHeaders, { counted: true });
    await cardsBelowTheFold(page);
    await page.goto('/');
    const entry = await countedEntry(page, sent);
    // This run's clock is after the start, so the test note shows (before the start it does not).
    await expect(page.getByText('This site runs a live experiment on its own visitors.')).toBeVisible();
    await page.locator(CARDS).scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    await expect
      .poll(async () => {
        for (const s of sent) {
          const body = await s.response;
          const results = (body?.results ?? []) as { type: string; outcome: string }[];
          if (results.some((r) => r.type === 'inview' && r.outcome === 'counted')) return body!.viewN;
        }
        return null;
      })
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __counted: { arm: string; viewN?: number }[] }).__counted.some((d) => (d.viewN ?? 0) >= 1)))
      .toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __counted: { arm: string }[] }).__counted.every((d) => d.arm === 'a' || d.arm === 'b'))).toBe(true);
    expect(await claims(entry.ns, entry.pv, ['entry', 'inview'])).toEqual([entry.arm, entry.arm]);
  });

  test('a card clicked within 300 ms of scrolling into view sends inview then card in one batch before the page navigates', async ({
    page,
    browserName,
    extraHTTPHeaders,
  }) => {
    // Under Playwright's WebKit the held navigation below holds the batch too (it never reaches the
    // server until the route is released), so this check runs on Chromium; the pagehide test that
    // follows covers WebKit.
    test.skip(browserName !== 'chromium', 'the held navigation also holds the batch under WebKit');
    const sent = await visitor(page, extraHTTPHeaders, { counted: true });
    await cardsBelowTheFold(page);
    await page.goto('/');
    const entry = await countedEntry(page, sent);
    await addCard(page);
    // Hold the next document's response: the old page commits away (and fires pagehide) only when
    // it arrives, so whatever leaves before that is a request this page could see answered.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/privacy', async (route) => {
      await held;
      await route.continue();
    });
    // Playwright scrolls the card into view and clicks at once: well inside the 1 s dwell.
    await page.locator('[data-experiment-click="card"]').click({ noWaitAfter: true });

    const isCardBatch = (b: Batch) => {
      const types = b.pv === entry.pv ? b.events.map((e) => e.type) : [];
      return types.includes('inview') && types.indexOf('card') === types.indexOf('inview') + 1;
    };
    await expect.poll(() => sent.some((s) => isCardBatch(s.batch))).toBe(true);
    // Counted while the page is still here: the batch arrived before it navigated.
    await expect.poll(() => claims(entry.ns, entry.pv, ['entry', 'inview', 'card'])).toEqual([entry.arm, entry.arm, entry.arm]);
    expect(sent.filter((s) => s.batch.events.some((e) => e.type === 'card'))).toHaveLength(1);
    expect(page.url()).toMatch(/\/$/);
    release();
    await page.waitForURL('**/privacy');
  });

  test('a card clicked as the page unloads still counts (the pagehide flush); back, the wordmark and a reload are not entries', async ({
    page,
    context,
    extraHTTPHeaders,
  }) => {
    const sent = await visitor(page, extraHTTPHeaders, { counted: true });
    await cardsBelowTheFold(page);
    await page.goto('/');
    const entry = await countedEntry(page, sent);
    await addCard(page);
    await Promise.all([page.waitForURL('**/privacy'), page.locator('[data-experiment-click="card"]').click()]);
    // A batch sent while the page unloads is not reported to the test (Playwright sees no request a
    // document sends during its pagehide), so the store tells: the card counted, and it can count
    // only on an inview counted for the same view (otherwise it is an orphan).
    await expect.poll(() => claims(entry.ns, entry.pv, ['entry', 'inview', 'card']), { timeout: 10_000 }).toEqual([entry.arm, entry.arm, entry.arm]);

    // Back to / (from the back/forward cache or a back_forward load): not an entry.
    let from = sent.length;
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expectRefusedEntry(sent, from, 'not_entry');

    // From /privacy, the header wordmark (next/link) is a soft navigation to /: still the /privacy
    // document, whose first load was not /.
    await page.goto('/privacy');
    from = sent.length;
    await page.locator('[data-site-header] a[href="/"]').click();
    await expect(page).toHaveURL(/\/$/);
    await expectRefusedEntry(sent, from, 'not_entry');

    from = sent.length;
    await page.reload();
    await expectRefusedEntry(sent, from, 'not_entry');

    // Nothing was stored on the device.
    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
    expect(await page.evaluate(async () => (await indexedDB.databases()).length)).toBe(0);
  });

  test('soft navigations back to / in the same document (the wordmark, Back) are not counted twice', async ({ page, extraHTTPHeaders }) => {
    const sent = await visitor(page, extraHTTPHeaders, { counted: true });
    await page.goto('/');
    await countedEntry(page, sent);
    await page.evaluate(() => {
      (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
    });
    const sameDocument = () => page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument === true);
    const wordmark = page.locator('[data-site-header] a[href="/"]');
    // Every next/link on / today leads to a page that does not exist yet, and Next turns a soft
    // navigation that gets a 404 into a full load. So the way out is the App Router instance that
    // next/link itself calls; the way back is the real wordmark link, or Back.
    const softTo = async (path: string) => {
      await page.evaluate((p) => (window as unknown as { next: { router: { push(h: string): void } } }).next.router.push(p), path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    };

    // The wordmark on / itself: a soft navigation to / (the proxy may give another group).
    for (let i = 0; i < 3; i++) {
      await wordmark.click();
      await page.waitForTimeout(300);
    }

    await softTo('/exclude');
    let from = sent.length;
    await wordmark.click();
    await expect(page).toHaveURL(/\/$/);
    await expectRefusedEntry(sent, from, 'not_entry');
    expect(await sameDocument()).toBe(true);

    await softTo('/exclude');
    from = sent.length;
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expectRefusedEntry(sent, from, 'not_entry');
    expect(await sameDocument()).toBe(true);

    const entries = sent.filter((s) => s.batch.events[0]?.type === 'entry');
    expect(entries.filter((s) => s.batch.events[0]!.reject === undefined)).toHaveLength(1);
  });
});

test.describe('static generation', () => {
  test('the prerender manifest lists both groups and data.json at 300 s, and not /', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), '.next/prerender-manifest.json'), 'utf8')) as {
      routes: Record<string, { initialRevalidateSeconds?: number | false }>;
    };
    for (const route of ['/v/a', '/v/b', '/experiment/data.json']) {
      expect(manifest.routes[route]?.initialRevalidateSeconds, route).toBe(300);
    }
    expect(manifest.routes['/']).toBeUndefined();
  });

  test('@isr data.json regenerates from the store after 300 s', async ({ page, request, extraHTTPHeaders }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'one regeneration check is enough');
    test.setTimeout(420_000);
    const sent = await visitor(page, extraHTTPHeaders, { counted: true });
    await page.goto('/');
    const entry = await countedEntry(page, sent);

    type Data = { readAt: string; current: Record<'a' | 'b', { entry: number | '<5'; inview: number | '<5' }> };
    const get = async () => (await (await request.get('/experiment/data.json')).json()) as Data;
    const before = await get();
    await page.waitForTimeout(310_000);
    await get();
    await expect.poll(async () => Date.parse((await get()).readAt) > Date.parse(before.readAt), { timeout: 30_000 }).toBe(true);
    const after = await get();

    // The regenerated file shows what the store holds now, as published cells.
    const totals = (await read.command(['HGETALL', keys.counters(entry.ns)])) as string[];
    const field = (arm: string) => Number(totals[totals.indexOf(`t:${arm}:entry`) + 1] ?? 0);
    const cell = (n: number) => (n === 0 ? 0 : n < 5 ? '<5' : n);
    expect(after.current.a.entry).toEqual(cell(totals.includes('t:a:entry') ? field('a') : 0));
    expect(after.current.b.entry).toEqual(cell(totals.includes('t:b:entry') ? field('b') : 0));
    expect(after.current[entry.arm].entry).not.toBe(0);
  });
});
