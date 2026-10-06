/**
 * Power planning for a two-arm conversion test: sample size per arm, the smallest effect a given
 * sample can detect, and the test duration. Two-sided test, equal allocation, Cohen's h
 * (the arcsine-square-root effect size), so the formulas are closed form and need no iteration.
 */
import { normalQuantile } from './normal';

/** Whether the minimum detectable effect is a difference in rates or a ratio to the baseline. */
export type MdeType = 'absolute' | 'relative';

/** Inputs for a sample-size plan. Rates are proportions in (0, 1). */
export type PlanInput = {
  baseline: number;
  mde: number;
  mdeType: MdeType;
  alpha: number;
  power: number;
};

/** The sample-size formula as shown next to the planner. */
export const SAMPLE_SIZE_FORMULA =
  'n per group = 2 · ((z₁₋α/₂ + z₁₋β) / h)², h = 2·asin√p₂ − 2·asin√p₁, rounded up';

/** Cohen's h for two proportions: 2·asin(√p2) − 2·asin(√p1). Positive when p2 > p1. */
export function cohensH(p1: number, p2: number): number {
  return 2 * Math.asin(Math.sqrt(p2)) - 2 * Math.asin(Math.sqrt(p1));
}

function checkRate(value: number, name: string): void {
  if (!(value > 0 && value < 1)) throw new RangeError(`${name} must be in (0, 1), got ${value}`);
}

function checkAlphaPower(alpha: number, power: number): void {
  checkRate(alpha, 'alpha');
  if (!(power > alpha && power < 1)) {
    throw new RangeError(`power must be in (alpha, 1) (alpha = ${alpha}), got ${power}`);
  }
}

/**
 * Visitors needed in each arm: `ceil(2·((z₁₋α/₂ + z₁₋β) / h)²)`, where h is Cohen's h between the
 * baseline `p1` and `p2 = baseline + mde` (absolute) or `baseline·(1 + mde)` (relative). The sign
 * of the effect does not matter, only its size. The plain `Math.ceil` of the double result is
 * used on purpose: it is accurate to about 1e-15 here, far below any real fractional part.
 *
 * Note on low power: this closed form is the standard planning formula, and for a power close to
 * alpha it overstates n compared with an exact solver (statsmodels `NormalIndPower` gives 73.4
 * against 79.3 here at power 0.1, baseline 0.29, mde +0.05). The reference cases only cover
 * power >= 0.7, where the two agree to the rounded integer.
 *
 * @throws RangeError if `baseline`, `alpha` or `power` is out of range, `mdeType` is not one of
 * the two literals, `mde` is 0 or so small that `p2 === baseline` (a zero effect needs infinite
 * n), `p2` falls outside (0, 1), or the result would exceed `Number.MAX_SAFE_INTEGER`.
 */
export function sampleSizePerArm(i: PlanInput): number {
  checkRate(i.baseline, 'baseline');
  checkAlphaPower(i.alpha, i.power);
  if (i.mdeType !== 'absolute' && i.mdeType !== 'relative') {
    throw new RangeError(`mdeType must be 'absolute' or 'relative', got ${String(i.mdeType)}`);
  }
  if (!Number.isFinite(i.mde) || i.mde === 0) {
    throw new RangeError(`mde must be a finite, non-zero number, got ${i.mde}`);
  }
  const p2 = i.mdeType === 'absolute' ? i.baseline + i.mde : i.baseline * (1 + i.mde);
  if (!(p2 > 0 && p2 < 1)) {
    throw new RangeError(
      `mde ${i.mde} (${i.mdeType}) puts the treatment rate at ${p2}, which must be in (0, 1)`,
    );
  }
  if (p2 === i.baseline) {
    throw new RangeError(
      `mde ${i.mde} (${i.mdeType}) is too small to change the baseline ${i.baseline}: the effect is zero`,
    );
  }
  const zAlpha = -normalQuantile(i.alpha / 2);
  const zPower = normalQuantile(i.power);
  const h = Math.abs(cohensH(i.baseline, p2));
  const n = Math.ceil(2 * ((zAlpha + zPower) / h) ** 2);
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(
      `mde ${i.mde} (${i.mdeType}) is too small: it needs more visitors per arm than a safe integer (${Number.MAX_SAFE_INTEGER})`,
    );
  }
  return n;
}

/**
 * The smallest absolute rise over `baseline` that `nPerArm` visitors per arm detect with the
 * given power: `h = (z₁₋α/₂ + z₁₋β)·√(2/n)`, `p2 = sin²(asin(√baseline) + h/2)`, result `p2 − baseline`.
 *
 * Returns `Infinity` when the sample is so small that no rise up to 100% is detectable, that is
 * when `asin(√baseline) + h/2 ≥ π/2` (the angle formula would otherwise wrap around and return a
 * wrong, smaller effect).
 *
 * @throws RangeError if `nPerArm` is not finite or below 1, or `baseline`, `alpha` or `power` is
 * out of range.
 */
export function detectableEffect(o: {
  nPerArm: number;
  baseline: number;
  alpha: number;
  power: number;
}): number {
  if (!Number.isFinite(o.nPerArm) || o.nPerArm < 1) {
    throw new RangeError(`nPerArm must be a finite number of at least 1, got ${o.nPerArm}`);
  }
  checkRate(o.baseline, 'baseline');
  checkAlphaPower(o.alpha, o.power);
  const zAlpha = -normalQuantile(o.alpha / 2);
  const zPower = normalQuantile(o.power);
  const h = (zAlpha + zPower) * Math.sqrt(2 / o.nPerArm);
  const angle = Math.asin(Math.sqrt(o.baseline)) + h / 2;
  if (angle >= Math.PI / 2) return Number.POSITIVE_INFINITY;
  return Math.sin(angle) ** 2 - o.baseline;
}

/**
 * Weeks to reach `nPerArm` visitors in both arms when `entryViewsPerDay` visitors enter the test
 * per day in total: `ceil(2·nPerArm / entryViewsPerDay / 7)`, at least 1. A tolerance of 1e-9
 * weeks is subtracted before rounding up so that floating-point error with a fractional rate does
 * not add a spurious week (343 per arm at 0.7 per day is exactly 140 weeks).
 *
 * @throws RangeError if `nPerArm` is not finite or below 1, or `entryViewsPerDay` is not finite
 * or not positive.
 */
export function durationWeeks(o: { nPerArm: number; entryViewsPerDay: number }): number {
  if (!Number.isFinite(o.nPerArm) || o.nPerArm < 1) {
    throw new RangeError(`nPerArm must be a finite number of at least 1, got ${o.nPerArm}`);
  }
  if (!Number.isFinite(o.entryViewsPerDay) || o.entryViewsPerDay <= 0) {
    throw new RangeError(
      `entryViewsPerDay must be a finite number above 0, got ${o.entryViewsPerDay}`,
    );
  }
  return Math.max(1, Math.ceil((2 * o.nPerArm) / o.entryViewsPerDay / 7 - 1e-9));
}
