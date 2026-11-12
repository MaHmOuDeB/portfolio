import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { auditHtml } from '../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS } from '../../src/lib/facts/facts.generated.ts';
import { NAV } from '../../src/lib/site';
import { expectNoA11yViolations, test } from './fixtures';

// The build notes under /work: short static pages in the build-note template (the problem, the
// architecture as a diagram, how I checked it, the outcome, the limits, the code). Each note links to
// other sites only as ordinary links, so loading and reading one never makes a request off the site.
// The Weather and n8n notes have no island: prose, one diagram Figure drawn as ordered lists, and on
// Weather an open table of checks by level.

const SECTIONS = [
  ['problem', 'The problem'],
  ['architecture', 'Architecture'],
  ['how-i-checked-this', 'How I checked this'],
  ['outcome', 'Outcome'],
  ['limits', 'Limits'],
  ['sources', 'Sources and links'],
] as const;
const LINKS = ['Problem', 'Architecture', 'How I checked this', 'Outcome', 'Limits', 'Sources'];

const NOTES = [
  { route: '/work/weather', title: 'Weather data quality', figure: 'weather-pipeline', table: 'check-levels' },
  { route: '/work/n8n', title: 'n8n Workflow Library', figure: 'n8n-flow', table: null },
] as const;

/** Every request URL the page makes from its first byte. */
function recordRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  return urls;
}

const sectionLinks = (page: Page) => page.getByRole('navigation', { name: 'On this page' }).getByRole('link');
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

for (const note of NOTES) {
  test.describe(note.title, () => {
    test('outline: one h1, the build-note sections in order, no skipped heading level', async ({ page }) => {
      const response = await page.goto(note.route);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(note.title);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(note.title);
      for (const role of ['banner', 'main', 'contentinfo'] as const) await expect(page.getByRole(role)).toHaveCount(1);
      for (const [id, title] of SECTIONS) {
        await expect(page.getByRole('region', { name: title, exact: true })).toHaveAttribute('id', id);
      }
      const levels = await page.evaluate(() => [...document.querySelectorAll('main h2, main h3')].map((h) => Number(h.tagName[1])));
      expect(levels[0]).toBe(2);
      expect(levels.every((l, i) => i === 0 || l <= levels[i - 1]! + 1)).toBe(true);
      await expect(page.locator(`section#architecture figure[data-figure="${note.figure}"]`)).toHaveCount(1);
    });

    test('the header marks Work as the current section, in the bar and in the menu', async ({ page }) => {
      await page.goto(note.route);
      const work = NAV.find((n) => n.label === 'Work')!;
      // Below the menu breakpoint the links sit in the closed menu, so they are found by href, not by role.
      const links = page.locator(`[data-site-header] a[href="${work.href}"]`);
      await expect(links).not.toHaveCount(0);
      for (const link of await links.all()) await expect(link).toHaveAttribute('aria-current', 'page');
    });

    test('section links: in order, every target exists, and a link lands its heading below the header', async ({ page }) => {
      await page.goto(note.route);
      await expect(sectionLinks(page)).toHaveText(LINKS);
      const hrefs = await sectionLinks(page).evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      expect(hrefs).toEqual(SECTIONS.map(([id]) => `#${id}`));
      for (const href of hrefs) await expect(page.locator(href!)).toHaveCount(1);
      await sectionLinks(page).filter({ hasText: 'Limits' }).click();
      await expect(page).toHaveURL(/#limits$/);
      const heading = page.locator('#limits-title');
      await expect(heading).toBeInViewport();
      const covered = await heading.evaluate((h) => {
        const header = document.querySelector('[data-site-header]')!;
        const r = h.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + 4, r.top + r.height / 2);
        return hit !== null && header.contains(hit);
      });
      expect(covered, 'the heading is not under the sticky header').toBe(false);
    });

    test('the diagram reads as ordered steps, with its connectors hidden', async ({ page }) => {
      await page.goto(note.route);
      const fig = page.locator(`figure[data-figure="${note.figure}"]`);
      await expect(fig.getByRole('list').first()).toBeVisible();
      expect(await fig.locator('ol > li').count()).toBeGreaterThan(4);
      for (const c of await fig.locator('[data-connector]').all()) await expect(c).toHaveAttribute('aria-hidden', 'true');
      await expect(fig.locator('svg text, svg[viewBox] text')).toHaveCount(0);
    });

    test('axe finds nothing', async ({ page }) => {
      await page.goto(note.route);
      await page.evaluate(() => document.fonts.ready);
      await expectNoA11yViolations(page);
    });

    test('the served and the hydrated page pass the truth audit', async ({ page, request }) => {
      const ctx = { route: note.route, factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] };
      const served = await (await request.get(note.route)).text();
      expect(auditHtml(served, ctx)).toEqual([]);
      await page.goto(note.route);
      expect(auditHtml(await page.content(), ctx)).toEqual([]);
    });

    test('nothing of the live experiment: no beacon and no request to the experiment endpoints', async ({ page }) => {
      const requests: string[] = [];
      page.on('request', (r) => requests.push(new URL(r.url()).pathname));
      await page.goto(note.route);
      await page.waitForLoadState('load');
      await expect(page.locator('[data-experiment], [data-phase]')).toHaveCount(0);
      expect(requests.filter((p) => p.startsWith('/api/') || p.startsWith('/experiment'))).toEqual([]);
    });

    test('without JavaScript: every section, the diagram and the table', async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      await page.goto(note.route);
      for (const [, title] of SECTIONS) await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
      await expect(page.locator(`figure[data-figure="${note.figure}"] ol`).first()).toBeVisible();
      if (note.table) await expect(page.locator(`[aria-labelledby="${note.table}-caption"] table`)).toBeVisible();
      await context.close();
    });

    test('reflow at 320 px: the document never scrolls sideways', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(note.route);
      await expect.poll(() => noSideScroll(page)).toBe(true);
    });

    test('print: every section heading prints and nothing overflows', async ({ page }) => {
      await page.goto(note.route);
      await page.emulateMedia({ media: 'print' });
      for (const [, title] of SECTIONS) await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
      expect(await noSideScroll(page)).toBe(true);
    });
  });
}

test('the links that leave the site are ordinary links: n8n names a fixed commit, Weather the dataset', async ({ page }) => {
  await page.goto('/work/n8n');
  const repoLinks = page.locator('section#sources a[href^="https://github.com/"]');
  await expect(repoLinks).toHaveCount(3);
  for (const a of await repoLinks.all()) {
    await expect(a).toHaveAttribute('rel', 'noopener');
    expect(await a.getAttribute('href')).toMatch(/\/(tree|blob)\/[0-9a-f]{40}\b/);
  }
  await page.goto('/work/weather');
  const external = await page.locator('main a[href^="http"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(external).toEqual(['https://www.kaggle.com/datasets/nelgiriyewithana/global-weather-repository']);
});

test.describe('MarketingWS build note', () => {
  const ROUTE = '/work/marketingws';
  const SECTIONS = [
    ['problem', 'The problem'],
    ['architecture', 'Architecture'],
    ['how-i-checked-this', 'How I checked this'],
    ['outcome', 'Outcome'],
    ['limits', 'Limits'],
    ['code-and-demo', 'Code and demo'],
  ] as const;
  const LINKS = ['Problem', 'Architecture', 'How I checked this', 'Outcome', 'Limits', 'Code and demo'];
  const STEPS = ['Brief', 'Draft', 'Check', 'Translate', 'Output'];
  const GROQ_NOTE = "The live demo depends on Groq's free tier.";

  test('outline: one h1, the six sections in order, the diagram in the architecture section', async ({ page }) => {
    const response = await page.goto(ROUTE);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle('MarketingWS');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('MarketingWS');
    for (const role of ['banner', 'main', 'contentinfo'] as const) await expect(page.getByRole(role)).toHaveCount(1);
    const sections = await page.evaluate(() =>
      [...document.querySelectorAll('main section[id]')].map((s) => [s.id, s.querySelector(':scope > h2')?.textContent?.trim()]),
    );
    expect(sections).toEqual(SECTIONS.map(([id, title]) => [id, title]));
    for (const [id, title] of SECTIONS) {
      await expect(page.getByRole('region', { name: title, exact: true })).toHaveAttribute('id', id);
    }
    const figure = page.getByRole('figure', { name: 'Every draft is checked against the brief' });
    await expect(figure).toBeVisible();
    await expect(page.locator('#architecture figure[data-figure="marketingws-steps"]')).toHaveCount(1);
    // the diagram is a list a screen reader reads in order; it has no badge, controls or table
    await expect(figure.getByRole('listitem')).toHaveCount(STEPS.length);
    for (const [i, name] of STEPS.entries()) await expect(figure.getByRole('listitem').nth(i)).toContainText(name);
    await expect(figure.locator('table, [data-provenance], [role="group"]')).toHaveCount(0);
  });

  test('the free-tier note stands beside the demo link, and the links leave the site as plain links', async ({ page }) => {
    await page.goto(ROUTE);
    const code = page.getByRole('region', { name: 'Code and demo', exact: true });
    const demo = code.getByRole('link', { name: 'The live demo, on another site' });
    await expect(demo).toHaveAttribute('href', 'https://marketing-ws.vercel.app/');
    await expect(demo).toHaveAttribute('rel', 'noopener');
    // `has` is matched inside each list item, so its locator starts from the page, not from the region
    const demoItem = code.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'The live demo, on another site' }) });
    await expect(demoItem).toHaveCount(1);
    await expect(demoItem).toContainText(GROQ_NOTE);
    for (const name of ['The MarketingWS repository, at the commit this page describes', 'The thesis version, under the tag thesis-2025']) {
      await expect(code.getByRole('link', { name })).toHaveAttribute('href', /^https:\/\/github\.com\/MaHmOuDeB\/MarketingWS\/tree\/[0-9a-f]{40}$/);
    }
    // nothing is embedded
    await expect(page.locator('main iframe, main img, main video, main object, main embed')).toHaveCount(0);
  });

  test('reading the page makes only same-origin requests: none to the demo or the repository', async ({ page, baseURL }) => {
    const urls = recordRequests(page);
    await page.goto(ROUTE);
    await page.waitForLoadState('networkidle');
    await page.mouse.wheel(0, 4000);
    // pointing at and focusing the outbound links fetches nothing either
    for (const link of await page.locator('main a[href^="https://"]').all()) {
      await link.hover();
      await link.focus();
    }
    await page.waitForLoadState('networkidle');
    const origin = new URL(baseURL!).origin;
    const foreign = urls.filter((u) => !u.startsWith('data:') && new URL(u).origin !== origin);
    expect(foreign).toEqual([]);
    expect(urls.length).toBeGreaterThan(0);
  });

  test('section links: in order, and the keyboard reaches each and follows one', async ({ page, browserName }) => {
    const key = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
    await page.goto(ROUTE);
    await expect(sectionLinks(page)).toHaveText(LINKS);
    await sectionLinks(page).first().focus();
    for (const label of LINKS.slice(1)) {
      await page.keyboard.press(key);
      await expect(page.locator(':focus')).toHaveText(label);
    }
    await sectionLinks(page).filter({ hasText: 'Limits' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#limits$/);
    await expect(page.locator('#limits-title')).toBeInViewport();
  });

  test('axe finds nothing', async ({ page }) => {
    await page.goto(ROUTE);
    await page.evaluate(() => document.fonts.ready);
    await expectNoA11yViolations(page);
  });

  test('the served and the hydrated page pass the truth audit', async ({ page, request }) => {
    const ctx = { route: ROUTE, factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] };
    expect(auditHtml(await (await request.get(ROUTE)).text(), ctx)).toEqual([]);
    await page.goto(ROUTE);
    expect(auditHtml(await page.content(), ctx)).toEqual([]);
  });

  test('without JavaScript: every section and every step of the diagram', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(ROUTE);
    for (const [, title] of SECTIONS) await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
    const figure = page.locator('figure[data-figure="marketingws-steps"]');
    for (const name of STEPS) await expect(figure.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByText(GROQ_NOTE, { exact: true })).toBeVisible();
    await context.close();
  });

  test('reflow at 320 px: the document never scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(ROUTE);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
