// The Lab's two experiment diagnostics, the side the page loads at once: their ids, titles, URL
// schemas, presets, fixed constants and the joint clean-up of what a URL holds. Pure and
// client-safe. It must not import @/lib/stats: the client files the page loads at once import it
// (guarded by tests/unit/lab/diagnostics.test.ts). The statistics side is ./diagnostics.ts.
//
// - The split check (`srm`): hypothetical visitor counts for two groups and the share group A was
//   expected to get. A chi-square test with one degree of freedom flags the split below a p-value
//   of SRM_THRESHOLD, the threshold srmTest uses.
// - Exaggeration (`curse`): a hypothetical true effect and the standard error of its estimate, in
//   the same arbitrary units, at a fixed two-sided significance level of CURSE_ALPHA.
import type { DerivedRef } from '@/components/kit/Derived';
import type { ParamSchema, ParamValues, Presets } from '@/lib/figure/url-state';
import { snapToStep } from '@/lib/figure/snap';

/** Every number on these Figures is computed from values the visitor sets: none is a sourced fact. */
export const DIAGNOSTICS_REFS: readonly DerivedRef[] = ['simulated'];

// ---------------------------------------------------------------------------------------------
// The split check.

export const SRM_ID = 'srm';
export const SRM_TITLE = 'A split far from the expected share is flagged for a closer look';

export const SRM_SCHEMA = {
  nA: { kind: 'number', min: 0, max: 10_000, step: 1 },
  nB: { kind: 'number', min: 0, max: 10_000, step: 1 },
  shareA: { kind: 'number', min: 0.01, max: 0.99, step: 0.01 },
} as const satisfies ParamSchema;

export type SrmValues = ParamValues<typeof SRM_SCHEMA>;

/**
 * The presets, both simulated. `default` is a real case of what the check is for: 10,000 visitors
 * split 5,170 to 4,830 against an expected even split, a gap of a few points that the test flags.
 * `even` is the same total split evenly, one link away (`?srm.preset=even`), which it does not flag.
 */
export const SRM_PRESETS: Presets<typeof SRM_SCHEMA> = {
  default: { nA: 5170, nB: 4830, shareA: 0.5 },
  even: { nA: 5000, nB: 5000, shareA: 0.5 },
};

/** The link to the even preset, as a full page load so the island reads it. */
export const SRM_EVEN_HREF = '/lab?srm.preset=even#split-check';

/**
 * The p-value under which the split is flagged. srmTest in @/lib/stats flags `p < 0.001` and does
 * not export its constant, so the Lab names the same value here and a unit test holds the two equal
 * on both sides of the threshold.
 */
export const SRM_THRESHOLD = 0.001;

/**
 * Below this many expected visitors in a group, the chi-square approximation is rough: the usual rule
 * of thumb for a chi-square test on counts, printed beside a result it applies to.
 */
export const SRM_SMALL_EXPECTED = 5;

// ---------------------------------------------------------------------------------------------
// Exaggeration.

export const CURSE_ID = 'curse';
export const CURSE_TITLE = 'Low power exaggerates the effects that pass the threshold';

export const CURSE_SCHEMA = {
  trueEffect: { kind: 'number', min: 0, max: 5, step: 0.1 },
  se: { kind: 'number', min: 0.1, max: 5, step: 0.1 },
} as const satisfies ParamSchema;

export type CurseValues = ParamValues<typeof CURSE_SCHEMA>;

export const CURSE_PRESETS: Presets<typeof CURSE_SCHEMA> = { default: { trueEffect: 1, se: 1 } };

/** The fixed two-sided significance level. */
export const CURSE_ALPHA = 0.05;

/**
 * The positive ratios of true effect to standard error the controls can reach: 0.1 / 5 at the
 * smallest and 5 / 0.1 at the largest. The curve runs over exactly this range.
 */
export const RATIO_MIN = 0.02;
export const RATIO_MAX = 50;
/** Log-spaced curve samples strictly between the two ends, which are added exactly. */
export const CURVE_SAMPLES = 200;

// ---------------------------------------------------------------------------------------------
// The clean-up of a value from a URL, a slider or a typed entry: a value that is not a number falls
// back to the preset, anything else is clamped and put on its step grid. readFigureParams already
// does this for the URL; the views do it again, so no caller can hand them an invalid value.

function snapped(v: number, spec: { min: number; max: number; step: number }, fallback: number): number {
  return snapToStep(Number.isNaN(v) ? fallback : v, spec.min, spec.max, spec.step);
}

export function normalizeSrm(v: SrmValues): SrmValues {
  const d = SRM_PRESETS.default;
  return {
    nA: snapped(v.nA, SRM_SCHEMA.nA, d.nA),
    nB: snapped(v.nB, SRM_SCHEMA.nB, d.nB),
    shareA: snapped(v.shareA, SRM_SCHEMA.shareA, d.shareA),
  };
}

export function normalizeCurse(v: CurseValues): CurseValues {
  const d = CURSE_PRESETS.default;
  return {
    trueEffect: snapped(v.trueEffect, CURSE_SCHEMA.trueEffect, d.trueEffect),
    se: snapped(v.se, CURSE_SCHEMA.se, d.se),
  };
}

// ---------------------------------------------------------------------------------------------
// Words for the controls' values, shared by the islands and the inert preview copies.

const countFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const unitFormat = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "1,000 visitors", "1 visitor". */
export const visitorsText = (n: number) => `${countFormat.format(n)} ${n === 1 ? 'visitor' : 'visitors'}`;
/** "50%" for a share of 0.5. */
export const sharePercentText = (share: number) => `${countFormat.format(Math.round(share * 100))}%`;
/** "1.0" for an effect or a standard error, always one decimal, as its slider steps. */
export const unitsText = (v: number) => unitFormat.format(v);
