import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { LIVE_ROUTES } from '../../src/lib/site';
import { test, waitForIslands } from './fixtures';

// Forced groups exercise the public home route; a direct group path intentionally returns 404.
const routes = [...new Set([...LIVE_ROUTES.filter((route) => route !== '/'), '/', '/?variant=a', '/?variant=b', '/no-such-page', '/kitchen-sink', '/kitchen-sink/live'])];
const controls = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]';
const pointerTargets = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"]';

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
  return true;
}

for (const route of routes) {
  test.describe(`accessibility ${route}`, () => {
    test.setTimeout(120_000);

    test('@matrix axe and page structure', async ({ page }, testInfo) => {
      await open(page, route);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('html')).toHaveAttribute('lang', /\S+/);
      for (const role of ['banner', 'main', 'contentinfo'] as const) await expect(page.getByRole(role)).toHaveCount(1);
      const scan = () => new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
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
          }))).toBe(true);
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
      const collect = () => page.locator(pointerTargets).evaluateAll((els) => {
        const seen = new Set<Element>();
        return els.flatMap((el) => {
          // The segment label, rather than its sr-only radio, is the actual pointer target.
          const target = el.closest('label[data-segment]') ?? el;
          const s = getComputedStyle(target);
          const r = target.getBoundingClientRect();
          if (seen.has(target) || r.width === 0 || r.height === 0 || s.display === 'none' || s.visibility === 'hidden' || target.closest('[inert]')) return [];
          // Closed details content can retain rectangles despite not being rendered.
          for (let ancestor: Element | null = target; ancestor; ancestor = ancestor.parentElement) {
            if (ancestor instanceof HTMLDetailsElement && !ancestor.open && !ancestor.querySelector(':scope > summary')?.contains(target)) return [];
          }
          if (!target.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return [];
          seen.add(target);
          if (r.width >= 44 && r.height >= 44) return [];
          return [{ tag: el.tagName, id: el.id, href: el.getAttribute('href'), name: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 80), width: r.width, height: r.height }];
        });
      });
      const small = (await collect()).map((target) => ({ state: 'default', ...target }));
      if (await openMenu(page)) {
        await page.getByRole('link', { name: 'Skip to content' }).focus();
        small.push(...(await collect()).map((target) => ({ state: 'menu-open', ...target })));
      }
      expect(small, `${route}: every pointer target must be at least 44 by 44 CSS px`).toEqual([]);
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

for (const route of ['/privacy', '/missing-a11y-page']) {
  test(`accessibility ${route} reflows at 320 CSS px with enlarged root text`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(route);
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
