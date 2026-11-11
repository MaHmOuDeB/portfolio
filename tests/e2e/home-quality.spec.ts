import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect } from '@playwright/test';
import type { APIRequestContext, Browser, BrowserContextOptions, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test, waitForIslands } from './fixtures';
import { watchScripts } from './island-code';
import { pinnedExemptions, touchTargetReport, unpinnedExemptions } from './touch-targets';

// The Home page's quality gates, in one place:
// - the real page (/?variant=a and /?variant=b) across the size matrix: HTTP 200 with the matching
//   x-arm, no sideways scroll, every pointer target at least 44 px (the pinned inline links aside),
//   every focus ring visible, unclipped and clear of the sticky header, and the same geometry in both
//   groups for every section; the phone fold at 375x812 holds the planner's title and readout in both;
// - every text state of the Home composition on the test build's host, in the sticky and stacked
//   layouts: one h1 and the landmarks, the five steps in order, no repeated id, no "undefined" or
//   "NaN", named charts, captioned tables, a current step only where the stage is drawn, a silent live
//   region on load, and no axe violation;
// - the budgets: the first-load JavaScript (unique script tags of the served HTML, gzip) against the
//   pre-Home baseline, the HTML document, the JavaScript after 5 s idle, the time to a measured chart
//   at 4x CPU, and no statistics code in the page-load scripts;
// - the planner's preview before hydration (focus kept, the fold unmoved), the lazy island in each
//   engine with the scripts it loads recorded, and the "your view" tick under forced colours.
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
    put('planner', document.querySelector('figure[data-figure="hero-planner"]'));
    put('note', document.querySelector('[data-home-note]'));
    put('cards', document.querySelector('[data-experiment="cards"]'));
    for (const card of document.querySelectorAll('[data-case-card]')) {
      const study = card.getAttribute('data-case-card');
      put(`${study}:card`, card);
      put(`${study}:headline`, card.querySelector('[data-case-headline]'));
      put(`${study}:link`, card.querySelector('[data-experiment-click="card"]'));
    }
    put('moment', document.querySelector('[data-scroll-moment]'));
    for (const step of document.querySelectorAll('[data-scroll-step]')) put(`step-${step.getAttribute('data-scroll-step')}`, step);
    put('tools', document.querySelector('[data-home-tools]'));
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
      if (r.left - reach < -1 || r.right + reach > vw + 1 || r.top - reach < -1 || r.bottom + reach > innerHeight + 1) errors.push('ring outside the viewport');
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
      test.setTimeout(180_000);
      const pages = { a: await openHome(browser, 'a', size), b: await openHome(browser, 'b', size) };
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
      for (const key of ['hero', 'planner', 'cards', 'moment', 'tools', 'footer', 'audible:card', 'retention:card', 'pulse:card']) expect(a[key], key).toBeDefined();
      for (const key of Object.keys(a)) {
        for (const side of ['x', 'y', 'width', 'height'] as const) {
          expect(Math.abs(a[key]![side] - b[key]![side]), `${key}.${side}: group A ${a[key]![side]}, group B ${b[key]![side]}`).toBeLessThanOrEqual(TOLERANCE);
        }
      }
      await pages.a.context().close();
      await pages.b.context().close();
    });
  }

  test('@quality phone fold at 375x812: the planner title and readout are in view, at the same place in both groups', async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'explicit size');
    const boxes: Rect[][] = [];
    for (const arm of ['a', 'b'] as const) {
      const page = await openHome(browser, arm, { width: 375, height: 812, note: 'fold' }, { isMobile: true, hasTouch: true });
      const figure = page.locator('figure[data-figure="hero-planner"]');
      const found: Rect[] = [];
      for (const el of [figure.locator('h2'), figure.locator('[data-figure-lead] [data-planner-n]')]) {
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

  test('@quality the Lighthouse URLs answer 200 with the matching x-arm', async ({ request }) => {
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
const MODES = listed('src/app/kitchen-sink/home/steps/states.ts', 'const MODES: readonly HomeMode[] = [', '];');
const NARRATIVE = listed('src/lib/home/narrative-fixtures.ts', 'export const NARRATIVE_FIXTURES = [', '] as const');
const EXTRA = ['ab-many-looks', 'chart-error', 'ab-tick', 'ab-two-charts', 'home-fresh', 'home-ceiling-day', 'home-stale-at-render'];
const STATES = [...MODES, ...NARRATIVE, ...EXTRA];

type Layout = { name: string; size: { width: number; height: number }; options: BrowserContextOptions };
const LAYOUTS: readonly Layout[] = [
  { name: 'sticky, two columns', size: { width: 1440, height: 900 }, options: {} },
  { name: 'sticky, one column', size: { width: 375, height: 667 }, options: {} },
  { name: 'stacked (reduced motion)', size: { width: 375, height: 667 }, options: { reducedMotion: 'reduce' } },
  { name: 'stacked (no JavaScript)', size: { width: 1440, height: 900 }, options: { javaScriptEnabled: false } },
];

const STEPS = ['Hypothesis', 'Split', 'Evidence', 'Guardrails', 'Decision'];

test.describe('Home quality: every text state', () => {
  test('@quality the state list matches the host index', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'once');
    expect(MODES).toHaveLength(14);
    expect(NARRATIVE.length).toBeGreaterThan(20);
    await page.goto('/kitchen-sink/home/steps');
    const ids = await page.locator('main li a').allTextContents();
    expect(ids.map((s) => s.trim())).toEqual([...MODES, ...NARRATIVE]);
  });

  for (const state of STATES) {
    test(`@quality ${state}: DOM and aria in the sticky and stacked layouts`, async ({ browser }, info) => {
      test.skip(info.project.name !== 'desktop-chromium', 'explicit layouts');
      test.setTimeout(120_000);
      for (const layout of LAYOUTS) {
        const label = `${state}, ${layout.name}`;
        const context = await browser.newContext({ viewport: layout.size, ...layout.options });
        const page = await context.newPage();
        const response = await page.goto(`/kitchen-sink/home/scroll/${state}`);
        expect(response?.status(), label).toBe(200);
        if (layout.options.javaScriptEnabled !== false) {
          await settled(page);
          // A chart that fails (or comes late) drops the moment to its frames: let that settle.
          await expect(page.locator('[data-scroll-moment] [data-home-chart]:not([data-measured])')).toHaveCount(0, { timeout: 15_000 });
        }
        // The current step follows the stage, which a dropped chart hides: wait until the two agree.
        await expect
          .poll(() => page.evaluate(() => {
            const staged = (document.querySelector('[data-scroll-stage]')?.getClientRects().length ?? 0) > 0;
            const current = document.querySelectorAll('[data-scroll-step][aria-current]').length;
            return staged ? current === 1 : current === 0;
          }), { message: `${label}: aria-current follows the stage` })
          .toBe(true);
        await expect(page.locator('h1'), label).toHaveCount(1);
        for (const role of ['banner', 'main', 'contentinfo'] as const) await expect(page.getByRole(role), label).toHaveCount(1);
        const report = await page.evaluate(() => {
          const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
          const moment = document.querySelector('[data-scroll-moment]');
          const stage = document.querySelector('[data-scroll-stage]');
          const shown = (el: Element | null) => el !== null && el.getClientRects().length > 0;
          const nameOf = (el: Element) =>
            (el.getAttribute('aria-label') ?? (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ')).trim();
          return {
            repeated: ids.filter((id, i) => ids.indexOf(id) !== i),
            steps: [...(moment?.querySelectorAll('[data-scroll-step] > h3') ?? [])].map((h) => h.textContent?.trim()),
            current: [...document.querySelectorAll('[data-scroll-step][aria-current]')].map((el) => `${el.getAttribute('data-scroll-step')}=${el.getAttribute('aria-current')}`),
            staged: shown(stage),
            text: (document.querySelector('main') as HTMLElement).innerText,
            unnamedImages: [...document.querySelectorAll('main svg[role="img"], main [role="img"]')].filter((el) => shown(el) && nameOf(el) === '').map((el) => el.outerHTML.slice(0, 80)),
            uncaptioned: [...document.querySelectorAll('main table')].filter((t) => (t.querySelector('caption')?.textContent ?? '').trim() === '').length,
            live: [...document.querySelectorAll('[data-step-live]')].map((el) => el.textContent ?? ''),
          };
        });
        expect(report.repeated, `${label}: repeated ids`).toEqual([]);
        expect(report.steps, `${label}: steps`).toEqual(STEPS);
        expect(report.text, `${label}: placeholder words`).not.toMatch(/\bundefined\b|\bNaN\b|\[object Object\]/);
        expect(report.unnamedImages, `${label}: unnamed images`).toEqual([]);
        expect(report.uncaptioned, `${label}: tables without a caption`).toBe(0);
        expect(report.live.every((t) => t.trim() === ''), `${label}: the live region speaks on load`).toBe(true);
        // A current step only where the stage is drawn (and so the step navigation exists).
        expect(report.current, `${label}: aria-current`).toEqual(report.staged ? ['1=step'] : []);
        if (layout.options.javaScriptEnabled === false || layout.options.reducedMotion === 'reduce') expect(report.staged, `${label}: stacked`).toBe(false);
        if (layout.name === 'sticky, one column') {
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

/** The pre-Home first-load JavaScript of the home route: unique script tags, gzip level 6 (measured on main before any Home code). */
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

  test('@quality no statistics code in the page-load scripts; the planner island brings it on intent', async ({ page, request }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'once');
    for (const arm of ['a', 'b'] as const) {
      const html = await (await request.get(`/?variant=${arm}`)).text();
      for (const path of scriptTags(html)) {
        const body = await (await request.get(path)).text();
        for (const marker of STATS_MARKERS) expect(body.includes(marker), `group ${arm}: ${path} holds "${marker}"`).toBe(false);
      }
    }
    // The check is not vacuous: the island's own code, loaded on intent, has the markers.
    await page.addInitScript(() => {
      window.requestIdleCallback = () => 0;
      window.cancelIdleCallback = () => {};
    });
    const scripts = watchScripts(page);
    await page.goto('/?variant=a');
    await page.waitForLoadState('load');
    const first = new Set(scriptTags(await (await request.get('/?variant=a')).text()));
    scripts.start();
    const figure = page.locator('figure[data-figure="hero-planner"]');
    await figure.locator('h2').hover();
    await expect(page.locator('[data-island]', { has: figure })).toHaveAttribute('data-island', 'ready');
    const later = (await scripts.counted()).filter((p) => !first.has(p));
    let found = false;
    for (const path of later) {
      const body = await (await request.get(path)).text();
      if (STATS_MARKERS.some((m) => body.includes(m))) found = true;
    }
    measure('planner island scripts on intent', later);
    expect(found, 'the island code holds the statistics markers').toBe(true);
  });

  test('@quality JavaScript after 5 s idle, both groups, at phone and desktop sizes', async ({ browser, request }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'once');
    test.setTimeout(90_000);
    for (const size of [{ width: 375, height: 667 }, { width: 1440, height: 900 }]) {
      for (const arm of ['a', 'b'] as const) {
        const context = await browser.newContext({ viewport: size });
        const page = await context.newPage();
        const scripts = new Set<string>();
        page.on('request', (r) => {
          if (r.resourceType() === 'script') scripts.add(new URL(r.url()).pathname);
        });
        await page.goto(`/?variant=${arm}`);
        await page.waitForTimeout(5000);
        const first = new Set(scriptTags(await (await request.get(`/?variant=${arm}`)).text()));
        const later = [...scripts].filter((p) => !first.has(p)).sort();
        const total = await gzipOf(request, [...scripts]);
        measure(`JS at 5 s idle, group ${arm}, ${size.width}x${size.height}`, { scripts: scripts.size, gzipBytes: total, laterScripts: later.length, laterGzipBytes: await gzipOf(request, later) });
        expect(scripts.size).toBeGreaterThanOrEqual(first.size);
        await context.close();
      }
    }
  });

  test('@quality time to a measured chart at 4x CPU, 375x667: well inside the phone wait, with no drop', async ({ browser, request }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'CPU throttling is a Chromium protocol');
    test.setTimeout(120_000);
    /** The phone's wait for a measured chart (ScrollShell's CHART_WAIT_MS), which runs from when the chart starts to load. */
    const CHART_WAIT_MS = Number(/const CHART_WAIT_MS = (\d+);/.exec(readFileSync(join(ROOT, 'src/components/home/ScrollShell.tsx'), 'utf8'))![1]);
    for (const state of ['ab-many-looks', 'before-data', 'calibration']) {
      const url = `/kitchen-sink/home/scroll/${state}`;
      const first = new Set(scriptTags(await (await request.get(url)).text()));
      const times: { fcp: number; chartRequested: number; measured: number }[] = [];
      for (let run = 0; run < 3; run++) {
        const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await page.addInitScript(() => {
          const w = window as unknown as { __measuredAt: number | null };
          w.__measuredAt = null;
          const sel = '[data-scroll-canvas] [data-canvas-layer][data-active] [data-home-chart][data-measured]';
          new MutationObserver((_, o) => {
            if (w.__measuredAt === null && document.querySelector(sel)) {
              w.__measuredAt = performance.now();
              o.disconnect();
            }
          }).observe(document, { subtree: true, childList: true, attributes: true });
        });
        await page.goto(url);
        await expect.poll(() => page.evaluate(() => (window as unknown as { __measuredAt: number | null }).__measuredAt), { timeout: 20_000 }).not.toBeNull();
        const t = await page.evaluate((named) => {
          // The first script that is not a first-load one: the chart's code, asked for as the shell's module runs.
          const later = performance.getEntriesByType('resource').filter((e) => (e as PerformanceResourceTiming).initiatorType === 'script' && !named.includes(new URL(e.name).pathname));
          return {
            fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1,
            chartRequested: later.length ? Math.min(...later.map((e) => e.startTime)) : -1,
            measured: (window as unknown as { __measuredAt: number }).__measuredAt,
          };
        }, [...first]);
        times.push({ fcp: Math.round(t.fcp), chartRequested: Math.round(t.chartRequested), measured: Math.round(t.measured) });
        expect(t.chartRequested, `${state} run ${run}: the chart code was requested`).toBeGreaterThan(0);
        expect(await page.locator('[data-scroll-shell][data-chart-late]').count(), `${state} run ${run}: dropped to the stacked frames`).toBe(0);
        await context.close();
      }
      measure(`time to measured chart at 4x CPU, ${state} (ms from navigation)`, times);
      // The wait starts once the chart begins to load, which is no earlier than its code is requested:
      // the time from that request to the measured chart is an upper bound of what the wait sees.
      const worst = Math.max(...times.map((x) => x.measured - x.chartRequested));
      measure(`slowest chart request to measured, ${state} (ms; the wait is ${CHART_WAIT_MS})`, worst);
      expect(worst, `${state}: slowest of 3, from the chart request`).toBeLessThan(CHART_WAIT_MS);
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// The planner's preview before hydration, the lazy island, forced colours.

test.describe('Home quality: islands and forced colours', () => {
  test('@quality focus placed on the planner preview before hydration stays on that control, and the fold does not move', async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'once, in Chromium (phone emulation)');
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    // Hold every script until the preview has focus, so the focus lands before hydration for certain.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/_next/static/**/*.js', async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto('/?variant=a', { waitUntil: 'domcontentloaded' });
    const figure = page.locator('figure[data-figure="hero-planner"]');
    const slider = figure.getByRole('slider', { name: 'Baseline conversion' });
    await slider.focus();
    const before = await page.evaluate(() => {
      const box = (sel: string) => {
        const r = document.querySelector(sel)!.getBoundingClientRect();
        return { y: r.y, height: r.height };
      };
      return {
        hydrated: Object.keys(document.activeElement ?? {}).some((k) => k.startsWith('__react')),
        title: box('figure[data-figure="hero-planner"] h2'),
        readout: box('figure[data-figure="hero-planner"] [data-figure-lead] [data-planner-n]'),
      };
    });
    expect(before.hydrated, 'focused before hydration').toBe(false);
    release();
    await expect(page.locator('[data-island]', { has: figure })).toHaveAttribute('data-island', 'ready', { timeout: 20_000 });
    await expect(slider).toBeFocused();
    const after = await page.evaluate(() => {
      const box = (sel: string) => {
        const r = document.querySelector(sel)!.getBoundingClientRect();
        return { y: r.y, height: r.height };
      };
      return { title: box('figure[data-figure="hero-planner"] h2'), readout: box('figure[data-figure="hero-planner"] [data-figure-lead] [data-planner-n]') };
    });
    for (const key of ['title', 'readout'] as const) {
      expect(Math.abs(after[key].y - before[key].y), `${key} moved`).toBeLessThanOrEqual(TOLERANCE);
      expect(after[key].y + after[key].height, `${key} in the fold`).toBeLessThanOrEqual(812);
    }
    await context.close();
  });

  test('@quality the real page: the planner island stays idle until intent, in every engine, and the scripts it loads are recorded', async ({ page, request }) => {
    await page.addInitScript(() => {
      window.requestIdleCallback = () => 0;
      window.cancelIdleCallback = () => {};
    });
    const scripts = watchScripts(page);
    await page.goto('/?variant=b');
    await page.waitForLoadState('load');
    await page.waitForTimeout(500);
    scripts.start();
    const figure = page.locator('figure[data-figure="hero-planner"]');
    const island = page.locator('[data-island]', { has: figure });
    await expect(island).toHaveAttribute('data-island', 'idle');
    await page.waitForTimeout(800);
    const early = await scripts.counted();
    const first = new Set(scriptTags(await (await request.get('/?variant=b')).text()));
    measure('scripts before intent (not first-load)', early.filter((p) => !first.has(p)));
    await expect(island).toHaveAttribute('data-island', 'idle');
    await figure.locator('h2').hover();
    await expect(island).toHaveAttribute('data-island', 'ready');
    measure('scripts by intent', (await scripts.counted()).filter((p) => !first.has(p)));
  });

  test('@quality forced colours: the "your view" tick keeps a visible stroke', async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'forced-colours emulation is Chromium only');
    const read = async (forcedColors: 'active' | 'none') => {
      const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, forcedColors });
      const page = await context.newPage();
      await page.goto('/kitchen-sink/home/scroll/ab-tick');
      await settled(page);
      await expect(page.locator('[data-scroll-moment] [data-home-chart]:not([data-measured])')).toHaveCount(0, { timeout: 15_000 });
      // The host's state is seen from group B; a counted view of that group draws the tick.
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('experiment:counted', { detail: { arm: 'b', viewN: 1e9 } })));
      const line = page.locator('[data-scroll-canvas] [data-your-view] line');
      await expect(line).toHaveCount(1);
      const style = await line.evaluate((el) => {
        const s = getComputedStyle(el);
        const plot = el.closest('svg')!;
        let bg = 'rgba(0, 0, 0, 0)';
        for (let p: Element | null = plot; p && bg === 'rgba(0, 0, 0, 0)'; p = p.parentElement) bg = getComputedStyle(p).backgroundColor;
        return { stroke: s.stroke, width: s.strokeWidth, opacity: s.opacity, visibility: s.visibility, background: bg };
      });
      await context.close();
      return style;
    };
    const normal = await read('none');
    const forced = await read('active');
    measure('your-view tick stroke (normal, forced colours)', { normal, forced });
    expect(forced.stroke).not.toBe('none');
    expect(forced.stroke).not.toMatch(/rgba\(\d+, \d+, \d+, 0\)/);
    expect(forced.stroke, 'stroke differs from the background').not.toBe(forced.background);
    expect(parseFloat(forced.width)).toBeGreaterThan(0);
    expect(forced.opacity).not.toBe('0');
    expect(forced.visibility).toBe('visible');
  });
});

test.describe('Home quality: review corrections', () => {
  test('@quality the three outcomes stack in the narrow sticky step column and sit side by side in a wide one', async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'explicit layouts');
    const columns = async (options: BrowserContextOptions, size: { width: number; height: number }) => {
      const context = await browser.newContext({ viewport: size, ...options });
      const page = await context.newPage();
      await page.goto('/kitchen-sink/home/scroll/calibration');
      await settled(page);
      const xs = await page.locator('[data-decision-zone]').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().x)));
      await context.close();
      return new Set(xs).size;
    };
    // Sticky, two columns: the steps' column is too narrow for three cards.
    expect(await columns({}, { width: 1440, height: 900 })).toBe(1);
    // Stacked frames on a wide screen: the full text column holds three.
    expect(await columns({ reducedMotion: 'reduce' }, { width: 1440, height: 900 })).toBe(3);
    // A phone: one.
    expect(await columns({ reducedMotion: 'reduce' }, { width: 375, height: 667 })).toBe(1);
  });
});
