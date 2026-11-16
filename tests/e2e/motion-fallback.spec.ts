import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test, waitForIslands } from './fixtures';

// The scroll fallback on a phone (src/lib/depth/scrub.ts and the mirrored rules in globals.css). A
// browser without scroll timelines (Safari before 26) skips every scroll-linked rule; there, Lean sets
// data-depth-fallback on the root and drives the same keyframes from the scroll position. These
// engines have scroll timelines, so the tests take them away the way such a browser lacks them:
// CSS.supports answers no for animation-timeline, and until the gate is set no scroll-linked animation
// exists (a style with `animation: none` on the scroll-linked parts, as their @supports rules are
// skipped there; the time-based ones are left alone). On the loaded page, a part whose subject is on
// screen when the fallback starts keeps its final pose until the subject has left the screen once, so
// nothing already painted jumps back. Then the Home band's sheets fan out, follow the scroll and end
// exactly still; under reduced motion nothing moves and the gate is never set; with the engine's own
// scroll timelines the gate is never set and the native motion still runs; the fallback's progress
// matches the native timelines' at the same scroll; and at 320 px with the text at 150% and 200% no
// pose of the motion scrolls the page sideways. Phones in Chromium, and WebKit at a phone's size
// (its one project is a desktop one, so these tests set the size themselves).

const PHONES = new Set(['mobile-chromium', 'phone-390-chromium', 'desktop-webkit']);
const WEBKIT_PHONE = { width: 390, height: 844 };

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
const stackBox = (page: Page) =>
  page.locator('[data-depth-stack]').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top + scrollY, bottom: r.bottom + scrollY, viewport: document.documentElement.clientHeight };
  });
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const scrollTo = async (page: Page, y: number) => {
  await page.evaluate((to) => window.scrollTo(0, to), y);
  await frames(page);
};

async function open(page: Page, reducedMotion: 'reduce' | 'no-preference'): Promise<void> {
  await page.emulateMedia({ reducedMotion });
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await waitForIslands(page);
  await scrollTo(page, 0);
}

/** From the top of the page until the stack's top is at the top of the screen, in steps of an eighth of the screen. */
async function* stackScroll(page: Page): AsyncGenerator<number> {
  const { top, viewport } = await stackBox(page);
  const step = Math.floor(viewport / 8);
  for (let y = 0; y < top; y += step) {
    await scrollTo(page, y);
    yield y;
  }
  await scrollTo(page, top);
  yield top;
}

const KINDS = {
  view: '[data-depth-drift="br"]',
  named: '[data-depth-sheet="1"]',
  scroll: '[data-depth-progress]',
  before: '[data-depth-trace="proof"] > [data-proof]:nth-child(3)',
} as const;
type Kind = keyof typeof KINDS;

/**
 * The progress of one part of each kind at each of `ys`, read down the page in steps the observer
 * keeps up with: its own view (a proof card's drift), a named timeline (sheet 1 on the stack's), the
 * page's scroll (the header's progress hairline) and a ::before (a proof cell's rule). Natively it is
 * the animation's own progress; under the fallback the --depth-t the script wrote (or the default 1).
 */
async function progressDownThePage(page: Page, ys: number[], fallback: boolean): Promise<Record<Kind, number>[]> {
  // Every subject leaves the screen once, so nothing is held at its final pose from the load.
  await scrollTo(page, await page.evaluate(() => document.documentElement.scrollHeight));
  await scrollTo(page, 0);
  const out: Record<Kind, number>[] = [];
  for (const y of ys) {
    await scrollTo(page, y);
    out.push(
      await page.evaluate(
        ([kinds, fb]) =>
          Object.fromEntries(
            Object.entries(kinds).map(([kind, selector]) => {
              const el = document.querySelector(selector)!;
              if (fb) return [kind, Number(getComputedStyle(el).getPropertyValue('--depth-t'))];
              const pseudo = kind === 'before' ? '::before' : null;
              const a = el.getAnimations({ subtree: pseudo !== null }).find((x) => x.effect instanceof KeyframeEffect && x.effect.target === el && (x.effect.pseudoElement ?? null) === pseudo);
              // Before its range a backwards fill holds progress 0; after it the animation is no
              // longer listed (or has no progress): the final state, 1.
              const p = a?.effect?.getComputedTiming().progress;
              return [kind, p === null || p === undefined ? 1 : p];
            }),
          ) as Record<Kind, number>,
        [KINDS, fallback] as const,
      ),
    );
  }
  return out;
}

test.describe('@matrix motion fallback without scroll timelines', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(!PHONES.has(info.project.name), 'phone projects only');
    if (info.project.name === 'desktop-webkit') await page.setViewportSize(WEBKIT_PHONE);
  });

  test('the band\'s sheets hold still on screen at load, then fan out, follow the scroll and end exactly still', async ({ page }) => {
    await page.addInitScript(NO_TIMELINES);
    await open(page, 'no-preference');
    expect(await page.evaluate(() => CSS.supports('animation-timeline: view()')), 'the stub').toBe(false);
    await expect.poll(() => gated(page), 'the gate is set once the page has hydrated').toBe(true);

    const box = await stackBox(page);
    if (box.top < box.viewport) {
      // On screen when the fallback started: the final pose, not a jump back part way through.
      expect(await transforms(page), 'sheets on screen at load').toEqual(['none', 'none', 'none']);
      await scrollTo(page, Math.floor(box.viewport / 8));
      expect(await transforms(page), 'still on screen: still the final pose').toEqual(['none', 'none', 'none']);
      // Once it has left the screen, it follows the scroll.
      await scrollTo(page, box.bottom + 10);
      await scrollTo(page, 0);
    }
    // Driven by the page's own clock, paused: the script's delay sets the frame. (Read here, where the
    // stack is part way through its range: a paused animation at its end is no longer listed.)
    const animations = await page.locator('[data-depth-sheet="1"]').evaluate((el) => el.getAnimations().map((a) => ({ name: (a as CSSAnimation).animationName, state: a.playState, document: a.timeline instanceof DocumentTimeline })));
    expect(animations).toEqual([{ name: 'depth-fan-1', state: 'paused', document: true }]);

    const seen: string[][] = [];
    for await (const y of stackScroll(page)) {
      seen.push([String(y), ...(await transforms(page))]);
      expect(await sideways(page), `no sideways scroll at scrollY ${y}`).toBe(0);
    }
    const first = seen[0]!;
    for (const [i, t] of first.slice(1).entries()) expect(t, `sheet ${i + 1} at the top of the page`).not.toBe('none');
    // It moves with the scroll: sheet 1 takes several different poses on the way.
    expect(new Set(seen.map((s) => s[1])).size, 'distinct poses of sheet 1').toBeGreaterThan(3);
    // Fully in view: the still column, no transform at all.
    await expect.poll(() => transforms(page)).toEqual(['none', 'none', 'none']);

    // Back up: the fan comes back, so it follows the scroll both ways.
    await scrollTo(page, 0);
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

  test('the fallback\'s progress is the native timelines\' progress at the same scroll', async ({ page }) => {
    // One page, read natively first, then reloaded without scroll timelines and read again at the same
    // positions (two pages at once would leave one in the background, where a browser may hold its
    // frames back).
    await open(page, 'no-preference');
    expect(await gated(page)).toBe(false);
    const end = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
    // Every twelfth of a screen while each part's subject passes through the screen (the jumps between
    // those windows also take the path of a jump of more than a quarter of the screen).
    const windows = await page.evaluate((kinds) => {
      const subjects = { view: null, named: '[data-depth-stack]', before: '[data-depth-trace]' } as Record<string, string | null>;
      return Object.entries(kinds)
        .filter(([kind]) => kind in subjects)
        .map(([kind, selector]) => {
          const el = document.querySelector(selector)!;
          const at = subjects[kind] ? el.closest(subjects[kind]!)! : el;
          const r = at.getBoundingClientRect();
          return [r.top + scrollY - document.documentElement.clientHeight, r.bottom + scrollY] as const;
        });
    }, KINDS);
    const step = Math.floor((page.viewportSize()?.height ?? 800) / 12);
    const ys = [...new Set(windows.flatMap(([from, to]) => {
      const list: number[] = [];
      for (let y = Math.max(0, Math.floor(from)); y <= Math.min(end, to); y += step) list.push(y);
      return list;
    }))].sort((a, b) => a - b);
    const native = await progressDownThePage(page, ys, false);
    await page.addInitScript(NO_TIMELINES);
    await open(page, 'no-preference');
    await expect.poll(() => gated(page)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight), 'the same page height').toBe(end);
    const scrubbed = await progressDownThePage(page, ys, true);
    for (const kind of Object.keys(KINDS) as Kind[]) {
      for (const [i, y] of ys.entries()) {
        // Steps of 1/200 and a fraction of a pixel of measuring: well under a hundredth.
        expect(Math.abs(native[i]![kind] - scrubbed[i]![kind]), `${kind} at scrollY ${y}: native ${native[i]![kind]}, fallback ${scrubbed[i]![kind]}`).toBeLessThan(0.01);
      }
      // Not vacuous: each part went through its range.
      expect(new Set(native.map((v) => Math.round(v[kind] * 100))).size, `${kind}: distinct progress values`).toBeGreaterThan(3);
    }
  });

  for (const path of ['native', 'fallback'] as const) {
    for (const scale of [1.5, 2]) {
      test(`${path}: at 320 px with the text at ${scale * 100}% no pose of the Home motion scrolls the page sideways`, async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        if (path === 'fallback') await page.addInitScript(NO_TIMELINES);
        await open(page, 'no-preference');
        await expect.poll(() => gated(page)).toBe(path === 'fallback');
        await page.evaluate(async (factor) => {
          document.documentElement.style.setProperty('font-size', `${factor * 100}%`, 'important');
          await document.fonts.ready;
        }, scale);
        await frames(page);
        // Down past the band, so it leaves the screen once, then back to the top through every pose.
        const { bottom, viewport } = await stackBox(page);
        const step = Math.floor(viewport / 8);
        const down: number[] = [];
        for (let y = 0; y <= bottom + viewport; y += step) down.push(y);
        let turned = 0;
        for (const y of [...down, ...[...down].reverse()]) {
          await scrollTo(page, y);
          expect(await sideways(page), `${path}, text at ${scale * 100}%, scrollY ${y}`).toBe(0);
          if ((await transforms(page))[0] !== 'none') turned++;
        }
        // Not vacuous: the sheets were turned on the way.
        expect(turned, 'steps with sheet 1 turned').toBeGreaterThan(2);
      });
    }
  }
});
