/**
 * Two-sample proportion inference: Wilson score intervals, the Newcombe hybrid-score interval
 * for a difference, the pooled two-proportion z-test and the sample-ratio-mismatch (SRM) check.
 * Every difference is B - A (treatment minus control).
 *
 * `normalCdf` is accurate in the lower tail only, so every upper-tail or two-sided probability
 * here is written as `normalCdf(-x)`; that keeps tiny p-values free of cancellation.
 */
import { normalCdf, normalQuantile } from './normal';
import { checkAlpha, checkArm } from './validate';

/** Successes and trials for the two arms: A is the control, B is the treatment. */
export type Counts = { xA: number; nA: number; xB: number; nB: number };

/** A point estimate with its confidence limits. */
export type Interval = { estimate: number; lower: number; upper: number };

/** Below this the expected count of arm A has underflowed and chi2 is meaningless (or infinite). */
const MIN_EXPECTED_COUNT = 1e-300;

/** A threshold below which an SRM p-value flags a sample-ratio mismatch. */
const SRM_FLAG_P = 0.001;

/** The Wilson score limits for `x` successes in `n` trials, after validation. */
function wilsonLimits(x: number, n: number, alpha: number): Interval {
  // -normalQuantile(alpha / 2) is exact for tiny alpha; 1 - alpha / 2 rounds to 1 below ~2e-16.
  const z = -normalQuantile(alpha / 2);
  const p = x / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  // Floating error must not push an exact boundary (x = 0 or x = n) off 0 or 1.
  const lower = x === 0 ? 0 : Math.max(0, centre - half);
  const upper = x === n ? 1 : Math.min(1, centre + half);
  return { estimate: p, lower, upper };
}

/**
 * The Wilson score interval for a single proportion with `x` successes in `n` trials, at
 * confidence level `1 - alpha`.
 */
export function wilson(x: number, n: number, alpha = 0.05): Interval {
  checkArm(x, n, 'x', 'n');
  checkAlpha(alpha);
  return wilsonLimits(x, n, alpha);
}

/**
 * The Newcombe hybrid-score interval (method 10) for `pB - pA`, built from the two Wilson
 * intervals (lA, uA) and (lB, uB) with d = pB - pA:
 * lower = d - sqrt((pB - lB)^2 + (uA - pA)^2), upper = d + sqrt((uB - pB)^2 + (pA - lA)^2).
 */
export function newcombeDiff(c: Counts, alpha = 0.05): Interval {
  checkArm(c.xA, c.nA, 'xA', 'nA');
  checkArm(c.xB, c.nB, 'xB', 'nB');
  checkAlpha(alpha);
  const a = wilsonLimits(c.xA, c.nA, alpha);
  const b = wilsonLimits(c.xB, c.nB, alpha);
  const d = b.estimate - a.estimate;
  return {
    estimate: d,
    lower: d - Math.sqrt((b.estimate - b.lower) ** 2 + (a.upper - a.estimate) ** 2),
    upper: d + Math.sqrt((b.upper - b.estimate) ** 2 + (a.estimate - a.lower) ** 2),
  };
}

/**
 * The pooled two-sided z-test for `pB - pA`. When the pooled proportion is 0 or 1 the standard
 * error is zero and the test has nothing to say, so it returns `z = 0` and `p = 1`.
 */
export function zTestTwoProportions(c: Counts): { estimate: number; z: number; p: number } {
  checkArm(c.xA, c.nA, 'xA', 'nA');
  checkArm(c.xB, c.nB, 'xB', 'nB');
  const estimate = c.xB / c.nB - c.xA / c.nA;
  const pooled = (c.xA + c.xB) / (c.nA + c.nB);
  if (pooled === 0 || pooled === 1) return { estimate, z: 0, p: 1 };
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / c.nA + 1 / c.nB));
  const z = estimate / se;
  return { estimate, z, p: 2 * normalCdf(-Math.abs(z)) };
}

/**
 * Chi-square sample-ratio-mismatch test with one degree of freedom: observed arm sizes `nA` and
 * `nB` against an expected share `expectedShareA` (default an even split) for arm A. The p-value
 * is `2 * normalCdf(-sqrt(chi2))`, exact for one degree of freedom, and `flagged` is `p < 0.001`.
 *
 * @throws RangeError if the counts are not non-negative integers with a positive total,
 * `expectedShareA` is not in (0, 1), or the expected count of arm A (`total * share`) is below 1e-300
 * (the share is so small that the expected count underflows). The share is only ever too small
 * for arm A; an arm-B share cannot underflow because `1 - share` is at least 1.1e-16.
 */
export function srmTest(
  nA: number,
  nB: number,
  expectedShareA = 0.5,
): { chi2: number; p: number; flagged: boolean } {
  if (!Number.isInteger(nA) || nA < 0) {
    throw new RangeError(`nA must be a non-negative integer, got ${nA}`);
  }
  if (!Number.isInteger(nB) || nB < 0) {
    throw new RangeError(`nB must be a non-negative integer, got ${nB}`);
  }
  if (nA + nB === 0) throw new RangeError('nA + nB must be positive');
  if (!(expectedShareA > 0 && expectedShareA < 1)) {
    throw new RangeError(`expectedShareA must be in (0, 1), got ${expectedShareA}`);
  }
  const total = nA + nB;
  const expectedA = total * expectedShareA;
  const expectedB = total * (1 - expectedShareA);
  // Only arm A can underflow: 1 - share is at least 1.1e-16, so expectedB is never tiny.
  if (expectedA < MIN_EXPECTED_COUNT) {
    throw new RangeError(
      `expectedShareA ${expectedShareA} is too extreme for ${total} users: the expected count of arm A is below ${MIN_EXPECTED_COUNT}`,
    );
  }
  // chi2 can still be Infinity for an extreme share with huge counts; p is then 0 and flagged
  // is true, never NaN.
  const chi2 = (nA - expectedA) ** 2 / expectedA + (nB - expectedB) ** 2 / expectedB;
  const p = 2 * normalCdf(-Math.sqrt(chi2));
  return { chi2, p, flagged: p < SRM_FLAG_P };
}
