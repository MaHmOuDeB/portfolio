import { readFileSync } from 'node:fs';
import { buildMeta } from '../../scripts/build-meta.ts';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(`tests/fixtures/build-meta/${name}`, 'utf8'));
}

const base = {
  commit: 'abc1234',
  builtAt: '2026-10-05T12:00:00.000Z',
  vitestJson: fixture('vitest.json'),
  e2eJson: fixture('e2e.json'),
  lhciManifest: fixture('lhci-manifest.json'),
};

describe('buildMeta', () => {
  it('passes the commit and build date through', () => {
    const meta = buildMeta(base);
    expect(meta.commit).toBe('abc1234');
    expect(meta.builtAt).toBe('2026-10-05T12:00:00.000Z');
  });

  it('counts unit and e2e tests from the reports', () => {
    const meta = buildMeta(base);
    expect(meta.unitTests).toEqual({ passed: 12, total: 12 });
    expect(meta.e2eTests).toEqual({ passed: 4, total: 4 });
  });

  it('counts flaky and unexpected e2e results in the total, not the passed count', () => {
    const e2eJson = {
      stats: { expected: 5, unexpected: 2, flaky: 1, skipped: 3 },
      suites: [],
    };
    expect(buildMeta({ ...base, e2eJson }).e2eTests).toEqual({ passed: 5, total: 8 });
  });

  it('reads axe violations from test annotations, once per test', () => {
    // The e2e fixture is a real Playwright report whose axe annotations were edited to "2", "1", "0",
    // "0" (a real run has zeros) so that this assertion exercises summing.
    expect(buildMeta(base).axeViolations).toBe(3);
    const annotation = (description: string) => [{ type: 'axe-violations', description }];
    const e2eJson = {
      stats: { expected: 2, unexpected: 0, flaky: 0, skipped: 0 },
      suites: [
        {
          suites: [
            {
              specs: [
                {
                  tests: [
                    // test-level and per-result annotations mirror each other in real reports
                    { annotations: annotation('2'), results: [{ annotations: annotation('2') }] },
                    { annotations: [], results: [{ annotations: annotation('1') }] },
                    {
                      annotations: [{ type: 'other', description: '9' }],
                      results: [{ annotations: [] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(buildMeta({ ...base, e2eJson }).axeViolations).toBe(3);
  });

  it('takes Lighthouse scores as integers from the representative run', () => {
    const { lighthouse, lighthouseLabel } = buildMeta(base);
    expect(lighthouse).toEqual({ performance: 100, accessibility: 95, bestPractices: 93, seo: 99 });
    expect(lighthouseLabel).toBe('CI lab run (mobile, simulated throttling)');
  });

  it('returns null Lighthouse when the manifest is missing or has no representative run', () => {
    expect(buildMeta({ ...base, lhciManifest: null }).lighthouse).toBeNull();
    const stale = (fixture('lhci-manifest.json') as { isRepresentativeRun: boolean }[]).map(
      (run) => ({ ...run, isRepresentativeRun: false }),
    );
    expect(buildMeta({ ...base, lhciManifest: stale }).lighthouse).toBeNull();
  });

  it('does not throw when every report is missing', () => {
    const meta = buildMeta({ ...base, vitestJson: null, e2eJson: null, lhciManifest: null });
    expect(meta.unitTests).toEqual({ passed: 0, total: 0 });
    expect(meta.e2eTests).toEqual({ passed: 0, total: 0 });
    expect(meta.axeViolations).toBe(0);
    expect(meta.lighthouse).toBeNull();
  });

  it.each([['x'], [[]], [{ suites: 'a' }], [{ stats: 'x', suites: [null, 1, 'a'] }]])(
    'does not throw and returns zero counts for malformed reports (%j)',
    (garbage) => {
      const meta = buildMeta({
        ...base,
        vitestJson: garbage,
        e2eJson: garbage,
        lhciManifest: garbage,
      });
      expect(meta.unitTests).toEqual({ passed: 0, total: 0 });
      expect(meta.e2eTests).toEqual({ passed: 0, total: 0 });
      expect(meta.axeViolations).toBe(0);
      expect(meta.lighthouse).toBeNull();
    },
  );

  it.each([['abc'], ['-1'], ['Infinity'], ['']])(
    'counts an axe annotation with description %j as 0',
    (description) => {
      const e2eJson = {
        suites: [
          { specs: [{ tests: [{ annotations: [{ type: 'axe-violations', description }] }] }] },
        ],
      };
      expect(buildMeta({ ...base, e2eJson }).axeViolations).toBe(0);
    },
  );

  it('ignores negative axe counts next to valid ones', () => {
    const annotation = (description: string) => [{ type: 'axe-violations', description }];
    const e2eJson = {
      suites: [
        {
          specs: [
            { tests: [{ annotations: annotation('-1') }, { annotations: annotation('2') }] },
          ],
        },
      ],
    };
    expect(buildMeta({ ...base, e2eJson }).axeViolations).toBe(2);
  });

  it('returns null Lighthouse when the representative run has no usable summary', () => {
    const run = (summary: unknown) => [{ isRepresentativeRun: true, summary }];
    const full = { performance: 1, accessibility: 1, 'best-practices': 1, seo: 1 };
    expect(buildMeta({ ...base, lhciManifest: run(undefined) }).lighthouse).toBeNull();
    expect(buildMeta({ ...base, lhciManifest: run({ ...full, seo: undefined }) }).lighthouse).toBeNull();
    expect(buildMeta({ ...base, lhciManifest: run({ ...full, seo: '1' }) }).lighthouse).toBeNull();
    expect(buildMeta({ ...base, lhciManifest: run({ ...full, seo: 1.5 }) }).lighthouse).toBeNull();
    expect(buildMeta({ ...base, lhciManifest: run({ ...full, seo: -0.1 }) }).lighthouse).toBeNull();
    expect(buildMeta({ ...base, lhciManifest: run(full) }).lighthouse).toEqual({
      performance: 100,
      accessibility: 100,
      bestPractices: 100,
      seo: 100,
    });
  });
});
