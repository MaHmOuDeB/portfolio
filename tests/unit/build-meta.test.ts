import { readFileSync } from 'node:fs';
import { buildMeta, gitCommit, readReport } from '../../scripts/build-meta.ts';

// The deploy writes the build metadata from the CI reports (npm run build:meta) and the site prints
// it in the Live test page's colophon. A missing, empty or malformed report, or an unreadable git
// HEAD, fails the step: the colophon never shows zeros or a made-up commit for a report that was not
// there. A legitimately clean report (zero axe violations) prints its zero.

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(`tests/fixtures/build-meta/${name}`, 'utf8'));
}

const base = {
  commit: '0123456789abcdef0123456789abcdef01234567',
  builtAt: '2026-10-05T12:00:00.000Z',
  vitestJson: fixture('vitest.json'),
  e2eJson: fixture('e2e.json'),
  lhciManifest: fixture('lhci-manifest.json'),
};

const annotation = (description: string) => [{ type: 'axe-violations', description }];
/** An e2e report with these tests (each a list of annotations) in one spec. */
const e2eWith = (...tests: { annotations: unknown[]; results?: unknown[] }[]) => ({
  stats: { expected: tests.length, unexpected: 0, flaky: 0, skipped: 0 },
  suites: [{ suites: [{ specs: [{ tests }] }] }],
});

describe('buildMeta', () => {
  it('passes the commit and build date through', () => {
    const meta = buildMeta(base);
    expect(meta.commit).toBe('0123456789abcdef0123456789abcdef01234567');
    expect(meta.builtAt).toBe('2026-10-05T12:00:00.000Z');
  });

  it('counts unit and e2e tests from the reports', () => {
    const meta = buildMeta(base);
    expect(meta.unitTests).toEqual({ passed: 12, total: 12 });
    expect(meta.e2eTests).toEqual({ passed: 4, total: 4 });
  });

  it('counts flaky and unexpected e2e results in the total, not the passed count', () => {
    const e2eJson = { ...e2eWith({ annotations: annotation('0') }), stats: { expected: 5, unexpected: 2, flaky: 1, skipped: 3 } };
    expect(buildMeta({ ...base, e2eJson }).e2eTests).toEqual({ passed: 5, total: 8 });
  });

  it('reads axe violations from test annotations, once per test', () => {
    // The e2e fixture is a real Playwright report whose axe annotations were edited to "2", "1", "0",
    // "0" (a real run has zeros) so that this assertion exercises summing.
    expect(buildMeta(base).axeViolations).toBe(3);
    const e2eJson = e2eWith(
      // test-level and per-result annotations mirror each other in real reports
      { annotations: annotation('2'), results: [{ annotations: annotation('2') }] },
      { annotations: [], results: [{ annotations: annotation('1') }] },
      { annotations: [{ type: 'other', description: '9' }], results: [{ annotations: [] }] },
    );
    expect(buildMeta({ ...base, e2eJson }).axeViolations).toBe(3);
  });

  it('prints a legitimately clean axe report as 0', () => {
    expect(buildMeta({ ...base, e2eJson: e2eWith({ annotations: annotation('0') }, { annotations: annotation('0') }) }).axeViolations).toBe(0);
  });

  it('takes Lighthouse scores as integers from the representative run', () => {
    const { lighthouse, lighthouseLabel } = buildMeta(base);
    expect(lighthouse).toEqual({ performance: 100, accessibility: 95, bestPractices: 93, seo: 99 });
    expect(lighthouseLabel).toBe('CI lab run (mobile, simulated throttling)');
  });

  // Replaces "returns null Lighthouse when the manifest is missing or has no representative run".
  it('throws when the Lighthouse manifest is missing or has no representative run', () => {
    expect(() => buildMeta({ ...base, lhciManifest: null })).toThrow(/Lighthouse/);
    const stale = (fixture('lhci-manifest.json') as { isRepresentativeRun: boolean }[]).map((run) => ({ ...run, isRepresentativeRun: false }));
    expect(() => buildMeta({ ...base, lhciManifest: stale })).toThrow(/Lighthouse/);
  });

  // Replaces "does not throw when every report is missing".
  it('throws when any report is missing', () => {
    expect(() => buildMeta({ ...base, vitestJson: null })).toThrow(/unit test report/);
    expect(() => buildMeta({ ...base, e2eJson: null })).toThrow(/e2e report/);
    expect(() => buildMeta({ ...base, lhciManifest: null })).toThrow(/Lighthouse/);
  });

  // Replaces "does not throw and returns zero counts for malformed reports (%j)".
  it.each([['x'], [[]], [{ suites: 'a' }], [{ stats: 'x', suites: [null, 1, 'a'] }]])('throws on a malformed report (%j)', (garbage) => {
    expect(() => buildMeta({ ...base, vitestJson: garbage })).toThrow(/unit test report/);
    expect(() => buildMeta({ ...base, e2eJson: garbage })).toThrow(/e2e report/);
    expect(() => buildMeta({ ...base, lhciManifest: garbage })).toThrow(/Lighthouse/);
  });

  it('throws on a unit test report with no tests or more passed than run', () => {
    expect(() => buildMeta({ ...base, vitestJson: { numPassedTests: 0, numTotalTests: 0 } })).toThrow(/unit test report/);
    expect(() => buildMeta({ ...base, vitestJson: { numPassedTests: 13, numTotalTests: 12 } })).toThrow(/unit test report/);
  });

  it('throws when the e2e report holds no axe annotation at all (no axe report)', () => {
    expect(() => buildMeta({ ...base, e2eJson: e2eWith({ annotations: [] }) })).toThrow(/axe/);
  });

  // Replaces "counts an axe annotation with description %j as 0": an annotation that is not a
  // whole number of violations makes the axe report malformed.
  it.each([['abc'], ['-1'], ['Infinity'], [''], ['1.5']])('throws on an axe annotation with description %j', (description) => {
    expect(() => buildMeta({ ...base, e2eJson: e2eWith({ annotations: annotation(description) }) })).toThrow(/axe/);
  });

  // Replaces "ignores negative axe counts next to valid ones".
  it('throws on a negative axe count next to valid ones', () => {
    const e2eJson = e2eWith({ annotations: annotation('-1') }, { annotations: annotation('2') });
    expect(() => buildMeta({ ...base, e2eJson })).toThrow(/axe/);
  });

  // Replaces "returns null Lighthouse when the representative run has no usable summary".
  it('throws when the representative run has no usable summary', () => {
    const run = (summary: unknown) => [{ isRepresentativeRun: true, summary }];
    const full = { performance: 1, accessibility: 1, 'best-practices': 1, seo: 1 };
    for (const summary of [undefined, { ...full, seo: undefined }, { ...full, seo: '1' }, { ...full, seo: 1.5 }, { ...full, seo: -0.1 }]) {
      expect(() => buildMeta({ ...base, lhciManifest: run(summary) })).toThrow(/Lighthouse/);
    }
    expect(buildMeta({ ...base, lhciManifest: run(full) }).lighthouse).toEqual({ performance: 100, accessibility: 100, bestPractices: 100, seo: 100 });
  });

  it('throws on a commit that is not a full SHA', () => {
    expect(() => buildMeta({ ...base, commit: 'unknown' })).toThrow(/commit/);
    expect(() => buildMeta({ ...base, commit: 'abc1234' })).toThrow(/commit/);
  });
});

describe('readReport', () => {
  it('parses a report', () => {
    expect(readReport('reports/vitest.json', () => '{"numTotalTests":1}')).toEqual({ numTotalTests: 1 });
  });

  it.each([
    ['missing', () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); }],
    ['empty', () => ''],
    ['blank', () => ' \n'],
    ['malformed', () => '{"numTotalTests":'],
  ])('throws on a %s report, naming its path', (_name, read) => {
    expect(() => readReport('reports/vitest.json', read)).toThrow(/reports\/vitest\.json/);
  });
});

describe('gitCommit', () => {
  it('returns HEAD', () => {
    expect(gitCommit(() => '0123456789abcdef0123456789abcdef01234567\n')).toBe('0123456789abcdef0123456789abcdef01234567');
  });

  it('throws on an unreadable HEAD instead of writing "unknown"', () => {
    expect(() => gitCommit(() => { throw new Error('not a git repository'); })).toThrow(/git HEAD/);
    expect(() => gitCommit(() => 'garbage\n')).toThrow(/git HEAD/);
  });
});
