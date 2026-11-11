import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations, test } from './fixtures';

// The Playwright web server builds with KITCHEN_SINK=1, so the dev-only routes exist here.

test.describe('kitchen sink', () => {
  test('renders its h1 and a section for every entry', async ({ page }) => {
    await page.goto('/kitchen-sink');
    await expect(page.locator('h1')).toHaveText('Kitchen sink');
    await expect(page).toHaveTitle(/Kitchen sink/);
    expect(await page.locator('main h2').count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('every specimen has a unique data-specimen and a labelled heading', async ({ page }) => {
    await page.goto('/kitchen-sink');
    const ids = await page.locator('[data-specimen]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-specimen')),
    );
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      const specimen = page.locator(`[data-specimen="${id}"]`);
      const labelledBy = await specimen.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      await expect(specimen.locator(`h3#${labelledBy}`)).toBeVisible();
    }
  });

  test('shows the first specimens: glyph, icons, links', async ({ page }) => {
    await page.goto('/kitchen-sink');
    for (const id of [
      'glyph--inline',
      'glyph--large',
      'glyph--hollow',
      'glyph--labelled',
      'icons--all',
      'links--button',
      'links--text',
    ]) {
      await expect(page.locator(`[data-specimen="${id}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-specimen="icons--all"] svg')).toHaveCount(6);
  });

  test('shows Stat with a derived value and a Fact in the one markup', async ({ page }) => {
    await page.goto('/kitchen-sink');
    const stat = page.locator('[data-specimen="stat--derived"] data');
    await expect(stat).toHaveAttribute('data-derived', 'simulated');
    await expect(stat).toHaveText('1,353');
    const fact = page.locator('[data-specimen="fact--inline"] data');
    await expect(fact).toHaveAttribute('data-fact', 'profile.n8n.automated_tests');
    await expect(fact).toHaveText('270+');
  });

  test('shows the static primitives: badges, callout, tables, test notes, labels, progress', async ({ page }) => {
    await page.goto('/kitchen-sink');
    const badges = page.locator('[data-specimen="badge--all"] span');
    await expect(badges).toHaveText(['Simulated', 'Public data', 'Live from this site']);
    await expect(page.locator('[data-specimen="callout--titled"]')).toBeVisible();

    // The folded table is drawn once: a details holding only its summary, then the table it shows.
    const folded = page.locator('[data-specimen="table--disclosure"]');
    await expect(folded.locator('table')).toHaveCount(1);
    await expect(folded.locator('table')).toBeHidden();
    const summary = folded.locator('details > summary');
    expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await summary.click();
    await expect(folded.locator('table')).toBeVisible();
    await expect(folded.getByRole('table')).toHaveAccessibleName('Views and conversions by group in a fictional run');
    // It opens directly under its summary.
    const toggle = (await summary.boundingBox())!;
    expect(Math.abs((await folded.getByRole('region').boundingBox())!.y - (toggle.y + toggle.height))).toBeLessThan(1);
    await summary.click();
    await expect(folded.locator('table')).toBeHidden();
    await expect(page.locator('[data-specimen="table--open"] table')).toBeVisible();
    await expect(page.locator('[data-specimen="table--open"] td[data-derived="simulated"]')).toHaveCount(12);

    await expect(page.locator('[data-specimen="testnote--ab-early"]')).toContainText('you are in group B');
    await expect(page.locator('[data-specimen="testnote--ab-early"]')).not.toContainText('views so far');
    await expect(page.locator('[data-specimen="testnote--ab-counted"]')).toContainText('There have been 212 views so far.');
    await expect(
      page.locator('[data-specimen="testnote--paused"]').getByRole('link', { name: 'See why the experiment is paused' }),
    ).toBeVisible();

    await expect(page.locator('[data-specimen="updated--labels"] time')).toHaveText([
      'Updated 14:05',
      'Updated 24.10, 23:30',
    ]);

    const bars = page.locator('[data-specimen="progress--states"] progress');
    await expect(bars).toHaveCount(4);
    await expect(page.getByRole('progressbar', { name: 'Progress: 0 of 50 in the smaller group' })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Progress: 12 of 50 in the smaller group' })).toBeVisible();
    // The last line is a calibrating test: its end is the earliest, not a planned one.
    await expect(page.getByRole('progressbar', { name: 'Progress: 30 of 50 in the smaller group' })).toBeVisible();
    await expect(page.locator('[data-specimen="progress--states"]')).toContainText('Earliest end: 15.11.');
  });

  test('says that its data is fictional', async ({ page }) => {
    await page.goto('/kitchen-sink');
    await expect(page.getByText('fictional', { exact: false }).first()).toBeVisible();
  });

  test('has no accessibility violations', async ({ page }) => {
    await page.goto('/kitchen-sink');
    await expect(page.locator('h1')).toHaveText('Kitchen sink');
    await expectNoA11yViolations(page);
  });

  test('the live states page renders its h1 and is not indexed', async ({ page }) => {
    await page.goto('/kitchen-sink/live');
    await expect(page.locator('h1')).toHaveText('Live Figure states');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    // Its accessibility check runs in live-states.spec.ts, with the time 144 Figures need.
  });
});

test.describe('kitchen sink controls', () => {
  // WebKit on macOS skips some controls on Tab (Safari's default); Alt+Tab reaches every one.
  const tabKey = (browserName: string) => (browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab');
  const demo = (page: Page) => page.locator('[data-specimen="controls--demo"]');
  const looks = (page: Page) => demo(page).getByRole('slider', { name: 'Looks' });
  const exact = (page: Page) => demo(page).getByRole('spinbutton', { name: 'Looks, exact value' });
  const fixRadio = (page: Page, name: string) => demo(page).getByRole('radio', { name });

  test('arrow keys, Home and End move the slider; the number input and spoken value follow', async ({ page }) => {
    await page.goto('/kitchen-sink');
    const range = looks(page);
    await expect(range).toHaveAttribute('aria-valuetext', '20 looks');
    await expect(demo(page).locator('[data-slider]')).toHaveAttribute('data-derived', 'simulated');
    await range.focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await expect(exact(page)).toHaveValue('23');
    await expect(range).toHaveAttribute('aria-valuetext', '23 looks');
    // The release is announced once the key is up, not while it is held.
    await expect(demo(page).locator('[data-released]')).toHaveText('Released at 23 looks');
    await page.keyboard.press('End');
    await expect(exact(page)).toHaveValue('50');
    await expect(range).toHaveAttribute('aria-valuetext', '50 looks');
    await page.keyboard.press('Home');
    await expect(exact(page)).toHaveValue('1');
    await expect(range).toHaveAttribute('aria-valuetext', '1 looks');
  });

  test('the number input clamps and snaps on blur, and an empty entry reverts', async ({ page, browserName }) => {
    await page.goto('/kitchen-sink');
    await exact(page).fill('999');
    await page.keyboard.press(tabKey(browserName));
    await expect(exact(page)).toHaveValue('50');
    await expect(looks(page)).toHaveValue('50');
    await expect(looks(page)).toHaveAttribute('aria-valuetext', '50 looks');
    await expect(demo(page).locator('[data-released]')).toHaveText('Released at 50 looks');

    await exact(page).fill('-7');
    await exact(page).blur();
    await expect(exact(page)).toHaveValue('1');

    await exact(page).fill('12.6');
    await exact(page).blur();
    await expect(exact(page)).toHaveValue('13');

    await exact(page).fill('');
    await exact(page).blur();
    await expect(exact(page)).toHaveValue('13');
  });

  test('dragging marks the figure with data-dragging until the pointer is up', async ({ page }) => {
    await page.goto('/kitchen-sink');
    const figure = demo(page).locator('[data-figure]');
    await looks(page).scrollIntoViewIfNeeded();
    const box = (await looks(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(figure).toHaveAttribute('data-dragging', '');
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(figure).not.toHaveAttribute('data-dragging');
    await expect(exact(page)).toHaveValue('50');
    await expect(demo(page).locator('[data-released]')).toHaveText('Released at 50 looks');
  });

  test('a keyboard-focused segment has a visible, unclipped ring and arrows move the choice', async ({
    page,
    browserName,
  }) => {
    await page.goto('/kitchen-sink');
    await exact(page).focus();
    await page.keyboard.press(tabKey(browserName));
    const none = fixRadio(page, 'None');
    await expect(none).toBeFocused();

    const ring = await demo(page)
      .locator('label', { has: page.getByRole('radio', { name: 'None' }) })
      .evaluate((label) => {
        label.scrollIntoView({ block: 'center' });
        const style = getComputedStyle(label);
        const reach = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
        const r = label.getBoundingClientRect();
        const clipped: string[] = [];
        for (let el = label.parentElement; el; el = el.parentElement) {
          const s = getComputedStyle(el);
          if ([s.overflow, s.overflowX, s.overflowY].some((v) => v === 'hidden' || v === 'clip')) {
            clipped.push(el.tagName);
          }
        }
        return {
          style: style.outlineStyle,
          width: style.outlineWidth,
          inside:
            r.left - reach >= 0 &&
            r.top - reach >= 0 &&
            r.right + reach <= document.documentElement.clientWidth &&
            r.bottom + reach <= window.innerHeight,
          clipped,
        };
      });
    expect(ring).toEqual({ style: 'solid', width: '2px', inside: true, clipped: [] });

    await page.keyboard.press('ArrowRight');
    await expect(fixRadio(page, "O'Brien-Fleming")).toBeChecked();
    await expect(fixRadio(page, "O'Brien-Fleming")).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(fixRadio(page, 'Confidence sequence')).toBeChecked();
    await page.keyboard.press('ArrowLeft');
    await expect(fixRadio(page, "O'Brien-Fleming")).toBeChecked();
  });

  test('segments stack at 375 px and sit in one row at 480 px, at least 44 px tall', async ({ page }) => {
    const tops = async () => {
      const labels = demo(page).locator('fieldset label');
      const boxes = await labels.evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { top: Math.round(r.top), left: Math.round(r.left), height: r.height };
        }),
      );
      expect(boxes).toHaveLength(3);
      for (const b of boxes) expect(b.height).toBeGreaterThanOrEqual(44);
      return boxes;
    };
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/kitchen-sink');
    const stacked = await tops();
    expect(new Set(stacked.map((b) => b.left)).size).toBe(1);
    expect(stacked[0]!.top).toBeLessThan(stacked[1]!.top);
    expect(stacked[1]!.top).toBeLessThan(stacked[2]!.top);

    await page.setViewportSize({ width: 480, height: 812 });
    const row = await tops();
    expect(new Set(row.map((b) => b.top)).size).toBe(1);
  });

  test('Reset restores 20 looks and None', async ({ page }) => {
    await page.goto('/kitchen-sink');
    await looks(page).focus();
    await page.keyboard.press('End');
    await demo(page).locator('label', { hasText: 'Confidence sequence' }).click();
    await expect(fixRadio(page, 'Confidence sequence')).toBeChecked();
    await expect(exact(page)).toHaveValue('50');
    await demo(page).getByRole('button', { name: 'Reset' }).click();
    await expect(exact(page)).toHaveValue('20');
    await expect(looks(page)).toHaveAttribute('aria-valuetext', '20 looks');
    await expect(fixRadio(page, 'None')).toBeChecked();
  });

  test('shows each control at its minimum, maximum, every segment and disabled', async ({ page }) => {
    await page.goto('/kitchen-sink');
    await expect(page.locator('[data-specimen="controls--slider-min"] input[type="range"]')).toHaveValue('1');
    await expect(page.locator('[data-specimen="controls--slider-max"] input[type="range"]')).toHaveValue('50');
    await expect(page.locator('[data-specimen="controls--slider-disabled"] input[type="range"]')).toBeDisabled();
    await expect(page.locator('[data-specimen="controls--segmented-each"] input:checked')).toHaveCount(3);
    const checked = await page
      .locator('[data-specimen="controls--segmented-each"] input:checked')
      .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
    expect(checked).toEqual(['none', 'obf', 'cs']);
    await expect(page.locator('[data-specimen="controls--segmented-disabled"] fieldset')).toHaveAttribute('disabled');
    for (const radio of await page.locator('[data-specimen="controls--segmented-disabled"] input').all()) {
      await expect(radio).toBeDisabled();
    }
  });

  test('controls are hidden without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/kitchen-sink');
    await expect(page.locator('[data-specimen="controls--demo"] [data-slider]')).toBeHidden();
    await expect(page.locator('[data-specimen="controls--demo"] fieldset')).toBeHidden();
    await expect(page.locator('[data-specimen="controls--demo"] button')).toBeHidden();
    await context.close();
  });
});

test.describe('kitchen sink step navigation', () => {
  const demo = (page: Page) => page.locator('[data-specimen="stepnav--demo"]');
  const previous = (page: Page) => demo(page).getByRole('button', { name: 'Previous' });
  const next = (page: Page) => demo(page).getByRole('button', { name: 'Next' });
  const outside = (page: Page) => demo(page).getByRole('button', { name: /from outside/ });
  const count = (page: Page) => demo(page).locator('[data-step-count]');
  const live = (page: Page) => demo(page).locator('[data-step-live]');
  const currentStep = (page: Page) => demo(page).locator('[aria-current="step"]');

  test('Next twice reads "3 of 5" and announces it once; an outside change announces nothing', async ({ page }) => {
    await page.goto('/kitchen-sink');
    await expect(count(page)).toHaveText('1 of 5');
    await expect(count(page)).toHaveAttribute('data-derived', 'simulated');
    await expect(live(page)).toHaveText('');
    await expect(live(page)).toHaveAttribute('aria-live', 'polite');
    await next(page).click();
    await next(page).click();
    await expect(count(page)).toHaveText('3 of 5');
    await expect(live(page)).toHaveText('3 of 5');
    await expect(currentStep(page)).toHaveCount(1);
    await expect(currentStep(page)).toHaveAttribute('data-step', '3');

    await outside(page).click();
    await expect(count(page)).toHaveText('4 of 5');
    await expect(live(page)).toHaveText('3 of 5');
    await expect(currentStep(page)).toHaveAttribute('data-step', '4');
  });

  test('arrows work with focus inside; at the end Next does nothing and keeps focus', async ({ page }) => {
    await page.goto('/kitchen-sink');
    await outside(page).click();
    await expect(count(page)).toHaveText('4 of 5');
    await next(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(count(page)).toHaveText('5 of 5');
    await expect(live(page)).toHaveText('5 of 5');
    await expect(next(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(next(page)).not.toHaveAttribute('disabled');

    // Playwright treats aria-disabled as not enabled; force the click a visitor can still make.
    // Focus is asserted after keys only: Safari does not focus a button on a mouse click.
    await next(page).click({ force: true });
    await expect(count(page)).toHaveText('5 of 5');
    await next(page).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await expect(count(page)).toHaveText('5 of 5');
    await expect(next(page)).toBeFocused();

    await page.keyboard.press('ArrowLeft');
    await expect(count(page)).toHaveText('4 of 5');
    await expect(live(page)).toHaveText('4 of 5');
    await expect(previous(page)).not.toHaveAttribute('aria-disabled');
    await expect(next(page)).toBeFocused();
  });

  test('Previous is aria-disabled on the first step, does nothing and keeps focus', async ({ page }) => {
    await page.goto('/kitchen-sink');
    await expect(previous(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(previous(page)).not.toHaveAttribute('disabled');
    await previous(page).click({ force: true });
    await previous(page).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowLeft');
    await expect(count(page)).toHaveText('1 of 5');
    await expect(live(page)).toHaveText('');
    await expect(previous(page)).toBeFocused();
  });

  test('Tab reaches Previous then Next, and both are at least 44 px tall', async ({ page, browserName }) => {
    await page.goto('/kitchen-sink');
    for (const button of [previous(page), next(page)]) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await previous(page).focus();
    // WebKit on macOS skips some controls on Tab (Safari's default); Alt+Tab reaches every one.
    await page.keyboard.press(browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab');
    await expect(next(page)).toBeFocused();
  });

  test('shows the first, middle, last and single-step states', async ({ page }) => {
    await page.goto('/kitchen-sink');
    const state = (id: string) => page.locator(`[data-specimen="stepnav--${id}"]`);
    await expect(state('first').locator('[data-step-count]')).toHaveText('1 of 5');
    await expect(state('first').getByRole('button', { name: 'Previous' })).toHaveAttribute('aria-disabled', 'true');
    await expect(state('middle').locator('[data-step-count]')).toHaveText('3 of 5');
    await expect(state('middle').locator('[aria-disabled]')).toHaveCount(0);
    await expect(state('last').locator('[data-step-count]')).toHaveText('5 of 5');
    await expect(state('last').getByRole('button', { name: 'Next' })).toHaveAttribute('aria-disabled', 'true');
    await expect(state('single').locator('[data-step-count]')).toHaveText('1 of 1');
    await expect(state('single').locator('[aria-disabled="true"]')).toHaveCount(2);
  });

  test('is hidden without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/kitchen-sink');
    await expect(page.locator('[data-specimen="stepnav--demo"] nav')).toBeHidden();
    await context.close();
  });
});

test.describe('kitchen sink slider steps', () => {
  // One step is 100 / 29 percent: the value at five points is 17.2413793103448, shown as "17.2".
  const specimen = (page: Page) => page.locator('[data-specimen="slider-steps--percent"]');
  const exact = (page: Page) => specimen(page).getByRole('spinbutton', { name: 'Rise to detect, percent of the baseline' });
  const range = (page: Page) => specimen(page).getByRole('slider', { name: 'Rise to detect' });
  const readout = (page: Page) => specimen(page).locator('[data-slider-readout]');
  const released = (page: Page) => specimen(page).locator('[data-released]');
  const open = async (page: Page) => {
    await page.goto('/kitchen-sink/slider-steps');
    await expect(specimen(page).locator('[data-ready]')).toHaveCount(1);
  };
  // The browser's own constraint state of the number input: the shown "17.2" is off the step grid.
  const stepMismatch = (page: Page) => exact(page).evaluate((el) => (el as HTMLInputElement).validity.stepMismatch);
  // The invalid state in Chromium's accessibility tree, the one a screen reader reads.
  const chromiumInvalid = async (page: Page) => {
    const cdp = await page.context().newCDPSession(page);
    const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as {
      nodes: { role?: { value?: string }; name?: { value?: string }; properties?: { name: string; value: { value?: unknown } }[] }[];
    };
    const node = nodes.find((n) => n.role?.value === 'spinbutton' && n.name?.value === 'Rise to detect, percent of the baseline');
    await cdp.detach();
    return node?.properties?.find((p) => p.name === 'invalid')?.value.value;
  };

  test('a formatted number is stated valid to assistive technology, though off the step grid', async ({ page, browserName }) => {
    await open(page);
    await expect(exact(page)).toHaveValue('17.2');
    expect(await stepMismatch(page)).toBe(true);
    await expect(exact(page)).toHaveAttribute('aria-invalid', 'false');
    if (browserName === 'chromium') await expect.poll(() => chromiumInvalid(page)).toBe('false');
    // While an entry is typed, the browser's own state stands: an off-grid entry is snapped on blur.
    await exact(page).fill('17.24');
    await expect(exact(page)).not.toHaveAttribute('aria-invalid');
    if (browserName === 'chromium') await expect.poll(() => chromiumInvalid(page)).toBe('true');
    await exact(page).blur();
    await expect(exact(page)).toHaveValue('17.2');
    await expect(exact(page)).toHaveAttribute('aria-invalid', 'false');
  });

  test('an arrow key that is part of an IME composition does not step', async ({ page }) => {
    await open(page);
    await exact(page).focus();
    // A dispatched event has no default action, so only the Slider's own handler could step here.
    await exact(page).evaluate((el) => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', isComposing: true, bubbles: true, cancelable: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp', isComposing: true, bubbles: true, cancelable: true }));
    });
    await exact(page).evaluate((el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })));
    // The uncomposed key steps (the probe that the handler is live), the composed one did not.
    await expect(readout(page)).toHaveText('20.7% of the baseline');
    await expect(released(page)).toHaveText('Not released yet.');
  });

  test('ArrowUp in the number input moves one whole point at once and shows the formatted value', async ({ page }) => {
    await open(page);
    await expect(exact(page)).toHaveValue('17.2');
    await expect(readout(page)).toHaveText('17.2% of the baseline');
    await exact(page).focus();
    await page.keyboard.down('ArrowUp');
    // Live while the key is down: no blur, no Enter.
    await expect(readout(page)).toHaveText('20.7% of the baseline');
    await expect(exact(page)).toHaveValue('20.7');
    await expect(range(page)).toHaveAttribute('aria-valuetext', '20.7% of the baseline');
    await expect(exact(page)).toBeFocused();
    await expect(released(page)).toHaveText('Not released yet.');
    // Releasing the key commits, as on the range input.
    await page.keyboard.up('ArrowUp');
    await expect(released(page)).toHaveText('Released at 20.7% of the baseline');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(readout(page)).toHaveText('13.8% of the baseline');
    await expect(exact(page)).toHaveValue('13.8');
    await expect(released(page)).toHaveText('Released at 13.8% of the baseline');
  });

  test('an arrow step whose key-up was lost is forgotten when focus leaves, so a later key-up commits the value', async ({ page }) => {
    await open(page);
    await exact(page).focus();
    // Hold ArrowUp in the number input: it steps to 20.7 and waits for the key-up to commit.
    await page.keyboard.down('ArrowUp');
    await expect(readout(page)).toHaveText('20.7% of the baseline');
    // Focus leaves by pointer while the key is held, so the key-up lands elsewhere.
    await page.locator('h1').click();
    await page.keyboard.up('ArrowUp');
    await expect(exact(page)).not.toBeFocused();
    await expect(released(page)).toHaveText('Not released yet.');
    // The range input moves the value on and commits it.
    await range(page).focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(readout(page)).toHaveText('13.8% of the baseline');
    await expect(released(page)).toHaveText('Released at 13.8% of the baseline');
    // A stray arrow key-up in the number input (its key-down not taken over) commits the value it
    // shows, never the step held before focus left.
    await exact(page).focus();
    await exact(page).evaluate(async (el) => {
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp', bubbles: true, cancelable: true }));
      // Let any commit it caused render before the check.
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
    await expect(released(page)).toHaveText('Released at 13.8% of the baseline');
    await expect(readout(page)).toHaveText('13.8% of the baseline');
  });

  test('a grid value typed with every digit a browser prints updates live, before blur', async ({ page }) => {
    await open(page);
    // min + 5 steps to full double precision: off snapToStep's own rounding in the last digits.
    await exact(page).fill('20.689655172413794');
    await expect(readout(page)).toHaveText('20.7% of the baseline');
    await expect(exact(page)).toBeFocused();
    await expect(released(page)).toHaveText('Not released yet.');
    await exact(page).blur();
    await expect(exact(page)).toHaveValue('20.7');
    await expect(released(page)).toHaveText('Released at 20.7% of the baseline');
  });
});
