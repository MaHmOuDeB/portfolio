import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations, test } from './fixtures';

// The full sample-size planner in its two places.
//
// - The Retention page's pair, on its dev host /kitchen-sink/retention: a sizing Figure (`winback`:
//   Baseline conversion 1% to 98%, preset 29%; Rise to detect, 1 to 30 whole points, capped so the
//   target stays at or under 99%; the rise's unit, points or percent of the baseline; Reset) and a
//   duration Figure (`winback-duration`: Total customers per day, 1 to 10,000, preset 100; Reset), one
//   paired island. The server draws the preset pair (1,353 customers per group, 4 weeks); the island
//   loads on intent, or at once when the URL holds keys of either Figure.
// - The Lab's one Figure, on the dev host /kitchen-sink/lab, which mounts the Lab page as /lab does
//   (`planner`: Sign-up rate today, Smallest rise worth acting on, Visitors per day, Reset; no unit
//   toggle), with two readouts, the visitors per group and the weeks. Its keys are `planner.baseline`,
//   `planner.risePoints` and `planner.traffic`; the old `duration.traffic` and `planner.mode` keys are
//   ignored.
//
// /kitchen-sink/lab/faults sets the test seam on both, so each Figure throws on the first render after
// its own input change.

const HOST = '/kitchen-sink/lab';
const RETENTION_HOST = '/kitchen-sink/retention';
const FAULTS = '/kitchen-sink/lab/faults';
// The Retention page's pair.
const ID = 'winback';
const DURATION = 'winback-duration';
// The Lab's one planner Figure.
const LAB = 'planner';
const PRESET_N = '1,353';
const SENTENCE = 'This chart could not load. The numbers are in the table below.';
const SIZING_FAILURE = 'The sizing readout failed after a change (test seam)';
const DURATION_FAILURE = 'The duration readout failed after a change (test seam)';
const LAB_FAILURE = 'The planner readout failed after a change (test seam)';
// The sizing announcement, which also says the weeks the change leads to at the traffic on screen.
const SIZING_RESULT = /^[\d,]+ customers per group to detect a rise of .+, from \d+% to \d+%; both groups fill in \d+ weeks? at [\d,]+ customers a day$/;
// The Lab's result line, and its announcement: the line and both readouts.
const LAB_PRESET_LINE = 'To catch a real rise from 29% to 34% in 8 tests out of 10, with a 1 in 20 risk of a false winner, at 100 visitors a day:';
const LAB_RESULT = /^To catch a real rise from \d+% to \d+% in 8 tests out of 10, with a 1 in 20 risk of a false winner, at [\d,]+ visitors? a day: [\d,]+ visitors per group and \d+ weeks?$/;
// A message only the statistics side ships (durationWeeks), so only the island's code holds it.
const STATS_MARKER = 'entryViewsPerDay must be a finite number above 0';

const figure = (page: Page, id = ID) => page.locator(`figure[data-figure="${id}"]`);
const island = (page: Page, id = ID) => page.locator('[data-island]', { has: figure(page, id) });
// The Lab names its controls in plain words; the Retention page keeps its own terms.
const baseline = (page: Page, id = ID) => figure(page, id).getByRole('slider', { name: id === LAB ? 'Sign-up rate today' : 'Baseline conversion', exact: true });
const rise = (page: Page, id = ID) => figure(page, id).getByRole('slider', { name: id === LAB ? 'Smallest rise worth acting on' : 'Rise to detect', exact: true });
const traffic = (page: Page, id = DURATION) => figure(page, id).getByRole('slider', { name: id === LAB ? 'Visitors per day' : 'Total customers per day', exact: true });
const unit = (page: Page, name: 'Points' | 'Percent of baseline', id = ID) => figure(page, id).getByRole('radio', { name });
const reset = (page: Page, id: string) => figure(page, id).getByRole('button', { name: 'Reset' });
const readoutN = (page: Page, id = ID) => figure(page, id).locator('[data-figure-body] [data-planner-n]');
const weeks = (page: Page, id = DURATION) => figure(page, id).locator('[data-figure-body] [data-duration-weeks]');
const result = (page: Page, id = ID) => figure(page, id).locator('[data-figure-result]');
const live = (page: Page, id = ID) => figure(page, id).locator('[data-figure-announcement]');
const query = (page: Page) => new URL(page.url()).searchParams;
const ownKeys = (page: Page, id: string) => [...query(page).keys()].filter((k) => k.startsWith(`${id}.`)).sort();

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

const CHUNK_ERRORS = ['chunk', 'Chunk', 'Failed to fetch', 'dynamically imported module', 'Importing a module script failed'];

/** Holds the idle trigger, so only intent or the URL loads an island. */
async function withoutIdle(page: Page) {
  await page.addInitScript(() => {
    window.requestIdleCallback = () => 0;
    window.cancelIdleCallback = () => {};
  });
}

async function ready(page: Page, id = ID) {
  await figure(page, id).locator('h3').hover();
  await expect(island(page, id)).toHaveAttribute('data-island', 'ready');
}

/** Types an exact value into a slider's number input and commits it with Enter. */
async function typeExact(page: Page, name: string, value: string, id = ID) {
  const exact = figure(page, id).getByRole('spinbutton', { name });
  await exact.fill(value);
  await exact.press('Enter');
}

test.describe('Full planner, the Retention page\'s pair', () => {
  test('without JavaScript: both presets, both open tables and "Controls need JavaScript.", whatever the query', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${RETENTION_HOST}?${ID}.baseline=0.6&${ID}.mode=relative&${DURATION}.traffic=500`);
    await expect(readoutN(page)).toHaveText(PRESET_N);
    await expect(result(page)).toContainText('To detect a rise of 5 points, from 29% to 34%.');
    await expect(figure(page).getByText('Simulated', { exact: true })).toHaveCount(1);
    await expect(result(page)).toContainText('Hypothetical uplift');
    await expect(weeks(page)).toHaveText('4');
    await expect(result(page, DURATION)).toContainText('To reach 1,353 customers per group, 2,706 in all, at 100 customers a day.');
    for (const id of [ID, DURATION]) {
      await expect(figure(page, id).getByText('Controls need JavaScript.')).toBeVisible();
      await expect(figure(page, id).locator('[data-nojs-only] table')).toBeVisible();
      await expect(figure(page, id).getByRole('group', { name: 'Controls' })).toBeHidden();
    }
    await expect(figure(page).locator('[data-nojs-only] table')).toContainText(PRESET_N);
    await expect(figure(page, DURATION).locator('[data-nojs-only] table')).toContainText('Weeks, rounded up');
    await expect(figure(page, DURATION).locator('figcaption')).toContainText('If 100 customers a day enter the test, split equally between groups');
    await context.close();
  });

  test('lazy: with idle time held, no island code loads before a pointer arrives', async ({ page, request }) => {
    await withoutIdle(page);
    const errors = watchErrors(page);
    // Every script the page asks for, in order, and how many of them came before the pointer.
    const scripts: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'script') scripts.push(r.url());
    });
    await page.goto(RETENTION_HOST);
    await page.waitForLoadState('load');
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    await expect(island(page, 'returns')).toHaveAttribute('data-island', 'idle');
    await page.waitForTimeout(1200);
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    const beforeIntent = scripts.length;
    await ready(page);
    await expect(readoutN(page)).toHaveText(PRESET_N);
    await expect(weeks(page)).toHaveText('4');
    // The island's code is what holds its Figures (the seam's message is compiled into them) and
    // the statistics (durationWeeks' message): both were requested after the pointer arrived, and no
    // script before then holds either. A slow engine may still fetch other page chunks late; only the
    // island's code is held back. Two markers, so a split of the views from the statistics is caught.
    const bodies = await Promise.all(scripts.map(async (url) => (await request.get(url)).text()));
    for (const marker of [SIZING_FAILURE, STATS_MARKER]) {
      expect(bodies.slice(0, beforeIntent).filter((b) => b.includes(marker)), marker).toEqual([]);
      expect(bodies.slice(beforeIntent).some((b) => b.includes(marker)), marker).toBe(true);
    }
    expect(errors).toEqual([]);
  });

  test('idle: with no intent and no query, the islands still load when the page is idle', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(RETENTION_HOST);
    await expect(island(page)).toHaveAttribute('data-island', 'ready', { timeout: 10_000 });
    await expect(island(page, 'cohorts')).toHaveAttribute('data-island', 'ready', { timeout: 10_000 });
    await expect(readoutN(page)).toHaveText(PRESET_N);
    expect(errors).toEqual([]);
  });

  test('eager: sizing keys in the URL load the pair after hydration, with no intent', async ({ page, request }) => {
    const html = await (await request.get(`${RETENTION_HOST}?${ID}.baseline=0.4&${ID}.mode=relative`)).text();
    expect(html).toContain('data-island="idle"');
    expect(html).toContain(PRESET_N);
    await withoutIdle(page);
    const errors = watchErrors(page);
    await page.goto(`${RETENTION_HOST}?${ID}.baseline=0.4&${ID}.mode=relative`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(baseline(page)).toHaveValue('40');
    await expect(unit(page, 'Percent of baseline')).toBeChecked();
    await expect(result(page)).toContainText('To detect a rise of 12.5% of the baseline, from 40% to 45%.');
    await expect(readoutN(page)).not.toHaveText(PRESET_N);
    // another Figure on the page has no keys and waits for intent
    await expect(island(page, 'returns')).toHaveAttribute('data-island', 'idle');
    expect(errors).toEqual([]);
  });

  test('eager: a duration-only key loads the same pair, and the weeks follow the traffic', async ({ page }) => {
    await withoutIdle(page);
    const errors = watchErrors(page);
    await page.goto(`${RETENTION_HOST}?${DURATION}.traffic=500`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(traffic(page)).toHaveValue('500');
    await expect(readoutN(page)).toHaveText(PRESET_N);
    await expect(weeks(page)).toHaveText('1');
    await expect(figure(page, DURATION).locator('[data-figure-body]')).toContainText('week, rounded up');
    await expect(result(page, DURATION)).toContainText('at 500 customers a day.');
    expect(errors).toEqual([]);
  });

  test("another Figure's keys, near misses and bare keys do not load it", async ({ page }) => {
    await withoutIdle(page);
    await page.goto(`${RETENTION_HOST}?returns.mode=raw&planner.baseline=0.4&${ID}x.mode=relative&${DURATION}=5&traffic=9&hero-planner.baseline=0.5`);
    // the returns key is the cleaning Figure's own, and loads only that Figure
    await expect(island(page, 'returns')).toHaveAttribute('data-island', 'ready');
    await page.waitForTimeout(800);
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    await expect(readoutN(page)).toHaveText(PRESET_N);
  });

  test('a hostile shared URL shows a valid triple and traffic, with no error', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${RETENTION_HOST}?${ID}.baseline=0.98&${ID}.risePoints=30&${ID}.mode=__proto__&${ID}.preset=toString&${DURATION}.traffic=-Infinity`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(baseline(page)).toHaveValue('98');
    await expect(rise(page)).toHaveValue('1');
    await expect(rise(page)).toHaveAttribute('max', '1');
    await expect(unit(page, 'Points')).toBeChecked();
    await expect(result(page)).toContainText('To detect a rise of 1 point, from 98% to 99%.');
    await expect(traffic(page)).toHaveValue('1');
    await expect(weeks(page)).toHaveText(/^[\d,]+$/);
    expect(errors).toEqual([]);
  });

  test('switching the unit keeps the sample, the target and the rise, and writes all three keys', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(`${RETENTION_HOST}?${ID}.baseline=0.3&${ID}.risePoints=4&other.keep=1#note`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    const before = await readoutN(page).textContent();
    await expect(result(page)).toContainText('To detect a rise of 4 points, from 30% to 34%.');
    await figure(page).locator('label', { hasText: 'Percent of baseline' }).click();
    await expect(unit(page, 'Percent of baseline')).toBeChecked();
    await expect(readoutN(page)).toHaveText(before!);
    await expect(result(page)).toContainText('To detect a rise of 13.3% of the baseline, from 30% to 34%.');
    await expect(figure(page).locator('[data-slider-readout]').nth(1)).toHaveText('13.3% of baseline');
    await expect(live(page)).toHaveText(`${before} customers per group to detect a rise of 13.3% of the baseline, from 30% to 34%; both groups fill in 7 weeks at 100 customers a day`);
    await expect.poll(() => query(page).get(`${ID}.mode`)).toBe('relative');
    expect(query(page).get(`${ID}.baseline`)).toBe('0.3');
    expect(query(page).get(`${ID}.risePoints`)).toBe('4');
    // a typed percent goes to the nearest whole point: 20% of 30% is 6 points
    await typeExact(page, 'Rise to detect, percent of the baseline', '20');
    await expect(result(page)).toContainText('To detect a rise of 20% of the baseline, from 30% to 36%.');
    await expect.poll(() => query(page).get(`${ID}.risePoints`)).toBe('6');
    await figure(page).locator('label', { hasText: 'Points' }).click();
    await expect(rise(page)).toHaveValue('6');
    await expect(result(page)).toContainText('To detect a rise of 6 points, from 30% to 36%.');
    await expect.poll(() => query(page).get(`${ID}.mode`)).toBe('absolute');
    expect(query(page).get('other.keep')).toBe('1');
    expect(new URL(page.url()).hash).toBe('#note');
  });

  test('cross-input cap: .29/5, baseline .98 caps the rise at 1, baseline .29 keeps 1, with every key written each step', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(`${RETENTION_HOST}?other.keep=1#note`);
    await ready(page);
    const expectUrl = async (b: string, r: string) => {
      await expect.poll(() => query(page).get(`${ID}.baseline`)).toBe(b);
      expect(query(page).get(`${ID}.risePoints`)).toBe(r);
      expect(query(page).get(`${ID}.mode`)).toBe('absolute');
      expect(ownKeys(page, ID)).toEqual([`${ID}.baseline`, `${ID}.mode`, `${ID}.risePoints`]);
      expect(query(page).get('other.keep')).toBe('1');
      expect(new URL(page.url()).hash).toBe('#note');
    };
    await expect(baseline(page)).toHaveValue('29');
    await expect(rise(page)).toHaveValue('5');
    await typeExact(page, 'Baseline conversion, percent', '98');
    await expect(rise(page)).toHaveValue('1');
    await expect(rise(page)).toHaveAttribute('max', '1');
    await expect(result(page)).toContainText('from 98% to 99%.');
    await expectUrl('0.98', '1');
    await typeExact(page, 'Baseline conversion, percent', '29');
    await expect(rise(page)).toHaveValue('1');
    await expect(rise(page)).toHaveAttribute('max', '30');
    await expect(result(page)).toContainText('To detect a rise of 1 point, from 29% to 30%.');
    await expectUrl('0.29', '1');
    expect(ownKeys(page, DURATION)).toEqual([]);
  });

  test('Reset scopes: the sizing Reset clears only its keys, the duration Reset only the traffic', async ({ page }) => {
    await page.goto(`${RETENTION_HOST}?${ID}.baseline=0.5&${ID}.risePoints=12&${ID}.mode=relative&${DURATION}.traffic=500&other.keep=1#note`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(traffic(page)).toHaveValue('500');
    const sizedWeeks = await weeks(page).textContent();
    await reset(page, ID).click();
    await expect(baseline(page)).toHaveValue('29');
    await expect(unit(page, 'Points')).toBeChecked();
    await expect(readoutN(page)).toHaveText(PRESET_N);
    // the weeks at the traffic still on screen: 2 x 1,353 at 500 a day is 1 week
    await expect(live(page)).toHaveText('1,353 customers per group to detect a rise of 5 points, from 29% to 34%; both groups fill in 1 week at 500 customers a day');
    expect(ownKeys(page, ID)).toEqual([]);
    expect(query(page).get(`${DURATION}.traffic`)).toBe('500');
    await expect(traffic(page)).toHaveValue('500');
    // the weeks follow the new sample at the same traffic: 2 x 1,353 at 500 a day is 1 week
    await expect(weeks(page)).toHaveText('1');
    expect(sizedWeeks).not.toBeNull();

    await typeExact(page, 'Baseline conversion, percent', '40');
    await expect(baseline(page)).toHaveValue('40');
    await reset(page, DURATION).click();
    await expect(traffic(page)).toHaveValue('100');
    await expect(live(page, DURATION)).toHaveText(/^\d+ weeks? at 100 customers a day to reach [\d,]+ customers per group$/);
    expect(ownKeys(page, DURATION)).toEqual([]);
    await expect.poll(() => query(page).get(`${ID}.baseline`)).toBe('0.4');
    await expect(baseline(page)).toHaveValue('40');
    expect(query(page).get('other.keep')).toBe('1');
    expect(new URL(page.url()).hash).toBe('#note');
  });

  test('keyboard: focus moving into the preview loads the island and stays on the slider; a key release announces once', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(RETENTION_HOST);
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    await baseline(page).focus();
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(baseline(page)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(baseline(page)).toHaveValue('30');
    await expect(live(page)).toHaveText(SIZING_RESULT);
    // the sizing change moves the weeks too, so the one announcement says both; the duration
    // Figure's own region stays quiet, so nothing is announced twice
    await expect(live(page)).toHaveText(/from 30% to 35%; both groups fill in \d+ weeks? at 100 customers a day$/);
    const shownWeeks = await weeks(page).textContent();
    await expect(live(page)).toHaveText(new RegExp(`fill in ${shownWeeks} weeks? at`));
    await expect(live(page)).toHaveAttribute('data-derived', 'simulated');
    await expect(live(page, DURATION)).toHaveText('');
  });

  for (const control of ['unit radio', 'sizing Reset', 'duration Reset'] as const) {
    test(`keyboard: focus on the preview's ${control} moves to the island's, never resting on <body>`, async ({ page }) => {
      await withoutIdle(page);
      await page.goto(RETENTION_HOST);
      await expect(island(page)).toHaveAttribute('data-island', 'idle');
      await page.evaluate(() => {
        const w = window as unknown as { bodyFrames: number; watching: boolean };
        w.bodyFrames = 0;
        w.watching = false;
        document.addEventListener('focusin', () => (w.watching = true), { once: true });
        const tick = () => {
          if (w.watching && document.activeElement === document.body) w.bodyFrames++;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const target = control === 'unit radio' ? unit(page, 'Points') : reset(page, control === 'sizing Reset' ? ID : DURATION);
      await target.focus();
      await expect(island(page)).toHaveAttribute('data-island', 'ready');
      await expect(target).toBeFocused();
      expect(await page.locator(`#${ID} [data-planner-controls]`).count()).toBe(1);
      await page.waitForTimeout(200);
      expect(await page.evaluate(() => (window as unknown as { bodyFrames: number }).bodyFrames)).toBe(0);
      if (control === 'unit radio') {
        await page.keyboard.press('ArrowRight');
        await expect(unit(page, 'Percent of baseline')).toBeChecked();
        await expect(live(page)).toHaveText(/of the baseline, from 29% to 34%; both groups fill in 4 weeks at 100 customers a day$/);
      }
    });
  }

  test('drag: the readouts follow within 200 ms in the shown unit, with no announcement and no transition until release', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(`${RETENTION_HOST}?${ID}.mode=relative`);
    // Eager loading waits for hydration, which a loaded WebKit runner can take a while to reach.
    await expect(island(page)).toHaveAttribute('data-island', 'ready', { timeout: 15_000 });
    await expect(live(page)).toHaveText('');
    await figure(page).evaluate((root) => {
      const w = window as unknown as { lat: number[]; announcedDuringDrag: string[]; animationsDuringDrag: number };
      w.lat = [];
      w.announcedDuringDrag = [];
      w.animationsDuringDrag = 0;
      let inputAt: number | null = null;
      root.addEventListener('input', () => {
        inputAt = performance.now();
      }, true);
      const n = root.querySelector('[data-figure-body] [data-planner-n]')!;
      new MutationObserver(() => {
        if (inputAt !== null) {
          w.lat.push(performance.now() - inputAt);
          inputAt = null;
        }
        if (root.hasAttribute('data-dragging')) w.animationsDuringDrag += root.getAnimations({ subtree: true }).length;
      }).observe(n, { characterData: true, childList: true, subtree: true });
      const announcement = root.querySelector('[data-figure-announcement]')!;
      new MutationObserver(() => {
        if (root.hasAttribute('data-dragging')) w.announcedDuringDrag.push(announcement.textContent ?? '');
      }).observe(announcement, { characterData: true, childList: true, subtree: true });
    });

    // The planner starts below the fold: bring the slider on screen before pointing at it.
    await rise(page).scrollIntoViewIfNeeded();
    const box = (await rise(page).boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.1, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, y, { steps: 8 });
    await expect(figure(page)).toHaveAttribute('data-dragging', '');
    await expect(live(page)).toHaveText('');
    // the readout beside the slider is in the shown unit
    await expect(figure(page).locator('[data-slider-readout]').nth(1)).toHaveText(/^[\d.]+% of baseline$/);
    const transitions = await figure(page)
      .locator('[data-planner-readout], [data-figure-result]')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).transitionDuration));
    expect(transitions.every((d) => d.split(',').every((part) => part.trim() === '0s'))).toBe(true);

    await page.mouse.up();
    await expect(figure(page)).not.toHaveAttribute('data-dragging');
    await expect(live(page)).toHaveText(SIZING_RESULT);
    await expect(live(page)).toHaveText(/% of the baseline, from 29% to \d+%; both groups fill in \d+ weeks? at 100 customers a day$/);
    const stats = await page.evaluate(() => {
      const w = window as unknown as { lat: number[]; announcedDuringDrag: string[]; animationsDuringDrag: number };
      return { lat: w.lat, announced: w.announcedDuringDrag, animations: w.animationsDuringDrag };
    });
    expect(stats.lat.length).toBeGreaterThan(0);
    expect(Math.max(...stats.lat)).toBeLessThan(200);
    expect(stats.announced).toEqual([]);
    expect(stats.animations).toBe(0);
    // the rise is on the whole-point grid and in the URL in points
    await expect.poll(() => query(page).get(`${ID}.risePoints`)).toMatch(/^\d+$/);
  });

  test('percent: the number input shows the short value; ArrowUp in it moves the rise one point and announces on release', async ({ page }) => {
    await withoutIdle(page);
    const errors = watchErrors(page);
    await page.goto(`${RETENTION_HOST}?${ID}.mode=relative`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    const exact = figure(page).getByRole('spinbutton', { name: 'Rise to detect, percent of the baseline' });
    // 5 points of 29% is 17.2413...%: the input shows it to one decimal, as the readout does
    await expect(exact).toHaveValue('17.2');
    await expect(exact).toHaveAttribute('aria-invalid', 'false');
    await expect(result(page)).toContainText('To detect a rise of 17.2% of the baseline, from 29% to 34%.');
    await exact.focus();
    await page.keyboard.down('ArrowUp');
    // one step is one whole point: 6 points of 29% is 20.7%, to 35%
    await expect(result(page)).toContainText('To detect a rise of 20.7% of the baseline, from 29% to 35%.');
    await expect(exact).toHaveValue('20.7');
    await expect(rise(page)).toHaveAttribute('aria-valuetext', '20.7% of the baseline, to 35%');
    await expect(live(page)).toHaveText('');
    await page.keyboard.up('ArrowUp');
    await expect(live(page)).toHaveText(SIZING_RESULT);
    await expect(live(page)).toContainText('to detect a rise of 20.7% of the baseline, from 29% to 35%');
    await expect.poll(() => query(page).get(`${ID}.risePoints`)).toBe('6');
    await expect(exact).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('traffic: a key release on the duration slider announces the weeks, and the sizing stays put', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(RETENTION_HOST);
    await traffic(page).focus();
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(traffic(page)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(traffic(page)).toHaveValue('99');
    await expect(live(page, DURATION)).toHaveText('4 weeks at 99 customers a day to reach 1,353 customers per group');
    await expect(live(page)).toHaveText('');
    await expect.poll(() => query(page).get(`${DURATION}.traffic`)).toBe('99');
    expect(ownKeys(page, ID)).toEqual([]);
  });

  test('a failed island on intent brings back both no-JS presets, and focus goes to the open table', async ({ page }) => {
    await withoutIdle(page);
    watchErrors(page, CHUNK_ERRORS);
    let block = false;
    await page.route('**/_next/static/**/*.js', (route) => (block ? route.abort() : route.continue()));
    await page.goto(RETENTION_HOST);
    await page.waitForLoadState('load');
    await page.waitForTimeout(500);
    block = true;
    await baseline(page).focus();
    await expect(page.locator('[data-island="failed"]', { has: figure(page) })).toHaveCount(1);
    await expect(figure(page).locator('[data-nojs-only] [role="region"]')).toBeFocused();
    for (const id of [ID, DURATION]) {
      await expect(figure(page, id).getByText('Controls need JavaScript.')).toBeVisible();
      await expect(figure(page, id).getByRole('group', { name: 'Controls' })).toBeHidden();
    }
    await expect(readoutN(page)).toHaveText(PRESET_N);
    await expect(weeks(page)).toHaveText('4');
  });

  test('a failed eager island brings back the presets, not the shared values, and takes no focus', async ({ page, request }) => {
    await withoutIdle(page);
    watchErrors(page, CHUNK_ERRORS);
    const url = `${RETENTION_HOST}?${ID}.baseline=0.4&${DURATION}.traffic=500`;
    const html = await (await request.get(url)).text();
    const named = new Set([...html.matchAll(/\/_next\/static\/[^"'\s]+\.js/g)].map((m) => m[0]));
    await page.route('**/_next/static/**/*.js', (route) =>
      named.has(new URL(route.request().url()).pathname) ? route.continue() : route.abort(),
    );
    await page.goto(url);
    await expect(page.locator('[data-island="failed"]', { has: figure(page) })).toHaveCount(1);
    await expect(figure(page).locator('[data-nojs-only] table')).toContainText(PRESET_N);
    await expect(figure(page, DURATION).locator('[data-nojs-only] table')).toBeVisible();
    await expect(result(page)).toContainText('from 29% to 34%.');
    await expect(weeks(page)).toHaveText('4');
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  });

  test('a sizing readout that throws after a keyboard change: the sentence takes focus, the current table shows, no readout and no controls', async ({ page }) => {
    const errors = watchErrors(page, [SIZING_FAILURE]);
    await page.goto(FAULTS);
    await ready(page);
    await baseline(page).focus();
    await page.keyboard.press('ArrowRight');
    const status = figure(page).getByRole('status');
    await expect(status).toHaveText(SENTENCE);
    await expect(status).toBeFocused();
    await assertSizingFallback(page, '30');
    // the duration Figure is its own Figure: it keeps working, with the new sample
    await expect(figure(page, DURATION).getByRole('status')).toHaveCount(0);
    await expect(weeks(page)).toHaveText(/^\d+$/);
    await expect(traffic(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a sizing readout that throws after a pointer change: focus is the sentence or where the click put it, never a hidden control', async ({ page }) => {
    const errors = watchErrors(page, [SIZING_FAILURE]);
    await page.goto(FAULTS);
    await ready(page);
    // Start with nothing focused, as the kit's own pointer test does.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    // On a phone the lead and labels push the slider below the fold: bring it into view before reading its box.
    await baseline(page).scrollIntoViewIfNeeded();
    const box = (await baseline(page).boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
    const status = figure(page).getByRole('status');
    await expect(status).toHaveText(SENTENCE);
    const focus = await page.evaluate((id) => {
      const a = document.activeElement;
      const figureRoot = document.getElementById(id)!;
      const clickTarget = figureRoot.parentElement?.closest('[tabindex]') ?? null;
      return {
        what: a === null ? 'null' : `${a.tagName.toLowerCase()}#${a.id}[role=${a.getAttribute('role')}]`,
        body: a === document.body,
        status: a?.getAttribute('role') === 'status' && figureRoot.contains(a),
        clickTarget: a !== null && a === clickTarget && !figureRoot.contains(a),
        hidden: a instanceof HTMLElement && a !== document.body && !a.checkVisibility(),
      };
    }, ID);
    expect(focus.body || focus.status || focus.clickTarget, focus.what).toBe(true);
    expect(focus.hidden).toBe(false);
    const shown = await figure(page).locator('[data-figure-fallback] tbody tr').first().locator('td[data-num]').textContent();
    expect(shown).not.toBe('29');
    await assertSizingFallback(page, shown!);
    expect(errors).toEqual([]);
  });

  test('a duration readout that throws after a keyboard change: its sentence takes focus and its current table shows; the sizing keeps working', async ({ page }) => {
    const errors = watchErrors(page, [DURATION_FAILURE]);
    await page.goto(FAULTS);
    await ready(page);
    await traffic(page).focus();
    await page.keyboard.press('ArrowRight');
    const f = figure(page, DURATION);
    const status = f.getByRole('status');
    await expect(status).toHaveText(SENTENCE);
    await expect(status).toBeFocused();
    const fallbackTable = f.locator('[data-figure-fallback] table');
    await expect(fallbackTable).toBeVisible();
    await expect(fallbackTable.locator('tbody tr').first().locator('td[data-num]')).toHaveText('101');
    await expect(f.locator('[data-figure-preview]')).toHaveCount(0);
    await expect(f.locator('[data-duration-weeks]')).toHaveCount(0);
    await expect(f.getByRole('group', { name: 'Controls' })).toBeHidden();
    await expect(f.locator('[data-figure-result]')).toBeHidden();
    await expect(f.locator('figcaption > p').first()).toContainText('split equally between groups');
    await expect(f).not.toContainText(DURATION_FAILURE);
    await expect(figure(page).getByRole('status')).toHaveCount(0);
    await expect(baseline(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Retention context: customers per group from the observed baseline, the sourced target and its own keys', async ({ page }) => {
    await withoutIdle(page);
    const errors = watchErrors(page);
    await page.goto(`${RETENTION_HOST}?winback-duration.traffic=50`);
    await expect(island(page, 'winback')).toHaveAttribute('data-island', 'ready');
    // the Retention page's own Figures have no keys and wait for intent
    await expect(island(page, 'returns')).toHaveAttribute('data-island', 'idle');
    await expect(readoutN(page, 'winback')).toHaveText(PRESET_N);
    await expect(figure(page, 'winback').locator('[data-figure-body]')).toContainText('customers per group');
    await expect(result(page, 'winback')).toContainText('Hypothetical uplift');
    const caption = figure(page, 'winback').locator('figcaption > p').first();
    await expect(caption).toContainText('Nobody was contacted and no test was run.');
    await expect(caption.locator('[data-fact="retention.winback.baseline_rate"]')).toHaveText('29%');
    await expect(caption.locator('data[data-derived="retention.winback.baseline_rate retention.winback.uplift_pp"]')).toHaveText('34%');
    await expect(traffic(page, 'winback-duration')).toHaveValue('50');
    await expect(figure(page, 'winback-duration').locator('figcaption > p').first()).toContainText('If 50 customers a day enter the test');
    await expect(figure(page, 'winback-duration').locator('figcaption > p').first()).toContainText('window for ordering again');
    await expect(figure(page, 'winback-duration').getByRole('heading', { level: 3 })).toHaveText(
      'The fewer customers a day, the more weeks it takes to fill both groups',
    );
    // once the baseline moves off the observed one, nothing beside the live results calls it observed
    await typeExact(page, 'Baseline conversion, percent', '60', 'winback');
    await expect(result(page, 'winback')).toContainText('from 60% to 65%.');
    for (const id of ['winback', 'winback-duration']) {
      await expect(result(page, id)).toContainText('Hypothetical uplift');
      await expect(result(page, id)).not.toContainText('observed');
    }
    await expect(live(page, 'winback')).toHaveText(/^[\d,]+ customers per group to detect a rise of 5 points, from 60% to 65%; both groups fill in 9 weeks at 50 customers a day$/);
    expect(errors).toEqual([]);
  });

  test('no number escapes its source marker, shown or hidden, before and after the island loads', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(RETENTION_HOST);
    const stray = () => strayNumbers(page, '[data-full-planner]');
    expect(await stray()).toEqual([]);
    await ready(page);
    await figure(page).locator('label', { hasText: 'Percent of baseline' }).click();
    expect(await stray()).toEqual([]);
  });

  test('axe finds no violations in the previews or the loaded islands', async ({ page }) => {
    // Two full-page scans of the Retention page, as the kit's own axe tests allow for.
    test.setTimeout(90_000);
    await withoutIdle(page);
    await page.goto(RETENTION_HOST);
    await expectNoA11yViolations(page);
    await ready(page);
    await figure(page).locator('label', { hasText: 'Percent of baseline' }).click();
    // Scan the page at rest at the top: wherever the click left the view, a link just above the
    // planner can sit under the sticky header, which axe counts as obscured targets.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoA11yViolations(page);
  });
});


test.describe('Full planner, the Lab\'s one Figure', () => {
  test('without JavaScript: the preset, both readouts, the open table and "Controls need JavaScript.", whatever the query', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${HOST}?${LAB}.baseline=0.6&${LAB}.traffic=500&duration.traffic=900`);
    await expect(readoutN(page, LAB)).toHaveText(PRESET_N);
    await expect(weeks(page, LAB)).toHaveText('4');
    await expect(result(page, LAB)).toHaveText(LAB_PRESET_LINE);
    await expect(figure(page, LAB).getByText('Simulated', { exact: true })).toHaveCount(1);
    await expect(figure(page, LAB).getByText('Controls need JavaScript.')).toBeVisible();
    await expect(figure(page, LAB).getByRole('group', { name: 'Controls' })).toBeHidden();
    const table = figure(page, LAB).locator('[data-nojs-only] table');
    await expect(table).toBeVisible();
    await expect(table).toContainText(PRESET_N);
    await expect(table).toContainText('Weeks, rounded up');
    await expect(table).toContainText('Smallest rise worth acting on (% of the rate today)');
    await expect(figure(page, LAB).locator('figcaption > p').first()).toHaveText('Made-up numbers to plan with. Visitors are split evenly between the two groups.');
    // one Figure: the Lab has no duration Figure, no tag beside the result
    await expect(figure(page, 'duration')).toHaveCount(0);
    await expect(result(page, LAB)).not.toContainText('Hypothetical test');
    await context.close();
  });

  test('has no unit toggle on the Lab: three sliders and Reset, while the Retention page keeps its toggle', async ({ page }) => {
    await page.goto(HOST);
    await ready(page, LAB);
    const controls = figure(page, LAB).locator('[data-planner-controls]');
    await expect(controls.getByRole('slider')).toHaveCount(3);
    await expect(controls.getByRole('radio')).toHaveCount(0);
    await expect(controls.getByRole('group', { name: 'Rise to detect, in' })).toHaveCount(0);
    await expect(controls.getByRole('button')).toHaveText(['Reset']);
    await expect(baseline(page, LAB)).toHaveValue('29');
    await expect(rise(page, LAB)).toHaveValue('5');
    await expect(traffic(page, LAB)).toHaveValue('100');
    await expect(figure(page, LAB).locator('[data-slider-readout]')).toHaveText(['29% of visitors', 'Up 5 points, to 34%', '100 a day']);
    await page.goto(RETENTION_HOST);
    await ready(page, ID);
    await expect(unit(page, 'Points', ID)).toBeChecked();
    await expect(unit(page, 'Percent of baseline', ID)).toBeVisible();
  });

  test('lazy: with idle time held, no island code loads before a pointer arrives', async ({ page, request }) => {
    await withoutIdle(page);
    const errors = watchErrors(page);
    const scripts: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'script') scripts.push(r.url());
    });
    await page.goto(HOST);
    await page.waitForLoadState('load');
    await expect(island(page, LAB)).toHaveAttribute('data-island', 'idle');
    await expect(island(page, 'srm')).toHaveAttribute('data-island', 'idle');
    await page.waitForTimeout(1200);
    await expect(island(page, LAB)).toHaveAttribute('data-island', 'idle');
    const beforeIntent = scripts.length;
    await ready(page, LAB);
    await expect(readoutN(page, LAB)).toHaveText(PRESET_N);
    await expect(weeks(page, LAB)).toHaveText('4');
    // the island's view (the seam's message) and the statistics (durationWeeks' message) arrive only after intent
    const bodies = await Promise.all(scripts.map(async (url) => (await request.get(url)).text()));
    for (const marker of [LAB_FAILURE, STATS_MARKER]) {
      expect(bodies.slice(0, beforeIntent).filter((b) => b.includes(marker)), marker).toEqual([]);
      expect(bodies.slice(beforeIntent).some((b) => b.includes(marker)), marker).toBe(true);
    }
    expect(errors).toEqual([]);
  });

  test('idle: with no intent and no query, the island still loads when the page is idle', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(HOST);
    await expect(island(page, LAB)).toHaveAttribute('data-island', 'ready', { timeout: 10_000 });
    await expect(island(page, 'curse')).toHaveAttribute('data-island', 'ready', { timeout: 10_000 });
    await expect(readoutN(page, LAB)).toHaveText(PRESET_N);
    expect(errors).toEqual([]);
  });

  test('eager: its keys load it after hydration, with no intent, and the readouts follow them', async ({ page, request }) => {
    const url = `${HOST}?${LAB}.baseline=0.05&${LAB}.risePoints=1&${LAB}.traffic=1000`;
    const html = await (await request.get(url)).text();
    expect(html).toContain('data-island="idle"');
    expect(html).toContain(PRESET_N);
    await withoutIdle(page);
    const errors = watchErrors(page);
    await page.goto(url);
    await expect(island(page, LAB)).toHaveAttribute('data-island', 'ready');
    await expect(baseline(page, LAB)).toHaveValue('5');
    await expect(rise(page, LAB)).toHaveValue('1');
    await expect(traffic(page, LAB)).toHaveValue('1000');
    await expect(result(page, LAB)).toHaveText('To catch a real rise from 5% to 6% in 8 tests out of 10, with a 1 in 20 risk of a false winner, at 1,000 visitors a day:');
    await expect(readoutN(page, LAB)).not.toHaveText(PRESET_N);
    await expect(weeks(page, LAB)).toHaveText(/^\d+$/);
    await expect(island(page, 'srm')).toHaveAttribute('data-island', 'idle');
    expect(errors).toEqual([]);
  });

  test('old keys (the duration Figure\'s traffic, the unit) neither load it nor change it, and nothing throws', async ({ page }) => {
    await withoutIdle(page);
    const errors = watchErrors(page);
    await page.goto(`${HOST}?duration.traffic=500&duration.preset=x&${LAB}.mode=relative`);
    await page.waitForTimeout(800);
    // planner.mode is a key in its namespace, so it loads the island; it is ignored there
    await expect(island(page, LAB)).toHaveAttribute('data-island', 'ready');
    await expect(traffic(page, LAB)).toHaveValue('100');
    await expect(weeks(page, LAB)).toHaveText('4');
    await expect(result(page, LAB)).toHaveText(LAB_PRESET_LINE);
    await expect(figure(page, LAB).getByRole('radio')).toHaveCount(0);
    expect(errors).toEqual([]);
    // the old duration key alone loads nothing
    await page.goto(`${HOST}?duration.traffic=500`);
    await page.waitForTimeout(800);
    await expect(island(page, LAB)).toHaveAttribute('data-island', 'idle');
    await expect(weeks(page, LAB)).toHaveText('4');
  });

  test('a hostile shared URL shows a valid triple, with no error', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${HOST}?${LAB}.baseline=0.98&${LAB}.risePoints=30&${LAB}.preset=toString&${LAB}.traffic=-Infinity`);
    await expect(island(page, LAB)).toHaveAttribute('data-island', 'ready');
    await expect(baseline(page, LAB)).toHaveValue('98');
    await expect(rise(page, LAB)).toHaveValue('1');
    await expect(rise(page, LAB)).toHaveAttribute('max', '1');
    await expect(traffic(page, LAB)).toHaveValue('1');
    await expect(result(page, LAB)).toHaveText('To catch a real rise from 98% to 99% in 8 tests out of 10, with a 1 in 20 risk of a false winner, at 1 visitor a day:');
    await expect(weeks(page, LAB)).toHaveText(/^[\d,]+$/);
    expect(errors).toEqual([]);
  });

  test('cross-input cap and keys: every change writes all three keys, and no other', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(`${HOST}?other.keep=1#note`);
    await ready(page, LAB);
    const expectUrl = async (b: string, r: string, t: string) => {
      // the writes are debounced: wait for all three, not only the one that changed first
      await expect
        .poll(() => [`${LAB}.baseline`, `${LAB}.risePoints`, `${LAB}.traffic`].map((k) => query(page).get(k)))
        .toEqual([b, r, t]);
      expect(ownKeys(page, LAB)).toEqual([`${LAB}.baseline`, `${LAB}.risePoints`, `${LAB}.traffic`]);
      expect(ownKeys(page, 'duration')).toEqual([]);
      expect(query(page).get('other.keep')).toBe('1');
      expect(new URL(page.url()).hash).toBe('#note');
    };
    await typeExact(page, 'Sign-up rate today, percent', '98', LAB);
    await expect(rise(page, LAB)).toHaveValue('1');
    await expect(rise(page, LAB)).toHaveAttribute('max', '1');
    await expect(result(page, LAB)).toContainText('from 98% to 99%');
    await expectUrl('0.98', '1', '100');
    await typeExact(page, 'Sign-up rate today, percent', '29', LAB);
    await expect(rise(page, LAB)).toHaveValue('1');
    await expect(rise(page, LAB)).toHaveAttribute('max', '30');
    await expect(figure(page, LAB).locator('[data-slider-readout]').nth(1)).toHaveText('Up 1 point, to 30%');
    await expectUrl('0.29', '1', '100');
    await typeExact(page, 'Visitors per day, exact value', '500', LAB);
    await expect(weeks(page, LAB)).toHaveText(/^\d+$/);
    await expectUrl('0.29', '1', '500');
  });

  test('on /lab the sign-up rate box takes whole percents: typing 30 sets 30%, and the URL keeps the proportion', async ({ page }) => {
    await withoutIdle(page);
    const errors = watchErrors(page);
    await page.goto('/lab');
    await ready(page, LAB);
    const box = figure(page, LAB).getByRole('spinbutton', { name: 'Sign-up rate today, percent' });
    await expect(box).toHaveValue('29');
    await expect(box).toHaveAttribute('min', '1');
    await expect(box).toHaveAttribute('max', '98');
    await typeExact(page, 'Sign-up rate today, percent', '30', LAB);
    await expect(box).toHaveValue('30');
    await expect(baseline(page, LAB)).toHaveValue('30');
    await expect(figure(page, LAB).locator('[data-slider-readout]').first()).toHaveText('30% of visitors');
    await expect(rise(page, LAB)).toHaveValue('5');
    await expect(result(page, LAB)).toContainText('from 30% to 35%');
    await expect.poll(() => query(page).get(`${LAB}.baseline`)).toBe('0.3');
    expect(query(page).get(`${LAB}.risePoints`)).toBe('5');
    expect(errors).toEqual([]);
  });

  test('keyboard: focus moving into the preview loads the island and stays on the slider; a key release announces the line and both readouts once', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(HOST);
    await expect(island(page, LAB)).toHaveAttribute('data-island', 'idle');
    await baseline(page, LAB).focus();
    await expect(island(page, LAB)).toHaveAttribute('data-island', 'ready');
    await expect(baseline(page, LAB)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(baseline(page, LAB)).toHaveValue('30');
    await expect(live(page, LAB)).toHaveText(LAB_RESULT);
    const n = await readoutN(page, LAB).textContent();
    const w = await weeks(page, LAB).textContent();
    await expect(live(page, LAB)).toHaveText(new RegExp(`from 30% to 35% .* at 100 visitors a day: ${n} visitors per group and ${w} weeks?$`));
    await expect(live(page, LAB)).toHaveAttribute('data-derived', 'simulated');
    // the traffic moves only the weeks
    await traffic(page, LAB).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(traffic(page, LAB)).toHaveValue('99');
    await expect(live(page, LAB)).toHaveText(new RegExp(`at 99 visitors a day: ${n} visitors per group and \\d+ weeks?$`));
    await expect(readoutN(page, LAB)).toHaveText(n!);
    await expect.poll(() => query(page).get(`${LAB}.traffic`)).toBe('99');
  });

  for (const control of ['traffic slider', 'Reset'] as const) {
    test(`keyboard: focus on the preview's ${control} moves to the island's, never resting on <body>`, async ({ page }) => {
      await withoutIdle(page);
      await page.goto(HOST);
      await expect(island(page, LAB)).toHaveAttribute('data-island', 'idle');
      await page.evaluate(() => {
        const w = window as unknown as { bodyFrames: number; watching: boolean };
        w.bodyFrames = 0;
        w.watching = false;
        document.addEventListener('focusin', () => (w.watching = true), { once: true });
        const tick = () => {
          if (w.watching && document.activeElement === document.body) w.bodyFrames++;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const target = control === 'Reset' ? reset(page, LAB) : traffic(page, LAB);
      await target.focus();
      await expect(island(page, LAB)).toHaveAttribute('data-island', 'ready');
      await expect(target).toBeFocused();
      expect(await page.locator(`#${LAB} [data-planner-controls]`).count()).toBe(1);
      await page.waitForTimeout(200);
      expect(await page.evaluate(() => (window as unknown as { bodyFrames: number }).bodyFrames)).toBe(0);
    });
  }

  test('Reset restores all three values, clears only its keys and announces the preset', async ({ page }) => {
    await page.goto(`${HOST}?${LAB}.baseline=0.5&${LAB}.risePoints=12&${LAB}.traffic=500&srm.nA=40&other.keep=1#note`);
    await expect(island(page, LAB)).toHaveAttribute('data-island', 'ready');
    await expect(traffic(page, LAB)).toHaveValue('500');
    await reset(page, LAB).click();
    await expect(baseline(page, LAB)).toHaveValue('29');
    await expect(rise(page, LAB)).toHaveValue('5');
    await expect(traffic(page, LAB)).toHaveValue('100');
    await expect(readoutN(page, LAB)).toHaveText(PRESET_N);
    await expect(weeks(page, LAB)).toHaveText('4');
    await expect(live(page, LAB)).toHaveText(`${LAB_PRESET_LINE} 1,353 visitors per group and 4 weeks`);
    expect(ownKeys(page, LAB)).toEqual([]);
    expect(query(page).get('srm.nA')).toBe('40');
    expect(query(page).get('other.keep')).toBe('1');
    expect(new URL(page.url()).hash).toBe('#note');
  });

  test('drag: both readouts follow within 200 ms, with no announcement and no transition until release', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(`${HOST}?${LAB}.traffic=100`);
    await expect(island(page, LAB)).toHaveAttribute('data-island', 'ready', { timeout: 15_000 });
    await expect(live(page, LAB)).toHaveText('');
    await figure(page, LAB).evaluate((root) => {
      const w = window as unknown as { lat: number[]; announcedDuringDrag: string[]; animationsDuringDrag: number };
      w.lat = [];
      w.announcedDuringDrag = [];
      w.animationsDuringDrag = 0;
      let inputAt: number | null = null;
      root.addEventListener('input', () => {
        inputAt = performance.now();
      }, true);
      const n = root.querySelector('[data-figure-body] [data-planner-n]')!;
      new MutationObserver(() => {
        if (inputAt !== null) {
          w.lat.push(performance.now() - inputAt);
          inputAt = null;
        }
        if (root.hasAttribute('data-dragging')) w.animationsDuringDrag += root.getAnimations({ subtree: true }).length;
      }).observe(n, { characterData: true, childList: true, subtree: true });
      const announcement = root.querySelector('[data-figure-announcement]')!;
      new MutationObserver(() => {
        if (root.hasAttribute('data-dragging')) w.announcedDuringDrag.push(announcement.textContent ?? '');
      }).observe(announcement, { characterData: true, childList: true, subtree: true });
    });
    await rise(page, LAB).scrollIntoViewIfNeeded();
    const box = (await rise(page, LAB).boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.1, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, y, { steps: 8 });
    await expect(figure(page, LAB)).toHaveAttribute('data-dragging', '');
    await expect(live(page, LAB)).toHaveText('');
    await expect(figure(page, LAB).locator('[data-slider-readout]').nth(1)).toHaveText(/^Up \d+ points?, to \d+%$/);
    const transitions = await figure(page, LAB)
      .locator('[data-planner-readout], [data-figure-result]')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).transitionDuration));
    expect(transitions.every((d) => d.split(',').every((part) => part.trim() === '0s'))).toBe(true);
    await page.mouse.up();
    await expect(figure(page, LAB)).not.toHaveAttribute('data-dragging');
    await expect(live(page, LAB)).toHaveText(LAB_RESULT);
    const stats = await page.evaluate(() => {
      const w = window as unknown as { lat: number[]; announcedDuringDrag: string[]; animationsDuringDrag: number };
      return { lat: w.lat, announced: w.announcedDuringDrag, animations: w.animationsDuringDrag };
    });
    expect(stats.lat.length).toBeGreaterThan(0);
    expect(Math.max(...stats.lat)).toBeLessThan(200);
    expect(stats.announced).toEqual([]);
    expect(stats.animations).toBe(0);
    await expect.poll(() => query(page).get(`${LAB}.risePoints`)).toMatch(/^\d+$/);
  });

  test('a failed island on intent brings back the no-JS preset, and focus goes to the open table', async ({ page }) => {
    await withoutIdle(page);
    watchErrors(page, CHUNK_ERRORS);
    let block = false;
    await page.route('**/_next/static/**/*.js', (route) => (block ? route.abort() : route.continue()));
    await page.goto(HOST);
    await page.waitForLoadState('load');
    await page.waitForTimeout(500);
    block = true;
    await baseline(page, LAB).focus();
    await expect(page.locator('[data-island="failed"]', { has: figure(page, LAB) })).toHaveCount(1);
    await expect(figure(page, LAB).locator('[data-nojs-only] [role="region"]')).toBeFocused();
    await expect(figure(page, LAB).getByText('Controls need JavaScript.')).toBeVisible();
    await expect(figure(page, LAB).getByRole('group', { name: 'Controls' })).toBeHidden();
    await expect(readoutN(page, LAB)).toHaveText(PRESET_N);
    await expect(weeks(page, LAB)).toHaveText('4');
  });

  test('a failed eager island brings back the preset, not the shared values, and takes no focus', async ({ page, request }) => {
    await withoutIdle(page);
    watchErrors(page, CHUNK_ERRORS);
    const url = `${HOST}?${LAB}.baseline=0.4&${LAB}.traffic=500`;
    const html = await (await request.get(url)).text();
    const named = new Set([...html.matchAll(/\/_next\/static\/[^"'\s]+\.js/g)].map((m) => m[0]));
    await page.route('**/_next/static/**/*.js', (route) =>
      named.has(new URL(route.request().url()).pathname) ? route.continue() : route.abort(),
    );
    await page.goto(url);
    await expect(page.locator('[data-island="failed"]', { has: figure(page, LAB) })).toHaveCount(1);
    await expect(figure(page, LAB).locator('[data-nojs-only] table')).toContainText(PRESET_N);
    await expect(result(page, LAB)).toHaveText(LAB_PRESET_LINE);
    await expect(weeks(page, LAB)).toHaveText('4');
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  });

  test('a readout that throws after a keyboard change: the sentence takes focus, the current table shows, no readouts and no controls', async ({ page }) => {
    const errors = watchErrors(page, [LAB_FAILURE]);
    await page.goto(FAULTS);
    await ready(page, LAB);
    await baseline(page, LAB).focus();
    await page.keyboard.press('ArrowRight');
    const status = figure(page, LAB).getByRole('status');
    await expect(status).toHaveText(SENTENCE);
    await expect(status).toBeFocused();
    await assertLabFallback(page, '30');
    // the Retention pair on the same host is its own island and keeps working
    await expect(figure(page, ID).getByRole('status')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('a readout that throws after a pointer change: focus is the sentence or where the click put it, never a hidden control', async ({ page }) => {
    const errors = watchErrors(page, [LAB_FAILURE]);
    await page.goto(FAULTS);
    await ready(page, LAB);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await traffic(page, LAB).scrollIntoViewIfNeeded();
    const box = (await traffic(page, LAB).boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
    const status = figure(page, LAB).getByRole('status');
    await expect(status).toHaveText(SENTENCE);
    const focus = await page.evaluate((id) => {
      const a = document.activeElement;
      const figureRoot = document.getElementById(id)!;
      const clickTarget = figureRoot.parentElement?.closest('[tabindex]') ?? null;
      return {
        what: a === null ? 'null' : `${a.tagName.toLowerCase()}#${a.id}[role=${a.getAttribute('role')}]`,
        body: a === document.body,
        status: a?.getAttribute('role') === 'status' && figureRoot.contains(a),
        clickTarget: a !== null && a === clickTarget && !figureRoot.contains(a),
        hidden: a instanceof HTMLElement && a !== document.body && !a.checkVisibility(),
      };
    }, LAB);
    expect(focus.body || focus.status || focus.clickTarget, focus.what).toBe(true);
    expect(focus.hidden).toBe(false);
    // the baseline did not move; the traffic row of the current table did
    await assertLabFallback(page, '29');
    const trafficRow = figure(page, LAB).locator('[data-figure-fallback] tbody tr').nth(4).locator('td[data-num]');
    await expect(trafficRow).not.toHaveText('100');
    expect(errors).toEqual([]);
  });

  test('no number escapes its source marker, shown or hidden, before and after the island loads', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(HOST);
    const stray = () => strayNumbers(page, '#sample-size [data-lab-exhibit]');
    expect(await stray()).toEqual([]);
    await ready(page, LAB);
    await traffic(page, LAB).focus();
    await page.keyboard.press('ArrowRight');
    await expect(live(page, LAB)).toHaveText(LAB_RESULT);
    expect(await stray()).toEqual([]);
  });

  test('axe finds no violations in the preview or the loaded island', async ({ page }) => {
    // Two full-page scans of the Lab page (four Figures), as the kit's own axe tests allow for.
    test.setTimeout(90_000);
    await withoutIdle(page);
    await page.goto(HOST);
    await expectNoA11yViolations(page);
    await ready(page, LAB);
    await traffic(page, LAB).focus();
    await page.keyboard.press('ArrowRight');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoA11yViolations(page);
  });
});

/** Every digit in the planner's text or its labels that no source marker covers. */
async function strayNumbers(page: Page, rootSelector: string) {
  return page.evaluate((selector) => {
    const out: string[] = [];
    const roots = document.querySelectorAll(selector);
    if (roots.length === 0) out.push(`no ${selector}`);
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const parent = n.parentElement!;
        if (parent.closest('code')) continue;
        if (/\d/.test(n.textContent ?? '') && !parent.closest('[data-derived], [data-fact]')) out.push(n.textContent!.trim());
      }
      for (const el of root.querySelectorAll('*')) {
        for (const name of ['aria-label', 'aria-valuetext', 'title']) {
          const v = el.getAttribute(name);
          if (v && /\d/.test(v) && !el.closest('[data-derived], [data-fact]')) out.push(`${name}=${v}`);
        }
      }
    }
    return out;
  }, rootSelector);
}

/** The Lab Figure's fallback after a failure: the current table, the caption, no readouts and no controls. */
async function assertLabFallback(page: Page, baselinePercent: string) {
  const f = figure(page, LAB);
  await expect(f.getByRole('heading', { level: 3 })).toHaveText('Smaller rises need more visitors and more weeks');
  await expect(f.locator('figcaption > p').first()).toContainText('Made-up numbers to plan with.');
  // the method stays one click deeper, after the Figure
  await expect(page.locator('[data-lab-exhibit]', { has: f }).locator('[data-method-text]').first()).toContainText("Cohen's h");
  const fallbackTable = f.locator('[data-figure-fallback] table');
  await expect(fallbackTable).toBeVisible();
  await expect(fallbackTable.locator('tbody tr').first().locator('td[data-num]')).toHaveText(baselinePercent);
  await expect(f.locator('[data-figure-preview]')).toHaveCount(0);
  await expect(f.locator('[data-planner-n]')).toHaveCount(0);
  await expect(f.locator('[data-duration-weeks]')).toHaveCount(0);
  await expect(f.getByRole('group', { name: 'Controls' })).toBeHidden();
  await expect(f.locator('[data-figure-result]')).toBeHidden();
  await expect(f.getByText('Controls need JavaScript.')).toBeHidden();
  await expect(f).not.toContainText(LAB_FAILURE);
  await expect(page.locator('[data-island="failed"]')).toHaveCount(0);
  await expect(island(page, LAB)).toHaveAttribute('data-island', 'ready');
}

/** The sizing Figure's fallback after a failure: the current table, the caption, no readout and no controls. */
async function assertSizingFallback(page: Page, baselinePercent: string) {
  const f = figure(page);
  await expect(f.getByRole('heading', { level: 3 })).toHaveText('Smaller rises need more customers per group');
  // the caption, with its method, stays
  await expect(f.locator('figcaption > p').first()).toContainText('The preset is a hypothetical uplift on an observed baseline.');
  await expect(f.locator('figcaption > p').first()).toContainText("Cohen's h");
  const fallbackTable = f.locator('[data-figure-fallback] table');
  await expect(fallbackTable).toBeVisible();
  await expect(fallbackTable.locator('tbody tr').first().locator('td[data-num]')).toHaveText(baselinePercent);
  await expect(fallbackTable).not.toContainText(PRESET_N);
  await expect(f.locator('[data-figure-preview]')).toHaveCount(0);
  await expect(f.locator('[data-planner-n]')).toHaveCount(0);
  await expect(f.getByRole('group', { name: 'Controls' })).toBeHidden();
  await expect(f.locator('[data-figure-result]')).toBeHidden();
  await expect(f.getByText('Controls need JavaScript.')).toBeHidden();
  await expect(f).not.toContainText(SIZING_FAILURE);
  await expect(page.locator('[data-island="failed"]')).toHaveCount(0);
  await expect(island(page)).toHaveAttribute('data-island', 'ready');
}
