import { expect } from '@playwright/test';
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { test } from './fixtures';

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
/** Counts that print as "<5": no kit chart at all. */
const TINY = scroll('ab-tiny');

const AXES = 88;
const DESKTOP_PLOT = 280;

type Mode = 'sticky-1' | 'sticky-2' | 'stacked';
type Size = { width: number; height: number };

async function open(browser: Browser, baseURL: string | undefined, url: string, size: Size, options: BrowserContextOptions = {}): Promise<Page> {
  const context = await browser.newContext({ baseURL, viewport: size, ...options });
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
 * The accessible chart tables in the moment: rendered (no display: none ancestor), whether folded in
 * their disclosure or open. The chart's tables carry the Figure's id.
 */
async function chartTables(page: Page): Promise<number> {
  return page.evaluate(() => {
    const rendered = (el: Element) => {
      for (let e: Element | null = el; e; e = e.parentElement) if (getComputedStyle(e).display === 'none') return false;
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

  for (const size of [{ width: 375, height: 667 }, { width: 1024, height: 576 }]) {
    test(`${size.width}x${size.height}: the step navigation sits under the canvas, inside the viewport, while the stage is stuck`, async ({ browser, baseURL }) => {
      const page = await open(browser, baseURL, AB, size);
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
      test.info().annotations.push({ type: 'room-for-steps', description: `${size.width}x${size.height}: ${Math.round(g.vh - g.stage.bottom)} px under the stage` });
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
