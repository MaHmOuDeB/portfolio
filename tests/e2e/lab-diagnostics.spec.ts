import { expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { dotGeometry } from './curse-geometry';
import { expectNoA11yViolations, test, waitForIslands } from './fixtures';
import { markSlow } from './slow';

// The Lab's two diagnostics on the dev host /kitchen-sink/lab, which mounts the Lab page as /lab does
// (their sections are #split-check and #exaggeration): the split check (`srm`,
// preset 100 against 100 at an even split) and exaggeration (`curse`, preset effect 1 and standard
// error 1). The server draws each preset; each island loads on intent, or at once when the URL holds
// its own keys. /kitchen-sink/lab/diagnostics/faults sets the test seam, so each chart throws on the
// first render after its own control changes.

const HOST = '/kitchen-sink/lab';
const FAULTS = '/kitchen-sink/lab/diagnostics/faults';
const SENTENCE = 'This chart could not load. The numbers are in the table below.';
const SRM_TITLE = 'A split far from the expected share is flagged for a closer look';
const CURSE_TITLE = 'Low power exaggerates the effects that pass the threshold';
const SEAM = { srm: 'The split chart failed after a change (test seam)', curse: 'The exaggeration chart failed after a change (test seam)' } as const;
const TITLE = { srm: SRM_TITLE, curse: CURSE_TITLE } as const;
type Id = keyof typeof TITLE;

// The default preset is a real case: a simulated 5,170 to 4,830 split against an even one, flagged.
const SRM_PRESET_RESULT =
  'Chi-square 11.56 with one degree of freedom, p-value below 0.001: flagged. A split this far from the expected share would be unlikely if visitors were assigned as planned, so check the assignment and the logging before reading any result.';
const SRM_EVEN_RESULT = 'Chi-square 0 with one degree of freedom, p-value 1: not flagged. This split is consistent with the expected share at this threshold.';
const CURSE_PRESET_RESULT =
  'At a true effect of 1.0 and a standard error of 1.0, a ratio of 1, power is 17%. Of the estimates that pass the threshold, 0.9% have the wrong sign, and on average their size is 2.5 times the true effect.';
const ZERO = 'Exaggeration is undefined when the true effect is zero.';
const CURSE_X_LABEL = 'True effect ÷ standard error (log scale)';

const figure = (page: Page, id: Id) => page.locator(`figure[data-figure="${id}"]`);
const island = (page: Page, id: Id) => page.locator('[data-island]', { has: figure(page, id) });
const result = (page: Page, id: Id) => figure(page, id).locator('[data-figure-result]');
const live = (page: Page, id: Id) => figure(page, id).locator('[data-figure-announcement]');
const range = (page: Page, id: string) => page.locator(`input[type="range"][id="${id}"]`);
const reset = (page: Page, id: Id) => figure(page, id).getByRole('button', { name: 'Reset' });

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

async function ready(page: Page, id: Id) {
  await figure(page, id).locator('h3').hover();
  await expect(island(page, id)).toHaveAttribute('data-island', 'ready');
}

/** The rows of the Figure's visible table (the open one, the folded one once opened, or the fallback's). */
async function tableRows(page: Page, id: Id): Promise<string[][]> {
  const summary = figure(page, id).locator('[data-figure-tables] [data-table-toggle] > summary');
  if ((await summary.count()) > 0 && (await summary.isVisible())) {
    const details = figure(page, id).locator('[data-figure-tables] [data-table-toggle]');
    if ((await details.getAttribute('open')) === null) await summary.click();
  }
  const table = figure(page, id).locator('[data-figure-tables]:visible table, [data-figure-fallback] table').first();
  return table.locator('tbody tr').evaluateAll((rows) => rows.map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent!.trim())));
}


/** Focuses a control and waits for its island: a focus that lands before hydration loads nothing, so it is retried. */
async function focusAndLoad(page: Page, id: Id, control: string) {
  await expect(async () => {
    await range(page, control).evaluate((el) => (el as HTMLElement).blur());
    await range(page, control).focus();
    await expect(island(page, id)).toHaveAttribute('data-island', 'ready', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

/**
 * Elements of either hydrated Figure whose whole text is "undefined", "null" or "NaN", and any "null"
 * or "NaN" word at all. The required zero-effect sentence keeps "undefined" inside prose.
 */
async function bareValues(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('figure[data-figure="srm"], figure[data-figure="curse"]')].flatMap((root) => [
      ...[...root.querySelectorAll('*')]
        .filter((el) => /^(undefined|null|NaN)$/.test((el.textContent ?? '').trim()))
        .map((el) => `${el.tagName}: ${el.textContent}`),
      ...[...(root.textContent ?? '').matchAll(/\b(null|NaN)\b/g)].map((m) => m[0]),
    ]),
  );
}

async function readout(page: Page) {
  const get = (k: string) => figure(page, 'curse').locator(`[data-curse-${k}]`).first().textContent();
  return { power: await get('power'), wrongSign: await get('wrong-sign'), exaggeration: await get('exaggeration') };
}

async function noHorizontalScroll(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll).toBeLessThanOrEqual(client);
}

/** Every text of the visible chart frames inside the Figure, and the labels kept apart. */
async function chartTextFits(page: Page, id: Id) {
  const findings = await figure(page, id).evaluate((root) => {
    const box = root.getBoundingClientRect();
    const texts = [...root.querySelectorAll<SVGTextElement>('svg[data-chart-frame] text')]
      .filter((t) => t.getClientRects().length > 0)
      .map((t) => ({ text: t.textContent ?? '', r: t.getBoundingClientRect() }));
    const outside = texts.filter(({ r }) => r.left < box.left - 0.5 || r.right > box.right + 0.5).map((t) => t.text);
    const overlaps: string[] = [];
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i]!.r;
        const b = texts[j]!.r;
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps.push(`${texts[i]!.text} / ${texts[j]!.text}`);
      }
    }
    return { outside, overlaps, count: texts.length };
  });
  expect(findings.count, id).toBeGreaterThan(3);
  expect(findings.outside, id).toEqual([]);
  expect(findings.overlaps, id).toEqual([]);
}

test.describe('Split check Figure', () => {
  test('without JavaScript: the preset, the open table and "Controls need JavaScript.", whatever the query', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${HOST}?srm.nA=0&srm.nB=100`);
    await expect(figure(page, 'srm').getByRole('heading', { level: 3 })).toHaveText(SRM_TITLE);
    await expect(result(page, 'srm')).toHaveText(SRM_PRESET_RESULT);
    await expect(figure(page, 'srm').getByText('Simulated', { exact: true })).toBeVisible();
    await expect(figure(page, 'srm').getByText('Controls need JavaScript.')).toBeVisible();
    const rows = await figure(page, 'srm').locator('[data-nojs-only] table tbody tr').evaluateAll((rs) => rs.map((r) => r.textContent));
    expect(rows).toEqual(['Group A5,17050%5,000', 'Group B4,83050%5,000']);
    await expect(figure(page, 'srm').getByRole('group', { name: 'Controls' })).toBeHidden();
    await context.close();
  });

  test('eager: its own keys load the island and draw one empty group, flagged in words, with real table values', async ({ page }) => {
    await withoutIdle(page);
    const errors = watchErrors(page);
    await page.goto(`${HOST}?srm.nA=0&srm.nB=100`);
    await expect(island(page, 'srm')).toHaveAttribute('data-island', 'ready');
    await expect(result(page, 'srm')).toContainText('Chi-square 100 with one degree of freedom, p-value below 0.001: flagged.');
    await expect(figure(page, 'srm').locator('[data-srm-status]')).toHaveText('flagged');
    await expect(figure(page, 'srm').locator('svg[data-chart-frame]:visible')).toHaveAttribute('aria-label', /the split is flagged for a closer look$/);
    expect(await tableRows(page, 'srm')).toEqual([
      ['Group A', '0', '50%', '50'],
      ['Group B', '100', '50%', '50'],
    ]);
    // the curse island is untouched by srm keys
    await expect(island(page, 'curse')).toHaveAttribute('data-island', 'idle');
    expect(errors).toEqual([]);
  });

  test('zero counts: no inference, no p-value and no chi-square', async ({ page }) => {
    await page.goto(`${HOST}?srm.nA=0&srm.nB=0`);
    await expect(island(page, 'srm')).toHaveAttribute('data-island', 'ready');
    await expect(result(page, 'srm')).toHaveText('No visitors in either group yet, so there is nothing to test and no p-value.');
    await expect(figure(page, 'srm').locator('[data-srm-p], [data-srm-chi2]')).toHaveCount(0);
    expect(await tableRows(page, 'srm')).toEqual([
      ['Group A', '0', '50%', '0'],
      ['Group B', '0', '50%', '0'],
    ]);
  });

  test('on a phone the count axis keeps its top tick when the tallest bar is just over 20', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${HOST}?srm.nA=22&srm.nB=3`);
    await expect(island(page, 'srm')).toHaveAttribute('data-island', 'ready');
    await expect(figure(page, 'srm').locator('svg[data-chart-frame]:visible [data-tick="y"]')).toHaveText(['25', '0']);
  });

  test('120 against 60 is flagged; a tiny split warns about the approximation', async ({ page }) => {
    await page.goto(`${HOST}?srm.nA=120&srm.nB=60`);
    await expect(island(page, 'srm')).toHaveAttribute('data-island', 'ready');
    await expect(result(page, 'srm')).toContainText('Chi-square 20 with one degree of freedom, p-value below 0.001: flagged.');
    await page.goto(`${HOST}?srm.nA=3&srm.nB=1`);
    await expect(island(page, 'srm')).toHaveAttribute('data-island', 'ready');
    await expect(result(page, 'srm')).toContainText('An expected count is below 5, so the chi-square approximation is rough here.');
  });

  test('a hostile shared URL shows the preset or clamped values, with no error', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${HOST}?srm.nA=__proto__&srm.nB=&srm.shareA=NaN&srm.preset=constructor`);
    await expect(island(page, 'srm')).toHaveAttribute('data-island', 'ready');
    await expect(result(page, 'srm')).toHaveText(SRM_PRESET_RESULT);
    await page.goto(`${HOST}?srm.nA=-5&srm.nB=1e9&srm.shareA=2&srm.nA=7`);
    await expect(island(page, 'srm')).toHaveAttribute('data-island', 'ready');
    await expect(range(page, 'srm-nA')).toHaveValue('0');
    await expect(range(page, 'srm-nB')).toHaveValue('10000');
    await expect(range(page, 'srm-shareA')).toHaveValue('0.99');
    await expect(result(page, 'srm')).toContainText('flagged');
    expect(errors).toEqual([]);
  });

  test('the even split is one link away: the even preset, not flagged, and Reset keeps it', async ({ page }) => {
    await page.goto('/lab#split-check');
    const link = page.getByRole('link', { name: 'See the same check on an even split' });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/lab\?srm\.preset=even#split-check$/);
    await expect(island(page, 'srm')).toHaveAttribute('data-island', 'ready');
    await expect(result(page, 'srm')).toHaveText(SRM_EVEN_RESULT);
    await expect(range(page, 'srm-nA')).toHaveValue('5000');
    await expect(range(page, 'srm-nB')).toHaveValue('5000');
  });

  test('keyboard: an arrow key changes a count, announces on release and writes only its own keys', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(`${HOST}?curse.se=2#split-check`);
    await focusAndLoad(page, 'srm', 'srm-nA');
    await expect(range(page, 'srm-nA')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(range(page, 'srm-nA')).toHaveValue('5171');
    await expect(live(page, 'srm')).toHaveText(
      'Chi-square 11.63 with one degree of freedom, p-value below 0.001: flagged. A split this far from the expected share would be unlikely if visitors were assigned as planned, so check the assignment and the logging before reading any result.',
    );
    await expect(live(page, 'srm')).toHaveAttribute('data-derived', 'simulated');
    await expect.poll(() => new URL(page.url()).searchParams.get('srm.nA')).toBe('5171');
    const url = new URL(page.url());
    expect(url.searchParams.get('curse.se')).toBe('2');
    expect(url.hash).toBe('#split-check');
  });

  test('Reset restores the preset, clears only its own keys and keeps the other Figure’s key and the hash', async ({ page }) => {
    await page.goto(`${HOST}?srm.nA=120&srm.nB=60&curse.se=2#split-check`);
    await expect(island(page, 'srm')).toHaveAttribute('data-island', 'ready');
    await reset(page, 'srm').click();
    await expect(result(page, 'srm')).toHaveText(SRM_PRESET_RESULT);
    await expect(live(page, 'srm')).toHaveText(SRM_PRESET_RESULT);
    const url = new URL(page.url());
    expect([...url.searchParams.keys()].filter((k) => k.startsWith('srm.'))).toEqual([]);
    expect(url.searchParams.get('curse.se')).toBe('2');
    expect(url.hash).toBe('#split-check');
  });

  test('focus on the preview Reset moves to the island Reset when the island loads', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(HOST);
    await expect(island(page, 'srm')).toHaveAttribute('data-island', 'idle');
    await reset(page, 'srm').focus();
    await expect(island(page, 'srm')).toHaveAttribute('data-island', 'ready');
    await expect(reset(page, 'srm')).toBeFocused();
    expect(await figure(page, 'srm').locator('[data-srm-controls]').count()).toBe(1);
  });
});

test.describe('Exaggeration Figure', () => {
  test('without JavaScript: the preset, its dot, the open table and "Controls need JavaScript."', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${HOST}?curse.trueEffect=0`);
    await expect(figure(page, 'curse').getByRole('heading', { level: 3 })).toHaveText(CURSE_TITLE);
    await expect(result(page, 'curse')).toHaveText(CURSE_PRESET_RESULT);
    await expect(figure(page, 'curse').getByText('Simulated', { exact: true })).toBeVisible();
    await expect(figure(page, 'curse').getByText('Controls need JavaScript.')).toBeVisible();
    const mine = await figure(page, 'curse')
      .locator('[data-nojs-only] table tbody tr')
      .evaluateAll((rs) => rs.map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent)).filter((r) => r.at(-1) === 'Yes'));
    expect(mine).toEqual([['1', '17%', '0.9%', '2.5', 'Yes']]);
    await expect(figure(page, 'curse').locator('svg[data-chart-frame]:visible [data-curse-dot]')).toHaveCount(1);
    await context.close();
  });

  test('effect 0.1 and standard error 5: the ratio 0.02 dot sits in the plot with its ring whole, and readout, dot and table agree', async ({ page }) => {
    for (const width of [320, 375, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${HOST}?curse.trueEffect=0.1&curse.se=5`);
      await expect(island(page, 'curse')).toHaveAttribute('data-island', 'ready');
      const dot = await dotGeometry(page);
      expect(dot, String(width)).not.toBeNull();
      expect(dot!.ratio).toBe(0.02);
      expect(dot!.value).toBeCloseTo(116.8962012, 6);
      expect(dot!.centreInPlot, String(width)).toBe(true);
      expect(dot!.atLeftEdge, String(width)).toBe(true);
      expect(dot!.ringBelowPlotTop, String(width)).toBe(true);
      expect(dot!.inFigure, String(width)).toBe(true);
      expect(dot!.clippedBy, String(width)).toEqual([]);
      expect(dot!.overlapsTick, String(width)).toBe(false);
      expect(await readout(page)).toEqual({ power: '5%', wrongSign: '47.7%', exaggeration: '116.9' });
      expect((await tableRows(page, 'curse')).filter((r) => r.at(-1) === 'Yes')).toEqual([['0.02', '5%', '47.7%', '116.9', 'Yes']]);
      await expect(result(page, 'curse')).toContainText('a ratio of 0.02, power is 5%');
    }
  });

  test('effect 5 and standard error 0.1: the ratio 50 dot at the upper end, inside its frame', async ({ page }) => {
    await page.goto(`${HOST}?curse.trueEffect=5&curse.se=0.1`);
    await expect(island(page, 'curse')).toHaveAttribute('data-island', 'ready');
    const dot = await dotGeometry(page);
    expect(dot!.ratio).toBe(50);
    // the fixed domain ends at 50, so the dot is centred on the plot's right edge: its ring reaches past
    // the frame into the page gutter, still drawn whole and on screen
    expect(dot!.centreInPlot).toBe(true);
    expect(dot!.atRightEdge).toBe(true);
    expect(dot!.clippedBy).toEqual([]);
    expect(dot!.inViewport).toBe(true);
    await noHorizontalScroll(page);
    expect(dot!.ring).toEqual({ stroke: expect.not.stringMatching(/^none$/), width: '4px', order: expect.stringContaining('stroke') });
    expect(await readout(page)).toEqual({ power: 'over 99%', wrongSign: 'below 0.1%', exaggeration: '1.0' });
    expect((await tableRows(page, 'curse')).filter((r) => r.at(-1) === 'Yes')).toEqual([['50', 'over 99%', 'below 0.1%', '1.0', 'Yes']]);
  });

  test('zero effect: the undefined sentence, no dot, no row marked, the log axis still drawn', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${HOST}?curse.trueEffect=0&curse.se=2`);
    await expect(island(page, 'curse')).toHaveAttribute('data-island', 'ready');
    await expect(result(page, 'curse')).toContainText(ZERO);
    await expect(result(page, 'curse')).toContainText('zero, not undefined');
    await expect(figure(page, 'curse').locator('[data-curse-dot]')).toHaveCount(0);
    expect((await tableRows(page, 'curse')).some((r) => r.at(-1) === 'Yes')).toBe(false);
    await expect(figure(page, 'curse').locator('svg[data-chart-frame]:visible [data-tick="x"]')).toHaveText(['0.1', '1', '10']);
    await expect(figure(page, 'curse')).not.toContainText(/Infinity|NaN|null/);
    // the readout says why there is no value, never a bare word that looks like a leaked JavaScript value
    await expect(figure(page, 'curse').locator('[data-curse-readout] dd')).toHaveText(['not shown', 'no true sign', 'not defined']);
    expect(await bareValues(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('the readout keeps its height from the preset preview to an eager zero-effect island', async ({ page }) => {
    for (const width of [375, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await withoutIdle(page);
      await page.goto(HOST);
      await expect(island(page, 'curse')).toHaveAttribute('data-island', 'idle');
      const height = () => figure(page, 'curse').locator('[data-curse-readout]').evaluate((el) => el.getBoundingClientRect().height);
      // the first layout of a cold page can report zero for a moment: wait for a settled height
      await expect.poll(height).toBeGreaterThan(0);
      const preset = await height();
      await page.goto(`${HOST}?curse.trueEffect=0`);
      await expect(island(page, 'curse')).toHaveAttribute('data-island', 'ready');
      await expect(result(page, 'curse')).toContainText(ZERO);
      await expect(figure(page, 'curse').locator('[data-curse-readout]')).toHaveAttribute('data-curse-branch', 'zero-effect');
      await expect.poll(height).toBeGreaterThan(0);
      const zero = await height();
      expect(Math.abs(zero - preset), String(width)).toBeLessThanOrEqual(1);
    }
  });

  test('a hostile shared URL shows the preset or clamped values, with no error', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${HOST}?curse.trueEffect=&curse.se=abc&curse.preset=__proto__`);
    await expect(island(page, 'curse')).toHaveAttribute('data-island', 'ready');
    await expect(result(page, 'curse')).toHaveText(CURSE_PRESET_RESULT);
    await page.goto(`${HOST}?curse.trueEffect=Infinity&curse.se=-3`);
    await expect(island(page, 'curse')).toHaveAttribute('data-island', 'ready');
    await expect(range(page, 'curse-trueEffect')).toHaveValue('5');
    await expect(range(page, 'curse-se')).toHaveValue('0.1');
    expect((await dotGeometry(page))!.ratio).toBe(50);
    expect(errors).toEqual([]);
  });

  test('keyboard: changing the error announces the new result on release; Reset restores the preset and only its own keys', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(`${HOST}?srm.nA=7#exaggeration`);
    await focusAndLoad(page, 'curse', 'curse-se');
    await expect(range(page, 'curse-se')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(range(page, 'curse-se')).toHaveValue('1.1');
    await expect(live(page, 'curse')).toContainText('At a true effect of 1.0 and a standard error of 1.1');
    await expect(live(page, 'curse')).toHaveAttribute('data-derived', 'simulated');
    const before = await readout(page);
    const row = (await tableRows(page, 'curse')).filter((r) => r.at(-1) === 'Yes');
    expect(row).toEqual([[expect.any(String), before.power, before.wrongSign, before.exaggeration, 'Yes']]);
    await expect.poll(() => new URL(page.url()).searchParams.get('curse.se')).toBe('1.1');
    await reset(page, 'curse').click();
    await expect(result(page, 'curse')).toHaveText(CURSE_PRESET_RESULT);
    const url = new URL(page.url());
    expect([...url.searchParams.keys()].filter((k) => k.startsWith('curse.'))).toEqual([]);
    expect(url.searchParams.get('srm.nA')).toBe('7');
    expect(url.hash).toBe('#exaggeration');
  });

  test('focus on the preview Reset moves to the island Reset when the island loads', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(HOST);
    await expect(island(page, 'curse')).toHaveAttribute('data-island', 'idle');
    await reset(page, 'curse').focus();
    await expect(island(page, 'curse')).toHaveAttribute('data-island', 'ready');
    await expect(reset(page, 'curse')).toBeFocused();
  });

  test('no motion: a change moves the dot without any animation or transition on a mark', async ({ page }) => {
    await page.goto(HOST);
    await ready(page, 'curse');
    await range(page, 'curse-se').focus();
    await page.keyboard.press('End');
    await expect(range(page, 'curse-se')).toHaveValue('5');
    const motion = await page.evaluate(() => {
      const marks = [...document.querySelectorAll('figure[data-figure] [data-mark]')];
      return {
        animations: marks.reduce((n, m) => n + m.getAnimations().length, 0),
        transitions: marks.map((m) => getComputedStyle(m).transitionDuration),
      };
    });
    expect(motion.animations).toBe(0);
    expect(motion.transitions.every((d) => d.split(',').every((part) => part.trim() === '0s'))).toBe(true);
  });
});

for (const id of ['srm', 'curse'] as const) {
  const control = id === 'srm' ? 'srm-nA' : 'curse-se';
  test.describe(`${id === 'srm' ? 'Split check' : 'Exaggeration'} failures`, () => {
    test('a failed island on intent brings back the no-JS preset, and focus goes to the open table', async ({ page }) => {
      await withoutIdle(page);
      watchErrors(page, CHUNK_ERRORS);
      let block = false;
      await page.route('**/_next/static/**/*.js', (route) => (block ? route.abort() : route.continue()));
      await page.goto(HOST);
      await page.waitForLoadState('load');
      await page.waitForTimeout(500);
      block = true;
      await range(page, control).focus();
      await expect(page.locator('[data-island="failed"]', { has: figure(page, id) })).toHaveCount(1);
      await expect(figure(page, id).locator('[data-nojs-only] [role="region"]')).toBeFocused();
      await expect(figure(page, id).getByText('Controls need JavaScript.')).toBeVisible();
      await expect(figure(page, id).getByRole('group', { name: 'Controls' })).toBeHidden();
      await expect(result(page, id)).toHaveText(id === 'srm' ? SRM_PRESET_RESULT : CURSE_PRESET_RESULT);
    });

    test('a chart that throws after a keyboard change: the sentence takes focus, the current table shows, no plot and no controls', async ({ page }) => {
      const errors = watchErrors(page, [SEAM[id]]);
      await page.goto(FAULTS);
      await ready(page, id);
      await range(page, control).focus();
      await page.keyboard.press('ArrowRight');
      const status = figure(page, id).getByRole('status');
      await expect(status).toHaveText(SENTENCE);
      await expect(status).toBeFocused();
      await assertCurrentFallback(page, id);
      expect(errors).toEqual([]);
    });

    test('a chart that throws after a pointer change: focus is the sentence or where it was, never a hidden control', async ({ page }) => {
      const errors = watchErrors(page, [SEAM[id]]);
      await page.goto(FAULTS);
      await ready(page, id);
      // Start with nothing focused, as the kit's own pointer test does.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
      // page.mouse does not scroll, and where the page sits once the islands have loaded is not this
      // test's subject: bring the control on screen and check that the click point is the control.
      await range(page, control).scrollIntoViewIfNeeded();
      const box = (await range(page, control).boundingBox())!;
      const [x, y] = [box.x + box.width * 0.75, box.y + box.height / 2];
      expect(await page.evaluate(([px, py, cid]) => document.elementFromPoint(px, py)?.id === cid, [x, y, control] as const)).toBe(true);
      const before = await range(page, control).inputValue();
      // A click three quarters along the track: a change, whatever the engine focuses.
      await page.mouse.click(x, y);
      await expect(range(page, control)).not.toHaveValue(before);
      const status = figure(page, id).getByRole('status');
      await expect(status).toHaveText(SENTENCE);
      const focus = await page.evaluate((fid) => {
        const a = document.activeElement;
        const root = document.getElementById(fid)!;
        const clickTarget = root.parentElement?.closest('[tabindex]') ?? null;
        return {
          what: a === null ? 'null' : `${a.tagName.toLowerCase()}#${a.id}[role=${a.getAttribute('role')}]`,
          body: a === document.body,
          status: a?.getAttribute('role') === 'status' && root.contains(a),
          clickTarget: a !== null && a === clickTarget && !root.contains(a),
          hidden: a instanceof HTMLElement && a !== document.body && !a.checkVisibility(),
        };
      }, id);
      expect(focus.body || focus.status || focus.clickTarget, focus.what).toBe(true);
      expect(focus.hidden).toBe(false);
      await assertCurrentFallback(page, id, { pointer: true });
      expect(errors).toEqual([]);
    });
  });
}

test.describe('Both diagnostics together', () => {
  for (const [name, viewport, scale] of [
    ['320 px', { width: 320, height: 800 }, 1],
    ['400% zoom of a 1280 px window', { width: 320, height: 256 }, 4],
  ] as const) {
    test(`reflow at ${name}: no sideways scroll, chart text inside its Figure and apart, controls usable`, async ({ browser }) => {
      const context = await newContext(browser, viewport, scale);
      const page = await context.newPage();
      await page.goto(HOST);
      // the islands swap in at idle time: measure once they have, not a preview mid-swap
      await waitForIslands(page);
      for (const id of ['srm', 'curse'] as const) {
        await ready(page, id);
        await chartTextFits(page, id);
      }
      await noHorizontalScroll(page);
      await reset(page, 'curse').scrollIntoViewIfNeeded();
      await reset(page, 'curse').click();
      await expect(result(page, 'curse')).toHaveText(CURSE_PRESET_RESULT);
      await context.close();
    });
  }

  // The x-axis label is the longest text on the kit's one-line axis: checked on its own at the two
  // narrowest widths, as well as in the reflow test above.
  for (const width of [320, 375]) {
    test(`the exaggeration x-axis label stays inside its Figure at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(HOST);
      await ready(page, 'curse');
      const label = figure(page, 'curse').locator('svg[data-chart-frame]:visible [data-axis-label]', { hasText: CURSE_X_LABEL });
      const [box, fig] = [(await label.boundingBox())!, (await figure(page, 'curse').boundingBox())!];
      expect(box.x).toBeGreaterThanOrEqual(fig.x - 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(fig.x + fig.width + 0.5);
    });
  }

  // On the log axis the ticks 0.1, 1 and 10 sit inside the domain, not on its ends: each label is
  // centred on its tick, so it reads the value it labels, and stays inside the chart frame.
  for (const width of [320, 1440]) {
    test(`the exaggeration x tick labels centre on their ticks and stay inside the frame at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(HOST);
      await ready(page, 'curse');
      const svg = figure(page, 'curse').locator('svg[data-chart-frame]:visible');
      const ticks = await svg.evaluate((frame) => {
        const box = frame.getBoundingClientRect();
        const style = getComputedStyle(frame);
        const left = box.left + Number.parseFloat(style.paddingLeft);
        const plot = box.width - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
        return [...frame.querySelectorAll<SVGTextElement>('[data-tick="x"]')].map((t) => {
          const r = t.getBoundingClientRect();
          return {
            text: t.textContent,
            off: (r.left + r.right) / 2 - (left + (Number.parseFloat(t.getAttribute('x')!) / 100) * plot),
            inside: r.left >= box.left - 0.5 && r.right <= box.right + 0.5,
          };
        });
      });
      expect(ticks.map((t) => t.text)).toEqual(['0.1', '1', '10']);
      for (const t of ticks) {
        expect(Math.abs(t.off), `${t.text} is ${t.off.toFixed(1)} px off its tick`).toBeLessThanOrEqual(2);
        expect(t.inside, `${t.text} inside the frame`).toBe(true);
      }
    });
  }

  test('wide: chart text inside each Figure and apart, at the matrix widths and the screen-share size', async ({ page }) => {
    // Six page loads with both islands each: WebKit in the container needs more than 30 s.
    markSlow('six page loads with both islands each: WebKit in the container needs more than 30 s');
    for (const [width, height] of [[375, 900], [390, 900], [768, 900], [1024, 900], [1440, 900], [1024, 576]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto(HOST);
      for (const id of ['srm', 'curse'] as const) {
        await ready(page, id);
        await chartTextFits(page, id);
      }
      await noHorizontalScroll(page);
    }
  });

  test('no number escapes its source marker, shown or hidden, and every chart name is digit-free', async ({ page }) => {
    // Three page loads with both islands each: WebKit in the container needs more than 30 s.
    markSlow('three page loads with both islands each: WebKit in the container needs more than 30 s');
    for (const query of ['', '?srm.nA=3&srm.nB=1&curse.trueEffect=0.1&curse.se=5', '?srm.nA=0&srm.nB=0&curse.trueEffect=0']) {
      await page.goto(`${HOST}${query}`);
      for (const id of ['srm', 'curse'] as const) {
        await ready(page, id);
        const stray = await figure(page, id).evaluate((root) => {
          const out: string[] = [];
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const parent = n.parentElement!;
            if (parent.closest('style, script')) continue;
            if (/\d/.test(n.textContent ?? '') && !parent.closest('[data-derived], [data-fact]')) out.push(n.textContent!.trim());
          }
          for (const el of root.querySelectorAll('*')) {
            for (const name of ['aria-label', 'title', 'alt']) {
              const v = el.getAttribute(name);
              if (v && /\d/.test(v)) out.push(`${name}=${v}`);
            }
            const vt = el.getAttribute('aria-valuetext');
            if (vt && /\d/.test(vt) && !el.closest('[data-derived]')) out.push(`aria-valuetext=${vt}`);
          }
          for (const svg of root.querySelectorAll('svg[aria-label]')) if (/\d/.test(svg.getAttribute('aria-label')!)) out.push('svg name');
          if (/Infinity|NaN/.test(root.textContent ?? '')) out.push('non-finite text');
          return out;
        });
        expect(stray, `${id} ${query}`).toEqual([]);
        expect(await bareValues(page), `${id} ${query}`).toEqual([]);
      }
    }
  });

  test('forced colours: the two split series and the curve and dot stay distinct, and axe finds nothing', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(HOST);
    await ready(page, 'srm');
    await ready(page, 'curse');
    await page.emulateMedia({ forcedColors: 'active' });
    const styles = await page.evaluate(() => {
      const visible = (sel: string) => [...document.querySelectorAll(sel)].find((e) => e.closest('svg[data-chart-frame]')!.getClientRects().length > 0)!;
      const s = (el: Element) => {
        const cs = getComputedStyle(el);
        return `${cs.fill}|${cs.stroke}|${cs.strokeWidth}`;
      };
      return {
        observed: s(visible('rect[data-series="observed"][data-group="A"]')),
        expected: s(visible('rect[data-series="expected"][data-group="A"]')),
        line: s(visible('[data-curse-line]')),
        dot: s(visible('[data-curse-dot]')),
        legend: document.querySelector('[data-srm-legend]')!.getClientRects().length > 0,
      };
    });
    expect(styles.observed).not.toBe(styles.expected);
    expect(styles.line).not.toBe(styles.dot);
    expect(styles.legend).toBe(true);
    await expectNoA11yViolations(page);
  });

  test('axe finds no violations in the previews or the loaded islands', async ({ page }) => {
    // Four axe passes over two full pages: WebKit in the container needs more than 30 s under load.
    markSlow('four axe passes over two full pages: WebKit in the container needs more than 30 s under load');
    await withoutIdle(page);
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(HOST);
      await expectNoA11yViolations(page);
      await ready(page, 'srm');
      await ready(page, 'curse');
      await expectNoA11yViolations(page);
    }
  });
});

async function newContext(browser: Browser, viewport: { width: number; height: number }, deviceScaleFactor: number) {
  return browser.newContext({ viewport, deviceScaleFactor });
}

/**
 * The kit's own fallback after a change: the caption, the sentence and the CURRENT table only. A
 * keyboard change moved the control one step from the preset; a pointer change moved it further.
 */
async function assertCurrentFallback(page: Page, id: Id, o: { pointer?: boolean } = {}) {
  const f = figure(page, id);
  await expect(f.getByRole('heading', { level: 3 })).toHaveText(TITLE[id]);
  await expect(f.locator('figcaption > p').first()).toContainText(id === 'srm' ? 'a warning to investigate' : 'no random draws are involved');
  const rows = await f.locator('[data-figure-fallback] table tbody tr').evaluateAll((rs) => rs.map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent!.trim())));
  if (id === 'srm') {
    // group A's count moved off the preset 5,170
    expect(rows[0]![0]).toBe('Group A');
    expect(rows[0]![1]).not.toBe('5,170');
    if (!o.pointer) expect(rows[0]).toEqual(['Group A', '5,171', '50%', '5,000.5']);
  } else {
    // the marked row is the new ratio, not the preset's 1
    const mine = rows.filter((r) => r.at(-1) === 'Yes');
    expect(mine).toHaveLength(1);
    expect(mine[0]![0]).not.toBe('1');
    if (!o.pointer) expect(mine[0]![0]).toBe('0.909');
  }
  await expect(f.locator('[data-figure-preview]')).toHaveCount(0);
  await expect(f.locator('svg[data-chart-frame]')).toHaveCount(0);
  await expect(f.getByRole('group', { name: 'Controls' })).toBeHidden();
  await expect(f.locator('[data-figure-result]')).toBeHidden();
  await expect(f.getByText('Controls need JavaScript.')).toBeHidden();
  await expect(f).not.toContainText(SEAM[id]);
  await expect(page.locator('[data-island="failed"]')).toHaveCount(0);
  await expect(island(page, id)).toHaveAttribute('data-island', 'ready');
}
