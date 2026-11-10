import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations, test } from './fixtures';

// The returns-cleaning Figure on the dev host /kitchen-sink/retention: returned-order value per
// month, with orders cancelled within 24 hours counted as returns (raw) or removed (clean, the
// preset). The server draws the clean preset; the island loads on intent, or at once when the URL
// holds `returns.` keys. /kitchen-sink/retention/faults sets the test seam, so the chart throws on
// the first render after a mode change.

const HOST = '/kitchen-sink/retention';
const FAULTS = '/kitchen-sink/retention/faults';
const ID = 'returns';
const TITLE = 'Removing reversed orders changes the returns story';
const SENTENCE = 'This chart could not load. The numbers are in the table below.';
const SEAM_FAILURE = 'The returns chart failed after a change (test seam)';
// January 2011, the month of the reversal, in each mode as the table prints it.
const JAN_RAW = '91,254';
const JAN_CLEAN = '11,758';

const figure = (page: Page) => page.locator(`figure[data-figure="${ID}"]`);
const island = (page: Page) => page.locator('[data-island]', { has: figure(page) });
const raw = (page: Page) => figure(page).getByRole('radio', { name: 'Counted as returns' });
const clean = (page: Page) => figure(page).getByRole('radio', { name: 'Removed' });
const result = (page: Page) => figure(page).locator('[data-figure-result]');
const live = (page: Page) => figure(page).locator('[data-figure-announcement]');
const tableCells = (page: Page) => figure(page).locator('[data-figure-tables]:visible td[data-num], [data-figure-fallback] td[data-num]');

function watchErrors(page: Page, expected: readonly string[] = []) {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    if (!expected.some((e) => error.message.includes(e))) errors.push(error.message);
  });
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() !== 'error' || text.startsWith('Failed to load resource')) return;
    if (!expected.some((e) => text.includes(e))) errors.push(text);
  });
  return errors;
}

const CHUNK_ERRORS = ['chunk', 'Chunk', 'Failed to fetch', 'dynamically imported module', 'Importing a module script failed'];

async function withoutIdle(page: Page) {
  await page.addInitScript(() => {
    window.requestIdleCallback = () => 0;
    window.cancelIdleCallback = () => {};
  });
}

async function ready(page: Page) {
  await figure(page).locator('h3').hover();
  await expect(island(page)).toHaveAttribute('data-island', 'ready');
}

/** Opens the folded table so its cells are visible. */
async function openTable(page: Page) {
  const summary = figure(page).locator('[data-js-only][data-figure-tables] summary');
  if ((await summary.count()) > 0 && (await summary.isVisible())) await summary.click();
}

test.describe('Returns-cleaning Figure', () => {
  test('without JavaScript: the clean preset, the open table and "Controls need JavaScript.", whatever the query', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${HOST}?${ID}.mode=raw`);
    await expect(figure(page).getByRole('heading', { level: 3 })).toHaveText(TITLE);
    await expect(result(page)).toContainText('grew about 2%, Jan–Nov 2011 versus Jan–Nov 2010.');
    await expect(result(page)).toContainText('mostly one £77k order on 18 Jan 2011');
    await expect(figure(page).getByText('Public data')).toBeVisible();
    await expect(figure(page).getByText('Controls need JavaScript.')).toBeVisible();
    const table = figure(page).locator('[data-nojs-only] table');
    await expect(table).toBeVisible();
    await expect(table).toContainText(JAN_CLEAN);
    await expect(table).not.toContainText(JAN_RAW);
    await expect(figure(page).getByRole('group', { name: 'Controls' })).toBeHidden();
    await context.close();
  });

  test('lazy: the island is idle until the pointer arrives, and no code loads before', async ({ page }) => {
    await withoutIdle(page);
    const errors = watchErrors(page);
    const scripts: string[] = [];
    let loaded = false;
    page.on('request', (request) => {
      if (loaded && request.resourceType() === 'script') scripts.push(request.url());
    });
    await page.goto(HOST);
    await page.waitForLoadState('load');
    await page.waitForTimeout(500);
    loaded = true;
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    await page.waitForTimeout(500);
    expect(scripts).toEqual([]);
    await ready(page);
    expect(scripts.length).toBeGreaterThan(0);
    await expect(clean(page)).toBeChecked();
    expect(errors).toEqual([]);
  });

  test('eager: its own keys load the island after hydration and draw the shared mode', async ({ page, request }) => {
    const html = await (await request.get(`${HOST}?${ID}.mode=raw`)).text();
    expect(html).toContain('data-island="idle"');
    expect(html).toContain('retail.returns.yoy_growth_clean');
    await withoutIdle(page);
    const errors = watchErrors(page);
    await page.goto(`${HOST}?${ID}.mode=raw`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(raw(page)).toBeChecked();
    await expect(result(page)).toContainText('looks like it grew 29%, Jan–Nov 2011 versus Jan–Nov 2010.');
    await expect(figure(page).locator('rect[data-partial]')).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test("other Figures' keys, near misses and bare keys do not load it", async ({ page }) => {
    await withoutIdle(page);
    await page.goto(`${HOST}?cohorts.cohort=2010-03&${ID}x.mode=raw&mode=raw`);
    await page.waitForLoadState('load');
    await page.waitForTimeout(800);
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    await expect(result(page)).toContainText('grew about 2%');
  });

  test('a hostile shared URL shows the clean preset, with no error', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${HOST}?${ID}.mode=__proto__&${ID}.preset=constructor`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(clean(page)).toBeChecked();
    await page.goto(`${HOST}?${ID}.mode=RAW&${ID}.mode=raw`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(clean(page)).toBeChecked();
    await expect(result(page)).toContainText('grew about 2%');
    expect(errors).toEqual([]);
  });

  test("Reset restores the preset, clears only its own keys and keeps the cohort key and the hash", async ({ page }) => {
    await page.goto(`${HOST}?${ID}.mode=raw&cohorts.cohort=2010-03#host-cleaning`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(raw(page)).toBeChecked();
    await figure(page).getByRole('button', { name: 'Reset' }).click();
    await expect(clean(page)).toBeChecked();
    await expect(result(page)).toContainText('grew about 2%');
    await expect(live(page)).toHaveText('With orders cancelled within 24 hours removed, returned-order value grew about 2%, Jan–Nov 2011 versus Jan–Nov 2010.');
    const url = new URL(page.url());
    expect([...url.searchParams.keys()].filter((k) => k.startsWith(`${ID}.`))).toEqual([]);
    expect(url.searchParams.get('cohorts.cohort')).toBe('2010-03');
    expect(url.hash).toBe('#host-cleaning');
  });

  test('keyboard: focus moving into the preview loads the island and stays on the radio; an arrow key switches the mode', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(HOST);
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    await clean(page).focus();
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(clean(page)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(raw(page)).toBeChecked();
    await expect(raw(page)).toBeFocused();
    await expect(result(page)).toContainText('looks like it grew 29%');
    await expect(live(page)).toHaveText(
      'Counting orders cancelled within 24 hours as returns, returned-order value looks like it grew 29%, Jan–Nov 2011 versus Jan–Nov 2010.',
    );
    await expect(live(page)).toHaveAttribute('data-derived', 'source:retail');
    await expect.poll(() => new URL(page.url()).searchParams.get(`${ID}.mode`)).toBe('raw');
    await openTable(page);
    await expect(tableCells(page).filter({ hasText: JAN_RAW })).toHaveCount(1);
  });

  test('no motion: switching modes moves no mark and starts no animation, on a stable axis', async ({ page }) => {
    await page.goto(HOST);
    await ready(page);
    const ticks = () => figure(page).locator('svg[data-chart-frame]:visible [data-tick="y"]').allTextContents();
    const before = await ticks();
    await figure(page).locator('label', { hasText: 'Counted as returns' }).click();
    await expect(raw(page)).toBeChecked();
    const motion = await figure(page).evaluate((root) => ({
      animations: root.getAnimations({ subtree: true }).length,
      transitions: [...root.querySelectorAll('[data-mark]')].map((m) => getComputedStyle(m).transitionDuration),
    }));
    expect(motion.animations).toBe(0);
    expect(motion.transitions.every((d) => d.split(',').every((part) => part.trim() === '0s'))).toBe(true);
    expect(await ticks()).toEqual(before);
    await expect(figure(page).locator('svg[data-chart-frame]:visible [data-annotation]')).toHaveText('Partial month');
  });

  test('a failed island on intent brings back the no-JS preset, and focus goes to the open table', async ({ page }) => {
    await withoutIdle(page);
    watchErrors(page, CHUNK_ERRORS);
    let block = false;
    await page.route('**/_next/static/**/*.js', (route) => (block ? route.abort() : route.continue()));
    await page.goto(HOST);
    await page.waitForLoadState('load');
    await page.waitForTimeout(500);
    block = true;
    await clean(page).focus();
    await expect(page.locator('[data-island="failed"]', { has: figure(page) })).toHaveCount(1);
    await expect(figure(page).locator('[data-nojs-only] [role="region"]')).toBeFocused();
    await expect(figure(page).getByText('Controls need JavaScript.')).toBeVisible();
    await expect(figure(page).getByRole('group', { name: 'Controls' })).toBeHidden();
    await expect(result(page)).toContainText('grew about 2%');
    await expect(figure(page).locator('[data-nojs-only] table')).toContainText(JAN_CLEAN);
  });

  test('a failed eager island brings back the clean preset, not the shared mode, and takes no focus', async ({ page, request }) => {
    await withoutIdle(page);
    watchErrors(page, CHUNK_ERRORS);
    const html = await (await request.get(`${HOST}?${ID}.mode=raw`)).text();
    const named = new Set([...html.matchAll(/\/_next\/static\/[^"'\s]+\.js/g)].map((m) => m[0]));
    await page.route('**/_next/static/**/*.js', (route) =>
      named.has(new URL(route.request().url()).pathname) ? route.continue() : route.abort(),
    );
    await page.goto(`${HOST}?${ID}.mode=raw`);
    await expect(page.locator('[data-island="failed"]', { has: figure(page) })).toHaveCount(1);
    await expect(figure(page).getByText('Controls need JavaScript.')).toBeVisible();
    const table = figure(page).locator('[data-nojs-only] table');
    await expect(table).toBeVisible();
    await expect(table).toContainText(JAN_CLEAN);
    await expect(result(page)).toContainText('grew about 2%');
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  });

  test('a chart that throws after a keyboard change: the sentence takes focus, the current table shows, no plot and no controls', async ({ page }) => {
    const errors = watchErrors(page, [SEAM_FAILURE]);
    await page.goto(FAULTS);
    await ready(page);
    await clean(page).focus();
    await page.keyboard.press('ArrowLeft');
    const status = figure(page).getByRole('status');
    await expect(status).toHaveText(SENTENCE);
    await expect(status).toBeFocused();
    await assertCurrentFallback(page);
    expect(errors).toEqual([]);
  });

  test('a chart that throws after a pointer change: focus is the sentence or where it was, never a hidden control', async ({ page }) => {
    const errors = watchErrors(page, [SEAM_FAILURE]);
    await page.goto(FAULTS);
    await ready(page);
    // Start with nothing focused, as the kit's own pointer test does.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await figure(page).locator('label', { hasText: 'Counted as returns' }).click();
    const status = figure(page).getByRole('status');
    await expect(status).toHaveText(SENTENCE);
    const focus = await page.evaluate(() => {
      const a = document.activeElement;
      return {
        body: a === document.body,
        status: a?.getAttribute('role') === 'status',
        hidden: a instanceof HTMLElement && a !== document.body && !a.checkVisibility(),
      };
    });
    expect(focus.body || focus.status).toBe(true);
    expect(focus.hidden).toBe(false);
    await assertCurrentFallback(page);
    expect(errors).toEqual([]);
  });

  test('axe finds no violations in the preview or the loaded island', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(HOST);
    await expectNoA11yViolations(page);
    await ready(page);
    await expectNoA11yViolations(page);
  });
});

/** The kit's own fallback for a chart failure after a change to raw: caption, sentence and the raw table only. */
async function assertCurrentFallback(page: Page) {
  const f = figure(page);
  await expect(f.getByRole('heading', { level: 3 })).toHaveText(TITLE);
  await expect(f.locator('figcaption > p').first()).toContainText('not compared with the full months');
  const fallbackTable = f.locator('[data-figure-fallback] table');
  await expect(fallbackTable).toBeVisible();
  await expect(fallbackTable).toContainText(JAN_RAW);
  await expect(fallbackTable).not.toContainText(JAN_CLEAN);
  await expect(f.locator('[data-figure-preview]')).toHaveCount(0);
  await expect(f.locator('svg[data-chart-frame]:visible')).toHaveCount(0);
  await expect(f.getByRole('group', { name: 'Controls' })).toBeHidden();
  await expect(f.locator('[data-figure-result]')).toBeHidden();
  await expect(f.getByText('Controls need JavaScript.')).toBeHidden();
  await expect(f).not.toContainText(SEAM_FAILURE);
  await expect(page.locator('[data-island="failed"]')).toHaveCount(0);
  await expect(island(page)).toHaveAttribute('data-island', 'ready');
}
