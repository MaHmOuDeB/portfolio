import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect } from '@playwright/test';
import type { APIRequestContext, Browser, BrowserContextOptions, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test, waitForIslands } from './fixtures';
import { pinnedExemptions, touchTargetReport, unpinnedExemptions } from './touch-targets';

// The Home page's quality gates, in one place:
// - the real page (/?variant=a and /?variant=b) across the size matrix: HTTP 200 with the matching
//   x-arm, no sideways scroll, every pointer target at least 44 px (the pinned inline links aside),
//   every focus ring visible, unclipped and clear of the sticky header, and the same geometry in both
//   groups for every block; the phone fold at 375x812 holds the h1 and the primary button in both;
// - every text state of the Home composition on the test build's host, in a wide, a phone, a
//   reduced-motion and a no-JavaScript layout: one h1 and the landmarks, no repeated id, no "undefined"
//   or "NaN", named images, captioned tables, and no axe violation;
// - the budgets: the first-load JavaScript (unique script tags of the served HTML, gzip) against the
//   pre-Home baseline, the HTML document, the JavaScript after 5 s idle, and no statistics code in
//   the page-load scripts;
// - the real page holds no island, no chart and no planner (the calculator lives in the Lab).
// The numbers are recorded as annotations (type "measure") in the JSON report.

// Playwright runs from the repository root (experiment.spec.ts reads .next from there too).
const ROOT = process.cwd();
const TOLERANCE = 1;

type Arm = 'a' | 'b';
type Size = { width: number; height: number; deviceScaleFactor?: number; note: string };

/** The size matrix: phones, tablet, laptop, desktop, screen share (1280x720 at 125%), 320 px and 400% zoom. */
const MATRIX: readonly Size[] = [
  { width: 360, height: 800, note: 'common Android' },
  { width: 375, height: 667, note: 'small phone' },
  { width: 375, height: 812, note: 'phone fold' },
  { width: 390, height: 844, note: 'phone' },
  { width: 768, height: 1024, note: 'tablet' },
  { width: 1024, height: 768, note: 'laptop' },
  { width: 1440, height: 900, note: 'desktop' },
  { width: 1024, height: 576, deviceScaleFactor: 1.25, note: 'screen share, 1280x720 at 125%' },
  { width: 320, height: 568, note: '320 px reflow' },
  { width: 320, height: 180, note: '1280x720 at 400%' },
];

const controls = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

function measure(name: string, value: unknown) {
  test.info().annotations.push({ type: 'measure', description: `${name}: ${typeof value === 'string' ? value : JSON.stringify(value)}` });
}

async function settled(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await waitForIslands(page);
  // The load sequence is time-based: wait for it, so two pages are measured at rest (scroll-linked
  // animations have no end and stay at their scroll position).
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.timeline instanceof DocumentTimeline).map((a) => a.finished.catch(() => undefined))));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function openHome(browser: Browser, arm: Arm, size: Size, options: BrowserContextOptions = {}): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.deviceScaleFactor, ...options });
  const page = await context.newPage();
  const response = await page.goto(`/?variant=${arm}`);
  expect(response?.status(), `/?variant=${arm}`).toBe(200);
  expect(response?.headers()['x-arm'], `/?variant=${arm}`).toBe(arm);
  await settled(page);
  return page;
}

/**
 * What a Home page was rendered from, as far as it shows: each Figure's body and every live number (a <time> aside: it says when the page read the store, which differs
 * between two renders of the same data). Equal for both groups when both render the same data.
 */
async function renderedData(page: Page): Promise<string> {
  return page.evaluate(() => JSON.stringify({
    bodies: [...document.querySelectorAll('figure[data-figure]')].map((f) => `${f.getAttribute('data-figure')}:${f.getAttribute('data-body') ?? ''}`),
    live: [...document.querySelectorAll('[data-derived~="live"]')]
      .filter((el) => el.closest('time') === null && el.querySelector('time') === null)
      .map((el) => (el.textContent ?? '').trim()),
  }));
}

/**
 * The time one revalidation needs at most: each group's page regenerates on its own, at most
 * `revalidate` (300 s) after its last render, on the first request after that.
 */
const ONE_REVALIDATION_MS = 330_000;

/**
 * Both groups' real pages, rendered from the same data. /v/a and /v/b are separate ISR pages that
 * regenerate on their own every 300 s, while the suite's counted views change the store. A pair read
 * across one group's regeneration holds two different states (CI: group A the build's "under 50",
 * group B a regenerated "fewer than 5", which prints a different note), and comparing their geometry measures the data, not the groups. So the pair is read
 * again until both show the same data: the request that got the stale page has started its
 * regeneration, so the next pair normally agrees. Only the precondition is waited for; every
 * geometry check below stays exact.
 */
async function openBothGroups(browser: Browser, size: Size): Promise<Record<Arm, Page>> {
  const deadline = Date.now() + ONE_REVALIDATION_MS;
  for (let attempt = 1; ; attempt++) {
    const pages = { a: await openHome(browser, 'a', size), b: await openHome(browser, 'b', size) };
    const a = await renderedData(pages.a);
    const b = await renderedData(pages.b);
    if (a === b) {
      measure('pair reads until both groups show the same data', attempt);
      return pages;
    }
    measure(`pair ${attempt} rendered from different data`, { a, b });
    await pages.a.context().close();
    await pages.b.context().close();
    expect(Date.now(), `group A and group B never rendered the same data within one revalidation: A ${a}, B ${b}`).toBeLessThan(deadline);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

type Rect = { x: number; y: number; width: number; height: number };

/** Every section and card box of the home page, in page coordinates, keyed by what it is. */
async function sections(page: Page): Promise<Record<string, Rect>> {
  return page.evaluate(() => {
    const out: Record<string, { x: number; y: number; width: number; height: number }> = {};
    const put = (key: string, el: Element | null) => {
      if (el === null) return;
      const r = el.getBoundingClientRect();
      out[key] = { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
    };
    put('header', document.querySelector('[data-site-header]'));
    put('hero', document.querySelector('[data-hero]'));
    put('proof', document.querySelector('[data-home-proof]'));
    put('experiments', document.querySelector('[data-home-track="experiments"]'));
    put('cards', document.querySelector('[data-experiment="cards"]'));
    for (const card of document.querySelectorAll('[data-case-card]')) {
      const study = card.getAttribute('data-case-card');
      put(`${study}:card`, card);
      put(`${study}:headline`, card.querySelector('[data-case-headline]'));
      // The whole card is the link.
      put(`${study}:link`, card.matches('[data-experiment-click="card"]') ? card : null);
    }
    put('automation', document.querySelector('[data-home-track="automation"]'));
    put('tiles', document.querySelector('[data-home-tiles]'));
    put('ribbon', document.querySelector('[data-home-ribbon]'));
    put('site', document.querySelector('[data-home-site]'));
    put('note', document.querySelector('[data-home-note]'));
    put('decision', document.querySelector('[data-home-decision]'));
    put('footer', document.querySelector('footer'));
    out.page = { x: 0, y: 0, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight };
    return out;
  });
}

/** Focus each control in turn (as a keyboard reader would land on it) and report every ring that is missing, clipped, off screen or under the sticky header. */
async function focusFindings(page: Page): Promise<unknown[]> {
  const count = await page.locator(controls).count();
  const findings: unknown[] = [];
  for (let i = 0; i < count; i++) {
    // Focus can load an island, which swaps its preview for the same controls; stop if the list shrank.
    if (i >= (await page.locator(controls).count())) break;
    const control = page.locator(controls).nth(i);
    const usable = await control.evaluate((el) => {
      const s = getComputedStyle(el);
      const closedDetails = el.closest('details:not([open])') !== null && el.closest('summary') === null;
      return el.getClientRects().length > 0 && s.visibility !== 'hidden' && el.closest('[inert]') === null && !closedDetails && !(el as HTMLInputElement).disabled;
    });
    if (!usable) continue;
    await control.focus();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const result = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const ring = el.closest<HTMLElement>('label[data-segment]') ?? el;
      const s = getComputedStyle(ring);
      const r = ring.getBoundingClientRect();
      const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
      const reach = outline ? Math.max(0, parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset)) : 0;
      const errors: string[] = [];
      if (!outline && s.boxShadow === 'none') errors.push('no visible focus ring');
      const vw = document.documentElement.clientWidth;
      // A target taller than the visible area (below a sticky header) can never show its whole ring; for
      // it WCAG 2.4.7 and 2.4.11 are met when its top edge, ring included, is on screen below the header
      // (the page puts it at the top), with both sides in view. Every other target shows its whole ring.
      const sticky = document.querySelector<HTMLElement>('[data-site-header]');
      const covered = sticky && getComputedStyle(sticky).position === 'sticky' ? Math.max(0, sticky.getBoundingClientRect().bottom) : 0;
      const tall = r.height + 2 * reach > innerHeight - covered;
      const across = r.left - reach < -1 || r.right + reach > vw + 1;
      if (tall) {
        if (across || r.top - reach < covered - 1 || r.top - reach >= innerHeight) errors.push(`top of a tall target's ring outside the viewport (top ${Math.round(r.top - reach)}, visible from ${Math.round(covered)})`);
      } else if (across || r.top - reach < -1 || r.bottom + reach > innerHeight + 1) errors.push('ring outside the viewport');
      for (let p = ring.parentElement; p; p = p.parentElement) {
        const ps = getComputedStyle(p);
        const b = p.getBoundingClientRect();
        if (['hidden', 'clip', 'auto', 'scroll'].includes(ps.overflowX) && (r.left - reach < b.left - 1 || r.right + reach > b.right + 1)) errors.push(`clipped across by ${p.tagName.toLowerCase()}`);
        if (['hidden', 'clip', 'auto', 'scroll'].includes(ps.overflowY) && (r.top - reach < b.top - 1 || r.bottom + reach > b.bottom + 1)) errors.push(`clipped down by ${p.tagName.toLowerCase()}`);
      }
      const header = document.querySelector<HTMLElement>('[data-site-header]');
      if (header && !header.contains(ring) && getComputedStyle(header).position === 'sticky') {
        const h = header.getBoundingClientRect();
        if (r.top < h.bottom - 1 && r.bottom > h.top) {
          const cover = document.elementFromPoint(r.left + r.width / 2, Math.max(r.top, h.top) + 1);
          if (cover && header.contains(cover)) errors.push('under the sticky header');
        }
      }
      const name = (ring.getAttribute('aria-label') ?? ring.textContent ?? '').trim().slice(0, 60);
      return errors.length ? { name, tag: ring.tagName.toLowerCase(), errors } : null;
    });
    if (result) findings.push(result);
  }
  return findings;
}

test.describe('Home quality: the real page in both groups across the size matrix', () => {
  for (const size of MATRIX) {
    test(`@quality ${size.width}x${size.height} (${size.note}): reflow, targets, focus and the same geometry in both groups`, async ({ browser }, info) => {
      test.skip(info.project.name !== 'desktop-chromium' && info.project.name !== 'desktop-webkit', 'explicit sizes, once per engine');
      test.setTimeout(180_000 + ONE_REVALIDATION_MS);
      const pages = await openBothGroups(browser, size);
      const geometry: Record<string, Record<string, Rect>> = {};
      for (const arm of ['a', 'b'] as const) {
        const page = pages[arm];
        const label = `group ${arm} at ${size.width}x${size.height}`;
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${label}: sideways scroll`).toBeLessThanOrEqual(0);
        geometry[arm] = await sections(page);
        // The skip link is clipped to 1 px until it has focus: measure it in its usable, focused state.
        await page.getByRole('link', { name: 'Skip to content' }).focus();
        const report = await touchTargetReport(page);
        expect(report.small, `${label}: targets under 44 px`).toEqual([]);
        expect(report.overlaps, `${label}: inline links over another target`).toEqual([]);
        // Every link in running text, small or not: at 320 px a link can wrap onto two lines, and its box
        // is then 44 px or more, yet it is the same link in the same sentence.
        const exempt = report.sentenceLinks.map((name) => `default: ${name}`);
        expect(unpinnedExemptions(exempt, await pinnedExemptions(page, `/?variant=${arm}`), ['default']), `${label}: inline exemptions`).toEqual([]);
        expect(await focusFindings(page), `${label}: focus rings`).toEqual([]);
      }
      const a = geometry.a!;
      const b = geometry.b!;
      expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
      for (const key of ['hero', 'proof', 'experiments', 'cards', 'automation', 'tiles', 'ribbon', 'site', 'decision', 'footer', 'audible:card', 'retention:card', 'pulse:card']) expect(a[key], key).toBeDefined();
      for (const key of Object.keys(a)) {
        for (const side of ['x', 'y', 'width', 'height'] as const) {
          expect(Math.abs(a[key]![side] - b[key]![side]), `${key}.${side}: group A ${a[key]![side]}, group B ${b[key]![side]}`).toBeLessThanOrEqual(TOLERANCE);
        }
      }
      await pages.a.context().close();
      await pages.b.context().close();
    });
  }

  test('@quality phone fold at 375x812: the h1 and the primary button are in view, at the same place in both groups', async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'explicit size');
    const boxes: Rect[][] = [];
    for (const arm of ['a', 'b'] as const) {
      const page = await openHome(browser, arm, { width: 375, height: 812, note: 'fold' }, { isMobile: true, hasTouch: true });
      const hero = page.locator('[data-hero]');
      const found: Rect[] = [];
      for (const el of [hero.locator('h1'), hero.getByRole('link', { name: 'See the evidence' })]) {
        await expect(el).toBeVisible();
        const box = (await el.boundingBox())!;
        expect(box.y + box.height, `group ${arm}: ${await el.innerText()}`).toBeLessThanOrEqual(812);
        found.push(box);
      }
      boxes.push(found);
      await page.context().close();
    }
    expect(boxes[1]).toEqual(boxes[0]);
  });

  test('@quality the Lighthouse URLs answer 200 with the matching x-arm', async ({ request }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'once');
    const config = JSON.parse(readFileSync(join(ROOT, 'lighthouserc.json'), 'utf8')) as { ci: { collect: { url: string[] } } };
    expect(config.ci.collect.url.length).toBe(2);
    for (const url of config.ci.collect.url) {
      const { pathname, search } = new URL(url);
      const arm = new URLSearchParams(search).get('variant');
      const response = await request.get(`${pathname}${search}`);
      expect(response.status(), url).toBe(200);
      expect(response.headers()['x-arm'], url).toBe(arm);
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// Every text state of the composition, on the test build's host.

/** The quoted strings between `start` and `end` in a source file. */
function listed(file: string, start: string, end: string): string[] {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const from = src.indexOf(start);
  const body = src.slice(from + start.length, src.indexOf(end, from + start.length));
  return [...body.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]!);
}
const MODES = listed('src/app/kitchen-sink/home/states.ts', 'const MODES: readonly HomeMode[] = [', '];');
const NARRATIVE = listed('src/lib/home/narrative-fixtures.ts', 'export const NARRATIVE_FIXTURES = [', '] as const');
const STATES = [...MODES, ...NARRATIVE, 'ab-many-looks'];

type Layout = { name: string; size: { width: number; height: number }; options: BrowserContextOptions };
const LAYOUTS: readonly Layout[] = [
  { name: 'wide', size: { width: 1440, height: 900 }, options: {} },
  { name: 'phone', size: { width: 375, height: 667 }, options: {} },
  { name: 'phone (reduced motion)', size: { width: 375, height: 667 }, options: { reducedMotion: 'reduce' } },
  { name: 'wide (no JavaScript)', size: { width: 1440, height: 900 }, options: { javaScriptEnabled: false } },
];

test.describe('Home quality: every text state', () => {
  test('@quality the state list is read from the host fixtures', async ({}, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'once');
    expect(MODES).toHaveLength(14);
    expect(NARRATIVE.length).toBeGreaterThan(20);
  });

  for (const state of STATES) {
    test(`@quality ${state}: DOM and aria in the wide, phone, reduced-motion and no-JavaScript layouts`, async ({ browser }, info) => {
      test.skip(info.project.name !== 'desktop-chromium', 'explicit layouts');
      test.setTimeout(120_000);
      for (const layout of LAYOUTS) {
        const label = `${state}, ${layout.name}`;
        const context = await browser.newContext({ viewport: layout.size, ...layout.options });
        const page = await context.newPage();
        const response = await page.goto(`/kitchen-sink/home/b/${state}`);
        expect(response?.status(), label).toBe(200);
        if (layout.options.javaScriptEnabled !== false) await settled(page);
        await expect(page.locator('h1'), label).toHaveCount(1);
        for (const role of ['banner', 'main', 'contentinfo'] as const) await expect(page.getByRole(role), label).toHaveCount(1);
        const report = await page.evaluate(() => {
          const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
          const shown = (el: Element | null) => el !== null && el.getClientRects().length > 0;
          const nameOf = (el: Element) =>
            (el.getAttribute('aria-label') ?? (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ')).trim();
          return {
            repeated: ids.filter((id, i) => ids.indexOf(id) !== i),
            text: (document.querySelector('main') as HTMLElement).innerText,
            unnamedImages: [...document.querySelectorAll('main svg[role="img"], main [role="img"]')].filter((el) => shown(el) && nameOf(el) === '').map((el) => el.outerHTML.slice(0, 80)),
            uncaptioned: [...document.querySelectorAll('main table')].filter((t) => (t.querySelector('caption')?.textContent ?? '').trim() === '').length,
          };
        });
        expect(report.repeated, `${label}: repeated ids`).toEqual([]);
        expect(report.text, `${label}: placeholder words`).not.toMatch(/\bundefined\b|\bNaN\b|\[object Object\]/);
        expect(report.unnamedImages, `${label}: unnamed images`).toEqual([]);
        expect(report.uncaptioned, `${label}: tables without a caption`).toBe(0);
        if (layout.name === 'phone') {
          const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
          expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), `${label}: axe`).toEqual([]);
        }
        await context.close();
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------------
// Budgets.

/**
 * The pre-Home first-load JavaScript of the home route: unique script tags, gzip level 6 (measured on
 * main before any Home code, on a plain build). These specs run on the test build (KITCHEN_SINK=1),
 * whose shared chunks read slightly larger (about 0.9 KB on the home route), so the growth asserted
 * here errs on the strict side; the authoritative figure is the same method on a plain build.
 */
const BASELINE_FIRST_LOAD = 143_560;
const KB = 1024;
const BUDGET = { growth: 30 * KB, armJs: 5 * KB, html: 60 * KB, armHtml: 1 * KB };
const gzip = (body: Buffer) => gzipSync(body).length;

/** The unique script URLs a served HTML names (nomodule excluded), as paths. */
function scriptTags(html: string): string[] {
  const files = new Set<string>();
  for (const tag of html.matchAll(/<script\b[^>]*>/gi)) {
    if (/\snomodule(?=[\s=>])/i.test(tag[0])) continue;
    const src = /\ssrc="([^"]+)"/i.exec(tag[0])?.[1];
    if (src) files.add(src.split('?')[0]!);
  }
  return [...files].sort();
}

async function gzipOf(request: APIRequestContext, paths: readonly string[]): Promise<number> {
  let total = 0;
  for (const p of paths) total += gzip(await (await request.get(p)).body());
  return total;
}

/** Strings that exist only in the statistics library (its range errors). */
const STATS_MARKERS = ['mdeType must be', 'normalQuantile: p must be in'];

test.describe('Home quality: budgets', () => {
  test('@quality first-load JavaScript and HTML, both groups, against the pre-Home baseline', async ({ request }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'once');
    const result: Record<string, { scripts: number; js: number; html: number }> = {};
    for (const arm of ['a', 'b'] as const) {
      const html = await (await request.get(`/?variant=${arm}`)).body();
      const scripts = scriptTags(html.toString('utf8'));
      result[arm] = { scripts: scripts.length, js: await gzipOf(request, scripts), html: gzip(html) };
    }
    measure('first-load JS gzip (a, b)', [result.a!.js, result.b!.js]);
    measure('first-load growth over the pre-Home baseline (a, b)', [result.a!.js - BASELINE_FIRST_LOAD, result.b!.js - BASELINE_FIRST_LOAD]);
    measure('HTML gzip (a, b)', [result.a!.html, result.b!.html]);
    for (const arm of ['a', 'b'] as const) {
      expect(result[arm]!.js - BASELINE_FIRST_LOAD, `group ${arm}: first-load growth`).toBeLessThanOrEqual(BUDGET.growth);
      expect(result[arm]!.html, `group ${arm}: HTML`).toBeLessThanOrEqual(BUDGET.html);
    }
    expect(Math.abs(result.a!.js - result.b!.js), 'first-load JS, group difference').toBeLessThanOrEqual(BUDGET.armJs);
    expect(Math.abs(result.a!.html - result.b!.html), 'HTML, group difference').toBeLessThanOrEqual(BUDGET.armHtml);
  });

  test('@quality the enough-data host state in both groups: HTML and first-load JavaScript within the same budgets', async ({ request }, info) => {
    // The heaviest Home state: an A/B with ten looks, so the note holds its largest counts.
    test.skip(info.project.name !== 'desktop-chromium', 'once');
    const result: Record<string, { scripts: number; js: number; html: number }> = {};
    for (const arm of ['a', 'b'] as const) {
      const response = await request.get(`/kitchen-sink/home/${arm}/ab-many-looks`);
      expect(response.status(), `group ${arm}`).toBe(200);
      const html = await response.body();
      const scripts = scriptTags(html.toString('utf8'));
      result[arm] = { scripts: scripts.length, js: await gzipOf(request, scripts), html: gzip(html) };
    }
    measure('enough-data host: first-load JS gzip (a, b)', [result.a!.js, result.b!.js]);
    measure('enough-data host: first-load growth over the pre-Home baseline (a, b)', [result.a!.js - BASELINE_FIRST_LOAD, result.b!.js - BASELINE_FIRST_LOAD]);
    measure('enough-data host: HTML gzip (a, b)', [result.a!.html, result.b!.html]);
    for (const arm of ['a', 'b'] as const) {
      // The host carries the test build's shared chunks too, so this bound is the strict side (see BASELINE_FIRST_LOAD).
      expect(result[arm]!.js - BASELINE_FIRST_LOAD, `group ${arm}: first-load growth`).toBeLessThanOrEqual(BUDGET.growth);
      expect(result[arm]!.html, `group ${arm}: HTML`).toBeLessThanOrEqual(BUDGET.html);
    }
    expect(Math.abs(result.a!.js - result.b!.js), 'first-load JS, group difference').toBeLessThanOrEqual(BUDGET.armJs);
    expect(Math.abs(result.a!.html - result.b!.html), 'HTML, group difference').toBeLessThanOrEqual(BUDGET.armHtml);
  });

  test('@quality no statistics code in the page-load scripts (the calculator is not on this page)', async ({ request }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'once');
    for (const arm of ['a', 'b'] as const) {
      const html = await (await request.get(`/?variant=${arm}`)).text();
      for (const path of scriptTags(html)) {
        const body = await (await request.get(path)).text();
        for (const marker of STATS_MARKERS) expect(body.includes(marker), `group ${arm}: ${path} holds "${marker}"`).toBe(false);
      }
    }
    // The check is not vacuous: the build does hold the statistics code in some chunk (the Lab's islands).
    const chunks = join(ROOT, '.next/static/chunks');
    const held = (dir: string): boolean =>
      readdirSync(dir, { withFileTypes: true }).some((e) =>
        e.isDirectory() ? held(join(dir, e.name)) : e.name.endsWith('.js') && STATS_MARKERS.some((m) => readFileSync(join(dir, e.name), 'utf8').includes(m)),
      );
    expect(held(chunks), 'some chunk of the build holds the statistics markers').toBe(true);
  });

  test('@quality JavaScript after 5 s idle, both groups, at phone and desktop sizes, on the real page and the enough-data host state', async ({ browser, request }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'once');
    test.setTimeout(150_000);
    const pages = { real: (arm: 'a' | 'b') => `/?variant=${arm}`, 'enough-data host': (arm: 'a' | 'b') => `/kitchen-sink/home/${arm}/ab-many-looks` };
    for (const [name, url] of Object.entries(pages)) {
      for (const size of [{ width: 375, height: 667 }, { width: 1440, height: 900 }]) {
        for (const arm of ['a', 'b'] as const) {
          const context = await browser.newContext({ viewport: size });
          const page = await context.newPage();
          const scripts = new Set<string>();
          page.on('request', (r) => {
            if (r.resourceType() === 'script') scripts.add(new URL(r.url()).pathname);
          });
          await page.goto(url(arm));
          await page.waitForTimeout(5000);
          const first = new Set(scriptTags(await (await request.get(url(arm))).text()));
          const later = [...scripts].filter((p) => !first.has(p)).sort();
          const total = await gzipOf(request, [...scripts]);
          measure(`JS at 5 s idle, ${name}, group ${arm}, ${size.width}x${size.height}`, { scripts: scripts.size, gzipBytes: total, laterScripts: later.length, laterGzipBytes: await gzipOf(request, later) });
          // Every first-load script was requested (the page loaded what its HTML names).
          expect([...first].filter((p) => !scripts.has(p)), `${name}, group ${arm}: first-load scripts not requested`).toEqual([]);
          await context.close();
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// No island on the real page.

test.describe('Home quality: no island', () => {
  test('@quality the real page holds no lazy island, no chart Figure and no planner, in either group', async ({ page }) => {
    for (const arm of ['a', 'b'] as const) {
      await page.goto(`/?variant=${arm}`);
      await page.waitForLoadState('load');
      await expect(page.locator('[data-island]'), `group ${arm}`).toHaveCount(0);
      await expect(page.locator('figure[data-figure]'), `group ${arm}`).toHaveCount(0);
      await expect(page.locator('[data-scroll-moment], [data-hero-simulator]'), `group ${arm}`).toHaveCount(0);
    }
  });
});
