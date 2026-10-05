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
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  // Recorded before asserting so scripts/build-meta.ts can sum it from the Playwright JSON report.
  test.info().annotations.push({ type: 'axe-violations', description: String(violations.length) });
  expect(
    violations,
    `axe violations: ${violations.map((violation) => violation.id).join(', ')}`,
  ).toEqual([]);
}
