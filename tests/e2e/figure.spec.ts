import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations, test } from './fixtures';

// The "Figures" section of the kitchen sink (Review Focus 5): two interactive demo Figures, `demo`
// and `demo-b` (Baseline conversion 0.05 to 0.5, step 0.01, preset 0.1; Power 80% or 90%; Reset),
// loaded on intent by LoadOnIntent; forced no-JS and error specimens; and `thrower`, a client island
// that throws when the pointer enters it or its button is pressed.

const RESULT = /^[\d,]+ visitors per group to detect a rise of 2 points$/;
const STATIC_SENTENCE = 'This chart could not load. The numbers are in the table below.';
const THROWN = 'A fictional failure in the kitchen sink';
const CHART_FAILURE = 'A fictional chart failure in the kitchen sink';

const figure = (page: Page, id: string) => page.locator(`figure[data-figure="${id}"]`);
const island = (page: Page, id: string) => page.locator('[data-island]', { has: figure(page, id) });
const baseline = (page: Page, id: string) => figure(page, id).getByRole('slider', { name: 'Baseline conversion' });
const query = (page: Page) => new URL(page.url()).searchParams;

/** Collects page errors and console errors, except resource 404s and the expected throws. */
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

/** Moves the pointer onto the Figure (its title) and waits for the island to replace the preview. */
async function ready(page: Page, id: string) {
  await figure(page, id).locator('h4').hover();
  await expect(island(page, id)).toHaveAttribute('data-island', 'ready');
}

/** Stops the idle trigger, so only a visitor's intent loads an island. */
async function withoutIdle(page: Page) {
  await page.addInitScript(() => {
    window.requestIdleCallback = () => 0;
    window.cancelIdleCallback = () => {};
  });
}

/**
 * Points at the throwing island. The pointer waits in the page gutter while the page scrolls, so
 * the island does not pass under it (and throw) before the hover lands.
 */
async function pointAtThrower(page: Page) {
  await page.mouse.move(2, 200);
  const thrower = figure(page, 'thrower').locator('[data-thrower]');
  await thrower.scrollIntoViewIfNeeded();
  await thrower.hover();
}

const markTransition = (page: Page, id: string) =>
  figure(page, id)
    .locator('[data-mark]')
    .first()
    .evaluate((el) => getComputedStyle(el).transitionDuration);

test.describe('kitchen sink Figures', () => {
  test('URL state: each Figure reads its own keys, writes once after a burst and resets only its own', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/kitchen-sink?demo.baseline=0.2&demo-b.baseline=0.4');
    await ready(page, 'demo');
    await ready(page, 'demo-b');
    await expect(baseline(page, 'demo')).toHaveValue('0.2');
    await expect(baseline(page, 'demo-b')).toHaveValue('0.4');

    const before = await page.evaluate(() => history.length);
    await baseline(page, 'demo').focus();
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
    await expect(baseline(page, 'demo')).toHaveValue('0.25');
    await expect.poll(() => query(page).get('demo.baseline'), { timeout: 1000 }).toBe('0.25');
    expect(query(page).get('demo-b.baseline')).toBe('0.4');
    expect(await page.evaluate(() => history.length)).toBe(before);

    await figure(page, 'demo').getByRole('button', { name: 'Reset' }).click();
    await expect(baseline(page, 'demo')).toHaveValue('0.1');
    await expect.poll(() => query(page).has('demo.baseline')).toBe(false);
    expect(query(page).get('demo-b.baseline')).toBe('0.4');
    expect(errors).toEqual([]);
  });

  test('URL state: a value that does not parse shows the preset', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/kitchen-sink?demo.baseline=abc');
    await ready(page, 'demo');
    await expect(baseline(page, 'demo')).toHaveValue('0.1');
    expect(errors).toEqual([]);
  });

  test('URL state: Back across a same-page entry shows that entry, and nothing writes over it', async ({ page }) => {
    await page.goto('/kitchen-sink?demo.baseline=0.3');
    await ready(page, 'demo');
    await page.evaluate(() => {
      window.location.hash = 'section-figures';
    });
    await baseline(page, 'demo').focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => query(page).get('demo.baseline')).toBe('0.31');
    expect(new URL(page.url()).hash).toBe('#section-figures');

    await page.goBack();
    await expect.poll(() => new URL(page.url()).hash).toBe('');
    expect(query(page).get('demo.baseline')).toBe('0.3');
    await expect(baseline(page, 'demo')).toHaveValue('0.3');
    await page.waitForTimeout(500);
    expect(query(page).get('demo.baseline')).toBe('0.3');
  });

  test('Reset lands at once: the marks hold no transition while the preset is restored', async ({ page }) => {
    await page.goto('/kitchen-sink?demo.baseline=0.3');
    await ready(page, 'demo');
    await figure(page, 'demo').evaluate((el) => {
      const seen: string[] = [];
      (window as unknown as { seen: string[] }).seen = seen;
      new MutationObserver((records) => {
        for (const r of records) if (el.hasAttribute('data-instant')) seen.push(r.attributeName ?? '');
      }).observe(el, { attributes: true, attributeFilter: ['data-instant'] });
    });
    await figure(page, 'demo').getByRole('button', { name: 'Reset' }).click();
    await expect(baseline(page, 'demo')).toHaveValue('0.1');
    expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual(['data-instant']);
    await expect(figure(page, 'demo')).not.toHaveAttribute('data-instant');
  });

  test('announces the result on release, never during a drag, and drags without transitions', async ({ page }) => {
    await page.goto('/kitchen-sink');
    await ready(page, 'demo');
    const live = figure(page, 'demo').locator('[data-figure-announcement]');
    await expect(live).toHaveAttribute('aria-live', 'polite');
    await expect(live).toHaveText('');
    // Outside a drag the marks ease, so the 0s below is the drag's doing.
    expect(await markTransition(page, 'demo')).toBe('0.24s');

    const box = (await baseline(page, 'demo').boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.3, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, y, { steps: 5 });
    await expect(figure(page, 'demo')).toHaveAttribute('data-dragging', '');
    expect(await markTransition(page, 'demo')).toBe('0s');
    await expect(live).toHaveText('');

    await page.mouse.up();
    await expect(live).toHaveText(RESULT);
    await expect(figure(page, 'demo')).not.toHaveAttribute('data-dragging');
    const result = await figure(page, 'demo').locator('[data-figure-result]').textContent();
    await expect(live).toHaveText(result!);
    await expect(live).toHaveAttribute('data-derived', 'simulated');
  });

  test('without JavaScript: the chart, the open table and "Controls need JavaScript.", and no controls', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/kitchen-sink?demo.baseline=0.4');
    for (const id of ['demo', 'demo-b']) {
      const f = figure(page, id);
      // The static HTML holds each Figure once.
      await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
      await expect(f.getByText('Controls need JavaScript.')).toBeVisible();
      await expect(f.locator('[data-nojs-only] table')).toBeVisible();
      await expect(f.locator('details')).toBeHidden();
      await expect(f.getByRole('group', { name: 'Controls' })).toBeHidden();
      await expect(f.locator('svg[data-chart-frame]:visible')).toHaveCount(1);
      // A static page cannot read the query: the preset is drawn.
      await expect(f.locator('[data-figure-result]')).toHaveText(RESULT);
    }
    await context.close();
  });

  test('a throwing island shows the fallback in its own Figure only, and the pointer never moves focus', async ({ page }) => {
    const errors = watchErrors(page, [THROWN]);
    await page.goto('/kitchen-sink');
    await ready(page, 'demo');
    await baseline(page, 'demo').focus();

    await pointAtThrower(page);
    const status = figure(page, 'thrower').getByRole('status');
    await expect(status).toHaveText(STATIC_SENTENCE);
    await expect(figure(page, 'thrower').locator('[data-figure-fallback] table')).toBeVisible();
    await expect(figure(page, 'thrower').locator('[data-figure-preview] svg[data-chart-frame]:visible')).toHaveCount(1);
    await expect(figure(page, 'thrower').getByRole('heading', { level: 4 })).toHaveText(
      'A rise of two points takes thousands of visitors per group to detect.',
    );
    // Its own folded table and the "Show the numbers" disclosure are gone with the chart.
    await expect(figure(page, 'thrower').locator('details')).toBeHidden();
    await expect(figure(page, 'thrower').locator('a')).toHaveCount(0);
    await expect(baseline(page, 'demo')).toBeFocused();

    // The neighbour still works.
    await page.keyboard.press('ArrowRight');
    await expect(baseline(page, 'demo')).toHaveValue('0.11');
    await expect(figure(page, 'demo').getByRole('status')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('a pointer failure with nothing focused leaves focus where it was', async ({ page }) => {
    watchErrors(page, [THROWN]);
    await page.goto('/kitchen-sink');
    await pointAtThrower(page);
    const status = figure(page, 'thrower').getByRole('status');
    await expect(status).toHaveText(STATIC_SENTENCE);
    await expect(status).not.toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  });

  test('a keyboard failure takes focus with it, so the fallback receives it', async ({ page }) => {
    watchErrors(page, [THROWN]);
    await page.goto('/kitchen-sink');
    await figure(page, 'thrower').getByRole('button', { name: 'Make this chart fail' }).focus();
    await page.keyboard.press('Enter');
    const status = figure(page, 'thrower').getByRole('status');
    await expect(status).toHaveText(STATIC_SENTENCE);
    await expect(status).toBeFocused();
  });

  test("an island's own chart throwing on a keyboard step shows the ruled fallback in that Figure only", async ({ page }) => {
    const errors = watchErrors(page, [CHART_FAILURE]);
    await page.goto('/kitchen-sink');
    await ready(page, 'fragile');
    const f = figure(page, 'fragile');
    await baseline(page, 'fragile').focus();
    await page.keyboard.press('ArrowRight');

    const status = f.getByRole('status');
    await expect(status).toHaveText(STATIC_SENTENCE);
    await expect(status).toBeFocused();
    await expect(f.locator('[data-figure-fallback] table')).toBeVisible();
    // The build-time chart from the server, not the client chart that threw.
    await expect(f.locator('[data-figure-preview] svg[data-chart-frame]:visible')).toHaveCount(1);
    await expect(f.getByRole('heading', { level: 4 })).toHaveText('Smaller rises need many more visitors.');
    await expect(f.getByRole('group', { name: 'Controls' })).toBeHidden();
    await expect(f.locator('a')).toHaveCount(0);
    await expect(f).not.toContainText(CHART_FAILURE);
    // Not the island guard's no-JS view, and not the page-level error page.
    await expect(f.getByText('Controls need JavaScript.')).toBeHidden();
    await expect(page.locator('[data-island="failed"]')).toHaveCount(0);
    await expect(island(page, 'fragile')).toHaveAttribute('data-island', 'ready');
    await expect(page.getByRole('heading', { level: 1, name: 'Kitchen sink' })).toBeVisible();
    await expect(page.getByText('This page could not load')).toHaveCount(0);

    // The other Figures stay interactive.
    await ready(page, 'demo');
    await baseline(page, 'demo').focus();
    await page.keyboard.press('ArrowRight');
    await expect(baseline(page, 'demo')).toHaveValue('0.11');
    await expect(figure(page, 'demo').getByRole('status')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('intent: the island is idle until the pointer arrives, and its code loads only then', async ({ page }) => {
    await withoutIdle(page);
    const chunks: string[] = [];
    let loaded = false;
    page.on('request', (request) => {
      if (loaded && request.resourceType() === 'script') chunks.push(request.url());
    });
    await page.goto('/kitchen-sink');
    await page.waitForLoadState('load');
    await page.waitForTimeout(500);
    loaded = true;
    await expect(island(page, 'demo')).toHaveAttribute('data-island', 'idle');
    await expect(island(page, 'demo-b')).toHaveAttribute('data-island', 'idle');
    await page.waitForTimeout(500);
    expect(chunks).toEqual([]);

    await ready(page, 'demo');
    expect(chunks.length).toBeGreaterThan(0);
    await expect(island(page, 'demo-b')).toHaveAttribute('data-island', 'idle');
  });

  test('intent: focus moving into the preview loads the island and keeps focus on the same control', async ({ page }) => {
    await withoutIdle(page);
    await page.goto('/kitchen-sink');
    await expect(island(page, 'demo')).toHaveAttribute('data-island', 'idle');
    await baseline(page, 'demo').focus();
    await expect(island(page, 'demo')).toHaveAttribute('data-island', 'ready');
    await expect(baseline(page, 'demo')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(baseline(page, 'demo')).toHaveValue('0.11');
  });

  test('intent: idle time loads the island without any interaction', async ({ page }) => {
    await page.goto('/kitchen-sink');
    await expect(island(page, 'demo')).toHaveAttribute('data-island', 'ready', { timeout: 5000 });
    await expect(island(page, 'demo-b')).toHaveAttribute('data-island', 'ready', { timeout: 5000 });
  });

  test('an island whose code fails to load falls back to the no-JS view of its preview', async ({ page }) => {
    await withoutIdle(page);
    watchErrors(page, ['chunk', 'Chunk', 'Failed to fetch', 'dynamically imported module', 'Importing a module script failed']);
    let block = false;
    await page.route('**/_next/static/**/*.js', (route) => (block ? route.abort() : route.continue()));
    await page.goto('/kitchen-sink');
    await page.waitForLoadState('load');
    await page.waitForTimeout(500);
    block = true;

    await figure(page, 'demo').locator('h4').hover();
    await expect(page.locator('[data-island="failed"]', { has: figure(page, 'demo') })).toHaveCount(1);
    await expect(figure(page, 'demo').getByText('Controls need JavaScript.')).toBeVisible();
    await expect(figure(page, 'demo').locator('[data-nojs-only] table')).toBeVisible();
    await expect(figure(page, 'demo').getByRole('group', { name: 'Controls' })).toBeHidden();
    await expect(figure(page, 'demo').locator('svg[data-chart-frame]:visible')).toHaveCount(1);
    // The rest of the page is untouched.
    await expect(page.getByRole('heading', { level: 1, name: 'Kitchen sink' })).toBeVisible();
    await expect(figure(page, 'static').locator('svg[data-chart-frame]:visible')).toHaveCount(1);
  });

  test('an island that fails after focus loaded it hands focus to the open table', async ({ page }) => {
    await withoutIdle(page);
    watchErrors(page, ['chunk', 'Chunk', 'Failed to fetch', 'dynamically imported module', 'Importing a module script failed']);
    let block = false;
    await page.route('**/_next/static/**/*.js', (route) => (block ? route.abort() : route.continue()));
    await page.goto('/kitchen-sink');
    await page.waitForLoadState('load');
    await page.waitForTimeout(500);
    block = true;

    await baseline(page, 'demo').focus();
    const failed = page.locator('[data-island="failed"]', { has: figure(page, 'demo') });
    await expect(failed).toHaveCount(1);
    await expect(figure(page, 'demo').locator('[data-nojs-only] [role="region"]')).toBeFocused();
  });

  test('axe finds no violations with the islands loaded and a fallback showing', async ({ page }) => {
    // About 10 s alone and 40 s in WebKit when every worker is busy.
    test.setTimeout(90_000);
    watchErrors(page, [THROWN]);
    await page.goto('/kitchen-sink');
    await ready(page, 'demo');
    await ready(page, 'demo-b');
    // This scan needs the fallback state. Pointer-triggered focus behavior has its own tests.
    await page.mouse.move(2, 200);
    await figure(page, 'thrower').getByRole('button', { name: 'Make this chart fail' }).press('Enter');
    await expect(figure(page, 'thrower').getByRole('status')).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

// /kitchen-sink/eager and its sub-routes: the Figure loaded with `eager`. The success specimen is on
// a page of its own, so it is held to no errors at all; each failing island has a route of its own
// and names the one error it allows.
test.describe('kit extension: eager loading', () => {
  const EAGER = '/kitchen-sink/eager';
  const FAILED = '/kitchen-sink/eager/failed';
  const DELAYED = '/kitchen-sink/eager/delayed';
  const TOGGLE = '/kitchen-sink/eager/toggle';

  test('eager: the island loads after hydration with no pointer, no focus and no idle callback', async ({ page }) => {
    await withoutIdle(page);
    const errors = watchErrors(page);
    await page.goto(EAGER);
    // The server sends the preview; the island replaces it once the page is interactive.
    await expect(island(page, 'eager')).toHaveAttribute('data-island', 'ready');
    await expect(baseline(page, 'eager')).toBeVisible();
    await baseline(page, 'eager').focus();
    await page.keyboard.press('ArrowRight');
    await expect(baseline(page, 'eager')).toHaveValue('0.11');
    expect(errors).toEqual([]);
  });

  test('eager: the server HTML is the preview, and the browser requests the island code once, after hydration', async ({ page, request }) => {
    const response = await request.get(EAGER);
    const html = await response.text();
    expect(html).toContain('data-island="idle"');
    expect(html).not.toContain('data-island="ready"');
    await withoutIdle(page);
    await page.goto(EAGER);
    await expect(island(page, 'eager')).toHaveAttribute('data-island', 'ready');
    // The lazy factory counts its calls on `window`: it only runs in a browser, when the island renders.
    expect(await page.evaluate(() => window.__demoIslandRequests)).toBe(1);
  });

  test('the default stays deferred: the demo Figure on the kitchen sink is still idle without intent', async ({ page }) => {
    await withoutIdle(page);
    await page.goto('/kitchen-sink');
    await page.waitForLoadState('load');
    await page.waitForTimeout(500);
    await expect(island(page, 'demo')).toHaveAttribute('data-island', 'idle');
    expect(await page.evaluate(() => window.__demoIslandRequests ?? 0)).toBe(0);
  });

  test('eager switched on after mount: the island loads once, and later renders do not load it again', async ({ page }) => {
    await withoutIdle(page);
    const errors = watchErrors(page);
    await page.goto(TOGGLE);
    const counts = () => page.evaluate(() => window.__eagerToggle ?? { loads: 0, mounts: 0 });
    await expect(page.locator('[data-eager-toggle="state"]')).toHaveText('eager off, rendered 0 times');
    // Hydrated, deferred and nothing to trigger it: nothing loads.
    await page.waitForLoadState('load');
    await page.waitForTimeout(500);
    await expect(island(page, 'eager-toggle')).toHaveAttribute('data-island', 'idle');
    expect(await counts()).toEqual({ loads: 0, mounts: 0 });

    await page.locator('[data-eager-toggle="on"]').click();
    await expect(island(page, 'eager-toggle')).toHaveAttribute('data-island', 'ready');
    await expect(baseline(page, 'eager-toggle')).toBeVisible();
    expect(await counts()).toEqual({ loads: 1, mounts: 1 });

    for (let i = 1; i <= 3; i += 1) {
      await page.locator('[data-eager-toggle="rerender"]').click();
      await expect(page.locator('[data-eager-toggle="state"]')).toHaveText(`eager on, rendered ${i} times`);
    }
    await expect(island(page, 'eager-toggle')).toHaveAttribute('data-island', 'ready');
    expect(await counts()).toEqual({ loads: 1, mounts: 1 });
    expect(errors).toEqual([]);
  });

  test('eager: an island whose code fails to load shows the same no-JS preview as intent loading, and focus stays put', async ({ page }) => {
    await withoutIdle(page);
    const errors = watchErrors(page, ['A fictional chunk failure']);
    await page.goto(FAILED);
    const failed = page.locator('[data-island="failed"]', { has: figure(page, 'eager-failed') });
    await expect(failed).toHaveCount(1);
    await expect(figure(page, 'eager-failed').getByText('Controls need JavaScript.')).toBeVisible();
    await expect(figure(page, 'eager-failed').locator('[data-nojs-only] table')).toBeVisible();
    await expect(figure(page, 'eager-failed').getByRole('group', { name: 'Controls' })).toBeHidden();
    await expect(figure(page, 'eager-failed').locator('svg[data-chart-frame]:visible')).toHaveCount(1);
    // Nothing held focus, so none is taken: it does not jump to the table the way a focused island's does.
    await expect(figure(page, 'eager-failed').locator('[data-nojs-only] [role="region"]')).not.toBeFocused();
    // The Figure beside it, and the rest of the page, are untouched.
    await expect(island(page, 'eager')).toHaveAttribute('data-island', 'ready');
    await expect(page.getByRole('heading', { level: 1, name: 'Eager loading, code unreachable' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  /** Opens the pending-request fixture and waits until the browser has asked for the island's code. */
  async function pending(page: Page) {
    await withoutIdle(page);
    const errors = watchErrors(page, ['A fictional delayed chunk failure']);
    await page.goto(DELAYED);
    await page.waitForFunction(() => window.__delayedIsland?.requests === 1);
    // The request is in flight: the preview is what is on screen.
    await expect(island(page, 'eager-delayed')).toHaveAttribute('data-island', 'idle');
    await expect(baseline(page, 'eager-delayed')).toBeVisible();
    return errors;
  }
  const refuse = (page: Page) => page.evaluate(() => window.__delayedIsland?.fail());

  test('eager: focus in the preview while the request is pending goes to the open table when the request fails', async ({ page }) => {
    const errors = await pending(page);
    await baseline(page, 'eager-delayed').focus();
    await expect(baseline(page, 'eager-delayed')).toBeFocused();
    // Focusing the preview is also intent, but the island is already on its way: it is not asked for twice.
    expect(await page.evaluate(() => window.__delayedIsland?.requests)).toBe(1);

    await refuse(page);
    const failed = page.locator('[data-island="failed"]', { has: figure(page, 'eager-delayed') });
    await expect(failed).toHaveCount(1);
    await expect(figure(page, 'eager-delayed').getByText('Controls need JavaScript.')).toBeVisible();
    await expect(figure(page, 'eager-delayed').locator('[data-nojs-only] table')).toBeVisible();
    await expect(figure(page, 'eager-delayed').getByRole('group', { name: 'Controls' })).toBeHidden();
    await expect(figure(page, 'eager-delayed').locator('svg[data-chart-frame]:visible')).toHaveCount(1);
    await expect(figure(page, 'eager-delayed').locator('[data-nojs-only] [role="region"]')).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('eager: focus elsewhere while the request is pending is not taken when the request fails', async ({ page }) => {
    await pending(page);
    const elsewhere = page.locator('[data-focus-elsewhere]');
    await elsewhere.focus();
    await expect(elsewhere).toBeFocused();

    await refuse(page);
    await expect(page.locator('[data-island="failed"]', { has: figure(page, 'eager-delayed') })).toHaveCount(1);
    await expect(figure(page, 'eager-delayed').locator('[data-nojs-only] table')).toBeVisible();
    await expect(elsewhere).toBeFocused();
    await expect(figure(page, 'eager-delayed').locator('[data-nojs-only] [role="region"]')).not.toBeFocused();
  });

  test('eager: with no focus anywhere while the request is pending, none is taken when the request fails', async ({ page }) => {
    await pending(page);
    await refuse(page);
    await expect(page.locator('[data-island="failed"]', { has: figure(page, 'eager-delayed') })).toHaveCount(1);
    await expect(figure(page, 'eager-delayed').locator('[data-nojs-only] table')).toBeVisible();
    await expect(figure(page, 'eager-delayed').locator('[data-nojs-only] [role="region"]')).not.toBeFocused();
  });
});

// /kitchen-sink/chart-overrides: a live chart with its own plot height and accessible name.
test.describe('kit extension: chart overrides', () => {
  const OVERRIDES = '/kitchen-sink/chart-overrides';

  const plotHeight = (page: Page, chartId: string, layout: 'narrow' | 'wide') =>
    page
      .locator(`[data-chart="${chartId}-chart"] svg[data-layout="${layout}"] svg[data-mark-layer]`)
      .evaluate((el) => Number(el.getAttribute('height')));
  const frameBox = (page: Page, chartId: string, layout: 'narrow' | 'wide') =>
    page.locator(`[data-chart="${chartId}-chart"] svg[data-layout="${layout}"]`).evaluate((el) => {
      const box = el.getBoundingClientRect();
      return { width: box.width, height: box.height, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth };
    });

  for (const [name, size, layout, expected] of [
    ['phone', { width: 390, height: 844 }, 'narrow', { default: 220, override: 160 }],
    ['desktop', { width: 1280, height: 800 }, 'wide', { default: 280, override: 340 }],
  ] as const) {
    test(`chart overrides on a ${name}: the plot takes its own height, the default keeps its own`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto(OVERRIDES);
      expect(await plotHeight(page, 'chart-default', layout)).toBe(expected.default);
      expect(await plotHeight(page, 'chart-override', layout)).toBe(expected.override);
      const normal = await frameBox(page, 'chart-default', layout);
      const own = await frameBox(page, 'chart-override', layout);
      // The rendered frame grows or shrinks by exactly the plot's difference, and nothing overflows.
      expect(own.height - normal.height).toBeCloseTo(expected.override - expected.default, 0);
      expect(own.width).toBeCloseTo(normal.width, 0);
      expect(own.scrollWidth).toBeLessThanOrEqual(own.clientWidth);
    });
  }

  test('chart overrides: the explicit label names both frames, the default keeps the generated one', async ({ page }) => {
    await page.goto(OVERRIDES);
    const labels = (id: string) => page.locator(`[data-chart="${id}-chart"] svg[data-chart-frame]`).evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
    const own = await labels('chart-override');
    expect(own).toHaveLength(2);
    expect(new Set(own).size).toBe(1);
    expect(own[0]).toMatch(/^The two groups compared as views accumulate/);
    expect(own[0]).not.toMatch(/\d/);
    const generated = await labels('chart-default');
    expect(generated[0]).toMatch(/^The difference between the groups, B minus A, as views per group grow/);
  });

  test('chart overrides in forced colours: the chart still draws, at the same geometry, and axe finds nothing', async ({ page }) => {
    await page.goto(OVERRIDES);
    const before = await plotHeight(page, 'chart-override', 'wide');
    await page.emulateMedia({ forcedColors: 'active' });
    expect(await plotHeight(page, 'chart-override', 'wide')).toBe(before);
    for (const id of ['chart-default', 'chart-override']) {
      await expect(page.locator(`[data-chart="${id}-chart"] svg[data-layout]:visible [data-cs="band"]`)).toHaveCount(1);
      await expect(page.locator(`[data-chart="${id}-chart"] svg[data-layout]:visible [data-cs="current"]`)).toHaveCount(1);
    }
    await expectNoA11yViolations(page);
  });
});
