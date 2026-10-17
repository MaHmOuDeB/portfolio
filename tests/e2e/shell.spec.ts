import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations, test } from './fixtures';

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

const PHONE = /\+\d{2}[\d\s]{8,}|\b0\d{3}\s?\d{3,}/;
const LABELS = ['Work', 'Lab', 'Live test', 'About'];

function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < 768;
}

test.describe('site header', () => {
  test('desktop: wordmark, full navigation in order, CV (PDF), no Menu', async ({ page }) => {
    test.skip(isPhone(page), 'desktop layout');
    await page.goto('/');
    const header = page.getByRole('banner');
    await expect(header.getByRole('link', { name: 'Mahmoud El Bergui' })).toHaveAttribute('href', '/');
    const nav = header.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link')).toHaveText(LABELS);
    const cv = header.getByRole('link', { name: 'CV (PDF)' });
    await expect(cv).toHaveAttribute('href', '/cv.pdf');
    await expect(cv).toHaveAttribute('download', '');
    await expect(header.locator('summary')).toBeHidden();
  });

  test('phone: full navigation is hidden, wordmark, CV (PDF) and Menu are shown', async ({ page }) => {
    test.skip(!isPhone(page), 'phone layout');
    await page.goto('/');
    const header = page.getByRole('banner');
    await expect(header.getByRole('navigation', { name: 'Main' })).toBeHidden();
    await expect(header.getByRole('link', { name: 'Mahmoud El Bergui' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'CV (PDF)' })).toBeVisible();
    await expect(header.locator('summary')).toHaveText('Menu');
  });

  test('phone: Menu lists the same four labels and Escape closes it', async ({ page }) => {
    test.skip(!isPhone(page), 'phone layout');
    await page.goto('/');
    const summary = page.getByRole('banner').locator('summary');
    const list = page.getByRole('navigation', { name: 'Menu' });
    await expect(list).toBeHidden();
    await summary.click();
    await expect(list.getByRole('link')).toHaveText(LABELS);
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(summary).toBeFocused();
  });

  test('phone: Menu opens without JavaScript', async ({ browser, baseURL, page: runner }) => {
    test.skip(!isPhone(runner), 'phone layout');
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('banner').locator('summary').click();
    await expect(page.getByRole('navigation', { name: 'Menu' }).getByRole('link')).toHaveText(LABELS);
    await context.close();
  });

  test('sticky from md up, never under md', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const filler = document.createElement('div');
      filler.style.height = '3000px';
      document.getElementById('main')?.append(filler);
    });
    await page.mouse.wheel(0, 1000);
    await page.waitForFunction(() => window.scrollY >= 900);
    const top = await page.getByRole('banner').evaluate((el) => el.getBoundingClientRect().top);
    if (isPhone(page)) expect(top).toBeLessThan(-100);
    else expect(top).toBe(0);
  });

  test('interactive header controls are at least 44 px tall', async ({ page }) => {
    await page.goto('/');
    const targets = page.getByRole('banner').locator('[data-touch-target]:visible');
    expect(await targets.count()).toBeGreaterThan(0);
    for (const box of await targets.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
      expect(box).toBeGreaterThanOrEqual(44);
    }
  });

  test('marks the current page and nothing else', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[aria-current="page"]')).toHaveCount(0);
  });
});

test.describe('footer', () => {
  test('contact and privacy links, with visible labels and no address text', async ({ page }) => {
    await page.goto('/');
    const footer = page.getByRole('contentinfo');
    await expect(footer.getByRole('link', { name: 'Email' })).toHaveAttribute(
      'href',
      'mailto:elberguimahmoud11@gmail.com',
    );
    await expect(footer.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/melbergui',
    );
    await expect(footer.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/MaHmOuDeB',
    );
    await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(await footer.innerText()).not.toContain('@');
    for (const height of await footer
      .locator('[data-touch-target]')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
      expect(height).toBeGreaterThanOrEqual(44);
    }
  });
});

test('the page text carries no phone number', async ({ page }) => {
  await page.goto('/');
  expect(await page.locator('body').innerText()).not.toMatch(PHONE);
});

test('axe finds no violations with the shell in place', async ({ page }) => {
  await page.goto('/');
  await expectNoA11yViolations(page);
});

test('axe finds no violations with the phone Menu open', async ({ page }) => {
  test.skip(!isPhone(page), 'phone layout');
  await page.goto('/');
  await page.getByRole('banner').locator('summary').click();
  await expectNoA11yViolations(page);
});
