import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test } from './fixtures';

// The kit's form fields on the kitchen sink (built with KITCHEN_SINK=1): every state, the live
// counter, keyboard focus, axe and 320 px reflow.

const specimen = (page: Page, id: string) => page.locator(`[data-specimen="${id}"]`);
const counter = (page: Page, id: string) => specimen(page, id).locator('[data-counter]');
const css = (page: Page, selector: string, prop: string) =>
  page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
const token = (page: Page, name: string) =>
  page.evaluate((n) => {
    const probe = document.createElement('span');
    probe.style.color = `var(--color-${n})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, name);

const SPECIMENS = [
  'field--empty', 'field--hint', 'field--filled', 'field--error', 'field--error-filled', 'field--disabled', 'field--long-label', 'field--focus',
  'area--empty', 'area--error', 'area--disabled', 'counter--below', 'counter--last-tenth', 'counter--limit', 'counter--over',
  'select--empty', 'select--chosen', 'select--error', 'select--disabled', 'submit--default', 'submit--pending', 'submit--disabled',
];

test.describe('kit form fields', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/kitchen-sink');
  });

  test('every state has its specimen', async ({ page }) => {
    for (const id of SPECIMENS) await expect(specimen(page, id), id).toBeVisible();
  });

  test('labels name every control; an error is read before the control, with its prefix', async ({ page }) => {
    await expect(page.getByRole('textbox', { name: 'Name' }).first()).toBeVisible();
    const field = specimen(page, 'field--error-filled').getByRole('textbox', { name: 'E-mail address' });
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveAccessibleDescription('I reply to this address. Error: Enter a full e-mail address, with an @ and a domain');
    await expect(field).toHaveValue('ada at home');
    await expect(specimen(page, 'field--error').getByRole('textbox')).toHaveAccessibleDescription('Error: Enter your name');
    // The rule at the left of a field in error, in warn.
    const wrapper = specimen(page, 'field--error').locator('[data-field]');
    expect(await wrapper.evaluate((el) => getComputedStyle(el).borderLeftWidth)).toBe('2px');
    expect(await wrapper.evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe(await token(page, 'warn'));
    // A field without an error is not invalid and has no rule.
    await expect(specimen(page, 'field--filled').getByRole('textbox')).not.toHaveAttribute('aria-invalid', /.*/);
    expect(await specimen(page, 'field--filled').locator('[data-field]').evaluate((el) => getComputedStyle(el).borderLeftWidth)).toBe('0px');
  });

  test('the control box: muted border, ink on hover, 44 px, 18 px text, and the focus ring without a border change', async ({ page }) => {
    const input = '[data-specimen="field--focus"] input';
    expect(await css(page, input, 'border-top-color')).toBe(await token(page, 'muted'));
    expect(await css(page, input, 'font-size')).toBe('18px');
    expect((await page.locator(input).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await css(page, input, 'box-shadow')).toBe('none');
    // Tailwind's hover: applies only where the device can hover; a touch phone has no hover state.
    if (await page.evaluate(() => matchMedia('(hover: hover)').matches)) {
      await page.locator(input).hover();
      await expect.poll(() => css(page, input, 'border-top-color')).toBe(await token(page, 'ink'));
      await page.mouse.move(0, 0);
      await expect.poll(() => css(page, input, 'border-top-color')).toBe(await token(page, 'muted'));
    }
    await page.locator(input).focus();
    await expect(page.locator(input)).toBeFocused();
    expect(await css(page, input, 'outline-style')).toBe('solid');
    expect(await css(page, input, 'outline-width')).toBe('2px');
    // transition-colors covers outline-color, so the ring settles on the accent after a moment.
    await expect.poll(() => css(page, input, 'outline-color')).toBe(await token(page, 'accent'));
    expect(await css(page, input, 'border-top-color')).toBe(await token(page, 'muted'));
    expect(await css(page, input, 'box-shadow')).toBe('none');
  });

  test('disabled fields take the line border, and the keyboard skips them', async ({ page }) => {
    const disabled = specimen(page, 'field--disabled').getByRole('textbox');
    await expect(disabled).toBeDisabled();
    expect(await disabled.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(await token(page, 'line'));
    await specimen(page, 'field--error-filled').getByRole('textbox').focus();
    await page.keyboard.press('Tab');
    await expect(specimen(page, 'field--long-label').getByRole('textbox')).toBeFocused();
  });

  test('the counter follows the text: left, none, too many; the textarea turns warn over the limit', async ({ page }) => {
    await expect(counter(page, 'counter--below')).toHaveText('120 characters left');
    await expect(counter(page, 'counter--last-tenth')).toHaveText('10 characters left');
    await expect(counter(page, 'counter--limit')).toHaveText('No characters left');
    await expect(counter(page, 'counter--over')).toHaveText('12 characters too many');
    expect(await counter(page, 'counter--over').evaluate((el) => getComputedStyle(el).color)).toBe(await token(page, 'warn'));
    await expect(counter(page, 'counter--over').locator('svg')).toHaveCount(1);
    const over = specimen(page, 'counter--over').getByRole('textbox');
    await expect(over).toHaveAttribute('data-over-limit', '');
    expect(await over.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(await token(page, 'warn'));
    // Over the limit is not yet an error: that waits for a submit.
    await expect(over).not.toHaveAttribute('aria-invalid', /.*/);
    // Only the number is marked, with the caller's refs.
    const n = counter(page, 'counter--below').locator('data');
    await expect(n).toHaveAttribute('data-derived', 'simulated');
    await expect(n).toHaveAttribute('data-num', '');

    const empty = specimen(page, 'area--empty').getByRole('textbox');
    await expect(counter(page, 'area--empty')).toHaveText('200 characters left');
    await empty.fill('Hello');
    await expect(counter(page, 'area--empty')).toHaveText('195 characters left');
    // Deleting below the limit clears the warn border again.
    await over.fill('Short now');
    await expect(over).not.toHaveAttribute('data-over-limit', /.*/);
    await expect(counter(page, 'counter--over')).toHaveText('191 characters left');
    // The counter is the textarea's description, read on focus.
    await expect(empty).toHaveAccessibleDescription('195 characters left');
  });

  test('the counter is announced only in the last tenth, after typing stops', async ({ page }) => {
    const live = (id: string) => specimen(page, id).locator('[aria-live="polite"]');
    await specimen(page, 'counter--below').getByRole('textbox').press('End');
    await page.keyboard.type('ab');
    await page.waitForTimeout(1300);
    await expect(live('counter--below')).toHaveText('');
    await specimen(page, 'counter--last-tenth').getByRole('textbox').press('End');
    await page.keyboard.type('c');
    await expect(live('counter--last-tenth')).toHaveText('');
    await expect(live('counter--last-tenth')).toHaveText('9 characters left', { timeout: 3000 });
  });

  test('the select: "Choose one" first and muted, a chosen reason in ink, the chevron never takes a click', async ({ page }) => {
    const empty = specimen(page, 'select--empty').getByRole('combobox', { name: 'Why are you getting in touch?' });
    await expect(empty).toHaveValue('');
    expect(await empty.evaluate((el) => getComputedStyle(el).color)).toBe(await token(page, 'muted'));
    const chosen = specimen(page, 'select--chosen').getByRole('combobox');
    await expect(chosen).toHaveValue('project');
    expect(await chosen.evaluate((el) => getComputedStyle(el).color)).toBe(await token(page, 'ink'));
    await empty.selectOption('job');
    await expect.poll(() => empty.evaluate((el) => getComputedStyle(el).color)).toBe(await token(page, 'ink'));
    const chevron = specimen(page, 'select--empty').locator('span[aria-hidden="true"]').filter({ has: page.locator('svg') });
    expect(await chevron.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    expect(await chevron.evaluate((el) => getComputedStyle(el).color)).toBe(await token(page, 'muted'));
    await expect(specimen(page, 'select--disabled').getByRole('combobox')).toBeDisabled();
    await expect(specimen(page, 'select--error').getByRole('combobox')).toHaveAccessibleDescription('Error: Choose why you are getting in touch');
  });

  test('the submit button: hover changes the fill only; pending keeps the fill and the width and stays focusable', async ({ page }) => {
    const button = specimen(page, 'submit--default').getByRole('button', { name: 'Send message' });
    const pending = specimen(page, 'submit--pending').getByRole('button', { name: 'Sending…' });
    const ink = await token(page, 'ink');
    expect(await button.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(ink);
    expect(await pending.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(ink);
    await expect(pending).toHaveAttribute('aria-disabled', 'true');
    // aria-disabled, not disabled: it stays in the tab order and keeps its name for a screen reader.
    expect(await pending.evaluate((el: HTMLButtonElement) => el.disabled)).toBe(false);
    expect((await pending.boundingBox())!.width).toBeCloseTo((await button.boundingBox())!.width, 0);
    if (await page.evaluate(() => matchMedia('(hover: hover)').matches)) {
      // hover() scrolls the button into view, so the box is measured after scrolling.
      await button.scrollIntoViewIfNeeded();
      const box = (await button.boundingBox())!;
      await button.hover();
      await expect.poll(() => button.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await token(page, 'muted'));
      const after = (await button.boundingBox())!;
      expect([after.x, after.y, after.width, after.height]).toEqual([box.x, box.y, box.width, box.height]);
    }
    await pending.focus();
    await expect(pending).toBeFocused();
    const disabled = specimen(page, 'submit--disabled').getByRole('button');
    await expect(disabled).toBeDisabled();
    expect(await disabled.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await token(page, 'bg'));
    for (const b of [button, pending, disabled]) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test('axe finds no violations in the form fields', async ({ page }) => {
    await page.locator('[data-section="form-fields"]').scrollIntoViewIfNeeded();
    const { violations } = await new AxeBuilder({ page })
      .include('[data-section="form-fields"]')
      .options({ resultTypes: ['violations'] })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  test('at 320 px: no horizontal scroll, every control inside its column, the longest reason fits, the button on one line', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const section = page.locator('[data-section="form-fields"]');
    const width = (await section.boundingBox())!.width;
    for (const box of await section.locator('input, textarea, select, button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))) {
      expect(box.width).toBeLessThanOrEqual(width + 0.5);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    // The longest option's text fits inside the select beside the chevron.
    const fit = await specimen(page, 'select--chosen').getByRole('combobox').evaluate((select) => {
      const s = getComputedStyle(select);
      const probe = document.createElement('span');
      for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'fontFeatureSettings', 'fontVariationSettings', 'fontOpticalSizing'] as const) probe.style[p] = s[p];
      probe.style.whiteSpace = 'nowrap';
      probe.style.position = 'absolute';
      probe.textContent = 'Question about a project';
      select.parentElement!.append(probe);
      const text = probe.getBoundingClientRect().width;
      probe.remove();
      return { text, room: select.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight), client: select.clientWidth, pl: s.paddingLeft, pr: s.paddingRight, fontSize: s.fontSize };
    });
    expect(fit.text, JSON.stringify(fit)).toBeLessThanOrEqual(fit.room);
    // One line: the button is no taller than the 44 px target.
    expect((await specimen(page, 'submit--pending').getByRole('button').boundingBox())!.height).toBeLessThan(48);
  });
});

test.describe('kit form fields without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the counter says "Up to" the limit, from the server', async ({ page }) => {
    await page.goto('/kitchen-sink');
    await expect(counter(page, 'area--empty')).toHaveText('Up to 200 characters');
    await expect(counter(page, 'counter--over')).toHaveText('Up to 200 characters');
    await expect(specimen(page, 'counter--over').getByRole('textbox')).not.toHaveAttribute('data-over-limit', /.*/);
  });
});
