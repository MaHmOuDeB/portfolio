import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test } from './fixtures';

// Kit-wide checks on real rendered values (computed font sizes, laid-out boxes, scroll width), not
// on class names. Tagged @matrix: they run in every chromium project of the responsive matrix.
// The web server builds with KITCHEN_SINK=1, so /kitchen-sink and /kitchen-sink/live exist here.

const SINK_PAGES = ['/kitchen-sink', '/kitchen-sink/live'] as const;
const TARGET_PAGES = ['/', '/no-such-page', '/kitchen-sink'] as const;
const REFLOW_PAGES = ['/', '/no-such-page', '/kitchen-sink', '/kitchen-sink/live'] as const;

// /kitchen-sink/live holds 144 Figures (about 2.7 MB of HTML): loading and scanning it is slow.
const SLOW_PAGE_TIMEOUT = 90_000;

type ChartTextReport = { checked: number; small: string[]; smallNotes: string[]; underViewBox: string[] };

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

    const report: ChartTextReport = { checked: 0, small: [], smallNotes: [], underViewBox: [] };
    for (const el of document.querySelectorAll('svg[data-chart-frame] text, [data-now-row] text')) {
      if (!visible(el)) continue;
      report.checked += 1;
      const px = size(el);
      if (el.hasAttribute('data-annotation')) {
        if (px < 14) report.smallNotes.push(`${label(el)} is ${px}px`);
      } else if (px < 12) {
        report.small.push(`${label(el)} is ${px}px`);
      }
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
    const report = await measureChartText(page);
    // A vacuous pass would hide a renamed attribute.
    expect(report.checked, 'visible chart texts found').toBeGreaterThan(0);
    expect(report.small, 'chart text under 12px').toEqual([]);
    expect(report.smallNotes, 'annotation under 14px').toEqual([]);
    expect(report.underViewBox, 'text inside an svg with a viewBox').toEqual([]);
  });
}

type TargetReport = { checked: number; tooSmall: string[]; unwrapped: string[] };

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

    const report: TargetReport = { checked: 0, tooSmall: [], unwrapped: [] };
    for (const el of document.querySelectorAll('[data-touch-target]')) {
      if (!visible(el)) continue;
      report.checked += 1;
      const box = el.getBoundingClientRect();
      const square = el.getAttribute('data-touch-target') === 'square';
      if (box.height < MIN || (square && box.width < MIN)) {
        report.tooSmall.push(`${label(el)} is ${box.width.toFixed(1)}x${box.height.toFixed(1)}px`);
      }
    }
    for (const el of document.querySelectorAll('button, summary, input[type="range"]')) {
      if (!visible(el)) continue;
      if (!el.closest('[data-touch-target]')) report.unwrapped.push(label(el));
    }
    return report;
  });
}

for (const path of TARGET_PAGES) {
  test(`@matrix touch targets are at least 44 px on ${path}`, async ({ page }) => {
    await page.goto(path);
    const report = await measureTargets(page);
    expect(report.checked, 'visible touch targets found').toBeGreaterThan(0);
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
