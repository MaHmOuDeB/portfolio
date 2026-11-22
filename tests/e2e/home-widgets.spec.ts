// The widgets that are native elements: the "How I test" tabs on /work (radios inside labels, one panel
// at a time), the FAQ rows on /about (details), and on Home the live bar and the experience band's sheets
// at two sizes. Home itself no longer holds the tabs or the FAQ.
import { expect } from '@playwright/test';
import { test } from './fixtures';

test.describe('Home widgets', () => {
  test('Home holds neither the "How I test" tabs nor the FAQ', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-home-how], [data-home-faq], [data-home-questions], [data-home-shipped], [data-home-site]')).toHaveCount(0);
  });

  test('How I test (on /work): the tabs switch by keyboard and by pointer, and one panel shows at a time', async ({ page }) => {
    await page.goto('/work');
    const tabs = page.locator('[data-home-how] [role="radiogroup"] input[type="radio"]');
    await expect(tabs).toHaveCount(3);
    const visiblePanels = () =>
      page.locator('[data-how-panel]').evaluateAll((els) =>
        els.filter((el) => getComputedStyle(el).display !== 'none').map((el) => el.getAttribute('data-how-panel')),
      );
    await expect(tabs.nth(0)).toBeChecked();
    expect(await visiblePanels()).toEqual(['plan']);
    // Keyboard: the browser moves the selection with the arrow keys inside a radio group.
    await tabs.nth(0).focus();
    await page.keyboard.press('ArrowDown');
    await expect(tabs.nth(1)).toBeChecked();
    expect(await visiblePanels()).toEqual(['analyse']);
    await page.keyboard.press('ArrowDown');
    await expect(tabs.nth(2)).toBeChecked();
    expect(await visiblePanels()).toEqual(['recommend']);
    // Pointer: a click on a tab's label selects it.
    await page.locator('[data-home-how] label').first().click();
    await expect(tabs.nth(0)).toBeChecked();
    expect(await visiblePanels()).toEqual(['plan']);
  });

  test('FAQ (on /about): a row opens and closes by keyboard', async ({ page }) => {
    await page.goto('/about');
    const rows = page.locator('[data-home-faq] [data-faq-row]');
    expect(await rows.count()).toBeGreaterThanOrEqual(2);
    await expect(rows.first()).toHaveJSProperty('open', true);
    const second = rows.nth(1);
    await expect(second).toHaveJSProperty('open', false);
    await second.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(second).toHaveJSProperty('open', true);
    await page.keyboard.press('Space');
    await expect(second).toHaveJSProperty('open', false);
  });

  test('live bar: present with its sentence and a link to the live test', async ({ page }) => {
    await page.goto('/');
    const bar = page.getByRole('region', { name: 'Live test' });
    await expect(bar).toHaveCount(1);
    await expect(bar).toBeVisible();
    expect((await bar.innerText()).trim().length).toBeGreaterThan(0);
    await expect(bar.getByRole('link')).toHaveCount(1);
    await expect(bar.getByRole('link')).toHaveAttribute('href', /\/experiment/);
  });

  for (const size of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    test(`experience band: the sheets do not overflow at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/');
      const band = page.locator('[data-depth-band]');
      await band.scrollIntoViewIfNeeded();
      // Walk down the band so a scroll-linked layout reaches its end state as well.
      for (const fraction of [0, 0.5, 1]) {
        await page.evaluate((f) => {
          const b = document.querySelector('[data-depth-band]')!.getBoundingClientRect();
          window.scrollTo(0, window.scrollY + b.top + f * Math.max(0, b.height - window.innerHeight));
        }, fraction);
        await page.waitForTimeout(200);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
          `sideways scroll at ${fraction}`,
        ).toBeLessThanOrEqual(0);
        const sheets = await page.locator('[data-depth-sheet]').evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right };
          }),
        );
        expect(sheets.length).toBeGreaterThanOrEqual(3);
        for (const s of sheets) {
          expect(s.left, 'sheet left edge in the viewport').toBeGreaterThanOrEqual(-1);
          expect(s.right, 'sheet right edge in the viewport').toBeLessThanOrEqual(size.width + 1);
        }
      }
    });
  }
});
