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
const SECTIONS = [
  ['where-it-stands', 'Where the test stands'],
  ['plan', 'The plan'],
  ['funnel', 'From beacons to analysed views'],
  ['split-check', 'The split check'],
  ['detectable', 'What this many views can detect'],
  ['results', 'Results'],
  ['decision', 'Decision and end'],
  ['check-it-yourself', 'Check it yourself'],
  ['colophon', 'Colophon'],
] as const;

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
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Live test');
    const sections = await page.evaluate(() =>
      [...document.querySelectorAll('main section[id]')].map((s) => [s.id, s.querySelector(':scope > h2')?.textContent?.trim()]),
    );
    expect(sections).toEqual(SECTIONS.map(([id, title]) => [id, title]));
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
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Live test');
    await expect(page.locator('table:has(#live-funnel-table-caption)')).toBeVisible();
    await expect(page.locator('#colophon-results')).toHaveText('Test and audit results are added when the site is deployed.');
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
