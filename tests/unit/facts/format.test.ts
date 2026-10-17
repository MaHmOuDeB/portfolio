import { formatFact, formatValue } from '../../../src/lib/facts/format.ts';
import type { FactDef } from '../../../src/lib/facts/types.ts';

describe('formatValue', () => {
  const cases: [string, Parameters<typeof formatValue>, string][] = [
    ['share, 0 decimals', [0.201, 'share', { decimals: 0 }], '20%'],
    ['share rounds up', [0.2903, 'share', { decimals: 0 }], '29%'],
    ['share rounds a small value', [0.0239, 'share', { decimals: 0 }], '2%'],
    ['share, 1 decimal', [0.0239, 'share', { decimals: 1 }], '2.4%'],
    ['negative share uses U+2212', [-0.0134, 'share', { decimals: 1 }], '−1.3%'],
    ['count groups thousands', [1353, 'count'], '1,353'],
    ['count with plus suffix', [25, 'count', { suffix: '+' }], '25+'],
    ['gbp in thousands', [406533, 'gbp', { scale: 'k' }], '£407k'],
    ['gbp in millions', [17027917, 'gbp', { scale: 'M', decimals: 1 }], '£17.0M'],
    ['kmh carries its unit', [2963.2, 'kmh'], '2,963 km/h'],
    ['decimal keeps its places', [0.793, 'decimal', { decimals: 3 }], '0.793'],
    ['pp is a bare number', [5, 'pp'], '5'],
    ['minutes is a bare number', [20, 'minutes'], '20'],
    ['date reads as day month year', ['2009-12-01', 'date'], '1 Dec 2009'],
    ['date with a time is read in UTC', ['2024-05-19T23:30:00Z', 'date'], '19 May 2024'],
    ['share rounds up to 100%', [0.9951, 'share', { decimals: 0 }], '100%'],
    ['negative gbp puts the sign first', [-406533, 'gbp', { scale: 'k' }], '−£407k'],
    ['a value that rounds to zero loses its sign', [-0.001, 'share', { decimals: 0 }], '0%'],
  ];
  for (const [name, args, expected] of cases) {
    it(name, () => {
      expect(formatValue(...args)).toBe(expected);
    });
  }

  it('throws a TypeError for a number with the date unit', () => {
    expect(() => formatValue(20091201, 'date')).toThrow(TypeError);
  });

  it('throws a TypeError for a string with the count unit', () => {
    expect(() => formatValue('25', 'count')).toThrow(TypeError);
  });

  it('throws a TypeError for a date that is not an ISO string', () => {
    expect(() => formatValue('last week', 'date')).toThrow(TypeError);
  });
});

describe('formatFact', () => {
  const base: FactDef = {
    id: 'profile.audible.experiments',
    value: 25,
    unit: 'count',
    decimals: 0,
    label: 'Experiments',
    source: 'profile',
    from: 'fact-sheet',
    suffix: '+',
  };

  it('uses the decimals, suffix and scale of the definition', () => {
    expect(formatFact(base)).toBe('25+');
    expect(
      formatFact({ ...base, value: 17027917, unit: 'gbp', suffix: undefined, scale: 'M', decimals: 1 }),
    ).toBe('£17.0M');
  });

  it('lets the caller override the decimals', () => {
    expect(formatFact({ ...base, value: 0.0239, unit: 'share', suffix: undefined }, { decimals: 1 })).toBe('2.4%');
  });
});
