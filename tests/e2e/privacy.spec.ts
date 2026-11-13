// The privacy page: accessible, reachable from the footer, and readable at 320 px.
import { expect } from '@playwright/test';
import { CONTACT } from '../../src/lib/site';
import { expectNoA11yViolations, test } from './fixtures';

test('/privacy passes axe', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.locator('h1')).toHaveText('Privacy');
  await expectNoA11yViolations(page);
});

test('the footer link "Privacy" opens the page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.locator('h1')).toHaveText('Privacy');
  await expect(page).toHaveTitle(/Privacy/);
});

test('/privacy reflows at 320 px without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/privacy');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('/privacy names LinkedIn as the contact, with no mail link, and a placeholder only as a note', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  const contact = page.locator(`main a[href="${CONTACT.linkedin}"]`);
  await expect(contact).toHaveCount(1);
  await expect(contact).toHaveText(/linkedin\.com\/in\//);
  const target = await contact.boundingBox();
  expect(target?.width).toBeGreaterThanOrEqual(44);
  expect(target?.height).toBeGreaterThanOrEqual(44);
  for (const note of await page.locator('[data-launch-placeholder]').all()) {
    await expect(note).toContainText('Not confirmed yet');
  }
});
