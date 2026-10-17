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

// A Tailwind utility on the same element must never beat the JS-flag and drag rules. The test
// utilities go into the real `utilities` layer, the layer every Tailwind class compiles into.
const TEST_UTILITIES =
  '@layer utilities { .t-flex { display: flex; } .t-slow { transition-property: color; transition-duration: 240ms; } }';

test('data-js-only content is hidden without JavaScript, even with a display utility', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.route('**/', async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace(
      '</body>',
      `<style>${TEST_UTILITIES}</style>` +
        '<div id="js-only" data-js-only class="t-flex">needs js</div>' +
        '<div id="nojs-only" data-nojs-only class="t-flex">no js</div></body>',
    );
    await route.fulfill({ response, body: html });
  });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-js'))).toBe(false);
  await expect(page.locator('#js-only')).toHaveCSS('display', 'none');
  await expect(page.locator('#nojs-only')).toHaveCSS('display', 'flex');
  await context.close();
});

test('data-nojs-only content is hidden once JavaScript has run', async ({ page }) => {
  await page.goto('/');
  await page.addStyleTag({ content: TEST_UTILITIES });
  await page.evaluate(() => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div id="nojs-only" data-nojs-only class="t-flex">no js</div>' +
        '<div id="js-only" data-js-only class="t-flex">needs js</div>',
    );
  });
  await expect(page.locator('#nojs-only')).toHaveCSS('display', 'none');
  await expect(page.locator('#js-only')).toHaveCSS('display', 'flex');
});

test('a dragged figure turns off mark transitions even when a duration utility is set', async ({
  page,
}) => {
  await page.goto('/');
  await page.addStyleTag({ content: TEST_UTILITIES });
  await page.evaluate(() => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div id="figure"><span id="mark" data-mark class="t-slow">x</span></div>',
    );
  });
  const mark = page.locator('#mark');
  await expect(mark).toHaveCSS('transition-duration', '0.24s');
  await page.evaluate(() => document.getElementById('figure')?.setAttribute('data-dragging', ''));
  await expect(mark).toHaveCSS('transition-duration', '0s');
});
