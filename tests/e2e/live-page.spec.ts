import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { auditHtml } from '../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS } from '../../src/lib/facts/facts.generated.ts';
import { expectNoA11yViolations, test } from './fixtures';

// The Live test page at /experiment, built from the e2e store (the local fake) like the home page.
// It is static and regenerates every 5 minutes; it sends no beacon and polls nothing. The fake has
// no reset and other tests count views in parallel, so nothing here asserts a total: it checks the
// page's structure, that its counts follow the published-cell rule, and that what the browser
// receives (the HTML with its serialized React payload) holds no exact count from 1 to 4.

const ROUTE = '/experiment';
const H1 = 'A real A/B test on this site, run in the open.';
// The ruled sections with an id, in page order, each with its h2. The result's h2 is "Result so far"
// until a decision is recorded, then "Result". The close and the call to action are sections without
// an id; the split check, the detectable lift and the decision are anchors inside their sections.
const SECTIONS = [
  ['status', /^Where the test stands$/],
  ['results', /^Result( so far)?$/],
  ['plan', /^The plan, fixed before the start$/],
  ['health', /^Is the test healthy\?$/],
  ['funnel', /^How views are counted$/],
  ['check-it-yourself', /^Check it yourself$/],
  ['colophon', /^How this site is built$/],
] as const;
const ANCHORS = ['where-it-stands', 'decision', 'split-check', 'detectable'] as const;

test.describe('the Live test page', () => {
  test('is in the prerender manifest at 300 s', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), '.next/prerender-manifest.json'), 'utf8')) as {
      routes: Record<string, { initialRevalidateSeconds?: number | false }>;
    };
    expect(manifest.routes[ROUTE]?.initialRevalidateSeconds).toBe(300);
  });

  test('renders its sections in order, sends no beacon and polls nothing', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(H1);
    const sections = await page.evaluate(() =>
      [...document.querySelectorAll('main section[id]')].map((s) => [s.id, s.querySelector(':scope > h2')?.textContent?.trim() ?? ''] as [string, string]),
    );
    expect(sections.map(([id]) => id)).toEqual(SECTIONS.map(([id]) => id));
    sections.forEach(([id, title], i) => expect(title, id).toMatch(SECTIONS[i]![1]));
    for (const id of ANCHORS) await expect(page.locator(`#${id}`), id).toHaveCount(1);
    // The first screen: the status card with its three steps (at most one current), then four key points.
    await expect(page.locator('[data-live-track] > li')).toHaveText([/^Calibration/, /^A\/B test/, /^Decision/]);
    expect(await page.locator('[data-live-track] > li[aria-current="step"]').count()).toBeLessThanOrEqual(1);
    await expect(page.locator('[data-key-points] [data-key-title]')).toHaveText(['What is tested', 'Where it stands', /^What I expect(ed)?$/, 'Why run it then']);
    await expect(page.getByRole('navigation', { name: 'On this page' }).getByRole('link')).toHaveCount(5);
    await expect(page.getByRole('heading', { level: 2, name: 'What this shows about how I work' })).toBeVisible();
    await page.waitForTimeout(3_000);
    expect(requests.filter((p) => p === '/api/e')).toEqual([]);
    expect(requests.filter((p) => p.endsWith('data.json'))).toEqual([]);
  });

  test('links the published data, which is valid experiment data', async ({ page, request }) => {
    await page.goto(ROUTE);
    const link = page.getByRole('link', { name: 'Download the data (data.json)' });
    await expect(link).toHaveAttribute('href', '/experiment/data.json');
    const data = (await (await request.get('/experiment/data.json')).json()) as { schema: string };
    expect(data.schema).toBe('experiment-data/1');
  });

  test('the served HTML, with its React payload, holds no snapshot field, own-view mark or quota claim', async ({ request }) => {
    const html = await (await request.get(ROUTE)).text();
    // The serialized React payload is in the HTML's scripts. A leaked count would arrive as rendered
    // text: the next test checks every count cell, and the unit tests check every client prop.
    expect(html).not.toMatch(/\\?"(nA|nB|yourViewN|kitSnapshot|chi2|p)\\?":\s*[1-4]\b/);
    expect(html).not.toContain('yourViewN');
    expect(html).not.toContain('data-your-view');
    expect(html).not.toMatch(/Infinity|NaN/);
    expect(html).not.toMatch(/under half|quota/i);
    expect(auditHtml(html, { route: ROUTE, factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] })).toEqual([]);
  });

  test('every count cell is 0, "<5" or at least 5', async ({ page }) => {
    await page.goto(ROUTE);
    const cells = await page.evaluate(() =>
      [...document.querySelectorAll('#funnel td[data-derived], #results td[data-derived]')]
        .filter((td) => !/build/.test(td.getAttribute('data-derived') ?? ''))
        .map((td) => td.textContent?.trim() ?? ''),
    );
    for (const c of cells) {
      if (/^[\d,]+$/.test(c)) expect(Number(c.replace(/,/g, '')) === 0 || Number(c.replace(/,/g, '')) >= 5, c).toBe(true);
    }
  });

  test('without JavaScript the tables are open and the page reads the same', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(H1);
    await expect(page.locator('table:has(#live-funnel-table-caption)')).toBeVisible();
    // The method rows are native details: closed, they open without JavaScript.
    await page.locator('details[data-method] > summary', { hasText: 'Pre-registration record' }).click();
    await expect(page.locator('#plan-prereg')).toBeVisible();
    // This build has no test and audit results, so the colophon is its stack line alone.
    await expect(page.locator('#colophon-stack')).toHaveText(/^Built with Next\.js /);
    await expect(page.locator('#colophon-results')).toHaveCount(0);
    await context.close();
  });

  test('has no axe violations', async ({ page }) => {
    await page.goto(ROUTE);
    await expectNoA11yViolations(page);
  });

  test('reflows at 320 px without horizontal scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(ROUTE);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
