/**
 * Retrodesign analysis (Gelman and Carlin, 2014): given the true effect and the standard error of
 * the estimate, how often does a statistically significant result have the wrong sign (Type S
 * error), and by how much does it overstate the effect on average (exaggeration, or Type M)?
 */
import { normalCdf, normalPdf, normalQuantile } from "./normal";

export type RetrodesignInput = {
  /** True effect size, in the same units as `se`. Must be finite and non-zero. */
  trueEffect: number;
  /** Standard error of the estimate. Must be finite and positive. */
  se: number;
  /** Two-sided significance level, in (0, 1). Defaults to 0.05. */
  alpha?: number;
};

export type RetrodesignResult = {
  /** P(|estimate| > critical value): the chance of a significant result. */
  power: number;
  /** Share of significant results whose sign is opposite to the true effect, in [0, 0.5]. */
  typeS: number;
  /** E[|estimate| given significance] / |trueEffect|, at least 1. */
  exaggeration: number;
};

/**
 * Power, Type S error rate and exaggeration ratio of a two-sided z-test on an estimate
 * `X ~ N(trueEffect, se^2)`.
 *
 * By symmetry the true effect is taken as positive, `d = |trueEffect|`, and everything is written
 * in units of the standard error: `r = d / se`, `z = -normalQuantile(alpha / 2)` (the cut-off is
 * `z` standard errors) and the arguments `a = r - z` and `b = -(r + z)`, computed directly so that
 * no `z * se` product can overflow:
 *
 * - `power = P(X > z se) + P(X < -z se) = Phi(a) + Phi(b)`;
 * - `typeS = P(X < -z se) / power = Phi(b) / power`, the wrong-sign tail over the total;
 * - `exaggeration = E[|X|; |X| > z se] / (power * d)`, where
 *   `E[|X|; |X| > z se] / se = r (Phi(a) - Phi(b)) + phi(a) + phi(b)`.
 *
 * Accuracy. `normalCdf` is accurate in the lower tail, so the wrong-sign term `Phi(b)` (always a
 * lower-tail value) keeps full relative precision and `typeS` stays accurate in relative terms
 * even when astronomically small. The right-tail term `Phi(a)` is an upper-tail probability once
 * `a > 0` and is accurate in absolute terms only, which is all `power` and `exaggeration` need.
 *
 * Limits. `typeS` underflows to 0 once `z + d / se` exceeds about 38 (the lower tail of the
 * normal distribution itself underflows there), and `exaggeration` overflows to Infinity when
 * `d / se` falls below about 1e-308 (the ratio of a finite truncated mean to a vanishing `d`).
 * When `d / se` itself overflows to Infinity the limit values are returned (power 1, typeS 0,
 * exaggeration 1) instead of NaN.
 *
 * @throws RangeError if `trueEffect` is not finite and non-zero (the ratio is undefined at 0),
 * `se` is not finite and positive, or `alpha` is not in (0, 1).
 */
export function retrodesign(o: RetrodesignInput): RetrodesignResult {
  const { trueEffect, se } = o;
  const alpha = o.alpha ?? 0.05;
  if (!Number.isFinite(trueEffect) || trueEffect === 0) {
    throw new RangeError(
      `retrodesign: trueEffect must be finite and non-zero, got ${trueEffect}`,
    );
  }
  if (!Number.isFinite(se) || se <= 0) {
    throw new RangeError(`retrodesign: se must be finite and > 0, got ${se}`);
  }
  if (!(alpha > 0 && alpha < 1)) {
    throw new RangeError(`retrodesign: alpha must be in (0, 1), got ${alpha}`);
  }

  const ratio = Math.abs(trueEffect) / se;
  // d / se overflows (for example d = 1e300, se = 1e-9): the limit of every quantity is exact.
  if (!Number.isFinite(ratio)) return { power: 1, typeS: 0, exaggeration: 1 };
  // -normalQuantile(alpha / 2) is exact for tiny alpha; 1 - alpha / 2 would round to 1.
  const z = -normalQuantile(alpha / 2);
  const a = ratio - z;
  const b = -(ratio + z);

  const rightTail = normalCdf(a); // P(X > z se), the right-tail term
  const wrongTail = normalCdf(b); // P(X < -z se), the wrong-sign term
  const power = rightTail + wrongTail;
  const typeS = wrongTail / power;
  const truncatedMean = ratio * (rightTail - wrongTail) + normalPdf(a) + normalPdf(b);
  const exaggeration = truncatedMean / (power * ratio);

  return { power, typeS, exaggeration };
}
