import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { aboutPhoto } from '../../content/about-photo.ts';
import { E2E_CV_PDF } from './cv-link';
import { expectNoA11yViolations, test } from './fixtures';

// The About page and the printable CV page. Both are static: prose, a timeline, lists and, on
// About, the photograph through next/image (480 px wide, 960 px for dense screens, loaded lazily).
// The checks here are the ones a unit render cannot make: keyboard focus, the photo actually
// loading, the print stylesheet and reflow at 320 px.

const ROUTES = ['/about', '/cv'] as const;

async function noHorizontalScroll(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll, 'the document scrolls sideways').toBeLessThanOrEqual(client);
}

test.describe('About and CV', () => {
  for (const route of ROUTES) {
    test(`${route}: one h1, landmarks once each, no axe violation`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      for (const role of ['banner', 'main', 'contentinfo'] as const) await expect(page.getByRole(role)).toHaveCount(1);
      await expectNoA11yViolations(page);
    });

    test(`${route}: every link in the page takes keyboard focus with a visible, unclipped ring`, async ({ page }) => {
      await page.goto(route);
      // A key press first, so the browser treats focus as keyboard focus (:focus-visible).
      await page.keyboard.press('Shift');
      const links = page.getByRole('main').locator('a[href]');
      const count = await links.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const link = links.nth(i);
        await link.focus();
        await expect(link).toBeFocused();
        const ring = await link.evaluate((el) => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          // No ancestor clips the ring: overflow stays visible all the way up.
          let clipped = false;
          for (let p = el.parentElement; p; p = p.parentElement) {
            const o = getComputedStyle(p);
            if (o.overflowX !== 'visible' || o.overflowY !== 'visible') clipped = true;
          }
          return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), height: r.height, clipped };
        });
        expect(ring.style).not.toBe('none');
        expect(ring.width).toBeGreaterThanOrEqual(2);
        expect(ring.clipped).toBe(false);
      }
    });

    test(`${route}: reflows at 320 px without sideways scrolling`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(route);
      await noHorizontalScroll(page);
    });

    test(`${route}: prints the page without the site header, footer or buttons`, async ({ page }) => {
      await page.goto(route);
      await page.emulateMedia({ media: 'print' });
      await expect(page.locator('[data-site-header]')).toBeHidden();
      await expect(page.getByRole('contentinfo')).toBeHidden();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      // The download button exists only when the build has a checked PDF; then print hides it.
      const download = page.locator('[data-cv-download]');
      await expect(download).toHaveCount(E2E_CV_PDF ? 1 : 0);
      if (E2E_CV_PDF) await expect(download).toBeHidden();
      await page.emulateMedia({ media: 'screen' });
      await expect(page.locator('[data-site-header]')).toBeVisible();
    });
  }

  test('/about: the photograph loads at 480 px wide, or 960 px on a dense screen, from the optimiser', async ({ page }) => {
    await page.goto('/about');
    const img = page.getByRole('img', { name: aboutPhoto.alt });
    await expect(img).toHaveAttribute('loading', 'lazy');
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
    const { current, natural, ratio } = await img.evaluate((el: HTMLImageElement) => ({
      current: el.currentSrc,
      natural: el.naturalWidth,
      ratio: el.naturalWidth / el.naturalHeight,
    }));
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    const width = dpr > 1 ? 960 : 480;
    expect(new URL(current).pathname).toBe('/_next/image');
    expect(new URL(current).searchParams.get('url')).toBe(aboutPhoto.src);
    expect(new URL(current).searchParams.get('w')).toBe(String(width));
    expect(natural).toBe(width);
    expect(ratio).toBeCloseTo(4 / 5, 2);
    const box = (await img.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(480);
  });

  for (const route of ROUTES) {
    test(`${route}: the header links the CV page, and the page offers the PDF only when the build has one`, async ({ page }) => {
      await page.goto(route);
      const header = page.locator('[data-site-header]');
      await expect(header.getByRole('link', { name: 'CV', exact: true }).first()).toHaveAttribute('href', '/cv');
      await expect(page.locator('a[href="/cv.pdf"]')).toHaveCount(E2E_CV_PDF ? 1 : 0);
    });
  }

  test('/about links the CV page, which opens', async ({ page }) => {
    await page.goto('/about');
    await page.getByRole('main').getByRole('link', { name: 'Read my CV' }).click();
    await expect(page).toHaveURL(/\/cv$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mahmoud El Bergui');
  });
});
