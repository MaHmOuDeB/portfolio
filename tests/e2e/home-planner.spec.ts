import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations, test } from './fixtures';

// The Home planner on the dev host /kitchen-sink/home: a hypothetical sign-up test (Baseline
// conversion 1% to 98%, preset 29%; Rise in points 1 to 30, preset 5, capped so the target stays at
// or under 99%; Reset). The server draws the preset (1,353 visitors per group); the island loads on
// intent, or at once when the URL holds planner keys.

const HOST = '/kitchen-sink/home';
const ID = 'hero-planner';
const PRESET_N = '1,353';
const RESULT = /^[\d,]+ visitors per group to detect a rise from \d+% to \d+%$/;

const figure = (page: Page) => page.locator(`figure[data-figure="${ID}"]`);
const island = (page: Page) => page.locator('[data-island]', { has: figure(page) });
const baseline = (page: Page) => figure(page).getByRole('slider', { name: 'Baseline conversion' });
const rise = (page: Page) => figure(page).getByRole('slider', { name: 'Rise in points' });
const readout = (page: Page) => figure(page).locator('[data-figure-lead] [data-planner-n]');
const live = (page: Page) => figure(page).locator('[data-figure-announcement]');
const query = (page: Page) => new URL(page.url()).searchParams;

/** Collects page errors and console errors, except resource failures and the expected ones. */
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

/** Stops the idle trigger, so only intent or the URL loads the island. */
async function withoutIdle(page: Page) {
  await page.addInitScript(() => {
    window.requestIdleCallback = () => 0;
    window.cancelIdleCallback = () => {};
  });
}

async function ready(page: Page) {
  await figure(page).locator('h2').hover();
  await expect(island(page)).toHaveAttribute('data-island', 'ready');
}

test.describe('Home planner', () => {
  test('without JavaScript: the preset, the open table and "Controls need JavaScript.", whatever the query', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${HOST}?${ID}.baseline=0.6&${ID}.risePoints=12`);
    await expect(readout(page)).toHaveText(PRESET_N);
    await expect(figure(page).locator('[data-figure-result]')).toContainText('To detect a rise from 29% to 34%.');
    await expect(figure(page).locator('[data-figure-result]')).toContainText('Simulated');
    await expect(figure(page).locator('[data-figure-result]')).toContainText('Hypothetical sign-up test');
    await expect(figure(page).getByText('Controls need JavaScript.')).toBeVisible();
    const table = figure(page).locator('[data-nojs-only] table');
    await expect(table).toBeVisible();
    await expect(table).toContainText('1,353');
    await expect(figure(page).getByRole('group', { name: 'Controls' })).toBeHidden();
    await expect(figure(page).getByText('not a figure from the case studies below')).toBeVisible();
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
    await expect(readout(page)).toHaveText(PRESET_N);
    expect(errors).toEqual([]);
  });

  test('eager: planner keys in the URL load the island after hydration, with no intent', async ({ page, request }) => {
    const html = await (await request.get(`${HOST}?${ID}.baseline=0.4`)).text();
    expect(html).toContain('data-island="idle"');
    expect(html).toContain(PRESET_N);
    await withoutIdle(page);
    const errors = watchErrors(page);
    await page.goto(`${HOST}?${ID}.baseline=0.4`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(baseline(page)).toHaveValue('0.4');
    await expect(rise(page)).toHaveValue('5');
    await expect(figure(page).locator('[data-figure-result]')).toContainText('To detect a rise from 40% to 45%.');
    await expect(readout(page)).not.toHaveText(PRESET_N);
    expect(errors).toEqual([]);
  });

  test('foreign keys do not load it: another Figure, a near-miss id or a bare key', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(`${HOST}?other.baseline=0.4&${ID}x.risePoints=9&baseline=0.5`);
    await page.waitForLoadState('load');
    await page.waitForTimeout(800);
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    await expect(readout(page)).toHaveText(PRESET_N);
  });

  test('a hostile shared URL shows a valid pair: the rise is capped so the target stays at 99%', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${HOST}?${ID}.baseline=0.98&${ID}.risePoints=30&${ID}.preset=__proto__`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(baseline(page)).toHaveValue('0.98');
    await expect(rise(page)).toHaveValue('1');
    await expect(rise(page)).toHaveAttribute('max', '1');
    await expect(figure(page).locator('[data-figure-result]')).toContainText('To detect a rise from 98% to 99%.');
    await expect(readout(page)).toHaveText(/^[\d,]+$/);
    await page.goto(`${HOST}?${ID}.baseline=abc&${ID}.risePoints=Infinity`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(baseline(page)).toHaveValue('0.29');
    await expect(rise(page)).toHaveValue('30');
    expect(errors).toEqual([]);
  });

  test('a baseline rise caps the current rise, and the cap shows on the slider', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(HOST);
    await ready(page);
    await rise(page).focus();
    await page.keyboard.press('End');
    await expect(rise(page)).toHaveValue('30');
    const exact = figure(page).getByRole('spinbutton', { name: 'Baseline conversion, exact value' });
    await exact.fill('0.8');
    await exact.press('Enter');
    await expect(baseline(page)).toHaveValue('0.8');
    await expect(rise(page)).toHaveValue('19');
    await expect(rise(page)).toHaveAttribute('max', '19');
    await expect(figure(page).locator('[data-figure-result]')).toContainText('To detect a rise from 80% to 99%.');
    await expect(live(page)).toHaveText(/visitors per group to detect a rise from 80% to 99%$/);
    await expect.poll(() => query(page).get(`${ID}.risePoints`)).toBe('19');
  });

  test('focus: moving focus into the preview loads the island and keeps focus on the same slider', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(HOST);
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    await baseline(page).focus();
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(baseline(page)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(baseline(page)).toHaveValue('0.3');
    // A key release is a commit: the result is announced once, as the result line reads.
    await expect(live(page)).toHaveText(RESULT);
    await expect(live(page)).toHaveText(/from 30% to 35%$/);
    await expect(live(page)).toHaveAttribute('data-derived', 'simulated');
  });

  test('drag: the readout follows within 200 ms, with no announcement and no transition until release', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(HOST);
    await ready(page);
    await expect(live(page)).toHaveText('');
    await figure(page).evaluate((root) => {
      const w = window as unknown as { lat: number[]; announcedDuringDrag: string[]; animationsDuringDrag: number };
      w.lat = [];
      w.announcedDuringDrag = [];
      w.animationsDuringDrag = 0;
      let inputAt: number | null = null;
      root.addEventListener('input', () => {
        inputAt = performance.now();
      }, true);
      const n = root.querySelector('[data-figure-lead] [data-planner-n]')!;
      new MutationObserver(() => {
        if (inputAt !== null) {
          w.lat.push(performance.now() - inputAt);
          inputAt = null;
        }
        if (root.hasAttribute('data-dragging')) w.animationsDuringDrag += root.getAnimations({ subtree: true }).length;
      }).observe(n, { characterData: true, childList: true, subtree: true });
      const announcement = root.querySelector('[data-figure-announcement]')!;
      new MutationObserver(() => {
        if (root.hasAttribute('data-dragging')) w.announcedDuringDrag.push(announcement.textContent ?? '');
      }).observe(announcement, { characterData: true, childList: true, subtree: true });
    });

    const box = (await baseline(page).boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, y, { steps: 8 });
    await expect(figure(page)).toHaveAttribute('data-dragging', '');
    await expect(live(page)).toHaveText('');
    const transitions = await figure(page)
      .locator('[data-planner-readout], [data-figure-result]')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).transitionDuration));
    expect(transitions.every((d) => d.split(',').every((part) => part.trim() === '0s'))).toBe(true);

    await page.mouse.up();
    await expect(figure(page)).not.toHaveAttribute('data-dragging');
    await expect(live(page)).toHaveText(RESULT);
    const stats = await page.evaluate(() => {
      const w = window as unknown as { lat: number[]; announcedDuringDrag: string[]; animationsDuringDrag: number };
      return { lat: w.lat, announced: w.announcedDuringDrag, animations: w.animationsDuringDrag };
    });
    expect(stats.lat.length).toBeGreaterThan(0);
    expect(Math.max(...stats.lat)).toBeLessThan(200);
    expect(stats.announced).toEqual([]);
    expect(stats.animations).toBe(0);
  });

  test("Reset restores the preset, clears only the planner's keys and keeps others and the hash", async ({ page }) => {
    await page.goto(`${HOST}?${ID}.baseline=0.5&${ID}.risePoints=12&other.keep=1#note`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(baseline(page)).toHaveValue('0.5');
    await figure(page).getByRole('button', { name: 'Reset' }).click();
    await expect(baseline(page)).toHaveValue('0.29');
    await expect(rise(page)).toHaveValue('5');
    await expect(readout(page)).toHaveText(PRESET_N);
    await expect(live(page)).toHaveText('1,353 visitors per group to detect a rise from 29% to 34%');
    const url = new URL(page.url());
    expect([...url.searchParams.keys()].filter((k) => k.startsWith(`${ID}.`))).toEqual([]);
    expect(url.searchParams.get('other.keep')).toBe('1');
    expect(url.hash).toBe('#note');
  });

  test('a failed island on intent brings back the no-JS preview, and focus goes to the open table', async ({ page }) => {
    await withoutIdle(page);
    watchErrors(page, CHUNK_ERRORS);
    let block = false;
    await page.route('**/_next/static/**/*.js', (route) => (block ? route.abort() : route.continue()));
    await page.goto(HOST);
    await page.waitForLoadState('load');
    await page.waitForTimeout(500);
    block = true;
    await baseline(page).focus();
    await expect(page.locator('[data-island="failed"]', { has: figure(page) })).toHaveCount(1);
    await expect(figure(page).locator('[data-nojs-only] [role="region"]')).toBeFocused();
    await expect(figure(page).getByText('Controls need JavaScript.')).toBeVisible();
    await expect(figure(page).getByRole('group', { name: 'Controls' })).toBeHidden();
    await expect(readout(page)).toHaveText(PRESET_N);
  });

  test('a failed eager island brings back the same no-JS preview and takes no focus', async ({ page, request }) => {
    await withoutIdle(page);
    watchErrors(page, CHUNK_ERRORS);
    // The scripts the server page names are what hydration needs; any other script is lazy code.
    const html = await (await request.get(`${HOST}?${ID}.baseline=0.4`)).text();
    const named = new Set([...html.matchAll(/\/_next\/static\/[^"'\s]+\.js/g)].map((m) => m[0]));
    await page.route('**/_next/static/**/*.js', (route) =>
      named.has(new URL(route.request().url()).pathname) ? route.continue() : route.abort(),
    );
    await page.goto(`${HOST}?${ID}.baseline=0.4`);
    await expect(page.locator('[data-island="failed"]', { has: figure(page) })).toHaveCount(1);
    await expect(figure(page).getByText('Controls need JavaScript.')).toBeVisible();
    await expect(figure(page).locator('[data-nojs-only] table')).toBeVisible();
    await expect(readout(page)).toHaveText(PRESET_N);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  });

  test('axe finds no violations in the preview or the loaded island', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(HOST);
    await expectNoA11yViolations(page);
    await ready(page);
    await expectNoA11yViolations(page);
  });
});
