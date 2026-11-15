import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations, test } from './fixtures';

// The Audible case study at /work/audible, and its ship-rule Figure on a made-up product. The server
// draws the preset (main metric +1.0 to +4.0 points, guardrail at most +1.0: ship); the island loads
// on intent, or at once when the URL holds `framework.` keys. /kitchen-sink/audible/faults sets the
// test seam, so the chart throws on the first render after a committed change.

const PAGE = '/work/audible';
const FAULTS = '/kitchen-sink/audible/faults';
const ID = 'framework';
const TITLE = 'Where the two intervals fall decides the call';
const SENTENCE = 'This chart could not load. The numbers are in the table below.';
const SEAM_FAILURE = 'The ship-rule chart failed after a change (test seam)';
const SHIP = 'Ship: the main metric rose, guardrail intact.';
const MAY_SHIP = 'May ship: neutral on the main metric, guardrail intact.';
const HOLD = "Hold: the guardrail's upper end is past its limit.";
const STOP = 'Stop: the main metric fell.';

const figure = (page: Page) => page.locator(`figure[data-figure="${ID}"]`);
const automation = (page: Page) => page.locator('section#automation');
const island = (page: Page) => page.locator('[data-island]', { has: figure(page) });
const result = (page: Page) => figure(page).locator('[data-figure-result]');
const live = (page: Page) => figure(page).locator('[data-figure-announcement]');
const slider = (page: Page, key: 'lower' | 'upper' | 'guardrail') => page.locator(`#${ID}-${key}`);
const exact = (page: Page, key: 'lower' | 'upper' | 'guardrail') => page.locator(`#${ID}-${key}-exact`);
const badge = (page: Page) => figure(page).getByText('Simulated', { exact: true });
const query = (page: Page) => new URL(page.url()).searchParams;

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

test.describe('Audible method page', () => {
  test('without JavaScript: the Figure keeps the Simulated badge, the caption and the open table, whatever the query, and the two timings are there', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${PAGE}?${ID}.lower=-5&${ID}.upper=-1`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('25+ A/B tests at Audible (Amazon), from the plan to the recommendation.');
    await expect(figure(page).getByRole('heading', { level: 3 })).toHaveText(TITLE);
    await expect(result(page)).toContainText(SHIP);
    await expect(badge(page)).toBeVisible();
    await expect(figure(page).getByText('Controls need JavaScript.')).toBeVisible();
    await expect(figure(page).locator('[data-nojs-only] table')).toContainText('Session completion, lower end');
    await expect(figure(page).getByRole('group', { name: 'Controls' })).toBeHidden();
    // The setup timings are two large figures, my own and approximate: no chart, and no Simulated badge on them.
    const timings = automation(page).getByRole('group', { name: 'Test-account setup time, by hand and with the tool' });
    await expect(timings).toContainText('about 20 min');
    await expect(timings).toContainText('by hand');
    await expect(timings).toContainText('about 3 min');
    await expect(timings).toContainText('with the tool');
    await expect(timings).toContainText('My own timings, approximate.');
    await expect(timings).toContainText('Adopted team-wide, across 11 markets.');
    await expect(automation(page).getByText('Simulated', { exact: true })).toHaveCount(0);
    await expect(automation(page).locator('figure, svg')).toHaveCount(0);
    // The method's rows open without JavaScript: they are native details.
    const row = page.locator('section#method details', { hasText: 'The teams and their metrics' });
    await expect(row.getByText('Onsite & App Experience', { exact: false }).first()).toBeHidden();
    await row.locator('summary').click();
    await expect(row.getByText('Onsite & App Experience', { exact: false }).first()).toBeVisible();
    await context.close();
  });

  test('the anchors other pages link to exist and scroll into view', async ({ page }) => {
    for (const hash of ['why-so-many', 'automation', 'ship-rule', 'limits']) {
      await page.goto(`${PAGE}#${hash}`);
      await expect(page.locator(`section#${hash}`)).toBeInViewport();
    }
    // "How I checked this" is a row of the method now: its anchor is the row's summary, which is in view.
    await page.goto(`${PAGE}#how-i-checked-this`);
    await expect(page.locator('#how-i-checked-this')).toBeInViewport();
    await expect(page.locator('section#method summary', { hasText: 'How I checked this' })).toBeVisible();
  });

  test('the reading order: opening, glance figures, in-page links to visible headings, the close and the next project', async ({ page }) => {
    await page.goto(PAGE);
    const main = page.getByRole('main');
    await expect(main.locator('[data-case-head]')).toContainText('I contributed to the A/B tests, did the sample-size planning and the significance testing myself');
    await expect(main.locator('[data-case-actions] a')).toHaveText(['Ask me about this work']);
    await expect(main.locator('[data-case-actions] a')).toHaveAttribute('href', '/contact');
    await expect(main.locator('[data-glance-point]')).toHaveCount(3);
    await expect(main.locator('[data-glance-point]').nth(1).getByRole('link', { name: 'Why so many?' })).toHaveAttribute('href', '#why-so-many');
    const nav = main.getByRole('navigation', { name: 'On this page' });
    await expect(nav.getByRole('link')).toHaveText(['When to ship', 'Why so many?', 'Automation', 'Method', 'Limits', 'Sources']);
    for (const href of await nav.getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))) {
      await expect(main.locator(`section${href} > h2`)).toBeVisible();
    }
    await expect(main.getByRole('heading', { level: 2 })).toHaveText([
      'When to ship: try the rule yourself',
      'Why so many were adopted',
      'Test-account automation',
      'Method',
      'Limits',
      'Sources and links',
      'What this shows about how I work',
      'Find out what I can do for your team.',
    ]);
    // The page keeps the AI tools and the consent-aware SQL work off: no section, no word of them.
    await expect(main.locator('section#ai-tools')).toHaveCount(0);
    await expect(main).not.toContainText(/AI tools|Bedrock|Jira|opted-in|Digital Markets|\bDMA\b/);
    const next = main.getByRole('navigation', { name: 'More work' }).getByRole('link');
    await expect(next).toHaveCount(1);
    await expect(next).toHaveAttribute('href', '/work/retention');
    await expect(next).toContainText('Retention');
    // The slider hints say in plain words what each end stands for.
    await expect(figure(page).locator('[data-slider-readout]')).toHaveText([
      '+1.0 points, lowest plausible change',
      '+4.0 points, highest plausible change',
      '+1.0 points, highest plausible change',
    ]);
  });

  test('hydrated: the island loads on intent and keeps the Simulated badge', async ({ page }) => {
    await withoutIdle(page);
    const errors = watchErrors(page);
    await page.goto(PAGE);
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    await ready(page);
    await expect(badge(page)).toBeVisible();
    await expect(result(page)).toContainText(SHIP);
    await expect(live(page)).toHaveText('');
    expect(errors).toEqual([]);
  });

  test('eager: its own keys load the island after hydration and draw the shared bounds', async ({ page }) => {
    await withoutIdle(page);
    const errors = watchErrors(page);
    await page.goto(`${PAGE}?${ID}.lower=-1&${ID}.upper=3`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(result(page)).toContainText(MAY_SHIP);
    await expect(result(page)).toContainText('Session completion: −1.0 to +3.0 points');
    await expect(slider(page, 'lower')).toHaveValue('-1');
    expect(errors).toEqual([]);
  });

  test('a hostile shared URL draws values inside the schema, in order, with no error', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${PAGE}?${ID}.lower=abc&${ID}.upper=999&${ID}.guardrail=__proto__&${ID}.preset=constructor`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(result(page)).toContainText(SHIP);
    await expect(result(page)).toContainText('Session completion: +1.0 to +10.0 points; help requests: at most +1.0 points');
    // Crossed ends: the upper end is carried up to the lower one.
    await page.goto(`${PAGE}?${ID}.lower=5&${ID}.upper=-2`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(result(page)).toContainText('Session completion: +5.0 to +5.0 points');
    expect(errors).toEqual([]);
  });

  test('keyboard: focus in the preview loads the island and stays on the slider; keys move the decision and the URL', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(PAGE);
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    await slider(page, 'guardrail').focus();
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(slider(page, 'guardrail')).toBeFocused();
    await page.keyboard.press('End');
    await expect(result(page)).toContainText(HOLD);
    await expect(live(page)).toHaveText(
      "Hold: the guardrail's upper end is past its limit. Session completion: +1.0 to +4.0 points; help requests: at most +10.0 points, against a limit of +2.",
    );
    await expect(live(page)).toHaveAttribute('data-derived', 'simulated');
    await expect.poll(() => query(page).get(`${ID}.guardrail`)).toBe('10');
    await page.keyboard.press('Home');
    await expect(result(page)).toContainText(SHIP);
    // The upper end cannot pass below the lower one: it stops there.
    await slider(page, 'upper').focus();
    await page.keyboard.press('Home');
    await expect(result(page)).toContainText('Session completion: +1.0 to +1.0 points');
    // With the lower end at the bottom, the upper end can follow it below zero.
    await slider(page, 'lower').focus();
    await page.keyboard.press('Home');
    await expect(result(page)).toContainText(MAY_SHIP);
    await slider(page, 'upper').focus();
    await page.keyboard.press('Home');
    await expect(result(page)).toContainText(STOP);
    await expect.poll(() => [query(page).get(`${ID}.lower`), query(page).get(`${ID}.upper`)]).toEqual(['-10', '-10']);
  });

  test('a lower end typed above the upper end carries the upper end with it', async ({ page }) => {
    await page.goto(PAGE);
    await ready(page);
    await exact(page, 'lower').fill('6');
    await exact(page, 'lower').press('Enter');
    await expect(result(page)).toContainText('Session completion: +6.0 to +6.0 points');
    await expect.poll(() => [query(page).get(`${ID}.lower`), query(page).get(`${ID}.upper`)]).toEqual(['6', '6']);
  });

  test('Reset restores the preset, clears only its own keys and keeps other keys and the hash', async ({ page }) => {
    await page.goto(`${PAGE}?${ID}.guardrail=3&other.key=1#ship-rule`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(result(page)).toContainText(HOLD);
    await figure(page).getByRole('button', { name: 'Reset' }).click();
    await expect(result(page)).toContainText(SHIP);
    await expect(live(page)).toHaveText(
      'Ship: the main metric rose, guardrail intact. Session completion: +1.0 to +4.0 points; help requests: at most +1.0 points, against a limit of +2.',
    );
    const url = new URL(page.url());
    expect([...url.searchParams.keys()].filter((k) => k.startsWith(`${ID}.`))).toEqual([]);
    expect(url.searchParams.get('other.key')).toBe('1');
    expect(url.hash).toBe('#ship-rule');
  });

  test('drag: the result follows within 200 ms, with no announcement and no animation until release', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(`${PAGE}?${ID}.lower=1`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready', { timeout: 15_000 });
    await figure(page).evaluate((root) => {
      const w = window as unknown as { lat: number[]; announced: string[]; animations: number };
      w.lat = [];
      w.announced = [];
      w.animations = 0;
      let inputAt: number | null = null;
      root.addEventListener('input', () => (inputAt = performance.now()), true);
      const line = root.querySelector('[data-figure-result]')!;
      new MutationObserver(() => {
        if (inputAt !== null) {
          w.lat.push(performance.now() - inputAt);
          inputAt = null;
        }
        if (root.hasAttribute('data-dragging')) w.animations += root.getAnimations({ subtree: true }).length;
      }).observe(line, { characterData: true, childList: true, subtree: true });
      const announcement = root.querySelector('[data-figure-announcement]')!;
      new MutationObserver(() => {
        if (root.hasAttribute('data-dragging')) w.announced.push(announcement.textContent ?? '');
      }).observe(announcement, { characterData: true, childList: true, subtree: true });
    });
    // The Figure is below the fold: bring the slider into the viewport before reading its box.
    await slider(page, 'guardrail').scrollIntoViewIfNeeded();
    const box = (await slider(page, 'guardrail').boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.5, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.9, y, { steps: 8 });
    await expect(figure(page)).toHaveAttribute('data-dragging', '');
    await expect(live(page)).toHaveText('');
    await page.mouse.up();
    await expect(figure(page)).not.toHaveAttribute('data-dragging');
    await expect(live(page)).toHaveText(/^Hold: the guardrail's upper end is past its limit\./);
    const stats = await page.evaluate(() => {
      const w = window as unknown as { lat: number[]; announced: string[]; animations: number };
      return { lat: w.lat, announced: w.announced, animations: w.animations };
    });
    expect(stats.lat.length).toBeGreaterThan(0);
    expect(Math.max(...stats.lat)).toBeLessThan(200);
    expect(stats.announced).toEqual([]);
    expect(stats.animations).toBe(0);
  });

  test('a chart that throws after a keyboard change: the sentence takes focus, the badge and the current table stay', async ({ page }) => {
    const errors = watchErrors(page, [SEAM_FAILURE]);
    await page.goto(FAULTS);
    await ready(page);
    await slider(page, 'guardrail').focus();
    await page.keyboard.press('End');
    const status = figure(page).getByRole('status');
    await expect(status).toHaveText(SENTENCE);
    await expect(status).toBeFocused();
    await expect(badge(page)).toBeVisible();
    const fallbackTable = figure(page).locator('[data-figure-fallback] table');
    await expect(fallbackTable).toBeVisible();
    await expect(fallbackTable).toContainText('+10.0');
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
      for (const target of await figure(page).locator('input, button').all()) {
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
