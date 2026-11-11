import { expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { auditHtml } from '../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS } from '../../src/lib/facts/facts.generated.ts';
import { HOME_LINKS } from '../../content/home-destinations.ts';
import { dotGeometry } from './curse-geometry';
import { expectNoA11yViolations, test, waitForIslands } from './fixtures';

// The Lab's two static routes: /lab, four worked examples as one reading page (sections
// #sample-size, #peeking-at-results, #split-check and #exaggeration, then #limits), and /lab/peeking,
// the peeking Figure alone for the interview link `?peeking.preset=interview`. Every Figure is
// simulated or computed from values the visitor sets. The server draws each preset with its open
// table; each island loads on intent, or at once for its own URL keys. Nothing on either page reads
// the live experiment or sends a beacon.

const LAB = '/lab';
const PEEKING = '/lab/peeking';
const INTERVIEW = '/lab/peeking?peeking.preset=interview';
const SECTIONS = [
  ['sample-size', 'Sample size and duration'],
  ['peeking-at-results', 'Peeking at results'],
  ['split-check', 'Split check'],
  ['exaggeration', 'Exaggeration'],
  ['limits', 'Limits'],
] as const;
const FIGURES = [
  ['sample-size', 'planner'],
  ['sample-size', 'duration'],
  ['peeking-at-results', 'peeking'],
  ['split-check', 'srm'],
  ['exaggeration', 'curse'],
] as const;
const PEEK_PRESET_LINE = /^Under these simulation assumptions, 22\.1% of 1,000 runs found a false winner by look 20 /;
const CHUNK_ERRORS = ['chunk', 'Chunk', 'Failed to fetch', 'dynamically imported module', 'Importing a module script failed'];

const figure = (page: Page, id: string) => page.locator(`figure[data-figure="${id}"]`);
const island = (page: Page, id: string) => page.locator('[data-island]', { has: figure(page, id) });
const result = (page: Page, id: string) => figure(page, id).locator('[data-figure-result]');
const audit = (html: string, route: string) =>
  auditHtml(html, { route, factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] });

async function withoutIdle(page: Page) {
  await page.addInitScript(() => {
    window.requestIdleCallback = () => 0;
    window.cancelIdleCallback = () => {};
  });
}

function watchErrors(page: Page, expected: readonly string[] = []) {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    if (!expected.some((e) => error.message.includes(e))) errors.push(error.message);
  });
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() !== 'error' || text.startsWith('Failed to load resource')) return;
    if (!expected.some((e) => text.includes(e))) errors.push(text);
  });
  return errors;
}

/**
 * The hydrated page's truth: the audit over the serialized DOM, plus what serialization does not
 * carry or the audit does not read: each input's live value, and every accessible-name, value-text
 * and title string with a digit must sit under a source marker.
 */
async function auditLive(page: Page, route: string, when: string) {
  expect(audit(await page.content(), route), `${route} ${when}`).toEqual([]);
  const stray = await page.evaluate(() => {
    const out: string[] = [];
    const main = document.querySelector('main')!;
    for (const input of main.querySelectorAll('input')) {
      if (input.type !== 'hidden' && /\d/.test(input.value) && !input.closest('[data-derived], [data-fact]')) out.push(`value=${input.value}`);
    }
    for (const el of main.querySelectorAll('*')) {
      for (const name of ['aria-label', 'aria-valuetext', 'aria-description', 'title', 'alt', 'placeholder']) {
        const v = el.getAttribute(name);
        if (v && /\d/.test(v) && !el.closest('[data-derived], [data-fact]')) out.push(`${name}=${v}`);
      }
    }
    if (/\bInfinity\b|\bNaN\b/.test(main.innerText)) out.push('a non-finite value in the text');
    return out;
  });
  expect(stray, `${route} ${when}`).toEqual([]);
}

async function noHorizontalScroll(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

/** Moves the first slider of a Figure one step with the keyboard (the key release commits it). */
async function nudge(page: Page, id: string, key = 'ArrowRight') {
  await figure(page, id).locator('input[type="range"]').first().focus();
  await page.keyboard.press(key);
}

test.describe('the Lab routes', () => {
  test('both routes, both Home destinations and the interview link answer with HTML that may be indexed', async ({ request }) => {
    for (const path of [LAB, PEEKING, INTERVIEW, HOME_LINKS.lab, HOME_LINKS.retention]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()['content-type'], path).toContain('text/html');
      const html = await response.text();
      expect(html, path).not.toMatch(/<meta name="robots" content="[^"]*noindex/);
      expect(response.headers()['x-robots-tag'] ?? '', path).not.toMatch(/noindex/);
    }
  });

  test('outline: one h1 Lab, the examples linked in order with what each is for, a section and h2 each, no skipped level', async ({ page }) => {
    const response = await page.goto(LAB);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle('Lab');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lab');
    for (const role of ['banner', 'main', 'contentinfo'] as const) await expect(page.getByRole(role)).toHaveCount(1);
    await expect(page.locator('main')).toContainText('I use these examples to show what a test can and cannot tell me.');
    const nav = page.getByRole('navigation', { name: 'On this page' });
    await expect(nav.getByRole('link')).toHaveText(SECTIONS.slice(0, 4).map(([, title]) => title));
    expect(await nav.locator('li').evaluateAll((items) => items.map((li) => li.querySelector('p')?.textContent?.trim().length ?? 0))).toEqual([
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    ]);
    for (const [id, title] of SECTIONS) await expect(page.getByRole('region', { name: title, exact: true })).toHaveAttribute('id', id);
    const layout = await page.evaluate(() => ({
      figures: [...document.querySelectorAll('main figure[data-figure]')].map((f) => [f.closest('section[id]')?.id, f.getAttribute('data-figure')]),
      levels: [...document.querySelectorAll('main h1, main h2, main h3')].map((h) => Number(h.tagName.slice(1))),
    }));
    expect(layout.figures).toEqual(FIGURES.map(([s, f]) => [s, f]));
    expect(layout.levels.every((l, i) => i === 0 || l <= layout.levels[i - 1]! + 1), layout.levels.join(' ')).toBe(true);
    expect(await page.locator('#limits li').count()).toBeGreaterThanOrEqual(2);
  });

  test('a section link lands its heading below the header, and /lab#peeking lands the peeking Figure', async ({ page }) => {
    await page.goto(LAB);
    await page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Split check' }).click();
    await expect(page).toHaveURL(/#split-check$/);
    await expect(page.locator('#split-check-title')).toBeInViewport();
    const covered = await page.locator('#split-check-title').evaluate((h) => {
      const header = document.querySelector('[data-site-header]')!;
      const r = h.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 4, r.top + r.height / 2);
      return hit !== null && header.contains(hit);
    });
    expect(covered).toBe(false);
    await page.goto(`${LAB}#peeking`);
    await waitForIslands(page);
    await expect(figure(page, 'peeking').getByRole('heading', { level: 3 })).toBeInViewport();
  });

  test('every Figure is badged Simulated, its open table is in the served HTML, and no id repeats', async ({ page, request }) => {
    for (const path of [LAB, PEEKING]) {
      const served = await (await request.get(path)).text();
      const ids = path === LAB ? FIGURES.map(([, f]) => f) : ['peeking'];
      for (const id of ids) {
        const start = served.indexOf(`data-figure="${id}"`);
        expect(start, `${path} ${id}`).toBeGreaterThan(-1);
        const own = served.slice(start, served.indexOf('</figure>', start));
        expect(own, `${path} ${id}`).toContain('Simulated');
        expect(own, `${path} ${id}`).not.toMatch(/Public data|Live from this site/);
        expect(own, `${path} ${id}`).toMatch(/data-nojs-only=""[^>]*data-figure-tables=""[\s\S]*?<tbody>[\s\S]*?<td/);
      }
      await page.goto(path);
      await waitForIslands(page);
      const repeated = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
        return ids.filter((id, i) => ids.indexOf(id) !== i);
      });
      expect(repeated, path).toEqual([]);
      // the Figure's own badge (planner Figures also repeat it beside their result line)
      for (const id of ids) await expect(figure(page, id).getByText('Simulated', { exact: true }).first()).toBeVisible();
    }
  });

  test('the peeking page: the same Figure under the heading Lab, a link back, and the interview link loads its island at once', async ({ page }) => {
    await withoutIdle(page);
    const errors = watchErrors(page);
    await page.goto(INTERVIEW);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lab');
    await expect(page.locator('main figure[data-figure]')).toHaveCount(1);
    await expect(island(page, 'peeking')).toHaveAttribute('data-island', 'ready');
    // the interview preset is the default view: daily, 20 looks, no fix
    await expect(result(page, 'peeking')).toHaveText(PEEK_PRESET_LINE);
    await expect(figure(page, 'peeking').getByRole('slider', { name: 'Looks' })).toHaveValue('20');
    await expect(figure(page, 'peeking').getByRole('radio', { name: 'Peek daily' })).toBeChecked();
    await expect(figure(page, 'peeking').getByRole('radio', { name: 'None' })).toBeChecked();
    await page.getByRole('link', { name: 'All the examples in the Lab' }).click();
    await expect(page).toHaveURL(/\/lab$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lab');
    expect(errors).toEqual([]);
  });

  test("own query: a Figure's keys load only its island, the others wait for intent", async ({ page }) => {
    await withoutIdle(page);
    await page.goto(`${LAB}?srm.nA=40`);
    await expect(island(page, 'srm')).toHaveAttribute('data-island', 'ready');
    await page.waitForTimeout(800);
    for (const id of ['planner', 'peeking', 'curse']) await expect(island(page, id), id).toHaveAttribute('data-island', 'idle');
    await page.goto(`${LAB}?peeking.looks=5`);
    await expect(island(page, 'peeking')).toHaveAttribute('data-island', 'ready');
    await page.waitForTimeout(800);
    for (const id of ['planner', 'srm', 'curse']) await expect(island(page, id), id).toHaveAttribute('data-island', 'idle');
  });

  test('without JavaScript: every preset with its open table, whatever the query, and no controls', async ({ browser }) => {
    const context = await (browser as Browser).newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${LAB}?planner.baseline=0.6&peeking.looks=50&srm.nA=7&curse.se=3`);
    for (const [, title] of SECTIONS) await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
    for (const [, id] of FIGURES) {
      const f = figure(page, id);
      await expect(f.locator('[data-nojs-only] table'), id).toBeVisible();
      await expect(f.locator('details'), id).toBeHidden();
      await expect(f.getByText('Controls need JavaScript.'), id).toBeVisible();
    }
    await expect(figure(page, 'planner').locator('[data-planner-n]')).toHaveText('1,353');
    await expect(result(page, 'peeking')).toHaveText(PEEK_PRESET_LINE);
    await page.goto(INTERVIEW);
    await expect(figure(page, 'peeking').locator('[data-nojs-only] table')).toBeVisible();
    await expect(result(page, 'peeking')).toHaveText(PEEK_PRESET_LINE);
    await context.close();
  });

  test('every local link in the content resolves: in-page anchors exist, other pages answer 200 with their anchor', async ({ page, request }) => {
    for (const path of [LAB, PEEKING, '/work/retention']) {
      await page.goto(path);
      const hrefs = await page.locator('main a[href]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')!))]);
      const local = hrefs.filter((h) => h.startsWith('#') || (h.startsWith('/') && !h.startsWith('//')));
      expect(local.length, path).toBeGreaterThan(path === PEEKING ? 0 : 3);
      for (const href of local) {
        const url = new URL(href, `http://site.test${path}`);
        if (url.pathname === path) {
          if (url.hash) await expect(page.locator(`[id="${decodeURIComponent(url.hash.slice(1))}"]`), `${path} ${href}`).toHaveCount(1);
          continue;
        }
        const response = await request.get(url.pathname + url.search);
        expect(response.status(), `${path} ${href}`).toBe(200);
        if (url.hash) expect(await response.text(), `${path} ${href}`).toContain(`id="${url.hash.slice(1)}"`);
      }
    }
  });

  test('the hydrated pages stay true after each control, an error and Reset; no number leaves its source marker', async ({ page }) => {
    test.slow();
    const errors = watchErrors(page);
    await page.goto(LAB);
    await auditLive(page, LAB, 'served preview');
    await waitForIslands(page);
    await auditLive(page, LAB, 'islands loaded');
    // the planner: the unit switch, both sliders and the traffic
    await figure(page, 'planner').locator('label', { hasText: 'Percent of baseline' }).click();
    await nudge(page, 'planner');
    await figure(page, 'planner').locator('input[type="range"]').nth(1).focus();
    await page.keyboard.press('ArrowRight');
    await nudge(page, 'duration');
    await auditLive(page, LAB, 'planner in percent');
    // peeking: once, then daily with each fix
    await figure(page, 'peeking').locator('label', { hasText: 'Look once' }).click();
    await auditLive(page, LAB, 'peeking once');
    await figure(page, 'peeking').locator('label', { hasText: 'Peek daily' }).click();
    for (const fix of ["O'Brien-Fleming", 'Confidence sequence']) {
      await figure(page, 'peeking').locator('label', { hasText: fix }).click();
      await nudge(page, 'peeking', 'End');
      await auditLive(page, LAB, `peeking ${fix} at 50 looks`);
    }
    // the split check and exaggeration, at their ends
    await nudge(page, 'srm', 'Home');
    await nudge(page, 'curse', 'Home');
    await auditLive(page, LAB, 'split and exaggeration at the low ends');
    // every Reset
    for (const id of ['planner', 'duration', 'peeking', 'srm', 'curse']) await figure(page, id).getByRole('button', { name: 'Reset' }).click();
    await expect(result(page, 'peeking')).toHaveText(PEEK_PRESET_LINE);
    await auditLive(page, LAB, 'after every Reset');
    expect(errors).toEqual([]);

    await page.goto(INTERVIEW);
    await expect(island(page, 'peeking')).toHaveAttribute('data-island', 'ready');
    await auditLive(page, PEEKING, 'interview link');
  });

  test('the hydrated pages stay true when the islands fail to load (the presets come back) and when a chart throws', async ({ page }) => {
    test.slow();
    await withoutIdle(page);
    watchErrors(page, CHUNK_ERRORS);
    let block = false;
    await page.route('**/_next/static/**/*.js', (route) => (block ? route.abort() : route.continue()));
    await page.goto(LAB);
    await page.waitForLoadState('load');
    await page.waitForTimeout(500);
    block = true;
    for (const [, id] of FIGURES) {
      if (id === 'duration') continue;
      await figure(page, id).locator('h3').hover();
      await expect(page.locator('[data-island="failed"]', { has: figure(page, id) }), id).toHaveCount(1);
    }
    await auditLive(page, LAB, 'every island failed');
    await page.unroute('**/_next/static/**/*.js');

    // A chart that throws after a change (the test hosts set the seam; the routes cannot).
    for (const [host, id] of [
      ['/kitchen-sink/lab/faults', 'planner'],
      ['/kitchen-sink/lab/peeking/faults', 'peeking'],
      ['/kitchen-sink/lab/diagnostics/faults', 'srm'],
      ['/kitchen-sink/lab/diagnostics/faults', 'curse'],
    ] as const) {
      await page.goto(host);
      await figure(page, id).locator('h3').hover();
      await expect(island(page, id)).toHaveAttribute('data-island', 'ready');
      await nudge(page, id);
      await expect(figure(page, id).locator('[data-figure-fallback] table')).toBeVisible();
      await auditLive(page, host, `${id} fallback`);
    }
  });

  test('the exaggeration dot at ratio 50 keeps its whole ring on the real page at 320, 375 and 1440 px', async ({ page }) => {
    test.slow();
    for (const width of [320, 375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${LAB}?curse.trueEffect=5&curse.se=0.1#exaggeration`);
      await expect(island(page, 'curse')).toHaveAttribute('data-island', 'ready');
      await figure(page, 'curse').scrollIntoViewIfNeeded();
      const dot = await dotGeometry(page);
      expect(dot, String(width)).not.toBeNull();
      expect(dot!.ratio).toBe(50);
      expect(dot!.centreInPlot, String(width)).toBe(true);
      expect(dot!.atRightEdge, String(width)).toBe(true);
      expect(dot!.clippedBy, String(width)).toEqual([]);
      expect(dot!.inViewport, String(width)).toBe(true);
      expect(dot!.ring, String(width)).toEqual({ stroke: expect.not.stringMatching(/^none$/), width: '4px', order: expect.stringContaining('stroke') });
      await noHorizontalScroll(page);
    }
  });

  test('reflow at 320 px: neither page scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    for (const path of [LAB, PEEKING]) {
      await page.goto(path);
      await waitForIslands(page);
      await noHorizontalScroll(page);
    }
  });

  test('axe finds nothing on either page, with every island loaded', async ({ page }) => {
    test.slow();
    for (const path of [LAB, PEEKING]) {
      await page.goto(path);
      await waitForIslands(page);
      await page.evaluate(() => document.fonts.ready);
      await expectNoA11yViolations(page);
    }
  });

  test('nothing of the live experiment: no beacon, no live marker, no request to the experiment endpoints', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    for (const path of [LAB, INTERVIEW]) {
      await page.goto(path);
      await waitForIslands(page);
      await expect(page.locator('[data-experiment], [data-phase], [data-live]')).toHaveCount(0);
    }
    await page.goto('about:blank');
    expect(requests.filter((p) => p.startsWith('/api/') || p.startsWith('/experiment'))).toEqual([]);
  });
});
