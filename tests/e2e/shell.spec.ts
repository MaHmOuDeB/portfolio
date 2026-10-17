import { expect } from '@playwright/test';
import { test } from './fixtures';

test('skip link is the first tab stop and moves focus to main', async ({ page, browserName }) => {
  await page.goto('/');
  // WebKit on macOS skips links on Tab (Safari's default); Alt+Tab is its link-focus shortcut.
  await page.keyboard.press(browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main')).toBeFocused();
});

test('document shell: lang, JS flag and Inter features', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', 'en');
  await expect(html).toHaveAttribute('data-js', '');
  const styles = await page.evaluate(() => ({
    features: getComputedStyle(document.body).fontFeatureSettings,
    optical: getComputedStyle(document.documentElement).fontOpticalSizing,
  }));
  expect(styles.features).toContain('cv05');
  expect(styles.features).toContain('tnum');
  expect(styles.optical).toBe('auto');
});

test('favicon is the SVG icon', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="icon"]').first().getAttribute('href');
  expect(href).toMatch(/^\/icon\.svg/);
  const response = await request.get(href ?? '/icon.svg');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/svg+xml');
});
