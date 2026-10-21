import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test, waitForIslands } from './fixtures';

// Kit-wide checks on real rendered values (computed font sizes, laid-out boxes, scroll width), not
// on class names. Tagged @matrix: they run in every chromium project of the responsive matrix.
// The web server builds with KITCHEN_SINK=1, so /kitchen-sink and /kitchen-sink/live exist here.

const SINK_PAGES = ['/kitchen-sink', '/kitchen-sink/live'] as const;
const TARGET_PAGES = ['/', '/no-such-page', '/kitchen-sink'] as const;
const REFLOW_PAGES = ['/', '/no-such-page', '/kitchen-sink', '/kitchen-sink/live'] as const;

// /kitchen-sink/live holds 144 Figures (about 2.7 MB of HTML): loading and scanning it is slow.
const SLOW_PAGE_TIMEOUT = 90_000;

/** `counts` are the visible elements each family matched: a family that must exist is asserted > 0. */
type ChartTextReport = {
  counts: { frameTexts: number; nowRowTexts: number; annotations: number; figureSvgs: number };
  small: string[];
  smallNotes: string[];
  underViewBox: string[];
};

/** Every visible `text` in a chart frame or Now row, measured from computed style. */
function measureChartText(page: Page): Promise<ChartTextReport> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      if (!el.checkVisibility({ visibilityProperty: true })) return false;
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };
    const label = (el: Element) => {
      const owner = el.closest('[data-specimen]')?.getAttribute('data-specimen') ?? '(outside a specimen)';
      return `${owner}: "${(el.textContent ?? '').trim().slice(0, 40)}"`;
    };
    const size = (el: Element) => parseFloat(getComputedStyle(el).fontSize);

    const report: ChartTextReport = {
      counts: { frameTexts: 0, nowRowTexts: 0, annotations: 0, figureSvgs: 0 },
      small: [],
      smallNotes: [],
      underViewBox: [],
    };
    for (const el of document.querySelectorAll('svg[data-chart-frame] text, [data-now-row] text')) {
      if (!visible(el)) continue;
      if (el.closest('[data-now-row]')) report.counts.nowRowTexts += 1;
      else report.counts.frameTexts += 1;
      const px = size(el);
      if (el.hasAttribute('data-annotation')) {
        report.counts.annotations += 1;
        if (px < 14) report.smallNotes.push(`${label(el)} is ${px}px`);
      } else if (px < 12) {
        report.small.push(`${label(el)} is ${px}px`);
      }
    }
    for (const svg of document.querySelectorAll('[data-figure] svg')) {
      if (visible(svg)) report.counts.figureSvgs += 1;
    }
    for (const el of document.querySelectorAll('[data-figure] svg[viewBox] text')) {
      if (visible(el)) report.underViewBox.push(label(el));
    }
    return report;
  });
}

for (const path of SINK_PAGES) {
  test(`@matrix chart text is at least 12 px and annotations 14 px on ${path}`, async ({ page }) => {
    test.setTimeout(SLOW_PAGE_TIMEOUT);
    await page.goto(path);
    await waitForIslands(page);
    const report = await measureChartText(page);
    // Each family must exist on both sink pages: a renamed attribute or a chart that stopped
    // rendering would otherwise pass every `toEqual([])` below with nothing measured.
    expect(report.counts.frameTexts, 'visible text in svg[data-chart-frame]').toBeGreaterThan(0);
    expect(report.counts.figureSvgs, 'visible svg inside [data-figure]').toBeGreaterThan(0);
    // The only annotated chart is the demo Figure on /kitchen-sink; the Now row (with its "0" tick)
    // is drawn by the live states on /kitchen-sink/live.
    if (path === '/kitchen-sink') {
      expect(report.counts.annotations, 'visible [data-annotation]').toBeGreaterThan(0);
    } else {
      expect(report.counts.nowRowTexts, 'visible text in [data-now-row]').toBeGreaterThan(0);
    }
    expect(report.small, 'chart text under 12px').toEqual([]);
    expect(report.smallNotes, 'annotation under 14px').toEqual([]);
    expect(report.underViewBox, 'text inside an svg with a viewBox').toEqual([]);
  });
}

type TargetReport = {
  counts: { targets: number; buttons: number; summaries: number; ranges: number };
  tooSmall: string[];
  unwrapped: string[];
};

/** Every visible touch target is 44 px; every button, summary and slider is, or sits in, one. */
function measureTargets(page: Page): Promise<TargetReport> {
  return page.evaluate(() => {
    const MIN = 44;
    // Truly visible: rendered, not visibility:hidden, and not the 1 px box of an sr-only element.
    const visible = (el: Element) => {
      if (!el.checkVisibility({ visibilityProperty: true })) return false;
      const box = el.getBoundingClientRect();
      return box.width > 1 && box.height > 1;
    };
    const label = (el: Element) => {
      const owner = el.closest('[data-specimen]')?.getAttribute('data-specimen');
      const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${owner ? `${owner}: ` : ''}<${el.tagName.toLowerCase()}> "${name}"`;
    };

    const report: TargetReport = {
      counts: { targets: 0, buttons: 0, summaries: 0, ranges: 0 },
      tooSmall: [],
      unwrapped: [],
    };
    for (const el of document.querySelectorAll('[data-touch-target]')) {
      if (!visible(el)) continue;
      report.counts.targets += 1;
      const box = el.getBoundingClientRect();
      const square = el.getAttribute('data-touch-target') === 'square';
      if (box.height < MIN || (square && box.width < MIN)) {
        report.tooSmall.push(`${label(el)} is ${box.width.toFixed(1)}x${box.height.toFixed(1)}px`);
      }
    }
    for (const el of document.querySelectorAll('button, summary, input[type="range"]')) {
      if (!visible(el)) continue;
      if (el instanceof HTMLButtonElement) report.counts.buttons += 1;
      else if (el instanceof HTMLInputElement) report.counts.ranges += 1;
      else report.counts.summaries += 1;
      if (!el.closest('[data-touch-target]')) report.unwrapped.push(label(el));
    }
    return report;
  });
}

// What each page must show, so a family that vanished cannot pass with nothing measured. The
// header's Menu summary exists under md only; the sink has every control family at every width.
const CONTROLS_ON_SINK = ['buttons', 'summaries', 'ranges'] as const;

for (const path of TARGET_PAGES) {
  test(`@matrix touch targets are at least 44 px on ${path}`, async ({ page }) => {
    await page.goto(path);
    await waitForIslands(page);
    const report = await measureTargets(page);
    expect(report.counts.targets, 'visible [data-touch-target]').toBeGreaterThan(0);
    if (path === '/kitchen-sink') {
      for (const family of CONTROLS_ON_SINK) expect(report.counts[family], `visible ${family}`).toBeGreaterThan(0);
    } else if ((page.viewportSize()?.width ?? 0) < 768) {
      expect(report.counts.summaries, 'visible summary (the header Menu)').toBeGreaterThan(0);
    }
    expect(report.tooSmall, 'targets under 44px').toEqual([]);
    expect(report.unwrapped, 'controls outside a [data-touch-target]').toEqual([]);
  });
}

// Reflow (WCAG 1.4.10): 320 CSS px wide, and 1280x720 at 400% zoom (320x180), never scrolls sideways.
const REFLOW_VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 320, height: 180 },
] as const;

for (const path of REFLOW_PAGES) {
  for (const viewport of REFLOW_VIEWPORTS) {
    test(`@matrix reflows without horizontal scroll at ${viewport.width}x${viewport.height} on ${path}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-chromium', 'the viewport is set here, so one project covers it');
      test.setTimeout(SLOW_PAGE_TIMEOUT);
      await page.setViewportSize(viewport);
      await page.goto(path);
      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        wider: [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5)
          .slice(0, 8)
          .map((el) => `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}> ${(el.getAttribute('class') ?? '').slice(0, 60)}`),
      }));
      expect(widths.client).toBe(viewport.width);
      expect(widths.scroll, `scrollWidth ${widths.scroll} > clientWidth; overflowing: ${widths.wider.join(' | ')}`).toBeLessThanOrEqual(
        widths.client,
      );
    });
  }
}

test.describe('control row', () => {
  test('@matrix the segmented control is one 44 px target tall and lines up with the slider and Reset', async ({ page }, testInfo) => {
    await page.goto('/kitchen-sink');
    await waitForIslands(page);
    const demo = page.locator('[data-specimen="controls--demo"]');
    const metrics = await demo.evaluate((el) => {
      const box = (node: Element) => node.getBoundingClientRect();
      const fieldset = el.querySelector('fieldset')!;
      const group = box(fieldset.querySelector('div')!);
      const reset = box(el.querySelector('button')!);
      return {
        group: { top: group.top, bottom: group.bottom, height: group.height },
        reset: { bottom: reset.bottom, height: reset.height, width: reset.width },
        sliderLabelTop: box(el.querySelector('[data-slider] label')!).top,
        legendTop: box(fieldset.querySelector('legend')!).top,
        fieldsetWidth: box(fieldset).width,
        parentWidth: box(fieldset.parentElement!).width,
        labels: [...el.querySelectorAll('label[data-segment]')].map((l) => box(l).height),
      };
    });
    for (const h of metrics.labels) expect(h, testInfo.project.name).toBeGreaterThanOrEqual(44);
    if ((page.viewportSize()?.width ?? 0) < 480) {
      // Stacked: the options and Reset take the full width of the column.
      expect(metrics.fieldsetWidth).toBeGreaterThan(metrics.parentWidth - 2);
    } else {
      expect(Math.abs(metrics.group.height - 44)).toBeLessThan(1);
      expect(Math.abs(metrics.reset.height - 44)).toBeLessThan(1);
      // Controls that share a row line up: the legends sit on one line, and the group and Reset share
      // a bottom edge. (At tablet width the row wraps, and a control on its own row has no partner.)
      if (Math.abs(metrics.legendTop - metrics.sliderLabelTop) < 40) {
        expect(Math.abs(metrics.legendTop - metrics.sliderLabelTop)).toBeLessThan(1.5);
      }
      if (Math.abs(metrics.group.bottom - metrics.reset.bottom) < 40) {
        expect(Math.abs(metrics.group.bottom - metrics.reset.bottom)).toBeLessThan(1.5);
      }
    }
  });
});

test('@matrix a table fits a 375 px column without scrolling sideways', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'the viewport is set here, so one project covers it');
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/kitchen-sink');
  await waitForIslands(page);
  const scrolls = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[role="region"]')]
      .filter((el) => el.querySelector('table') && el.checkVisibility())
      .map((el) => ({ id: el.closest('[data-specimen]')?.getAttribute('data-specimen') ?? el.id, over: el.scrollWidth - el.clientWidth })),
  );
  expect(scrolls.length).toBeGreaterThan(0);
  expect(scrolls.filter((s) => s.over > 0)).toEqual([]);
});
