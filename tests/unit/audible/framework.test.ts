import { describe, expect, it } from 'vitest';
import {
  frameworkDecision,
  normalizeFramework,
  type FrameworkValues,
} from '@/lib/audible/framework';

const v = (
  primaryLower: number,
  primaryUpper: number,
  guardrailUpper: number,
): FrameworkValues => ({ primaryLower, primaryUpper, guardrailUpper });

describe('frameworkDecision', () => {
  it('ships when the primary lower bound is above zero and the guardrail holds', () => {
    expect(frameworkDecision({ primaryLower: 1, primaryUpper: 4, guardrailUpper: 2 })).toBe('ship');
  });

  it('ships neutral results when the interval spans zero and the guardrail holds', () => {
    expect(frameworkDecision({ primaryLower: -1, primaryUpper: 3, guardrailUpper: 1 })).toBe(
      'ship-neutral',
    );
  });

  it('treats a lower bound that touches zero as neutral, not as a ship', () => {
    expect(frameworkDecision({ primaryLower: 0, primaryUpper: 3, guardrailUpper: 1 })).toBe(
      'ship-neutral',
    );
  });

  it('calls harm when the whole primary interval is below zero', () => {
    expect(frameworkDecision({ primaryLower: -3, primaryUpper: -1, guardrailUpper: 1 })).toBe(
      'harm',
    );
  });

  it('holds when the guardrail upper bound passes the margin', () => {
    expect(frameworkDecision(v(1, 4, 2.1))).toBe('hold');
    expect(frameworkDecision(v(-1, 3, 2.1))).toBe('hold');
    expect(frameworkDecision(v(0, 3, 2.1))).toBe('hold');
  });

  describe('boundaries', () => {
    it('guardrail exactly at the margin holds the line, just above holds the ship', () => {
      expect(frameworkDecision(v(1, 4, 2))).toBe('ship');
      expect(frameworkDecision(v(1, 4, 2.1))).toBe('hold');
      expect(frameworkDecision(v(1, 4, 1.9))).toBe('ship');
    });

    it('primary lower bound: below, exactly at and just above zero', () => {
      expect(frameworkDecision(v(-0.1, 3, 1))).toBe('ship-neutral');
      expect(frameworkDecision(v(0, 3, 1))).toBe('ship-neutral');
      expect(frameworkDecision(v(0.1, 3, 1))).toBe('ship');
    });

    it('primary upper bound: just below, exactly at and just above zero', () => {
      expect(frameworkDecision(v(-3, -0.1, 1))).toBe('harm');
      expect(frameworkDecision(v(-3, 0, 1))).toBe('ship-neutral');
      expect(frameworkDecision(v(-3, 0.1, 1))).toBe('ship-neutral');
    });

    it('harm wins over hold, hold wins over ship', () => {
      expect(frameworkDecision(v(-3, -1, 2.1))).toBe('harm');
      expect(frameworkDecision(v(1, 4, 5))).toBe('hold');
    });
  });
});

describe('normalizeFramework', () => {
  it('keeps the defaults', () => {
    expect(normalizeFramework(v(1, 4, 1))).toEqual(v(1, 4, 1));
  });

  it('clamps each value to the range -10 to 10', () => {
    expect(normalizeFramework(v(-50, 50, -50))).toEqual(v(-10, 10, -10));
    expect(normalizeFramework(v(50, 50, 50))).toEqual(v(10, 10, 10));
  });

  it('snaps to steps of 0.1', () => {
    expect(normalizeFramework(v(1.04, 4.26, 1.34))).toEqual(v(1, 4.3, 1.3));
  });

  it('lifts the upper bound to the lower bound when it falls below', () => {
    expect(normalizeFramework(v(3, 1, 1))).toEqual(v(3, 3, 1));
  });

  it('falls back to the defaults for values that are not finite', () => {
    expect(normalizeFramework(v(NaN, Infinity, -Infinity))).toEqual(v(1, 4, 1));
  });

  it('is idempotent', () => {
    const once = normalizeFramework(v(2.37, -8, 99));
    expect(normalizeFramework(once)).toEqual(once);
  });

  it('every normalized input is finite, ordered and gets exactly one decision', () => {
    const values = [-1000, -10.04, -10, -3.33, -0.1, 0, 0.05, 0.1, 1, 2, 2.05, 2.1, 9.96, 10, 1000, NaN, Infinity, -Infinity];
    const allowed = ['ship', 'ship-neutral', 'harm', 'hold'];
    for (const a of values) {
      for (const b of values) {
        for (const c of values) {
          const n = normalizeFramework(v(a, b, c));
          expect(Number.isFinite(n.primaryLower)).toBe(true);
          expect(Number.isFinite(n.primaryUpper)).toBe(true);
          expect(Number.isFinite(n.guardrailUpper)).toBe(true);
          expect(n.primaryLower).toBeLessThanOrEqual(n.primaryUpper);
          expect(n.primaryLower).toBeGreaterThanOrEqual(-10);
          expect(n.primaryUpper).toBeLessThanOrEqual(10);
          expect(n.guardrailUpper).toBeGreaterThanOrEqual(-10);
          expect(n.guardrailUpper).toBeLessThanOrEqual(10);
          expect(allowed.filter((d) => d === frameworkDecision(n))).toHaveLength(1);
        }
      }
    }
  });
});
