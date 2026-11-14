import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test, waitForIslands } from './fixtures';

// The moving state of the depth system, guarded for real. axe scans the settled page (the shared
// helper emulates reduced motion), so it cannot see an element that stays half faded while it is fully
// on screen. This spec scrolls each page in steps of half a viewport, with motion allowed, and checks:
// - at every stop, each element carrying a data-depth-* attribute whose box is fully inside the
//   viewport has an effective opacity of 1 (its own opacity times that of every ancestor);
// - at the end of the page, no element with text of its own is left at an opacity below 1.
// A failing case is a real page bug, never a reason to relax a threshold.

const ROUTES = ['/', '/work', '/about', '/work/audible'] as const;
const SIZES = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '390x844', width: 390, height: 844 },
] as const;

/** Time for scroll-linked animations to catch up with the scroll position. */
const SETTLE_MS = 150;

type Finding = { at: string; element: string; opacity: number };

/** Elements with a data-depth-* attribute that sit fully inside the viewport yet are not fully opaque. */
async function fadedInView(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const effective = (el: Element): number => {
      let o = 1;
      for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
      return o;
    };
    const describe = (el: Element): string => {
      const attrs = [...el.attributes].filter((a) => a.name.startsWith('data-depth-')).map((a) => `[${a.name}]`).join('');
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${attrs} "${text}"`;
    };
    const out: { at: string; element: string; opacity: number }[] = [];
    const at = `scrollY ${Math.round(window.scrollY)}`;
    for (const el of document.querySelectorAll('*')) {
      if (![...el.attributes].some((a) => a.name.startsWith('data-depth-'))) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const inside = r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
      if (!inside) continue;
      const o = effective(el);
      if (o < 1) out.push({ at, element: describe(el), opacity: Math.round(o * 1000) / 1000 });
    }
    return out;
  });
}

/** Elements with text of their own left at an opacity below 1, wherever they are on the page. */
async function fadedText(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const effective = (el: Element): number => {
      let o = 1;
      for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
      return o;
    };
    const out: { at: string; element: string; opacity: number }[] = [];
    for (const el of document.body.querySelectorAll('*')) {
      const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || !el.checkVisibility()) continue;
      const o = effective(el);
      if (o < 1) {
        const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
        out.push({ at: 'end of page', element: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${text}"`, opacity: Math.round(o * 1000) / 1000 });
      }
    }
    return out;
  });
}

async function settled(page: Page): Promise<void> {
  await page.waitForTimeout(SETTLE_MS);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

for (const route of ROUTES) {
  for (const size of SIZES) {
    test(`${route} at ${size.name}: nothing in view is left part faded while scrolling, and no text at the end`, async ({ browser }, info) => {
      test.skip(info.project.name !== 'desktop-chromium', 'scroll timelines: once, in Chromium');
      test.setTimeout(120_000);
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, reducedMotion: 'no-preference' });
      const page = await context.newPage();
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      await waitForIslands(page);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      // Past the load sequence, so only scroll-linked motion is left.
      await page.waitForTimeout(2_500);
      await expect.poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: no-preference)').matches)).toBe(true);

      const faded: Finding[] = [];
      const step = Math.floor(size.height / 2);
      let last = -1;
      for (let y = 0; ; y += step) {
        await page.evaluate((to) => window.scrollTo(0, to), y);
        await settled(page);
        faded.push(...(await fadedInView(page)));
        const now = await page.evaluate(() => Math.round(window.scrollY));
        if (now === last) break;
        last = now;
      }
      expect(faded, `${route} at ${size.name}: elements fully in view with an effective opacity below 1`).toEqual([]);
      expect(await fadedText(page), `${route} at ${size.name}: text left below opacity 1 at the end of the page`).toEqual([]);
      await context.close();
    });
  }
}
