import { expect } from '@playwright/test';
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
    await expectNoA11yViolations(page);
  });
});
