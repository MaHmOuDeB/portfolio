import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test } from './fixtures';

// The URL-state sample on the kitchen sink: two Figures, `sample` and `sample-b`, on one page, each with
// a baseline slider (0.01 to 0.5, step 0.01), a tail choice (two, one) and Reset. Presets:
// default {0.29, two} and interview {0.1, one}. The Playwright web server builds with KITCHEN_SINK=1.

const DEBOUNCE_MS = 250;
const SPECIMEN = '[data-specimen="url-state--two-figures"]';
const figure = (page: Page, id: string) => page.locator(`${SPECIMEN} [data-figure="${id}"]`);
const baseline = (page: Page, id: string) => figure(page, id).getByRole('slider', { name: 'Baseline rate' });
const tail = (page: Page, id: string, name: string) => figure(page, id).getByRole('radio', { name });
// The radios are visually hidden inside their labels, so a visitor clicks the label.
const choose = (page: Page, id: string, name: string) =>
  figure(page, id).locator('label', { has: page.getByRole('radio', { name }) }).click();
const query = (page: Page) => new URL(page.url()).search;

/** Waits until the Figure renders the URL's state in place of the server's preset fallback. */
async function open(page: Page, path: string) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // A hydration mismatch or a throw shows up here. Resource 404s do not count: the header prefetches
  // Work, Lab, Live test and About, which later plans build.
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
      errors.push(message.text());
    }
  });
  await page.goto(path);
  for (const id of ['sample', 'sample-b']) await expect(figure(page, id)).toHaveAttribute('data-state-from', 'url');
  return errors;
}

async function expectShows(page: Page, id: string, value: string, side: 'Two-sided' | 'One-sided') {
  await expect(baseline(page, id)).toHaveValue(value);
  await expect(figure(page, id).getByRole('spinbutton', { name: 'Baseline rate, exact value' })).toHaveValue(value);
  await expect(tail(page, id, side)).toBeChecked();
}

test.describe('kitchen sink URL state', () => {
  test('without a query both Figures show the default preset and the URL is not written', async ({ page }) => {
    const errors = await open(page, '/kitchen-sink');
    await expectShows(page, 'sample', '0.29', 'Two-sided');
    await expectShows(page, 'sample-b', '0.29', 'Two-sided');
    await expect(figure(page, 'sample').locator('[data-readout]')).toHaveAttribute('data-derived', 'simulated');
    await expect(figure(page, 'sample').locator('[data-slider]')).toHaveAttribute('data-derived', 'simulated');
    await page.waitForTimeout(DEBOUNCE_MS * 2);
    expect(query(page)).toBe('');
    expect(errors).toEqual([]);
  });

  test('applies valid keys to their own Figure only, with no hydration error', async ({ page }) => {
    const errors = await open(page, '/kitchen-sink?sample.baseline=0.2&sample.tail=one');
    await expectShows(page, 'sample', '0.2', 'One-sided');
    await expectShows(page, 'sample-b', '0.29', 'Two-sided');
    expect(errors).toEqual([]);
  });

  test('a preset applies, and explicit keys override it', async ({ page }) => {
    await open(page, '/kitchen-sink?sample.preset=interview&sample.baseline=0.3&sample-b.preset=interview');
    await expectShows(page, 'sample', '0.3', 'One-sided');
    await expectShows(page, 'sample-b', '0.1', 'One-sided');
    await expect(figure(page, 'sample')).toHaveAttribute('data-preset', 'interview');
  });

  test('hostile and stale values clamp or fall back, never throw', async ({ page }) => {
    const errors = await open(
      page,
      '/kitchen-sink?sample.baseline=abc&sample.tail=sideways&sample-b.baseline=1e9&sample-b.preset=nope&ghost.baseline=-5',
    );
    await expectShows(page, 'sample', '0.29', 'Two-sided');
    await expectShows(page, 'sample-b', '0.5', 'Two-sided');
    await expect(figure(page, 'sample-b')).toHaveAttribute('data-preset', 'default');

    await open(page, '/kitchen-sink?sample.baseline=-5&sample.baseline=0.4&sample-b.preset=toString&sample-b.baseline=0.123');
    await expectShows(page, 'sample', '0.01', 'Two-sided');
    await expectShows(page, 'sample-b', '0.12', 'Two-sided');
    expect(errors).toEqual([]);
  });

  test('writes once, after the debounce, with replaceState, keeping other keys and the hash', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await open(page, '/kitchen-sink?ghost.x=a%20b&sample-b.baseline=0.2#section-url-state');
    const historyLength = await page.evaluate(() => window.history.length);
    await page.clock.pauseAt(Date.now() + 60_000);

    await baseline(page, 'sample').focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await expectShows(page, 'sample', '0.32', 'Two-sided');
    await page.clock.runFor(DEBOUNCE_MS - 1);
    expect(query(page)).toBe('?ghost.x=a%20b&sample-b.baseline=0.2');
    await page.clock.runFor(1);
    await expect.poll(() => query(page)).toBe('?ghost.x=a+b&sample-b.baseline=0.2&sample.baseline=0.32&sample.tail=two');
    expect(new URL(page.url()).hash).toBe('#section-url-state');

    await choose(page, 'sample', 'One-sided');
    await page.clock.runFor(DEBOUNCE_MS);
    await expect.poll(() => query(page)).toContain('sample.tail=one');
    expect(await page.evaluate(() => window.history.length)).toBe(historyLength);

    // Back leaves the page: the changes replaced its entry instead of adding new ones.
    await page.goBack();
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('a reload round-trips the written state', async ({ page }) => {
    await open(page, '/kitchen-sink?sample-b.preset=interview');
    await baseline(page, 'sample-b').focus();
    await page.keyboard.press('End');
    await choose(page, 'sample-b', 'Two-sided');
    await expect.poll(() => query(page)).toBe('?sample-b.preset=interview&sample-b.baseline=0.5&sample-b.tail=two');
    await page.reload();
    await expect(figure(page, 'sample-b')).toHaveAttribute('data-state-from', 'url');
    await expectShows(page, 'sample-b', '0.5', 'Two-sided');
    await expect(figure(page, 'sample-b')).toHaveAttribute('data-preset', 'interview');
    await expectShows(page, 'sample', '0.29', 'Two-sided');
  });

  test('a change made just before the page is left is flushed on pagehide, so Back finds it', async ({ page }) => {
    await page.clock.install();
    await open(page, '/kitchen-sink');
    // With the clock paused the debounce never fires on its own; only pagehide can write.
    await page.clock.pauseAt(Date.now() + 60_000);
    await baseline(page, 'sample').focus();
    await page.keyboard.press('Home');
    await expectShows(page, 'sample', '0.01', 'Two-sided');
    expect(query(page)).toBe('');
    await page.goto('/');
    await page.goBack();
    expect(query(page)).toBe('?sample.baseline=0.01&sample.tail=two');
    await expect(figure(page, 'sample')).toHaveAttribute('data-state-from', 'url');
    await expectShows(page, 'sample', '0.01', 'Two-sided');
  });

  test('a link clicked before the debounce fires still navigates, and Back finds the change', async ({ page }) => {
    // Next's patched replaceState dispatches a router RESTORE, and a RESTORE that arrives while a
    // navigation is pending discards it. Hold every RSC request so the navigation stays pending,
    // and pause the clock so the debounce fires only when the test says.
    const held: string[] = [];
    await page.route(
      (url) => url.searchParams.has('_rsc'),
      async (route) => {
        held.push(new URL(route.request().url()).pathname);
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        await route.continue().catch(() => {});
      },
    );
    await page.clock.install();
    await open(page, '/kitchen-sink');
    await page.clock.pauseAt(Date.now() + 60_000);
    await baseline(page, 'sample').focus();
    await page.keyboard.press('ArrowRight');
    await expectShows(page, 'sample', '0.3', 'Two-sided');
    await page.locator('[data-specimen="links--button"]').getByRole('link', { name: 'Primary link' }).click();
    // The debounce would fire now, while the navigation waits for its RSC payload.
    await page.clock.runFor(DEBOUNCE_MS * 2);
    await page.clock.resume();
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).toBe('/');
    expect(held).toContain('/');

    await page.goBack();
    await expect.poll(() => query(page)).toBe('?sample.baseline=0.3&sample.tail=two');
    await expect(figure(page, 'sample')).toHaveAttribute('data-state-from', 'url');
    await expectShows(page, 'sample', '0.3', 'Two-sided');
  });

  test("Reset clears only its own Figure's keys and restores the preset the page loaded with", async ({ page }) => {
    await open(page, '/kitchen-sink?sample.preset=interview&sample.baseline=0.3&sample-b.baseline=0.2&ghost.x=1');
    await expectShows(page, 'sample', '0.3', 'One-sided');
    await choose(page, 'sample', 'Two-sided');
    await figure(page, 'sample').getByRole('button', { name: 'Reset' }).click();
    await expectShows(page, 'sample', '0.1', 'One-sided');
    await expectShows(page, 'sample-b', '0.2', 'Two-sided');
    expect(query(page)).toBe('?sample.preset=interview&sample-b.baseline=0.2&ghost.x=1');
    // No late debounced write brings the cleared keys back.
    await page.waitForTimeout(DEBOUNCE_MS * 2);
    expect(query(page)).toBe('?sample.preset=interview&sample-b.baseline=0.2&ghost.x=1');

    await baseline(page, 'sample-b').focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => query(page)).toBe('?sample.preset=interview&sample-b.baseline=0.19&ghost.x=1&sample-b.tail=two');
    await figure(page, 'sample-b').getByRole('button', { name: 'Reset' }).click();
    expect(query(page)).toBe('?sample.preset=interview&ghost.x=1');
    await expectShows(page, 'sample-b', '0.29', 'Two-sided');
  });

  test('without JavaScript the server HTML shows the default preset, whatever the query', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/kitchen-sink?sample.baseline=0.2&sample.tail=one');
    await expect(figure(page, 'sample')).toHaveAttribute('data-state-from', 'server');
    await expect(figure(page, 'sample').locator('[data-readout]')).toHaveText(
      'Baseline rate 0.29, two-sided, from the default preset.',
    );
    await expect(figure(page, 'sample').locator('[data-slider]')).toBeHidden();
    await context.close();
  });

  test('the server fallback and the URL state take the same space, so nothing moves on hydration', async ({
    page,
    browser,
  }) => {
    const path = '/kitchen-sink?sample.baseline=0.2&sample.tail=one&sample-b.preset=interview';
    const sizes = (p: Page) =>
      p.locator(`${SPECIMEN} [data-figure]`).evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { width: Math.round(r.width), height: Math.round(r.height) };
        }),
      );
    // First paint: the inline script has set data-js (controls visible) but no bundle has run.
    const context = await browser.newContext({ viewport: page.viewportSize()! });
    const first = await context.newPage();
    await first.route('**/_next/static/**/*.js', (route) => route.abort());
    await first.goto(path);
    await expect(first.locator(`${SPECIMEN} [data-figure="sample"]`)).toHaveAttribute('data-state-from', 'server');
    await expect(first.locator(`${SPECIMEN} [data-figure="sample"] [data-slider]`)).toBeVisible();
    const before = await sizes(first);
    await context.close();

    await open(page, path);
    await expectShows(page, 'sample', '0.2', 'One-sided');
    expect(await sizes(page)).toEqual(before);
  });
});
