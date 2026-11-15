// The Lab's two experiment diagnostics, the side the page loads at once: their ids, titles, URL
// schemas, presets, fixed constants and the joint clean-up of what a URL holds. Pure and
// client-safe. It must not import @/lib/stats: the client files the page loads at once import it
// (guarded by tests/unit/lab/diagnostics.test.ts). The statistics side is ./diagnostics.ts.
//
// - The split check (`srm`): hypothetical visitor counts for two groups, each meant to get half the
//   visitors. A chi-square test with one degree of freedom flags the split below a p-value of
//   SRM_THRESHOLD, the threshold srmTest uses. The Lab fixes the planned share at half; srmTest
//   itself works against any planned share.
// - Exaggeration (`curse`): how often a test clears the bar (its power) at a fixed two-sided
//   significance level of CURSE_ALPHA. The power fixes the ratio of the true effect to its standard
//   error (the statistics side finds it), and with it the exaggeration among results that clear the bar.
import type { DerivedRef } from '@/components/kit/Derived';
import type { ParamSchema, ParamValues, Presets } from '@/lib/figure/url-state';
import { snapToStep } from '@/lib/figure/snap';
import { PLANNER_POWER } from './planner-values';

/** Every number on these Figures is computed from values the visitor sets: none is a sourced fact. */
export const DIAGNOSTICS_REFS: readonly DerivedRef[] = ['simulated'];

// ---------------------------------------------------------------------------------------------
// The split check.

export const SRM_ID = 'srm';
export const SRM_TITLE = 'The bigger the gap, the rarer it is by chance';

export const SRM_SCHEMA = {
  nA: { kind: 'number', min: 0, max: 10_000, step: 1 },
  nB: { kind: 'number', min: 0, max: 10_000, step: 1 },
} as const satisfies ParamSchema;

/** The share of visitors each group was meant to get: half, fixed on the Lab. */
export const SRM_SHARE = 0.5;

export type SrmValues = ParamValues<typeof SRM_SCHEMA>;

/**
 * The presets, both simulated. `default` is a real case of what the check is for: 10,000 visitors
 * split 5,170 to 4,830 against an even split, a gap of a few points that the test flags. `even` is
 * the same total split evenly, one link away (`?srm.preset=even`), which it does not flag.
 */
export const SRM_PRESETS: Presets<typeof SRM_SCHEMA> = {
  default: { nA: 5170, nB: 4830 },
  even: { nA: 5000, nB: 5000 },
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
export const CURSE_TITLE = 'The smaller the test, the more its wins overstate the effect';

/** One control: how often the test clears the bar, from one test in ten to nearly every test. */
export const CURSE_SCHEMA = {
  power: { kind: 'number', min: 0.1, max: 0.99, step: 0.01 },
} as const satisfies ParamSchema;

export type CurseValues = ParamValues<typeof CURSE_SCHEMA>;

/** The control and readout words: plain first, the statistic's name in brackets. */
export const CURSE_LABELS = {
  power: 'How often the test clears the bar (power)',
  exaggeration: 'Results that clear the bar overstate the effect by',
  wrongSign: 'Results that clear the bar in the wrong direction',
} as const;

/** The link under the exhibit: a test sized as the planner sizes one, at the planner's power. */
export const CURSE_PRESET_LINK = { href: `?curse.power=${PLANNER_POWER}#exaggeration`, label: 'See a test sized as in check 1' } as const;

/**
 * The preset: a test that clears the bar 17% of the time, which is a ratio of true effect to standard
 * error of about one. It must stay under one half: the takeaway says a win then needs a reading well
 * above the truth (a unit test pins it).
 */
export const CURSE_PRESETS: Presets<typeof CURSE_SCHEMA> = { default: { power: 0.17 } };

/** The fixed two-sided significance level. */
export const CURSE_ALPHA = 0.05;

// ---------------------------------------------------------------------------------------------
// The clean-up of a value from a URL, a slider or a typed entry: a value that is not a number falls
// back to the preset, anything else is clamped and put on its step grid. readFigureParams already
// does this for the URL; the views do it again, so no caller can hand them an invalid value.

function snapped(v: number, spec: { min: number; max: number; step: number }, fallback: number): number {
  return snapToStep(Number.isNaN(v) ? fallback : v, spec.min, spec.max, spec.step);
}

export function normalizeSrm(v: SrmValues): SrmValues {
  const d = SRM_PRESETS.default;
  return { nA: snapped(v.nA, SRM_SCHEMA.nA, d.nA), nB: snapped(v.nB, SRM_SCHEMA.nB, d.nB) };
}

export function normalizeCurse(v: CurseValues): CurseValues {
  return { power: snapped(v.power, CURSE_SCHEMA.power, CURSE_PRESETS.default.power) };
}

// ---------------------------------------------------------------------------------------------
// Words for the controls' values, shared by the islands and the inert preview copies.

const countFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

/** "1,000 visitors", "1 visitor". */
export const visitorsText = (n: number) => `${countFormat.format(n)} ${n === 1 ? 'visitor' : 'visitors'}`;
/** "50%" for a share of 0.5. */
export const sharePercentText = (share: number) => `${countFormat.format(Math.round(share * 100))}%`;
/** The power slider's words: "17% of the time". */
export const powerTimeText = (power: number) => `${sharePercentText(power)} of the time`;
