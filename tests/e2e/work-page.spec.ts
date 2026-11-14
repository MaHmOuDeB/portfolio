import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { HOME_LINKS } from '../../content/home-destinations.ts';
import { HOME_SITE } from '../../content/home.ts';
import { expectNoA11yViolations, test } from './fixtures';

// The Work directory at /work: every case study and build note in three groups, as lean cards in a ruled list. The page is static and has no island. Every link must land: the page answers 200 and a
// #fragment names an element on it.

const ROUTE = '/work';
const SECTIONS = [
  ['experimentation', 'Experiments and analytics'],
  ['automation', 'Automation and agents'],
  ['pipelines', 'Data pipelines'],
] as const;
const LINKS = [
  ['/work/audible#why-so-many', 'Experimentation at Audible (Amazon)'],
  ['/work/retention', 'Customer retention and reactivation analysis'],
  ['/work/pulse', 'Pulse: analytics instrumentation demo'],
  ['/work/docproof', 'Docproof'],
  ['/work/n8n', 'n8n Workflow Library'],
  ['/work/marketingws', 'MarketingWS'],
  ['/work/weather', 'Weather data quality'],
] as const;

const items = (page: Page) => page.locator('main [data-work-item] h3');
const cards = (page: Page) => page.locator('main [data-work-item] > a');

test.describe('the Work page', () => {
  test('outline: one h1, the three groups as named regions, each item a card with an h3, in order', async ({ page }) => {
    const response = await page.goto(ROUTE);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle('Work');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Work');
    for (const role of ['banner', 'main', 'contentinfo'] as const) await expect(page.getByRole(role)).toHaveCount(1);
    for (const [id, title] of SECTIONS) {
      await expect(page.getByRole('region', { name: title, exact: true })).toHaveAttribute('id', id);
    }
    const headings = await page.evaluate(() => [...document.querySelectorAll('main h1, main h2, main h3')].map((h) => Number(h.tagName[1])));
    // h1, the three groups with their cards, then the tile to the live test (an h2 with no h3 under it)
    expect(headings).toEqual([1, 2, 3, 3, 3, 2, 3, 3, 3, 2, 3, 2]);
    await expect(items(page)).toHaveText(LINKS.map(([, name]) => name));
    expect(await cards(page).evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual(LINKS.map(([href]) => href));
    // the main links are exactly the seven cards and the tile's one link to the live test
    await expect(page.locator('main a[href]')).toHaveCount(LINKS.length + 1);
  });

  test('the tile at the end leads to the live test with one link', async ({ page }) => {
    await page.goto(ROUTE);
    const tile = page.locator('main [data-work-site]');
    await expect(tile).toHaveCount(1);
    await expect(tile.getByRole('heading', { level: 2 })).toHaveText(HOME_SITE.title);
    await expect(tile.locator('a[href]')).toHaveCount(1);
    const link = tile.getByRole('link', { name: HOME_SITE.live });
    await expect(link).toHaveAttribute('href', HOME_LINKS.experiment);
    // the last block of the article: nothing follows it
    expect(await tile.evaluate((el) => el.closest('article')?.lastElementChild?.contains(el))).toBe(true);
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
      await cards(page).filter({ has: page.locator('h3', { hasText: name }) }).click();
      await page.waitForURL((url) => url.pathname === path);
      if (fragment) await expect(page.locator(`[id="${fragment}"]`)).toHaveCount(1);
    });
  }

  test('keyboard: Tab reaches the seven cards in page order', async ({ page, browserName }) => {
    const key = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
    await page.goto(ROUTE);
    await cards(page).first().focus();
    for (const [, name] of LINKS.slice(1)) {
      await page.keyboard.press(key);
      await expect(page.locator(':focus')).toContainText(name);
    }
  });

  test('links are 44 px targets and the page reflows at 320 px without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(ROUTE);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const box of await cards(page).evaluateAll((as) => as.map((a) => a.getBoundingClientRect().height))) {
      expect(box).toBeGreaterThanOrEqual(44);
    }
  });

  test('no axe violations', async ({ page }) => {
    await page.goto(ROUTE);
    await expectNoA11yViolations(page);
  });
});
