/** Argument guards shared by the statistics modules. Each throws a RangeError naming the argument. */

/** `alpha` must lie strictly between 0 and 1. */
export function checkAlpha(alpha: number): void {
  if (!(alpha > 0 && alpha < 1)) throw new RangeError(`alpha must be in (0, 1), got ${alpha}`);
}

/** One arm's counts: `n` a positive integer and `x` an integer in [0, n]. */
export function checkArm(x: number, n: number, xName: string, nName: string): void {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`${nName} must be a positive integer, got ${n}`);
  }
  if (!Number.isInteger(x) || x < 0 || x > n) {
    throw new RangeError(`${xName} must be an integer in [0, ${nName}] (${nName} = ${n}), got ${x}`);
  }
}
