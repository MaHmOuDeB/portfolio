import fs from 'node:fs';
import path from 'node:path';

// The Lighthouse CI gate: `npm run lhci` runs one collect of 5 runs against the production build
// and asserts on the median.
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
const scripts = read('package.json').scripts;

test('runs 5 times against the home page with the throttling applied for real', () => {
  // No `throttling` override: the default slow-4G network and 4x CPU profile.
  expect(config).toEqual({
    ci: {
      collect: {
        startServerCommand: 'npx next start -p 3124',
        url: ['http://localhost:3124/'],
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
