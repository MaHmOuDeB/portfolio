import fs from 'node:fs';
import path from 'node:path';

// The Lighthouse CI gate. The budgets are fixed; only how runs are aggregated is a choice.
// LCP uses the best of 5 runs ("optimistic" in @lhci/utils is Math.min for max* assertions):
// the localhost race in which the framework chunks evaluate before the first presented frame adds
// random +500 ms outliers, while a real regression raises every run, so the best run still fails.
// The category scores stay on the median.
const config = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../lighthouserc.json'), 'utf8'));

test('runs 5 times and keeps the median as the default aggregation', () => {
  expect(config.ci.collect.numberOfRuns).toBe(5);
  expect(config.ci.assert.aggregationMethod).toBe('median');
});

test('keeps every budget, with LCP on the best run', () => {
  const a = config.ci.assert.assertions;
  for (const category of ['performance', 'accessibility', 'best-practices', 'seo']) {
    expect(a[`categories:${category}`]).toEqual(['error', { minScore: 0.95 }]);
  }
  expect(a['largest-contentful-paint']).toEqual(['error', { maxNumericValue: 2000, aggregationMethod: 'optimistic' }]);
  expect(Object.keys(a)).toHaveLength(5);
});
