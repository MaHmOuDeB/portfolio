import { writeFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { test, waitForIslands } from './fixtures';

// The Home page's pictures.
// - Visual baselines (@visual): the scroll moment in four states on the test build's host: the
//   calibration collecting, the A/B with enough data, an inconclusive end and a failed A/A check.
//   Like visual.spec.ts, the PNGs exist only for the CI container and are generated there through the
//   baseline label; the moment is drawn in its stacked frames (reduced motion), the same at every run.
// - Review captures (not baselines): the screenshots a design review judges, with a manifest that
//   records each one's viewport, group, state, layout and path. They run in the local Linux image
//   only (never in the CI job), write to the test's output folder and assert nothing about pixels.

const SKIP_LOCALLY = 'baselines exist only for the CI container';
const scroll = (state: string) => `/kitchen-sink/home/scroll/${state}`;

async function settled(page: Page) {
  await page.addStyleTag({ content: '[data-site-header]{position:static !important} *,*::before,*::after{transition:none !important}' });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await waitForIslands(page);
  if (await page.locator('html[data-js]').count()) {
    await expect(page.locator('[data-scroll-moment] [data-home-chart]:not([data-measured])')).toHaveCount(0, { timeout: 15_000 });
  }
}

/** The four states the baselines hold: A/A collecting, A/B enough data, inconclusive, and one failure. */
const BASELINE_STATES = ['calibration', 'ab-many-looks', 'inconclusive', 'aa-failed'] as const;

test.describe('@visual home scroll moment baselines', () => {
  test.skip(!process.env.CI, SKIP_LOCALLY);
  test.use({ reducedMotion: 'reduce' });

  for (const state of BASELINE_STATES) {
    test(`the scroll moment, ${state}`, async ({ page }) => {
      await page.goto(scroll(state));
      await settled(page);
      await page.mouse.move(2, 2);
      await expect(page.locator('[data-scroll-moment]')).toHaveScreenshot(`home-moment--${state}.png`);
    });
  }
});

type Shot = { file: string; path: string; state: string; arm: 'a' | 'b'; viewport: string; layout: string; what: string };

/** The states the review judges: the four above, and each collecting frame (running, paused, stopped, confirming) in both phases. */
const REVIEW_STATES: readonly { state: string; what: string }[] = [
  { state: 'calibration', what: 'A/A collecting (kit chart, projection band)' },
  { state: 'ab-many-looks', what: 'A/B with enough data' },
  { state: 'inconclusive', what: 'A/B ended inconclusive' },
  { state: 'aa-failed', what: 'A/A check failed' },
  { state: 'before-data', what: 'before data (kit collecting row)' },
  { state: 'calibration-tiny', what: 'A/A collecting frame, running, counts "<5"' },
  { state: 'ab-tiny', what: 'A/B collecting frame, running, counts "<5" (stacked only)' },
  { state: 'paused-tiny', what: 'A/A collecting frame, paused' },
  { state: 'held-under-50', what: 'A/B collecting frame, stopped (held) under 50' },
  { state: 'held-enough-no-look', what: 'A/B collecting frame, stopped after both groups reached 50' },
  { state: 'closed-under-50', what: 'A/B collecting frame, result being confirmed' },
];

async function open(browser: Browser, url: string, size: { width: number; height: number }, options: BrowserContextOptions = {}): Promise<Page> {
  const context = await browser.newContext({ viewport: size, ...options });
  const page = await context.newPage();
  await page.goto(url);
  await settled(page);
  await page.mouse.move(2, 2);
  return page;
}

test.describe('home review captures', () => {
  test('screenshots and their manifest for the design review', async ({ browser }, info) => {
    test.skip(process.env.GITHUB_ACTIONS === 'true', 'review captures run in the local Linux image only');
    test.skip(info.project.name !== 'desktop-chromium', 'explicit viewports');
    test.setTimeout(600_000);
    const shots: Shot[] = [];
    const take = async (page: Page, shot: Omit<Shot, 'file'>, target: 'viewport' | 'full' | string) => {
      const file = `${String(shots.length + 1).padStart(2, '0')}-${shot.state}-${shot.arm}-${shot.viewport}-${shot.layout}.png`.replace(/[^a-z0-9.-]+/gi, '-');
      const out = info.outputPath(file);
      if (target === 'viewport') await page.screenshot({ path: out });
      else if (target === 'full') await page.screenshot({ path: out, fullPage: true });
      else await page.locator(target).screenshot({ path: out });
      shots.push({ file, ...shot });
    };

    // The real page in both groups: the first screen and the whole page, phone and desktop.
    for (const arm of ['a', 'b'] as const) {
      for (const size of [{ width: 375, height: 812 }, { width: 1440, height: 900 }]) {
        const page = await open(browser, `/?variant=${arm}`, size);
        const viewport = `${size.width}x${size.height}`;
        await take(page, { path: `/?variant=${arm}`, state: 'real page (e2e store)', arm, viewport, layout: 'first screen', what: 'home, first screen' }, 'viewport');
        await take(page, { path: `/?variant=${arm}`, state: 'real page (e2e store)', arm, viewport, layout: 'full page', what: 'home, whole page' }, 'full');
        await page.context().close();
      }
    }

    // Each review state: the sticky stage on the Evidence step (desktop and phone), and the stacked frames.
    for (const { state, what } of REVIEW_STATES) {
      for (const size of [{ width: 1440, height: 900 }, { width: 375, height: 667 }]) {
        const page = await open(browser, scroll(state), size);
        const viewport = `${size.width}x${size.height}`;
        const sticky = await page.locator('[data-scroll-stage]').isVisible();
        if (sticky) {
          // The step navigation sets the Evidence step and scrolls it into view.
          // From the first step with the stage stuck, the keyboard moves one step at a time, each scroll
          // settled before the next press (a pointer aimed at the button while the page still scrolls to the
          // moment can land beside it).
          const nav = page.locator('[data-scroll-stage] [data-step-nav]');
          await page.locator('#home-step-1').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
          await nav.getByRole('button', { name: 'Next' }).focus();
          for (const step of [2, 3]) {
            await page.keyboard.press('Enter');
            await expect(nav).toContainText(`${step} of 5`);
            await expect.poll(() => page.evaluate(() => new Promise<boolean>((resolve) => {
              const y = scrollY;
              setTimeout(() => resolve(scrollY === y), 250);
            }))).toBe(true);
          }
          // On a loaded machine a phone's chart can miss its wait, and the moment then drops to its
          // stacked frames for good (no stage, so no current step): record which layout was captured.
          await expect
            .poll(async () => (await page.locator('#home-step-3[aria-current="step"]').count()) + (await page.locator('[data-scroll-shell][data-chart-late]').count()), { timeout: 10_000 })
            .toBeGreaterThan(0);
          const late = (await page.locator('[data-scroll-shell][data-chart-late]').count()) > 0;
          await page.waitForTimeout(1200);
          await take(page, { path: scroll(state), state, arm: 'b', viewport, layout: late ? 'dropped to stacked frames (chart late)' : 'sticky, Evidence step', what }, 'viewport');
        } else {
          await take(page, { path: scroll(state), state, arm: 'b', viewport, layout: 'stacked only (no kit chart)', what }, '[data-scroll-moment]');
        }
        await page.context().close();
      }
      const stacked = await open(browser, scroll(state), { width: 375, height: 667 }, { reducedMotion: 'reduce' });
      await take(stacked, { path: scroll(state), state, arm: 'b', viewport: '375x667', layout: 'stacked frames (reduced motion)', what }, '[data-scroll-moment]');
      await stacked.context().close();
    }

    // Both groups on one state with enough data: the cards' headlines differ, nothing else moves.
    for (const arm of ['a', 'b'] as const) {
      const page = await open(browser, `/kitchen-sink/home/${arm}/ab-many-looks`, { width: 1440, height: 900 });
      await take(page, { path: `/kitchen-sink/home/${arm}/ab-many-looks`, state: 'ab-many-looks', arm, viewport: '1440x900', layout: 'full page', what: 'A/B enough data, group pages' }, 'full');
      await page.context().close();
    }

    const manifest = info.outputPath('manifest.json');
    writeFileSync(manifest, JSON.stringify(shots, null, 2));
    await info.attach('manifest', { path: manifest, contentType: 'application/json' });
    expect(shots.length).toBeGreaterThan(REVIEW_STATES.length * 3);
  });
});
