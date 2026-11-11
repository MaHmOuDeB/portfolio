import { describe, expect, it } from 'vitest';
import { formatInterval, formatNumber, formatSignedNumber, formatSignedPoints } from '@/lib/figure/format';

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

  it('does not print a small non-zero value as zero', () => {
    expect(formatNumber(0.004)).toBe('0.004');
    expect(formatNumber(-0.004)).toBe('\u22120.004');
    expect(formatNumber(0.0123)).toBe('0.0123');
    expect(formatNumber(0.0456)).toBe('0.0456');
    expect(formatNumber(0.25)).toBe('0.25');
    expect(formatNumber(0.456789)).toBe('0.457');
  });

  it('keeps two decimals from 1 up', () => {
    expect(formatNumber(1200.456)).toBe('1,200.46');
    expect(formatNumber(1.5)).toBe('1.5');
  });

  it('throws on a number that is not finite', () => {
    expect(() => formatNumber(Number.NaN)).toThrow(TypeError);
    expect(() => formatNumber(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe('the existing formats, pinned as printed before fixed decimals were added', () => {
  it('prints the same strings as before', () => {
    expect(formatNumber(0.71)).toBe('0.71');
    expect(formatNumber(0.71, 3)).toBe('0.71');
    expect(formatNumber(1, 1)).toBe('1');
    expect(formatNumber(0.9, 1)).toBe('0.9');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(0, 3)).toBe('0');
    expect(formatNumber(1234.5678)).toBe('1,234.57');
    expect(formatNumber(1234.5678, 0)).toBe('1,235');
    expect(formatNumber(-0.4)).toBe('−0.4');
    expect(formatSignedNumber(2.25, 1)).toBe('+2.3');
    expect(formatSignedPoints(0, 2)).toBe('0');
    expect(formatSignedPoints(-0.004, 2)).toBe('0');
    expect(formatSignedPoints(3, 2)).toBe('+3.00');
  });
});

// Fixed decimals: the caller asks for exactly that many decimals, so a column or an axis reads at
// one precision ("0.710" beside "0.685", "0.9" then "1.0").
describe('formatNumber with fixed decimals', () => {
  const fixed = { fixed: true } as const;

  it('keeps trailing zeros up to exactly the given decimals', () => {
    expect(formatNumber(0.71, 3, fixed)).toBe('0.710');
    expect(formatNumber(0.685, 3, fixed)).toBe('0.685');
    expect(formatNumber(1, 1, fixed)).toBe('1.0');
    expect(formatNumber(0.5, 1, fixed)).toBe('0.5');
    expect(formatNumber(1353, 2, fixed)).toBe('1,353.00');
    expect(formatNumber(12, 0, fixed)).toBe('12');
  });

  it('rounds half away from zero, like the other formats', () => {
    expect(formatNumber(0.25, 1, fixed)).toBe('0.3');
    expect(formatNumber(-0.25, 1, fixed)).toBe('−0.3');
    expect(formatNumber(2.5, 0, fixed)).toBe('3');
    expect(formatNumber(-2.5, 0, fixed)).toBe('−3');
    expect(formatNumber(0.7106, 3, fixed)).toBe('0.711');
  });

  it('uses U+2212 for a negative number', () => {
    expect(formatNumber(-0.71, 3, fixed)).toBe('−0.710');
    expect(formatNumber(-1, 1, fixed)).toBe('−1.0');
  });

  it('prints zero, negative zero and values that round to zero with their decimals and no sign', () => {
    expect(formatNumber(0, 3, fixed)).toBe('0.000');
    expect(formatNumber(-0, 3, fixed)).toBe('0.000');
    expect(formatNumber(-0.0004, 3, fixed)).toBe('0.000');
    expect(formatNumber(0.0004, 3, fixed)).toBe('0.000');
    expect(formatNumber(-0.04, 1, fixed)).toBe('0.0');
    expect(formatNumber(-0.4, 0, fixed)).toBe('0');
  });

  it('throws on a number that is not finite', () => {
    expect(() => formatNumber(Number.NaN, 3, fixed)).toThrow(TypeError);
    expect(() => formatNumber(Number.POSITIVE_INFINITY, 1, fixed)).toThrow(TypeError);
    expect(() => formatNumber(Number.NEGATIVE_INFINITY, 1, fixed)).toThrow(TypeError);
  });

  it('refuses decimals that are not a whole number from 0 to 20', () => {
    expect(() => formatNumber(0.71, 1.5, fixed)).toThrow(RangeError);
    expect(() => formatNumber(0.71, -1, fixed)).toThrow(RangeError);
    expect(() => formatNumber(0.71, 21, fixed)).toThrow(RangeError);
    expect(() => formatNumber(0.71, Number.NaN, fixed)).toThrow(RangeError);
    // @ts-expect-error fixed decimals need their number of decimals
    expect(() => formatNumber(0.71, undefined, fixed)).toThrow(RangeError);
    expect(formatNumber(0.5, 20, fixed)).toBe('0.50000000000000000000');
  });

  it('is off unless asked for: { fixed: false } prints as before', () => {
    expect(formatNumber(0.71, 3, { fixed: false })).toBe('0.71');
    expect(formatNumber(1, 1, { fixed: false })).toBe('1');
    expect(formatNumber(-0.0004, 3, { fixed: false })).toBe('0');
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

describe('formatSignedNumber', () => {
  it('signs a difference and trims trailing zeros', () => {
    expect(formatSignedNumber(5)).toBe('+5');
    expect(formatSignedNumber(-0.4)).toBe('\u22120.4');
    expect(formatSignedNumber(2.5)).toBe('+2.5');
  });

  it('prints zero and values that round to zero as a bare "0"', () => {
    expect(formatSignedNumber(0)).toBe('0');
    expect(formatSignedNumber(-0)).toBe('0');
    expect(formatSignedNumber(0.04)).toBe('0');
  });
});
