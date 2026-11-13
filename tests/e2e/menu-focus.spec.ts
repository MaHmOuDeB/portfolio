import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';

test.use({ viewport: { width: 375, height: 812 } });

// The keyboard exit, Escape and link closing are what JavaScript adds to the <details>, so each
// test opens the Menu once those handlers are attached (`data-ready`); before that, Tab out of an
// open Menu leaves it open, as it does without JavaScript.
async function openMenu(page: Page, path = '/') {
  await page.goto(path);
  const menu = page.locator('[data-site-header] details');
  const summary = menu.locator('summary');
  await expect(menu).toHaveAttribute('data-ready', '');
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
  await expect(page.getByRole('banner').getByRole('link', { name: 'CV', exact: true })).toBeFocused();
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

test('Menu opened before the page hydrates stays open through hydration', async ({ page }) => {
  // Hold the JavaScript back so the reader opens the native <details> first.
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/_next\/static\/chunks\/.*\.js(\?.*)?$/, async (route) => {
    await released;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'commit' });
  const menu = page.locator('[data-site-header] details');
  await menu.locator('summary').click();
  await expect(menu).toHaveAttribute('open', '');
  await expect(menu).not.toHaveAttribute('data-ready', '');
  // Record any close, however brief, so a later check cannot miss one.
  await menu.evaluate((el) => {
    (window as unknown as { menuClosed: boolean }).menuClosed = false;
    new MutationObserver(() => {
      if (!el.hasAttribute('open')) (window as unknown as { menuClosed: boolean }).menuClosed = true;
    }).observe(el, { attributes: true, attributeFilter: ['open'] });
  });
  release();
  // React runs the mount effects before it commits the next render, the one that sets data-ready.
  await expect(menu).toHaveAttribute('data-ready', '');
  expect(await page.evaluate(() => (window as unknown as { menuClosed: boolean }).menuClosed)).toBe(false);
  await expect(menu).toHaveAttribute('open', '');
  await expect(menu.getByRole('link', { name: 'Lab', exact: true })).toBeVisible();
});
