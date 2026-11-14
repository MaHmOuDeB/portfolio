import { writeFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { test, waitForIslands } from './fixtures';

// The Home page's review captures (not baselines): the screenshots a design review judges, with a
// manifest that records each one's viewport, group, state, layout and path. They run in the local
// Linux image only (never in the CI job), write to the test's output folder and assert nothing about
// pixels. The page's own visual baselines are in visual.spec.ts.

const host = (arm: 'a' | 'b', state: string) => `/kitchen-sink/home/${arm}/${state}`;

async function settled(page: Page) {
  await page.addStyleTag({ content: '[data-site-header]{position:static !important} *,*::before,*::after{transition:none !important}' });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await waitForIslands(page);
  // The load sequence is time-based: wait for it (scroll-linked animations have no end).
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.timeline instanceof DocumentTimeline).map((a) => a.finished.catch(() => undefined))));
}

type Shot = { file: string; path: string; state: string; arm: 'a' | 'b'; viewport: string; layout: string; what: string };

/** The states the review judges: how the note under the site tile reads in each phase. */
const REVIEW_STATES: readonly { state: string; what: string }[] = [
  { state: 'calibration', what: 'A/A collecting' },
  { state: 'ab-many-looks', what: 'A/B with enough data' },
  { state: 'inconclusive', what: 'A/B ended inconclusive' },
  { state: 'aa-failed', what: 'A/A check failed' },
  { state: 'before-data', what: 'before data' },
  { state: 'calibration-tiny', what: 'A/A collecting, counts "<5"' },
  { state: 'ab-tiny', what: 'A/B collecting, counts "<5"' },
  { state: 'paused-tiny', what: 'A/A paused' },
  { state: 'held-under-50', what: 'A/B stopped (held) under 50' },
  { state: 'held-enough-no-look', what: 'A/B stopped after both groups reached 50' },
  { state: 'closed-under-50', what: 'A/B result being confirmed' },
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

    // Each review state: the site tile and its note, desktop and phone.
    for (const { state, what } of REVIEW_STATES) {
      for (const size of [{ width: 1440, height: 900 }, { width: 375, height: 667 }]) {
        const page = await open(browser, host('b', state), size);
        const viewport = `${size.width}x${size.height}`;
        await take(page, { path: host('b', state), state, arm: 'b', viewport, layout: 'site tile', what }, '[data-home-site]');
        await page.context().close();
      }
    }

    // Both groups on one state with enough data: the cards' headlines differ, nothing else moves.
    for (const arm of ['a', 'b'] as const) {
      const page = await open(browser, host(arm, 'ab-many-looks'), { width: 1440, height: 900 });
      await take(page, { path: host(arm, 'ab-many-looks'), state: 'ab-many-looks', arm, viewport: '1440x900', layout: 'full page', what: 'A/B enough data, group pages' }, 'full');
      await page.context().close();
    }

    const manifest = info.outputPath('manifest.json');
    writeFileSync(manifest, JSON.stringify(shots, null, 2));
    await info.attach('manifest', { path: manifest, contentType: 'application/json' });
    expect(shots.length).toBeGreaterThan(REVIEW_STATES.length * 2);
  });
});
