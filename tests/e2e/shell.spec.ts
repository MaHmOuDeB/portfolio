import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations, test, waitForHydration } from './fixtures';

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
  // Tabular figures widen the hyphen, so they are off on body text (see the next test).
  expect(styles.features).not.toContain('tnum');
  expect(styles.optical).toBe('auto');
});

// Tabular figures (tnum) widen the hyphen, the minus, the full stop, the colon and the space as well, so
// they belong on the elements that are numbers and never on prose. `probe` measures text with the font
// of a real element and a given feature setting. Widths are read at 100 px and compared with a
// tolerance of 1.5 px, and a non-tabular digit differs by about 25 px, so font hinting and rounding
// differences between macOS and the Linux container cannot flip a result.
async function measureNumerals(page: Page, specimen: string, selector: string) {
  return page.locator(`[data-specimen="${specimen}"] ${selector}`).first().evaluate((el) => {
    const style = getComputedStyle(el);
    const probe = (text: string, features: string | null) => {
      const span = document.createElement('span');
      span.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-family:${style.fontFamily};font-size:100px;font-weight:${style.fontWeight};font-optical-sizing:auto;text-rendering:${style.textRendering}`;
      span.style.fontFeatureSettings = features ?? style.fontFeatureSettings;
      span.textContent = text;
      document.body.append(span);
      const width = span.getBoundingClientRect().width;
      span.remove();
      return width;
    };
    return { ones: probe('111', null), zeros: probe('000', null), features: style.fontFeatureSettings, rendering: style.textRendering };
  });
}

test('prose keeps a normal hyphen even inside a data-derived paragraph; numbers stay tabular', async ({ page }) => {
  await page.goto('/kitchen-sink');
  await page.evaluate(() => document.fonts.ready);
  // The URL-state Figures render their server view first and the client replaces it once it has read the
  // URL; measure the settled one, not a node that is about to be swapped out.
  await expect(page.locator('[data-specimen="url-state--two-figures"] [data-state-from="url"]').first()).toBeVisible();
  // A real paragraph that carries data-derived (the URL-state readout) and says "two-sided".
  const hyphen = await page.locator('[data-specimen="url-state--two-figures"] p[data-readout][data-derived]').first().evaluate((p) => {
    const node = [...p.childNodes].find((n) => n.nodeType === 3 && /two-sided/.test(n.textContent ?? ''))!;
    const at = (node.textContent ?? '').indexOf('two-sided');
    const range = document.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + 'two-sided'.length);
    const style = getComputedStyle(p);
    const probe = document.createElement('span');
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-family:${style.fontFamily};font-size:${style.fontSize};font-weight:${style.fontWeight};font-feature-settings:"cv05"`;
    probe.textContent = 'two-sided';
    document.body.append(probe);
    const expected = probe.getBoundingClientRect().width;
    probe.remove();
    return { actual: range.getBoundingClientRect().width, expected, features: style.fontFeatureSettings };
  });
  expect(hyphen.features).not.toContain('tnum');
  // A tabular hyphen would be about 3 px wider at this size; 1 px tolerates rounding between platforms.
  expect(Math.abs(hyphen.actual - hyphen.expected), JSON.stringify(hyphen)).toBeLessThan(1);

  // Numbers in a table cell, a tick label, a Fact and a derived value are tabular: '111' as wide as '000'.
  for (const [specimen, selector] of [
    ['table--open', 'td[data-num]'],
    ['chartframe--static', 'svg[data-chart-frame] text[data-tick="y"]'],
    ['chartframe--static', 'svg[data-chart-frame] text[data-tick="x"]'],
    ['stat--derived', 'data[data-derived]'],
    ['fact--inline', 'data[data-fact]'],
  ] as const) {
    const m = await measureNumerals(page, specimen, selector);
    expect(m.features, `${specimen} ${selector}`).toContain('tnum');
    // Linux rounds glyph advances unless the text is rendered with geometric precision.
    expect(m.rendering.toLowerCase(), `${specimen} ${selector}`).toBe('geometricprecision');
    expect(Math.abs(m.ones - m.zeros), `${specimen} ${selector}: 111 as wide as 000 ${JSON.stringify(m)}`).toBeLessThan(1.5);
  }
  // Prose has lining proportional digits: a '1' is narrower than a '0'.
  const prose = await measureNumerals(page, 'url-state--two-figures', 'p[data-readout]');
  expect(prose.features).not.toContain('tnum');
  expect(prose.zeros - prose.ones, 'a lining 1 is narrower than a 0').toBeGreaterThan(10);

  await page.goto('/kitchen-sink/live');
  const now = await measureNumerals(page, 'live--ab--enough-data--fresh--default', '[data-now-row="interval"] span[data-derived]');
  expect(now.features).toContain('tnum');
  expect(Math.abs(now.ones - now.zeros)).toBeLessThan(1.5);
  const nowZero = await measureNumerals(page, 'live--ab--enough-data--fresh--default', '[data-now-row="interval"] text[data-derived]');
  expect(Math.abs(nowZero.ones - nowZero.zeros)).toBeLessThan(1.5);
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

/**
 * Makes the page 3000 px taller without touching the DOM React hydrates. A node added to <main> before
 * hydration is a mismatch: React client-renders the tree and drops it, and the scroll never happens.
 * A constructable stylesheet added before the page loads is not part of that DOM (the same pattern as
 * cardsBelowTheFold in experiment.spec.ts).
 */
async function addScrollHeight(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('#main::after { content: ""; display: block; height: 3000px; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
}

function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < 768;
}

test.describe('site header', () => {
  test('desktop: wordmark, full navigation in order, the CV link, no Menu', async ({ page }) => {
    test.skip(isPhone(page), 'desktop layout');
    await page.goto('/');
    const header = page.getByRole('banner');
    await expect(header.getByRole('link', { name: 'Mahmoud El Bergui' })).toHaveAttribute('href', '/');
    const nav = header.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link')).toHaveText(LABELS);
    // "CV", the CV page, in every build; the PDF is offered on that page.
    const cv = header.getByRole('link', { name: 'CV', exact: true });
    await expect(cv).toHaveAttribute('href', '/cv');
    await expect(cv).not.toHaveAttribute('download');
    await expect(header.locator('summary')).toBeHidden();
  });

  test('phone: full navigation is hidden, wordmark, the CV link and Menu are shown', async ({ page }) => {
    test.skip(!isPhone(page), 'phone layout');
    await page.goto('/');
    const header = page.getByRole('banner');
    await expect(header.getByRole('navigation', { name: 'Main' })).toBeHidden();
    await expect(header.getByRole('link', { name: 'Mahmoud El Bergui' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'CV', exact: true })).toBeVisible();
    await expect(header.locator('summary')).toHaveText('Menu');
  });

  test('phone: Menu lists the same four labels and Escape closes it', async ({ page }) => {
    test.skip(!isPhone(page), 'phone layout');
    await page.goto('/');
    const summary = page.getByRole('banner').locator('summary');
    const list = page.getByRole('navigation', { name: 'Menu' });
    await expect(list).toBeHidden();
    // The Menu opens without JavaScript, but Escape closes it only once it is hydrated.
    await waitForHydration(page.getByRole('banner').locator('details'));
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

  test('sticky from md up on a screen at least 700 px tall, never under md or on a shorter screen', async ({ page }) => {
    test.skip(isPhone(page), 'the viewports below set their own size');
    await addScrollHeight(page);
    await page.goto('/');
    const headerTop = async (width: number, height: number) => {
      await page.setViewportSize({ width, height });
      // Set the scroll position directly so this measures sticky layout after resizing.
      await page.evaluate(() => window.scrollTo({ top: 1000, behavior: 'instant' }));
      await page.waitForFunction(() => window.scrollY >= 900);
      return page.getByRole('banner').evaluate((el) => el.getBoundingClientRect().top);
    };
    expect(await headerTop(1024, 700)).toBe(0);
    expect(await headerTop(1440, 900)).toBe(0);
    // The screen-share size (1024 by 576): the header would take 11% of the screen, so it scrolls away.
    expect(await headerTop(1024, 576)).toBeLessThan(-100);
    expect(await headerTop(1024, 699)).toBeLessThan(-100);
    // A phone width, even when tall.
    expect(await headerTop(600, 900)).toBeLessThan(-100);
  });

  test('the phone header is one row at 375 and 390 px, with 44 px targets', async ({ page }) => {
    test.skip(!isPhone(page), 'phone layout');
    for (const width of [375, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      const header = page.getByRole('banner');
      const rows = await header.locator('a:visible, summary:visible').evaluateAll((els) => [...new Set(els.map((el) => Math.round(el.getBoundingClientRect().top)))]);
      expect(rows, `${width} px: every header control sits on one row`).toHaveLength(1);
      const height = await header.evaluate((el) => el.getBoundingClientRect().height);
      expect(height).toBeLessThanOrEqual(66);
      for (const h of await header.locator('[data-touch-target]:visible').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
        expect(h).toBeGreaterThanOrEqual(44);
      }
      await expect(header.getByRole('link', { name: 'Mahmoud El Bergui' })).toBeVisible();
      // The signature stays: the 28 px variant, the same construction (bar, two caps, a dot).
      const glyph = header.locator('[data-header-glyph]:visible svg');
      await expect(glyph).toHaveCount(1);
      expect(await glyph.evaluate((el) => el.getBoundingClientRect().width)).toBeCloseTo(28, 0);
      expect(await glyph.locator('rect').count()).toBe(3);
      expect(await glyph.locator('circle').count()).toBe(1);
    }
  });

  test('the header keeps its glyph at 320 px (it wraps to two rows, nothing is cut off) and shows the full one from 480', async ({ page }) => {
    test.skip(!isPhone(page), 'phone layout');
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');
    const header = page.getByRole('banner');
    await expect(header.locator('[data-header-glyph]:visible svg')).toHaveCount(1);
    const fits = await header.locator('a:visible, summary:visible').evaluateAll((els) =>
      els.every((el) => el.getBoundingClientRect().left >= 0 && el.getBoundingClientRect().right <= document.documentElement.clientWidth),
    );
    expect(fits).toBe(true);
    await page.setViewportSize({ width: 480, height: 800 });
    const wide = header.locator('[data-header-glyph]:visible svg');
    await expect(wide).toHaveCount(1);
    expect(await wide.evaluate((el) => el.getBoundingClientRect().width)).toBeCloseTo(48, 0);
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
    await expect(footer.locator('a[href^="mailto:"]')).toHaveCount(0);
    await expect(footer.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/melbergui',
    );
    await expect(footer.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/MaHmOuDeB',
    );
    await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    const contact = footer.getByRole('link', { name: 'Contact', exact: true });
    await expect(contact).toHaveAttribute('href', '/contact');
    // The contact form is the first link in the footer.
    await expect(footer.getByRole('link').first()).toHaveAttribute('href', '/contact');
    expect(await footer.innerText()).not.toContain('@');
    for (const height of await footer
      .locator('[data-touch-target]')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
      expect(height).toBeGreaterThanOrEqual(44);
    }
  });

  test('the colophon line is the same plain line on every page, including a 404', async ({ page }) => {
    // Every route but the last is a real page now, so each must answer 200 (not the 404 page).
    for (const route of ['/', '/work', '/lab', '/experiment', '/about', '/cv', '/contact', '/privacy', '/no-such-page']) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(route === '/no-such-page' ? 404 : 200);
      const line = page.getByRole('contentinfo').getByText('Built with Claude Code as pair-programmer.', { exact: true });
      await expect(line, route).toHaveCount(1);
      await expect(line, route).toHaveText('Built with Claude Code as pair-programmer.');
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

test('the sticky header never covers an in-page anchor target', async ({ page }) => {
  test.skip(isPhone(page), 'the header is sticky from md up only');
  await page.setViewportSize({ width: 1024, height: 768 });
  // The target is <main id="main"> itself, the element the skip link points at: it exists in the server
  // HTML, so nothing is inserted into the DOM React hydrates.
  await addScrollHeight(page);
  await page.goto('/');
  await page.mouse.wheel(0, 1500);
  await page.waitForFunction(() => window.scrollY >= 1000);
  // Following an in-page link scrolls the target to the top edge of the viewport.
  await page.evaluate(() => {
    window.location.hash = 'main';
  });
  await page.waitForFunction(() => window.scrollY < 1000);
  const { top, header } = await page.evaluate(() => ({
    top: document.getElementById('main')?.getBoundingClientRect().top ?? -1,
    header: Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--header-h'),
    ) * Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
  }));
  expect(header).toBe(64);
  expect(top).toBeGreaterThanOrEqual(header - 1);
});

test('a Figure linked by its id lands below the sticky header', async ({ page }) => {
  test.skip(isPhone(page), 'the header is sticky from md up only');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/kitchen-sink/live#live--ab--enough-data--fresh--default');
  await page.waitForFunction(() => window.scrollY > 500);
  // Wait for the scroll to settle (the position is the same on two frames in a row), then compare with
  // a 1 px tolerance: the figure's top is fractional, and 63.92 is as good as 64.
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const y = window.scrollY;
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.scrollY === y)));
      }),
  );
  const top = await page.locator('[data-figure="live--ab--enough-data--fresh--default"]').evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(64 - 1);
});

test.describe('not found page', () => {
  test('an unknown address returns 404 with the approved copy, shell and actions', async ({ page }) => {
    const response = await page.goto('/no-such-page');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    const main = page.locator('main#main');
    await expect(main).toContainText(
      'There is no page at this address. Check the address, or start from one of these pages.',
    );
    await expect(main.getByRole('link', { name: 'Work' })).toHaveAttribute('href', '/work');
    await expect(main.getByRole('link', { name: 'Lab' })).toHaveAttribute('href', '/lab');
    await expect(main.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/melbergui',
    );
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
    expect(await page.title()).toBe('Page not found');
    expect(await page.locator('body').innerText()).not.toMatch(/\b(404|500)\b/);
    expect(await page.title()).not.toMatch(/\b(404|500)\b/);
  });

  test('the actions are at least 44 px tall', async ({ page }) => {
    await page.goto('/no-such-page');
    const targets = page.locator('main#main [data-touch-target]');
    expect(await targets.count()).toBe(3);
    for (const height of await targets.evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().height),
    )) {
      expect(height).toBeGreaterThanOrEqual(44);
    }
  });

  test('axe finds no violations', async ({ page }) => {
    await page.goto('/no-such-page');
    await expectNoA11yViolations(page);
  });
});

// next/link prefetches in-view links; a prefetch of a page a later plan builds is a 404 in the
// console, which fails Lighthouse Best Practices. lib/nav.ts prefetchFor turns those off.
test('the home page loads without console errors or failed requests, prefetches included', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Prefetches start after hydration, on idle; give them time to fire before asserting none failed.
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});
