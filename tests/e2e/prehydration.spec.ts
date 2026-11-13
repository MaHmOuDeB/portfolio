import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { isHydrated, test } from './fixtures';

// An entry a reader makes before the page has hydrated. The kit's controls are server-rendered and
// shown from the first paint (the inline script sets data-js before any chunk runs), so on a slow
// phone a reader can type in a Slider's number input, move its range input or pick a segment before
// React listens. React 19 hydrates an input without touching what it holds, so without the kit's
// handling the input kept the typed text ("999"), unclamped, while the value, the chart and the URL
// stayed on the old value.
//
// Each test holds every script chunk until the entry is made, which makes the race certain instead of
// a matter of timing, then releases them and checks that the entry landed everywhere: as a blur would
// have committed it, or, while the input still has focus, as an entry the next blur commits.

// WebKit on macOS skips some controls on Tab (Safari's default); Alt+Tab reaches every one.
const tabKey = (browserName: string) => (browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab');

/**
 * Holds every script chunk until the returned function is called. Call it before the navigation.
 * With `late`, a chunk first requested after that release (an island's lazy code, which is requested
 * only once the page has hydrated) is held again, until `releaseLate`; `held()` counts those.
 */
async function holdScripts(page: Page, { late = false } = {}) {
  let release!: () => void;
  let releaseLate!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const lateGate = new Promise<void>((resolve) => (releaseLate = resolve));
  let released = false;
  let held = 0;
  await page.route(/\/_next\/static\/chunks\/.*\.js(\?|$)/, async (route) => {
    if (!released) await gate;
    else if (late) {
      held++;
      await lateGate;
    }
    await route.continue();
  });
  return {
    release: () => {
      released = true;
      release();
    },
    releaseLate,
    held: () => held,
  };
}

/** Stops the idle trigger (every engine then takes the stubbed idle path), so only intent loads an island. */
async function withoutIdle(page: Page) {
  await page.addInitScript(() => {
    window.requestIdleCallback = () => 0;
    window.cancelIdleCallback = () => {};
  });
}

test.describe('an entry made before hydration, in place (kitchen sink controls)', () => {
  const demo = (page: Page) => page.locator('[data-specimen="controls--demo"]');
  const looks = (page: Page) => demo(page).getByRole('slider', { name: 'Looks' });
  const exact = (page: Page) => demo(page).getByRole('spinbutton', { name: 'Looks, exact value' });
  const released = (page: Page) => demo(page).locator('[data-released]');
  const segment = (page: Page, name: string) => demo(page).locator('label[data-segment]', { hasText: name });

  /** Opens the kitchen sink with its scripts held: the controls show, nothing listens. */
  async function openHeld(page: Page) {
    const { release } = await holdScripts(page);
    await page.goto('/kitchen-sink', { waitUntil: 'commit' });
    await expect(exact(page)).toBeVisible();
    return release;
  }

  /** Releases the scripts and waits until the demo has hydrated. */
  async function hydrate(page: Page, release: () => void) {
    expect(await isHydrated(exact(page))).toBe(false);
    release();
    await expect(demo(page).locator('[data-ready]')).toHaveCount(1, { timeout: 20_000 });
  }

  test('a number typed and left is clamped and committed once the page hydrates', async ({ page, browserName }) => {
    const release = await openHeld(page);
    await exact(page).fill('999');
    await page.keyboard.press(tabKey(browserName));
    await expect(exact(page)).not.toBeFocused();
    await hydrate(page, release);
    await expect(exact(page)).toHaveValue('50');
    await expect(looks(page)).toHaveValue('50');
    await expect(looks(page)).toHaveAttribute('aria-valuetext', '50 looks');
    await expect(released(page)).toHaveText('Released at 50 looks');
  });

  test('a number still being typed stays an entry, and the next blur commits it', async ({ page, browserName }) => {
    const release = await openHeld(page);
    await exact(page).fill('999');
    await hydrate(page, release);
    await expect(exact(page)).toBeFocused();
    await expect(exact(page)).toHaveValue('999');
    await expect(looks(page)).toHaveValue('20');
    await expect(released(page)).toHaveText('Not released yet.');
    await page.keyboard.press(tabKey(browserName));
    await expect(exact(page)).toHaveValue('50');
    await expect(looks(page)).toHaveValue('50');
    await expect(looks(page)).toHaveAttribute('aria-valuetext', '50 looks');
    await expect(released(page)).toHaveText('Released at 50 looks');
  });

  test('an emptied number input left before hydration reverts and commits nothing', async ({ page, browserName }) => {
    const release = await openHeld(page);
    await exact(page).fill('');
    await page.keyboard.press(tabKey(browserName));
    await hydrate(page, release);
    await expect(exact(page)).toHaveValue('20');
    await expect(looks(page)).toHaveValue('20');
    await expect(released(page)).toHaveText('Not released yet.');
  });

  test('a range moved before hydration moves the value, the number input and the spoken value', async ({ page }) => {
    const release = await openHeld(page);
    await looks(page).focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await expect(looks(page)).toHaveValue('23');
    await expect(exact(page)).toHaveValue('20');
    await hydrate(page, release);
    await expect(exact(page)).toHaveValue('23');
    await expect(looks(page)).toHaveValue('23');
    await expect(looks(page)).toHaveAttribute('aria-valuetext', '23 looks');
    await expect(released(page)).toHaveText('Released at 23 looks');
  });

  test('a number typed after a range move wins over the move', async ({ page, browserName }) => {
    const release = await openHeld(page);
    await looks(page).focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await exact(page).fill('35');
    await page.keyboard.press(tabKey(browserName));
    await hydrate(page, release);
    await expect(exact(page)).toHaveValue('35');
    await expect(looks(page)).toHaveValue('35');
    await expect(released(page)).toHaveText('Released at 35 looks');
  });

  test('a segment picked before hydration becomes the choice, drawn as chosen', async ({ page }) => {
    const release = await openHeld(page);
    await segment(page, "O'Brien-Fleming").click();
    await expect(demo(page).getByRole('radio', { name: "O'Brien-Fleming" })).toBeChecked();
    await hydrate(page, release);
    await expect(demo(page).getByRole('radio', { name: "O'Brien-Fleming" })).toBeChecked();
    await expect(segment(page, "O'Brien-Fleming")).toHaveClass(/\bbg-ink\b/);
    await expect(segment(page, 'None')).not.toHaveClass(/\bbg-ink\b/);
  });
});

test.describe('an entry made before hydration, in a preview the island replaces (/lab/peeking)', () => {
  const figure = (page: Page) => page.locator('figure[data-figure="peeking"]');
  const island = (page: Page) => page.locator('[data-island]', { has: figure(page) });
  const looks = (page: Page) => figure(page).getByRole('slider', { name: 'Looks' });
  const exact = (page: Page) => figure(page).getByRole('spinbutton', { name: 'Looks, exact value' });
  const live = (page: Page) => figure(page).locator('[data-figure-announcement]');
  const segment = (page: Page, name: string) => figure(page).locator('label[data-segment]', { hasText: name });
  const query = (page: Page) => new URL(page.url()).searchParams;

  // Idle loading is off in every test here, so only the intent the reader showed before hydration
  // (focus in the preview, or an entry in it) can load the island.
  async function openHeld(page: Page) {
    await withoutIdle(page);
    const { release } = await holdScripts(page);
    await page.goto('/lab/peeking', { waitUntil: 'commit' });
    await expect(exact(page)).toBeVisible();
    return release;
  }

  /** Releases the scripts and waits until the island has replaced the preview. */
  async function arrive(page: Page, release: () => void) {
    expect(await isHydrated(island(page))).toBe(false);
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    release();
    await expect(island(page)).toHaveAttribute('data-island', 'ready', { timeout: 20_000 });
  }

  test('a number typed and left reaches the island: value, range, spoken value, announcement and URL', async ({ page, browserName }) => {
    const release = await openHeld(page);
    await exact(page).fill('999');
    await page.keyboard.press(tabKey(browserName));
    await arrive(page, release);
    await expect(exact(page)).toHaveValue('50');
    await expect(looks(page)).toHaveValue('50');
    await expect(looks(page)).toHaveAttribute('aria-valuetext', '50 looks, 5,000 visitors per group by the last');
    await expect(live(page)).toContainText('by look 50');
    await expect.poll(() => query(page).get('peeking.looks')).toBe('50');
  });

  test('a number still being typed keeps focus and stays an entry in the island until it is left', async ({ page, browserName }) => {
    const release = await openHeld(page);
    await exact(page).fill('999');
    await arrive(page, release);
    await expect(exact(page)).toBeFocused();
    await expect(exact(page)).toHaveValue('999');
    await expect(looks(page)).toHaveValue('20');
    expect(query(page).get('peeking.looks')).toBeNull();
    await page.keyboard.press(tabKey(browserName));
    await expect(exact(page)).toHaveValue('50');
    await expect(looks(page)).toHaveAttribute('aria-valuetext', '50 looks, 5,000 visitors per group by the last');
    await expect(live(page)).toContainText('by look 50');
    await expect.poll(() => query(page).get('peeking.looks')).toBe('50');
  });

  test('focus moved into the preview before hydration loads the island and stays on the same control', async ({ page }) => {
    const release = await openHeld(page);
    await exact(page).focus();
    await arrive(page, release);
    await expect(exact(page)).toBeFocused();
    await expect(exact(page)).toHaveValue('20');
    expect(query(page).get('peeking.looks')).toBeNull();
  });

  test('text still being typed while the island loads is kept, and focus lands on it in the island', async ({ page, browserName }) => {
    await withoutIdle(page);
    const scripts = await holdScripts(page, { late: true });
    await page.goto('/lab/peeking', { waitUntil: 'commit' });
    await expect(exact(page)).toBeVisible();
    await exact(page).fill('9');
    expect(await isHydrated(island(page))).toBe(false);
    scripts.release();
    // The preview hydrates and asks for the island's code, which is held.
    await expect.poll(() => isHydrated(exact(page)), { timeout: 20_000 }).toBe(true);
    await expect.poll(() => scripts.held(), { timeout: 20_000 }).toBeGreaterThan(0);
    await expect(island(page)).toHaveAttribute('data-island', 'idle');
    await page.keyboard.type('9');
    await expect(exact(page)).toHaveValue('99');
    scripts.releaseLate();
    await expect(island(page)).toHaveAttribute('data-island', 'ready', { timeout: 20_000 });
    await expect(exact(page)).toBeFocused();
    await expect(exact(page)).toHaveValue('99');
    await expect(looks(page)).toHaveValue('20');
    await page.keyboard.press(tabKey(browserName));
    await expect(exact(page)).toHaveValue('50');
    await expect(looks(page)).toHaveAttribute('aria-valuetext', '50 looks, 5,000 visitors per group by the last');
    await expect.poll(() => query(page).get('peeking.looks')).toBe('50');
  });

  test('a segment picked in the preview becomes the island choice and its URL key', async ({ page }) => {
    const release = await openHeld(page);
    await segment(page, "O'Brien-Fleming").click();
    await arrive(page, release);
    await expect(figure(page).getByRole('radio', { name: "O'Brien-Fleming" })).toBeChecked();
    await expect(segment(page, "O'Brien-Fleming")).toHaveClass(/\bbg-ink\b/);
    await expect(segment(page, 'None')).not.toHaveClass(/\bbg-ink\b/);
    await expect.poll(() => query(page).get('peeking.fix')).toBe('obf');
  });
});
