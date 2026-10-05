import { expect } from '@playwright/test';
import { expectNoA11yViolations, test } from './fixtures';

test('home renders and is accessible', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Mahmoud El Bergui');
  await expectNoA11yViolations(page);
});
