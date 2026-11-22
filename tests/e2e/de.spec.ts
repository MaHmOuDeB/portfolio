// The German shell in a browser: its own 404, the language links and the Menu's two rows.
import { expect, test } from '@playwright/test';

test.describe('German shell', () => {
  test('an unknown /de address is the German 404, with lang de', async ({ page }) => {
    const response = await page.goto('/de/x');
    expect(response?.status()).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByRole('heading', { level: 1, name: 'Seite nicht gefunden' })).toBeVisible();
  });

  test('the language links carry the query and hash across and back', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // No German page is registered yet, so the round trip starts on the German 404 and ends on /de.
    await page.goto('/de/x?a=1#b');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await page.locator('[data-language-menu] summary').click();
    await page.locator('[data-language-menu] a[hreflang="en"]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    let url = new URL(page.url());
    expect([url.pathname, url.search, url.hash]).toEqual(['/', '?a=1', '#b']);
    await page.locator('[data-language-menu] summary').click();
    await page.locator('[data-language-menu] a[hreflang="de"]').click();
    await page.waitForURL(/\/de\?a=1#b$/);
    url = new URL(page.url());
    expect([url.pathname, url.search, url.hash]).toEqual(['/de', '?a=1', '#b']);
  });

  test('the Menu shows both language rows at 390 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/work');
    await page.locator('[data-menu] summary').click();
    const menu = page.locator('[data-menu] nav');
    for (const name of ['English', 'Deutsch']) {
      const link = menu.getByRole('link', { name });
      await expect(link).toBeVisible();
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(menu.getByRole('link', { name: 'English' })).toHaveAttribute('aria-current', 'true');
  });
});
