import reference from '../../../stats-ref/reference.json' with { type: 'json' };

/** `[x, value]` pairs. */
type Pair = [number, number];

/**
 * The shape of `stats-ref/reference.json`, written by `stats-ref/generate.py` from scipy and
 * statsmodels. Every B/A difference is B - A (treatment minus control).
 */
export type Reference = {
  meta: { numpy: string; scipy: string; statsmodels: string; python: string };
  normalCdf: Pair[];
  /** 20 pairs, not 24: the complement 1 - p of every p at or below 1e-20 rounds to exactly 1. */
  normalQuantile: Pair[];
  sfc32: { seed: number; first: number[] };
  wilson: { x: number; n: number; alpha: number; lower: number; upper: number }[];
  newcombe: {
    xA: number;
    nA: number;
    xB: number;
    nB: number;
    alpha: number;
    lower: number;
    upper: number;
  }[];
  ztest: { xA: number; nA: number; xB: number; nB: number; z: number; p: number }[];
  srm: { nA: number; nB: number; chi2: number; p: number }[];
  sampleSize: { baseline: number; mde: number; alpha: number; power: number; n: number }[];
  detectableEffect: {
    nPerArm: number;
    baseline: number;
    alpha: number;
    power: number;
    mde: number;
  }[];
  mixtureRatio: { alpha: number; r: number }[];
  mixtureCs: {
    xA: number;
    nA: number;
    xB: number;
    nB: number;
    alpha: number;
    tau2: number;
    estimate: number;
    lower: number;
    upper: number;
  }[];
  /**
   * Keyed "1" to "60": the 0.95 quantile of max_k |S_k| / sqrt(K) over K looks. "1" is exact
   * (norm.ppf(0.975)); "2" to "60" are Monte Carlo estimates (2,000,000 paths), so they are not
   * monotone in K and are accurate to about 3e-3 (largest error 2.3e-3 at K = 2). Exact values
   * come from recursive integration (K = 2: 1.97743, K = 5: 2.04007, K = 10: 2.08650, K = 20:
   * 2.12565); an exact table is a documented follow-up. Tests must not assert monotonicity or use
   * a tighter tolerance.
   */
  obf: Record<string, number>;
  peeking: {
    looks: number;
    nPerLook: number;
    p: number;
    method: 'naive' | 'cs';
    fpr: number;
    se: number;
    reps: number;
  }[];
  retrodesign: {
    trueEffect: number;
    se: number;
    alpha: number;
    power: number;
    typeS: number;
    exaggeration: number;
  }[];
};

// JSON imports widen `[x, y]` pairs to `number[]`, so the cast goes through `unknown`.
export const ref = reference as unknown as Reference;
