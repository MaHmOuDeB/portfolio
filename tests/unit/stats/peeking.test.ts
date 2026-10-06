import { simulatePeeking, type PeekInput, type PeekMethod } from '@/lib/stats/peeking';
import { zTestTwoProportions } from '@/lib/stats/proportions';
import { binomial, sfc32 } from '@/lib/stats/rng';
import * as sequential from '@/lib/stats/sequential';
import { mixtureCs, obfBoundary, optimalTau2 } from '@/lib/stats/sequential';
import { ref } from './reference';

/**
 * Runs per simulation-agreement case (ruling 30: the whole block took about 19 s at 20,000 runs,
 * under the 20 s limit, so it keeps 20,000) and per anchor case. Tolerances come from the
 * standard errors, so they hold for either count.
 */
const AGREEMENT_RUNS = 20_000;
const ANCHOR_RUNS = 10_000;
const SIM_TIMEOUT = 60_000;
const ALPHA = 0.05;

const base: PeekInput = { seed: 3, runs: 200, looks: 5, nPerLook: 50, p: 0.35, method: 'naive' };

describe('simulatePeeking agreement with the reference', () => {
  for (const c of ref.peeking) {
    it(
      `${c.method} at ${c.looks} look(s) matches the reference (${c.fpr})`,
      () => {
        const r = simulatePeeking({
          seed: 3,
          runs: AGREEMENT_RUNS,
          looks: c.looks,
          nPerLook: c.nPerLook,
          p: c.p,
          method: c.method,
        });
        const tol = 3 * Math.sqrt(r.mcStdError ** 2 + c.se ** 2);
        expect(Math.abs(r.falsePositiveRate - c.fpr)).toBeLessThanOrEqual(tol);
      },
      SIM_TIMEOUT,
    );
  }
});

describe('simulatePeeking anchors', () => {
  const anchors: [number, number, number][] = [
    [10, 0.17, 0.21],
    [20, 0.23, 0.27],
    [50, 0.3, 0.34],
  ];
  for (const [looks, lo, hi] of anchors) {
    it(
      `naive peeking at ${looks} looks wrongly declares a winner in [${lo}, ${hi}]`,
      () => {
        const r = simulatePeeking({ seed: 3, runs: ANCHOR_RUNS, looks, nPerLook: 100, p: 0.35, method: 'naive' });
        expect(r.falsePositiveRate).toBeGreaterThanOrEqual(lo);
        expect(r.falsePositiveRate).toBeLessThanOrEqual(hi);
      },
      SIM_TIMEOUT,
    );
  }

  it(
    'a single look gives a naive rate within 3 standard errors of alpha',
    () => {
      const r = simulatePeeking({ seed: 3, runs: ANCHOR_RUNS, looks: 1, nPerLook: 100, p: 0.35, method: 'naive' });
      expect(Math.abs(r.falsePositiveRate - ALPHA)).toBeLessThanOrEqual(3 * r.mcStdError);
    },
    SIM_TIMEOUT,
  );

  it(
    'O Brien-Fleming boundaries at 20 looks hold the overall rate near alpha, not below it and not above it',
    () => {
      const r = simulatePeeking({ seed: 3, runs: ANCHOR_RUNS, looks: 20, nPerLook: 100, p: 0.35, method: 'obf' });
      expect(r.falsePositiveRate).toBeGreaterThanOrEqual(0.04);
      expect(r.falsePositiveRate).toBeLessThanOrEqual(ALPHA + 3 * r.mcStdError);
    },
    SIM_TIMEOUT,
  );

  it(
    'O Brien-Fleming boundaries at 5 looks also hold the overall rate near alpha',
    () => {
      const r = simulatePeeking({ seed: 3, runs: ANCHOR_RUNS, looks: 5, nPerLook: 100, p: 0.35, method: 'obf' });
      expect(r.falsePositiveRate).toBeGreaterThanOrEqual(0.04);
      expect(r.falsePositiveRate).toBeLessThanOrEqual(ALPHA + 3 * r.mcStdError);
    },
    SIM_TIMEOUT,
  );

  it(
    'the confidence sequence stays well below alpha but is not identically zero',
    () => {
      const r = simulatePeeking({ seed: 3, runs: ANCHOR_RUNS, looks: 20, nPerLook: 100, p: 0.35, method: 'cs' });
      expect(r.falsePositiveRate).toBeGreaterThan(0);
      expect(r.falsePositiveRate).toBeLessThanOrEqual(ALPHA + 3 * r.mcStdError);
    },
    SIM_TIMEOUT,
  );
});

describe('simulatePeeking output', () => {
  for (const method of ['naive', 'obf', 'cs'] as PeekMethod[]) {
    it(`${method}: cumulativeByLook is non-decreasing and ends at the rate`, () => {
      const r = simulatePeeking({ ...base, method, runs: 500, looks: 8 });
      expect(r.cumulativeByLook).toHaveLength(8);
      for (let k = 1; k < r.cumulativeByLook.length; k += 1) {
        expect(r.cumulativeByLook[k]).toBeGreaterThanOrEqual(r.cumulativeByLook[k - 1] as number);
      }
      expect(r.cumulativeByLook[7]).toBe(r.falsePositiveRate);
      expect(r.falsePositiveRate).toBeGreaterThanOrEqual(0);
      expect(r.falsePositiveRate).toBeLessThanOrEqual(1);
    });
  }

  it('echoes the inputs and computes the Monte Carlo standard error', () => {
    const r = simulatePeeking({ ...base, runs: 400 });
    expect(r.seed).toBe(base.seed);
    expect(r.runs).toBe(400);
    expect(r.looks).toBe(base.looks);
    expect(r.method).toBe('naive');
    const f = r.falsePositiveRate;
    expect(r.mcStdError).toBeCloseTo(Math.sqrt((f * (1 - f)) / 400), 15);
  });

  it('uses alpha = 0.05 by default and honours an explicit alpha', () => {
    const a = simulatePeeking({ ...base, runs: 2000, looks: 3 });
    expect(simulatePeeking({ ...base, runs: 2000, looks: 3, alpha: 0.05 })).toEqual(a);
    const strict = simulatePeeking({ ...base, runs: 2000, looks: 3, alpha: 0.001 });
    expect(strict.falsePositiveRate).toBeLessThan(a.falsePositiveRate);
  });

  it('is deterministic for a seed and differs across seeds', () => {
    const a = simulatePeeking(base);
    expect(simulatePeeking({ ...base })).toEqual(a);
    expect(simulatePeeking({ ...base, seed: 1 })).not.toEqual(simulatePeeking({ ...base, seed: 2 }));
  });

  it('a flagged run stays counted at every later look', () => {
    // alpha near 1 flags almost every run at look 1, so every later look is at least as high.
    const r = simulatePeeking({ ...base, alpha: 0.999, runs: 300, looks: 4 });
    expect(r.cumulativeByLook[0]).toBeGreaterThan(0.9);
    expect(r.cumulativeByLook[3]).toBeGreaterThanOrEqual(r.cumulativeByLook[0] as number);
  });

  for (const method of ['naive', 'obf', 'cs'] as PeekMethod[]) {
    it(`${method}: draws the same binomial stream as binomial() on the same seed`, () => {
      const [runs, looks, nPerLook, p, seed] = [400, 3, 40, 0.35, 11] as const;
      const tau2 = optimalTau2({ baseline: p, nCapPerArm: looks * nPerLook, alpha: ALPHA });
      const rng = sfc32(seed);
      const firstFlag = new Array<number>(looks).fill(0);
      for (let run = 0; run < runs; run += 1) {
        let xA = 0;
        let xB = 0;
        for (let k = 1; k <= looks; k += 1) {
          xA += binomial(rng, nPerLook, p);
          xB += binomial(rng, nPerLook, p);
          const counts = { xA, nA: k * nPerLook, xB, nB: k * nPerLook };
          let flagged: boolean;
          if (method === 'naive') flagged = zTestTwoProportions(counts).p < ALPHA;
          else if (method === 'obf') flagged = Math.abs(zTestTwoProportions(counts).z) >= obfBoundary(k, looks);
          else {
            const cs = mixtureCs(counts, { tau2, alpha: ALPHA });
            flagged = cs.lower > 0 || cs.upper < 0;
          }
          if (flagged) {
            firstFlag[k - 1] = (firstFlag[k - 1] as number) + 1;
            break;
          }
        }
      }
      const expected = firstFlag.reduce<number[]>((acc, f) => [...acc, (acc.at(-1) ?? 0) + f], []);
      const r = simulatePeeking({ seed, runs, looks, nPerLook, p, method });
      expect(r.cumulativeByLook).toEqual(expected.map((e) => e / runs));
      expect(r.cumulativeByLook.at(-1)).toBeGreaterThan(0);
    });
  }

  describe('confidence-sequence tuning', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('tunes tau2 for the whole test: baseline p and a cap of looks * nPerLook per arm', () => {
      const spy = vi.spyOn(sequential, 'optimalTau2');
      simulatePeeking({ seed: 3, runs: 5, looks: 7, nPerLook: 30, p: 0.4, alpha: 0.1, method: 'cs' });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({ baseline: 0.4, nCapPerArm: 7 * 30, alpha: 0.1 });
    });
  });

  describe.each(['naive', 'obf', 'cs'] as PeekMethod[])('speed (%s)', (method) => {
    it('runs 1,000 runs of 20 looks quickly', () => {
      const limit = process.env.CI ? 600 : 200;
      simulatePeeking({ seed: 9, runs: 50, looks: 20, nPerLook: 100, p: 0.35, method });
      const t0 = performance.now();
      simulatePeeking({ seed: 3, runs: 1000, looks: 20, nPerLook: 100, p: 0.35, method });
      expect(performance.now() - t0).toBeLessThan(limit);
    });
  });
});

describe('simulatePeeking validation', () => {
  const bad: [string, Partial<PeekInput>][] = [
    ['runs', { runs: 0 }],
    ['runs', { runs: 1.5 }],
    ['runs', { runs: Number.NaN }],
    ['runs', { runs: 1_000_001 }],
    ['looks', { looks: 0 }],
    ['looks', { looks: 61 }],
    ['looks', { looks: 2.5 }],
    ['nPerLook', { nPerLook: 0 }],
    ['nPerLook', { nPerLook: 10.5 }],
    ['nPerLook', { nPerLook: 100_001 }],
    ['nPerLook', { nPerLook: 100_001, method: 'cs' }],
    ['p', { p: 0 }],
    ['p', { p: 1 }],
    ['p', { p: Number.NaN }],
    ['alpha', { alpha: 0 }],
    ['alpha', { alpha: 1 }],
    ['seed', { seed: Number.NaN }],
    ['seed', { seed: 1.5 }],
    ['seed', { seed: Number.POSITIVE_INFINITY }],
    ['method', { method: 'bayes' as PeekMethod }],
  ];
  for (const [name, patch] of bad) {
    it(`rejects an invalid ${name} (${JSON.stringify(patch)}) naming the parameter`, () => {
      expect(() => simulatePeeking({ ...base, ...patch })).toThrow(RangeError);
      expect(() => simulatePeeking({ ...base, ...patch })).toThrow(new RegExp(`^${name} must`));
    });
  }

  it('accepts runs = 1,000,000 and nPerLook = 100,000 exactly', () => {
    expect(simulatePeeking({ ...base, runs: 1_000_000, looks: 1, nPerLook: 1 }).runs).toBe(1_000_000);
    expect(simulatePeeking({ ...base, runs: 1, looks: 1, nPerLook: 100_000, method: 'cs' }).cumulativeByLook).toHaveLength(1);
  });

  it('accepts the boundary values looks = 1 and looks = 60', () => {
    expect(simulatePeeking({ ...base, runs: 5, looks: 1 }).cumulativeByLook).toHaveLength(1);
    expect(simulatePeeking({ ...base, runs: 2, looks: 60, nPerLook: 5 }).cumulativeByLook).toHaveLength(60);
  });
});
