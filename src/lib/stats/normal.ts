/**
 * The standard normal distribution: density, cumulative distribution and quantile function.
 *
 * - `normalCdf` ports Cephes `ndtr` (Stephen L. Moshier), which evaluates erf for small arguments
 *   and erfc, with the exp(-x^2) factor, for the rest, so tails keep full relative precision.
 * - `normalQuantile` is Wichura's algorithm AS241 (PPND16), accurate to about 1 part in 1e16.
 */

/** Evaluates a polynomial; `coef[0]` is the highest-degree term. */
function polevl(x: number, coef: readonly number[]): number {
  let ans = coef[0] as number;
  for (let i = 1; i < coef.length; i += 1) ans = ans * x + (coef[i] as number);
  return ans;
}

/** Like `polevl`, but the leading coefficient is an implicit 1. */
function p1evl(x: number, coef: readonly number[]): number {
  let ans = x + (coef[0] as number);
  for (let i = 1; i < coef.length; i += 1) ans = ans * x + (coef[i] as number);
  return ans;
}

// Cephes ndtr.c coefficient tables.
const ERF_T = [
  9.60497373987051638749e0, 9.00260197203842689217e1, 2.232005345946843192261e3,
  7.003325141128050754733e3, 5.559230130103949627680e4,
] as const;
const ERF_U = [
  3.35617141647503099647e1, 5.213579497801526797950e2, 4.594323829709801279870e3,
  2.262900006138909342465e4, 4.926739426086359210860e4,
] as const;
const ERFC_P = [
  2.46196981473530512524e-10, 5.64189564831068821977e-1, 7.46321056442269912687e0,
  4.86371970985681366614e1, 1.96520832956077098242e2, 5.26445194995477358631e2,
  9.34528527171957607540e2, 1.02755188689515710272e3, 5.57535335369399327526e2,
] as const;
const ERFC_Q = [
  1.32281951154744992508e1, 8.67072140885989742329e1, 3.54937778887819891062e2,
  9.75708501743205489753e2, 1.82390916687909736289e3, 2.24633760818710981792e3,
  1.65666309194161350182e3, 5.57535340817727675546e2,
] as const;
const ERFC_R = [
  5.64189583547755073984e-1, 1.27536670759978104416e0, 5.01905042251180477414e0,
  6.16021097993053585195e0, 7.40974269950448939160e0, 2.97886665372100240670e0,
] as const;
const ERFC_S = [
  2.26052863220117276590e0, 9.39603524938001434673e0, 1.20489539808096656605e1,
  1.70814450747565897222e1, 9.60896809063285878198e0, 3.36907645100081516050e0,
] as const;

const SQRT_HALF = 0.70710678118654752440;
/** ln of the largest double, Cephes MAXLOG: exp(-x^2) underflows beyond it. */
const MAXLOG = 7.09782712893383996843e2;

/** erf(x) for |x| < 1; `normalCdf` only calls it for |x| < 1/sqrt(2), so the |x| > 1 arm of Cephes is dropped. */
function erf(x: number): number {
  const z = x * x;
  return (x * polevl(z, ERF_T)) / p1evl(z, ERF_U);
}

/**
 * erfc(a) for a >= 1/sqrt(2); `normalCdf` passes |t|, so the negative-argument arms of Cephes
 * (`a < 0`) are unreachable and dropped.
 */
function erfc(a: number): number {
  if (a < 1) return 1 - erf(a);
  const z = -a * a;
  if (z < -MAXLOG) return 0;
  const p = a < 8 ? polevl(a, ERFC_P) : polevl(a, ERFC_R);
  const q = a < 8 ? p1evl(a, ERFC_Q) : p1evl(a, ERFC_S);
  return (Math.exp(z) * p) / q;
}

/** Probability density of the standard normal distribution at `x`. */
export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Cumulative distribution function of the standard normal distribution (Cephes `ndtr`). Values
 * below about -37.7 underflow to 0.
 *
 * Accurate in the LOWER tail: `normalCdf(-x)` keeps full relative precision however small it is,
 * while in the upper tail the result is `1 - tail` and is accurate in absolute terms only (it
 * rounds to 1 from about x = 8). Write an upper-tail probability as `normalCdf(-x)`, not
 * `1 - normalCdf(x)`.
 */
export function normalCdf(x: number): number {
  const t = x * SQRT_HALF;
  const z = Math.abs(t);
  if (z < SQRT_HALF) return 0.5 + 0.5 * erf(t);
  const y = 0.5 * erfc(z);
  return t > 0 ? 1 - y : y;
}

// Wichura AS241 (PPND16) coefficient tables, highest degree first.
const A = [
  2.5090809287301226727e3, 3.3430575583588128105e4, 6.7265770927008700853e4,
  4.5921953931549871457e4, 1.3731693765509461125e4, 1.9715909503065514427e3,
  1.3314166789178437745e2, 3.3871328727963666080e0,
] as const;
const B = [
  5.2264952788528545610e3, 2.8729085735721942674e4, 3.9307895800092710610e4,
  2.1213794301586595867e4, 5.3941960214247511077e3, 6.8718700749205790830e2,
  4.2313330701600911252e1, 1,
] as const;
const C = [
  7.74545014278341407640e-4, 2.27238449892691845833e-2, 2.41780725177450611770e-1,
  1.27045825245236838258e0, 3.64784832476320460504e0, 5.76949722146069140550e0,
  4.63033784615654529590e0, 1.42343711074968357734e0,
] as const;
const D = [
  1.05075007164441684324e-9, 5.47593808499534494600e-4, 1.51986665636164571966e-2,
  1.48103976427480074590e-1, 6.89767334985100004550e-1, 1.67638483018380384940e0,
  2.05319162663775882187e0, 1,
] as const;
const E = [
  2.01033439929228813265e-7, 2.71155556874348757815e-5, 1.24266094738807843860e-3,
  2.65321895265761230930e-2, 2.96560571828504891230e-1, 1.78482653991729133580e0,
  5.46378491116411436990e0, 6.65790464350110377720e0,
] as const;
const F = [
  2.04426310338993978564e-15, 1.42151175831644588870e-7, 1.84631831751005468180e-5,
  7.86869131145613259100e-4, 1.48753612908506148525e-2, 1.36929880922735805310e-1,
  5.99832206555887937690e-1, 1,
] as const;

/**
 * Quantile function (inverse CDF) of the standard normal distribution, Wichura's AS241 (PPND16).
 * Returns -Infinity at 0 and Infinity at 1; throws a RangeError for `p` outside [0, 1].
 */
export function normalQuantile(p: number): number {
  if (!(p >= 0 && p <= 1)) throw new RangeError(`normalQuantile: p must be in [0, 1], got ${p}`);
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  const q = p - 0.5;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    return (q * polevl(r, A)) / polevl(r, B);
  }
  const tail = q < 0 ? p : 1 - p;
  let r = Math.sqrt(-Math.log(tail));
  let value: number;
  if (r <= 5) {
    r -= 1.6;
    value = polevl(r, C) / polevl(r, D);
  } else {
    r -= 5;
    value = polevl(r, E) / polevl(r, F);
  }
  return q < 0 ? -value : value;
}
