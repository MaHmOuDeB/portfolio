import { checkAlpha, checkArm } from '@/lib/stats/validate';

describe('checkAlpha', () => {
  it.each([0.05, 0.5, 1e-300, 0.999999999999])('accepts alpha = %s', (alpha) => {
    expect(() => checkAlpha(alpha)).not.toThrow();
  });

  it.each([0, 1, -0.1, 1.5, Number.NaN, Infinity, -Infinity])(
    'rejects alpha = %s with the exact message',
    (alpha) => {
      expect(() => checkAlpha(alpha)).toThrow(RangeError);
      expect(() => checkAlpha(alpha)).toThrow(`alpha must be in (0, 1), got ${alpha}`);
    },
  );
});

describe('checkArm', () => {
  it('accepts counts at the boundaries and inside', () => {
    expect(() => checkArm(0, 1, 'x', 'n')).not.toThrow();
    expect(() => checkArm(1, 1, 'x', 'n')).not.toThrow();
    expect(() => checkArm(5, 10, 'x', 'n')).not.toThrow();
    expect(() => checkArm(0, 1e9, 'xA', 'nA')).not.toThrow();
  });

  it.each([0, -3, 2.5, Number.NaN, Infinity])('rejects n = %s with the exact message', (n) => {
    expect(() => checkArm(0, n, 'x', 'nB')).toThrow(RangeError);
    expect(() => checkArm(0, n, 'x', 'nB')).toThrow(`nB must be a positive integer, got ${n}`);
  });

  it.each([-1, 11, 1.5, Number.NaN, Infinity])('rejects x = %s with the exact message', (x) => {
    expect(() => checkArm(x, 10, 'xA', 'nA')).toThrow(RangeError);
    expect(() => checkArm(x, 10, 'xA', 'nA')).toThrow(
      `xA must be an integer in [0, nA] (nA = 10), got ${x}`,
    );
  });

  it('checks n before x, so an invalid n is reported even when x is also invalid', () => {
    expect(() => checkArm(-1, 0, 'x', 'n')).toThrow('n must be a positive integer, got 0');
  });

  it('names the arguments it was given', () => {
    expect(() => checkArm(3, 2, 'conversions', 'visitors')).toThrow(
      'conversions must be an integer in [0, visitors] (visitors = 2), got 3',
    );
  });
});
