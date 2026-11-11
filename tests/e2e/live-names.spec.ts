import { expect, type TestInfo } from '@playwright/test';
import { test } from './fixtures';

// Independent labels pin discoverability by state, rather than merely unique DOM ids.
const phases = {
  'before-data': 'Before data', calibration: 'Calibration', 'aa-failed': 'Calibration stopped',
  ab: 'A/B test', inconclusive: 'Inconclusive', 'ship-b': 'Ship B',
  'stop-for-harm': 'Stopped for harm', 'srm-suppressed': 'Split check failed',
};
const amounts = { 'low-data': 'Low data', 'enough-data': 'Enough data' };
const runtimes = { default: 'default', 'no-js': 'without JavaScript', error: 'chart could not load' };

// Steps are retained in traces; the attachment also records completed/failed action groups on
// passing runs, so cumulative work can be distinguished from an individual action wait.
type Measure = (label: string, action: () => Promise<void>) => Promise<void>;
async function withTimings(testInfo: TestInfo, run: (measure: Measure) => Promise<void>) {
  const started = performance.now();
  const actions: { label: string; elapsedMs: number; completed: boolean }[] = [];
  const measure: Measure = async (label, action) => {
    const before = performance.now();
    let completed = false;
    try {
      await test.step(label, action);
      completed = true;
    } finally {
      actions.push({ label, elapsedMs: performance.now() - before, completed });
    }
  };
  try {
    await run(measure);
  } finally {
    await testInfo.attach('live-name-timings', {
      body: JSON.stringify({ elapsedMs: performance.now() - started, actions }),
      contentType: 'application/json',
    });
  }
}

// Omitting any axis, reusing a shared Figure title, or passing a non-string Figure title breaks
// the names exposed by the real page and its fallback tables. Each independent phase owns all
// 18 combinations (2 amounts × 3 freshness states × 3 runtimes), with six disclosure clicks.
for (const [phase, phaseLabel] of Object.entries(phases)) {
  test(`live examples and their tables expose distinct complete state names: ${phase}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await withTimings(testInfo, async (measure) => {
      await measure('navigate', async () => { await page.goto('/kitchen-sink/live'); });
      const section = page.locator(`[data-section="live-${phase}"]`);
      await measure('phase specimen and figure counts', async () => {
        await expect(section.locator('[data-specimen^="live--"]')).toHaveCount(18);
        await expect(section.locator('figure[data-figure^="live--"]')).toHaveCount(18);
      });
      for (const [amount, amountLabel] of Object.entries(amounts)) {
        for (const freshness of ['fresh', 'stale', 'paused']) {
          for (const [runtime, runtimeLabel] of Object.entries(runtimes)) {
            const id = `live--${phase}--${amount}--${freshness}--${runtime}`;
            const context = `${phaseLabel}, ${amountLabel}, ${freshness}, ${runtimeLabel}`;
            const figureName = `The difference between the groups. ${context}`;
            const specimen = section.locator(`[data-specimen="${id}"]`);
            await measure(`${id}: specimen and figure names`, async () => {
              await expect(specimen).toHaveAccessibleName(context);
              await expect(specimen.getByRole('figure')).toHaveAccessibleName(figureName);
            });
            await measure(`${id}: all captions`, async () => {
              const captions = await specimen.locator('table caption').allTextContents();
              expect(captions.length, id).toBe(runtime === 'default' ? 2 : 1);
              for (const caption of captions) expect(caption, id).toBe(figureName);
            });
            if (runtime === 'default') {
              await measure(`${id}: open disclosure`, async () => {
                await specimen.locator('[data-js-only] details > summary').click();
              });
            }
            await measure(`${id}: table and region names/counts`, async () => {
              await expect(specimen.getByRole('table')).toHaveCount(1);
              await expect(specimen.getByRole('table')).toHaveAccessibleName(figureName);
              await expect(specimen.getByRole('region', { name: figureName, exact: true })).toHaveCount(1);
            });
          }
        }
      }
      await measure('phase aggregate table counts', async () => {
        await expect(section.locator('[data-specimen] table')).toHaveCount(24);
        await expect(section.getByRole('table')).toHaveCount(18);
      });
    });
  });
}

// Preserve the original whole-page assertions in one independent browser state: every default
// disclosure must be opened here too before checking all 144 accessible tables together.
test('live examples preserve aggregate specimen, figure and table counts', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await withTimings(testInfo, async (measure) => {
    await measure('navigate', async () => { await page.goto('/kitchen-sink/live'); });
    await measure('whole-page specimen and figure counts', async () => {
      await expect(page.locator('[data-specimen^="live--"]')).toHaveCount(144);
      await expect(page.locator('figure[data-figure^="live--"]')).toHaveCount(144);
    });
    for (const phase of Object.keys(phases)) {
      await measure(`${phase}: open six default disclosures`, async () => {
        for (const amount of Object.keys(amounts)) {
          for (const freshness of ['fresh', 'stale', 'paused']) {
            const id = `live--${phase}--${amount}--${freshness}--default`;
            await page.locator(`[data-specimen="${id}"] [data-js-only] details > summary`).click();
          }
        }
      });
    }
    await measure('whole-page aggregate table counts', async () => {
      await expect(page.locator('[data-specimen] table')).toHaveCount(192);
      await expect(page.getByRole('table')).toHaveCount(144);
    });
  });
});
