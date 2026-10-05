import fc from 'fast-check';
import {
  SAMPLE_SIZE_FORMULA,
  cohensH,
  detectableEffect,
  durationWeeks,
  sampleSizePerArm,
  type PlanInput,
} from '@/lib/stats/power';
import { ref } from './reference';

// Fixed seed: the property tests are deterministic in CI.
const FC = { seed: 20260101, numRuns: 300 } as const;

const TOL = 1e-9;

const plan = (over: Partial<PlanInput> = {}): PlanInput => ({
  baseline: 0.29,
  mde: 0.05,
  mdeType: 'absolute',
  alpha: 0.05,
  power: 0.8,
  ...over,
});

describe('cohensH', () => {
  it('is 2*asin(sqrt(p2)) - 2*asin(sqrt(p1))', () => {
    expect(cohensH(0.25, 0.25)).toBe(0);
    expect(cohensH(0, 1)).toBeCloseTo(Math.PI, 12);
    expect(cohensH(0.5, 0.5 + 0.1)).toBeCloseTo(
      2 * Math.asin(Math.sqrt(0.6)) - 2 * Math.asin(Math.sqrt(0.5)),
      15,
    );
  });

  it('is antisymmetric', () => {
    expect(cohensH(0.2, 0.35)).toBe(-cohensH(0.35, 0.2));
  });
});

describe('sampleSizePerArm', () => {
  it('matches every reference case exactly', () => {
    expect(ref.sampleSize.length).toBeGreaterThan(0);
    for (const c of ref.sampleSize) {
      const n = sampleSizePerArm({ ...c, mdeType: 'absolute' });
      expect(n, `baseline=${c.baseline} mde=${c.mde} alpha=${c.alpha} power=${c.power}`).toBe(c.n);
    }
  });

  it('does not tip over to n + 1 on the near-integer reference cases', () => {
    const find = (baseline: number, mde: number, alpha: number, power: number) =>
      ref.sampleSize.find(
        (c) => c.baseline === baseline && c.mde === mde && c.alpha === alpha && c.power === power,
      );
    for (const c of [find(0.35, 0.07, 0.05, 0.8), find(0.05, 0.005, 0.01, 0.8)]) {
      if (c === undefined) continue;
      expect(sampleSizePerArm({ ...c, mdeType: 'absolute' })).toBe(c.n);
    }
  });

  it('returns exactly 1353 for the win-back planner preset', () => {
    expect(sampleSizePerArm(plan())).toBe(1353);
  });

  it('treats a relative MDE of 0.1 on baseline 0.4 as an absolute 0.04', () => {
    expect(sampleSizePerArm(plan({ baseline: 0.4, mde: 0.1, mdeType: 'relative' }))).toBe(
      sampleSizePerArm(plan({ baseline: 0.4, mde: 0.04, mdeType: 'absolute' })),
    );
  });

  it('gives the same n for a +0.05 and a -0.05 effect from 0.5', () => {
    expect(sampleSizePerArm(plan({ baseline: 0.5, mde: -0.05 }))).toBe(
      sampleSizePerArm(plan({ baseline: 0.5, mde: 0.05 })),
    );
  });

  it('accepts a negative relative MDE above -1', () => {
    expect(sampleSizePerArm(plan({ baseline: 0.4, mde: -0.1, mdeType: 'relative' }))).toBeGreaterThan(
      0,
    );
  });

  it('returns an integer of at least 1', () => {
    const n = sampleSizePerArm(plan({ baseline: 0.5, mde: 0.49, power: 0.51 }));
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(1);
  });

  it('throws a RangeError naming the offending parameter', () => {
    expect(() => sampleSizePerArm(plan({ baseline: 0 }))).toThrow(/baseline/);
    expect(() => sampleSizePerArm(plan({ baseline: 1 }))).toThrow(RangeError);
    expect(() => sampleSizePerArm(plan({ baseline: Number.NaN }))).toThrow(/baseline/);
    expect(() => sampleSizePerArm(plan({ baseline: 0.98, mde: 0.05 }))).toThrow(/mde/);
    expect(() => sampleSizePerArm(plan({ baseline: 0.98, mde: 0.05 }))).toThrow(RangeError);
    expect(() => sampleSizePerArm(plan({ baseline: 0.3, mde: -0.4 }))).toThrow(/mde/);
    expect(() => sampleSizePerArm(plan({ baseline: 0.3, mde: -1, mdeType: 'relative' }))).toThrow(
      /mde/,
    );
    expect(() => sampleSizePerArm(plan({ baseline: 0.3, mde: -2, mdeType: 'relative' }))).toThrow(
      RangeError,
    );
    expect(() => sampleSizePerArm(plan({ baseline: 0.6, mde: 0.8, mdeType: 'relative' }))).toThrow(
      /mde/,
    );
    expect(() => sampleSizePerArm(plan({ mde: 0 }))).toThrow(/mde/);
    expect(() => sampleSizePerArm(plan({ mde: Number.NaN }))).toThrow(/mde/);
    expect(() => sampleSizePerArm(plan({ alpha: 0 }))).toThrow(/alpha/);
    expect(() => sampleSizePerArm(plan({ alpha: 1 }))).toThrow(RangeError);
    expect(() => sampleSizePerArm(plan({ power: 0.05 }))).toThrow(/power/);
    expect(() => sampleSizePerArm(plan({ power: 0.5, alpha: 0.5 }))).toThrow(/power/);
    expect(() => sampleSizePerArm(plan({ power: 1 }))).toThrow(RangeError);
    expect(() => sampleSizePerArm(plan({ mdeType: 'percent' as never }))).toThrow(/mdeType/);
    expect(() => sampleSizePerArm(plan({ mdeType: 'percent' as never }))).toThrow(RangeError);
  });

  it('exposes the formula string', () => {
    expect(SAMPLE_SIZE_FORMULA).toBe(
      'n per group = 2 · ((z₁₋α/₂ + z₁₋β) / h)², h = 2·asin√p₂ − 2·asin√p₁, rounded up',
    );
  });

  it('n is non-increasing as the absolute MDE grows (same baseline)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.05, max: 0.6, noNaN: true }),
        fc.double({ min: 0.005, max: 0.3, noNaN: true }),
        fc.double({ min: 0.005, max: 0.3, noNaN: true }),
        fc.double({ min: 0.5, max: 0.95, noNaN: true }),
        (baseline, a, b, power) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          fc.pre(baseline + hi < 0.99);
          const nLo = sampleSizePerArm(plan({ baseline, mde: lo, power }));
          const nHi = sampleSizePerArm(plan({ baseline, mde: hi, power }));
          return nHi <= nLo;
        },
      ),
      FC,
    );
  });

  it('n is non-decreasing as power grows', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.05, max: 0.9, noNaN: true }),
        fc.double({ min: 0.01, max: 0.09, noNaN: true }),
        fc.double({ min: 0.06, max: 0.99, noNaN: true }),
        fc.double({ min: 0.06, max: 0.99, noNaN: true }),
        (baseline, mde, a, b) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          const nLo = sampleSizePerArm(plan({ baseline, mde, power: lo }));
          const nHi = sampleSizePerArm(plan({ baseline, mde, power: hi }));
          return nHi >= nLo;
        },
      ),
      FC,
    );
  });
});

describe('detectableEffect', () => {
  it('matches every reference case within 1e-9', () => {
    expect(ref.detectableEffect.length).toBeGreaterThan(0);
    let worst = 0;
    for (const c of ref.detectableEffect) {
      const d = detectableEffect(c);
      const dev = Math.abs(d - c.mde);
      worst = Math.max(worst, dev);
      expect(dev, `n=${c.nPerArm} baseline=${c.baseline}`).toBeLessThanOrEqual(TOL);
    }
    expect(worst).toBeLessThanOrEqual(TOL);
  });

  it('returns Infinity when no rise up to 100% is detectable', () => {
    expect(detectableEffect({ nPerArm: 10, baseline: 0.9, alpha: 0.05, power: 0.8 })).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it('returns a finite value in (0, 0.5] for a small n at baseline 0.5', () => {
    const d = detectableEffect({ nPerArm: 10, baseline: 0.5, alpha: 0.05, power: 0.8 });
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThanOrEqual(0.5);
  });

  it('throws a RangeError naming the offending parameter', () => {
    const ok = { nPerArm: 1000, baseline: 0.3, alpha: 0.05, power: 0.8 };
    expect(() => detectableEffect({ ...ok, nPerArm: 0.5 })).toThrow(/nPerArm/);
    expect(() => detectableEffect({ ...ok, nPerArm: 0 })).toThrow(RangeError);
    expect(() => detectableEffect({ ...ok, nPerArm: Number.NaN })).toThrow(/nPerArm/);
    expect(() => detectableEffect({ ...ok, nPerArm: Infinity })).toThrow(/nPerArm/);
    expect(() => detectableEffect({ ...ok, baseline: 0 })).toThrow(/baseline/);
    expect(() => detectableEffect({ ...ok, baseline: 1 })).toThrow(RangeError);
    expect(() => detectableEffect({ ...ok, alpha: 0 })).toThrow(/alpha/);
    expect(() => detectableEffect({ ...ok, alpha: 1 })).toThrow(RangeError);
    expect(() => detectableEffect({ ...ok, power: 0.05 })).toThrow(/power/);
    expect(() => detectableEffect({ ...ok, power: 1 })).toThrow(RangeError);
  });

  it('never exceeds the planned MDE at the n that sampleSizePerArm returns', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.05, max: 0.6, noNaN: true }),
        fc.double({ min: 0.01, max: 0.3, noNaN: true }),
        fc.double({ min: 0.5, max: 0.95, noNaN: true }),
        (baseline, mde, power) => {
          const x = plan({ baseline, mde, power });
          const n = sampleSizePerArm(x);
          return (
            detectableEffect({ nPerArm: n, baseline, alpha: x.alpha, power: x.power }) <=
            mde + 1e-9
          );
        },
      ),
      FC,
    );
  });

  it('is non-increasing in n', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.02, max: 0.9, noNaN: true }),
        fc.integer({ min: 1, max: 100000 }),
        fc.integer({ min: 1, max: 100000 }),
        (baseline, a, b) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          const o = { baseline, alpha: 0.05, power: 0.8 };
          return detectableEffect({ ...o, nPerArm: hi }) <= detectableEffect({ ...o, nPerArm: lo });
        },
      ),
      FC,
    );
  });
});

describe('durationWeeks', () => {
  it('is ceil(2 * nPerArm / entryViewsPerDay / 7)', () => {
    expect(durationWeeks({ nPerArm: 1353, entryViewsPerDay: 20 })).toBe(20);
    expect(durationWeeks({ nPerArm: 70, entryViewsPerDay: 20 })).toBe(1);
    expect(durationWeeks({ nPerArm: 71, entryViewsPerDay: 20 })).toBe(2);
    expect(durationWeeks({ nPerArm: 1, entryViewsPerDay: 1000 })).toBe(1);
  });

  it('throws a RangeError naming the offending parameter', () => {
    expect(() => durationWeeks({ nPerArm: 0, entryViewsPerDay: 20 })).toThrow(/nPerArm/);
    expect(() => durationWeeks({ nPerArm: 100, entryViewsPerDay: 0 })).toThrow(/entryViewsPerDay/);
    expect(() => durationWeeks({ nPerArm: 100, entryViewsPerDay: -3 })).toThrow(RangeError);
    expect(() => durationWeeks({ nPerArm: 100, entryViewsPerDay: Infinity })).toThrow(
      /entryViewsPerDay/,
    );
    expect(() => durationWeeks({ nPerArm: 100, entryViewsPerDay: Number.NaN })).toThrow(
      RangeError,
    );
  });
});
