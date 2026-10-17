import { describe, expect, it } from 'vitest';
import { formatInterval, formatNumber, formatSignedPoints } from '@/lib/figure/format';

describe('formatNumber', () => {
  it('groups thousands in en-GB', () => {
    expect(formatNumber(1353)).toBe('1,353');
  });

  it('prints negative zero and values that round to zero as "0"', () => {
    expect(formatNumber(-0)).toBe('0');
    expect(formatNumber(-0.001, 2)).toBe('0');
  });

  it('uses U+2212 for a negative number', () => {
    expect(formatNumber(-1353)).toBe('−1,353');
  });

  it('keeps at most maxDigits decimals and drops trailing zeros', () => {
    expect(formatNumber(2.5, 1)).toBe('2.5');
    expect(formatNumber(2, 1)).toBe('2');
    expect(formatNumber(2.456, 1)).toBe('2.5');
  });

  it('throws on a number that is not finite', () => {
    expect(() => formatNumber(Number.NaN)).toThrow(TypeError);
    expect(() => formatNumber(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe('formatSignedPoints', () => {
  it('shows a plus sign on a positive value', () => {
    expect(formatSignedPoints(31.2, 0)).toBe('+31');
    expect(formatSignedPoints(31.2, 1)).toBe('+31.2');
  });

  it('shows U+2212 on a negative value', () => {
    expect(formatSignedPoints(-12.4, 0)).toBe('−12');
    expect(formatSignedPoints(-12.4, 1)).toBe('−12.4');
  });

  it('prints zero, negative zero and values that round to zero as a bare "0"', () => {
    expect(formatSignedPoints(0, 0)).toBe('0');
    expect(formatSignedPoints(-0, 0)).toBe('0');
    expect(formatSignedPoints(-0.04, 1)).toBe('0');
    expect(formatSignedPoints(0.04, 1)).toBe('0');
    expect(formatSignedPoints(-0.4, 0)).toBe('0');
  });

  it('keeps the fixed number of digits', () => {
    expect(formatSignedPoints(3, 1)).toBe('+3.0');
  });

  it('throws on a number that is not finite', () => {
    expect(() => formatSignedPoints(Number.NaN, 0)).toThrow(TypeError);
  });
});

describe('formatInterval', () => {
  it('joins the two ends with "to"', () => {
    expect(formatInterval(-12.4, 31.2, 0)).toBe('−12 to +31');
  });

  it('never prints a signed zero at either end', () => {
    expect(formatInterval(-0.4, 0.3, 0)).toBe('0 to 0');
    expect(formatInterval(-0.4, 5, 0)).toBe('0 to +5');
  });
});
