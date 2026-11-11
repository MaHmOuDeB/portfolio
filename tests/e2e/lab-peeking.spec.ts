import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { expectNoA11yViolations, test } from './fixtures';

// The peeking Figure on the dev host /kitchen-sink/lab/peeking, mounted as the Lab's deep link
// mounts it: "More looks, more false winners", a lookup of seeded A/A simulations (1,000 runs, seed
// 42, both groups at 35%, 100 visitors per group per daily look). Controls: Looks 1 to 50 (preset
// 20), Schedule (Peek daily or Look once), Fix (None, O'Brien-Fleming, Confidence sequence) and
// Reset. The server draws the preset (daily, 20 looks, no fix: 22.1%); the island loads on intent,
// or at once when the URL holds `peeking.` keys. /kitchen-sink/lab/peeking/faults sets the test seam,
// so the chart throws on the first render after a committed change.

const HOST = '/kitchen-sink/lab/peeking';
const FAULTS = '/kitchen-sink/lab/peeking/faults';
const ID = 'peeking';
const TITLE = 'More looks, more false winners';
const SENTENCE = 'This chart could not load. The numbers are in the table below.';
const SEAM_FAILURE = 'The peeking chart failed after a change (test seam)';
const PRESET_LINE = /^Under these simulation assumptions, 22\.1% of 1,000 runs found a false winner by look 20 \(95% Monte Carlo range [\d.]+% to [\d.]+%\): above the nominal 5%\.$/;
const TABLE_KEY = 'daily/naive/20';
// Engine markers that survive minification: a validation string literal and sfc32's seed constant.
const SEED_CONSTANTS = ['nPerLook must be', '2654435769', '0x9e3779b9'];

const figure = (page: Page) => page.locator(`figure[data-figure="${ID}"]`);
const island = (page: Page) => page.locator('[data-island]', { has: figure(page) });
const looks = (page: Page) => figure(page).getByRole('slider', { name: 'Looks' });
const radio = (page: Page, name: string) => figure(page).getByRole('radio', { name, exact: true });
const label = (page: Page, name: string) => figure(page).locator('label[data-segment]', { hasText: name });
const result = (page: Page) => figure(page).locator('[data-figure-result]');
const live = (page: Page) => figure(page).locator('[data-figure-announcement]');
const caption = (page: Page) => figure(page).locator('figcaption > p').first();
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

const CHUNK_ERRORS = ['chunk', 'Chunk', 'Failed to fetch', 'dynamically imported module', 'Importing a module script failed'];

async function withoutIdle(page: Page) {
  await page.addInitScript(() => {
    window.requestIdleCallback = () => 0;
    window.cancelIdleCallback = () => {};
  });
}

/** Waits until React has hydrated the island's root, so a focus or a key reaches its handlers. */
async function hydrated(page: Page) {
  await page.waitForFunction((id) => {
    const root = document.querySelector(`[data-island]:has(figure[data-figure="${id}"])`);
    return root !== null && Object.keys(root).some((k) => k.startsWith('__react'));
  }, ID);
}

async function ready(page: Page) {
  await figure(page).locator('h3').hover();
  await expect(island(page)).toHaveAttribute('data-island', 'ready');
}

type Tuple = {
  chart: { looks: number; mode: string; fix: string; ghostLooks: number; ghostNPerLook: number; selectedLooks: number; selectedNPerLook: number };
  dot: { look: number; value: number };
  result: { looks: number; mode: string; fix: string; rate: number; text: string };
  table: string[][];
  slider: number;
  mode: string;
  fix: string;
};

/** Everything on screen that states the current view, read in one task. */
async function tuple(page: Page): Promise<Tuple> {
  return figure(page).evaluate((root) => {
    const chart = root.querySelector<HTMLElement>('[data-peek-chart]')!;
    const dot = [...root.querySelectorAll<SVGCircleElement>('circle[data-series="current"]')].find((c) => c.closest('svg[data-chart-frame]')!.checkVisibility())!;
    const line = root.querySelector<HTMLElement>('[data-peek-result]')!;
    const table = [...root.querySelectorAll('[data-js-only][data-figure-tables] tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent ?? ''));
    const n = (el: Element, name: string) => Number(el.getAttribute(name));
    const checked = (name: string) => root.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? '';
    return {
      chart: {
        looks: n(chart, 'data-looks'),
        mode: chart.dataset.mode!,
        fix: chart.dataset.fix!,
        ghostLooks: n(chart, 'data-ghost-looks'),
        ghostNPerLook: n(chart, 'data-ghost-n-per-look'),
        selectedLooks: n(chart, 'data-selected-looks'),
        selectedNPerLook: n(chart, 'data-selected-n-per-look'),
      },
      dot: { look: n(dot, 'data-look'), value: n(dot, 'data-value') },
      result: { looks: n(line, 'data-looks'), mode: line.dataset.mode!, fix: line.dataset.fix!, rate: n(line, 'data-rate'), text: root.querySelector('[data-figure-result]')!.textContent!.replace(/\s+/g, ' ').trim() },
      table,
      slider: Number(root.querySelector<HTMLInputElement>('input[type="range"]')!.value),
      mode: checked('peeking-mode'),
      fix: checked('peeking-fix'),
    };
  });
}

/** The view on screen is one tuple: controls, chart, result line and table agree. */
function expectOneTuple(t: Tuple) {
  const L = t.slider;
  expect(t.chart).toMatchObject({ looks: L, mode: t.mode, fix: t.fix });
  expect(t.result).toMatchObject({ looks: L, mode: t.mode, fix: t.fix, rate: t.dot.value });
  expect(t.dot.look).toBe(L);
  expect(t.chart.ghostLooks).toBe(L);
  expect(t.chart.ghostNPerLook).toBe(100);
  const rate = `${(Math.round(t.dot.value * 1000) / 10).toFixed(1)}%`;
  expect(t.result.text.startsWith(`Under these simulation assumptions, ${rate} of 1,000 runs found a false winner`)).toBe(true);
  const last = t.table.at(-1)!;
  expect(Number(last[0])).toBe(L);
  // the table prints one decimal at most; the chart's value is the same share
  expect(Number(last.at(-1))).toBeCloseTo(t.dot.value * 100, 6);
  if (t.mode === 'once') {
    expect(t.chart).toMatchObject({ selectedLooks: 1, selectedNPerLook: 100 * L });
    expect(t.result.text).toContain(`at one look after ${(100 * L).toLocaleString('en-GB')} visitors per group`);
    expect(t.table).toHaveLength(L + 1);
    expect(last[1]).toBe('One look at the end');
  } else {
    expect(t.chart).toMatchObject({ selectedLooks: L, selectedNPerLook: 100 });
    expect(t.result.text).toContain(`by look ${L} `);
    expect(t.table).toHaveLength(L);
  }
}

/** Every numeral the Figure shows in text sits under a simulated marker. */
async function unmarkedNumerals(root: Locator): Promise<string[]> {
  return root.evaluate((el) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement!;
      if (parent.closest('style, script') || !/\d/.test(node.textContent ?? '')) continue;
      const marker = parent.closest('[data-derived]');
      if (marker === null || !marker.getAttribute('data-derived')!.split(' ').includes('simulated')) out.push(node.textContent!.trim());
    }
    return out;
  });
}

/** The stale deck figure never appears in the words a visitor or a screen reader gets. */
async function expectNoStale25(page: Page) {
  const f = figure(page);
  for (const part of [f.locator('h3'), result(page), caption(page), live(page)]) {
    expect(await part.textContent()).not.toMatch(/(?<![\d.])25\s?%/);
    expect(await part.locator('data[value="0.25"], data[value=".25"]').count()).toBe(0);
  }
}

test.describe('Peeking Figure', () => {
  test('without JavaScript: the preset, the open table and "Controls need JavaScript.", whatever the query', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${HOST}?${ID}.looks=50&${ID}.mode=once`);
    await expect(figure(page).getByRole('heading', { level: 3 })).toHaveText(TITLE);
    await expect(result(page)).toHaveText(PRESET_LINE);
    await expect(figure(page).getByText('Simulated', { exact: true })).toBeVisible();
    await expect(figure(page).getByText('Controls need JavaScript.')).toBeVisible();
    const table = figure(page).locator('[data-nojs-only] table');
    await expect(table).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(20);
    await expect(table.locator('tbody tr').last()).toHaveText(/20\s*22\.1/);
    await expect(figure(page).getByRole('group', { name: 'Controls' })).toBeHidden();
    await expect(caption(page)).toContainText('Idea credited to Evan Miller, “How Not To Run an A/B Test”.');
    expect(await unmarkedNumerals(figure(page))).toEqual([]);
    await expectNoStale25(page);
    await context.close();
  });

  test('lazy: idle until the pointer arrives; the table arrives only with the island, and no simulation code ever does', async ({ page }) => {
    await withoutIdle(page);
    const errors = watchErrors(page);
    // Every script the page receives, by phase: while it loads, while it waits for intent, after it.
    // The router may fetch unrelated route code while the page waits (WebKit did once), so the test
    // holds the island's own code to the rule: the table, never before intent.
    const scripts: { phase: 'load' | 'idle' | 'intent'; body: Promise<string> }[] = [];
    let phase: 'load' | 'idle' | 'intent' = 'load';
    page.on('response', (response) => {
      if (response.request().resourceType() !== 'script') return;
      scripts.push({ phase, body: response.text().catch(() => '') });
    });
    await page.goto(HOST);
    await page.waitForLoadState('networkidle');
    phase = 'idle';
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    await page.waitForTimeout(500);
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    phase = 'intent';
    await ready(page);
    await expect(radio(page, 'Peek daily')).toBeChecked();
    const bodies = await Promise.all(scripts.map(async (s) => ({ phase: s.phase, body: await s.body })));
    const early = bodies.filter((b) => b.phase !== 'intent');
    const late = bodies.filter((b) => b.phase === 'intent');
    expect(early.filter((b) => b.phase === 'load').length).toBeGreaterThan(0);
    expect(late.length).toBeGreaterThan(0);
    // the precomputed table is in the island's code only, fetched on intent, never before
    expect(early.filter((b) => b.body.includes(TABLE_KEY)).map((b) => b.phase)).toEqual([]);
    expect(late.filter((b) => b.body.includes(TABLE_KEY)).length).toBeGreaterThan(0);
    for (const { body } of bodies) for (const term of SEED_CONSTANTS) expect(body).not.toContain(term);
    expect(errors).toEqual([]);
  });

  test('eager: its own keys load the island after hydration and draw the shared view', async ({ page, request }) => {
    const html = await (await request.get(`${HOST}?${ID}.looks=50&${ID}.fix=cs`)).text();
    expect(html).toContain('data-island="idle"');
    await withoutIdle(page);
    const errors = watchErrors(page);
    await page.goto(`${HOST}?${ID}.looks=50&${ID}.fix=cs`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(looks(page)).toHaveValue('50');
    await expect(radio(page, 'Confidence sequence')).toBeChecked();
    await expect(result(page)).toContainText('found a false winner by look 50');
    await expect(result(page)).toContainText('well under the nominal 5%.');
    await expect(result(page)).toContainText("At the planned sample, the confidence sequence's interval is about 55% wider than a single fixed test's.");
    expectOneTuple(await tuple(page));
    expect(errors).toEqual([]);
  });

  test('the interview deep link loads at once, draws daily, 20 looks, no fix, and Reset keeps it', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(`${HOST}?${ID}.preset=interview&planner.baseline=0.4#peeking`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(looks(page)).toHaveValue('20');
    await expect(radio(page, 'Peek daily')).toBeChecked();
    await expect(radio(page, 'None')).toBeChecked();
    await expect(result(page)).toHaveText(PRESET_LINE);
    await looks(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => query(page).get(`${ID}.looks`)).toBe('21');
    await figure(page).getByRole('button', { name: 'Reset' }).click();
    await expect(looks(page)).toHaveValue('20');
    const url = new URL(page.url());
    expect([...url.searchParams.keys()].filter((k) => k.startsWith(`${ID}.`))).toEqual([`${ID}.preset`]);
    expect(url.searchParams.get(`${ID}.preset`)).toBe('interview');
    expect(url.searchParams.get('planner.baseline')).toBe('0.4');
    expect(url.hash).toBe('#peeking');
  });

  test("other Figures' keys, near misses and bare keys do not load it", async ({ page }) => {
    await withoutIdle(page);
    await page.goto(`${HOST}?planner.baseline=0.4&${ID}x.looks=5&looks=5`);
    await page.waitForLoadState('load');
    await page.waitForTimeout(800);
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    await expect(result(page)).toHaveText(PRESET_LINE);
  });

  test('a hostile shared URL draws values inside the schema, with no error', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${HOST}?${ID}.looks=999&${ID}.mode=__proto__&${ID}.fix=toString&${ID}.preset=constructor`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(looks(page)).toHaveValue('50');
    await expect(radio(page, 'Peek daily')).toBeChecked();
    await expect(radio(page, 'None')).toBeChecked();
    expectOneTuple(await tuple(page));
    await page.goto(`${HOST}?${ID}.looks=-3&${ID}.mode=ONCE`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(looks(page)).toHaveValue('1');
    await expect(radio(page, 'Peek daily')).toBeChecked();
    expect(errors).toEqual([]);
  });

  test('the boundaries: one look is the fixed design on a nondegenerate axis, fifty is the last', async ({ page }) => {
    await page.goto(`${HOST}?${ID}.looks=1&${ID}.fix=obf`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(result(page)).toContainText('found a false winner by look 1 ');
    await expect(result(page)).toContainText('With one look there is no extra bar: this is the fixed design.');
    await expect(result(page)).not.toContainText('higher');
    const xTicks = () => figure(page).locator('svg[data-chart-frame]:visible [data-tick="x"]').allTextContents();
    expect(await xTicks()).toEqual(['1']);
    expectOneTuple(await tuple(page));
    await looks(page).focus();
    await page.keyboard.press('End');
    await expect(looks(page)).toHaveValue('50');
    await expect(result(page)).toContainText('found a false winner by look 50 ');
    await expect(result(page)).toContainText('At the last look the bar for a winner is about 11% higher than for one look at the end; early looks need stronger evidence.');
    expect((await xTicks()).at(-1)).toBe('50');
    expectOneTuple(await tuple(page));
    await page.keyboard.press('ArrowRight');
    await expect(looks(page)).toHaveValue('50');
    await page.keyboard.press('Home');
    await expect(looks(page)).toHaveValue('1');
    expectOneTuple(await tuple(page));
  });

  test('looking once keeps the looks, disables the fix with its reason, keeps the total sample and the fix for later', async ({ page }) => {
    await page.goto(`${HOST}?${ID}.fix=obf`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await label(page, 'Look once').click();
    await expect(radio(page, 'Look once')).toBeChecked();
    // the native fieldset is disabled, and with it every one of its radios
    const fix = figure(page).getByRole('group', { name: 'Fix' });
    await expect(fix).toHaveAttribute('disabled', '');
    for (const name of ['None', "O'Brien-Fleming", 'Confidence sequence']) await expect(radio(page, name)).toBeDisabled();
    await expect(figure(page).getByText('One look at the end needs no fix.')).toBeVisible();
    await expect(looks(page)).toBeEnabled();
    await expect(radio(page, "O'Brien-Fleming")).toBeChecked();
    await expect(result(page)).toContainText('found a false winner at one look after 2,000 visitors per group');
    await expect(result(page)).not.toContainText('higher');
    await expect.poll(() => query(page).get(`${ID}.fix`)).toBe('obf');
    await expect.poll(() => query(page).get(`${ID}.mode`)).toBe('once');
    expectOneTuple(await tuple(page));
    await label(page, 'Peek daily').click();
    await expect(fix).not.toHaveAttribute('disabled');
    await expect(radio(page, 'None')).toBeEnabled();
    await expect(radio(page, "O'Brien-Fleming")).toBeChecked();
    await expect(result(page)).toContainText('close to or under the nominal 5%.');
    await expect(figure(page).getByText('One look at the end needs no fix.')).toBeHidden();
  });

  test('once at 20 and at 50 looks: chart, result, table and caption agree, with 2,000 and 5,000 per group', async ({ page }) => {
    for (const [L, n] of [[20, '2,000'], [50, '5,000']] as const) {
      await page.goto(`${HOST}?${ID}.mode=once&${ID}.looks=${L}`);
      await expect(island(page)).toHaveAttribute('data-island', 'ready');
      const t = await tuple(page);
      expectOneTuple(t);
      // the selected schedule: one look after the daily schedule's total
      expect(t.chart).toMatchObject({ selectedLooks: 1, selectedNPerLook: 100 * L });
      // the comparison schedule, the daily ghost, by its own metadata
      expect(t.chart).toMatchObject({ ghostLooks: L, ghostNPerLook: 100 });
      await expect(caption(page)).toContainText(`Looking once means one check after ${n} visitors per group.`);
      await expect(caption(page)).toContainText(`The pale line is the comparison schedule: ${L} daily looks of 100 visitors per group with no fix.`);
      await expect(result(page)).toContainText(`at one look after ${n} visitors per group`);
      const ghost = figure(page).locator('svg[data-chart-frame]:visible path[data-series="ghost"]');
      expect((await ghost.getAttribute('data-values'))!.split(' ')).toHaveLength(L);
      await expect(figure(page).locator('svg[data-chart-frame]:visible path[data-series="selected"]')).toHaveCount(0);
      expect(await unmarkedNumerals(figure(page))).toEqual([]);
    }
  });

  test('rapid changes never show a mixed view: every commit is one tuple', async ({ page }) => {
    await page.goto(`${HOST}?${ID}.looks=10`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    // Check the tuple after every DOM mutation, in the same task as React's commit.
    await figure(page).evaluate((root) => {
      const w = window as unknown as { mismatches: string[]; checks: number };
      w.mismatches = [];
      w.checks = 0;
      new MutationObserver(() => {
        const chart = root.querySelector<HTMLElement>('[data-peek-chart]');
        const line = root.querySelector<HTMLElement>('[data-peek-result]');
        const rows = root.querySelectorAll('[data-js-only][data-figure-tables] tbody tr');
        if (!chart || !line) return;
        w.checks++;
        const last = rows[rows.length - 1]?.children[0]?.textContent;
        const a = `${chart.dataset.looks}/${chart.dataset.mode}/${chart.dataset.fix}`;
        const b = `${line.dataset.looks}/${line.dataset.mode}/${line.dataset.fix}`;
        if (a !== b || last !== chart.dataset.looks) w.mismatches.push(`${a} ${b} ${last}`);
      }).observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    await looks(page).focus();
    for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight', { delay: 0 });
    await label(page, "O'Brien-Fleming").click();
    await label(page, 'Look once').click();
    await label(page, 'Peek daily').click();
    await label(page, 'Confidence sequence').click();
    await looks(page).focus();
    for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowLeft', { delay: 0 });
    await label(page, 'Look once').click();
    await expect(looks(page)).toHaveValue('15');
    const t = await tuple(page);
    expectOneTuple(t);
    expect(t).toMatchObject({ mode: 'once', fix: 'cs' });
    const stats = await page.evaluate(() => {
      const w = window as unknown as { mismatches: string[]; checks: number };
      return { mismatches: w.mismatches, checks: w.checks };
    });
    expect(stats.checks).toBeGreaterThan(10);
    expect(stats.mismatches).toEqual([]);
    await expectNoStale25(page);
    expect(await unmarkedNumerals(figure(page))).toEqual([]);
  });

  test('keyboard: a key release announces the result as the line reads it; holding the key does not', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(HOST);
    await hydrated(page);
    await looks(page).focus();
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(looks(page)).toBeFocused();
    await expect(live(page)).toHaveText('');
    await page.keyboard.down('ArrowRight');
    await expect(looks(page)).toHaveValue('21');
    await expect(result(page)).toContainText('by look 21 ');
    await expect(live(page)).toHaveText('');
    await page.keyboard.up('ArrowRight');
    const line = (await result(page).textContent())!.replace(/\s+/g, ' ').trim();
    await expect(live(page)).toHaveText(line);
    await expect(live(page)).toHaveAttribute('data-derived', 'simulated');
    await expect.poll(() => query(page).get(`${ID}.looks`)).toBe('21');
    // a choice is a commit: it is announced at once
    await radio(page, 'Peek daily').focus();
    await page.keyboard.press('ArrowRight');
    await expect(radio(page, 'Look once')).toBeChecked();
    await expect(radio(page, 'Look once')).toBeFocused();
    await expect(live(page)).toContainText('at one look after 2,100 visitors per group');
    await expectNoStale25(page);
  });

  test('drag: the chart follows, with no announcement and no transition until release, and no compute request or worker', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { workers: number };
      w.workers = 0;
      for (const name of ['Worker', 'SharedWorker'] as const) {
        const Original = window[name];
        if (typeof Original !== 'function') continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any)[name] = function (...args: unknown[]) {
          w.workers++;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return new (Original as any)(...args);
        };
      }
    });
    await withoutIdle(page);
    await page.goto(HOST);
    await ready(page);
    // Script, fetch, XHR and socket requests, apart from the router's own prefetches of the header links.
    const requests: string[] = [];
    page.on('request', (r) => {
      if (['script', 'fetch', 'xhr', 'websocket', 'eventsource'].includes(r.resourceType()) && !r.url().includes('_rsc=')) {
        requests.push(`${r.resourceType()} ${r.url()}`);
      }
    });
    await figure(page).evaluate((root) => {
      const w = window as unknown as { announcedDuringDrag: string[]; animationsDuringDrag: number };
      w.announcedDuringDrag = [];
      w.animationsDuringDrag = 0;
      const announcement = root.querySelector('[data-figure-announcement]')!;
      new MutationObserver(() => {
        if (root.hasAttribute('data-dragging')) {
          // any text in the live region while the pointer is down is an announcement during the drag
          if ((announcement.textContent ?? '') !== '') w.announcedDuringDrag.push(announcement.textContent!);
          w.animationsDuringDrag += root.getAnimations({ subtree: true }).length;
        }
      }).observe(root, { characterData: true, childList: true, subtree: true, attributes: true });
    });
    const box = (await looks(page).boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, y, { steps: 8 });
    await expect(figure(page)).toHaveAttribute('data-dragging', '');
    await expect(live(page)).toHaveText('');
    const during = await tuple(page);
    expectOneTuple(during);
    const transitions = await figure(page)
      .locator('[data-mark], [data-figure-result]')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).transitionDuration));
    expect(transitions.every((d) => d.split(',').every((part) => part.trim() === '0s'))).toBe(true);
    await page.mouse.up();
    await expect(figure(page)).not.toHaveAttribute('data-dragging');
    await expect(live(page)).toHaveText(/^Under these simulation assumptions, [\d.]+% of 1,000 runs found a false winner by look \d+ /);
    await label(page, 'Confidence sequence').click();
    await label(page, 'Look once').click();
    await page.waitForTimeout(600);
    const stats = await page.evaluate(() => {
      const w = window as unknown as { announcedDuringDrag: string[]; animationsDuringDrag: number; workers: number };
      return { announcedDuringDrag: w.announcedDuringDrag, animationsDuringDrag: w.animationsDuringDrag, workers: w.workers };
    });
    expect(stats.announcedDuringDrag).toEqual([]);
    expect(stats.animationsDuringDrag).toBe(0);
    expect(stats.workers).toBe(0);
    // the lookup computes in place: no script, fetch or worker after the island arrived
    expect(requests).toEqual([]);
  });

  test("Reset restores the preset, clears only its own keys and keeps another Figure's key and the hash", async ({ page }) => {
    await page.goto(`${HOST}?${ID}.looks=33&${ID}.mode=once&${ID}.fix=cs&planner.baseline=0.4#peeking`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await figure(page).getByRole('button', { name: 'Reset' }).click();
    await expect(looks(page)).toHaveValue('20');
    await expect(radio(page, 'Peek daily')).toBeChecked();
    await expect(radio(page, 'None')).toBeChecked();
    await expect(result(page)).toHaveText(PRESET_LINE);
    await expect(live(page)).toHaveText(PRESET_LINE);
    const url = new URL(page.url());
    expect([...url.searchParams.keys()].filter((k) => k.startsWith(`${ID}.`))).toEqual([]);
    expect(url.searchParams.get('planner.baseline')).toBe('0.4');
    expect(url.hash).toBe('#peeking');
  });

  for (const control of ['radio', 'Reset', 'slider'] as const) {
    test(`keyboard: focus on the preview's ${control} moves to the island's, never resting on <body>`, async ({ page }) => {
      await withoutIdle(page);
      await page.goto(HOST);
      await hydrated(page);
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
      const target = control === 'radio' ? radio(page, 'None') : control === 'slider' ? looks(page) : figure(page).getByRole('button', { name: 'Reset' });
      await target.focus();
      await expect(island(page)).toHaveAttribute('data-island', 'ready');
      await expect(target).toBeFocused();
      expect(await figure(page).locator('[data-peek-controls]').count()).toBe(1);
      await page.waitForTimeout(200);
      expect(await page.evaluate(() => (window as unknown as { bodyFrames: number }).bodyFrames)).toBe(0);
    });
  }

  test('a failed island on intent brings back the no-JS preset, and focus goes to the open table', async ({ page }) => {
    await withoutIdle(page);
    watchErrors(page, CHUNK_ERRORS);
    let block = false;
    await page.route('**/_next/static/**/*.js', (route) => (block ? route.abort() : route.continue()));
    await page.goto(HOST);
    await page.waitForLoadState('load');
    await page.waitForTimeout(500);
    block = true;
    await radio(page, 'None').focus();
    await expect(page.locator('[data-island="failed"]', { has: figure(page) })).toHaveCount(1);
    await expect(figure(page).locator('[data-nojs-only] [role="region"]')).toBeFocused();
    await expect(figure(page).getByText('Controls need JavaScript.')).toBeVisible();
    await expect(figure(page).getByRole('group', { name: 'Controls' })).toBeHidden();
    await expect(result(page)).toHaveText(PRESET_LINE);
    await expect(figure(page).locator('[data-nojs-only] table tbody tr')).toHaveCount(20);
  });

  test('a failed eager island brings back the preset, not the shared view, and takes no focus', async ({ page, request }) => {
    await withoutIdle(page);
    watchErrors(page, CHUNK_ERRORS);
    const html = await (await request.get(`${HOST}?${ID}.looks=50&${ID}.mode=once`)).text();
    const named = new Set([...html.matchAll(/\/_next\/static\/[^"'\s]+\.js/g)].map((m) => m[0]));
    await page.route('**/_next/static/**/*.js', (route) =>
      named.has(new URL(route.request().url()).pathname) ? route.continue() : route.abort(),
    );
    await page.goto(`${HOST}?${ID}.looks=50&${ID}.mode=once`);
    await expect(page.locator('[data-island="failed"]', { has: figure(page) })).toHaveCount(1);
    await expect(figure(page).getByText('Controls need JavaScript.')).toBeVisible();
    await expect(result(page)).toHaveText(PRESET_LINE);
    await expect(figure(page).locator('[data-nojs-only] table tbody tr')).toHaveCount(20);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  });

  test('a chart that throws after switching to once at 50 looks by keyboard: the sentence takes focus, the current table shows', async ({ page }) => {
    const errors = watchErrors(page, [SEAM_FAILURE]);
    await page.goto(`${FAULTS}?${ID}.looks=50`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await radio(page, 'Peek daily').focus();
    await page.keyboard.press('ArrowRight');
    const status = figure(page).getByRole('status');
    await expect(status).toHaveText(SENTENCE);
    await expect(status).toBeFocused();
    await assertOnce50Fallback(page);
    expect(errors).toEqual([]);
  });

  test('a chart that throws after switching to once at 50 looks by pointer: focus is the sentence or where it was, never a hidden control', async ({ page }) => {
    const errors = watchErrors(page, [SEAM_FAILURE]);
    await page.goto(`${FAULTS}?${ID}.looks=50`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    // Start with nothing focused, as the kit's own pointer test does.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await label(page, 'Look once').click();
    const status = figure(page).getByRole('status');
    await expect(status).toHaveText(SENTENCE);
    // Engines differ in what a click on a radio's label focuses: the radio (Chromium), which the
    // hidden controls take with them so the fallback takes focus, or the nearest focusable ancestor
    // of the click (WebKit: the page's <main>, outside the Figure). Never a control of the Figure,
    // never <body> unless it was there before.
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
    await assertOnce50Fallback(page);
    expect(errors).toEqual([]);
  });

  test('layout @matrix: no sideways scroll at this width or at 320 px, 44 px targets, the reason line keeps its room', async ({ page }) => {
    await page.goto(`${HOST}?${ID}.fix=obf`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    for (const width of [page.viewportSize()!.width, 320]) {
      await page.setViewportSize({ width, height: page.viewportSize()!.height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width} px`).toBe(true);
      const small = await figure(page)
        .locator('[data-peek-controls] [data-touch-target], [data-peek-controls] input[type="number"]')
        .evaluateAll((els) => els.filter((el) => (el as HTMLElement).checkVisibility()).map((el) => el.getBoundingClientRect().height).filter((h) => h < 44));
      expect(small, `${width} px`).toEqual([]);
      const top = () => result(page).evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      const before = await top();
      await label(page, 'Look once').click();
      await expect(figure(page).getByText('One look at the end needs no fix.')).toBeVisible();
      const after = await top();
      // showing the reason moves nothing below the control row: the result line starts where it did
      expect(after).toBeCloseTo(before, 0);
      await label(page, 'Peek daily').click();
    }
  });

  test('axe finds no violations in the preview, the loaded island and the once view', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(HOST);
    await expectNoA11yViolations(page);
    await ready(page);
    await expectNoA11yViolations(page);
    await label(page, 'Look once').click();
    await expect(radio(page, 'Look once')).toBeChecked();
    await expectNoA11yViolations(page);
  });
});

/** The kit's fallback after a change to once at 50 looks: caption, sentence and the once/50 table only. */
async function assertOnce50Fallback(page: Page) {
  const f = figure(page);
  await expect(f.getByRole('heading', { level: 3 })).toHaveText(TITLE);
  await expect(caption(page)).toContainText('Idea credited to Evan Miller');
  // the caption is the current view's, once at 50 looks, never the preset's
  await expect(caption(page)).toContainText('Looking once means one check after 5,000 visitors per group.');
  await expect(caption(page)).toContainText('The pale line is the comparison schedule: 50 daily looks');
  await expect(caption(page)).not.toContainText('Each scheduled look adds');
  const fallbackTable = f.locator('[data-figure-fallback] table');
  await expect(fallbackTable).toBeVisible();
  const rows = fallbackTable.locator('tbody tr');
  await expect(rows).toHaveCount(51);
  await expect(rows.last()).toHaveText(/^\s*50\s*One look at the end\s*5\s*$/);
  await expect(fallbackTable.locator('th')).toHaveText(['Look', 'Schedule', 'False winners so far (%)']);
  await expect(f.locator('[data-figure-preview]')).toHaveCount(0);
  await expect(f.locator('svg[data-chart-frame]:visible')).toHaveCount(0);
  await expect(f.getByRole('group', { name: 'Controls' })).toBeHidden();
  await expect(f.locator('[data-figure-result]')).toBeHidden();
  await expect(f.getByText('Controls need JavaScript.')).toBeHidden();
  await expect(f).not.toContainText(SEAM_FAILURE);
  await expect(page.locator('[data-island="failed"]')).toHaveCount(0);
  await expect(island(page)).toHaveAttribute('data-island', 'ready');
}
