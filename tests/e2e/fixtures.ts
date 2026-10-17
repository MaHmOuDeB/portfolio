import { createHmac } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test as base } from '@playwright/test';
import type { Page } from '@playwright/test';

const INTERNAL_MESSAGE = 'portfolio-internal-traffic';

function internalHeaders(): Record<string, string> {
  const secret = process.env.INTERNAL_TRAFFIC_SECRET;
  if (!secret) return {};
  return { 'x-internal': createHmac('sha256', secret).update(INTERNAL_MESSAGE).digest('hex') };
}

// This fixture overrides extraHTTPHeaders wholesale, so a config-level use.extraHTTPHeaders would be clobbered.
export const test = base.extend({
  extraHTTPHeaders: internalHeaders(),
});

export async function expectNoA11yViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  // Recorded before asserting so scripts/build-meta.ts can sum it from the Playwright JSON report.
  test.info().annotations.push({ type: 'axe-violations', description: String(violations.length) });
  expect(
    violations,
    `axe violations: ${violations.map((violation) => violation.id).join(', ')}`,
  ).toEqual([]);
}

/**
 * Waits until every Figure island has left `data-island="idle"`. An island swaps its preview for
 * the interactive content when the page is idle (2 s at the latest), so a measurement or a shot
 * taken earlier sees the preview or the island depending on timing. The terminal values are
 * "ready" (swapped in) and "failed" (the preview came back in its no-JS form); a Figure that
 * fails on purpose in the sink ends in one of them too, so nothing waits forever. A page with no
 * island has nothing to wait for.
 */
export async function waitForIslands(page: Page): Promise<void> {
  await expect(page.locator('[data-island="idle"]')).toHaveCount(0, { timeout: 15_000 });
}
