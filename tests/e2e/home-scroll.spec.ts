import { expect } from '@playwright/test';
import type { Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test';
import { test } from './fixtures';
import { markSlow } from './slow';

// The Home scroll moment's shell on the dev host (/kitchen-sink/home/scroll/<state>, the Home page's
// parts with a fictional state). The server sends both layouts; CSS picks one before the first paint,
// from the JavaScript flag, the reduced-motion setting and the screen size:
// - sticky, single column below 1024 px wide when the screen is at least 600 px tall: the chart's
//   canvas (40svh) and the step navigation stick at the top while the steps scroll under them;
// - sticky, two columns from 1024 px wide when the screen is at least 520 px tall;
// - stacked still frames otherwise, with reduced motion and without JavaScript, and whenever the
//   kit draws no chart.
// Measured here: the mode at each size, the 40svh canvas and the plot it allows (its height less 88 px
// for the axes), the fixed 280 px plot elsewhere, the layout from the container, one table per mode,
// the Figure's title, badge and caption outside the canvas, the step navigation inside the viewport,
// no redraw on a toolbar-only height change, and no layout shift or scroll jump when the page
// hydrates late on a slow CPU.

const scroll = (state: string) => `/kitchen-sink/home/scroll/${state}`;
/** Enough data in the A/B: a band, a Now row and a dot. */
const AB = scroll('ab');
/** Many looks, so the band has an area. */
const LOOKS = scroll('ab-many-looks');
/** Before data: the kit's collecting row in the canvas, no plot. */
const BEFORE = scroll('before-data');
/** The A/B with its live chart made to throw after hydration (dev host only). */
const CHART_ERROR = scroll('chart-error');
/** Counts that print as "<5": no kit chart at all. */
const TINY = scroll('ab-tiny');

const AXES = 88;
const DESKTOP_PLOT = 280;

type Mode = 'sticky-1' | 'sticky-2' | 'stacked';
type Size = { width: number; height: number };

async function open(
  browser: Browser,
  baseURL: string | undefined,
  url: string,
  size: Size,
  options: BrowserContextOptions = {},
  init?: (context: BrowserContext) => Promise<void>,
): Promise<Page> {
  const context = await browser.newContext({ baseURL, viewport: size, ...options });
  await init?.(context);
  const page = await context.newPage();
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  if (options.javaScriptEnabled !== false) {
    // Every chart measures its box once the page has hydrated.
    await expect(page.locator('[data-scroll-moment] [data-home-chart]').first()).toBeAttached();
    await expect(page.locator('[data-scroll-moment] [data-home-chart]:not([data-measured])')).toHaveCount(0, { timeout: 15_000 });
  }
  return page;
}

/** What CSS chose, read from the boxes. */
async function layoutOf(page: Page) {
  return page.evaluate(() => {
    const shown = (el: Element | null) => el !== null && el.getClientRects().length > 0;
    const stage = document.querySelector('[data-scroll-stage]');
    const steps = document.querySelector('[data-scroll-steps]')!;
    const frames = [...document.querySelectorAll('[data-stacked-frame]')];
    const stageBox = stage?.getBoundingClientRect();
    const stepsBox = steps.getBoundingClientRect();
    return {
      stage: shown(stage),
      sticky: stage ? getComputedStyle(stage).position === 'sticky' : false,
      twoColumns: shown(stage) && stageBox!.left >= stepsBox.right - 1,
      frames: frames.map(shown),
      stepNav: shown(document.querySelector('[data-scroll-moment] [data-step-nav]')),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
}

/**
 * The accessible chart tables in the moment: rendered (no display: none ancestor, apart from the
 * body of a folded table, which its summary opens), whether folded or open. The chart's tables carry
 * the Figure's id.
 */
async function chartTables(page: Page): Promise<number> {
  return page.evaluate(() => {
    // A folded table counts: its body is hidden only until the summary drawn before it opens it.
    const folded = (e: Element) => e.matches('[data-table-body]') && e.previousElementSibling?.matches('[data-table-toggle]') === true
      && getComputedStyle(e.previousElementSibling).display !== 'none';
    const rendered = (el: Element) => {
      for (let e: Element | null = el; e; e = e.parentElement) if (getComputedStyle(e).display === 'none' && !folded(e)) return false;
      return true;
    };
    return [...document.querySelectorAll('[data-scroll-moment] caption')]
      .filter((c) => c.id.startsWith('home-chart-'))
      .filter((c) => rendered(c.closest('table')!.parentElement!)).length;
  });
}

/** The live chart's rendered frames (the steps' own charts, such as the guardrail's, are not counted). */
async function drawnCharts(page: Page): Promise<number> {
  return page.locator('[data-scroll-moment] [data-home-chart] [data-chart-frame]:visible').count();
}

const MODES: readonly { size: Size; mode: Mode; note: string }[] = [
  { size: { width: 375, height: 667 }, mode: 'sticky-1', note: 'small phone' },
  { size: { width: 360, height: 800 }, mode: 'sticky-1', note: 'common Android' },
  { size: { width: 390, height: 844 }, mode: 'sticky-1', note: 'phone' },
  { size: { width: 768, height: 1024 }, mode: 'sticky-1', note: 'tablet' },
  { size: { width: 800, height: 600 }, mode: 'sticky-1', note: 'single column at exactly 600 px' },
  { size: { width: 320, height: 640 }, mode: 'sticky-1', note: 'narrowest phone' },
  { size: { width: 1024, height: 576 }, mode: 'sticky-2', note: 'screen share, 1280x720 at 125%' },
  { size: { width: 1024, height: 520 }, mode: 'sticky-2', note: 'two columns at exactly 520 px' },
  { size: { width: 1024, height: 768 }, mode: 'sticky-2', note: 'laptop' },
  { size: { width: 1440, height: 900 }, mode: 'sticky-2', note: 'desktop' },
  { size: { width: 375, height: 599 }, mode: 'stacked', note: 'short phone' },
  { size: { width: 800, height: 599 }, mode: 'stacked', note: 'short single column' },
  { size: { width: 1024, height: 519 }, mode: 'stacked', note: 'short two columns' },
  { size: { width: 320, height: 180 }, mode: 'stacked', note: '1280x720 at 400%' },
];

test.describe('home scroll moment shell', () => {
  test.beforeEach(({ browserName }, testInfo) => {
    // The spec sets its own viewports, so one Chromium and one WebKit project cover it.
    test.skip(testInfo.project.name !== 'desktop-chromium' && testInfo.project.name !== 'desktop-webkit', 'covered by the desktop projects');
    void browserName;
  });

  test('the server sends the sticky shell and the stacked frames, each once, with no repeated id', async ({ browser, baseURL }) => {
    const page = await open(browser, baseURL, AB, { width: 375, height: 667 }, { javaScriptEnabled: false });
    const counts = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
      return {
        stage: document.querySelectorAll('[data-scroll-stage]').length,
        canvas: document.querySelectorAll('[data-scroll-canvas] [data-home-chart]').length,
        frames: [...document.querySelectorAll('[data-stacked-frame]')].map((f) => f.id),
        repeated: ids.filter((id, i) => ids.indexOf(id) !== i),
      };
    });
    expect(counts).toEqual({ stage: 1, canvas: 1, frames: ['home-frame-3'], repeated: [] });
    await page.context().close();
  });

  for (const { size, mode, note } of MODES) {
    test(`${size.width}x${size.height} (${note}) is ${mode}, with one drawn chart and one table`, async ({ browser, baseURL }) => {
      const page = await open(browser, baseURL, AB, size);
      const l = await layoutOf(page);
      expect(l.scrollWidth, 'no horizontal scroll').toBeLessThanOrEqual(l.clientWidth);
      if (mode === 'stacked') {
        expect(l).toMatchObject({ stage: false, stepNav: false, frames: [true] });
      } else {
        expect(l).toMatchObject({ stage: true, sticky: true, stepNav: true, frames: [false], twoColumns: mode === 'sticky-2' });
      }
      expect(await drawnCharts(page), 'one chart is drawn').toBe(1);
      expect(await chartTables(page), 'one accessible chart table').toBe(1);
      await page.context().close();
    });
  }

  test('reduced motion and no JavaScript get the stacked frames at every size', async ({ browser, baseURL }) => {
    // Six pages, each waiting for its charts' code, which loads at idle time away from the moment
    // (2 s in WebKit, which has no idle callback): a longer time budget, the same assertions.
    markSlow('six pages, each waiting for chart code that loads at idle time (2 s in WebKit)');
    for (const size of [{ width: 375, height: 667 }, { width: 1024, height: 576 }, { width: 1440, height: 900 }]) {
      for (const options of [{ reducedMotion: 'reduce' as const }, { javaScriptEnabled: false }]) {
        const page = await open(browser, baseURL, AB, size, options);
        const label = `${size.width}x${size.height} ${JSON.stringify(options)}`;
        expect(await layoutOf(page), label).toMatchObject({ stage: false, stepNav: false, frames: [true] });
        expect(await drawnCharts(page), label).toBe(1);
        expect(await chartTables(page), label).toBe(1);
        await page.context().close();
      }
    }
  });

  test('without a kit chart the moment is stacked at every size', async ({ browser, baseURL }) => {
    for (const size of [{ width: 375, height: 667 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ baseURL, viewport: size });
      const page = await context.newPage();
      await page.goto(TINY);
      expect(await page.locator('[data-scroll-moment]').getAttribute('data-scroll-moment')).toBe('stacked');
      expect(await page.locator('[data-scroll-stage]').count()).toBe(0);
      expect(await page.locator('[data-scroll-moment] [data-step-nav]').count()).toBe(0);
      await context.close();
    }
  });

  for (const size of [
    { width: 375, height: 667 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ]) {
    test(`${size.width}x${size.height}: the canvas is 40svh and the plot is its height less ${AXES} px`, async ({ browser, baseURL }) => {
      const page = await open(browser, baseURL, AB, size);
      const g = await page.evaluate(() => {
        const canvas = document.querySelector('[data-scroll-canvas]')!;
        const chart = canvas.querySelector('[data-home-chart]')!;
        const box = canvas.querySelector('[data-chart]')!;
        const frame = canvas.querySelector('svg[data-chart-frame]')!;
        const marks = frame.querySelector('svg[data-mark-layer]')!;
        const sizer = canvas.querySelector<HTMLElement>('[data-home-chart-sizer]')!;
        return {
          box: box.getBoundingClientRect().height,
          sizer: sizer.clientHeight,
          frame: Number(frame.getAttribute('height')),
          plot: Number(marks.getAttribute('height')),
          layouts: [...canvas.querySelectorAll('svg[data-chart-frame]')].map((s) => s.getAttribute('data-layout')),
          width: chart.clientWidth,
          frameVisible: getComputedStyle(frame).visibility,
        };
      });
      const svh = size.height * 0.4;
      expect(Math.abs(g.box - svh), 'the frame box is 40svh').toBeLessThanOrEqual(1);
      expect(g.plot, 'plot = max(80, clientHeight - 88)').toBe(Math.max(80, g.sizer - AXES));
      expect(g.frame).toBe(g.plot + AXES);
      expect(g.layouts).toEqual([g.width < 640 ? 'narrow' : 'wide']);
      expect(g.frameVisible).toBe('visible');
      await page.context().close();
    });
  }

  for (const size of [{ width: 1024, height: 576 }, { width: 1440, height: 900 }]) {
    test(`${size.width}x${size.height}: the desktop plot is ${DESKTOP_PLOT} px and the layout follows the container`, async ({ browser, baseURL }) => {
      const page = await open(browser, baseURL, AB, size);
      const g = await page.evaluate(() => {
        const canvas = document.querySelector('[data-scroll-canvas]')!;
        return {
          plots: [...canvas.querySelectorAll('svg[data-mark-layer]')].map((s) => Number(s.getAttribute('height'))),
          layouts: [...canvas.querySelectorAll('svg[data-chart-frame]')].map((s) => s.getAttribute('data-layout')),
          width: canvas.querySelector('[data-home-chart]')!.clientWidth,
        };
      });
      expect(g.plots).toEqual([DESKTOP_PLOT]);
      expect(g.layouts).toEqual([g.width < 640 ? 'narrow' : 'wide']);
      await page.context().close();
    });
  }

  test('the stacked frame draws the 280 px plot in the layout its container allows', async ({ browser, baseURL }) => {
    for (const size of [{ width: 375, height: 667 }, { width: 1440, height: 900 }]) {
      const page = await open(browser, baseURL, AB, size, { reducedMotion: 'reduce' });
      const g = await page.evaluate(() => {
        const frame = document.querySelector('[data-stacked-frame]')!;
        return {
          plots: [...frame.querySelectorAll('svg[data-mark-layer]')].filter((s) => s.getClientRects().length > 0).map((s) => Number(s.getAttribute('height'))),
          layouts: [...frame.querySelectorAll('svg[data-chart-frame]')].map((s) => s.getAttribute('data-layout')),
          width: frame.querySelector('[data-home-chart]')!.clientWidth,
        };
      });
      expect(g.plots).toEqual([DESKTOP_PLOT]);
      expect(g.layouts).toEqual([g.width < 640 ? 'narrow' : 'wide']);
      await page.context().close();
    }
  });

  const NAV_SIZES = [
    { width: 375, height: 667 },
    { width: 320, height: 640 },
    { width: 800, height: 600 },
    { width: 1024, height: 576 },
    { width: 1024, height: 520 },
  ] as const;
  // Running, before data (the kit's collecting row), held (last interval) and final (Ship B): the Now
  // row's label and the collecting row differ in height.
  for (const state of ['ab', 'before-data', 'held', 'ship-b'] as const) for (const size of NAV_SIZES) {
    test(`${state} at ${size.width}x${size.height}: the step navigation sits under the canvas, inside the viewport, while the stage is stuck`, async ({ browser, baseURL }) => {
      const page = await open(browser, baseURL, scroll(state), size);
      // Scroll to the Evidence step: the stage is stuck there.
      await page.evaluate(() => document.getElementById('home-step-3')!.scrollIntoView({ block: 'center' }));
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const g = await page.evaluate(() => {
        const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        return { stage: r('[data-scroll-stage]'), canvas: r('[data-scroll-canvas]'), nav: r('[data-scroll-stage] [data-step-nav]'), vh: innerHeight };
      });
      expect(g.stage.top, 'the stage is stuck at the top').toBeGreaterThanOrEqual(-1);
      expect(g.stage.top).toBeLessThanOrEqual(1);
      expect(g.nav.top, 'below the canvas').toBeGreaterThanOrEqual(g.canvas.bottom - 1);
      expect(g.nav.bottom, 'inside the viewport').toBeLessThanOrEqual(g.vh);
      test.info().annotations.push({ type: 'room-for-steps', description: `${state} ${size.width}x${size.height}: ${Math.round(g.vh - g.stage.bottom)} px under the stage, step navigation ends ${Math.round(g.vh - g.nav.bottom)} px above the bottom` });
      if (size.width < 1024) expect(g.vh - g.stage.bottom, 'room for the step text under the stage').toBeGreaterThan(160);
      await page.context().close();
    });
  }

  test('the Figure title, badge and caption are outside the sticky canvas', async ({ browser, baseURL }) => {
    for (const size of [{ width: 375, height: 667 }, { width: 1024, height: 576 }]) {
      const page = await open(browser, baseURL, AB, size);
      const g = await page.evaluate(() => {
        const canvas = document.querySelector('[data-scroll-canvas]')!;
        const figure = document.getElementById('home-chart')!;
        const title = document.getElementById('home-chart-title')!;
        const caption = figure.querySelector(':scope > figcaption')!;
        return {
          inCanvas: [title, caption].map((el) => canvas.contains(el)),
          canvasText: canvas.textContent ?? '',
          titleShown: title.getClientRects().length > 0,
          captionShown: caption.getClientRects().length > 0,
          badge: caption.textContent?.includes('Simulated') ?? false,
        };
      });
      expect(g.inCanvas).toEqual([false, false]);
      expect(g.canvasText).not.toMatch(/Simulated|Live from this site|confidence sequence of/);
      expect(g).toMatchObject({ titleShown: true, captionShown: true, badge: true });
      await page.context().close();
    }
  });

  for (const size of [{ width: 375, height: 667 }, { width: 1024, height: 576 }]) {
    test(`${size.width}x${size.height}: a live chart that fails drops the moment to its stacked frames, with one table and nothing hidden`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ baseURL, viewport: size });
      const page = await context.newPage();
      await page.goto(CHART_ERROR);
      // The dev state breaks the chart after hydration, as a client failure would.
      await expect(page.locator('[data-stacked-frame] [data-home-chart] > [data-figure-fallback]')).toBeAttached({ timeout: 15_000 });
      await page.evaluate(() => document.getElementById('home-step-3')!.scrollIntoView({ block: 'center' }));
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const g = await page.evaluate(() => {
        const shown = (el: Element | null) => el !== null && el.getClientRects().length > 0;
        const stage = document.querySelector('[data-scroll-stage]')!.getBoundingClientRect();
        const headings = [...document.querySelectorAll('[data-scroll-step] > h3')];
        return {
          canvas: shown(document.querySelector('[data-scroll-canvas]')),
          frame: shown(document.querySelector('[data-stacked-frame]')),
          fallbackTable: shown(document.querySelector('[data-stacked-frame] [data-figure-fallback] table')),
          stepNav: shown(document.querySelector('[data-scroll-stage] [data-step-nav]')),
          stage: { height: stage.height, bottom: stage.bottom },
          headings: headings.map(shown),
          guardrailTables: [...document.querySelectorAll('[data-figure="home-guardrail"] > figcaption > [data-figure-tables]')].filter(shown).length,
          vh: innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });
      expect(g).toMatchObject({ canvas: false, frame: true, fallbackTable: true, stepNav: true, headings: [true, true, true, true, true] });
      expect(g.scrollWidth, 'the open fallback table scrolls inside its own box, never the page').toBeLessThanOrEqual(g.clientWidth);
      expect(g.stage.bottom, 'the stage, now the step navigation alone, stays inside the viewport').toBeLessThanOrEqual(g.vh);
      expect(g.stage.height, 'and covers little of it').toBeLessThan(g.vh / 4);
      expect(await chartTables(page), 'one accessible chart table: the fallback’s').toBe(1);
      expect(g.guardrailTables, 'the guardrail chart keeps its own table').toBe(1);
      await context.close();
    });
  }

  test("a Figure's fallback hides only its own tables, never another Figure's", async ({ browser, baseURL }) => {
    const page = await open(browser, baseURL, AB, { width: 375, height: 667 });
    // Stand a fallback into the guardrail chart, which sits inside the live chart's Figure.
    await page.evaluate(() => {
      const body = document.querySelector('[data-figure="home-guardrail"] > [data-figure-body]')!;
      const fallback = document.createElement('div');
      fallback.setAttribute('data-figure-fallback', 'static');
      body.prepend(fallback);
    });
    const shownTables = (figure: string) =>
      page.evaluate(
        (id) => [...document.querySelectorAll(`[data-figure="${id}"] > figcaption > [data-figure-tables]`)].filter((t) => t.getClientRects().length > 0).length,
        figure,
      );
    expect(await shownTables('home-guardrail'), 'its own tables hide').toBe(0);
    expect(await shownTables('home-chart'), "the live chart's table stays").toBe(1);
    expect(await layoutOf(page), 'the live chart did not fail, so the layout stays sticky').toMatchObject({ stage: true, frames: [false] });
    await page.context().close();
  });

  test('a toolbar-only height change, with a stable svh box, redraws nothing', async ({ browser, baseURL }) => {
    const page = await open(browser, baseURL, AB, { width: 375, height: 667 });
    // A phone toolbar collapsing changes the window height but not the small viewport unit: hold the
    // 40svh token at its current pixels, then grow the window as the toolbar would.
    await page.evaluate(() => {
      const sizer = document.querySelector<HTMLElement>('[data-scroll-canvas] [data-home-chart-sizer]')!;
      document.documentElement.style.setProperty('--chart-h-phone', getComputedStyle(sizer).height);
      const chart = document.querySelector('[data-scroll-canvas] [data-home-chart]')!;
      const w = window as unknown as { __mutations: number };
      w.__mutations = 0;
      new MutationObserver((records) => (w.__mutations += records.length)).observe(chart, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    const before = await page.locator('[data-scroll-canvas] svg[data-mark-layer]').getAttribute('height');
    await page.setViewportSize({ width: 375, height: 727 });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { __mutations: number }).__mutations)).toBe(0);
    expect(await page.locator('[data-scroll-canvas] svg[data-mark-layer]').getAttribute('height')).toBe(before);
    await page.context().close();
  });

  for (const size of [{ width: 375, height: 667 }, { width: 360, height: 800 }, { width: 1024, height: 576 }]) {
    test(`${size.width}x${size.height}: the zero label, the dot's ring and the whole band fit the canvas plot`, async ({ browser, baseURL }) => {
      const page = await open(browser, baseURL, LOOKS, size);
      const g = await page.evaluate(() => {
        const canvas = document.querySelector('[data-scroll-canvas]')!;
        const svg = canvas.querySelector<SVGSVGElement>('svg[data-chart-frame]')!;
        const box = svg.getBoundingClientRect();
        const marks = svg.querySelector('svg[data-mark-layer]')!.getBoundingClientRect();
        const band = svg.querySelector<SVGGraphicsElement>('[data-cs="band"]')!.getBoundingClientRect();
        const dot = svg.querySelector('[data-cs="current"]')!;
        const zero = svg.querySelector('[data-zero-label]')!;
        const texts = [...svg.querySelectorAll('text')].map((t) => {
          const r = t.getBoundingClientRect();
          return { text: t.textContent, top: r.top, bottom: r.bottom };
        });
        return {
          box: { top: box.top, bottom: box.bottom, right: box.right },
          marks: { top: marks.top, bottom: marks.bottom, right: marks.right },
          band: { top: band.top, bottom: band.bottom, height: band.height },
          ring: { stroke: dot.getAttribute('stroke'), width: dot.getAttribute('stroke-width') },
          zero: { words: [...zero.querySelectorAll('tspan')].map((t) => t.textContent), left: zero.getBoundingClientRect().left },
          texts,
        };
      });
      expect(g.ring).toEqual({ stroke: 'var(--color-bg)', width: '4' });
      expect(g.zero.left, 'the zero label sits in the right margin, off the plot').toBeGreaterThanOrEqual(g.marks.right);
      expect(g.zero.words.join('').trim()).toBe('no difference');
      expect(g.band.height, 'the band has an area').toBeGreaterThan(1);
      expect(g.band.top, 'the whole band is in the plot').toBeGreaterThanOrEqual(g.marks.top - 1);
      expect(g.band.bottom).toBeLessThanOrEqual(g.marks.bottom + 1);
      for (const t of g.texts) {
        expect(t.top, `"${t.text}" inside the chart`).toBeGreaterThanOrEqual(g.box.top - 1);
        expect(t.bottom, `"${t.text}" inside the chart`).toBeLessThanOrEqual(g.box.bottom + 1);
      }
      await page.context().close();
    });
  }
});

test.describe('home scroll moment hydration', () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(browserName !== 'chromium' || testInfo.project.name !== 'desktop-chromium', 'CPU throttling needs the Chromium DevTools protocol');
  });

  for (const url of [AB, BEFORE]) {
    for (const size of [{ width: 375, height: 667 }, { width: 1024, height: 576 }]) {
      test(`${url} at ${size.width}x${size.height}, 4x CPU, late hydration: layout shift <= 0.02, scroll jump <= 8 px`, async ({ browser, baseURL }) => {
        const context = await browser.newContext({ baseURL, viewport: size });
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await page.addInitScript(() => {
          const w = window as unknown as { __shifts: { value: number; at: number }[] };
          w.__shifts = [];
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean; startTime: number }[]) {
              if (!e.hadRecentInput) w.__shifts.push({ value: e.value, at: e.startTime });
            }
          }).observe({ type: 'layout-shift', buffered: true });
        });
        // Hold the page's scripts back (not its styles), so the visitor is already in the moment when
        // it hydrates.
        let release!: () => void;
        const held = new Promise<void>((r) => (release = r));
        await page.route(/\/_next\/static\/chunks\/.*\.js(\?.*)?$/, async (route) => {
          await held;
          await route.continue();
        });
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        await page.evaluate(() => {
          const moment = document.querySelector('[data-scroll-moment]')!;
          window.scrollTo(0, moment.getBoundingClientRect().top + scrollY + 200);
        });
        await page.waitForTimeout(300);
        const before = await page.evaluate(() => ({
          y: scrollY,
          at: performance.now(),
          hydrated: document.querySelector('[data-home-chart][data-measured]') !== null,
        }));
        expect(before.hydrated, 'the visitor is in the moment before hydration').toBe(false);
        release();
        await expect(page.locator('[data-scroll-canvas] [data-home-chart][data-measured]')).toBeAttached({ timeout: 30_000 });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await page.waitForTimeout(500);
        const after = await page.evaluate((t0) => {
          const w = window as unknown as { __shifts: { value: number; at: number }[] };
          return { y: scrollY, cls: w.__shifts.filter((s) => s.at >= t0).reduce((sum, s) => sum + s.value, 0) };
        }, before.at);
        test.info().annotations.push({ type: 'hydration-shift', description: `${url} ${size.width}x${size.height}: CLS ${after.cls.toFixed(4)}, jump ${Math.abs(after.y - before.y)} px` });
        expect(after.cls).toBeLessThanOrEqual(0.02);
        expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(8);
        await context.close();
      });
    }
  }
});

// ---------------------------------------------------------------------------------------------
// The interaction: which step is current, the step navigation, focus under the sticky stage, the
// cross-fade between canvas layers, the counted-view tick and the chart's deferred code.

/** The A/B with the visitor tick allowed by the server (as the Home page sets it on a fresh page). */
const TICK = scroll('ab-tick');
/** Two different chart entries, so the canvas has two layers to cross-fade between (dev host only). */
const TWO = scroll('ab-two-charts');
/** The group the scroll-moment pages are seen from. */
const ARM = 'b';
const OTHER_ARM = 'a';

/**
 * Counts every scrollIntoView: the step navigation's scroll is the only one the moment makes. It stands
 * in for a spy on StepNav's onChange: in the sticky layout every onChange goes to the controller's
 * fromNav, which always scrolls, so an outside change that called onChange would show here (and its
 * announcement in the live-region record).
 */
async function spyNavScrolls(context: BrowserContext) {
  await context.addInitScript(() => {
    const w = window as unknown as { __navScrolls: number };
    w.__navScrolls = 0;
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element, ...args: Parameters<Element['scrollIntoView']>) {
      w.__navScrolls += 1;
      return original.apply(this, args);
    };
  });
}

/** Records what the live region announces and every move of aria-current, from now on. */
async function record(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __announced: string[]; __currents: string[] };
    w.__announced = [];
    w.__currents = [];
    const live = document.querySelector('[data-scroll-stage] [data-step-live]')!;
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) w.__announced.push(n.textContent ?? '');
    }).observe(live, { childList: true, subtree: true });
    const steps = document.querySelector('[data-scroll-steps]')!;
    new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target as Element;
        if (el.getAttribute('aria-current') === 'step') w.__currents.push(el.getAttribute('data-scroll-step')!);
      }
    }).observe(steps, { attributes: true, attributeFilter: ['aria-current'], subtree: true });
  });
}

const recorded = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __announced: string[]; __currents: string[]; __navScrolls: number };
    return { announced: w.__announced, currents: w.__currents, navScrolls: w.__navScrolls };
  });

async function currentStep(page: Page): Promise<string[]> {
  return page.locator('[data-scroll-steps] > [aria-current="step"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-scroll-step')!));
}

/** Waits until the page has stopped scrolling (two frames with the same position, several times). */
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let last = -1;
        let still = 0;
        const tick = () => {
          still = scrollY === last ? still + 1 : 0;
          last = scrollY;
          if (still >= 8) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

/**
 * Scrolls (instantly, never with scrollIntoView) so that step `k` covers the trigger band: its top a
 * little above the band, in the part of the screen the stage leaves visible.
 */
async function bringIntoBand(page: Page, k: number) {
  await page.evaluate((step) => {
    const stage = document.querySelector<HTMLElement>('[data-scroll-stage]')!;
    const s = stage.getBoundingClientRect();
    const beside = s.left >= document.querySelector('[data-scroll-steps]')!.getBoundingClientRect().right - 1;
    const vh = document.documentElement.clientHeight;
    const stuckBottom = (Number.parseFloat(getComputedStyle(stage).top) || 0) + stage.offsetHeight;
    const target = beside ? vh * 0.3 : stuckBottom + 0.2 * (vh - stuckBottom);
    const el = document.getElementById(`home-step-${step}`)!;
    window.scrollTo({ top: scrollY + el.getBoundingClientRect().top - target, behavior: 'instant' });
  }, k);
  await settle(page);
}

const stepNav = (page: Page) => page.locator('[data-scroll-stage] [data-step-nav]');
const nextButton = (page: Page) => stepNav(page).getByRole('button', { name: 'Next' });
const previousButton = (page: Page) => stepNav(page).getByRole('button', { name: 'Previous' });

/** True once React has hydrated the shell (it keeps its fiber on the node). */
async function waitHydrated(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-scroll-shell]');
    return el !== null && Object.keys(el).some((k) => k.startsWith('__reactFiber'));
  });
}

/** The script chunks the HTML of `url` names (its first load), by path. */
async function firstLoadChunks(page: Page, url: string): Promise<Set<string>> {
  const html = await (await page.request.get(url)).text();
  return new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"'\s\\)]+?\.js/g)].map((m) => m[0]));
}

const chunkPath = (url: string) => new URL(url).pathname;

function dispatchCounted(page: Page, detail: unknown) {
  return page.evaluate((d) => window.dispatchEvent(new CustomEvent('experiment:counted', { detail: d })), detail);
}

test.describe('home scroll moment interaction', () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium' && testInfo.project.name !== 'desktop-webkit', 'covered by the desktop projects');
    void browserName;
  });

  for (const size of [{ width: 375, height: 667 }, { width: 1024, height: 768 }]) {
    test(`${size.width}x${size.height}: scrolling moves exactly one current step, and never scrolls or announces`, async ({ browser, baseURL }) => {
      const page = await open(browser, baseURL, AB, size, {}, spyNavScrolls);
      await record(page);
      expect(await currentStep(page)).toEqual(['1']);
      for (const k of [2, 3, 4, 5, 4, 2, 1]) {
        await bringIntoBand(page, k);
        await expect.poll(() => currentStep(page), `step ${k} in the band`).toEqual([String(k)]);
        await expect(stepNav(page).locator('[data-step-count]')).toHaveText(`${k} of 5`);
      }
      const r = await recorded(page);
      expect(r.navScrolls, 'an outside change never calls the navigation, so nothing scrolls').toBe(0);
      expect(r.announced, 'nor is it announced').toEqual([]);
      await expect(stepNav(page).locator('[data-step-live]')).toHaveText('');
      await page.context().close();
    });
  }

  test('after Back, the restored page sets its step from the observer alone: no navigation scroll, no announcement', async ({ browser, baseURL }) => {
    const page = await open(browser, baseURL, AB, { width: 1024, height: 768 }, {}, spyNavScrolls);
    await bringIntoBand(page, 3);
    await expect.poll(() => currentStep(page)).toEqual(['3']);
    await page.goto('/kitchen-sink/home');
    await page.goBack();
    await waitHydrated(page);
    await settle(page);
    await page.waitForTimeout(500);
    expect(await currentStep(page), 'one current step').toHaveLength(1);
    await record(page);
    await bringIntoBand(page, 4);
    await expect.poll(() => currentStep(page)).toEqual(['4']);
    const r = await recorded(page);
    expect(r.navScrolls, 'the outside changes never called the navigation').toBe(0);
    expect(r.announced).toEqual([]);
    await expect(stepNav(page).locator('[data-step-live]')).toHaveText('');
    await page.context().close();
  });

  test('375x667: the trigger band lies below the stage, so the current step is one the reader can see', async ({ browser, baseURL }) => {
    const page = await open(browser, baseURL, AB, { width: 375, height: 667 });
    // Step 2 starts just under the stuck stage; step 1 ends behind it, where a band 45% to 50% down
    // the whole screen would still find it.
    await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('[data-scroll-stage]')!;
      const el = document.getElementById('home-step-2')!;
      window.scrollTo({ top: scrollY + el.getBoundingClientRect().top - (stage.offsetHeight + 12), behavior: 'instant' });
    });
    await settle(page);
    const g = await page.evaluate(() => ({
      stage: document.querySelector('[data-scroll-stage]')!.getBoundingClientRect().bottom,
      oneBottom: document.getElementById('home-step-1')!.getBoundingClientRect().bottom,
      vh: document.documentElement.clientHeight,
    }));
    expect(g.oneBottom, 'step 1 now ends behind the stage').toBeLessThan(g.stage);
    expect(g.oneBottom, 'inside the band a whole-screen observer would use').toBeGreaterThan(g.vh * 0.5);
    await expect.poll(() => currentStep(page)).toEqual(['2']);
    await page.context().close();
  });

  // The sticky sizes of the page's viewport matrix (1280x720 at 125% is 1024x576 CSS px).
  for (const size of [
    { width: 375, height: 667 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 576 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    test(`${size.width}x${size.height}: the step navigation sets the step at once, scrolls it into view and keeps focus`, async ({ browser, baseURL }) => {
      const page = await open(browser, baseURL, AB, size, {}, spyNavScrolls);
      await bringIntoBand(page, 1);
      await record(page);
      await nextButton(page).focus();
      await page.keyboard.press('Enter');
      expect(await currentStep(page), 'synchronous: before the scroll has run').toEqual(['2']);
      await settle(page);
      await page.keyboard.press('Space');
      await settle(page);
      await page.keyboard.press('ArrowRight');
      await settle(page);
      await page.keyboard.press('ArrowLeft');
      await settle(page);
      await page.waitForTimeout(1100);
      expect(await currentStep(page)).toEqual(['3']);
      const r = await recorded(page);
      expect(r.currents, 'the observer never pulls the step back while the navigation scrolls').toEqual(['2', '3', '4', '3']);
      expect(r.announced).toEqual(['2 of 5', '3 of 5', '4 of 5', '3 of 5']);
      expect(r.navScrolls).toBe(4);
      await expect(nextButton(page)).toBeFocused();
      const g = await page.evaluate(() => {
        const stage = document.querySelector('[data-scroll-stage]')!.getBoundingClientRect();
        const step = document.getElementById('home-step-3')!.getBoundingClientRect();
        const steps = document.querySelector('[data-scroll-steps]')!.getBoundingClientRect();
        return { stageBottom: stage.bottom, beside: stage.left >= steps.right - 1, top: step.top, vh: document.documentElement.clientHeight };
      });
      if (!g.beside) expect(g.top, 'the step lands under the stage, not behind it').toBeGreaterThanOrEqual(g.stageBottom - 1);
      // And it starts above the trigger band, so the observer agrees with the navigation.
      const bandTop = g.beside ? g.vh * 0.45 : g.stageBottom + 0.45 * (g.vh - g.stageBottom);
      expect(g.top).toBeLessThan(bandTop);
      await page.context().close();
    });
  }

  test('two quick presses: the observer does not pull the step back to the one the scroll passes', async ({ browser, baseURL }) => {
    const page = await open(browser, baseURL, AB, { width: 1024, height: 768 });
    await bringIntoBand(page, 4);
    await expect.poll(() => currentStep(page)).toEqual(['4']);
    await record(page);
    await previousButton(page).focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await settle(page);
    await page.waitForTimeout(1100);
    expect(await currentStep(page)).toEqual(['2']);
    expect((await recorded(page)).currents).toEqual(['3', '2']);
    await page.context().close();
  });

  test('at the last step, Next does nothing: no scroll, no new announcement, focus stays', async ({ browser, baseURL }) => {
    const page = await open(browser, baseURL, AB, { width: 1024, height: 768 }, {}, spyNavScrolls);
    await bringIntoBand(page, 5);
    await expect.poll(() => currentStep(page)).toEqual(['5']);
    await record(page);
    await nextButton(page).focus();
    await expect(nextButton(page)).toHaveAttribute('aria-disabled', 'true');
    for (const key of ['Enter', 'Space', 'ArrowRight']) await page.keyboard.press(key);
    await page.waitForTimeout(300);
    expect(await currentStep(page)).toEqual(['5']);
    expect(await recorded(page)).toEqual({ announced: [], currents: [], navScrolls: 0 });
    await expect(stepNav(page).locator('[data-step-live]')).toHaveText('');
    await expect(nextButton(page)).toBeFocused();
    await page.context().close();
  });

  test('a held arrow key or Enter moves one step and announces it once', async ({ browser, baseURL }) => {
    const page = await open(browser, baseURL, AB, { width: 1024, height: 768 });
    await bringIntoBand(page, 1);
    await record(page);
    await nextButton(page).focus();
    // A second keyboard.down of a key that is already down is a repeat (KeyboardEvent.repeat).
    for (let i = 0; i < 5; i += 1) await page.keyboard.down('ArrowRight');
    await page.keyboard.up('ArrowRight');
    await settle(page);
    await page.waitForTimeout(1100);
    expect(await currentStep(page)).toEqual(['2']);
    for (let i = 0; i < 5; i += 1) await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    await settle(page);
    await page.waitForTimeout(1100);
    expect(await currentStep(page)).toEqual(['3']);
    const r = await recorded(page);
    expect(r.announced).toEqual(['2 of 5', '3 of 5']);
    expect(r.currents).toEqual(['2', '3']);
    await page.context().close();
  });

  // 768x1024: the stage sits under the sticky header, so the scroll margin adds to the header's padding.
  for (const size of [{ width: 375, height: 667 }, { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    test(`${size.width}x${size.height}: Shift+Tab never leaves focus behind the sticky stage`, async ({ browser, baseURL, browserName }) => {
      const page = await open(browser, baseURL, AB, size);
      const back = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Shift+Tab' : 'Shift+Tab';
      // Start after the steps, in the chart Figure's caption, and walk back through every step.
      await page.locator('#home-chart > figcaption').locator('summary, a[href], button, [tabindex]').filter({ visible: true }).first().focus();
      const seen: { tag: string; top: number; bottom: number; stageBottom: number; stuck: boolean; vh: number }[] = [];
      for (let i = 0; i < 60; i += 1) {
        await page.keyboard.press(back);
        await settle(page);
        const g = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (el === null || !el.closest('[data-scroll-steps]')) return null;
          const box = document.querySelector('[data-scroll-stage]')!;
          const stage = box.getBoundingClientRect();
          // Stuck at its sticky offset: 0, or the header's height where the header sticks too.
          const offset = Number.parseFloat(getComputedStyle(box).top) || 0;
          const r = el.getBoundingClientRect();
          return { tag: el.tagName.toLowerCase(), top: r.top, bottom: r.bottom, stageBottom: stage.bottom, stuck: stage.top <= offset + 1, vh: document.documentElement.clientHeight };
        });
        if (g === null) {
          if (seen.length > 0) break;
          continue;
        }
        seen.push(g);
      }
      expect(seen.some((s) => s.tag === 'a'), 'focus reached a link in the steps').toBe(true);
      for (const s of seen) {
        if (s.stuck) expect(s.top, `${s.tag} is below the stuck stage`).toBeGreaterThanOrEqual(s.stageBottom - 1);
        expect(s.bottom, `${s.tag} is inside the screen`).toBeLessThanOrEqual(s.vh + 1);
      }
      await page.context().close();
    });
  }

  test('the canvas cross-fades between chart layers in opacity, and reduced motion snaps a fade midway', async ({ browser, baseURL }) => {
    const page = await open(browser, baseURL, TWO, { width: 1024, height: 768 });
    const layers = page.locator('[data-scroll-canvas] [data-canvas-layer]');
    await expect(layers).toHaveCount(2);
    await bringIntoBand(page, 4);
    await expect.poll(() => currentStep(page)).toEqual(['4']);
    // Press Next and read the fade in the same task, then slow it right down, so it is surely still
    // running when reduced motion is switched on.
    const mid = await nextButton(page).evaluate(
      (button) =>
        new Promise<{ active: boolean; fades: unknown[] }[]>((resolve) => {
          (button as HTMLButtonElement).click();
          requestAnimationFrame(() => {
            const els = [...document.querySelectorAll('[data-scroll-canvas] [data-canvas-layer]')];
            resolve(
              els.map((el) => {
                const fades = el.getAnimations().filter((a) => (a as CSSTransition).transitionProperty === 'opacity');
                for (const a of el.getAnimations()) a.playbackRate = 0.01;
                return { active: el.hasAttribute('data-active'), fades: fades.map((a) => a.effect?.getTiming().duration) };
              }),
            );
          });
        }),
    );
    expect(mid.map((l) => l.active)).toEqual([false, true]);
    for (const l of mid) expect(l.fades, 'an opacity transition of the step duration').toEqual([320]);
    expect(await layers.evaluateAll((els) => els.map((el) => el.getAnimations().length > 0)), 'still fading').toEqual([true, true]);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // The setting's change event reaches the page a moment later in some engines.
    await expect
      .poll(() => layers.evaluateAll((els) => els.map((el) => ({ running: el.getAnimations().length, opacity: getComputedStyle(el).opacity }))), { timeout: 3000 })
      .toEqual([{ running: 0, opacity: '0' }, { running: 0, opacity: '1' }]);
    expect(await layoutOf(page), 'reduced motion stacks the frames').toMatchObject({ stage: false });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForTimeout(400);
    const after = await layers.evaluateAll((els) => els.map((el) => ({ opacity: getComputedStyle(el).opacity, visibility: getComputedStyle(el).visibility, hidden: el.getAttribute('aria-hidden') })));
    expect(after).toEqual([
      { opacity: '0', visibility: 'hidden', hidden: 'true' },
      { opacity: '1', visibility: 'visible', hidden: null },
    ]);
    expect(await layers.evaluateAll((els) => els.map((el) => el.getAnimations().length)), 'nothing resumes').toEqual([0, 0]);
    expect(await drawnCharts(page)).toBe(1);
    expect(await chartTables(page)).toBe(1);
    await page.context().close();
  });

  test('your view: a counted view of this group, retained until the deferred chart mounts, drawn at the axis end', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 1024, height: 768 } });
    const page = await context.newPage();
    const first = await firstLoadChunks(page, TICK);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(/\/_next\/static\/chunks\/.*\.js(\?.*)?$/, async (route) => {
      if (!first.has(chunkPath(route.request().url()))) await held;
      await route.continue();
    });
    await page.goto(TICK);
    await waitHydrated(page);
    expect(await page.locator('[data-scroll-canvas] [data-home-chart][data-measured]').count(), 'the chart has not mounted yet').toBe(0);
    await dispatchCounted(page, { arm: ARM, viewN: 1e9 });
    release();
    await page.locator('[data-scroll-moment]').hover();
    await expect(page.locator('[data-scroll-canvas] [data-home-chart][data-measured]')).toBeAttached({ timeout: 15_000 });
    const tick = page.locator('[data-scroll-canvas] [data-your-view]');
    await expect(tick).toHaveCount(1);
    expect(await tick.locator('line').getAttribute('x1'), 'min(views, end of the axis): the end').toBe('100%');
    await expect(tick.locator('text')).toHaveText('your view');
    expect(await tick.locator('line').getAttribute('stroke')).toBe('var(--color-muted)');
    await context.close();
  });

  test('your view fades in once, and never again when the chart redraws', async ({ browser, baseURL }) => {
    const page = await open(browser, baseURL, TICK, { width: 1024, height: 768 });
    // Send the count and read the tick's animations the moment it is drawn.
    const fade = await page.evaluate(
      (arm) =>
        new Promise<{ name: string; duration: unknown }[]>((resolve) => {
          const canvas = document.querySelector('[data-scroll-canvas]')!;
          const read = () => {
            const tick = canvas.querySelector('[data-your-view]');
            if (tick === null) return false;
            resolve(tick.getAnimations().map((a) => ({ name: (a as CSSAnimation).animationName, duration: a.effect?.getTiming().duration })));
            return true;
          };
          const watch = new MutationObserver(() => {
            if (read()) watch.disconnect();
          });
          watch.observe(canvas, { childList: true, subtree: true });
          window.dispatchEvent(new CustomEvent('experiment:counted', { detail: { arm, viewN: 1e9 } }));
        }),
      ARM,
    );
    const tick = page.locator('[data-scroll-canvas] [data-your-view]');
    await expect(tick).toHaveCount(1);
    expect(fade).toEqual([{ name: 'scroll-moment-your-view', duration: 320 }]);
    await page.waitForTimeout(700);
    expect(await tick.evaluate((el) => el.getAnimations().length)).toBe(0);
    // A layout change redraws the chart (narrow layout, one column): the tick is drawn again, still.
    await page.setViewportSize({ width: 600, height: 800 });
    await expect(page.locator('[data-scroll-canvas] svg[data-chart-frame][data-layout="narrow"]')).toHaveCount(1);
    const again = page.locator('[data-scroll-canvas] [data-your-view]');
    await expect(again).toHaveCount(1);
    expect(await again.evaluate((el) => ({ running: el.getAnimations().length, opacity: getComputedStyle(el).opacity }))).toEqual({ running: 0, opacity: '1' });
    await page.context().close();
  });

  test("your view: another group's count is ignored, a count before the last look draws no tick, and only the first is used", async ({ browser, baseURL }) => {
    const page = await open(browser, baseURL, TICK, { width: 1024, height: 768 });
    // Taken, this one would draw a tick at the axis end.
    await dispatchCounted(page, { arm: OTHER_ARM, viewN: 1e9 });
    await dispatchCounted(page, { arm: ARM, viewN: Number.NaN });
    await dispatchCounted(page, { arm: ARM, viewN: 1 });
    await dispatchCounted(page, { arm: ARM, viewN: 1e9 });
    await page.waitForTimeout(500);
    await expect(page.locator('[data-scroll-moment] [data-your-view]')).toHaveCount(0);
    await page.context().close();
  });

  test('your view: none when the server did not allow it, after a counted view of this group', async ({ browser, baseURL }) => {
    const page = await open(browser, baseURL, AB, { width: 1024, height: 768 });
    await dispatchCounted(page, { arm: ARM, viewN: 1e9 });
    await page.waitForTimeout(500);
    await expect(page.locator('[data-scroll-moment] [data-your-view]')).toHaveCount(0);
    await page.context().close();
  });

  test('your view under reduced motion: drawn in the stacked frame at once, without a fade', async ({ browser, baseURL }) => {
    const page = await open(browser, baseURL, TICK, { width: 1024, height: 768 }, { reducedMotion: 'reduce' });
    await dispatchCounted(page, { arm: ARM, viewN: 1e9 });
    const tick = page.locator('[data-stacked-frame] [data-your-view]');
    await expect(tick).toHaveCount(1);
    expect(await tick.evaluate((el) => ({ running: el.getAnimations().length, opacity: getComputedStyle(el).opacity }))).toEqual({ running: 0, opacity: '1' });
    await page.context().close();
  });

  test('the chart code is not in the first load: it arrives in a later chunk', async ({ browser, baseURL }) => {
    const page = await open(browser, baseURL, AB, { width: 1024, height: 768 });
    const first = await firstLoadChunks(page, AB);
    expect(first.size).toBeGreaterThan(0);
    const markers = ['data-your-view', 'data-home-chart-sizer'];
    for (const path of first) {
      const body = await (await page.request.get(path)).text();
      for (const m of markers) expect(body.includes(m), `${path} holds ${m}`).toBe(false);
    }
    const later = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname).filter((p) => p.startsWith('/_next/static/chunks/') && p.endsWith('.js')));
    const bodies = await Promise.all(later.filter((p) => !first.has(p)).map(async (p) => (await page.request.get(p)).text()));
    for (const m of markers) expect(bodies.some((b) => b.includes(m)), `a chunk loaded later holds ${m}`).toBe(true);
    await page.context().close();
  });

  for (const size of [{ width: 375, height: 667 }, { width: 1024, height: 576 }]) {
    test(`${size.width}x${size.height}: if the chart's code cannot load, the moment drops to its stacked frames`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ baseURL, viewport: size });
      const page = await context.newPage();
      const first = await firstLoadChunks(page, AB);
      await page.route(/\/_next\/static\/chunks\/.*\.js(\?.*)?$/, (route) => (first.has(chunkPath(route.request().url())) ? route.continue() : route.abort()));
      await page.goto(AB);
      await page.locator('[data-scroll-moment]').hover();
      await expect(page.locator('[data-scroll-canvas] [data-island="failed"]')).toBeAttached({ timeout: 15_000 });
      const l = await layoutOf(page);
      expect(l.scrollWidth).toBeLessThanOrEqual(l.clientWidth);
      expect(l.frames, 'the stacked frame shows the server chart').toEqual([true]);
      expect(await page.locator('[data-scroll-canvas]').isVisible()).toBe(false);
      expect(await drawnCharts(page)).toBe(1);
      expect(await chartTables(page)).toBe(1);
      await context.close();
    });
  }

  test("375x667: a chart whose code never arrives drops the moment to its stacked frames after the wait", async ({ browser, baseURL }) => {
    markSlow('waits out the 5 s late-chart timer on top of the page load');
    const context = await browser.newContext({ baseURL, viewport: { width: 375, height: 667 } });
    const page = await context.newPage();
    const first = await firstLoadChunks(page, AB);
    const never = new Promise<void>(() => {});
    // Every later chunk (the chart's code) hangs: no error, no response.
    await page.route(/\/_next\/static\/chunks\/.*\.js(\?.*)?$/, async (route) => {
      if (!first.has(chunkPath(route.request().url()))) await never;
      await route.continue();
    });
    await page.goto(AB);
    await waitHydrated(page);
    expect(await page.locator('[data-scroll-shell][data-chart-late]').count(), 'not before the wait').toBe(0);
    await expect(page.locator('[data-scroll-shell][data-chart-late]')).toBeAttached({ timeout: 15_000 });
    const l = await layoutOf(page);
    expect(l.scrollWidth).toBeLessThanOrEqual(l.clientWidth);
    expect(l.frames, 'the stacked frame shows the server chart').toEqual([true]);
    expect(l.stepNav, 'the step navigation stays').toBe(true);
    expect(await page.locator('[data-scroll-canvas]').isVisible()).toBe(false);
    expect(await drawnCharts(page)).toBe(1);
    expect(await chartTables(page)).toBe(1);
    await context.close();
  });

  test('375x667: the drop after the wait is final, even when the chart code arrives later', async ({ browser, baseURL }) => {
    markSlow('waits out the 5 s late-chart timer, then for the held chart code to arrive');
    const context = await browser.newContext({ baseURL, viewport: { width: 375, height: 667 } });
    const page = await context.newPage();
    const first = await firstLoadChunks(page, AB);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(/\/_next\/static\/chunks\/.*\.js(\?.*)?$/, async (route) => {
      if (!first.has(chunkPath(route.request().url()))) await held;
      await route.continue();
    });
    await page.goto(AB);
    await expect(page.locator('[data-scroll-shell][data-chart-late]')).toBeAttached({ timeout: 15_000 });
    release();
    await expect(page.locator('[data-stacked-frame] [data-home-chart][data-measured]')).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('[data-scroll-shell][data-chart-late]')).toBeAttached();
    expect(await page.locator('[data-scroll-canvas]').isVisible()).toBe(false);
    expect(await drawnCharts(page)).toBe(1);
    await context.close();
  });

  test('375x667: a chart that loads in time keeps the sticky stage, with no late mark', async ({ browser, baseURL }) => {
    const page = await open(browser, baseURL, AB, { width: 375, height: 667 });
    await page.waitForTimeout(5500);
    expect(await page.locator('[data-scroll-shell][data-chart-late]').count()).toBe(0);
    expect(await layoutOf(page)).toMatchObject({ stage: true, frames: [false] });
    expect(await page.locator('[data-scroll-canvas]').isVisible()).toBe(true);
    await page.context().close();
  });

  test('without a kit chart nothing follows the scroll, and no step is marked current', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 375, height: 667 } });
    await spyNavScrolls(context);
    const page = await context.newPage();
    await page.goto(TINY);
    await waitHydrated(page);
    for (const k of [2, 4, 5]) {
      await page.evaluate((step) => document.getElementById(`home-step-${step}`)!.getBoundingClientRect(), k);
      await page.evaluate((step) => window.scrollTo({ top: scrollY + document.getElementById(`home-step-${step}`)!.getBoundingClientRect().top - 200, behavior: 'instant' }), k);
      await settle(page);
    }
    await page.waitForTimeout(300);
    // Stacked only: no stage and no step navigation, so aria-current is never set.
    expect(await currentStep(page)).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __navScrolls: number }).__navScrolls)).toBe(0);
    await context.close();
  });

  test('forced colours: the step navigation and your view stay drawn', async ({ browser, baseURL, browserName }) => {
    test.skip(browserName !== 'chromium', 'forced-colours emulation is Chromium only');
    const page = await open(browser, baseURL, TICK, { width: 1024, height: 768 }, { forcedColors: 'active' });
    await dispatchCounted(page, { arm: ARM, viewN: 1e9 });
    const line = page.locator('[data-scroll-canvas] [data-your-view] line');
    await expect(line).toHaveCount(1);
    const box = await line.boundingBox();
    expect(box!.height).toBeGreaterThan(0);
    await expect(nextButton(page)).toBeVisible();
    await page.context().close();
  });
});
