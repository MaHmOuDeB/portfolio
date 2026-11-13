import { createHmac } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test as base } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clientAddress, startClientProxy, type ClientProxy } from './client-proxy';

const INTERNAL_MESSAGE = 'portfolio-internal-traffic';

function internalHeaders(): Record<string, string> {
  const secret = process.env.INTERNAL_TRAFFIC_SECRET;
  if (!secret) return {};
  return { 'x-internal': createHmac('sha256', secret).update(INTERNAL_MESSAGE).digest('hex') };
}

// Allocation is unique within one runner invocation and its fresh fake-store lifecycle.
let executionOrdinal = 0;
export const test = base.extend<{ clientIdentity: string; clientNetwork: ClientProxy | undefined }>({
  clientIdentity: async ({}, provide, testInfo) => {
    const ordinal = ++executionOrdinal;
    const address = clientAddress(testInfo.workerIndex, ordinal);
    testInfo.annotations.push({ type: 'client-address', description: JSON.stringify({
      address, workerIndex: testInfo.workerIndex, ordinal, testId: testInfo.testId,
      project: testInfo.project.name, repeatEachIndex: testInfo.repeatEachIndex, retry: testInfo.retry,
    }) });
    await provide(address);
  },
  clientNetwork: async ({ baseURL, browserName, clientIdentity }, provide) => {
    // WebKit sends unload beacons with the context headers. Its HTTP proxy path
    // can send absolute-form subresource requests directly to Next's listener.
    if (browserName === 'webkit') {
      await provide(undefined);
      return;
    }
    if (!baseURL) throw new Error('the client proxy requires baseURL');
    const network = await startClientProxy(baseURL, clientIdentity, internalHeaders());
    try { await provide(network); } finally { await network.close(); }
  },
  proxy: async ({ clientNetwork }, provide) => { await provide(clientNetwork && { server: clientNetwork.server }); },
  extraHTTPHeaders: async ({ clientIdentity }, provide) => {
    await provide({ ...internalHeaders(), 'x-forwarded-for': clientIdentity, 'x-real-ip': clientIdentity });
  },
});

export async function expectNoA11yViolations(page: Page): Promise<void> {
  // Only violations keep every node; options() replaces the options, so it comes before withTags().
  const { violations } = await new AxeBuilder({ page })
    .options({ resultTypes: ['violations'] })
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
 * Waits until React has hydrated `element`: its props are on the node, so the event system finds its
 * handlers (the same check as the node keys read in lab-peeking.spec.ts and home-scroll.spec.ts). A
 * server-rendered control is visible and focusable before that, and a click, key or typed value that
 * reaches it earlier is lost, so a test that acts on one right after `goto` waits for this, or for a
 * `data-ready` flag the page itself sets once hydrated.
 */
export async function waitForHydration(element: Locator): Promise<void> {
  await expect.poll(() => element.evaluate((el) => Object.keys(el).some((key) => key.startsWith('__reactProps')))).toBe(true);
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
