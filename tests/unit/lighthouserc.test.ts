import fs from 'node:fs';
import path from 'node:path';

// The Lighthouse CI gate: `npm run lhci` runs two collects against the production build, 5 runs
// each, and asserts on the median. The budgets are fixed.
// lighthouserc.json keeps Lighthouse's default simulated throttling and asserts the four category
// scores.
// lighthouserc.throttled.json asserts LCP with the same slow-4G network and 4x CPU profile applied
// for real (`throttlingMethod: devtools`). The LCP element of the home page is text that paints in
// the first frame. The simulation counts every async script that started before that paint as work
// the text waits for, so it reports about 2.1 s or 2.7 s where the applied profile paints the text
// at about 1.5 s on the development Mac: a simulated LCP measures the model, not this page.
// Lighthouse CI drops a run whose audit has no value (a trace that failed to record) and takes the
// median of the rest. The second matrix entry stops that: "pessimistic" fails when any run has no
// value, and its 60 s limit is never the binding one.
const read = (file: string) => JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../..', file), 'utf8'));
const simulated = read('lighthouserc.json');
const throttled = read('lighthouserc.throttled.json');
const scripts = read('package.json').scripts;

const collect = { startServerCommand: 'npx next start -p 3124', url: ['http://localhost:3124/'], numberOfRuns: 5 };

test('the simulated collect keeps the four category budgets on the median, with the default throttling', () => {
  expect(simulated).toEqual({
    ci: {
      collect,
      assert: {
        aggregationMethod: 'median',
        assertions: {
          'categories:performance': ['error', { minScore: 0.95 }],
          'categories:accessibility': ['error', { minScore: 0.95 }],
          'categories:best-practices': ['error', { minScore: 0.95 }],
          'categories:seo': ['error', { minScore: 0.95 }],
        },
      },
      upload: { target: 'filesystem', outputDir: 'reports/lhci' },
    },
  });
});

test('the throttled collect measures the same page 5 times with the profile applied for real', () => {
  // No `throttling` override: the default slow-4G network and 4x CPU profile, as in the simulation.
  expect(throttled.ci.collect).toEqual({
    ...collect,
    settings: { throttlingMethod: 'devtools', onlyCategories: ['performance'] },
  });
});

test('the throttled collect keeps the LCP budget on the median and fails on a run without a value', () => {
  expect(throttled.ci.assert).toEqual({
    assertMatrix: [
      {
        matchingUrlPattern: '.*',
        aggregationMethod: 'median',
        assertions: { 'largest-contentful-paint': ['error', { maxNumericValue: 2000 }] },
      },
      {
        matchingUrlPattern: '.*',
        aggregationMethod: 'pessimistic',
        assertions: { 'largest-contentful-paint': ['error', { maxNumericValue: 60000 }] },
      },
    ],
  });
});

test('npm run lhci runs both, and the throttled reports stay beside the manifest the build reads', () => {
  expect(scripts.lhci).toBe('lhci autorun && lhci autorun --config=lighthouserc.throttled.json');
  expect(Object.keys(throttled.ci).sort()).toEqual(['assert', 'collect', 'upload']);
  expect(throttled.ci.upload).toEqual({ target: 'filesystem', outputDir: 'reports/lhci/throttled' });
});
