import { defineConfig, devices } from '@playwright/test';
import {
  E2E_EXCLUDE_TOKEN,
  E2E_FAKE_UPSTASH_PORT,
  E2E_FAKE_UPSTASH_URL,
  E2E_KV_READ_TOKEN,
  E2E_KV_WRITE_TOKEN,
  E2E_CONTACT_TO,
  E2E_RESEND_KEY,
  E2E_RESEND_URL,
  e2eClockOffsetMs,
} from './tests/e2e/constants';
import { updateSnapshotsMode } from './tests/e2e/snapshot-mode';

const PORT = 3123;

// The fake store's tokens, and one clock offset for both servers (computed once, in the main process
// that starts them), so the fake's expiries and the route's Berlin days agree.
const STORE_ENV = {
  KV_REST_API_TOKEN: E2E_KV_WRITE_TOKEN,
  KV_REST_API_READ_ONLY_TOKEN: E2E_KV_READ_TOKEN,
  EXPERIMENT_CLOCK_OFFSET_MS: String(e2eClockOffsetMs()),
  // The contact form sends to the fake Resend endpoint on the same loopback fake, with a throwaway key.
  RESEND_API_KEY: E2E_RESEND_KEY,
};

// Desktop Firefox exists only on demand (PLAYWRIGHT_FIREFOX=1), so the default and CI runs keep
// their projects. It runs every test except the visual baselines, like WebKit.
const FIREFOX_PROJECTS =
  process.env.PLAYWRIGHT_FIREFOX === '1'
    ? [
        {
          name: 'desktop-firefox',
          grepInvert: /@visual/,
          use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
        },
      ]
    : [];

export default defineConfig({
  testDir: 'tests/e2e',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Baselines are generated only in the CI container; a label on the PR regenerates them.
  updateSnapshots: updateSnapshotsMode(process.env),
  expect: {
    // In CI a capture gets 15 s instead of the default 5 s. A capture that differs from its baseline
    // needs two more equal shots (after 100 and 250 ms) before it is judged. Whole visual tests
    // averaged 0.12 to 0.26 s a capture on a hosted runner and up to 0.99 s on the self-hosted one,
    // and at a load average of 100 to 160 single captures ran out of the 5 s; three times the
    // default leaves that loop room. Locally the default stays.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001,
      animations: 'disabled',
      caret: 'hide',
      ...(process.env.CI ? { timeout: 15_000 } : {}),
    },
  },
  reporter: [['list'], ['json', { outputFile: 'reports/e2e.json' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // The local fake of the Upstash REST API, on 127.0.0.1 only.
      command: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/fake-upstash.ts --port ${E2E_FAKE_UPSTASH_PORT}`,
      url: `${E2E_FAKE_UPSTASH_URL}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: STORE_ENV,
    },
    {
      // The build reads the store too (the static pages), so it waits for the fake first.
      command: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/fake-upstash.ts --wait ${E2E_FAKE_UPSTASH_PORT} && npm run build && npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      // The build happens here, so this covers `npm run build` plus `next start`. 3 minutes locally;
      // 10 in CI, where the self-hosted runner's capped, shared Docker VM needed more than 3 while
      // other jobs ran (the same build took 24 s on an idle runner). A hung build still fails, and
      // well inside the job's own limit.
      timeout: process.env.CI ? 600_000 : 180_000,
      // The only build that includes the dev-only kitchen sink. The production build never does.
      // A throwaway owner token, so the exclusion flow can be exercised end to end. Writes go to the
      // loopback fake only (EXPERIMENT_FAKE_STORE outside production).
      env: {
        KITCHEN_SINK: '1',
        EXCLUDE_TOKEN: E2E_EXCLUDE_TOKEN,
        EXPERIMENT_FAKE_STORE: '1',
        // A secret inherited from the shell would make every counted visit "internal" (the fixture
        // sends x-internal whenever it is set), so the server never has one here.
        INTERNAL_TRAFFIC_SECRET: '',
        KV_REST_API_URL: E2E_FAKE_UPSTASH_URL,
        RESEND_API_URL: E2E_RESEND_URL,
        CONTACT_TO_EMAIL: E2E_CONTACT_TO,
        ...STORE_ENV,
      },
    },
  ],
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
    // 1280x720 at 125% zoom (screen-share): a 1024x576 viewport at a device scale factor of 1.25.
    {
      name: 'screenshare-chromium',
      grep: /@matrix/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 576 }, deviceScaleFactor: 1.25 },
    },
    {
      name: 'phone-390-chromium',
      grep: /@matrix/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'tablet-chromium',
      grep: /@matrix/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'laptop-chromium',
      grep: /@matrix/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } },
    },
    {
      name: 'desktop-webkit',
      grepInvert: /@visual/,
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
    ...FIREFOX_PROJECTS,
  ],
});
