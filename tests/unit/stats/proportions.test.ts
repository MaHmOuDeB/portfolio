import fc from 'fast-check';
import {
  newcombeDiff,
  srmTest,
  wilson,
  zTestTwoProportions,
  type Counts,
} from '@/lib/stats/proportions';
import { ref } from './reference';

// Fixed seed: the property tests are deterministic in CI.
const FC = { seed: 20260101, numRuns: 300 } as const;

const TOL = 1e-9;

describe('wilson', () => {
  it('matches every reference case within 1e-9', () => {
    expect(ref.wilson.length).toBeGreaterThan(0);
    for (const c of ref.wilson) {
      const r = wilson(c.x, c.n, c.alpha);
      const label = `x=${c.x} n=${c.n} alpha=${c.alpha}`;
      expect(Math.abs(r.estimate - c.x / c.n), label).toBeLessThanOrEqual(TOL);
      expect(Math.abs(r.lower - c.lower), `lower ${label}`).toBeLessThanOrEqual(TOL);
      expect(Math.abs(r.upper - c.upper), `upper ${label}`).toBeLessThanOrEqual(TOL);
    }
  });

  it('defaults alpha to 0.05', () => {
    expect(wilson(30, 100)).toEqual(wilson(30, 100, 0.05));
  });

  it('clamps the bounds exactly at x = 0 and x = n', () => {
    expect(wilson(0, 100).lower).toBe(0);
    expect(wilson(100, 100).upper).toBe(1);
    for (const n of [1, 7, 1000, 1e7]) {
      expect(wilson(0, n).lower).toBe(0);
      expect(wilson(n, n).upper).toBe(1);
    }
  });

  it('throws a RangeError naming the offending parameter', () => {
    expect(() => wilson(1, 0)).toThrow(RangeError);
    expect(() => wilson(1, 0)).toThrow(/\bn\b/);
    expect(() => wilson(1, 2.5)).toThrow(/\bn\b/);
    expect(() => wilson(1, -3)).toThrow(RangeError);
    expect(() => wilson(1, Number.NaN)).toThrow(RangeError);
    expect(() => wilson(5, 3)).toThrow(RangeError);
    expect(() => wilson(5, 3)).toThrow(/\bx\b/);
    expect(() => wilson(-1, 3)).toThrow(/\bx\b/);
    expect(() => wilson(1.5, 3)).toThrow(/\bx\b/);
    expect(() => wilson(1, 3, 0)).toThrow(/alpha/);
    expect(() => wilson(1, 3, 1)).toThrow(/alpha/);
    expect(() => wilson(1, 3, Number.NaN)).toThrow(RangeError);
  });

  it('has bounds in [0, 1] with lower <= x/n <= upper for all 0 <= x <= n <= 1e6', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e6 }).chain((n) => fc.tuple(fc.integer({ min: 0, max: n }), fc.constant(n))),
        ([x, n]) => {
          const r = wilson(x, n);
          return r.lower >= 0 && r.upper <= 1 && r.lower <= x / n && x / n <= r.upper;
        },
      ),
      FC,
    );
  });

  it('is finite and ordered for very large n', () => {
    const r = wilson(5e6, 1e7);
    expect(r.lower).toBeLessThan(r.estimate);
    expect(r.upper).toBeGreaterThan(r.estimate);
    expect(Number.isFinite(r.lower) && Number.isFinite(r.upper)).toBe(true);
  });
});

describe('newcombeDiff', () => {
  it('matches every reference case within 1e-9', () => {
    expect(ref.newcombe.length).toBeGreaterThan(0);
    for (const c of ref.newcombe) {
      const r = newcombeDiff({ xA: c.xA, nA: c.nA, xB: c.xB, nB: c.nB }, c.alpha);
      const label = JSON.stringify(c);
      expect(Math.abs(r.estimate - (c.xB / c.nB - c.xA / c.nA)), label).toBeLessThanOrEqual(TOL);
      expect(Math.abs(r.lower - c.lower), `lower ${label}`).toBeLessThanOrEqual(TOL);
      expect(Math.abs(r.upper - c.upper), `upper ${label}`).toBeLessThanOrEqual(TOL);
    }
  });

  it('defaults alpha to 0.05', () => {
    const c: Counts = { xA: 290, nA: 1000, xB: 340, nB: 1000 };
    expect(newcombeDiff(c)).toEqual(newcombeDiff(c, 0.05));
  });

  it('validates each arm and alpha', () => {
    expect(() => newcombeDiff({ xA: 1, nA: 0, xB: 1, nB: 10 })).toThrow(RangeError);
    expect(() => newcombeDiff({ xA: 1, nA: 10, xB: 11, nB: 10 })).toThrow(RangeError);
    expect(() => newcombeDiff({ xA: 1, nA: 10, xB: 1, nB: 10 }, 1)).toThrow(/alpha/);
  });

  it('contains its estimate (property)', () => {
    const arm = fc
      .integer({ min: 1, max: 1e6 })
      .chain((n) => fc.tuple(fc.integer({ min: 0, max: n }), fc.constant(n)));
    fc.assert(
      fc.property(arm, arm, ([xA, nA], [xB, nB]) => {
        const r = newcombeDiff({ xA, nA, xB, nB });
        return r.lower <= r.estimate && r.estimate <= r.upper;
      }),
      FC,
    );
  });

  it('is monotone in alpha: a larger alpha gives a narrower interval (property)', () => {
    const arm = fc
      .integer({ min: 1, max: 1e5 })
      .chain((n) => fc.tuple(fc.integer({ min: 0, max: n }), fc.constant(n)));
    fc.assert(
      fc.property(
        arm,
        arm,
        fc.double({ min: 0.001, max: 0.5, noNaN: true }),
        fc.double({ min: 0.001, max: 0.4, noNaN: true }),
        ([xA, nA], [xB, nB], a, extra) => {
          const small = newcombeDiff({ xA, nA, xB, nB }, a);
          const large = newcombeDiff({ xA, nA, xB, nB }, a + extra);
          const eps = 1e-12;
          return large.lower >= small.lower - eps && large.upper <= small.upper + eps;
        },
      ),
      FC,
    );
  });

  it('is finite and ordered for nA = nB = 1e7', () => {
    const r = newcombeDiff({ xA: 2.9e6, nA: 1e7, xB: 2.91e6, nB: 1e7 });
    for (const v of [r.estimate, r.lower, r.upper]) expect(Number.isFinite(v)).toBe(true);
    expect(r.lower).toBeLessThan(r.estimate);
    expect(r.estimate).toBeLessThan(r.upper);
    expect(r.estimate).toBeCloseTo(0.001, 12);
  });

  it('is defined for whole-arm-zero and whole-arm-full counts', () => {
    const cases: Counts[] = [
      { xA: 0, nA: 100, xB: 0, nB: 100 },
      { xA: 100, nA: 100, xB: 100, nB: 100 },
      { xA: 0, nA: 100, xB: 100, nB: 100 },
      { xA: 100, nA: 100, xB: 0, nB: 100 },
    ];
    for (const c of cases) {
      const r = newcombeDiff(c);
      for (const v of [r.estimate, r.lower, r.upper]) expect(Number.isFinite(v)).toBe(true);
      expect(r.lower).toBeLessThanOrEqual(r.estimate);
      expect(r.estimate).toBeLessThanOrEqual(r.upper);
      expect(r.lower).toBeGreaterThanOrEqual(-1);
      expect(r.upper).toBeLessThanOrEqual(1);
    }
  });

  it('negates the estimate and mirrors the bounds when the arms are swapped', () => {
    const c: Counts = { xA: 290, nA: 1000, xB: 345, nB: 1200 };
    const swapped: Counts = { xA: c.xB, nA: c.nB, xB: c.xA, nB: c.nA };
    const r = newcombeDiff(c);
    const s = newcombeDiff(swapped);
    expect(s.estimate).toBeCloseTo(-r.estimate, 14);
    expect(s.lower).toBeCloseTo(-r.upper, 14);
    expect(s.upper).toBeCloseTo(-r.lower, 14);
  });
});

describe('zTestTwoProportions', () => {
  it('matches every reference case within 1e-9', () => {
    expect(ref.ztest.length).toBeGreaterThan(0);
    for (const c of ref.ztest) {
      const r = zTestTwoProportions({ xA: c.xA, nA: c.nA, xB: c.xB, nB: c.nB });
      const label = JSON.stringify(c);
      expect(Math.abs(r.estimate - (c.xB / c.nB - c.xA / c.nA)), label).toBeLessThanOrEqual(TOL);
      expect(Math.abs(r.z - c.z), `z ${label}`).toBeLessThanOrEqual(TOL);
      expect(Math.abs(r.p - c.p), `p ${label}`).toBeLessThanOrEqual(TOL);
      if (c.p < 1e-6) expect(Math.abs(r.p / c.p - 1), `rel p ${label}`).toBeLessThanOrEqual(1e-6);
    }
  });

  it('returns {estimate 0, z 0, p 1} when no one converted', () => {
    expect(zTestTwoProportions({ xA: 0, nA: 50, xB: 0, nB: 50 })).toEqual({
      estimate: 0,
      z: 0,
      p: 1,
    });
  });

  it('returns z 0 and p 1 when everyone converted, without dividing by zero', () => {
    expect(zTestTwoProportions({ xA: 50, nA: 50, xB: 80, nB: 80 })).toEqual({
      estimate: 0,
      z: 0,
      p: 1,
    });
  });

  it('is positive when B beats A, and swapping the arms negates z and keeps p', () => {
    const r = zTestTwoProportions({ xA: 50, nA: 100, xB: 60, nB: 100 });
    const s = zTestTwoProportions({ xA: 60, nA: 100, xB: 50, nB: 100 });
    expect(r.z).toBeGreaterThan(0);
    expect(s.z).toBeCloseTo(-r.z, 14);
    expect(s.p).toBeCloseTo(r.p, 14);
  });

  it('keeps a tiny p-value precise instead of cancelling to zero', () => {
    const r = zTestTwoProportions({ xA: 100000, nA: 1000000, xB: 105000, nB: 1000000 });
    expect(r.p).toBeGreaterThan(0);
    expect(r.p).toBeLessThan(1e-20);
  });

  it('is defined for whole-arm-zero and whole-arm-full counts', () => {
    for (const c of [
      { xA: 0, nA: 100, xB: 100, nB: 100 },
      { xA: 100, nA: 100, xB: 0, nB: 100 },
    ]) {
      const r = zTestTwoProportions(c);
      expect(Number.isFinite(r.z)).toBe(true);
      expect(r.p).toBeGreaterThanOrEqual(0);
      expect(r.p).toBeLessThan(1e-30);
    }
  });

  it('is finite for nA = nB = 1e7', () => {
    const r = zTestTwoProportions({ xA: 2.9e6, nA: 1e7, xB: 2.91e6, nB: 1e7 });
    for (const v of [r.estimate, r.z, r.p]) expect(Number.isFinite(v)).toBe(true);
  });

  it('validates its counts', () => {
    expect(() => zTestTwoProportions({ xA: 1, nA: 0, xB: 1, nB: 10 })).toThrow(RangeError);
    expect(() => zTestTwoProportions({ xA: 1, nA: 10, xB: 11, nB: 10 })).toThrow(RangeError);
  });
});

describe('srmTest', () => {
  it('matches every reference case within 1e-9 (relative 1e-6 below p = 1e-6)', () => {
    expect(ref.srm.length).toBeGreaterThan(0);
    for (const c of ref.srm) {
      const r = srmTest(c.nA, c.nB);
      const label = `nA=${c.nA} nB=${c.nB}`;
      expect(Math.abs(r.chi2 - c.chi2), `chi2 ${label}`).toBeLessThanOrEqual(TOL);
      expect(Math.abs(r.p - c.p), `p ${label}`).toBeLessThanOrEqual(TOL);
      if (c.p < 1e-6) expect(Math.abs(r.p / c.p - 1), `rel p ${label}`).toBeLessThanOrEqual(1e-6);
      expect(r.flagged, label).toBe(c.p < 0.001);
    }
  });

  it('flags only a genuine imbalance', () => {
    expect(srmTest(480, 520).flagged).toBe(false);
    expect(srmTest(400, 600).flagged).toBe(true);
  });

  it('keeps every value finite for 5e6 vs 5.01e6', () => {
    const r = srmTest(5e6, 5.01e6);
    expect(Number.isFinite(r.chi2)).toBe(true);
    expect(Number.isFinite(r.p)).toBe(true);
    expect(typeof r.flagged).toBe('boolean');
  });

  it('honours a non-even expected split', () => {
    const even = srmTest(700, 300, 0.7);
    // 1 - 0.7 is inexact in floating point, so the statistic is zero only to rounding error.
    expect(even.chi2).toBeLessThan(1e-12);
    expect(even.p).toBeCloseTo(1, 12);
    expect(even.flagged).toBe(false);
    expect(srmTest(500, 500, 0.7).flagged).toBe(true);
    // 1000 users, 80/20 expected: chi2 = (750-800)^2/800 + (250-200)^2/200 = 15.625
    expect(srmTest(750, 250, 0.8).chi2).toBeCloseTo(15.625, 12);
  });

  it('handles an arm with zero users and keeps extreme p-values positive', () => {
    const r = srmTest(0, 100);
    expect(r.chi2).toBe(100);
    expect(r.flagged).toBe(true);
    const extreme = srmTest(1000, 2000);
    expect(extreme.p).toBeGreaterThan(0);
    expect(extreme.p).toBeLessThan(1e-60);
  });

  it('throws a RangeError for invalid inputs', () => {
    expect(() => srmTest(-1, 10)).toThrow(RangeError);
    expect(() => srmTest(10, 1.5)).toThrow(RangeError);
    expect(() => srmTest(Number.NaN, 10)).toThrow(RangeError);
    expect(() => srmTest(0, 0)).toThrow(RangeError);
    expect(() => srmTest(10, 10, 0)).toThrow(/expectedShareA/);
    expect(() => srmTest(10, 10, 1)).toThrow(RangeError);
    expect(() => srmTest(10, 10, Number.NaN)).toThrow(RangeError);
  });
});
