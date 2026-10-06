import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as stats from '@/lib/stats';

const EXPECTED = [
  'SAMPLE_SIZE_FORMULA',
  'binomial',
  'cohensH',
  'detectableEffect',
  'durationWeeks',
  'mixtureCs',
  'mixtureRatio',
  'newcombeDiff',
  'normalCdf',
  'normalPdf',
  'normalQuantile',
  'obfBoundary',
  'obfConstant',
  'optimalTau2',
  'retrodesign',
  'sampleSizePerArm',
  'sfc32',
  'simulatePeeking',
  'srmTest',
  'wilson',
  'zTestTwoProportions',
];

describe('public API surface', () => {
  it('exposes exactly the documented runtime names', () => {
    expect(Object.keys(stats).sort()).toEqual(EXPECTED);
  });

  it('does not leak internals', () => {
    for (const name of ['checkAlpha', 'checkArm', 'OBF_CONSTANTS']) {
      expect(name in stats, name).toBe(false);
    }
  });
});

describe('source hygiene of src/lib/stats', () => {
  const dir = join(process.cwd(), 'src/lib/stats');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));

  it('scans the stats sources', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(files).toContain('index.ts');
  });

  it('has no Math.random and no node: imports', () => {
    for (const f of files) {
      const text = readFileSync(join(dir, f), 'utf8');
      expect(text, `${f} uses Math.random`).not.toMatch(/Math\s*\.\s*random/);
      expect(text, `${f} imports node:`).not.toMatch(/from\s+['"]node:/);
      expect(text, `${f} requires node:`).not.toMatch(/require\(\s*['"]node:/);
    }
  });

  it('imports only sibling modules (no ../ and no @/ paths)', () => {
    const importPath = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
    let seen = 0;
    for (const f of files) {
      const text = readFileSync(join(dir, f), 'utf8');
      for (const m of text.matchAll(importPath)) {
        const spec = m[1] as string;
        expect(spec, `${f} imports ${spec}`).toMatch(/^\.\/[\w.-]+$/);
        seen += 1;
      }
    }
    expect(seen).toBeGreaterThan(10);
  });
});

describe('every exported function is callable with a minimal valid input', () => {
  const counts = { xA: 50, nA: 100, xB: 60, nB: 100 };

  it('normal distribution', () => {
    expect(stats.normalCdf(0)).toBeCloseTo(0.5, 15);
    expect(stats.normalPdf(0)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 15);
    expect(stats.normalQuantile(0.975)).toBeCloseTo(1.959963984540054, 12);
  });

  it('rng', () => {
    const rng = stats.sfc32(1);
    expect(rng.uniform()).toBeGreaterThanOrEqual(0);
    expect(stats.binomial(rng, 10, 0.5)).toBeLessThanOrEqual(10);
  });

  it('proportions', () => {
    expect(stats.wilson(5, 10).estimate).toBe(0.5);
    expect(stats.newcombeDiff(counts).estimate).toBeCloseTo(0.1, 12);
    expect(stats.zTestTwoProportions(counts).z).toBeGreaterThan(0);
    expect(stats.srmTest(500, 500).flagged).toBe(false);
  });

  it('power planning', () => {
    expect(stats.cohensH(0.2, 0.3)).toBeGreaterThan(0);
    expect(
      stats.sampleSizePerArm({
        baseline: 0.29,
        mde: 0.05,
        mdeType: 'absolute',
        alpha: 0.05,
        power: 0.8,
      }),
    ).toBe(1353);
    expect(stats.detectableEffect({ nPerArm: 1353, baseline: 0.29, alpha: 0.05, power: 0.8 })).toBeLessThan(0.0501);
    expect(stats.durationWeeks({ nPerArm: 1353, entryViewsPerDay: 20 })).toBe(20);
    expect(stats.SAMPLE_SIZE_FORMULA).toContain('rounded up');
  });

  it('retrodesign', () => {
    expect(stats.retrodesign({ trueEffect: 0.03, se: 0.02 }).power).toBeGreaterThan(0.05);
  });

  it('sequential methods', () => {
    expect(stats.mixtureRatio(0.05)).toBeCloseTo(8.21197, 5);
    const tau2 = stats.optimalTau2({ baseline: 0.3, nCapPerArm: 1000 });
    expect(tau2).toBeGreaterThan(0);
    expect(stats.mixtureCs(counts, { tau2 }).halfWidth).toBeGreaterThan(0);
    expect(stats.obfConstant(1)).toBeCloseTo(1.959963984540054, 9);
    expect(stats.obfBoundary(1, 1)).toBe(stats.obfConstant(1));
  });

  it('peeking simulator', () => {
    const r = stats.simulatePeeking({
      seed: 1,
      runs: 10,
      looks: 2,
      nPerLook: 20,
      p: 0.3,
      method: 'naive',
    });
    expect(r.cumulativeByLook).toHaveLength(2);
  });
});

describe('public types', () => {
  it('are importable alongside the runtime names', () => {
    const counts: stats.Counts = { xA: 1, nA: 2, xB: 1, nB: 2 };
    const interval: stats.Interval = stats.newcombeDiff(counts);
    const rng: stats.Rng = stats.sfc32(1);
    const mde: stats.MdeType = 'relative';
    const plan: stats.PlanInput = { baseline: 0.3, mde: 0.1, mdeType: mde, alpha: 0.05, power: 0.8 };
    const method: stats.PeekMethod = 'cs';
    const peek: stats.PeekInput = { seed: 1, runs: 1, looks: 1, nPerLook: 1, p: 0.5, method };
    const result: stats.PeekResult = stats.simulatePeeking(peek);
    const rIn: stats.RetrodesignInput = { trueEffect: 1, se: 1 };
    const rOut: stats.RetrodesignResult = stats.retrodesign(rIn);
    expect([interval, rng, plan, result, rOut]).toHaveLength(5);
  });
});
