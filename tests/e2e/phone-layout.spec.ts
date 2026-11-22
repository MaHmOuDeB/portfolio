import { expect, type Page } from '@playwright/test';
import { test, waitForHydration } from './fixtures';

// The phone layout below lg, and proof that a desktop screen is unchanged by it. On a phone the Menu
// opens as a sheet across the screen with full-width rows, the footer follows the last block by the
// page's own 48 px, and the Home proof row is two columns. At 1440 px the Menu, the footer's space,
// the proof row and the About layout measure what they measured before the phone rules.

function isCompact(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < 1024;
}

/**
 * The footer's top minus the bottom of the last thing drawn in main: a box with a border or a fill, or
 * the last line box of a block of text (its content box, so a paragraph's own line height counts).
 */
function footerGap(page: Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.getElementById('main')!;
    let bottom = 0;
    for (const el of main.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.height === 0 || cs.display === 'none' || cs.visibility === 'hidden') continue;
      const drawn =
        (Number.parseFloat(cs.borderBottomWidth) > 0 && cs.borderBottomStyle !== 'none') ||
        cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
        ['IMG', 'svg', 'INPUT', 'BUTTON', 'CANVAS'].includes(el.tagName);
      if (drawn) bottom = Math.max(bottom, r.bottom);
    }
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent?.trim()) continue;
      let block = node.parentElement;
      while (block && getComputedStyle(block).display.startsWith('inline')) block = block.parentElement;
      if (!block || block.getBoundingClientRect().height === 0) continue;
      const cs = getComputedStyle(block);
      bottom = Math.max(bottom, block.getBoundingClientRect().bottom - Number.parseFloat(cs.paddingBottom) - Number.parseFloat(cs.borderBottomWidth));
    }
    return document.querySelector('body > footer')!.getBoundingClientRect().top - bottom;
  });
}

test.describe('phone layout', () => {
  test('the Menu opens as a sheet across the screen, with full-width rows of at least 48 px', async ({ page }) => {
    test.skip(!isCompact(page), 'compact layout');
    for (const width of [320, 393]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      const menu = page.locator('[data-menu]');
      await waitForHydration(menu);
      await menu.locator('summary').click();
      const sheet = page.getByRole('navigation', { name: 'Menu' });
      await expect(sheet).toBeVisible();
      const box = (await sheet.boundingBox())!;
      const header = (await page.getByRole('banner').boundingBox())!;
      const screen = await page.evaluate(() => document.documentElement.clientWidth);
      expect(box.x, `${width} px`).toBe(0);
      expect(box.width, `${width} px`).toBe(screen);
      // Under the header and its hairline, never over them.
      expect(Math.round(box.y), `${width} px`).toBe(Math.round(header.y + header.height));
      const rows = await sheet.locator('ul a').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ width: r.width, height: r.height })));
      expect(rows).toHaveLength(4);
      for (const row of rows) {
        expect(row.height).toBeGreaterThanOrEqual(48);
        expect(row.width).toBe(screen - 32);
      }
      // CV and Contact side by side, at one width.
      const buttons = await sheet.locator(':scope > div a').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ top: r.top, width: r.width, height: r.height })));
      expect(buttons).toHaveLength(2);
      expect(buttons[0]!.top).toBe(buttons[1]!.top);
      expect(Math.abs(buttons[0]!.width - buttons[1]!.width)).toBeLessThan(1);
      for (const b of buttons) expect(b.height).toBeGreaterThanOrEqual(44);
      // Above the content: the middle of the sheet hits the sheet.
      const hit = await sheet.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
      });
      expect(hit).toBe(true);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
    }
  });

  test('the footer follows the last block by 48 px at 393 px, on Home, a case study, Privacy and a 404', async ({ page }) => {
    test.skip(!isCompact(page), 'compact layout');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 393, height: 852 });
    for (const route of ['/', '/work/retention', '/privacy', '/no-such-page']) {
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      expect(Math.round(await footerGap(page)), route).toBe(48);
      expect(await page.locator('body > footer').evaluate((el) => getComputedStyle(el).marginTop), route).toBe('0px');
    }
  });

  test('the Home proof row is two columns at 320 and 375 px, each figure on one line', async ({ page }) => {
    test.skip(!isCompact(page), 'compact layout');
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 812 });
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const cells = await page.locator('[data-home-proof] > [data-proof]').evaluateAll((els) => (els as HTMLElement[]).map((el) => ({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth })));
      expect(cells, `${width}`).toHaveLength(4);
      expect(new Set(cells.map((c) => c.top)).size, `${width}`).toBe(2);
      expect(new Set(cells.map((c) => c.left)).size, `${width}`).toBe(2);
      expect(cells[0]!.top, `${width}`).toBe(cells[1]!.top);
      expect(cells[2]!.top, `${width}`).toBe(cells[3]!.top);
      expect(cells[0]!.width, `${width}`).toBe(cells[1]!.width);
      // Every figure keeps its one line ("about 3 min" is the longest): it neither overflows its cell
      // nor wraps, which a scrollWidth check alone cannot see.
      const lines = await page.locator('[data-proof-figure]').evaluateAll((els) =>
        els.map((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          // A smaller word ("about") sits on the same line with a different box, so a new line starts
          // only where a box begins below the bottom of every box before it.
          const rects = [...range.getClientRects()].filter((r) => r.width > 0).sort((a, b) => a.top - b.top);
          let lines = 0;
          let bottom = -Infinity;
          for (const r of rects) {
            if (r.top >= bottom - 1) lines++;
            bottom = Math.max(bottom, r.bottom);
          }
          return { lines, overflow: el.scrollWidth > el.clientWidth + 1 };
        }),
      );
      for (const figure of lines) expect(figure, `${width}`).toEqual({ lines: 1, overflow: false });
    }
  });
});

test.describe('desktop is unchanged at 1440 px', () => {
  test('the Menu stays hidden behind the full navigation', async ({ page }) => {
    test.skip(isCompact(page), 'desktop layout');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('banner').locator('details')).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });

  test('the footer keeps its 80 px margin, and Home its 80 px of closing space', async ({ page }) => {
    test.skip(isCompact(page), 'desktop layout');
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const route of ['/', '/work/retention', '/privacy', '/no-such-page']) {
      await page.goto(route);
      const footer = page.locator('body > footer');
      expect(await footer.evaluate((el) => getComputedStyle(el).marginTop), route).toBe('80px');
      const gap = await footer.evaluate((el) => el.getBoundingClientRect().top - document.getElementById('main')!.getBoundingClientRect().bottom);
      expect(gap, route).toBe(80);
    }
    await page.goto('/');
    const space = await page.locator('#main > div').last().evaluate((el) => getComputedStyle(el).paddingBottom);
    expect(space).toBe('80px');
  });

  test('the proof row is four columns in one row, the section heads keep 84 px and the card titles three lines', async ({ page }) => {
    test.skip(isCompact(page), 'desktop layout');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const proof = page.locator('[data-home-proof]');
    const columns = (await proof.evaluate((el) => getComputedStyle(el).gridTemplateColumns)).split(' ').map(Number.parseFloat);
    expect(columns).toHaveLength(4);
    for (const [got, want] of columns.map((c, i) => [c, [255.5, 279.5, 279.5, 255.5][i]!] as const)) expect(got).toBeCloseTo(want, 0);
    const cells = await proof.locator('[data-proof]').evaluateAll((els) => (els as HTMLElement[]).map((el) => el.offsetTop));
    expect(new Set(cells).size).toBe(1);
    expect(await proof.locator('[data-proof-figure]').first().evaluate((el) => getComputedStyle(el).fontSize)).toBe('40px');
    expect(await page.locator('[data-section-head]').first().evaluate((el) => getComputedStyle(el).paddingTop)).toBe('84px');
    const titles = await page.locator('[data-depth-lean] h3[data-title-lines]').evaluateAll((els) => els.map((el) => Number.parseFloat(getComputedStyle(el).minHeight)));
    expect(titles.length).toBeGreaterThan(0);
    for (const t of titles) expect(t).toBeCloseTo(3 * 1.125 * 16 * 1.2, 0);
  });

  test('the About page keeps its layout: buttons in a row, the portrait whole, tools as cards three across, languages five across', async ({ page }) => {
    test.skip(isCompact(page), 'desktop layout');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/about');
    expect(await page.locator('[data-about-actions]').evaluate((el) => getComputedStyle(el).display)).toBe('flex');
    expect(await page.locator('[data-about-story]').evaluate((el) => getComputedStyle(el).fontSize)).toBe('20px');
    const img = await page.locator('article img').first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return { fit: cs.objectFit, ratio: el.getBoundingClientRect().width / el.getBoundingClientRect().height };
    });
    expect(img.fit).toBe('fill');
    expect(img.ratio).toBeCloseTo(4 / 5, 2);
    const tools = page.locator('[data-about-tools]');
    expect((await tools.evaluate((el) => getComputedStyle(el).gridTemplateColumns)).split(' ')).toHaveLength(3);
    expect(await tools.evaluate((el) => getComputedStyle(el).rowGap)).toBe('12px');
    const card = await tools.locator('li').first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return [cs.borderTopLeftRadius, cs.paddingTop, cs.paddingLeft, cs.borderTopWidth, cs.borderBottomWidth, cs.backgroundColor];
    });
    expect(card).toEqual(['12px', '16px', '16px', '1px', '1px', 'rgb(255, 255, 255)']);
    expect((await page.locator('[data-about-languages]').evaluate((el) => getComputedStyle(el).gridTemplateColumns)).split(' ')).toHaveLength(5);
  });
});
