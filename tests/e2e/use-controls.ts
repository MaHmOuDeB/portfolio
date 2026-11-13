// Uses every control a visitor can use on a page's main content, the way a visitor would: each
// Figure's sliders (one key press each way), number inputs, option groups, selects and Previous/Next
// steps, then each Figure's Reset; every disclosure (a details summary) outside the Figures; and
// the text fields and selects of a form (typed into, never submitted). Shared by the privacy spec
// and the truth spec, so "every control used" means the same thing in both.
import type { Page } from '@playwright/test';
import { waitForIslands } from './fixtures';

export type Used = { figures: number; controlled: number; actions: number; resets: number };

/** Uses the controls, and returns how many Figures it found and how many actions it took. */
export async function useEveryControl(page: Page, o: { reset?: boolean } = {}): Promise<Used> {
  await waitForIslands(page);
  const used: Used = { figures: 0, controlled: 0, actions: 0, resets: 0 };
  const figures = page.locator('main figure[data-figure]');
  used.figures = await figures.count();
  // The Figures with a control this helper uses: a slider, number, option, select, step or Reset.
  used.controlled = await figures.evaluateAll(
    (fs) =>
      fs.filter(
        (f) =>
          f.querySelector('input[type="range"], input[type="number"], input[type="radio"], select') !== null ||
          [...f.querySelectorAll('button')].some((b) => ['Reset', 'Next', 'Previous'].includes(b.textContent?.trim() ?? '')),
      ).length,
  );
  for (let i = 0; i < used.figures; i++) {
    const f = figures.nth(i);
    const ranges = f.locator('input[type="range"]:enabled');
    for (let r = 0; r < (await ranges.count()); r++) {
      await ranges.nth(r).focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      used.actions++;
    }
    // Number inputs joined to a slider: the slider moved them already; a lone one is stepped.
    const numbers = f.locator('input[type="number"]:enabled:visible');
    for (let r = 0; r < (await numbers.count()); r++) {
      await numbers.nth(r).focus();
      await page.keyboard.press('ArrowUp');
      used.actions++;
    }
    const radios = f.locator('input[type="radio"]:enabled:not(:checked)');
    for (let r = 0; r < Math.min(await radios.count(), 4); r++) {
      const radio = f.locator('input[type="radio"]:enabled:not(:checked)').first();
      if ((await radio.count()) === 0) break;
      await radio.locator('xpath=ancestor::label[1]').click();
      used.actions++;
    }
    const selects = f.locator('select:enabled');
    for (let r = 0; r < (await selects.count()); r++) {
      const options = await selects.nth(r).locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
      if (options.length > 1) {
        await selects.nth(r).selectOption(options[options.length - 1]!);
        used.actions++;
      }
    }
    for (const name of ['Next', 'Previous']) {
      const step = f.getByRole('button', { name, exact: true });
      if ((await step.count()) > 0 && (await step.first().isEnabled())) {
        await step.first().click();
        used.actions++;
      }
    }
  }
  if (o.reset !== false) {
    for (let i = 0; i < used.figures; i++) {
      const reset = figures.nth(i).getByRole('button', { name: 'Reset' });
      if ((await reset.count()) > 0) {
        await reset.first().click();
        used.resets++;
      }
    }
  }
  // Disclosures outside the Figures, opened and left open.
  const summaries = page.locator('main details:not(figure details) > summary');
  for (let s = 0; s < (await summaries.count()); s++) {
    if (await summaries.nth(s).isVisible()) {
      await summaries.nth(s).click();
      used.actions++;
    }
  }
  // A form's fields, typed into but never sent.
  const fields = page.locator('main form input[type="text"]:enabled:visible, main form input[type="email"]:enabled:visible, main form textarea:enabled:visible');
  for (let t = 0; t < (await fields.count()); t++) {
    await fields.nth(t).fill('Test');
    used.actions++;
  }
  const formSelects = page.locator('main form select:enabled:visible');
  for (let t = 0; t < (await formSelects.count()); t++) {
    const options = await formSelects.nth(t).locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
    if (options.length > 0) {
      await formSelects.nth(t).selectOption(options[0]!);
      used.actions++;
    }
  }
  return used;
}
