import fc from 'fast-check';
import { normalCdf, normalPdf, normalQuantile } from '@/lib/stats/normal';
import { ref } from './reference';

describe('normalCdf', () => {
  it('matches every reference pair within 1e-12 absolute', () => {
    for (const [x, expected] of ref.normalCdf) {
      expect(Math.abs(normalCdf(x) - expected), `x = ${x}`).toBeLessThanOrEqual(1e-12);
    }
  });

  it('matches the reference in relative terms (1e-9) wherever it is nonzero and below 1e-5', () => {
    const tail = ref.normalCdf.filter(([, v]) => v > 0 && v < 1e-5);
    expect(tail.length).toBeGreaterThan(100);
    for (const [x, expected] of tail) {
      expect(Math.abs(normalCdf(x) / expected - 1), `x = ${x}`).toBeLessThanOrEqual(1e-9);
    }
  });

  it('is accurate at the edge of double precision: Phi(-37) is positive and about 5.7256e-300', () => {
    const v = normalCdf(-37);
    expect(v).toBeGreaterThan(0);
    // Independent value from the C library erfc: 0.5 * erfc(37 / sqrt(2)).
    expect(Math.abs(v / 5.725571222525138e-300 - 1)).toBeLessThan(1e-6);
  });

  it('underflows gracefully: Phi(-40) is a finite non-negative number', () => {
    const v = normalCdf(-40);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
  });

  it('is non-decreasing over a grid from -40 to 40', () => {
    let previous = normalCdf(-40);
    for (let i = -3999; i <= 4000; i += 1) {
      const x = i / 100;
      const current = normalCdf(x);
      expect(current, `x = ${x}`).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it('is exactly 0.5 at 0 and handles the infinities', () => {
    expect(normalCdf(0)).toBe(0.5);
    expect(normalCdf(-Infinity)).toBe(0);
    expect(normalCdf(Infinity)).toBe(1);
    expect(normalCdf(Number.NaN)).toBeNaN();
  });
});

describe('normalPdf', () => {
  it('equals the closed form', () => {
    expect(normalPdf(0)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 15);
    expect(normalPdf(1)).toBeCloseTo(0.24197072451914337, 15);
    expect(normalPdf(-2.5)).toBeCloseTo(0.01752830049356854, 15);
    expect(normalPdf(40)).toBe(0);
  });
});

describe('normalQuantile', () => {
  it('matches every reference pair within 1e-9 relative', () => {
    for (const [p, expected] of ref.normalQuantile) {
      const got = normalQuantile(p);
      if (expected === 0) {
        expect(got, `p = ${p}`).toBe(0);
      } else {
        expect(Math.abs(got / expected - 1), `p = ${p}`).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it('reaches deep into the lower tail: quantile(1e-300) is about -37.0471', () => {
    expect(Math.abs(normalQuantile(1e-300) / -37.0470962994 - 1)).toBeLessThan(1e-9);
    expect(Math.abs(normalQuantile(1e-300) - -37.0471)).toBeLessThan(1e-5);
  });

  it('returns the infinities at the endpoints', () => {
    expect(normalQuantile(0)).toBe(-Infinity);
    expect(normalQuantile(1)).toBe(Infinity);
  });

  it('throws a RangeError outside [0, 1] and for NaN', () => {
    expect(() => normalQuantile(-0.1)).toThrow(RangeError);
    expect(() => normalQuantile(1.1)).toThrow(RangeError);
    expect(() => normalQuantile(Number.NaN)).toThrow(RangeError);
  });

  it('is antisymmetric about 0.5', () => {
    for (const p of [0.001, 0.025, 0.2, 0.4]) {
      expect(normalQuantile(1 - p)).toBeCloseTo(-normalQuantile(p), 10);
    }
  });

  it('inverts normalCdf for every x in [-8, 4]', () => {
    fc.assert(
      fc.property(fc.double({ min: -8, max: 4, noNaN: true }), (x) => {
        expect(Math.abs(normalQuantile(normalCdf(x)) - x)).toBeLessThan(1e-8);
      }),
      { seed: 20260101, numRuns: 2000 },
    );
  });

  it('inverts normalCdf in the lower tail for -x with x in [4, 8]', () => {
    fc.assert(
      fc.property(fc.double({ min: 4, max: 8, noNaN: true }), (x) => {
        expect(Math.abs(normalQuantile(normalCdf(-x)) - -x)).toBeLessThan(1e-8);
      }),
      { seed: 20260101, numRuns: 2000 },
    );
  });
});
