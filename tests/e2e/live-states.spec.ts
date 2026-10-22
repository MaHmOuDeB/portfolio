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

test.describe('live Figure states: what the words and numbers claim', () => {
  const spec = (page: import('@playwright/test').Page, id: string) => page.locator(`[data-specimen="${id}"]`);

  test.beforeEach(async ({ page }) => {
    await page.goto('/kitchen-sink/live');
  });

  test('the split-check examples really are unbalanced, and say which counts failed', async ({ page }) => {
    const srm = spec(page, 'live--srm-suppressed--enough-data--fresh--default');
    await expect(srm).toContainText('SRM failed');
    await expect(srm).toContainText('Views so far: 212 in A, 148 in B, where the design expects an even split.');
    // The calibration that stopped for the same reason shows the counts it stopped at.
    await expect(spec(page, 'live--aa-failed--enough-data--fresh--default')).toContainText('Views when it stopped: 212 in A, 148 in B.');
    // A balanced run says nothing of the kind.
    await expect(spec(page, 'live--ab--enough-data--fresh--default')).not.toContainText('SRM failed');
  });

  test('before data there are no views: zero of 50', async ({ page }) => {
    await expect(spec(page, 'live--before-data--low-data--fresh--default')).toContainText('Progress: 0 of 50 in the smaller group');
  });

  test('a decided test never says "so far" or "now:", and its chart keeps "B higher" and "B lower"', async ({ page }) => {
    for (const phase of ['inconclusive', 'ship-b', 'stop-for-harm']) {
      const s = spec(page, `live--${phase}--enough-data--fresh--default`);
      await expect(s, phase).not.toContainText('so far');
      // The Now row's label ("What I'll do now:" in the sentence is another thing).
      await expect(s.locator('[data-now-row] p'), phase).toHaveText(/^final: /);
      await expect(s.locator('svg[data-chart-frame]:visible text[data-side="above"]'), phase).toHaveText('B higher');
      await expect(s.locator('svg[data-chart-frame]:visible text[data-side="below"]'), phase).toHaveText('B lower');
    }
  });

  test('a running A/B test with enough data says when it started and that nothing is ruled out yet', async ({ page }) => {
    await expect(spec(page, 'live--ab--enough-data--fresh--default')).toContainText(
      'A/B started 15.09. The interval still includes zero, so no difference is ruled out yet.',
    );
  });

  test('under a pause the pause is said first and no verdict stands under it', async ({ page }) => {
    const s = spec(page, 'live--ship-b--enough-data--paused--default');
    await expect(s).toContainText('Paused on 14.10');
    await expect(s).not.toContainText('Ship B.');
    await expect(s).toContainText('last:');
    await expect(s.getByText('Paused', { exact: true })).toHaveCSS('color', 'rgb(176, 74, 0)');
  });

  test('the table agrees with the Now row, digit for digit', async ({ page }) => {
    const s = spec(page, 'live--ab--enough-data--fresh--no-js');
    const cells = await s.locator('tbody tr').last().locator('td').allTextContents();
    expect(cells).toEqual(['180', '176', '−12', '+9', '+31']);
    await expect(s.locator('[data-now-row="interval"] p')).toHaveText('now: −12 to +31');
  });

  test('the error state keeps the state in words and puts both groups in the table', async ({ page }) => {
    const s = spec(page, 'live--srm-suppressed--enough-data--fresh--error');
    await expect(s).toContainText('SRM failed');
    await expect(s).toContainText('212 in A, 148 in B');
    await expect(s.locator('thead th')).toHaveText(['Views in A', 'Views in B', 'Interval']);
    await expect(s.locator('tbody td')).toHaveText(['212', '148', 'Not shown']);
  });

  test('a collecting row spans its column: the progress bar is as wide as the figure, and has a visible edge', async ({ page }) => {
    const s = spec(page, 'live--ab--low-data--fresh--default');
    const widths = await s.evaluate((el) => ({
      progress: el.querySelector('progress')!.getBoundingClientRect().width,
      axis: el.querySelector('[data-now-row] svg')!.getBoundingClientRect().width,
    }));
    expect(widths.progress).toBeGreaterThan(300);
    expect(Math.abs(widths.progress - widths.axis)).toBeLessThan(1);
    await expect(s.locator('progress')).toHaveCSS('border-top-color', 'rgb(110, 110, 115)');
    // The zero tick, and "B lower" and "B higher", on the difference axis.
    await expect(s.locator('[data-now-zero]')).toHaveCount(1);
    await expect(s.locator('[data-now-row] svg text')).toHaveText(['0', 'B lower', 'B higher']);
  });
});
