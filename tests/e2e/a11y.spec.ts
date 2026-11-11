import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { LIVE_ROUTES } from '../../src/lib/site';
import { test, waitForIslands } from './fixtures';
import { markSlow } from './slow';
import { pinnedExemptions, touchTargetReport, unpinnedExemptions } from './touch-targets';

// Forced groups exercise the public home route; a direct group path intentionally returns 404.
const routes = [...new Set([...LIVE_ROUTES.filter((route) => route !== '/'), '/', '/?variant=a', '/?variant=b', '/no-such-page', '/kitchen-sink', '/kitchen-sink/live'])];
const controls = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]';
// The 144-specimen dev page is the heaviest in the matrix. Its whole-page axe scans and its tab walk
// (two animation frames per stop, 163 stops) took 17 to 44 s each in the e2e container on a quiet
// machine, and over the 120 s budget on a heavily loaded one. markSlow triples the budget of those
// two tests (360 s); the work and every assertion stay the same.
const HEAVY_ROUTES = new Set(['/kitchen-sink/live']);
const HEAVY_REASON = '144 live specimens: 17 to 44 s on a quiet machine, over 120 s under heavy load';
// The tab walk's wait, per stop, for focus scrolling to settle. A settled stop passes on its first
// two frames. markSlow does not scale an expect timeout, and on a heavily loaded runner the default
// 5 s failed a correct walk of /kitchen-sink, a page not marked slow, so this applies on every
// route: three times the default, the factor markSlow gives a test. A scroll that never settles
// still fails.
const SETTLE_TIMEOUT = 15_000;

async function open(page: Page, route: string): Promise<void> {
  const response = await page.goto(route);
  expect(response?.status(), route).toBe(route === '/no-such-page' ? 404 : 200);
  await waitForIslands(page);
  await page.evaluate(() => document.fonts.ready);
}

async function openMenu(page: Page): Promise<boolean> {
  const menu = page.locator('[data-site-header] details');
  if (!await menu.isVisible()) return false;
  if (!await menu.evaluate((el) => (el as HTMLDetailsElement).open)) {
    await menu.locator(':scope > summary').click();
  }
  // The Menu-open scan must scan an open Menu.
  await expect(menu).toHaveAttribute('open', '');
  return true;
}

for (const route of routes) {
  test.describe(`accessibility ${route}`, () => {
    test.setTimeout(120_000);

    test('@matrix axe and page structure', async ({ page }, testInfo) => {
      markSlow(HEAVY_REASON, HEAVY_ROUTES.has(route));
      await open(page, route);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('html')).toHaveAttribute('lang', /\S+/);
      for (const role of ['banner', 'main', 'contentinfo'] as const) await expect(page.getByRole(role)).toHaveCount(1);
      // Only violations keep every node; options() replaces the options, so it comes before withTags().
      const scan = () => new AxeBuilder({ page })
        .options({ resultTypes: ['violations'] })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
      const scans = [{ state: 'default', result: await scan() }];
      if (await openMenu(page)) scans.push({ state: 'menu-open', result: await scan() });
      await testInfo.attach('axe-findings', { body: JSON.stringify(scans, null, 2), contentType: 'application/json' });
      const navs = page.getByRole('navigation');
      expect(await navs.count()).toBeGreaterThan(0);
      // Additional Figure navigation is valid, but landmark names must distinguish navigation regions.
      const names = await navs.evaluateAll((els) => els.map((el) => {
        const ids = el.getAttribute('aria-labelledby')?.split(/\s+/) ?? [];
        return el.getAttribute('aria-label') ?? ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      }));
      expect(new Set(names).size, 'navigation landmark names must not repeat').toBe(names.length);
      const violations = scans.flatMap(({ state, result }) => result.violations.map(({ id, nodes }) => ({ state, id, selectors: nodes.map(({ target }) => target) })));
      testInfo.annotations.push({ type: 'axe-violations', description: String(violations.length) });
      expect(violations).toEqual([]);
    });

    test('@matrix keyboard rings, clipping and sticky-header obstruction', async ({ page, browserName }, testInfo) => {
      markSlow(HEAVY_REASON, HEAVY_ROUTES.has(route));
      await open(page, route);
      const key = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
      await page.keyboard.press(key);
      await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
      const limit = await page.locator(controls).count() * 2 + 10;
      const seen = new Set<string>();
      const findings: unknown[] = [];
      let wrapped = false;
      let repeated: string | null = null;
      try {
        for (let i = 0; i < limit; i++) {
          // Let native focus scrolling settle before judging ring geometry; no fixed timing sleep.
          await expect.poll(() => page.evaluate(() => new Promise<boolean>((resolve) => {
            const before = scrollY;
            requestAnimationFrame(() => requestAnimationFrame(() => resolve(scrollY === before)));
          })), { timeout: SETTLE_TIMEOUT }).toBe(true);
          const result = await page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            if (!el || el === document.body) return null;
            const selector = (node: Element): string => {
              if (node.id) return `#${CSS.escape(node.id)}`;
              const path: string[] = [];
              for (let at: Element | null = node; at && at !== document.body; at = at.parentElement) {
                const parent: Element | null = at.parentElement;
                path.unshift(`${at.tagName.toLowerCase()}:nth-child(${parent ? [...parent.children].indexOf(at) + 1 : 1})`);
              }
              return `body > ${path.join(' > ')}`;
            };
            // Visually hidden radios draw their keyboard ring on the actual segment label.
            const ring = el.closest<HTMLElement>('label[data-segment]') ?? el;
            const s = getComputedStyle(ring);
            const r = ring.getBoundingClientRect();
            const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 && s.outlineColor !== 'rgba(0, 0, 0, 0)';
            const shadow = s.boxShadow !== 'none' && s.boxShadow !== '';
            const reach = outline ? Math.max(0, parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset)) : 0;
            const errors: string[] = [];
            if (!outline && !shadow) errors.push('no visible focus ring');
            if (r.width <= 0 || r.height <= 0 || s.visibility === 'hidden' || s.opacity === '0') errors.push('invisible focus target');
            if (r.left - reach < -1 || r.right + reach > document.documentElement.clientWidth + 1 || r.top - reach < -1 || r.bottom + reach > innerHeight + 1) errors.push('focus ring outside viewport');
            for (let parent = ring.parentElement; parent; parent = parent.parentElement) {
              const p = getComputedStyle(parent);
              const b = parent.getBoundingClientRect();
              if (['hidden', 'clip', 'auto', 'scroll'].includes(p.overflowX) && (r.left - reach < b.left - 1 || r.right + reach > b.right + 1)) errors.push(`ring clipped horizontally by ${selector(parent)}`);
              if (['hidden', 'clip', 'auto', 'scroll'].includes(p.overflowY) && (r.top - reach < b.top - 1 || r.bottom + reach > b.bottom + 1)) errors.push(`ring clipped vertically by ${selector(parent)}`);
            }
            const header = document.querySelector<HTMLElement>('[data-site-header]');
            if (header && !header.contains(ring) && getComputedStyle(header).position === 'sticky') {
              const h = header.getBoundingClientRect();
              const overlapTop = Math.max(r.top, h.top);
              const overlapBottom = Math.min(r.bottom, h.bottom);
              if (overlapBottom > overlapTop) {
                const cover = document.elementFromPoint(r.left + r.width / 2, (overlapTop + overlapBottom) / 2);
                if (cover && header.contains(cover)) errors.push('obscured by sticky header');
              }
            }
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            if (hit && !ring.contains(hit) && !hit.contains(ring)) errors.push('focus target covered by another element');
            return { selector: selector(el), errors };
          });
          // Browser chrome can sit between the last and first document tab stops.
          if (!result) {
            await page.keyboard.press(key);
            continue;
          }
          if (seen.has(result.selector)) {
            repeated = result.selector;
            wrapped = repeated === [...seen][0];
            break;
          }
          seen.add(result.selector);
          if (result.errors.length) findings.push({ route, ...result });
          // Open the phone disclosure with its real keyboard action, then traverse its links too.
          if (await page.locator('[data-site-header] details:not([open]) > summary:focus').count()) await page.keyboard.press('Space');
          await page.keyboard.press(key);
        }
      } finally {
        await testInfo.attach('keyboard-findings', { body: JSON.stringify({ route, limit, visited: [...seen], wrapped, repeated, findings }, null, 2), contentType: 'application/json' });
      }
      if (repeated !== null) expect(repeated, 'tab order must wrap to its first stop').toBe([...seen][0]);
      expect(wrapped, 'tab order must complete without trapping focus').toBe(true);
      expect(seen.size).toBeGreaterThan(1);
      expect(findings).toEqual([]);
    });

    test('@matrix touch targets in their visible interactive state', async ({ page }) => {
      await open(page, route);
      // The skip link is intentionally clipped until focus; measure its usable visible state.
      await page.getByRole('link', { name: 'Skip to content' }).focus();
      const small = [];
      const exempt: string[] = [];
      const overlaps = [];
      const states: string[] = [];
      for (const state of ['default', 'menu-open'] as const) {
        if (state === 'menu-open') {
          if (!(await openMenu(page))) break;
          await page.getByRole('link', { name: 'Skip to content' }).focus();
        }
        states.push(state);
        const report = await touchTargetReport(page);
        small.push(...report.small.map((target) => ({ state, ...target })));
        overlaps.push(...report.overlaps.map((target) => ({ state, ...target })));
        exempt.push(...report.exempt.map((name) => `${state}: ${name}`));
      }
      // The links in running text that the inline exception lets be the height of the line: exactly the
      // pinned list for the route in every state measured (the open phone menu too), so a new one fails
      // here until it is listed and reviewed.
      const listed = `inline exception: ${exempt.length ? exempt.join('; ') : 'none'}`;
      const pinned = await pinnedExemptions(page, route);
      expect(unpinnedExemptions(exempt, pinned, states), `${route}: the inline exemptions are exactly the pinned list in every state (${listed})`).toEqual([]);
      expect(small, `${route}: every pointer target must be at least 44 by 44 CSS px (${listed})`).toEqual([]);
      expect(overlaps, `${route}: a link in running text never overlaps another target (${listed})`).toEqual([]);
    });

    test('@matrix reflow, including the 400% CSS viewport proxy', async ({ page }) => {
      await open(page, route);
      for (const height of [800, 180]) {
        await page.setViewportSize({ width: 320, height });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), { message: `${route}: reflow at 320x${height}` }).toBe(true);
      }
    });
  });
}

for (const route of ['/privacy', '/missing-a11y-page', '/kitchen-sink']) {
  test(`accessibility ${route} reflows at 320 CSS px with enlarged root text`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(route);
    if (route === '/kitchen-sink') await waitForIslands(page);
    const [before, after] = await page.evaluate(async () => {
      const root = document.documentElement;
      const initial = Number.parseFloat(getComputedStyle(root).fontSize);
      root.style.setProperty('font-size', '200%', 'important');
      await document.fonts.ready;
      return [initial, Number.parseFloat(getComputedStyle(root).fontSize)];
    });
    expect(after).toBeCloseTo(before * 2);
    const overflow = () => page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    await expect.poll(overflow, { message: `${route}, Menu closed` }).toBe(0);
    const menu = page.locator('[data-site-header] details');
    await menu.locator('summary').press('Enter');
    await expect(menu).toHaveAttribute('open', '');
    await expect.poll(overflow, { message: `${route}, Menu open` }).toBe(0);
    const panel = menu.getByRole('navigation', { name: 'Menu' });
    await expect(panel).toBeVisible();
    const bounds = await panel.evaluate((el) => {
      const { left, right } = el.getBoundingClientRect();
      return { left, right, width: document.documentElement.clientWidth };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.width);
  });
}

test.describe('the touch-target check and the inline exception', () => {
  test('the pin covers the open phone menu: an inline link added inside it is reported', async ({ page }) => {
    // Comparison per state: the menu-open state must hold the same pinned list as the default one.
    expect(unpinnedExemptions(['default: Why so many?', 'menu-open: Why so many?'], ['Why so many?'], ['default', 'menu-open'])).toEqual([]);
    expect(unpinnedExemptions(['default: Why so many?'], ['Why so many?'], ['default', 'menu-open'])).toEqual(['menu-open: found [], pinned [Why so many?]']);
    // In a browser: a sentence link inside the open menu is exempt there only, and the pin catches it.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/privacy');
    expect(await openMenu(page)).toBe(true);
    await page.locator('[data-site-header] details nav').evaluate((nav) => {
      const p = document.createElement('p');
      // Short, so the link stays on one line in the narrow panel (a wrapped link's box is two lines tall).
      p.innerHTML = 'See <a href="/fixture-menu-inline">menu link</a> now.';
      nav.append(p);
    });
    const report = await touchTargetReport(page);
    expect(report.exempt).toContain('menu link');
    const exempt = report.exempt.map((name) => `menu-open: ${name}`);
    expect(unpinnedExemptions(exempt, [], ['menu-open'])).toEqual(['menu-open: found [menu link], pinned []']);
  });

  test('exempts only a link inside a sentence; marked, inline-block, lone and non-text-block links are still measured', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/kitchen-sink');
    await waitForIslands(page);
    await page.evaluate(() => {
      const fixture = document.createElement('section');
      fixture.id = 'inline-exception-fixture';
      fixture.innerHTML = [
        '<p>Read the <a href="/fixture-inline">inline fixture link</a> in this sentence.</p>',
        '<p>Read the <a href="/fixture-marked" data-touch-target="">marked fixture link</a> in this sentence.</p>',
        '<p>Read the <a href="/fixture-inline-block" style="display:inline-block">inline-block fixture link</a> in this sentence.</p>',
        '<p><a href="/fixture-alone">lone fixture link</a></p>',
        '<div>Read the <a href="/fixture-div">div fixture link</a> in this text.</div>',
        '<p style="position:relative">Read the <a href="/fixture-overlap">covered fixture link</a> here.<button type="button" style="position:absolute;left:0;top:0;width:400px;height:60px">Over</button></p>',
        '<p><a href="/fixture-two-a">first fixture link</a> <a href="/fixture-two-b">second fixture link</a></p>',
        '<p><span aria-hidden="true">Hidden words only.</span> <a href="/fixture-hidden-text">hidden-text fixture link</a></p>',
        '<p><span class="sr-only">Screen-reader words only.</span> <a href="/fixture-sr-text">sr-text fixture link</a></p>',
        '<p>Read the <a role="link" tabindex="0">no-href fixture link</a> in this sentence.</p>',
      ].join('');
      document.body.append(fixture);
    });
    const report = await touchTargetReport(page);
    const smallHrefs = report.small.map((t) => t.href);
    expect(report.exempt).toContain('inline fixture link');
    expect(smallHrefs).not.toContain('/fixture-inline');
    for (const href of ['/fixture-marked', '/fixture-inline-block', '/fixture-alone', '/fixture-div', '/fixture-two-a', '/fixture-two-b', '/fixture-hidden-text', '/fixture-sr-text']) {
      expect(smallHrefs, href).toContain(href);
    }
    // Text in another link or hidden text is not a sentence; a link needs an href to be exempt.
    expect(report.small.map((t) => t.name)).toContain('no-href fixture link');
    expect(report.exempt).toEqual(['inline fixture link', 'covered fixture link']);
    // An exempt link that overlaps another target is reported.
    expect(report.overlaps.map((t) => t.href)).toEqual(['/fixture-overlap']);
    // The page's own standalone links (marked as touch targets) are never exempt.
    const standalone = await page.locator('[data-touch-target]:not(#inline-exception-fixture *)').evaluateAll((els) => els.map((el) => el.textContent?.trim().slice(0, 80)));
    expect(standalone.length).toBeGreaterThan(0);
    for (const name of standalone) expect(report.exempt).not.toContain(name);
  });
});
