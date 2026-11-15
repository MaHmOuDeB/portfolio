import { expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { test, waitForIslands } from './fixtures';

// Motion below lg, on the real pages. With motion allowed and scroll timelines, the Home band's three
// sheets start in a fanned pose and settle into the static column as the stack scrolls into view, and
// that end state is exactly the still column (the one reduced motion shows). Nothing scrolls sideways
// at 320, 375 or 390 px at any point of the scroll: before, during and after the stack, through the
// drifting, hinging and tracing blocks of Home, About and a case study. Under reduced motion nothing
// this motion touches is transformed or animated. An engine without scroll timelines shows the static
// column from the start, and that is checked instead of the fan.

const PHONES = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
] as const;
const ROUTES = ['/', '/about', '/work/audible'] as const;

const frames = (page: Page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function open(browser: Browser, route: string, size: { width: number; height: number }, reducedMotion: 'reduce' | 'no-preference'): Promise<Page> {
  const context = await browser.newContext({ viewport: size, reducedMotion });
  const page = await context.newPage();
  const response = await page.goto(route);
  expect(response?.status(), route).toBe(200);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await waitForIslands(page);
  // The load sequence is time-based: past it, only scroll-linked motion is left.
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.timeline instanceof DocumentTimeline).map((a) => a.finished.catch(() => undefined))));
  await frames(page);
  return page;
}

const timelines = (page: Page) => page.evaluate(() => CSS.supports('animation-timeline: view()'));
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Each sheet's computed transform and its box in page coordinates. */
const sheets = (page: Page) =>
  page.locator('[data-depth-sheet]').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { transform: getComputedStyle(el).transform, x: r.x, y: r.y + scrollY, width: r.width, height: r.height, left: r.left, right: r.right };
    }),
  );

/** The stack's top in page coordinates and its height. */
const stackBox = (page: Page) =>
  page.locator('[data-depth-stack]').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top + scrollY, height: r.height, bottomInView: r.bottom };
  });

test.describe('Phone motion', () => {
  test('at 375x812 the band\'s sheets start fanned and settle into exactly the still column', async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop-chromium' && info.project.name !== 'desktop-webkit', 'explicit sizes, once per engine');
    const size = { width: 375, height: 812 };
    const page = await open(browser, '/', size, 'no-preference');
    const moving = await timelines(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await frames(page);

    // Before: the stack has not fully entered the screen, so its entrance is not over.
    const stack = await stackBox(page);
    expect(stack.bottomInView, 'the stack is not yet all in view at the top of the page').toBeGreaterThan(size.height);
    const before = await sheets(page);
    expect(before).toHaveLength(3);
    if (moving) {
      for (const [i, s] of before.entries()) expect(s.transform, `sheet ${i + 1} before`).not.toBe('none');
    } else {
      for (const [i, s] of before.entries()) expect(s.transform, `sheet ${i + 1} without scroll timelines`).toBe('none');
    }

    // After: the stack's top at the top of the screen, all of it has entered (it is shorter than the screen).
    expect(stack.height).toBeLessThan(size.height);
    await page.evaluate((top) => window.scrollTo(0, top), stack.top);
    await frames(page);
    await expect.poll(async () => (await sheets(page)).map((s) => s.transform)).toEqual(['none', 'none', 'none']);
    const after = await sheets(page);
    expect(
      await page.locator('[data-depth-sheet]').evaluateAll((els) => els.every((el) => el.getAnimations().every((a) => a.effect?.getComputedTiming().progress === null))),
      'no animation applies once the stack is in view',
    ).toBe(true);

    // The end state is the still column: the same boxes under reduced motion.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await frames(page);
    const still = await sheets(page);
    for (const [i, s] of after.entries()) {
      for (const side of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(s[side] - still[i]![side]), `sheet ${i + 1} ${side}`).toBeLessThanOrEqual(0.5);
    }
    await page.context().close();
  });

  for (const size of PHONES) {
    test(`at ${size.width}x${size.height} nothing scrolls sideways while the stack enters, and every sheet stays on screen`, async ({ browser }, info) => {
      test.skip(info.project.name !== 'desktop-chromium' && info.project.name !== 'desktop-webkit', 'explicit sizes, once per engine');
      const page = await open(browser, '/', size, 'no-preference');
      const stack = await stackBox(page);
      // From the top of the page (or from where the stack's top meets the screen's bottom) until its top
      // reaches the top of the screen, in steps of a twelfth of the screen.
      const from = Math.max(0, Math.floor(stack.top - size.height));
      const step = Math.floor(size.height / 12);
      for (let y = from; y <= stack.top + step; y += step) {
        await page.evaluate((to) => window.scrollTo(0, to), y);
        await frames(page);
        expect(await sideways(page), `sideways scroll at scrollY ${y}`).toBeLessThanOrEqual(0);
        for (const [i, s] of (await sheets(page)).entries()) {
          expect(s.left, `sheet ${i + 1} left edge at scrollY ${y}`).toBeGreaterThanOrEqual(-1);
          expect(s.right, `sheet ${i + 1} right edge at scrollY ${y}`).toBeLessThanOrEqual(size.width + 1);
        }
      }
      await page.context().close();
    });

    for (const route of ROUTES) {
      test(`${route} at ${size.width}x${size.height}: nothing scrolls sideways from the top of the page to its end`, async ({ browser }, info) => {
        test.skip(info.project.name !== 'desktop-chromium' && info.project.name !== 'desktop-webkit', 'explicit sizes, once per engine');
        test.setTimeout(120_000);
        const page = await open(browser, route, size, 'no-preference');
        expect(await sideways(page), 'sideways scroll on load').toBeLessThanOrEqual(0);
        const step = Math.floor(size.height / 3);
        let last = -1;
        for (let y = 0; ; y += step) {
          await page.evaluate((to) => window.scrollTo(0, to), y);
          await frames(page);
          expect(await sideways(page), `sideways scroll at scrollY ${y}`).toBeLessThanOrEqual(0);
          const now = await page.evaluate(() => Math.round(window.scrollY));
          if (now === last) break;
          last = now;
        }
        await page.context().close();
      });
    }
  }

  for (const route of ROUTES) {
    test(`${route} at 375x812 with reduced motion: nothing the motion touches is transformed or animated`, async ({ browser }, info) => {
      test.skip(info.project.name !== 'desktop-chromium' && info.project.name !== 'desktop-webkit', 'explicit sizes, once per engine');
      test.setTimeout(120_000);
      const size = { width: 375, height: 812 };
      const page = await open(browser, route, size, 'reduce');
      const moved = () =>
        page.evaluate(() => {
          const out: string[] = [];
          // Identity values count as still: the tilt keeps its column scale, `scale: var(--k)`, at 1.
          const identity = new Set(['none', '1', '1 1', '0px', '0px 0px', '0deg', 'matrix(1, 0, 0, 1, 0, 0)']);
          const parts = '[data-depth-stack], [data-depth-tilt], [data-depth-rig], [data-depth-sheet], [data-depth-drift], [data-depth-hinge], [data-depth-trace], [data-depth-trace] > *, [data-experience-rule]';
          for (const el of document.querySelectorAll(parts)) {
            const name = `${el.tagName.toLowerCase()}${[...el.attributes].filter((a) => a.name.startsWith('data-depth') || a.name === 'data-experience-rule').map((a) => `[${a.name}="${a.value}"]`).join('')}`;
            for (const pseudo of [null, '::before'] as const) {
              const s = getComputedStyle(el, pseudo);
              for (const prop of ['transform', 'translate', 'rotate', 'scale'] as const) {
                if (!identity.has(s[prop])) out.push(`${name}${pseudo ?? ''} ${prop}: ${s[prop]}`);
              }
            }
            if (el.getAnimations().length > 0) out.push(`${name} has ${el.getAnimations().length} animation(s)`);
          }
          return out;
        });
      const step = Math.floor(size.height / 2);
      let last = -1;
      for (let y = 0; ; y += step) {
        await page.evaluate((to) => window.scrollTo(0, to), y);
        await frames(page);
        expect(await moved(), `${route} at scrollY ${y}`).toEqual([]);
        const now = await page.evaluate(() => Math.round(window.scrollY));
        if (now === last) break;
        last = now;
      }
      await page.context().close();
    });
  }
});
