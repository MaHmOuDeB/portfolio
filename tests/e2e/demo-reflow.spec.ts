import type { Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { test } from './fixtures';

/** Text must fit the frame; only the compact, two-dimensional plot may pan locally. */
async function expectReadablePlot(scope: Locator) {
  await expect(scope.getByRole('img', { name: /visitors each group needs/ })).toHaveCount(1);
  const findings = await scope.evaluate((el) => {
    const svg = [...el.querySelectorAll<SVGSVGElement>('svg[role="img"]')]
      .find((node) => node.getClientRects().length > 0)!;
    const frame = svg.getBoundingClientRect();
    const column = el.getBoundingClientRect();
    const bounds = svg.hasAttribute('data-layout') ? column : frame;
    const labels = [...svg.querySelectorAll('text')]
      .filter((node) => getComputedStyle(node).display !== 'none')
      .map((node) => ({ text: node.textContent, axis: node.getAttribute('data-tick'), box: node.getBoundingClientRect() }));
    const outside = labels.filter(({ box }) => box.left < bounds.left - 0.5 || box.right > bounds.right + 0.5
      || box.top < frame.top - 0.5 || box.bottom > frame.bottom + 0.5).map(({ text }) => text);
    const overlaps: (string | null)[][] = [];
    for (const axis of ['x', 'y']) {
      const ticks = labels.filter((label) => label.axis === axis)
        .sort((a, b) => axis === 'x' ? a.box.left - b.box.left : a.box.top - b.box.top);
      for (let i = 1; i < ticks.length; i++) {
        const a = ticks[i - 1]!;
        const b = ticks[i]!;
        if (axis === 'x' ? a.box.right >= b.box.left : a.box.bottom >= b.box.top) overlaps.push([a.text, b.text]);
      }
    }
    return { outside, overlaps };
  });
  expect(findings).toEqual({ outside: [], overlaps: [] });
}

for (const size of [18, 24, 32]) {
  test(`demo chart text fits at ${size}px root around both layout boundaries`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/kitchen-sink');
    const demo = page.locator('#demo');
    await expect(demo.locator('xpath=..')).toHaveAttribute('data-island', 'ready');
    await page.evaluate(async (fontSize) => {
      document.documentElement.style.fontSize = `${fontSize}px`;
      await document.fonts.ready;
    }, size);
    const body = demo.locator('[data-figure-body]');
    for (const width of [16 * size - 1, 16 * size, 16 * size + 1, 20 * size - 1, 20 * size, 872, 1312]) {
      await body.evaluate((node, pixels) => { node.style.width = `${pixels}px`; }, width);
      await test.step(`${width}px chart column`, () => expectReadablePlot(body));
    }
  });
}

test('enlarged demo retains its server plot and exact table without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 1000, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto('/kitchen-sink');
    await page.evaluate(async () => {
      document.documentElement.style.fontSize = '32px';
      await document.fonts.ready;
    });
    const demo = page.locator('#demo');
    await expect(demo.locator('[data-nojs-only] tbody tr')).toHaveCount(10);
    await expect(demo.locator('[data-nojs-only] tbody tr').nth(1)).toHaveText('23,835');
    await expectReadablePlot(demo.locator('[data-figure-body]'));
  } finally {
    await context.close();
  }
});

for (const width of [320, 1000]) {
  test(`demo error at ${width}px distinguishes preset plot and current table`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/kitchen-sink');
    const fragile = page.locator('#fragile');
    await expect(fragile.locator('xpath=..')).toHaveAttribute('data-island', 'ready');
    await page.evaluate(async () => {
      document.documentElement.style.fontSize = '32px';
      await document.fonts.ready;
    });
    await fragile.getByRole('slider', { name: 'Baseline conversion' }).press('ArrowRight');
    const fallback = fragile.locator('[data-figure-fallback]');
    await expect(fallback).toBeVisible();
    await expect(fallback.locator('[data-demo-preset]')).toHaveText('Preset plot at 10% baseline conversion and 80% power.');
    await expect(fallback.locator('[data-demo-current-inputs]')).toContainText('11% baseline conversion and 80% power');
    await expect(fallback.locator('tbody tr').nth(1)).toHaveText('24,138');
    await expectReadablePlot(fallback);
    const paragraphsFit = await fallback.locator('[data-demo-preset], [data-demo-current-inputs]')
      .evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth));
    expect(paragraphsFit).toBe(true);
    if (width === 320) {
      const plot = fallback.getByRole('region', { name: 'Sample size plot', exact: true });
      const maximum = await plot.evaluate((node) => node.scrollWidth - node.clientWidth);
      expect(maximum).toBeGreaterThan(0);
      await plot.focus();
      const pageLeft = await page.evaluate(() => window.scrollX);
      // Separate key gestures from assertions so polling cannot restart WebKit's scroll animation.
      for (const [key, edge] of [['ArrowRight', maximum], ['ArrowLeft', 0]] as const) {
        for (let i = 0; i < 6; i++) await plot.press(key, { delay: 200 });
        await expect.poll(() => plot.evaluate((node) => node.scrollLeft)).toBe(edge);
      }
      expect(await page.evaluate(() => window.scrollX)).toBe(pageLeft);
      await page.keyboard.press('Tab');
      await expect(plot).not.toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(plot).toBeFocused();
    }
  });
}
