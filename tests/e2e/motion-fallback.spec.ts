import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test, waitForIslands } from './fixtures';

// The scroll fallback on a phone (src/lib/depth/scrub.ts and the mirrored rules in globals.css). A
// browser without scroll timelines (Safari before 26) skips every scroll-linked rule; there, Lean sets
// data-depth-fallback on the root and drives the same keyframes from the scroll position. This engine
// has scroll timelines, so the test takes them away the way such a browser lacks them: CSS.supports
// answers no for animation-timeline, and until the gate is set no scroll-linked animation exists (a
// style with `animation: none` on the scroll-linked parts, as their @supports rules are skipped
// there; the time-based ones are left alone). Then the Home band's sheets must start fanned, move with
// the scroll and end exactly still (no transform) once the stack is fully in view; under reduced
// motion nothing moves and the gate is never set; and with the engine's own scroll timelines the gate
// is never set and the native motion still runs.

const PHONES = new Set(['mobile-chromium', 'phone-390-chromium']);

const NO_TIMELINES = () => {
  const supports = CSS.supports.bind(CSS);
  CSS.supports = function (this: unknown, ...args: [string] | [string, string]) {
    const text = args.length === 1 ? args[0] : `${args[0]}:${args[1]}`;
    return /animation-timeline/.test(text) ? false : supports(...(args as [string, string]));
  } as typeof CSS.supports;
  const style = document.createElement('style');
  style.textContent =
    ':root:not([data-depth-fallback]) :is([data-depth-rise],[data-depth-draw],[data-depth-book],[data-depth-scale],[data-depth-parallax],[data-depth-progress],[data-depth-sheet],[data-depth-drift]:not([data-depth-drift="tl"]),[data-depth-hinge]:not([data-depth-hinge="load"]),[data-experience-rule],[data-depth-ribbon] > ul),' +
    ':root:not([data-depth-fallback]) :is([data-depth-trace],[data-depth-trace] > *)::before { animation: none !important; }';
  const put = () => (document.documentElement ? (document.documentElement.append(style), true) : false);
  if (!put()) new MutationObserver((_, observer) => put() && observer.disconnect()).observe(document, { childList: true });
};

const frames = (page: Page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
const gated = (page: Page) => page.evaluate(() => document.documentElement.hasAttribute('data-depth-fallback'));
const transforms = (page: Page) => page.locator('[data-depth-sheet]').evaluateAll((els) => els.map((el) => getComputedStyle(el).transform));
const stackTop = (page: Page) => page.locator('[data-depth-stack]').evaluate((el) => el.getBoundingClientRect().top + scrollY);

async function open(page: Page, reducedMotion: 'reduce' | 'no-preference'): Promise<void> {
  await page.emulateMedia({ reducedMotion });
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await waitForIslands(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await frames(page);
}

/** From the top of the page until the stack's top is at the top of the screen, in steps of an eighth of the screen. */
async function* stackScroll(page: Page): AsyncGenerator<number> {
  const top = await stackTop(page);
  const step = Math.floor((page.viewportSize()?.height ?? 800) / 8);
  for (let y = 0; y < top; y += step) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await frames(page);
    yield y;
  }
  await page.evaluate((to) => window.scrollTo(0, to), top);
  await frames(page);
  yield top;
}

test.describe('@matrix motion fallback without scroll timelines', () => {
  test.beforeEach(({}, info) => {
    test.skip(!PHONES.has(info.project.name), 'phone projects only');
  });

  test('the band\'s sheets start fanned, follow the scroll and end exactly still', async ({ page }) => {
    await page.addInitScript(NO_TIMELINES);
    await open(page, 'no-preference');
    expect(await page.evaluate(() => CSS.supports('animation-timeline: view()')), 'the stub').toBe(false);
    await expect.poll(() => gated(page), 'the gate is set once the page has hydrated').toBe(true);

    // Driven by the page's own clock, paused: the script's delay sets the frame.
    const animations = await page.locator('[data-depth-sheet="1"]').evaluate((el) => el.getAnimations().map((a) => ({ name: (a as CSSAnimation).animationName, state: a.playState, document: a.timeline instanceof DocumentTimeline })));
    expect(animations).toEqual([{ name: 'depth-fan-1', state: 'paused', document: true }]);

    const seen: string[][] = [];
    for await (const y of stackScroll(page)) seen.push([String(y), ...(await transforms(page))]);
    const first = seen[0]!;
    for (const [i, t] of first.slice(1).entries()) expect(t, `sheet ${i + 1} at the top of the page`).not.toBe('none');
    // It moves with the scroll: sheet 1 takes several different poses on the way.
    expect(new Set(seen.map((s) => s[1])).size, 'distinct poses of sheet 1').toBeGreaterThan(3);
    // Fully in view: the still column, no transform at all.
    await expect.poll(() => transforms(page)).toEqual(['none', 'none', 'none']);

    // Back up: the fan comes back, so it follows the scroll both ways.
    await page.evaluate(() => window.scrollTo(0, 0));
    await frames(page);
    expect(await transforms(page)).toEqual(first.slice(1));
  });

  test('under reduced motion nothing moves and the gate is never set', async ({ page }) => {
    await page.addInitScript(NO_TIMELINES);
    await open(page, 'reduce');
    // The page has hydrated (the islands have swapped in), so Lean has had its chance to set the gate.
    for await (const y of stackScroll(page)) {
      expect(await gated(page), `the gate at scrollY ${y}`).toBe(false);
      expect(await transforms(page), `sheets at scrollY ${y}`).toEqual(['none', 'none', 'none']);
    }
  });

  test('with the engine\'s own scroll timelines the gate is never set and the native motion still runs', async ({ page }) => {
    await open(page, 'no-preference');
    expect(await page.evaluate(() => CSS.supports('animation-timeline: view()'))).toBe(true);
    const timeline = await page.locator('[data-depth-sheet="1"]').evaluate((el) => el.getAnimations().map((a) => a.timeline?.constructor.name));
    expect(timeline).toEqual(['ViewTimeline']);
    const seen: string[] = [];
    for await (const y of stackScroll(page)) {
      expect(await gated(page), `the gate at scrollY ${y}`).toBe(false);
      seen.push((await transforms(page))[0]!);
    }
    expect(seen[0]).not.toBe('none');
    expect(new Set(seen).size, 'distinct poses of sheet 1').toBeGreaterThan(3);
    await expect.poll(() => transforms(page)).toEqual(['none', 'none', 'none']);
  });
});
