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
 * By symmetry the true effect is taken as positive, `d = |trueEffect|`, with cut-off `c = z * se`
 * and `z = -normalQuantile(alpha / 2)`:
 *
 * - `power = P(X > c) + P(X < -c) = Phi((d - c) / se) + Phi(-(c + d) / se)`;
 * - `typeS = P(X < -c) / power`, the second term over the total;
 * - `exaggeration = E[|X|; |X| > c] / (power * d)`, where
 *   `E[|X|; |X| > c] = d (Phi(a) - Phi(b)) + se (phi(a) + phi(b))` with `a = (d - c) / se` and
 *   `b = -(c + d) / se`.
 *
 * Every Phi is evaluated at a non-upper-tail argument (`normalCdf` is accurate in the lower tail
 * only), and the wrong-sign tail is kept as its own term so `typeS` stays accurate in relative
 * terms when it is astronomically small.
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

  const d = Math.abs(trueEffect);
  // -normalQuantile(alpha / 2) is exact for tiny alpha; 1 - alpha / 2 would round to 1.
  const c = -normalQuantile(alpha / 2) * se;
  const a = (d - c) / se;
  const b = -(c + d) / se;

  const rightTail = normalCdf(a); // P(X > c)
  const wrongTail = normalCdf(b); // P(X < -c)
  const power = rightTail + wrongTail;
  const typeS = wrongTail / power;
  const truncatedMean =
    d * (rightTail - wrongTail) + se * (normalPdf(a) + normalPdf(b));
  const exaggeration = truncatedMean / (power * d);

  return { power, typeS, exaggeration };
}
