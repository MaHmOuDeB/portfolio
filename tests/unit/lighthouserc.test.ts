import fs from 'node:fs';
import path from 'node:path';

// The Lighthouse CI gate: `npm run lhci` runs one collect of 5 runs per URL against the production
// build and asserts on the median. It measures the home page in both groups (/?variant=a and
// /?variant=b; the proxy serves each group's static page and names it in x-arm).
// lighthouserc.fixture.json measures the Home page's composition in fixed states on the test build's
// host (KITCHEN_SINK=1): before data, collecting, and enough data in both groups, with the same
// budgets except SEO (those host pages are noindex by design).
// The slow-4G network and 4x CPU profile is applied for real (`throttlingMethod: devtools`), not
// simulated. On the same build and the same hosted runner, the simulation scored the home page
// from 0.78 to 0.99 and put its LCP between 1.5 s and 2.7 s, because it counts every async script
// that started before the first paint as work the hero text waits for; with the profile applied
// the score was 0.97 to 0.98 and the LCP 1.56 s to 1.58 s in every run.
// The performance score and LCP budgets (0.90 and 2500 ms, the "good" LCP threshold) leave room
// for the slower hosted instances. The other categories keep 0.95.
// Lighthouse CI drops a run whose audit has no value (a trace that failed to record) and takes the
// median of the rest. The second matrix entry stops that: "pessimistic" fails when any run has no
// LCP value, and its 60 s limit is never the binding one.
const read = (file: string) => JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../..', file), 'utf8'));
const config = read('lighthouserc.json');
const fixture = read('lighthouserc.fixture.json');
const scripts = read('package.json').scripts;

test('runs 5 times against the home page in each group with the throttling applied for real', () => {
  // No `throttling` override: the default slow-4G network and 4x CPU profile.
  expect(config).toEqual({
    ci: {
      collect: {
        startServerCommand: 'npx next start -p 3124',
        url: ['http://localhost:3124/?variant=a', 'http://localhost:3124/?variant=b'],
        numberOfRuns: 5,
        settings: { throttlingMethod: 'devtools' },
      },
      assert: config.ci.assert,
      upload: { target: 'filesystem', outputDir: 'reports/lhci' },
    },
  });
});

test('asserts the budgets on the median and fails on a run without an LCP value', () => {
  expect(config.ci.assert).toEqual({
    assertMatrix: [
      {
        matchingUrlPattern: '.*',
        aggregationMethod: 'median',
        assertions: {
          'categories:performance': ['error', { minScore: 0.9 }],
          'categories:accessibility': ['error', { minScore: 0.95 }],
          'categories:best-practices': ['error', { minScore: 0.95 }],
          'categories:seo': ['error', { minScore: 0.95 }],
          'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        },
      },
      {
        matchingUrlPattern: '.*',
        aggregationMethod: 'pessimistic',
        assertions: { 'largest-contentful-paint': ['error', { maxNumericValue: 60000 }] },
      },
    ],
  });
});

test('npm run lhci runs the one config, and its reports land where the build reads them', () => {
  expect(scripts.lhci).toBe('lhci autorun');
  expect(fs.existsSync(path.resolve(import.meta.dirname, '../../lighthouserc.throttled.json'))).toBe(false);
});

test('the fixture config: the test build host in four fixed states, the same budgets less SEO (noindex by design)', () => {
  const host = 'http://localhost:3124/kitchen-sink/home';
  expect(fixture.ci.collect).toEqual({
    startServerCommand: 'npx next start -p 3124',
    url: [`${host}/scroll/before-data`, `${host}/scroll/calibration`, `${host}/a/ab-many-looks`, `${host}/b/ab-many-looks`],
    numberOfRuns: 5,
    settings: { throttlingMethod: 'devtools' },
  });
  const [median, ...rest] = config.ci.assert.assertMatrix;
  const { 'categories:seo': seo, ...lessSeo } = median.assertions;
  expect(seo).toBeDefined();
  expect(fixture.ci.assert).toEqual({ assertMatrix: [{ ...median, assertions: lessSeo }, ...rest] });
  // Its reports never overwrite the home page's.
  expect(fixture.ci.upload).toEqual({ target: 'filesystem', outputDir: 'reports/lhci-fixture' });
});
