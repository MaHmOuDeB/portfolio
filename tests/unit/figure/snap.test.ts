import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isOnStepGrid, snapToStep, stepFrom } from '@/lib/figure/snap';

/** Every property here runs from this seed, so a failing run can be replayed. */
const PROPERTY_SEED = 20261205;

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
      { seed: PROPERTY_SEED },
    );
  });
});

// A percent-of-baseline slider: one step is one whole point of a 29% baseline (100 / 29 percent).
const PCT = { min: 100 / 29, max: (25 * 100) / 29, step: 100 / 29 };
const pct = (v: number) => snapToStep(v, PCT.min, PCT.max, PCT.step);

describe('isOnStepGrid', () => {
  it('accepts a grid value as a browser serialises it, which an exact comparison refuses', () => {
    // A number input stepped to these (Chromium and WebKit print 15 significant digits); snapToStep
    // rounds the same grid value differently in the last digit.
    const cases: [number, string][] = [
      [7, '428.571428571429'],
      [18, '166.666666666667'],
      [21, '80.952380952381'],
    ];
    for (const [baseline, typed] of cases) {
      const step = 100 / baseline;
      const v = Number(typed);
      expect(snapToStep(v, step, 30 * step, step), typed).not.toBe(v);
      expect(isOnStepGrid(v, step, 30 * step, step), typed).toBe(true);
    }
  });

  it('accepts every snapped value and the exact grid values', () => {
    for (let k = 0; k <= 24; k++) {
      expect(isOnStepGrid(pct(PCT.min + k * PCT.step), PCT.min, PCT.max, PCT.step)).toBe(true);
      expect(isOnStepGrid(PCT.min + k * PCT.step, PCT.min, PCT.max, PCT.step)).toBe(true);
    }
    expect(isOnStepGrid(20, 1, 50, 1)).toBe(true);
    expect(isOnStepGrid(0.15, 0.05, 0.5, 0.01)).toBe(true);
  });

  it('refuses a value between two grid values, outside the range, or not a number', () => {
    expect(isOnStepGrid(17.2, PCT.min, PCT.max, PCT.step)).toBe(false);
    expect(isOnStepGrid(20.5, 1, 50, 1)).toBe(false);
    expect(isOnStepGrid(51, 1, 50, 1)).toBe(false);
    expect(isOnStepGrid(0, 1, 50, 1)).toBe(false);
    expect(isOnStepGrid(Number.NaN, 1, 50, 1)).toBe(false);
    expect(isOnStepGrid(Number.POSITIVE_INFINITY, 1, 50, 1)).toBe(false);
  });

  it('with a step that is not positive and finite, accepts any value in the range', () => {
    expect(isOnStepGrid(2.37, 1, 5, 0)).toBe(true);
    expect(isOnStepGrid(7, 1, 5, Number.NaN)).toBe(false);
  });
});

describe('stepFrom', () => {
  it('moves a grid value one whole step up or down', () => {
    const at = pct(PCT.min + 4 * PCT.step); // 17.2413793103448, five points
    expect(stepFrom(at, 1, PCT.min, PCT.max, PCT.step)).toBe(pct(PCT.min + 5 * PCT.step));
    expect(stepFrom(at, -1, PCT.min, PCT.max, PCT.step)).toBe(pct(PCT.min + 3 * PCT.step));
    expect(stepFrom(20, 1, 1, 50, 1)).toBe(21);
    expect(stepFrom(20, -1, 1, 50, 1)).toBe(19);
  });

  it('moves a value between two grid values to the nearer one in that direction, as a number input does', () => {
    expect(stepFrom(17.2, 1, PCT.min, PCT.max, PCT.step)).toBe(pct(PCT.min + 4 * PCT.step));
    expect(stepFrom(17.2, -1, PCT.min, PCT.max, PCT.step)).toBe(pct(PCT.min + 3 * PCT.step));
    expect(stepFrom(20.5, 1, 1, 50, 1)).toBe(21);
    expect(stepFrom(20.5, -1, 1, 50, 1)).toBe(20);
  });

  it('accepts a grid value a browser serialised, and still moves one whole step', () => {
    const step = 100 / 21; // 80.952380952381 is 17 steps of 100 / 21
    expect(stepFrom(Number('80.952380952381'), 1, step, 30 * step, step)).toBe(snapToStep(18 * step, step, 30 * step, step));
  });

  it('stops at the ends, reaching a maximum that is on the grid', () => {
    const top = pct(PCT.max);
    expect(stepFrom(pct(PCT.min + 23 * PCT.step), 1, PCT.min, PCT.max, PCT.step)).toBe(top);
    expect(stepFrom(top, 1, PCT.min, PCT.max, PCT.step)).toBe(top);
    expect(stepFrom(pct(PCT.min), -1, PCT.min, PCT.max, PCT.step)).toBe(pct(PCT.min));
    expect(stepFrom(50, 1, 1, 50, 1)).toBe(50);
    expect(stepFrom(1, -1, 1, 50, 1)).toBe(1);
  });

  it('never throws on a hostile base or step', () => {
    expect(stepFrom(Number.NaN, 1, 1, 50, 1)).toBe(1);
    expect(stepFrom(-1e9, 1, 1, 50, 1)).toBe(1);
    expect(stepFrom(1e9, -1, 1, 50, 1)).toBe(50);
    expect(stepFrom(3, 1, 1, 5, 0)).toBe(3);
    fc.assert(
      fc.property(fc.double({ noNaN: false }), fc.constantFrom<1 | -1>(1, -1), (base, dir) => {
        const next = stepFrom(base, dir, PCT.min, PCT.max, PCT.step);
        return next >= PCT.min && next <= PCT.max && isOnStepGrid(next, PCT.min, PCT.max, PCT.step);
      }),
      { seed: PROPERTY_SEED },
    );
  });
});
