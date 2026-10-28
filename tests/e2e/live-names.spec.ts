import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './fixtures';

// Independent labels pin discoverability by state, rather than merely unique DOM ids.
const phases = {
  'before-data': 'Before data', calibration: 'Calibration', 'aa-failed': 'Calibration stopped',
  ab: 'A/B test', inconclusive: 'Inconclusive', 'ship-b': 'Ship B',
  'stop-for-harm': 'Stopped for harm', 'srm-suppressed': 'Split check failed',
};
const amounts = { 'low-data': 'Low data', 'enough-data': 'Enough data' };
const runtimes = { default: 'default', 'no-js': 'without JavaScript', error: 'chart could not load' };

// Omitting any axis, reusing a shared Figure title, or passing a non-string Figure title breaks
// the names exposed by the real page and its fallback tables.
test('live examples and their tables expose distinct complete state names', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/kitchen-sink/live');
  const specimens = page.locator('[data-specimen^="live--"]');
  await expect(specimens).toHaveCount(144);
  await expect(page.locator('figure[data-figure^="live--"]')).toHaveCount(144);
  for (const [phase, phaseLabel] of Object.entries(phases)) {
    for (const [amount, amountLabel] of Object.entries(amounts)) {
      for (const freshness of ['fresh', 'stale', 'paused']) {
        for (const [runtime, runtimeLabel] of Object.entries(runtimes)) {
          const id = `live--${phase}--${amount}--${freshness}--${runtime}`;
          const context = `${phaseLabel}, ${amountLabel}, ${freshness}, ${runtimeLabel}`;
          const figureName = `The difference between the groups. ${context}`;
          const specimen = page.locator(`[data-specimen="${id}"]`);
          await expect(specimen).toHaveAccessibleName(context);
          await expect(specimen.getByRole('figure')).toHaveAccessibleName(figureName);
          const captions = await specimen.locator('table caption').allTextContents();
          expect(captions.length, id).toBe(runtime === 'default' ? 2 : 1);
          for (const caption of captions) expect(caption, id).toBe(figureName);
          if (runtime === 'default') {
            await specimen.locator('[data-js-only] details > summary').click();
          }
          await expect(specimen.getByRole('table')).toHaveCount(1);
          await expect(specimen.getByRole('table')).toHaveAccessibleName(figureName);
          await expect(specimen.getByRole('region', { name: figureName, exact: true })).toHaveCount(1);
        }
      }
    }
  }
  await expect(page.locator('[data-specimen] table')).toHaveCount(192);
  await expect(page.getByRole('table')).toHaveCount(144);
});

test('live examples have no axe violations with the Menu closed or open', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/kitchen-sink/live');
  const scan = () => new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  const scans = [{ state: 'closed', result: await scan() }];
  const menu = page.locator('[data-site-header] details');
  if (await menu.isVisible()) {
    await menu.locator('summary').click();
    await expect(menu).toHaveAttribute('open', '');
    scans.push({ state: 'open', result: await scan() });
  }
  await testInfo.attach('live-name-axe', { body: JSON.stringify(scans), contentType: 'application/json' });
  const failures = scans.flatMap(({ state, result }) => result.violations.map(({ id, nodes }) => ({
    state, id, targets: nodes.map(({ target }) => target),
  })));
  expect(failures).toEqual([]);
});
