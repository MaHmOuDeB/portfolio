import { describe, expect, it } from 'vitest';
import { formatInterval, formatNumber, formatSignedNumber, formatSignedPoints } from '@/lib/figure/format';
import { stepLabel } from '@/lib/figure/steps';

const M = '−';
const de = { locale: 'de' } as const;

describe('figure formatters in German', () => {
  it('formatNumber: decimal comma, dots for thousands', () => {
    expect(formatNumber(1353, undefined, de)).toBe('1.353');
    expect(formatNumber(-12.5, undefined, de)).toBe(`${M}12,5`);
    expect(formatNumber(0.004, undefined, de)).toBe('0,004');
    expect(formatNumber(0.0123, undefined, de)).toBe('0,0123');
    expect(formatNumber(0, undefined, de)).toBe('0');
    expect(formatNumber(-0, undefined, de)).toBe('0');
    expect(formatNumber(1234.567, 1, de)).toBe('1.234,6');
  });

  it('formatNumber fixed keeps the zeros and the unsigned zero', () => {
    expect(formatNumber(0.71, 3, { fixed: true, locale: 'de' })).toBe('0,710');
    expect(formatNumber(1, 1, { fixed: true, locale: 'de' })).toBe('1,0');
    expect(formatNumber(-0.0001, 3, { fixed: true, locale: 'de' })).toBe('0,000');
    expect(formatNumber(-1234.5, 1, { fixed: true, locale: 'de' })).toBe(`${M}1.234,5`);
  });

  it('formatSignedNumber and formatSignedPoints', () => {
    expect(formatSignedNumber(5, 1, de)).toBe('+5');
    expect(formatSignedNumber(-0.4, 1, de)).toBe(`${M}0,4`);
    expect(formatSignedNumber(0, 1, de)).toBe('0');
    expect(formatSignedPoints(31, 0, de)).toBe('+31');
    expect(formatSignedPoints(-12.25, 1, de)).toBe(`${M}12,3`);
    expect(formatSignedPoints(0.04, 2, de)).toBe('+0,04');
    expect(formatSignedPoints(-0.0001, 1, de)).toBe('0');
  });

  it('formatInterval says "bis"', () => {
    expect(formatInterval(-12.2, 31, 0, de)).toBe(`${M}12 bis +31`);
    expect(formatInterval(-1.5, 3.2, 1, de)).toBe(`${M}1,5 bis +3,2`);
    expect(formatInterval(-0.0001, 0.0002, 1, de)).toBe('0 bis 0');
  });

  it('stepLabel says "von"', () => {
    expect(stepLabel(3, 5, de)).toBe('3 von 5');
    expect(stepLabel(9, 5, de)).toBe('5 von 5');
    expect(stepLabel(NaN, 0, de)).toBe('1 von 1');
  });

  it('leaves English unchanged with no locale or locale en', () => {
    expect(formatNumber(1353)).toBe('1,353');
    expect(formatNumber(1353, undefined, { locale: 'en' })).toBe('1,353');
    expect(formatInterval(-12.2, 31, 0)).toBe(`${M}12 to +31`);
    expect(formatInterval(-12.2, 31, 0, { locale: 'en' })).toBe(`${M}12 to +31`);
    expect(stepLabel(3, 5)).toBe('3 of 5');
    expect(stepLabel(3, 5, { locale: 'en' })).toBe('3 of 5');
  });
});
