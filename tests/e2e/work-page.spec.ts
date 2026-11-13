import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations, test } from './fixtures';

// The Work directory at /work: every case study and build note in two groups, as a ruled list of
// links. The page is static and has no island. Every link must land: the page answers 200 and a
// #fragment names an element on it.

const ROUTE = '/work';
const SECTIONS = [
  ['experimentation', 'Experimentation & analytics'],
  ['tools', "Tools I've built"],
] as const;
const LINKS = [
  ['/experiment', 'Live test'],
  ['/work/audible#why-so-many', 'Experimentation at Audible (Amazon)'],
  ['/work/retention', 'Customer retention and reactivation analysis'],
  ['/work/pulse', 'Pulse: analytics instrumentation demo'],
  ['/work/marketingws', 'MarketingWS'],
  ['/work/docproof', 'Docproof'],
  ['/work/weather', 'Weather data quality'],
  ['/work/n8n', 'n8n Workflow Library'],
] as const;

const items = (page: Page) => page.locator('main [data-work-item] h3 a');

test.describe('the Work page', () => {
  test('outline: one h1, the two groups as named regions, each item an h3 link, in order', async ({ page }) => {
    const response = await page.goto(ROUTE);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle('Work');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Work');
    for (const role of ['banner', 'main', 'contentinfo'] as const) await expect(page.getByRole(role)).toHaveCount(1);
    for (const [id, title] of SECTIONS) {
      await expect(page.getByRole('region', { name: title, exact: true })).toHaveAttribute('id', id);
    }
    const headings = await page.evaluate(() => [...document.querySelectorAll('main h1, main h2, main h3')].map((h) => Number(h.tagName[1])));
    expect(headings).toEqual([1, 2, 3, 3, 3, 3, 2, 3, 3, 3, 3]);
    await expect(items(page)).toHaveText(LINKS.map(([, name]) => name));
    expect(await items(page).evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual(LINKS.map(([href]) => href));
    // the main links are exactly the eight items
    await expect(page.locator('main a[href]')).toHaveCount(LINKS.length);
  });

  test('the header marks Work as the current page', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.locator('header a[aria-current="page"][href="/work"]').first()).toBeAttached();
  });

  test('without JavaScript every item and link is there', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(ROUTE);
    await expect(items(page)).toHaveText(LINKS.map(([, name]) => name));
    await context.close();
  });

  for (const [href, name] of LINKS) {
    test(`the link to ${name} lands: ${href}`, async ({ page }) => {
      await page.goto(ROUTE);
      const [path, fragment] = href.split('#');
      const response = await page.request.get(path!);
      expect(response.status(), `${path} answers`).toBe(200);
      await items(page).filter({ hasText: name }).click();
      await page.waitForURL((url) => url.pathname === path);
      if (fragment) await expect(page.locator(`[id="${fragment}"]`)).toHaveCount(1);
    });
  }

  test('keyboard: Tab reaches the eight links in page order', async ({ page, browserName }) => {
    const key = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
    await page.goto(ROUTE);
    await items(page).first().focus();
    for (const [, name] of LINKS.slice(1)) {
      await page.keyboard.press(key);
      await expect(page.locator(':focus')).toHaveText(name);
    }
  });

  test('links are 44 px targets and the page reflows at 320 px without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(ROUTE);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const box of await items(page).evaluateAll((as) => as.map((a) => a.getBoundingClientRect().height))) {
      expect(box).toBeGreaterThanOrEqual(44);
    }
  });

  test('each row has one hidden glyph marker, on the first line of its title, at 375 px and on desktop', async ({ page }) => {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(ROUTE);
      const rows = await page.locator('main [data-work-item]').evaluateAll((lis) =>
        lis.map((li) => {
          const svgs = [...li.querySelectorAll('svg')];
          const glyph = svgs[0]!.getBoundingClientRect();
          const title = li.querySelector('[data-work-title]')!;
          const range = document.createRange();
          range.selectNodeContents(title);
          const first = range.getClientRects()[0]!;
          const mid = glyph.top + glyph.height / 2;
          return {
            count: svgs.length,
            hidden: svgs[0]!.getAttribute('aria-hidden'),
            onFirstLine: mid >= first.top && mid <= first.bottom,
            before: glyph.right <= first.left,
          };
        }),
      );
      expect(rows, `${width}px`).toHaveLength(LINKS.length);
      for (const row of rows) expect(row, `${width}px`).toEqual({ count: 1, hidden: 'true', onFirstLine: true, before: true });
    }
    // At 375 px a short title stays on one line beside its marker.
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(ROUTE);
    const live = page.locator('main [data-work-item="/experiment"] [data-work-title]');
    const lines = await live.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    });
    expect(lines).toBe(1);
  });

  test('no axe violations', async ({ page }) => {
    await page.goto(ROUTE);
    await expectNoA11yViolations(page);
  });
});
