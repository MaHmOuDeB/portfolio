// The ship-rule Figure's URL state: `?framework.lower=-1&framework.upper=3&framework.guardrail=1`.
// Each key is one interval bound in percentage points on the model's grid (-10 to 10, step 0.1).
// The URL reader clamps and snaps each key on its own; the model (normalizeFramework) then puts the
// main metric's ends in order, so a shared link with crossed ends draws a valid interval.
// Client-safe: no facts, no React.
import type { Presets } from '@/lib/figure/url-state';
import { FRAMEWORK_DEFAULTS, FRAMEWORK_MAX, FRAMEWORK_MIN, FRAMEWORK_STEP, normalizeFramework, type FrameworkValues } from './framework';

export const FRAMEWORK_ID = 'framework';

const BOUND = { kind: 'number', min: FRAMEWORK_MIN, max: FRAMEWORK_MAX, step: FRAMEWORK_STEP } as const;

export const FRAMEWORK_SCHEMA = { lower: BOUND, upper: BOUND, guardrail: BOUND } as const;

export type FrameworkParams = { lower: number; upper: number; guardrail: number };

export const FRAMEWORK_PRESETS: Presets<typeof FRAMEWORK_SCHEMA> = {
  default: {
    lower: FRAMEWORK_DEFAULTS.primaryLower,
    upper: FRAMEWORK_DEFAULTS.primaryUpper,
    guardrail: FRAMEWORK_DEFAULTS.guardrailUpper,
  },
};

/** The URL's three keys as the model's values, normalized. */
export function paramsToValues(p: FrameworkParams): FrameworkValues {
  return normalizeFramework({ primaryLower: p.lower, primaryUpper: p.upper, guardrailUpper: p.guardrail });
}

/** The model's values as the URL's keys. */
export function valuesToParams(v: FrameworkValues): FrameworkParams {
  return { lower: v.primaryLower, upper: v.primaryUpper, guardrail: v.guardrailUpper };
}
