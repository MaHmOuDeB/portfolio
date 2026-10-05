/**
 * Sequential methods for the live experiment: an always-valid two-sided normal-mixture
 * confidence sequence on the difference in proportions pB - pA (safe to look at at any time),
 * and O'Brien-Fleming group-sequential boundaries. Every difference is B - A.
 */
import { OBF_CONSTANTS } from './obf-constants.generated';
import type { Counts, Interval } from './proportions';

const MAX_ITERATIONS = 200;
const RELATIVE_TOLERANCE = 1e-15;
const MAX_LOOKS = OBF_CONSTANTS.length;

function checkAlpha(alpha: number): void {
  if (!(alpha > 0 && alpha < 1)) throw new RangeError(`alpha must be in (0, 1), got ${alpha}`);
}

function checkArm(x: number, n: number, xName: string, nName: string): void {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`${nName} must be a positive integer, got ${n}`);
  }
  if (!Number.isInteger(x) || x < 0 || x > n) {
    throw new RangeError(`${xName} must be an integer in [0, ${nName}] (${nName} = ${n}), got ${x}`);
  }
}

/**
 * The ratio r* = tau^2 / V that makes the mixture confidence sequence tightest at the target
 * variance V: the root of r = 2 ln(1/alpha) + ln(1 + r), which is the stationarity condition of
 * (1 + 1/r)(2 ln(1/alpha) + ln(1 + r)). About 8.212 at alpha = 0.05.
 */
export function mixtureRatio(alpha: number): number {
  checkAlpha(alpha);
  const base = 2 * Math.log(1 / alpha);
  let r = base;
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const next = base + Math.log(1 + r);
    const converged = Math.abs(next - r) <= RELATIVE_TOLERANCE * next;
    r = next;
    if (converged) return r;
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

/**
 * The two-sided normal-mixture confidence sequence at level 1 - alpha for pB - pA. The variance
 * V = pA(1-pA)/nA + pB(1-pB)/nB uses p = (x + 0.5) / (n + 1), a floor that keeps V positive when
 * an arm has no conversions (or all of them). The half-width is
 * sqrt(V (V + tau2) / tau2 * (2 ln(1/alpha) + ln((V + tau2) / V))).
 */
export function mixtureCs(
  c: Counts,
  o: { tau2: number; alpha?: number },
): Interval & { halfWidth: number } {
  const { tau2, alpha = 0.05 } = o;
  checkArm(c.xA, c.nA, 'xA', 'nA');
  checkArm(c.xB, c.nB, 'xB', 'nB');
  if (!(Number.isFinite(tau2) && tau2 > 0)) {
    throw new RangeError(`tau2 must be finite and positive, got ${tau2}`);
  }
  checkAlpha(alpha);
  const pA = (c.xA + 0.5) / (c.nA + 1);
  const pB = (c.xB + 0.5) / (c.nB + 1);
  const v = (pA * (1 - pA)) / c.nA + (pB * (1 - pB)) / c.nB;
  const halfWidth = Math.sqrt(
    ((v * (v + tau2)) / tau2) * (2 * Math.log(1 / alpha) + Math.log((v + tau2) / v)),
  );
  const estimate = c.xB / c.nB - c.xA / c.nA;
  return { estimate, lower: estimate - halfWidth, upper: estimate + halfWidth, halfWidth };
}

/**
 * The O'Brien-Fleming constant c_K for `looks` equally spaced looks (1 to 60), so that the
 * boundary at look k is c_K * sqrt(K / k). The constants are Monte Carlo estimates accurate to
 * about 1e-3 (K = 1 is exact), generated from `stats-ref/reference.json`.
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
