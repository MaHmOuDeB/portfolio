/**
 * The engine behind the Lab's peeking demo: many simulated A/A tests (both arms share the same
 * conversion rate, so every "winner" is a false positive) are checked at several looks, and the
 * share that a method wrongly declares a winner at some look is counted. Draws are exact
 * binomials from the seeded sfc32 stream, so a seed always reproduces a result.
 */
import { zTestTwoProportions, type Counts } from './proportions';
import { sfc32, type Rng } from './rng';
import { mixtureCs, obfBoundary, optimalTau2 } from './sequential';
import { checkAlpha } from './validate';

export type PeekMethod = 'naive' | 'obf' | 'cs';
export type PeekInput = {
  seed: number;
  runs: number;
  looks: number;
  nPerLook: number;
  p: number;
  alpha?: number;
  method: PeekMethod;
};
export type PeekResult = {
  seed: number;
  runs: number;
  looks: number;
  method: PeekMethod;
  falsePositiveRate: number;
  mcStdError: number;
  /** The share of runs flagged at or before each look; `cumulativeByLook[k - 1]` is look k. */
  cumulativeByLook: number[];
};

/** The O'Brien-Fleming table covers 1 to 60 looks; the limit applies to every method. */
const MAX_LOOKS = 60;
const METHODS: readonly PeekMethod[] = ['naive', 'obf', 'cs'];

/**
 * Exactly `binomial(rng, n, p)`, the successes in `n` Bernoulli(p) trials, for `threshold = p * 2^32`.
 * `rng.uniform() < p` is `rng.next() / 2^32 < p`, and scaling by a power of two is exact, so
 * comparing the raw integer with the threshold gives identical draws from the same stream while
 * skipping a division and a call in the innermost loop. `n` and `p` are validated by the caller.
 */
function draw(rng: Rng, n: number, threshold: number): number {
  let successes = 0;
  for (let t = 0; t < n; t += 1) if (rng.next() < threshold) successes += 1;
  return successes;
}

function validate(i: PeekInput, alpha: number): void {
  if (!Number.isInteger(i.runs) || i.runs < 1) {
    throw new RangeError(`runs must be a positive integer, got ${i.runs}`);
  }
  if (!Number.isInteger(i.looks) || i.looks < 1 || i.looks > MAX_LOOKS) {
    throw new RangeError(`looks must be an integer in [1, ${MAX_LOOKS}], got ${i.looks}`);
  }
  if (!Number.isInteger(i.nPerLook) || i.nPerLook < 1) {
    throw new RangeError(`nPerLook must be a positive integer, got ${i.nPerLook}`);
  }
  if (!(i.p > 0 && i.p < 1)) throw new RangeError(`p must be in (0, 1), got ${i.p}`);
  if (!Number.isInteger(i.seed)) throw new RangeError(`seed must be a finite integer, got ${i.seed}`);
  if (!METHODS.includes(i.method)) {
    throw new RangeError(`method must be one of ${METHODS.join(', ')}, got ${String(i.method)}`);
  }
  try {
    checkAlpha(alpha);
  } catch {
    throw new RangeError(`alpha must be in (0, 1), got ${alpha}`);
  }
}

/**
 * Simulates `runs` A/A tests of `looks` looks each. At look k each arm has gained
 * `binomial(nPerLook, p)` conversions, so both arms hold `k * nPerLook` observations. A run is
 * a false positive at the first look where the method's criterion is met: `naive` when the
 * pooled z-test gives p < alpha, `obf` when |z| reaches `obfBoundary(k, looks)`, and `cs` when
 * the mixture confidence sequence (tuned for `looks * nPerLook` per arm) excludes 0.
 *
 * Once flagged a run stays flagged: it draws no more, and `cumulativeByLook` still counts it from
 * its flagged look onward. That leaves the distribution of the first flag unchanged. The hot
 * loop reuses one counts object and one flag tally, so it allocates nothing of its own.
 */
export function simulatePeeking(i: PeekInput): PeekResult {
  const alpha = i.alpha ?? 0.05;
  validate(i, alpha);
  const { seed, runs, looks, nPerLook, p, method } = i;

  const rng = sfc32(seed);
  const threshold = p * 4294967296;
  const tau2 = method === 'cs' ? optimalTau2({ baseline: p, nCapPerArm: looks * nPerLook, alpha }) : 0;
  const boundary = new Float64Array(looks);
  if (method === 'obf') for (let k = 1; k <= looks; k += 1) boundary[k - 1] = obfBoundary(k, looks);

  const counts: Counts = { xA: 0, nA: 0, xB: 0, nB: 0 };
  /** How many runs were first flagged at each look. */
  const firstFlags = new Float64Array(looks);

  for (let run = 0; run < runs; run += 1) {
    counts.xA = 0;
    counts.xB = 0;
    for (let k = 1; k <= looks; k += 1) {
      counts.xA += draw(rng, nPerLook, threshold);
      counts.xB += draw(rng, nPerLook, threshold);
      counts.nA = k * nPerLook;
      counts.nB = counts.nA;
      let flagged: boolean;
      if (method === 'naive') {
        flagged = zTestTwoProportions(counts).p < alpha;
      } else if (method === 'obf') {
        flagged = Math.abs(zTestTwoProportions(counts).z) >= (boundary[k - 1] as number);
      } else {
        const cs = mixtureCs(counts, { tau2, alpha });
        flagged = cs.lower > 0 || cs.upper < 0;
      }
      if (flagged) {
        firstFlags[k - 1] = (firstFlags[k - 1] as number) + 1;
        break;
      }
    }
  }

  const cumulativeByLook: number[] = [];
  let flaggedSoFar = 0;
  for (let k = 0; k < looks; k += 1) {
    flaggedSoFar += firstFlags[k] as number;
    cumulativeByLook.push(flaggedSoFar / runs);
  }
  const falsePositiveRate = flaggedSoFar / runs;
  const mcStdError = Math.sqrt((falsePositiveRate * (1 - falsePositiveRate)) / runs);
  return { seed, runs, looks, method, falsePositiveRate, mcStdError, cumulativeByLook };
}
