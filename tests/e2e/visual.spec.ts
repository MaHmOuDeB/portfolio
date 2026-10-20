import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test, waitForIslands } from './fixtures';

// Visual baselines. The PNGs live in tests/e2e/__screenshots__/{project}/ and are generated only in
// the CI container (mcr.microsoft.com/playwright), never on a Mac: font rasterisation differs. A PR
// labelled `update-baselines` regenerates them (see .github/workflows/ci.yml).
// The web server builds with KITCHEN_SINK=1, so the kitchen-sink routes exist here.

const SKIP_LOCALLY = 'baselines exist only for the CI container';
// The 144 live specimens run at the two extremes only; the matrix projects see the rest.
const LIVE_PROJECTS = ['desktop-chromium', 'mobile-chromium'];
const SLOW_PAGE_TIMEOUT = 240_000;

/**
 * Fonts loaded and every island swapped in (or failed), so a shot never catches a fallback face or
 * a Figure between its server preview and its interactive form.
 */
async function settled(page: Page): Promise<void> {
  // The sticky header would cover the top of any element a shot scrolls into view, so every capture
  // is taken with it in the flow. Transitions are off too; Playwright's `animations: 'disabled'`
  // finishes running ones, this stops new ones starting.
  await page.addStyleTag({
    content: '[data-site-header]{position:static !important} *,*::before,*::after{transition:none !important}',
  });
  await page.evaluate(() => document.fonts.ready);
  await waitForIslands(page);
  // The JavaScript flag is on, so the JS-only parts (the table disclosure) are in place.
  await expect(page.locator('html')).toHaveAttribute('data-js', '');
}

/** A specimen whose view has the folded table: every one except the no-JS and error runtimes. */
async function expectDisclosure(page: Page, id: string): Promise<void> {
  if (/--(?:no-js|error)$/.test(id)) return;
  await expect(page.locator(`[data-specimen="${id}"] summary`).first()).toBeVisible();
}

async function specimenIds(page: Page): Promise<string[]> {
  return page
    .locator('[data-specimen]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-specimen') ?? ''));
}

test.describe('@visual @matrix visual baselines', () => {
  test.skip(!process.env.CI, SKIP_LOCALLY);

  test('every kitchen-sink specimen', async ({ page }) => {
    test.setTimeout(SLOW_PAGE_TIMEOUT);
    await page.goto('/kitchen-sink');
    await settled(page);
    const ids = await specimenIds(page);
    expect(ids.length, 'specimens found').toBeGreaterThan(0);
    for (const id of ids) {
      await expect(page.locator(`[data-specimen="${id}"]`)).toHaveScreenshot(`${id}.png`);
    }
  });

  test('every live-state specimen', async ({ page }, testInfo) => {
    test.skip(!LIVE_PROJECTS.includes(testInfo.project.name), 'the live states run at the two extremes only');
    test.setTimeout(SLOW_PAGE_TIMEOUT);
    await page.goto('/kitchen-sink/live');
    await settled(page);
    const ids = await specimenIds(page);
    expect(ids.length, 'specimens found').toBe(144);
    for (const id of ids) {
      await expectDisclosure(page, id);
      await expect(page.locator(`[data-specimen="${id}"]`)).toHaveScreenshot(`${id}.png`);
    }
  });

  test('the demo Figure while a visitor moves its slider', async ({ page }) => {
    await page.goto('/kitchen-sink');
    await settled(page);
    const specimen = page.locator('[data-specimen="figures--demo"]');
    const figure = page.locator('figure[data-figure="demo"]');
    // Intent loads the island; then the keyboard moves the slider one step.
    await figure.locator('h4').hover();
    await expect(page.locator('[data-island]', { has: figure })).toHaveAttribute('data-island', 'ready');
    await figure.getByRole('slider', { name: 'Baseline conversion' }).focus();
    await page.keyboard.press('ArrowRight');
    // Park the pointer in the gutter so no hover state is in the shot.
    await page.mouse.move(2, 2);
    await expect(specimen).toHaveScreenshot('figure--demo--interacting.png');
  });

  test('home and the not-found page, full viewport', async ({ page }) => {
    await page.goto('/');
    await settled(page);
    await expect(page).toHaveScreenshot('home.png');
    await page.goto('/no-such-page');
    await settled(page);
    await expect(page).toHaveScreenshot('not-found.png');
  });
});
