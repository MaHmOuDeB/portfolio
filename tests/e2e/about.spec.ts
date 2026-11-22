import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { aboutPhoto } from '../../content/about-photo.ts';
import { E2E_CV_PDF } from './cv-link';
import { expectNoA11yViolations, test, waitForHydration } from './fixtures';

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
        // A link in a closed FAQ row cannot take focus until the row is open (its answer is not rendered).
        if (await link.evaluate((el) => el.closest('details:not([open])') !== null)) continue;
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

  test('/about: the questions rows follow the story, the FAQ comes before the call to action, and no id repeats', async ({ page }) => {
    await page.goto('/about');
    await expect(page.locator('[data-home-questions]')).toHaveCount(1);
    await expect(page.locator('[data-home-faq]')).toHaveCount(1);
    const order = await page.evaluate(() => {
      const top = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().top + scrollY;
      return [top('[data-about-story]'), top('[data-home-questions]'), top('#timeline'), top('#languages'), top('[data-home-faq]'), top('[data-page-cta]')];
    });
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    const ids = await page.evaluate(() => [...document.querySelectorAll('[id]')].map((el) => el.id));
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  test('/about: the photograph loads at 480 px wide, or 960 px on a dense screen, from the optimiser', async ({ page }) => {
    await page.goto('/about');
    const img = page.getByRole('img', { name: aboutPhoto.alt });
    // Above the fold at 1440, so it loads eagerly (finding M22), still from the optimiser.
    await expect(img).toHaveAttribute('loading', 'eager');
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
    // naturalWidth is density-corrected (HTML spec): the 2x candidate of a srcset reports half its pixel
    // width, as WebKit does on its dense screen. So the delivered file's own pixels are read from a plain
    // image of the same URL, which has no srcset and so a density of 1 in every engine.
    const { current, natural, file } = await img.evaluate(async (el: HTMLImageElement) => {
      const plain = new Image();
      plain.src = el.currentSrc;
      await plain.decode();
      return { current: el.currentSrc, natural: el.naturalWidth, file: { width: plain.naturalWidth, height: plain.naturalHeight } };
    });
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    const width = dpr > 1 ? 960 : 480;
    expect(new URL(current).pathname).toBe('/_next/image');
    expect(new URL(current).searchParams.get('url')).toBe(aboutPhoto.src);
    expect(new URL(current).searchParams.get('w')).toBe(String(width));
    expect(file.width, 'the delivered file is this many pixels wide').toBe(width);
    expect(file.width / file.height).toBeCloseTo(4 / 5, 2);
    // In CSS pixels the photograph is 480 wide on every screen: the 2x file at density 2, the 1x at 1.
    expect(natural, 'the density-corrected natural width').toBe(480);
    const box = (await img.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(480);
  });

  for (const route of ROUTES) {
    test(`${route}: the header links the CV page, and the page offers the PDF only when the build has one`, async ({ page }) => {
      await page.goto(route);
      const header = page.locator('[data-site-header]');
      // Under 1024 px the header's links and both buttons live behind Menu: open it first there.
      const summary = header.locator('summary');
      if (await summary.isVisible()) {
        await waitForHydration(header.locator('details'));
        await summary.click();
        await expect(header.locator('details')).toHaveAttribute('open', '');
      }
      const cv = header.getByRole('link', { name: 'CV', exact: true });
      await expect(cv.filter({ visible: true })).toHaveCount(1);
      await expect(cv.filter({ visible: true })).toHaveAttribute('href', '/cv');
      await expect(page.locator('a[href="/cv.pdf"]')).toHaveCount(E2E_CV_PDF ? 1 : 0);
    });
  }

  test('/about links the CV page, which opens', async ({ page }) => {
    await page.goto('/about');
    // The head holds the "Read my CV" button; the call to action at the end repeats it.
    await page.locator('[data-about-actions]').getByRole('link', { name: 'Read my CV' }).click();
    await expect(page).toHaveURL(/\/cv$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mahmoud El Bergui');
  });
});
