import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { FACTS, FACT_DISPLAYS } from '../../src/lib/facts/facts.generated.ts';
import { auditHtml } from '../../scripts/truth-audit.ts';
import { expectNoA11yViolations, test } from './fixtures';

// The Pulse case study at /work/pulse and its local dashboard (Figure `pulse`). The server draws the
// preset (all channels over 30d) with an empty event list; the island loads on intent, or at once when
// the URL holds `pulse.` keys, and then sends one Viewed Dashboard. Each action sends its event, with
// the export's name and properties, to a list in the page's memory; nothing leaves the browser.
// /kitchen-sink/pulse/faults sets the test seam, so the charts throw on the first render after a
// committed change.

const PAGE = '/work/pulse';
const FAULTS = '/kitchen-sink/pulse/faults';
const ID = 'pulse';
const TITLE = 'Each dashboard action sends one tracked event';
const SENTENCE = 'This chart could not load. The numbers are in the table below.';
const SEAM_FAILURE = 'The Pulse charts failed after a change (test seam)';
const SOURCE = JSON.parse(readFileSync(join(process.cwd(), 'data/sources/pulse.json'), 'utf8')) as {
  tables: { events: { name: string; fires_when: string; question: string; properties: string[] }[] };
};
const ctx = { route: PAGE, factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] };

const figure = (page: Page) => page.locator(`figure[data-figure="${ID}"]`);
const island = (page: Page) => page.locator('[data-island]', { has: figure(page) });
const result = (page: Page) => figure(page).locator('[data-figure-result]');
const live = (page: Page) => figure(page).locator('[data-figure-announcement]');
const badge = (page: Page) => figure(page).getByText('Simulated', { exact: true });
const events = (page: Page) => figure(page).locator('li[data-pulse-event]');
const query = (page: Page) => new URL(page.url()).searchParams;
const radio = (page: Page, name: 'channel' | 'range', value: string) => page.locator(`#${ID}-${name}-${value}`);
const segment = (page: Page, name: 'channel' | 'range', value: string) => figure(page).locator('label[data-segment]', { has: radio(page, name, value) });
const button = (page: Page, name: string) => figure(page).getByRole('button', { name, exact: true });

/** The stream as text, newest first. */
async function streamText(page: Page): Promise<string[]> {
  return (await events(page).allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').replace(/ :/g, ':').trim());
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

async function withoutIdle(page: Page) {
  await page.addInitScript(() => {
    window.requestIdleCallback = () => 0;
    window.cancelIdleCallback = () => {};
  });
}

async function ready(page: Page) {
  await figure(page).locator('h3').hover();
  await expect(island(page)).toHaveAttribute('data-island', 'ready');
}

const VIEWED = 'Viewed Dashboard prompt_version: demo-v1';

test.describe('Pulse case study', () => {
  test('without JavaScript: the taxonomy, the preset dashboard, the Simulated badge and the open table, whatever the query', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${PAGE}?${ID}.channel=email&${ID}.range=7d`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('7 events, each designed to answer a product question');
    const rows = page.locator('section#taxonomy table tbody tr');
    await expect(rows).toHaveCount(SOURCE.tables.events.length);
    await expect(figure(page).getByRole('heading', { level: 3 })).toHaveText(TITLE);
    await expect(result(page)).toHaveText('Showing all channels over the last 30d.');
    await expect(badge(page)).toBeVisible();
    await expect(figure(page).getByText('Controls need JavaScript.')).toBeVisible();
    await expect(figure(page).locator('[data-nojs-only] table tbody tr')).toHaveCount(30);
    await expect(figure(page).getByRole('group', { name: 'Controls' })).toBeHidden();
    await expect(figure(page).getByText('The list needs JavaScript: without it, this copy sends no events.')).toBeVisible();
    await expect(figure(page).getByText('No events yet.', { exact: false })).toBeHidden();
    await expect(button(page, 'Export CSV')).toBeHidden();
    await context.close();
  });

  test('hydrated: one Viewed Dashboard on load, not announced, the badge, and the same source questions', async ({ page }) => {
    await withoutIdle(page);
    const errors = watchErrors(page);
    await page.goto(PAGE);
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    await expect(events(page)).toHaveCount(0);
    await ready(page);
    await expect(events(page)).toHaveCount(1);
    expect(await streamText(page)).toEqual([VIEWED]);
    await expect(figure(page).locator('li[data-pulse-event] code', { hasText: 'demo-v1' })).toHaveAttribute('data-derived', 'simulated');
    await expect(live(page)).toHaveText('');
    await expect(badge(page)).toBeVisible();
    await expect(figure(page).getByText("Local demo prompt version: demo-v1. It is this copy's own value, not the original's.")).toBeVisible();
    // The taxonomy table after hydration: the export's rows, word for word, with no category column.
    const cells = await page.locator('section#taxonomy table tbody tr').evaluateAll((trs) =>
      trs.map((tr) => [...tr.querySelectorAll('td, th')].map((c) => c.textContent ?? '')),
    );
    expect(cells).toEqual(SOURCE.tables.events.map((e) => [e.name, e.fires_when, e.properties.join(', '), e.question]));
    expect(auditHtml(await page.content(), ctx)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('all seven actions send their exact events, announced once each, and nothing leaves the browser', async ({ page, baseURL }) => {
    const errors = watchErrors(page);
    const requests: string[] = [];
    await page.goto(PAGE);
    await ready(page);
    await page.waitForLoadState('networkidle');
    // The router's own prefetches of in-view links are not the dashboard's: everything else counts.
    page.on('request', (r) => {
      const h = r.headers();
      if (h['next-router-prefetch'] === undefined && h['rsc'] !== '1') requests.push(r.url());
    });

    await segment(page, 'channel', 'email').click();
    await expect(result(page)).toHaveText('Showing Email over the last 30d.');
    await expect(live(page)).toHaveText('Applied Filter sent. Showing Email.');
    await segment(page, 'range', '7d').click();
    await expect(result(page)).toHaveText('Showing Email over the last 7d.');
    await expect(live(page)).toHaveText('Changed Date Range sent. The charts show the new range.');
    await button(page, 'Detail: Sign-ups').click();
    await expect(button(page, 'Detail: Sign-ups')).toHaveAttribute('aria-expanded', 'true');
    await expect(figure(page).locator('#pulse-detail-sign_ups')).toBeVisible();
    await expect(live(page)).toHaveText('Viewed Chart Detail sent. The Sign-ups detail is open.');
    const download = page.waitForEvent('download');
    await button(page, 'Export CSV').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('pulse-dashboard.csv');
    const csv = readFileSync((await file.path())!, 'utf8').split('\n');
    expect(csv[0]).toBe('channel,range,day,sign_ups,trials_started');
    expect(csv).toHaveLength(8);
    expect(csv.slice(1).every((line) => line.startsWith('email,7d,'))).toBe(true);
    await expect(live(page)).toHaveText('Exported Report sent. The CSV file of the made-up numbers is downloading.');
    await expect(button(page, 'Load saved view')).toBeDisabled();
    await button(page, 'Save view').click();
    await expect(live(page)).toHaveText('Saved View sent. The current channel and range are saved on this page.');
    await expect(figure(page).locator('#pulse-load-reason')).toHaveText('Saved view: Email over the last 7d.');
    await segment(page, 'channel', 'search').click();
    await expect(result(page)).toHaveText('Showing Search over the last 7d.');
    await button(page, 'Load saved view').click();
    await expect(result(page)).toHaveText('Showing Email over the last 7d.');
    await expect(live(page)).toHaveText('Loaded Saved View sent. The saved channel and range are back.');

    expect(await streamText(page)).toEqual([
      'Loaded Saved View view_name: My view',
      'Applied Filter filter_type: channel value: search',
      'Saved View view_name: My view',
      'Exported Report format: csv',
      'Viewed Chart Detail chart: sign_ups',
      'Changed Date Range range: 7d',
      'Applied Filter filter_type: channel value: email',
      VIEWED,
    ]);
    const names = new Set((await events(page).evaluateAll((lis) => lis.map((li) => li.getAttribute('data-pulse-event')))) as string[]);
    expect([...names].sort()).toEqual(SOURCE.tables.events.map((e) => e.name).sort());

    // Nothing was requested from the network, nothing was stored and nothing names an analytics SDK.
    const origin = new URL(baseURL!).origin;
    expect(requests.filter((u) => /^https?:/.test(u))).toEqual([]);
    expect(requests.filter((u) => /amplitude/i.test(u))).toEqual([]);
    expect(await page.context().cookies()).toEqual([]);
    const stored = await page.evaluate(async () => ({
      local: localStorage.length,
      session: sessionStorage.length,
      idb: typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).length : 0,
      amplitude: Object.keys(window).filter((k) => /amplitude/i.test(k)),
    }));
    expect(stored).toEqual({ local: 0, session: 0, idb: 0, amplitude: [] });
    // No event history in the URL: only this Figure's two keys.
    expect([...new URL(page.url()).searchParams.keys()].sort()).toEqual([`${ID}.channel`, `${ID}.range`]);
    expect(new URL(page.url()).origin).toBe(origin);
    expect(errors).toEqual([]);
  });

  test('Reset clears the stream and the selection, then sends one new Viewed Dashboard; only its own keys go', async ({ page }) => {
    await page.goto(`${PAGE}?${ID}.range=90d&other.key=1#dashboard`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(result(page)).toHaveText('Showing all channels over the last 90d.');
    await segment(page, 'channel', 'social').click();
    await button(page, 'Save view').click();
    await button(page, 'Detail: Trials started').click();
    await expect(events(page)).toHaveCount(4);
    const reset = button(page, 'Reset');
    await reset.click();
    await expect(result(page)).toHaveText('Showing all channels over the last 30d.');
    expect(await streamText(page)).toEqual([VIEWED]);
    await expect(live(page)).toHaveText('Dashboard reset. Viewed Dashboard sent.');
    await expect(button(page, 'Load saved view')).toBeDisabled();
    await expect(button(page, 'Detail: Trials started')).toHaveAttribute('aria-expanded', 'false');
    await expect(reset).toBeFocused();
    await expect.poll(() => [...query(page).keys()].filter((k) => k.startsWith(`${ID}.`))).toEqual([]);
    expect(query(page).get('other.key')).toBe('1');
    expect(new URL(page.url()).hash).toBe('#dashboard');
  });

  test('mount and unmount, three times: each mount sends one Viewed Dashboard and no event twice', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(PAGE);
    for (let round = 0; round < 3; round++) {
      await ready(page);
      expect(await streamText(page), `round ${round}`).toEqual([VIEWED]);
      const channel = ['email', 'search', 'social'][round]!;
      await segment(page, 'channel', channel).click();
      await expect(events(page)).toHaveCount(2);
      expect((await streamText(page))[0]).toBe(`Applied Filter filter_type: channel value: ${channel}`);
      // Leave by a client navigation, which unmounts the island, and come back.
      await page.locator('section#sources').getByRole('link', { name: 'Customer retention and reactivation analysis, another case study' }).click();
      await expect(page).toHaveURL(/\/work\/retention$/);
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/work/pulse\\?${ID}\\.channel=${channel}`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('7 events, each designed to answer a product question');
    }
    await ready(page);
    expect(await streamText(page)).toEqual([VIEWED]);
    await expect(events(page)).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('eager and hostile URLs: its own keys load the island after hydration, bad values fall back to the preset', async ({ page }) => {
    await withoutIdle(page);
    const errors = watchErrors(page);
    await page.goto(`${PAGE}?${ID}.channel=social&${ID}.range=90d`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(result(page)).toHaveText('Showing Social over the last 90d.');
    await expect(radio(page, 'channel', 'social')).toBeChecked();
    expect(await streamText(page)).toEqual([VIEWED]);
    await page.goto(`${PAGE}?${ID}.channel=__proto__&${ID}.range=999&${ID}.preset=constructor`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(result(page)).toHaveText('Showing all channels over the last 30d.');
    expect(errors).toEqual([]);
  });

  test('keyboard: focus in the preview loads the island and stays on the radio; an arrow key changes the range', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(PAGE);
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    await radio(page, 'range', '30d').focus();
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(radio(page, 'range', '30d')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(result(page)).toHaveText('Showing all channels over the last 90d.');
    await expect(radio(page, 'range', '90d')).toBeFocused();
    expect((await streamText(page))[0]).toBe('Changed Date Range range: 90d');
    await expect.poll(() => query(page).get(`${ID}.range`)).toBe('90d');
  });

  test('latency: a channel click redraws the result within 200 ms, with no animation', async ({ page }) => {
    await page.goto(PAGE);
    await ready(page);
    await segment(page, 'channel', 'search').scrollIntoViewIfNeeded();
    await figure(page).evaluate((root) => {
      const w = window as unknown as { lat: number[]; animations: number };
      w.lat = [];
      w.animations = 0;
      let clickAt: number | null = null;
      root.addEventListener('pointerdown', () => (clickAt = performance.now()), true);
      new MutationObserver(() => {
        if (clickAt !== null) {
          w.lat.push(performance.now() - clickAt);
          clickAt = null;
          w.animations += root.getAnimations({ subtree: true }).length;
        }
      }).observe(root.querySelector('[data-figure-result]')!, { characterData: true, childList: true, subtree: true });
    });
    await segment(page, 'channel', 'search').click();
    await expect(result(page)).toHaveText('Showing Search over the last 30d.');
    const stats = await page.evaluate(() => (window as unknown as { lat: number[]; animations: number }));
    expect(stats.lat.length).toBeGreaterThan(0);
    expect(Math.max(...stats.lat)).toBeLessThan(200);
    expect(stats.animations).toBe(0);
  });

  test('charts that throw after a change: the sentence takes focus, the badge and the current table stay', async ({ page }) => {
    const errors = watchErrors(page, [SEAM_FAILURE]);
    await page.goto(FAULTS);
    await ready(page);
    await radio(page, 'channel', 'all').focus();
    await page.keyboard.press('ArrowRight');
    const status = figure(page).getByRole('status');
    await expect(status).toHaveText(SENTENCE);
    await expect(status).toBeFocused();
    await expect(badge(page)).toBeVisible();
    await expect(figure(page).locator('[data-figure-fallback] table')).toBeVisible();
    await expect(figure(page).locator('svg[data-chart-frame]:visible')).toHaveCount(0);
    await expect(figure(page).getByRole('group', { name: 'Controls' })).toBeHidden();
    await expect(figure(page)).not.toContainText(SEAM_FAILURE);
    expect(errors).toEqual([]);
  });

  test('layout: no sideways scroll at this width or at 320 px, and 44 px targets', async ({ page }) => {
    await page.goto(PAGE);
    await ready(page);
    for (const width of [page.viewportSize()!.width, 320]) {
      await page.setViewportSize({ width, height: 800 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `width ${width}`).toBeLessThanOrEqual(0);
      for (const target of await figure(page).locator('button, label[data-segment]').all()) {
        const box = await target.boundingBox();
        if (box === null) continue;
        expect(box.height, `width ${width}`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('axe finds no violations in the preview or the loaded island', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(PAGE);
    await expectNoA11yViolations(page);
    await ready(page);
    await expectNoA11yViolations(page);
  });
});
