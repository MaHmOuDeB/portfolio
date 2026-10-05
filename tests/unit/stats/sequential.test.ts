import { readFileSync } from 'node:fs';
import { generateObfConstants } from '../../../scripts/gen-obf-constants.ts';
import { sfc32 } from '@/lib/stats/rng';
import {
  mixtureCs,
  mixtureRatio,
  obfBoundary,
  obfConstant,
  optimalTau2,
} from '@/lib/stats/sequential';
import { OBF_CONSTANTS } from '@/lib/stats/obf-constants.generated';
import { ref } from './reference';

const TOL = 1e-9;

describe('mixtureRatio', () => {
  it('matches the reference within 1e-9 relative', () => {
    for (const { alpha, r } of ref.mixtureRatio) {
      expect(Math.abs(mixtureRatio(alpha) - r) / r).toBeLessThan(1e-9);
    }
  });

  it('gives 8.21197 at alpha 0.05', () => {
    expect(mixtureRatio(0.05)).toBeCloseTo(8.21197, 5);
  });

  it('solves r = 2 ln(1/alpha) + ln(1 + r)', () => {
    for (const alpha of [1e-6, 0.001, 0.05, 0.5, 0.9]) {
      const r = mixtureRatio(alpha);
      expect(Math.abs(r - (2 * Math.log(1 / alpha) + Math.log(1 + r)))).toBeLessThan(1e-12 * r);
    }
  });

  it('rejects alpha outside (0, 1)', () => {
    for (const alpha of [0, 1, -0.1, 1.5, Number.NaN]) {
      expect(() => mixtureRatio(alpha)).toThrow(RangeError);
    }
  });
});

describe('optimalTau2', () => {
  it('is r* * 2 p (1 - p) / nCap', () => {
    expect(optimalTau2({ baseline: 0.35, nCapPerArm: 1000 })).toBeCloseTo(
      (mixtureRatio(0.05) * 2 * 0.35 * 0.65) / 1000,
      15,
    );
    expect(optimalTau2({ baseline: 0.29, nCapPerArm: 1000, alpha: 0.1 })).toBeCloseTo(
      (mixtureRatio(0.1) * 2 * 0.29 * 0.71) / 1000,
      15,
    );
  });

  it('validates its inputs', () => {
    expect(() => optimalTau2({ baseline: 0, nCapPerArm: 1000 })).toThrow(/baseline/);
    expect(() => optimalTau2({ baseline: 1, nCapPerArm: 1000 })).toThrow(/baseline/);
    expect(() => optimalTau2({ baseline: 0.3, nCapPerArm: 0.5 })).toThrow(/nCapPerArm/);
    expect(() => optimalTau2({ baseline: 0.3, nCapPerArm: Number.POSITIVE_INFINITY })).toThrow(
      /nCapPerArm/,
    );
    expect(() => optimalTau2({ baseline: 0.3, nCapPerArm: 1000, alpha: 0 })).toThrow(/alpha/);
  });
});

describe('mixtureCs', () => {
  it('matches every reference case within 1e-9', () => {
    expect(ref.mixtureCs.length).toBeGreaterThan(0);
    for (const c of ref.mixtureCs) {
      const out = mixtureCs(c, { tau2: c.tau2, alpha: c.alpha });
      expect(Math.abs(out.estimate - c.estimate)).toBeLessThan(TOL);
      expect(Math.abs(out.lower - c.lower)).toBeLessThan(TOL);
      expect(Math.abs(out.upper - c.upper)).toBeLessThan(TOL);
      expect(out.halfWidth).toBeCloseTo((c.upper - c.lower) / 2, 9);
    }
  });

  it('defaults alpha to 0.05', () => {
    const c = { xA: 350, nA: 1000, xB: 380, nB: 1000 };
    const tau2 = optimalTau2({ baseline: 0.35, nCapPerArm: 1000 });
    expect(mixtureCs(c, { tau2 })).toEqual(mixtureCs(c, { tau2, alpha: 0.05 }));
  });

  it('brackets 0 with finite bounds when both arms have no conversions', () => {
    const tau2 = optimalTau2({ baseline: 0.35, nCapPerArm: 1000 });
    const out = mixtureCs({ xA: 0, nA: 60, xB: 0, nB: 60 }, { tau2 });
    expect(Number.isFinite(out.lower)).toBe(true);
    expect(Number.isFinite(out.upper)).toBe(true);
    expect(out.lower).toBeLessThan(0);
    expect(out.upper).toBeGreaterThan(0);
  });

  it('is finite in every field at 10 million per arm', () => {
    const tau2 = optimalTau2({ baseline: 0.35, nCapPerArm: 1000 });
    for (const [xA, xB] of [
      [0, 0],
      [3500000, 3501000],
      [1e7, 1e7],
      [0, 1e7],
    ] as const) {
      const out = mixtureCs({ xA, nA: 1e7, xB, nB: 1e7 }, { tau2 });
      for (const v of Object.values(out)) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('validates its inputs', () => {
    const c = { xA: 1, nA: 10, xB: 2, nB: 10 };
    expect(() => mixtureCs({ ...c, nA: 0 }, { tau2: 0.01 })).toThrow(/nA/);
    expect(() => mixtureCs({ ...c, xB: 11 }, { tau2: 0.01 })).toThrow(/xB/);
    expect(() => mixtureCs({ ...c, xA: -1 }, { tau2: 0.01 })).toThrow(/xA/);
    expect(() => mixtureCs(c, { tau2: 0 })).toThrow(/tau2/);
    expect(() => mixtureCs(c, { tau2: Number.NaN })).toThrow(/tau2/);
    expect(() => mixtureCs(c, { tau2: Number.POSITIVE_INFINITY })).toThrow(/tau2/);
    expect(() => mixtureCs(c, { tau2: 0.01, alpha: 1 })).toThrow(/alpha/);
  });

  it('keeps a false-positive share under 0.0745 when peeked at every 10 per arm', () => {
    const p = 0.35;
    const reps = 2000;
    const tau2 = optimalTau2({ baseline: p, nCapPerArm: 1000 });
    const rng = sfc32(11);
    let everExcluded = 0;
    for (let r = 0; r < reps; r += 1) {
      let xA = 0;
      let xB = 0;
      for (let n = 1; n <= 1000; n += 1) {
        if (rng.uniform() < p) xA += 1;
        if (rng.uniform() < p) xB += 1;
        if (n >= 50 && n % 10 === 0) {
          const { lower, upper } = mixtureCs({ xA, nA: n, xB, nB: n }, { tau2 });
          if (lower > 0 || upper < 0) {
            everExcluded += 1;
            break;
          }
        }
      }
    }
    const share = everExcluded / reps;
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThanOrEqual(0.05 + 3 * Math.sqrt((0.05 * 0.95) / reps));
  }, 60_000);
});

describe('obfConstant', () => {
  it('is the exact normal quantile for one look', () => {
    expect(obfConstant(1)).toBeCloseTo(1.96, 2);
    expect(Math.abs(obfConstant(1) - 1.96)).toBeLessThan(0.005);
  });

  it('is about 2.04 for five looks', () => {
    expect(Math.abs(obfConstant(5) - 2.04)).toBeLessThan(0.01);
  });

  it('reads index looks - 1 of the generated table, for 1 to 60', () => {
    expect(OBF_CONSTANTS).toHaveLength(60);
    for (let k = 1; k <= 60; k += 1) {
      expect(obfConstant(k)).toBe(OBF_CONSTANTS[k - 1]);
      expect(obfConstant(k)).toBe(ref.obf[String(k)]);
    }
  });

  it('rejects looks outside 1 to 60 and non-integers', () => {
    for (const looks of [0, 61, 2.5, -1, Number.NaN]) {
      expect(() => obfConstant(looks)).toThrow(RangeError);
    }
  });
});

describe('obfBoundary', () => {
  it('equals the constant at the final look and shrinks as looks accrue', () => {
    expect(obfBoundary(5, 5)).toBe(obfConstant(5));
    expect(obfBoundary(1, 5)).toBeCloseTo(obfConstant(5) * Math.sqrt(5), 12);
    for (let look = 1; look < 5; look += 1) {
      expect(obfBoundary(look, 5)).toBeGreaterThan(obfBoundary(look + 1, 5));
    }
  });

  it('validates look and looks', () => {
    expect(() => obfBoundary(0, 5)).toThrow(/look/);
    expect(() => obfBoundary(6, 5)).toThrow(/look/);
    expect(() => obfBoundary(1.5, 5)).toThrow(/look/);
    expect(() => obfBoundary(1, 61)).toThrow(RangeError);
  });
});

describe('obf-constants.generated.ts', () => {
  it('is up to date with stats-ref/reference.json', () => {
    const committed = readFileSync('src/lib/stats/obf-constants.generated.ts', 'utf8');
    expect(committed).toBe(generateObfConstants(readFileSync('stats-ref/reference.json', 'utf8')));
  });

  it('refuses a reference with a missing look', () => {
    const broken = JSON.parse(readFileSync('stats-ref/reference.json', 'utf8'));
    delete broken.obf['7'];
    expect(() => generateObfConstants(JSON.stringify(broken))).toThrow(/obf/);
  });
});
