import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { linearFrac, niceTicks, pct } from '@/lib/figure/scales';

// Any finite double, including huge, tiny and subnormal magnitudes and -0.
const finite = fc.double({ noNaN: true, noDefaultInfinity: true });
// Data a chart may be handed: anything, NaN and the infinities included.
const anyDouble = fc.double();
const domain = fc.tuple(finite, finite);

describe('linearFrac', () => {
  it('maps a domain to 0..1 and clamps beyond it', () => {
    const f = linearFrac([0, 250]);
    expect(f(0)).toBe(0);
    expect(f(125)).toBe(0.5);
    expect(f(250)).toBe(1);
    expect(f(300)).toBe(1);
    expect(f(-40)).toBe(0);
  });

  it('follows a reversed domain', () => {
    const f = linearFrac([40, -20]);
    expect(f(40)).toBe(0);
    expect(f(-20)).toBe(1);
  });

  it('puts every value of a zero-width domain in the middle (all-equal data)', () => {
    const f = linearFrac([4, 4]);
    expect(f(4)).toBe(0.5);
    expect(f(-1e9)).toBe(0.5);
    expect(f(1e9)).toBe(0.5);
  });

  it('clamps the infinities to the ends and refuses NaN', () => {
    const f = linearFrac([-20, 40]);
    expect(f(Number.POSITIVE_INFINITY)).toBe(1);
    expect(f(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(() => f(Number.NaN)).toThrow(TypeError);
  });

  it('refuses a domain that is not finite', () => {
    expect(() => linearFrac([0, Number.NaN])).toThrow(TypeError);
    expect(() => linearFrac([Number.NEGATIVE_INFINITY, 1])).toThrow(TypeError);
  });

  it('keeps the ends exact when the span overflows a double', () => {
    const f = linearFrac([-Number.MAX_VALUE, Number.MAX_VALUE]);
    expect(f(-Number.MAX_VALUE)).toBe(0);
    expect(f(0)).toBe(0.5);
    expect(f(Number.MAX_VALUE)).toBe(1);
  });

  it('property: any finite domain and any value but NaN gives a finite fraction in 0..1, never -0', () => {
    fc.assert(
      fc.property(domain, anyDouble, ([a, b], v) => {
        fc.pre(!Number.isNaN(v));
        const out = linearFrac([a, b])(v);
        return Number.isFinite(out) && out >= 0 && out <= 1 && !Object.is(out, -0);
      }),
    );
  });

  it('property: the ends of a domain with width map to 0 and 1', () => {
    fc.assert(
      fc.property(domain, ([a, b]) => {
        fc.pre(a !== b);
        const f = linearFrac([a, b]);
        return f(a) === 0 && f(b) === 1;
      }),
    );
  });

  it('property: it never decreases along an ascending domain', () => {
    fc.assert(
      fc.property(domain, finite, finite, ([a, b], u, v) => {
        const f = linearFrac([Math.min(a, b), Math.max(a, b)]);
        const [lo, hi] = u <= v ? [u, v] : [v, u];
        return f(lo) <= f(hi);
      }),
    );
  });
});

describe('niceTicks', () => {
  it('gives round steps inside the domain', () => {
    expect(niceTicks([0, 250], 3)).toEqual([0, 100, 200]);
  });

  it('holds zero when the domain crosses it', () => {
    expect(niceTicks([-20, 40], 5)).toContain(0);
  });

  it('is ascending for a reversed domain and never holds -0', () => {
    const ticks = niceTicks([40, -20], 5);
    expect(ticks).toEqual([-20, -10, 0, 10, 20, 30, 40]);
    expect(ticks.some((t) => Object.is(t, -0))).toBe(false);
  });

  it('gives the one value of a zero-width domain (all-equal data)', () => {
    expect(niceTicks([4, 4], 5)).toEqual([4]);
    expect(niceTicks([0, 0], 5)).toEqual([0]);
  });

  it('gives nothing for a count below one', () => {
    expect(niceTicks([0, 250], 0)).toEqual([]);
    expect(niceTicks([0, 250], -3)).toEqual([]);
  });

  it('writes decimal steps without floating-point noise', () => {
    expect(niceTicks([0, 0.3], 3)).toEqual([0, 0.1, 0.2, 0.3]);
  });

  it('keeps ticks when the span overflows a double', () => {
    const ticks = niceTicks([-Number.MAX_VALUE, Number.MAX_VALUE], 4);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks).toContain(0);
  });

  it('gives nothing for a span too small to step through, instead of crashing', () => {
    // fast-check found this: d3 would allocate an array of Infinity length.
    expect(niceTicks([-5e-324, 5e-324], 1)).toEqual([]);
    expect(niceTicks([1e-310, 2e-310], 5)).toEqual([]);
  });

  it('caps the count, so a hostile count cannot allocate a huge array', () => {
    expect(niceTicks([0, 1], 1e9).length).toBeLessThanOrEqual(2 * 50 + 2);
  });

  it('refuses a domain that is not finite', () => {
    expect(() => niceTicks([0, Number.NaN], 5)).toThrow(TypeError);
    expect(() => niceTicks([0, Number.POSITIVE_INFINITY], 5)).toThrow(TypeError);
  });

  it('property: ticks are finite, strictly ascending, inside the domain, few, and never -0', () => {
    fc.assert(
      fc.property(domain, fc.integer({ min: 0, max: 12 }), ([a, b], count) => {
        const ticks = niceTicks([a, b], count);
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        return (
          ticks.length <= 2 * count + 2 &&
          ticks.every((t) => Number.isFinite(t) && t >= lo && t <= hi && !Object.is(t, -0)) &&
          ticks.every((t, i) => i === 0 || t > ticks[i - 1]!)
        );
      }),
    );
  });

  it('property: a domain holding zero gives a zero tick whenever it gives any', () => {
    fc.assert(
      fc.property(domain, fc.integer({ min: 1, max: 12 }), ([a, b], count) => {
        fc.pre(Math.min(a, b) <= 0 && Math.max(a, b) >= 0);
        const ticks = niceTicks([a, b], count);
        return ticks.length === 0 || ticks.includes(0);
      }),
    );
  });
});

describe('pct', () => {
  it('writes a fraction as a percentage of the frame width', () => {
    expect(pct(0.375)).toBe('37.5%');
    expect(pct(0)).toBe('0%');
    expect(pct(1)).toBe('100%');
    expect(pct(1 / 3)).toBe('33.333%');
  });

  it('clamps to the frame and prints -0 and tiny values as 0%', () => {
    expect(pct(-0)).toBe('0%');
    expect(pct(1e-12)).toBe('0%');
    expect(pct(-0.2)).toBe('0%');
    expect(pct(1.4)).toBe('100%');
  });

  it('refuses NaN', () => {
    expect(() => pct(Number.NaN)).toThrow(TypeError);
  });

  it('property: any number but NaN gives a plain percentage from 0 to 100', () => {
    fc.assert(
      fc.property(anyDouble, (frac) => {
        fc.pre(!Number.isNaN(frac));
        const out = pct(frac);
        const value = Number(out.slice(0, -1));
        return /^\d{1,3}(\.\d{1,3})?%$/.test(out) && value >= 0 && value <= 100;
      }),
    );
  });
});
