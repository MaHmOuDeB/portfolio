import { expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { expectNoA11yViolations, test } from './fixtures';

// The cohort, RFM and model Figures on the dev host /kitchen-sink/retention. The cohort Figure draws
// a heatmap of every cohort from 600 px up and the chosen cohort's line below it (both in the
// markup, one shown with display: none); its picker is the kit's StepNav. The server draws January
// 2010; the island loads on intent, or at once when the URL holds `cohorts.` keys.
// /kitchen-sink/retention/faults sets the test seam, so the cohort chart throws on the first render
// after a cohort change.

const HOST = '/kitchen-sink/retention';
const FAULTS = '/kitchen-sink/retention/faults';
const ID = 'cohorts';
const TITLE = 'Repeat ordering varies by cohort and month';
const SENTENCE = 'This chart could not load. The numbers are in the table below.';
const SEAM_FAILURE = 'The cohort chart failed after a change (test seam)';
const JAN_RESULT = 'In the month after their first order, 21% of the Jan 2010 cohort (368 customers) ordered again; in the twelfth month after it, 23% did.';
const MAR_RESULT = 'In the month after their first order, 19% of the Mar 2010 cohort (441 customers) ordered again; in the twelfth month after it, 20% did.';
const FEB_RESULT = 'In the month after their first order, 24% of the Feb 2010 cohort (374 customers) ordered again; in the twelfth month after it, 15% did.';

const figure = (page: Page, id = ID) => page.locator(`figure[data-figure="${id}"]`);
const island = (page: Page) => page.locator('[data-island]', { has: figure(page) });
const next = (page: Page) => figure(page).getByRole('button', { name: 'Next' });
const previous = (page: Page) => figure(page).getByRole('button', { name: 'Previous' });
const result = (page: Page) => figure(page).locator('[data-figure-result]');
const live = (page: Page) => figure(page).locator('[data-figure-announcement]');
const heatmap = (page: Page) => figure(page).locator('[data-cohort-mode="heatmap"]');
const line = (page: Page) => figure(page).locator('[data-cohort-mode="line"]');

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

async function ready(page: Page) {
  await figure(page).locator('h3').hover();
  await expect(island(page)).toHaveAttribute('data-island', 'ready');
}

/** The printed cells of one cohort's row in the Figure's table that is on screen (opened if folded). */
async function tableRow(page: Page, label: string) {
  const summary = figure(page).locator('[data-js-only][data-figure-tables] summary');
  if ((await summary.count()) > 0 && (await summary.isVisible())) {
    const details = figure(page).locator('[data-js-only][data-figure-tables] details');
    if ((await details.getAttribute('open')) === null) await summary.click();
  }
  const row = figure(page).locator('[data-figure-tables]:visible tbody tr, [data-figure-fallback] tbody tr').filter({ has: page.getByRole('cell', { name: label, exact: true }) });
  await expect(row).toHaveCount(1);
  return row.locator('td').allTextContents();
}

/** Every visible chart in a Figure: exactly one accessible image per chart mode. */
async function visibleCharts(page: Page, id = ID) {
  // The frame's own <svg role="img">; its mark layer is a nested <svg> inside that image.
  return figure(page, id).locator('svg[data-chart-frame][role="img"]:visible').count();
}

async function noHorizontalScroll(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, 'the document scrolls sideways').toBeLessThanOrEqual(client);
}

/** Every shown text of a Figure's visible chart sits inside the Figure, and the given labels never overlap each other. */
async function chartTextFits(page: Page, id: string) {
  const findings = await figure(page, id).evaluate((root) => {
    const box = root.getBoundingClientRect();
    const texts = [...root.querySelectorAll<SVGTextElement>('svg[data-chart-frame] text')]
      .filter((t) => t.getClientRects().length > 0 && getComputedStyle(t).display !== 'none' && (t.textContent ?? '').trim() !== '')
      .map((t) => ({ text: t.textContent, kind: [...t.attributes].map((a) => a.name).find((n) => n.startsWith('data-')) ?? '', r: t.getBoundingClientRect() }));
    const outside = texts.filter(({ r }) => r.left < box.left - 0.5 || r.right > box.right + 0.5).map((t) => t.text);
    // Labels that must stay apart: names, bar and dot labels, cell values and the selected label.
    const apart = texts.filter((t) => ['data-segment-name', 'data-bar-label', 'data-model-name', 'data-dot-label', 'data-cell-label', 'data-selected-label', 'data-tick'].includes(t.kind));
    const overlaps: string[] = [];
    for (let i = 0; i < apart.length; i++) {
      for (let j = i + 1; j < apart.length; j++) {
        const a = apart[i]!.r;
        const b = apart[j]!.r;
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps.push(`${apart[i]!.text} / ${apart[j]!.text}`);
      }
    }
    return { outside, overlaps, count: texts.length };
  });
  expect(findings.count).toBeGreaterThan(0);
  expect({ outside: findings.outside, overlaps: findings.overlaps }).toEqual({ outside: [], overlaps: [] });
}

test.describe('Cohort Figure', () => {
  test('without JavaScript: January, the open table of every value and one visible chart at each width', async ({ browser }) => {
    for (const width of [599, 600, 1440]) {
      const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 900 } });
      const page = await context.newPage();
      await page.goto(`${HOST}?${ID}.cohort=2010-03`);
      await expect(figure(page).getByRole('heading', { level: 3 })).toHaveText(TITLE);
      await expect(result(page)).toHaveText(JAN_RESULT);
      await expect(figure(page).getByText('Controls need JavaScript.')).toBeVisible();
      const table = figure(page).locator('[data-nojs-only] table');
      await expect(table).toBeVisible();
      await expect(table.locator('tbody tr')).toHaveCount(11);
      await expect(table.locator('tbody td[data-num]')).toHaveCount(11 * 14);
      expect(await visibleCharts(page)).toBe(1);
      if (width >= 600) {
        await expect(heatmap(page)).toBeVisible();
        await expect(line(page)).toBeHidden();
      } else {
        await expect(line(page)).toBeVisible();
        await expect(heatmap(page)).toBeHidden();
      }
      // hidden by display, not moved off screen
      const hidden = width >= 600 ? line(page) : heatmap(page);
      expect(await hidden.evaluate((el) => getComputedStyle(el).display)).toBe('none');
      await context.close();
    }
  });

  for (const [query, label, result_] of [['', 'Jan 2010', JAN_RESULT], [`?${ID}.cohort=2010-03`, 'Mar 2010', MAR_RESULT]] as const) {
    test(`at 600 px the heatmap outlines and labels ${label}, whose cells match its table row`, async ({ page }) => {
      await page.setViewportSize({ width: 600, height: 900 });
      await page.goto(`${HOST}${query}`);
      // The island swaps in on intent or idle time; read the Figure once it has, so nothing is replaced mid-read.
      if (query) await expect(island(page)).toHaveAttribute('data-island', 'ready');
      else await ready(page);
      await expect(result(page)).toHaveText(result_);
      await expect(heatmap(page)).toBeVisible();
      await expect(line(page)).toBeHidden();
      expect(await visibleCharts(page)).toBe(1);
      const month = label === 'Jan 2010' ? '2010-01' : '2010-03';
      const outline = heatmap(page).locator('rect[data-selected]');
      await expect(outline).toHaveAttribute('data-selected', month);
      const selectedLabel = heatmap(page).locator('[data-selected-label]');
      await expect(selectedLabel).toHaveText('Selected');
      await expect(selectedLabel).toBeVisible();
      // the label is on the outlined row, right of its last cell
      const geometry = await heatmap(page).evaluate((root, m) => {
        const o = root.querySelector('rect[data-selected]')!.getBoundingClientRect();
        const l = root.querySelector('[data-selected-label]')!.getBoundingClientRect();
        const last = root.querySelector(`rect[data-cell][data-cohort="${m}"][data-month="12"]`)!.getBoundingClientRect();
        return { labelMid: (l.top + l.bottom) / 2, top: o.top, bottom: o.bottom, labelLeft: l.left, lastRight: last.right };
      }, month);
      expect(geometry.labelMid).toBeGreaterThan(geometry.top);
      expect(geometry.labelMid).toBeLessThan(geometry.bottom);
      expect(geometry.labelLeft).toBeGreaterThan(geometry.lastRight);
      const cells = await heatmap(page).locator(`text[data-cell-label][data-cohort="${month}"]`).allTextContents();
      const row = await tableRow(page, label);
      expect(cells).toEqual(row.slice(3));
      await chartTextFits(page, ID);
      await noHorizontalScroll(page);
    });

    test(`at 599 px the line is ${label}, its points match its table row and it is named`, async ({ page }) => {
      await page.setViewportSize({ width: 599, height: 900 });
      await page.goto(`${HOST}${query}`);
      // The island swaps in on intent or idle time; read the Figure once it has, so nothing is replaced mid-read.
      if (query) await expect(island(page)).toHaveAttribute('data-island', 'ready');
      else await ready(page);
      await expect(result(page)).toHaveText(result_);
      await expect(line(page)).toBeVisible();
      await expect(heatmap(page)).toBeHidden();
      expect(await visibleCharts(page)).toBe(1);
      await expect(line(page).locator('[data-annotation]')).toHaveText(`${label} cohort`);
      await expect(line(page).locator('[data-annotation]')).toBeVisible();
      const values = await line(page).locator('circle[data-month]').evaluateAll((dots) => dots.map((d) => Number(d.getAttribute('data-value'))));
      const row = await tableRow(page, label);
      expect(values.map((v) => `${Math.round(v * 100)}%`)).toEqual(row.slice(3));
      await chartTextFits(page, ID);
      await noHorizontalScroll(page);
    });
  }

  test('the picker by keyboard: focus moves into the preview and stays on Next; Enter and the arrow keys step the cohort', async ({ page }) => {
    await withoutIdle(page);
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(HOST);
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    await next(page).focus();
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(next(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(result(page)).toHaveText(FEB_RESULT);
    await expect(next(page)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(result(page)).toHaveText(MAR_RESULT);
    await expect(live(page)).toHaveText(MAR_RESULT);
    await expect(live(page)).toHaveAttribute('data-derived', 'source:retention');
    await expect(figure(page).locator('[data-step-count]')).toHaveText('3 of 11');
    await expect(heatmap(page).locator('rect[data-selected]')).toHaveAttribute('data-selected', '2010-03');
    await expect.poll(() => new URL(page.url()).searchParams.get(`${ID}.cohort`)).toBe('2010-03');
    await page.keyboard.press('Shift+Tab');
    await expect(previous(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(result(page)).toHaveText(FEB_RESULT);
    // the focus ring is not clipped: no ancestor of the picker hides its overflow
    const clipped = await previous(page).evaluate((el) => {
      for (let p = el.parentElement; p; p = p.parentElement) if (getComputedStyle(p).overflow.includes('hidden')) return true;
      return false;
    });
    expect(clipped).toBe(false);
  });

  test('focus on the preview Reset moves to the island Reset when the island loads', async ({ page }) => {
    await withoutIdle(page);
    await page.goto(HOST);
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    await figure(page).getByRole('button', { name: 'Reset' }).focus();
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(figure(page).getByRole('button', { name: 'Reset' })).toBeFocused();
  });

  test('Reset restores January, clears only its own keys and keeps the returns key and the hash', async ({ page }) => {
    await page.goto(`${HOST}?${ID}.cohort=2010-05&returns.mode=raw#host-cohorts`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(result(page)).toContainText('May 2010 cohort');
    await figure(page).getByRole('button', { name: 'Reset' }).click();
    await expect(result(page)).toHaveText(JAN_RESULT);
    await expect(live(page)).toHaveText(JAN_RESULT);
    const url = new URL(page.url());
    await expect.poll(() => [...new URL(page.url()).searchParams.keys()].filter((k) => k.startsWith(`${ID}.`))).toEqual([]);
    expect(url.searchParams.get('returns.mode')).toBe('raw');
    expect(url.hash).toBe('#host-cohorts');
  });

  test('a hostile shared URL shows January, with no error', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${HOST}?${ID}.cohort=__proto__&${ID}.preset=constructor`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(result(page)).toHaveText(JAN_RESULT);
    await page.goto(`${HOST}?${ID}.cohort=2099-01&${ID}.cohort=2010-03`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await expect(result(page)).toHaveText(JAN_RESULT);
    expect(errors).toEqual([]);
  });

  test('no motion: a cohort change starts no animation on any mark', async ({ page }) => {
    await page.goto(HOST);
    await ready(page);
    await next(page).click();
    await expect(result(page)).toHaveText(FEB_RESULT);
    const motion = await figure(page).evaluate((root) => {
      const marks = [...root.querySelectorAll('[data-mark]')];
      return {
        animations: marks.reduce((n, m) => n + m.getAnimations().length, 0),
        transitions: marks.map((m) => getComputedStyle(m).transitionDuration),
      };
    });
    expect(motion.animations).toBe(0);
    expect(motion.transitions.every((d) => d.split(',').every((part) => part.trim() === '0s'))).toBe(true);
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
    await next(page).focus();
    await expect(page.locator('[data-island="failed"]', { has: figure(page) })).toHaveCount(1);
    await expect(figure(page).locator('[data-nojs-only] [role="region"]')).toBeFocused();
    await expect(figure(page).getByText('Controls need JavaScript.')).toBeVisible();
    await expect(result(page)).toHaveText(JAN_RESULT);
  });

  test('a chart that throws after a keyboard change: the sentence takes focus, the current table shows, no plot and no controls', async ({ page }) => {
    const errors = watchErrors(page, [SEAM_FAILURE]);
    await page.goto(FAULTS);
    await ready(page);
    await next(page).focus();
    await page.keyboard.press('Enter');
    const status = figure(page).getByRole('status');
    await expect(status).toHaveText(SENTENCE);
    await expect(status).toBeFocused();
    await assertCurrentFallback(page);
    expect(errors).toEqual([]);
  });

  test('a chart that throws after a pointer change: focus is the sentence or where the click put it, never a hidden control', async ({ page }) => {
    const errors = watchErrors(page, [SEAM_FAILURE]);
    await page.goto(FAULTS);
    await ready(page);
    // Start with nothing focused, as the kit's own pointer test does.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await next(page).click();
    const status = figure(page).getByRole('status');
    await expect(status).toHaveText(SENTENCE);
    // Engines differ in what a click on a button focuses. One that focuses the button (Chromium)
    // loses it with the hidden controls, so the fallback takes it. One that does not (WebKit) puts
    // it where any click on that spot goes once it has landed: the nearest focusable ancestor, here
    // the page's <main> (tabindex -1), outside the Figure. Never a control of the Figure, and never
    // <body> unless it was there before.
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
    await assertCurrentFallback(page);
    expect(errors).toEqual([]);
  });
});

test.describe('Cohort, RFM and model Figures together', () => {
  for (const [name, viewport, scale] of [
    ['320 px', { width: 320, height: 800 }, 1],
    ['400% zoom of a 1280 px window', { width: 320, height: 256 }, 4],
  ] as const) {
    test(`reflow at ${name}: no sideways scroll, chart text inside its Figure, no overlapping labels, picker usable`, async ({ browser }) => {
      const context = await newContext(browser, viewport, scale);
      const page = await context.newPage();
      await page.goto(HOST);
      await ready(page);
      await noHorizontalScroll(page);
      for (const id of [ID, 'rfm', 'models']) {
        await figure(page, id).scrollIntoViewIfNeeded();
        await chartTextFits(page, id);
      }
      await expect(line(page)).toBeVisible();
      await next(page).scrollIntoViewIfNeeded();
      await next(page).click();
      await expect(result(page)).toHaveText(FEB_RESULT);
      await noHorizontalScroll(page);
      await context.close();
    });
  }

  test('wide: every chart keeps its labels apart and inside its Figure, and each heatmap value fits its cell', async ({ page }) => {
    // 1024x576 is the 1280x720 screen at 125% zoom.
    for (const [width, height] of [[600, 900], [1024, 900], [1440, 900], [1024, 576]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto(HOST);
      // The cohort island swaps in on intent or idle time; measure once it has, not mid-swap.
      await ready(page);
      for (const id of [ID, 'rfm', 'models']) await chartTextFits(page, id);
      const heat = await heatmap(page).evaluate((root) => {
        const box = (el: Element) => el.getBoundingClientRect();
        const cells = [...root.querySelectorAll('rect[data-cell]')];
        const outside = [...root.querySelectorAll('text[data-cell-label]')].flatMap((t) => {
          const cell = root.querySelector(`rect[data-cell][data-cohort="${t.getAttribute('data-cohort')}"][data-month="${t.getAttribute('data-month')}"]`)!;
          const [r, c] = [box(t), box(cell)];
          return r.left < c.left - 0.5 || r.right > c.right + 0.5 || r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5
            ? [`${t.getAttribute('data-cohort')} ${t.getAttribute('data-month')}`]
            : [];
        });
        // the background clear covers every cell, so the frame's row gridlines never show through a value
        const clear = box(root.querySelector('rect[data-plot-clear]')!);
        const uncovered = cells.filter((c) => {
          const r = box(c);
          return r.left < clear.left - 0.5 || r.right > clear.right + 0.5 || r.top < clear.top - 0.5 || r.bottom > clear.bottom + 0.5;
        }).length;
        const clearFirst = (root.querySelector('rect[data-plot-clear]')!.compareDocumentPosition(cells[0]!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        return { outside, uncovered, clearFirst, cells: cells.length };
      });
      expect(heat, `${width}x${height}`).toEqual({ outside: [], uncovered: 0, clearFirst: true, cells: 132 });
      // each bar label is one line, left of zero (a label split across the chart fails both)
      const misplaced = await figure(page, 'rfm').evaluate((root) => {
        const svg = [...root.querySelectorAll('svg[data-chart-frame]')].find((s) => s.getClientRects().length > 0)!;
        const zero = svg.querySelector('[data-axis-zero]')!.getBoundingClientRect().left;
        return [...svg.querySelectorAll('text[data-bar-label]')].flatMap((t) => {
          const r = t.getBoundingClientRect();
          return r.right > zero + 0.5 || r.height > 24 ? [`${t.textContent} ${Math.round(r.right - zero)} ${Math.round(r.height)}`] : [];
        });
      });
      expect(misplaced, String(width)).toEqual([]);
      await noHorizontalScroll(page);
    }
  });

  test('forced colours: values, the selected outline and the two RFM series stay distinct, and axe finds nothing', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(HOST);
    await ready(page);
    await page.emulateMedia({ forcedColors: 'active' });
    const heat = await heatmap(page).evaluate((root) => {
      const darkest = [...root.querySelectorAll<SVGRectElement>('rect[data-cell]')].sort((a, b) => Number(b.dataset.value) - Number(a.dataset.value))[0]!;
      const label = root.querySelector<SVGTextElement>(`text[data-cell-label][data-cohort="${darkest.dataset.cohort}"][data-month="${darkest.dataset.month}"]`)!;
      const outline = root.querySelector<SVGRectElement>('rect[data-selected]')!;
      const cs = (el: Element) => getComputedStyle(el);
      return {
        cellFill: cs(darkest).fill,
        cellOpacity: cs(darkest).fillOpacity,
        labelFill: cs(label).fill,
        labelShown: label.getClientRects().length > 0,
        outlineStroke: cs(outline).stroke,
        outlineWidth: cs(outline).strokeWidth,
        selectedShown: root.querySelector('[data-selected-label]')!.getClientRects().length > 0,
      };
    });
    expect(heat.labelShown).toBe(true);
    expect(heat.selectedShown).toBe(true);
    expect(heat.outlineStroke).not.toBe('none');
    expect(heat.outlineWidth).not.toBe('0px');
    // the value is printed on its cell in a colour other than the cell's own
    expect(heat.labelFill).not.toBe(heat.cellFill);
    const rfm = await figure(page, 'rfm').evaluate((root) => {
      const svg = [...root.querySelectorAll('svg[data-chart-frame]')].find((s) => s.getClientRects().length > 0)!;
      const style = (series: string) => {
        const bar = svg.querySelector(`rect[data-series="${series}"][data-segment="Champions"]`)!;
        const cs = getComputedStyle(bar);
        return `${cs.fill}|${cs.stroke}|${cs.strokeWidth}`;
      };
      return { customers: style('customers'), spend: style('spend') };
    });
    expect(rfm.customers).not.toBe(rfm.spend);
    await expectNoA11yViolations(page);
  });

  test('no number on these Figures escapes its source marker, shown or hidden, after the island loads', async ({ page }) => {
    await page.goto(`${HOST}?${ID}.cohort=2010-07`);
    await expect(island(page)).toHaveAttribute('data-island', 'ready');
    await next(page).click();
    await expect(result(page)).toContainText('Aug 2010 cohort');
    for (const id of [ID, 'rfm', 'models']) {
      const stray = await figure(page, id).evaluate((root) => {
        const out: string[] = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const parent = n.parentElement!;
          if (parent.closest('style, script')) continue;
          // A calendar year is plain text, as the truth audit allows it.
          const digits = (n.textContent ?? '').replace(/(?<![\d.,])\b20(0[89]|[12]\d|30)\b(?![.,]\d)/g, '');
          if (/\d/.test(digits) && !parent.closest('[data-derived], [data-fact]')) out.push(n.textContent!.trim());
        }
        for (const el of root.querySelectorAll('*')) {
          for (const name of ['aria-label', 'aria-valuetext', 'title', 'alt']) {
            const v = el.getAttribute(name);
            if (v && /\d/.test(v)) out.push(`${name}=${v}`);
          }
        }
        return out;
      });
      expect(stray, id).toEqual([]);
    }
  });

  test('axe finds no violations in the previews or the loaded island', async ({ page }) => {
    await withoutIdle(page);
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(HOST);
      await expectNoA11yViolations(page);
      await ready(page);
      await expectNoA11yViolations(page);
    }
  });
});

async function newContext(browser: Browser, viewport: { width: number; height: number }, deviceScaleFactor: number) {
  return browser.newContext({ viewport, deviceScaleFactor });
}

/** The kit's own fallback after a cohort change: caption, sentence and the cohort table only. */
async function assertCurrentFallback(page: Page) {
  const f = figure(page);
  await expect(f.getByRole('heading', { level: 3 })).toHaveText(TITLE);
  await expect(f.locator('figcaption > p').first()).toContainText('Month zero, the first order itself');
  const fallbackTable = f.locator('[data-figure-fallback] table');
  await expect(fallbackTable).toBeVisible();
  await expect(fallbackTable.locator('tbody tr')).toHaveCount(11);
  await expect(fallbackTable.locator('tbody td[data-num]')).toHaveCount(11 * 14);
  await expect(f.locator('[data-figure-preview]')).toHaveCount(0);
  await expect(f.locator('svg[data-chart-frame]')).toHaveCount(0);
  await expect(f.getByRole('group', { name: 'Controls' })).toBeHidden();
  await expect(f.locator('[data-figure-result]')).toBeHidden();
  await expect(f.getByText('Controls need JavaScript.')).toBeHidden();
  await expect(f).not.toContainText(SEAM_FAILURE);
  await expect(page.locator('[data-island="failed"]')).toHaveCount(0);
  await expect(island(page)).toHaveAttribute('data-island', 'ready');
}
