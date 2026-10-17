import { expect } from '@playwright/test';
import { DATA_AMOUNTS, LIVE_PHASES, RUNTIMES, resolveFigureBody, type DataAmount, type Freshness, type FigureRuntime, type LivePhase } from '../../src/lib/figure/states';
import { expectNoA11yViolations, test } from './fixtures';

// /kitchen-sink/live: one live Figure per phase × amount of data × freshness × runtime, with
// fictional data. Each specimen's id names its axes: live--{phase}--{data}--{freshness}--{runtime}.

const FRESHNESS = ['fresh', 'stale', 'paused'] as const;
const TOTAL = LIVE_PHASES.length * DATA_AMOUNTS.length * FRESHNESS.length * RUNTIMES.length;

type Specimen = { id: string; body: string | null; text: string };

function axesOf(id: string) {
  const [, phase, data, fresh, runtime] = id.split('--') as [string, LivePhase, DataAmount, (typeof FRESHNESS)[number], FigureRuntime];
  const freshness: Freshness =
    fresh === 'fresh'
      ? { kind: 'fresh' }
      : fresh === 'stale'
        ? { kind: 'stale', updatedAt: '', renderedAt: '' }
        : { kind: 'paused', pausedOn: '', reason: '' };
  return { phase, data, fresh, runtime, freshness };
}

async function specimens(page: import('@playwright/test').Page): Promise<Specimen[]> {
  return page.locator('[data-specimen^="live--"]').evaluateAll((els) =>
    els.map((el) => ({
      id: el.getAttribute('data-specimen') ?? '',
      body: el.querySelector('figure[data-figure]')?.getAttribute('data-body') ?? null,
      text: (el.querySelector('figure[data-figure]')?.textContent ?? '').replace(/\s+/g, ' '),
    })),
  );
}

test.describe('live Figure states', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/kitchen-sink/live');
  });

  test(`has every combination once: ${TOTAL} specimens`, async ({ page }) => {
    const all = await specimens(page);
    expect(TOTAL).toBe(144);
    expect(all).toHaveLength(TOTAL);
    expect(new Set(all.map((s) => s.id)).size).toBe(TOTAL);
    for (const phase of LIVE_PHASES) {
      for (const data of DATA_AMOUNTS) {
        for (const fresh of FRESHNESS) {
          for (const runtime of RUNTIMES) {
            expect(all.map((s) => s.id)).toContain(`live--${phase}--${data}--${fresh}--${runtime}`);
          }
        }
      }
    }
  });

  test('each body follows the order of precedence of its axes', async ({ page }) => {
    const all = await specimens(page);
    expect(all).toHaveLength(TOTAL);
    for (const s of all) {
      const { phase, data, runtime, freshness } = axesOf(s.id);
      expect(s.body, s.id).toBe(resolveFigureBody({ runtime, live: { phase, data, freshness } }));
    }
  });

  test('paused, SRM failed, stale, error and the Simulated badge say so', async ({ page }) => {
    const all = await specimens(page);
    expect(all).toHaveLength(TOTAL);
    for (const s of all) {
      const { fresh, runtime, phase } = axesOf(s.id);
      if (fresh === 'paused' && runtime !== 'error') expect(s.text, s.id).toContain('Paused on');
      if (phase === 'srm-suppressed' && runtime !== 'error' && fresh !== 'paused') {
        expect(s.text, s.id).toContain('SRM failed');
        expect(s.text, s.id).not.toContain('now:');
      }
      if (fresh === 'stale') expect(s.text, s.id).toMatch(/Updated \d{2}\.\d{2}, \d{2}:\d{2}/);
      // Fictional data: the badge says Simulated, never Live from this site.
      expect(s.text, s.id).toContain('Simulated');
      expect(s.text, s.id).not.toContain('Live from this site');
      if (runtime === 'error') {
        expect(s.text, s.id).toContain('This chart could not load. The numbers for both groups are in the table below.');
      }
    }
  });

  test('a collecting state draws the hollow Now row, never empty axes', async ({ page }) => {
    const low = page.locator('[data-specimen="live--ab--low-data--fresh--default"]');
    await expect(low.locator('svg[data-chart-frame]')).toHaveCount(0);
    await expect(low.locator('[data-now-row="collecting"]')).toBeVisible();
    await expect(low.locator('progress')).toHaveAccessibleName('Progress: 12 of 50 in the smaller group');
    await expect(low).toContainText('Estimates appear at 50 views per group, as the pre-registration says.');
    const ab = page.locator('[data-specimen="live--ab--enough-data--fresh--default"]');
    await expect(ab.locator('svg[data-chart-frame]:visible')).toHaveCount(1);
    await expect(ab.locator('[data-now-row="interval"] p')).toHaveText('now: −12 to +31');
  });

  test('has an index of the phases that links to each one', async ({ page }) => {
    const index = page.getByRole('navigation', { name: 'Phases' });
    await expect(index.getByRole('link')).toHaveCount(LIVE_PHASES.length);
    for (const phase of LIVE_PHASES) {
      await expect(page.locator(`#live-${phase}`)).toHaveCount(1);
      await expect(index.locator(`a[href="#live-${phase}"]`)).toHaveCount(1);
    }
    for (const link of await index.getByRole('link').all()) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('has no horizontal scroll', async ({ page }) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('has no accessibility violations', async ({ page }) => {
    test.setTimeout(120_000);
    await expectNoA11yViolations(page);
  });
});
