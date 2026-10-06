/**
 * Sequential methods for the live experiment: an always-valid two-sided normal-mixture
 * confidence sequence on the difference in proportions pB - pA (safe to look at at any time),
 * and O'Brien-Fleming group-sequential boundaries. Every difference is B - A.
 */
import { OBF_CONSTANTS } from './obf-constants.generated';
import type { Counts, Interval } from './proportions';
import { checkAlpha, checkArm } from './validate';

const MAX_ITERATIONS = 200;
const RELATIVE_TOLERANCE = 1e-15;
/** Counts beyond 2^50 lose the precision `(n + 0.5) / (n + 1)` needs (at 2^52 it rounds to 1). */
const MAX_COUNT = 2 ** 50;
const MAX_LOOKS = OBF_CONSTANTS.length;
/**
 * The smallest alpha `mixtureRatio` accepts. 1 / alpha only overflows below about 5.6e-309; the
 * floor is a deliberate safety margin far above that.
 */
const MIN_ALPHA = 1e-300;

/**
 * The ratio r* = tau^2 / V that makes the mixture confidence sequence tightest at the target
 * variance V: the root of r = c + log1p(r) with c = -2 ln(alpha), which is the stationarity
 * condition of (1 + 1/r)(c + ln(1 + r)). About 8.212 at alpha = 0.05.
 *
 * g(r) = r - c - log1p(r) is increasing and convex for r > 0 and positive at the start
 * r0 = c + sqrt(2c), so Newton's method falls monotonically onto the root in a handful of steps
 * for every alpha in (0, 1). Near the root rounding can make a step non-positive: that is the
 * floor of double precision, so the iteration stops there. `c` is written `-2 ln(alpha)`, not
 * `2 ln(1 / alpha)`, so that no rounding of 1 / alpha enters near alpha = 1.
 *
 * @throws RangeError if `alpha` is not in (0, 1) or is below 1e-300. 1 / alpha only overflows
 * below about 5.6e-309; 1e-300 is a deliberate safety margin, and a confidence sequence at such
 * an alpha is of no practical use anyway.
 */
export function mixtureRatio(alpha: number): number {
  checkAlpha(alpha);
  if (alpha < MIN_ALPHA) throw new RangeError(`alpha must be at least ${MIN_ALPHA}, got ${alpha}`);
  const c = -2 * Math.log(alpha);
  let r = c + Math.sqrt(2 * c);
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    // g'(r) = 1 - 1 / (1 + r), written r / (1 + r) so it keeps full precision for tiny r.
    const step = (r - c - Math.log1p(r)) / (r / (1 + r));
    if (!(step > 0)) return r;
    r -= step;
    if (step <= RELATIVE_TOLERANCE * r) return r;
  }
  throw new Error(`mixtureRatio did not converge for alpha = ${alpha}`);
}

/**
 * The mixture variance tau^2 tuned to be tightest when each arm reaches `nCapPerArm` at the
 * `baseline` conversion rate: r*(alpha) * 2 p (1 - p) / nCapPerArm.
 */
export function optimalTau2(o: { baseline: number; nCapPerArm: number; alpha?: number }): number {
  const { baseline, nCapPerArm, alpha = 0.05 } = o;
  if (!(baseline > 0 && baseline < 1)) {
    throw new RangeError(`baseline must be in (0, 1), got ${baseline}`);
  }
  if (!(Number.isFinite(nCapPerArm) && nCapPerArm >= 1)) {
    throw new RangeError(`nCapPerArm must be finite and at least 1, got ${nCapPerArm}`);
  }
  return (mixtureRatio(alpha) * 2 * baseline * (1 - baseline)) / nCapPerArm;
}

function checkCountSize(n: number, name: string): void {
  if (n > MAX_COUNT) throw new RangeError(`${name} must be at most 2^50, got ${n}`);
}

/** The floored plug-in variance p(1 - p) / n with p = (x + 0.5) / (n + 1). */
function armVariance(x: number, n: number): number {
  return (((x + 0.5) / (n + 1)) * ((n - x + 0.5) / (n + 1))) / n;
}

/**
 * The two-sided normal-mixture confidence sequence at level 1 - alpha for pB - pA. The variance
 * V = pA(1-pA)/nA + pB(1-pB)/nB uses p = (x + 0.5) / (n + 1), a floor that keeps V positive when
 * an arm has no conversions (or all of them). The half-width is
 * sqrt(V (V + tau2) / tau2 * (2 ln(1/alpha) + ln((V + tau2) / V))), evaluated as
 * V (1 + V / tau2) (2 ln(1/alpha) + log1p(tau2 / V)), which neither overflows for a huge tau2 (the
 * log term then falls back to ln(tau2) - ln(V)) nor cancels for a tiny one. Counts must be at most 2^50.
 */
export function mixtureCs(
  c: Counts,
  o: { tau2: number; alpha?: number },
): Interval & { halfWidth: number } {
  const { tau2, alpha = 0.05 } = o;
  checkArm(c.xA, c.nA, 'xA', 'nA');
  checkArm(c.xB, c.nB, 'xB', 'nB');
  checkCountSize(c.nA, 'nA');
  checkCountSize(c.nB, 'nB');
  if (!(Number.isFinite(tau2) && tau2 > 0)) {
    throw new RangeError(`tau2 must be finite and positive, got ${tau2}`);
  }
  checkAlpha(alpha);
  // Each arm's p(1 - p) is built from (x + 0.5) and (n - x + 0.5), so no 1 - p cancels.
  const v = armVariance(c.xA, c.nA) + armVariance(c.xB, c.nB);
  // log1p(tau2 / v) overflows when the ratio does; there it equals log(tau2) - log(v) to rounding.
  const ratio = tau2 / v;
  const logRatio = Number.isFinite(ratio) ? Math.log1p(ratio) : Math.log(tau2) - Math.log(v);
  const halfWidth = Math.sqrt(v * (1 + v / tau2) * (-2 * Math.log(alpha) + logRatio));
  const estimate = c.xB / c.nB - c.xA / c.nA;
  return { estimate, lower: estimate - halfWidth, upper: estimate + halfWidth, halfWidth };
}

/**
 * The O'Brien-Fleming constant c_K for `looks` equally spaced looks (1 to 60), so that the
 * boundary at look k is c_K * sqrt(K / k). The table is generated from `stats-ref/reference.json`
 * and its values for K >= 2 are Monte Carlo estimates accurate to about 3e-3 (largest error 2.3e-3
 * at K = 2); K = 1 is exact. Exact values come from recursive numerical integration (for example
 * K = 2: 1.97743, K = 5: 2.04007, K = 10: 2.08650, K = 20: 2.12565); an exact table is a
 * documented follow-up.
 */
export function obfConstant(looks: number): number {
  if (!Number.isInteger(looks) || looks < 1 || looks > MAX_LOOKS) {
    throw new RangeError(`looks must be an integer in [1, ${MAX_LOOKS}], got ${looks}`);
  }
  return OBF_CONSTANTS[looks - 1] as number;
}

/** The two-sided |z| boundary at look `look` of `looks`: obfConstant(looks) * sqrt(looks / look). */
export function obfBoundary(look: number, looks: number): number {
  const constant = obfConstant(looks);
  if (!Number.isInteger(look) || look < 1 || look > looks) {
    throw new RangeError(`look must be an integer in [1, ${looks}], got ${look}`);
  }
  return constant * Math.sqrt(looks / look);
}
