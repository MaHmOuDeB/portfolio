/** A seeded random number generator. */
export type Rng = {
  /** The next unsigned 32-bit integer. */
  next(): number;
  /** The next value in [0, 1), `next() / 2^32`. */
  uniform(): number;
  readonly seed: number;
};

/**
 * Chris Doty-Humphrey's sfc32, seeded as (0x9E3779B9, 0x243F6A88, 0xB7E15162, seed) with the
 * first 12 outputs discarded. The same seed always gives the same stream.
 *
 * The seed is coerced with `>>> 0`: a fractional seed is truncated (1.7 behaves as 1), a negative
 * or out-of-range seed wraps modulo 2^32 (-1 behaves as 4294967295) and NaN or Infinity behave as
 * 0. The `seed` property reports the raw value that was passed in, not the coerced one.
 */
export function sfc32(seed: number): Rng {
  let a = 0x9e3779b9;
  let b = 0x243f6a88;
  let c = 0xb7e15162;
  let d = seed >>> 0;

  const next = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };

  for (let i = 0; i < 12; i += 1) next();

  return { next, uniform: () => next() / 4294967296, seed };
}

/**
 * An exact Binomial(n, p) draw: the sum of `n` Bernoulli(p) trials, each `rng.uniform() < p`.
 * Throws a RangeError unless `n` is a non-negative integer and `p` is in [0, 1].
 */
export function binomial(rng: Rng, n: number, p: number): number {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`binomial: n must be a non-negative integer, got ${n}`);
  if (!(p >= 0 && p <= 1)) throw new RangeError(`binomial: p must be in [0, 1], got ${p}`);
  let successes = 0;
  for (let i = 0; i < n; i += 1) if (rng.uniform() < p) successes += 1;
  return successes;
}
