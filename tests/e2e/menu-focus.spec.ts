import { expect, type Page } from '@playwright/test';
import { test, waitForHydration } from './fixtures';

test.use({ viewport: { width: 375, height: 812 } });

async function openMenu(page: Page, path = '/') {
  await page.goto(path);
  const menu = page.locator('[data-site-header] details');
  const summary = menu.locator('summary');
  // The Menu opens without JavaScript, but it closes on a keyboard exit only once it is hydrated.
  await waitForHydration(menu);
  await summary.focus();
  await page.keyboard.press('Space');
  await expect(menu).toHaveAttribute('open', '');
  return { menu, summary, links: menu.getByRole('link') };
}

function tabKey(browserName: string, reverse = false): string {
  const prefix = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+' : '';
  return `${prefix}${reverse ? 'Shift+' : ''}Tab`;
}

test('Menu closes on forward keyboard exit without stealing destination focus', async ({ page, browserName }) => {
  const { menu, links } = await openMenu(page);
  const count = await links.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await page.keyboard.press(tabKey(browserName));
    await expect(links.nth(i)).toBeFocused();
    await expect(menu).toHaveAttribute('open', '');
  }
  await page.keyboard.press(tabKey(browserName));
  const destination = page.getByRole('main').locator('a[href]').first();
  await expect(destination).toBeFocused();
  await expect(menu).not.toHaveAttribute('open', '');
  await expect.poll(() => destination.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.width > 0 && r.height > 0 && !!hit && el.contains(hit);
  })).toBe(true);
});

test('Menu closes on backward keyboard exit without restoring summary focus', async ({ page, browserName }) => {
  const { menu } = await openMenu(page);
  await page.keyboard.press(tabKey(browserName, true));
  await expect(page.getByRole('banner').getByRole('link', { name: 'CV (PDF)' })).toBeFocused();
  await expect(menu).not.toHaveAttribute('open', '');
});

test('Menu closes after a null-relatedTarget exit without moving focus', async ({ page }) => {
  const { menu, summary } = await openMenu(page);
  await summary.evaluate((el) => el.blur());
  await expect(menu).not.toHaveAttribute('open', '');
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});

test('Menu stays open when null-relatedTarget blur finishes on an internal link', async ({ page }) => {
  const { menu, summary, links } = await openMenu(page);
  await summary.evaluate((el) => {
    el.blur();
    el.parentElement?.querySelector('a')?.focus();
  });
  await expect(links.first()).toBeFocused();
  await expect(menu).toHaveAttribute('open', '');
});

test('Menu still closes on same-path link activation', async ({ page }) => {
  // The unfinished destination still renders the real shell on its not-found response.
  const { menu, links } = await openMenu(page, '/lab');
  await links.filter({ hasText: /^Lab$/ }).click();
  await expect(page).toHaveURL(/\/lab$/);
  await expect(menu).not.toHaveAttribute('open', '');
});


test('Menu pointer activation navigates to a different page after keyboard open', async ({ page }) => {
  const { menu, links } = await openMenu(page);
  await links.filter({ hasText: /^Lab$/ }).click();
  await expect(page).toHaveURL(/\/lab$/);
  await expect(menu).not.toHaveAttribute('open', '');
});
