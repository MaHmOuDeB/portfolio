// The rules of the hydrated Figure invariants (tests/e2e/figure-invariants.ts), on strings: each one
// fires on the case it exists for and passes the site's own forms.
import { describe, expect, it } from 'vitest';
import { numberFindings, timeFinding } from '../../e2e/figure-invariants.ts';

describe('timeFinding', () => {
  it.each([
    ['2026', '2026'],
    ['2025-11', 'Nov 2025'],
    ['2026-11-13', '13.11.2026'],
    ['2027-05-16', '16.05'],
    ['2026-10-25T00:30:00+02:00', '25.10'],
    ['2026-10-24T22:30:00Z', '00:30'],
    ['2026-10-24T21:30:00Z', 'Updated 24.10, 23:30'],
  ])('passes %s written as "%s"', (dateTime, text) => {
    expect(timeFinding(dateTime, text)).toBeNull();
  });

  it.each([
    [null, '13.11'],
    ['2026', '26'],
    ['2025-11', 'November 2025'],
    ['2026-11-13', '13/11/2026'],
    ['2026-11-13', '2026-11-13'],
    ['2026-10-24T22:30:00Z', '22:30'],
    ['2026-10-24T22:30:00Z', '24.10'],
    ['2026-10-24T22:30:00Z', 'Sunday'],
    ['2026-10-24T22:30:00Z', '00:30, 3 views'],
    ['2026-10-24T22:30:00', '00:30'],
  ])('fails %s written as "%s"', (dateTime, text) => {
    expect(timeFinding(dateTime, text)).not.toBeNull();
  });
});

describe('numberFindings', () => {
  it('passes the true minus, a non-zero sign, a percent after its number and a "±" with its level', () => {
    expect(numberFindings(['−0.4', '+1.2', '29%', '0'], 'B − A is +1.2 points, ± 0.8 at the 95% level. Zero prints 0.')).toEqual([]);
  });

  it('fails a hyphen-minus before a digit in a number', () => {
    expect(numberFindings(['-0.4'], '')).toHaveLength(1);
  });

  it('fails a signed zero, in a number or in the text', () => {
    expect(numberFindings([], 'The difference is +0 points.')).toHaveLength(1);
    expect(numberFindings([], 'The difference is −0.0 points.')).toHaveLength(1);
    expect(numberFindings([], 'A cohort from 2010-03 and step 3-0')).toEqual([]);
  });

  it('fails a percent sign away from its number', () => {
    expect(numberFindings(['29 %'], '')).toHaveLength(1);
    expect(numberFindings(['%'], '')).toHaveLength(1);
  });

  it('fails a "±" that names no level', () => {
    expect(numberFindings([], 'The estimate is 1.2 ± 0.8 points. The 95% level is elsewhere.')).toHaveLength(1);
  });
});
