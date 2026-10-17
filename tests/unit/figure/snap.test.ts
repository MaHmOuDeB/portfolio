import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { snapToStep } from '@/lib/figure/snap';

describe('snapToStep', () => {
  it('strips float noise', () => {
    expect(snapToStep(0.15000000000000002, 0, 1, 0.05)).toBe(0.15);
    expect(snapToStep(0.1 + 0.2, 0, 1, 0.1)).toBe(0.3);
  });

  it('clamps to the range', () => {
    expect(snapToStep(7, 0, 5, 1)).toBe(5);
    expect(snapToStep(-1, 0, 5, 1)).toBe(0);
    expect(snapToStep(Infinity, 1, 50, 1)).toBe(50);
    expect(snapToStep(-Infinity, 1, 50, 1)).toBe(1);
  });

  it('falls back to the minimum for NaN, never throws', () => {
    expect(snapToStep(NaN, 0, 5, 1)).toBe(0);
    expect(snapToStep(NaN, 1, 50, 1)).toBe(1);
  });

  it('rounds to the nearest step counted from the minimum', () => {
    expect(snapToStep(2.4, 0, 5, 1)).toBe(2);
    expect(snapToStep(2.6, 0, 5, 1)).toBe(3);
    expect(snapToStep(4, 1, 50, 2)).toBe(5);
    expect(snapToStep(0.37, 0.1, 1, 0.25)).toBe(0.35);
  });

  it('never rounds past a maximum that is off the step grid', () => {
    expect(snapToStep(10, 0, 10, 3)).toBe(9);
    expect(snapToStep(9.9, 0, 10, 3)).toBe(9);
  });

  it('keeps a maximum on the grid despite division noise', () => {
    expect(snapToStep(0.3, 0, 0.3, 0.1)).toBe(0.3);
    expect(snapToStep(5, 0, 0.7, 0.1)).toBe(0.7);
  });

  it('only clamps when the step is not a positive finite number', () => {
    expect(snapToStep(2.7, 0, 5, 0)).toBe(2.7);
    expect(snapToStep(2.7, 0, 5, NaN)).toBe(2.7);
    expect(snapToStep(9, 0, 5, -1)).toBe(5);
  });

  it('is always inside [min, max] and a whole number of steps from min', () => {
    const steps = fc.constantFrom(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10);
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: 0, max: 1000, noNaN: true }),
        steps,
        fc.double(),
        (min, span, step, v) => {
          const max = min + span;
          const r = snapToStep(v, min, max, step);
          expect(r).toBeGreaterThanOrEqual(min);
          expect(r).toBeLessThanOrEqual(max);
          const k = Math.round((r - min) / step);
          expect(Math.abs(r - min - k * step)).toBeLessThanOrEqual(1e-9);
        },
      ),
    );
  });
});
