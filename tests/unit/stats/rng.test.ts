import { binomial, sfc32 } from '@/lib/stats/rng';
import { ref } from './reference';

describe('sfc32', () => {
  it('reproduces the reference stream for seed 42 exactly', () => {
    const rng = sfc32(ref.sfc32.seed);
    const first = Array.from({ length: 16 }, () => rng.next());
    expect(first).toEqual(ref.sfc32.first);
  });

  it('exposes the seed it was built with', () => {
    expect(sfc32(42).seed).toBe(42);
  });

  it('is deterministic for a given seed', () => {
    const a = sfc32(123456);
    const b = sfc32(123456);
    for (let i = 0; i < 100; i += 1) expect(a.next()).toBe(b.next());
  });

  it('gives different streams for different seeds', () => {
    expect(sfc32(1).next()).not.toBe(sfc32(2).next());
  });

  it('returns unsigned 32-bit integers from next() and values in [0, 1) from uniform()', () => {
    const rng = sfc32(99);
    for (let i = 0; i < 1000; i += 1) {
      const n = rng.next();
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(0xffffffff);
      const u = rng.uniform();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });

  it('draws 1e6 uniforms with mean 0.5 and a flat 10-bin histogram', () => {
    const rng = sfc32(2024);
    const draws = 1_000_000;
    const bins = new Array<number>(10).fill(0);
    let sum = 0;
    for (let i = 0; i < draws; i += 1) {
      const u = rng.uniform();
      sum += u;
      const bin = Math.floor(u * 10);
      bins[bin] = (bins[bin] ?? 0) + 1;
    }
    expect(Math.abs(sum / draws - 0.5)).toBeLessThan(0.002);
    const expected = draws / 10;
    const chi2 = bins.reduce((acc, observed) => acc + (observed - expected) ** 2 / expected, 0);
    // 0.001 critical value of the chi-square distribution with 9 degrees of freedom.
    expect(chi2).toBeLessThan(27.877);
  });
});

describe('binomial', () => {
  it('is 0 with no trials and n with certain success', () => {
    expect(binomial(sfc32(7), 0, 0.3)).toBe(0);
    expect(binomial(sfc32(7), 10, 1)).toBe(10);
    expect(binomial(sfc32(7), 10, 0)).toBe(0);
  });

  it('has the right mean and stays within [0, n]', () => {
    const rng = sfc32(5);
    const reps = 20_000;
    let sum = 0;
    for (let i = 0; i < reps; i += 1) {
      const k = binomial(rng, 20, 0.3);
      expect(Number.isInteger(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(20);
      sum += k;
    }
    // Mean 6, sd of one draw sqrt(20 * 0.3 * 0.7) ~ 2.05, so the standard error is ~ 0.0145.
    expect(Math.abs(sum / reps - 6)).toBeLessThan(0.06);
  });

  it('is exactly the count of uniform() draws below p', () => {
    const a = sfc32(11);
    const b = sfc32(11);
    let expected = 0;
    for (let i = 0; i < 50; i += 1) if (b.uniform() < 0.4) expected += 1;
    expect(binomial(a, 50, 0.4)).toBe(expected);
  });

  it('throws a RangeError for an invalid n or p', () => {
    const rng = sfc32(1);
    expect(() => binomial(rng, -1, 0.5)).toThrow(RangeError);
    expect(() => binomial(rng, 2.5, 0.5)).toThrow(RangeError);
    expect(() => binomial(rng, Number.NaN, 0.5)).toThrow(RangeError);
    expect(() => binomial(rng, 5, -0.1)).toThrow(RangeError);
    expect(() => binomial(rng, 5, 1.1)).toThrow(RangeError);
    expect(() => binomial(rng, 5, Number.NaN)).toThrow(RangeError);
  });
});
