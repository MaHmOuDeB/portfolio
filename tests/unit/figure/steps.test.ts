import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizeSteps, stepDirection, stepLabel, stepTarget } from '@/lib/figure/steps';

describe('normalizeSteps', () => {
  it('keeps a valid position', () => {
    expect(normalizeSteps(3, 5)).toEqual({ current: 3, total: 5 });
  });

  it('clamps current into 1 to total', () => {
    expect(normalizeSteps(0, 5)).toEqual({ current: 1, total: 5 });
    expect(normalizeSteps(-4, 5)).toEqual({ current: 1, total: 5 });
    expect(normalizeSteps(9, 5)).toEqual({ current: 5, total: 5 });
    expect(normalizeSteps(Infinity, 5)).toEqual({ current: 5, total: 5 });
    expect(normalizeSteps(-Infinity, 5)).toEqual({ current: 1, total: 5 });
  });

  it('rounds a fractional current and floors a fractional total', () => {
    expect(normalizeSteps(2.6, 5)).toEqual({ current: 3, total: 5 });
    expect(normalizeSteps(2, 4.9)).toEqual({ current: 2, total: 4 });
  });

  it('treats NaN as the first step', () => {
    expect(normalizeSteps(Number.NaN, 5)).toEqual({ current: 1, total: 5 });
  });

  it('never has fewer than one step: 0, negative, NaN and infinite totals become 1', () => {
    for (const total of [0, -3, 0.4, Number.NaN, Infinity, -Infinity]) {
      expect(normalizeSteps(3, total)).toEqual({ current: 1, total: 1 });
    }
  });

  it('always returns a position inside its own range, for any input', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: false }), fc.double({ noNaN: false }), (current, total) => {
        const r = normalizeSteps(current, total);
        expect(Number.isInteger(r.total) && r.total >= 1).toBe(true);
        expect(Number.isInteger(r.current) && r.current >= 1 && r.current <= r.total).toBe(true);
      }),
    );
  });
});

describe('stepTarget', () => {
  it('moves one step either way', () => {
    expect(stepTarget(3, 5, 1)).toBe(4);
    expect(stepTarget(3, 5, -1)).toBe(2);
  });

  it('is null at the ends, so nothing changes (no wrapping)', () => {
    expect(stepTarget(5, 5, 1)).toBeNull();
    expect(stepTarget(1, 5, -1)).toBeNull();
  });

  it('is null both ways for one step and for a total of 0', () => {
    for (const total of [1, 0, Number.NaN]) {
      expect(stepTarget(1, total, 1)).toBeNull();
      expect(stepTarget(1, total, -1)).toBeNull();
    }
  });

  it('moves from the clamped position when current is out of range', () => {
    expect(stepTarget(99, 5, -1)).toBe(4);
    expect(stepTarget(99, 5, 1)).toBeNull();
    expect(stepTarget(Number.NaN, 5, 1)).toBe(2);
    expect(stepTarget(-9, 5, -1)).toBeNull();
  });

  it('never throws and always lands inside the range', () => {
    fc.assert(
      fc.property(fc.double(), fc.double(), fc.constantFrom(-1, 1), (current, total, direction) => {
        const next = stepTarget(current, total, direction);
        if (next === null) return;
        const { total: t } = normalizeSteps(current, total);
        expect(next >= 1 && next <= t && Number.isInteger(next)).toBe(true);
      }),
    );
  });
});

describe('stepLabel', () => {
  it('reads "3 of 5"', () => {
    expect(stepLabel(3, 5)).toBe('3 of 5');
    expect(stepLabel(1, 1)).toBe('1 of 1');
  });

  it('shows the clamped position for hostile input', () => {
    expect(stepLabel(9, 5)).toBe('5 of 5');
    expect(stepLabel(Number.NaN, 5)).toBe('1 of 5');
    expect(stepLabel(2, 0)).toBe('1 of 1');
  });
});

describe('stepDirection', () => {
  it('maps the arrow keys', () => {
    expect(stepDirection({ key: 'ArrowRight' })).toBe(1);
    expect(stepDirection({ key: 'ArrowLeft' })).toBe(-1);
  });

  it('ignores every other key', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab', 'Enter', ' ', 'a']) {
      expect(stepDirection({ key })).toBeNull();
    }
  });

  it('ignores an arrow used with a modifier (Alt+Left is the browser Back)', () => {
    expect(stepDirection({ key: 'ArrowLeft', altKey: true })).toBeNull();
    expect(stepDirection({ key: 'ArrowRight', ctrlKey: true })).toBeNull();
    expect(stepDirection({ key: 'ArrowRight', metaKey: true })).toBeNull();
    expect(stepDirection({ key: 'ArrowRight', shiftKey: true })).toBeNull();
  });
});
