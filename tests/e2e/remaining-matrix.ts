import { expect } from '@playwright/test';
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { LIVE_ROUTES } from '../../src/lib/site';
import { waitForIslands } from './fixtures';

// The size matrix, the routes and the representative states shared by the quality spec of the pages
// other than Home (remaining-quality.spec.ts) and any capture of the same matrix. Home has its own
// quality spec (home-quality.spec.ts), so it is not listed here.

export type Size = {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor?: number;
  mobile?: boolean;
  note: string;
};

/** Phones, tablet, laptop, desktop, screen share (1280x720 at 125%), 320 px and 400% zoom. */
export const SIZES: readonly Size[] = [
  { name: '375', width: 375, height: 812, mobile: true, note: 'phone' },
  { name: '390', width: 390, height: 844, mobile: true, note: 'phone' },
  { name: '768', width: 768, height: 1024, note: 'tablet' },
  { name: '1024', width: 1024, height: 768, note: 'laptop' },
  { name: '1440', width: 1440, height: 900, note: 'desktop' },
  { name: '1280x720-125', width: 1024, height: 576, deviceScaleFactor: 1.25, note: 'screen share, 1280x720 at 125%' },
  { name: '320', width: 320, height: 568, note: '320 px reflow' },
  { name: '400pct', width: 320, height: 180, note: '1280x720 at 400%' },
];

export const sizeNamed = (name: string): Size => {
  const size = SIZES.find((s) => s.name === name);
  if (!size) throw new Error(`no size ${name}`);
  return size;
};

/** Every page a visitor can reach, except Home. */
export const ROUTES: readonly string[] = LIVE_ROUTES.filter((route) => route !== '/');

/** The case studies and build notes: each states its limits. */
export const CASE_ROUTES: readonly string[] = [
  '/work/audible',
  '/work/retention',
  '/work/pulse',
  '/work/docproof',
  '/work/marketingws',
  '/work/n8n',
  '/work/weather',
];

export type State = {
  /** A short name: the page, then the state. */
  id: string;
  /** The URL to open. */
  url: string;
  /** The route whose pinned inline links apply. */
  route: string;
  /** The sizes the state is checked and captured at. */
  sizes: readonly string[];
  /** Context options, such as JavaScript off. */
  options?: BrowserContextOptions;
  /** Print media instead of screen. */
  print?: boolean;
  /** The part of the page the state is about, for an element capture. */
  focus?: string;
  /** Skip waiting for the islands, and never load them on idle (a state that exists only before an island loads). */
  noIslandWait?: boolean;
  /** Brings the page into the state, then proves it is there. */
  enter?: (page: Page) => Promise<void>;
};

const framework = (page: Page) => page.locator('figure[data-figure="framework"]');
const pulse = (page: Page) => page.locator('figure[data-figure="pulse"]');

async function islandReady(page: Page, figureId: string) {
  const figure = page.locator(`figure[data-figure="${figureId}"]`);
  await figure.locator('h3').first().hover();
  await expect(page.locator('[data-island]', { has: figure })).toHaveAttribute('data-island', 'ready');
}

const decision = (text: string) => async (page: Page) => {
  await expect(framework(page).locator('[data-figure-result]')).toContainText(text);
};

const STATE_SIZES = ['375', '1440', '320'] as const;

/** Representative states beyond each page's default: decisions, empty, stream, error, print, photo. */
export const STATES: readonly State[] = [
  { id: 'audible-ship', url: '/work/audible?framework.lower=1&framework.upper=4&framework.guardrail=1', route: '/work/audible', sizes: STATE_SIZES, focus: 'figure[data-figure="framework"]', enter: decision('Ship: the main metric rose, guardrail intact.') },
  { id: 'audible-may-ship', url: '/work/audible?framework.lower=-1&framework.upper=3', route: '/work/audible', sizes: STATE_SIZES, focus: 'figure[data-figure="framework"]', enter: decision('May ship: neutral on the main metric, guardrail intact.') },
  { id: 'audible-hold', url: '/work/audible?framework.guardrail=3', route: '/work/audible', sizes: STATE_SIZES, focus: 'figure[data-figure="framework"]', enter: decision("Hold: the guardrail's upper end is past its limit.") },
  { id: 'audible-harm', url: '/work/audible?framework.lower=-5&framework.upper=-1', route: '/work/audible', sizes: STATE_SIZES, focus: 'figure[data-figure="framework"]', enter: decision('Stop: the main metric fell.') },
  {
    id: 'audible-error',
    url: '/kitchen-sink/audible/faults',
    route: '/kitchen-sink/audible/faults',
    sizes: STATE_SIZES,
    focus: 'figure[data-figure="framework"]',
    enter: async (page) => {
      await islandReady(page, 'framework');
      await page.locator('#framework-lower').focus();
      await page.keyboard.press('ArrowRight');
      await expect(framework(page)).toContainText('This chart could not load. The numbers are in the table below.');
    },
  },
  { id: 'audible-no-js', url: '/work/audible', route: '/work/audible', sizes: ['375'], options: { javaScriptEnabled: false }, focus: 'figure[data-figure="framework"]' },
  {
    id: 'pulse-empty',
    url: '/work/pulse',
    route: '/work/pulse',
    sizes: STATE_SIZES,
    focus: 'figure[data-figure="pulse"]',
    noIslandWait: true,
    enter: async (page) => {
      await expect(pulse(page)).toContainText('No events yet.');
    },
  },
  { id: 'pulse-no-js', url: '/work/pulse', route: '/work/pulse', sizes: ['375'], options: { javaScriptEnabled: false }, focus: 'figure[data-figure="pulse"]' },
  {
    id: 'pulse-stream',
    url: '/work/pulse',
    route: '/work/pulse',
    sizes: STATE_SIZES,
    focus: 'figure[data-figure="pulse"]',
    enter: async (page) => {
      await islandReady(page, 'pulse');
      await pulse(page).locator('label[data-segment]', { has: page.locator('#pulse-channel-email') }).click();
      await pulse(page).locator('label[data-segment]', { has: page.locator('#pulse-range-7d') }).click();
      await page.locator('#pulse-save').click();
      await expect.poll(() => pulse(page).locator('li[data-pulse-event]').count()).toBeGreaterThanOrEqual(3);
    },
  },
  {
    id: 'pulse-error',
    url: '/kitchen-sink/pulse/faults',
    route: '/kitchen-sink/pulse/faults',
    sizes: STATE_SIZES,
    focus: 'figure[data-figure="pulse"]',
    enter: async (page) => {
      await islandReady(page, 'pulse');
      await pulse(page).locator('label[data-segment]', { has: page.locator('#pulse-channel-email') }).click();
      await expect(pulse(page)).toContainText('This chart could not load. The numbers are in the table below.');
    },
  },
  { id: 'about-photo', url: '/about', route: '/about', sizes: ['375', '1440'], focus: 'main img' },
  { id: 'about-print', url: '/about', route: '/about', sizes: ['print-a4'], print: true },
  { id: 'cv-print', url: '/cv', route: '/cv', sizes: ['print-a4'], print: true },
  {
    id: 'contact-error',
    url: '/contact',
    route: '/contact',
    sizes: STATE_SIZES,
    focus: 'main form',
    enter: async (page) => {
      await page.getByRole('button', { name: 'Send message' }).click();
      await expect(page.locator('#contact-status')).toContainText('Message not sent');
    },
  },
  { id: 'contact-sent', url: '/contact?sent=1', route: '/contact', sizes: STATE_SIZES },
  { id: 'live-specimens', url: '/kitchen-sink/live', route: '/kitchen-sink/live', sizes: ['375', '1440'] },
  { id: 'live-page-states', url: '/kitchen-sink/live-page', route: '/kitchen-sink/live-page', sizes: ['375', '1440'] },
  { id: 'not-found', url: '/no-such-page', route: '/no-such-page', sizes: STATE_SIZES },
];

/** A4 at 96 dpi, for the print states. */
export const PRINT_A4: Size = { name: 'print-a4', width: 794, height: 1123, note: 'A4 print' };

export const sizeOrPrint = (name: string): Size => (name === PRINT_A4.name ? PRINT_A4 : sizeNamed(name));

/** The representative live specimens of /kitchen-sink/live (default and exceptional). */
export const LIVE_SPECIMENS: readonly string[] = [
  'live--before-data--low-data--fresh--default',
  'live--calibration--low-data--fresh--default',
  'live--ab--low-data--fresh--default',
  'live--ab--enough-data--fresh--default',
  'live--ab--enough-data--stale--default',
  'live--ab--enough-data--paused--default',
  'live--ab--enough-data--fresh--error',
  'live--ab--enough-data--fresh--no-js',
  'live--aa-failed--enough-data--fresh--default',
  'live--inconclusive--enough-data--fresh--default',
  'live--ship-b--enough-data--fresh--default',
  'live--stop-for-harm--enough-data--fresh--default',
  'live--srm-suppressed--enough-data--fresh--default',
];

/** The representative states of the Live test page's explanation (/kitchen-sink/live-page). */
export const LIVE_PAGE_STATES: readonly string[] = ['held-interval', 'calibration-ready-ab-start', 'aa-failed-restart'];

export async function settle(page: Page, { islands = true } = {}): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  if (islands) await waitForIslands(page);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/** Opens a URL at a size in a fresh context, checks the status and waits until the page is settled. */
export async function openAt(browser: Browser, url: string, size: Size, options: BrowserContextOptions = {}, islands = true): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.deviceScaleFactor,
    isMobile: size.mobile,
    hasTouch: size.mobile,
    ...options,
  });
  // Every animation and transition that starts from the first byte on, before any input.
  await context.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __motion: string[] }).__motion = seen;
    const name = (el: EventTarget | null) => {
      if (!(el instanceof Element)) return String(el);
      const id = el.id ? `#${el.id}` : '';
      const data = [...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}]`).slice(0, 2).join('');
      return `${el.tagName.toLowerCase()}${id}${data}`;
    };
    document.addEventListener('animationstart', (e) => seen.push(`animation ${e.animationName} on ${name(e.target)}`), true);
    document.addEventListener('transitionrun', (e) => seen.push(`transition ${e.propertyName} on ${name(e.target)}`), true);
  });
  if (!islands) {
    await context.addInitScript(() => {
      window.requestIdleCallback = () => 0;
      window.cancelIdleCallback = () => {};
    });
  }
  const page = await context.newPage();
  const response = await page.goto(url);
  expect(response?.status(), url).toBe(url === '/no-such-page' ? 404 : 200);
  await settle(page, { islands: islands && options.javaScriptEnabled !== false });
  return page;
}

export const slug = (url: string): string =>
  url === '/' ? 'home' : url.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '') || 'home';
