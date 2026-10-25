import { defineConfig, devices } from '@playwright/test';
import { E2E_EXCLUDE_TOKEN } from './tests/e2e/constants';
import { updateSnapshotsMode } from './tests/e2e/snapshot-mode';

const PORT = 3123;

export default defineConfig({
  testDir: 'tests/e2e',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Baselines are generated only in the CI container; a label on the PR regenerates them.
  updateSnapshots: updateSnapshotsMode(process.env),
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' },
  },
  reporter: [['list'], ['json', { outputFile: 'reports/e2e.json' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    // The only build that includes the dev-only kitchen sink. The production build never does.
    // A throwaway owner token, so the exclusion flow can be exercised end to end.
    env: { KITCHEN_SINK: '1', EXCLUDE_TOKEN: E2E_EXCLUDE_TOKEN },
  },
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
  ],
});
