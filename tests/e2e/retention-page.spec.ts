import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { auditHtml } from '../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS } from '../../src/lib/facts/facts.generated.ts';
import { expectNoA11yViolations, test, waitForIslands } from './fixtures';
import { auditLive } from './truth-live';

// The Retention case study at /work/retention, the reference page later pages copy, and its dev
// host /kitchen-sink/retention, which mounts the same composition. The page is static: prose,
// four public-data Figures (each loads its island on intent, or at once for its own URL keys), two
// open tables, the win-back planner (a hypothetical uplift, two simulated Figures loaded as one
// island) and a list of links. Nothing on it comes from the live experiment.

const ROUTE = '/work/retention';
const HOST = '/kitchen-sink/retention';
const TITLE = 'Customer retention and reactivation analysis';
const SECTIONS = [
  ['summary', 'Summary'],
  ['problem', 'The problem'],
  ['data', 'The data'],
  ['method', 'Method'],
  ['returns-cleaning', 'Cleaning: reversed orders and returns'],
  ['cohort-retention', 'Cohorts: who orders again, month by month'],
  ['customer-segments', 'Customer segments'],
  ['repeat-order-model', 'A model of who orders again'],
  ['win-back-sizing', 'Sizing a win-back test'],
  ['findings', 'Findings'],
  ['how-i-checked-this', 'How I checked this'],
  ['limits', 'Limits'],
  ['sources', 'Sources and links'],
] as const;
const LINKS = ['Problem', 'Data', 'Method', 'Cleaning', 'Cohorts', 'Segments', 'Model', 'Win-back sizing', 'Findings', 'How I checked this', 'Limits', 'Sources'];
const FIGURES = ['returns', 'cohorts', 'rfm', 'models', 'winback', 'winback-duration'];
// The Figures that load an island: returns, cohorts and the win-back planner pair.
const ISLANDS = 3;

const sectionLinks = (page: Page) => page.getByRole('navigation', { name: 'On this page' }).getByRole('link');

/** What a page is made of: its sections with their headings, its Figures and its tables, in order. */
function composition(page: Page) {
  return page.evaluate(() => ({
    h1: [...document.querySelectorAll('main h1')].map((h) => h.textContent?.trim()),
    sections: [...document.querySelectorAll('main section[id]')].map((s) => [s.id, s.querySelector(':scope > h2')?.textContent?.trim()]),
    headings: [...document.querySelectorAll('main h2, main h3')].map((h) => `${h.tagName} ${h.textContent?.trim()}`),
    figures: [...document.querySelectorAll('main figure[data-figure]')].map((f) => [f.closest('section[id]')?.id, f.getAttribute('data-figure')]),
    tables: [...document.querySelectorAll('main table caption')].map((c) => c.textContent?.trim()),
    links: [...document.querySelectorAll('main a[href]')].map((a) => a.getAttribute('href')),
  }));
}

test.describe('the Retention page', () => {
  test('outline: one h1, the sections in template order, landmarks once each, no skipped heading level', async ({ page }) => {
    const response = await page.goto(ROUTE);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(TITLE);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE);
    for (const role of ['banner', 'main', 'contentinfo'] as const) await expect(page.getByRole(role)).toHaveCount(1);
    const { sections, headings } = await composition(page);
    expect(sections).toEqual(SECTIONS.map(([id, title]) => [id, title]));
    for (const [id, title] of SECTIONS) {
      await expect(page.getByRole('region', { name: title, exact: true })).toHaveAttribute('id', id);
    }
    // h1, then h2 sections; no level is skipped and nothing goes below h3 (Figure and table titles)
    const levels = headings.map((h) => Number(h.slice(1, 2)));
    expect(levels[0]).toBe(2);
    expect(levels.every((l, i) => i === 0 || l <= levels[i - 1]! + 1), headings.join(' | ')).toBe(true);
    expect(Math.max(...levels)).toBe(3);
    // the figures sit in their analysis sections
    expect((await composition(page)).figures).toEqual([
      ['returns-cleaning', 'returns'],
      ['cohort-retention', 'cohorts'],
      ['customer-segments', 'rfm'],
      ['repeat-order-model', 'models'],
      ['win-back-sizing', 'winback'],
      ['win-back-sizing', 'winback-duration'],
    ]);
  });

  test('the dev host mounts the same composition as the route', async ({ page }) => {
    await page.goto(ROUTE);
    const route = await composition(page);
    await page.goto(HOST);
    const host = await composition(page);
    expect(host).toEqual(route);
    expect(route.figures.map(([, id]) => id)).toEqual(FIGURES);
  });

  test('section links: in page order, every target exists, and a link lands its heading below the header', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(sectionLinks(page)).toHaveText(LINKS);
    const hrefs = await sectionLinks(page).evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs).toEqual(SECTIONS.slice(1).map(([id]) => `#${id}`));
    for (const href of hrefs) await expect(page.locator(href!)).toHaveCount(1);

    await sectionLinks(page).filter({ hasText: 'Cleaning' }).click();
    await expect(page).toHaveURL(/#returns-cleaning$/);
    const heading = page.locator('#returns-cleaning-title');
    await expect(heading).toBeInViewport();
    const covered = await heading.evaluate((h) => {
      const header = document.querySelector('[data-site-header]')!;
      const r = h.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 4, r.top + r.height / 2);
      return hit !== null && header.contains(hit);
    });
    expect(covered, 'the heading is not under the sticky header').toBe(false);
  });

  test('keyboard: the section links are reached in order and Enter follows one', async ({ page, browserName }) => {
    // WebKit on macOS moves focus to links only with Alt+Tab (as in a11y.spec.ts).
    const key = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
    await page.goto(ROUTE);
    // Settle the page first, so no island swap overlaps the fragment scroll being measured.
    await waitForIslands(page);
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

  test('no section moves when the islands load', async ({ page }) => {
    // Hold the idle trigger, measure the server previews, then let the islands load. The islands ask
    // for idle time only once they have hydrated, which on a loaded machine can be after the release,
    // so a request that comes after it runs at once instead of waiting forever.
    await page.addInitScript(() => {
      const held: IdleRequestCallback[] = [];
      let released = false;
      const run = (cb: IdleRequestCallback) => cb({ didTimeout: false, timeRemaining: () => 50 });
      (window as unknown as { releaseIdle: () => void }).releaseIdle = () => {
        released = true;
        held.splice(0).forEach(run);
      };
      window.requestIdleCallback = (cb) => (released ? (setTimeout(() => run(cb), 0), 0) : (held.push(cb), held.length));
      window.cancelIdleCallback = () => {};
    });
    await page.goto(ROUTE);
    const tops = () => page.evaluate(() => [...document.querySelectorAll('main section[id]')].map((s) => [s.id, (s as HTMLElement).offsetTop]));
    await expect(page.locator('[data-island="idle"]')).toHaveCount(ISLANDS);
    const before = await tops();
    await page.evaluate(() => (window as unknown as { releaseIdle: () => void }).releaseIdle());
    await waitForIslands(page);
    await expect(page.locator('[data-island="ready"]')).toHaveCount(ISLANDS);
    expect(await tops()).toEqual(before);
  });

  // A cold link to a section must land on its heading and leave it there: no scroll may move the
  // view while the page hydrates and the islands load. Every frame from the load event on records
  // where the heading is; all of them must be the landing position. #limits sits near the end of the
  // page, #how-i-checked-this above it and #returns-cleaning at the first island, so this is not tuned
  // to one section.
  const SECTION_LINKS = ['limits', 'how-i-checked-this', 'returns-cleaning'] as const;

  /** Records the heading's top in every frame from the load event on. */
  async function recordHeading(page: Page, id: string) {
    await page.addInitScript((heading) => {
      const tops: number[] = [];
      (window as unknown as { headingTops: number[] }).headingTops = tops;
      window.addEventListener('load', () => {
        const sample = () => {
          const h = document.getElementById(heading);
          if (h) tops.push(Math.round(h.getBoundingClientRect().top));
          requestAnimationFrame(sample);
        };
        sample();
      });
    }, `${id}-title`);
  }

  async function expectHeadingStill(page: Page, id: string) {
    // A few more frames, for a late scroll to show.
    await page.evaluate(() => new Promise((done) => {
      let n = 0;
      const next = () => (++n < 10 ? requestAnimationFrame(next) : done(null));
      requestAnimationFrame(next);
    }));
    const tops = await page.evaluate(() => (window as unknown as { headingTops: number[] }).headingTops);
    expect(tops.length).toBeGreaterThan(10);
    expect(new Set(tops), `heading top per frame after load: ${tops.join(' ')}`).toEqual(new Set([tops[0]]));
    await expect(page.locator(`#${id}-title`)).toBeInViewport();
  }

  for (const id of SECTION_LINKS) {
    test(`a cold #${id} link keeps its heading still while the page hydrates`, async ({ page }) => {
      // The islands are held (no idle time ever comes), so this covers hydration alone.
      await page.addInitScript(() => {
        window.requestIdleCallback = () => 0;
        window.cancelIdleCallback = () => {};
      });
      await recordHeading(page, id);
      await page.goto(`${ROUTE}#${id}`);
      await page.locator('next-route-announcer').waitFor({ state: 'attached' });
      await page.waitForTimeout(500);
      await expect(page.locator('[data-island="idle"]')).toHaveCount(ISLANDS);
      await expectHeadingStill(page, id);
    });

    test(`a cold #${id} link keeps its heading still while the islands load`, async ({ page }) => {
      await recordHeading(page, id);
      await page.goto(`${ROUTE}#${id}`);
      await waitForIslands(page);
      await expectHeadingStill(page, id);
    });
  }

  test('axe finds nothing, with every island loaded', async ({ page }) => {
    await page.goto(ROUTE);
    await waitForIslands(page);
    await page.evaluate(() => document.fonts.ready);
    await expectNoA11yViolations(page);
  });

  test('the served and the hydrated page pass the truth audit and show nothing of the live test', async ({ page, request }) => {
    const ctx = { route: ROUTE, factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] };
    const served = await (await request.get(ROUTE)).text();
    expect(auditHtml(served, ctx)).toEqual([]);
    await page.goto(ROUTE);
    await waitForIslands(page);
    expect(auditHtml(await page.content(), ctx)).toEqual([]);

    const visible = await page.locator('body').innerText();
    const names = await page.evaluate(() =>
      [...document.querySelectorAll('[aria-label], [aria-description], [title], img[alt]')]
        .map((el) => [el.getAttribute('aria-label'), el.getAttribute('aria-description'), el.getAttribute('title'), el.getAttribute('alt')].filter(Boolean).join(' '))
        .join(' '),
    );
    // nothing of the live test, in the text or an accessible name
    expect(visible).not.toMatch(/paused|A\/A|calibration run/i);
    expect(names).not.toMatch(/paused|A\/A|calibration run/i);
    expect(visible).toContain('public dataset, rebuilt in 2026');
    expect(visible).toContain('I sized a possible holdout test; nobody was contacted and no test was run.');
    // the planner beside it is a hypothetical uplift, simulated, on the observed reactivation baseline
    for (const id of ['winback', 'winback-duration']) {
      await expect(page.locator(`figure[data-figure="${id}"] [data-figure-result]`)).toContainText('Hypothetical uplift');
      // the Figure's own badge (and the one beside its result line)
      await expect(page.locator(`figure[data-figure="${id}"]`).getByText('Simulated', { exact: true }).first()).toBeVisible();
    }
    await expect(page.locator('figure[data-figure="winback"] [data-planner-n]')).toHaveText('1,353');
    // no raw Home model in the page or its payload
    expect(served).not.toMatch(/splitStatus|testNote/);
  });

  test('the hydrated page stays true after the win-back planner is used: each slider, the unit and both Resets', async ({ page }) => {
    test.slow();
    await page.goto(ROUTE);
    await waitForIslands(page);
    await auditLive(page, ROUTE, 'islands loaded');
    const sizing = page.locator('figure[data-figure="winback"]');
    const duration = page.locator('figure[data-figure="winback-duration"]');
    // both sizing sliders and the traffic, each one step by key (the key release commits)
    for (const [f, name] of [[sizing, 'Baseline conversion'], [sizing, 'Rise to detect'], [duration, 'Total customers per day']] as const) {
      await f.getByRole('slider', { name }).focus();
      await page.keyboard.press('ArrowRight');
    }
    await expect(sizing.locator('[data-figure-result]')).toContainText('from 30% to 36%.');
    await expect(sizing.locator('[data-figure-announcement]')).not.toHaveText('');
    await expect(duration.locator('[data-figure-announcement]')).not.toHaveText('');
    await auditLive(page, ROUTE, 'baseline, rise and traffic moved');
    await sizing.locator('label', { hasText: 'Percent of baseline' }).click();
    await expect(sizing.locator('[data-figure-result]')).toContainText('of the baseline, from 30% to 36%.');
    await auditLive(page, ROUTE, 'rise shown in percent of the baseline');
    for (const f of [sizing, duration]) await f.getByRole('button', { name: 'Reset' }).click();
    await expect(sizing.locator('[data-figure-result]')).toContainText('To detect a rise of 5 points, from 29% to 34%.');
    await expect(sizing.locator('[data-figure-body] [data-planner-n]')).toHaveText('1,353');
    await auditLive(page, ROUTE, 'after both Resets');
  });

  test('nothing of the live experiment: no beacon, no live note, no request to the experiment endpoints', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    await page.goto(ROUTE);
    await waitForIslands(page);
    await expect(page.locator('[data-experiment], [data-phase]')).toHaveCount(0);
    expect(requests.filter((p) => p.startsWith('/api/') || p.startsWith('/experiment'))).toEqual([]);
  });

  test('without JavaScript: every section, every Figure with its open table, and both sizing tables', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(ROUTE);
    for (const [, title] of SECTIONS) await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
    for (const id of FIGURES) {
      const f = page.locator(`figure[data-figure="${id}"]`);
      await expect(f.locator('[data-nojs-only] table')).toBeVisible();
      await expect(f.locator('details')).toBeHidden();
    }
    for (const id of ['holdout-sizes', 'lapsed-targeting']) await expect(page.locator(`[aria-labelledby="${id}-caption"] table`)).toBeVisible();
    await expect(page.getByRole('region', { name: 'The reversal rule in SQL' })).toBeVisible();
    await context.close();
  });

  test('print: every section heading, the SQL and the sizing tables print, and nothing overflows the page', async ({ page }) => {
    await page.goto(ROUTE);
    await page.emulateMedia({ media: 'print' });
    for (const [, title] of SECTIONS) await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
    for (const id of ['holdout-sizes', 'lapsed-targeting']) await expect(page.locator(`[aria-labelledby="${id}-caption"] table`)).toBeVisible();
    await expect(page.getByRole('region', { name: 'The reversal rule in SQL' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('reflow at 320 px: the document never scrolls sideways; the SQL scrolls inside its own region', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(ROUTE);
    await waitForIslands(page);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const sql = page.getByRole('region', { name: 'The reversal rule in SQL' });
    await expect(sql).toHaveAttribute('tabindex', '0');
    expect(await sql.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  });
});
