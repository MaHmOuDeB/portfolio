import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { HOME_LINKS } from '../../content/home-destinations.ts';
import { HOME_SITE } from '../../content/home.ts';
import { expectNoA11yViolations, test } from './fixtures';

// The Work directory at /work: every case study and build note in two groups of four, as even cards in a
// ruled list. Each card is a provenance chip, the title, one bold "Shows:" line and one plain line. The
// page is static and has no island. Every link must land: the page answers 200 and a #fragment names an
// element on it.

const ROUTE = '/work';
const SECTIONS = [
  ['experimentation', 'Experiments and analytics'],
  ['automation', 'Automation and agents'],
] as const;
const LINKS = [
  ['/work/audible', 'Experimentation at Audible (Amazon)'],
  ['/work/retention', 'Customer retention and reactivation analysis'],
  ['/work/pulse', 'Pulse: a tracking plan for product analytics'],
  ['/work/weather', 'Weather: a SQL pipeline that stops on bad data'],
  ['/work/audible#automation', 'Test-account automation'],
  ['/work/docproof', "Docproof: agents that check each other's work"],
  ['/work/n8n', 'E-invoice intake and error alerts in n8n'],
  ['/work/marketingws', 'MarketingWS: marketing copy from one brief, with a fact check'],
] as const;
const CHIPS = [
  'Work experience',
  'Public data, rebuilt 2026',
  'Demo, no real users',
  'Public data, rebuilt 2026',
  'Work experience',
  'Open source',
  'Personal project',
  "Master's thesis, rebuilt 2026",
] as const;

const items = (page: Page) => page.locator('main [data-work-item] h3');
const cards = (page: Page) => page.locator('main [data-work-item] > a');

test.describe('the Work page', () => {
  test('outline: one h1, the two groups as named regions, each item a card with an h3, in order', async ({ page }) => {
    const response = await page.goto(ROUTE);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/^Work\b.* \| Mahmoud El Bergui$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Open the work and see how it was done.');
    for (const role of ['banner', 'main', 'contentinfo'] as const) await expect(page.getByRole(role)).toHaveCount(1);
    for (const [id, title] of SECTIONS) {
      await expect(page.getByRole('region', { name: title, exact: true })).toHaveAttribute('id', id);
    }
    const headings = await page.evaluate(() => [...document.querySelectorAll('main h1, main h2, main h3')].map((h) => Number(h.tagName[1])));
    // h1, the two groups with their four cards, then the site band and the call to action (an h2 each, no h3 under them)
    expect(headings).toEqual([1, 2, 3, 3, 3, 3, 2, 3, 3, 3, 3, 2, 2]);
    await expect(items(page)).toHaveText(LINKS.map(([, name]) => name));
    expect(await cards(page).evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual(LINKS.map(([href]) => href));
    // the main links are exactly the eight cards, the site band's one link to the live test and the call to action's two
    await expect(page.locator('main a[href]')).toHaveCount(LINKS.length + 3);
  });

  test('each card shows its provenance chip above the title, then a bold "Shows:" line and a plain line', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.locator('main [data-work-item] [data-work-chip]')).toHaveText([...CHIPS]);
    const shows = page.locator('main [data-work-item] [data-work-shows]');
    await expect(shows).toHaveCount(LINKS.length);
    for (const line of await shows.allTextContents()) expect(line).toMatch(/^Shows: .+\.$/);
    // The chip is part of the card's description, and it is drawn first: above the title, never under the "+".
    const layout = await page.locator('main [data-work-item]').evaluateAll((items) =>
      items.map((item) => {
        const box = (selector: string) => item.querySelector(selector)!.getBoundingClientRect();
        const [chip, title, line, plus] = [box('[data-chip]'), box('h3'), box('[data-work-line]'), box('[data-depth-go]')];
        const described = item.querySelector('a')!.getAttribute('aria-describedby');
        return {
          chipFirst: chip.bottom <= title.top,
          lineLast: line.top >= title.bottom,
          clearOfPlus: chip.right <= plus.left || chip.top >= plus.bottom,
          chipDescribes: document.getElementById(described ?? '')?.contains(item.querySelector('[data-chip]')) ?? false,
        };
      }),
    );
    for (const card of layout) expect(card).toEqual({ chipFirst: true, lineLast: true, clearOfPlus: true, chipDescribes: true });
    // The page says what the two kinds are, once, under the headline.
    await expect(page.locator('main [data-work-kinds]')).toHaveText(
      'Case studies are analyses with a question and a finding. Build notes are things I built, and how I tested them.',
    );
  });

  test('the tile at the end leads to the live test with one link', async ({ page }) => {
    await page.goto(ROUTE);
    const tile = page.locator('main [data-work-site]');
    await expect(tile).toHaveCount(1);
    await expect(tile.getByRole('heading', { level: 2 })).toHaveText(HOME_SITE.title);
    await expect(tile.locator('a[href]')).toHaveCount(1);
    const link = tile.getByRole('link', { name: HOME_SITE.live });
    await expect(link).toHaveAttribute('href', HOME_LINKS.experiment);
    // the last block of the article but the shared call to action: nothing else follows it
    expect(await tile.evaluate((el) => el.closest('article')?.lastElementChild?.previousElementSibling?.contains(el))).toBe(true);
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

  test('keyboard: Tab reaches the eight cards in page order', async ({ page, browserName }) => {
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
