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
  /** Keyed "1" to "60": the 0.95 quantile of max_k |S_k| / sqrt(K) over K looks. */
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
