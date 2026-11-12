// A small, fictional decision rule for the metric builder on the Audible page.
//
// The product (Chapter Club), its primary metric (session completion) and its guardrail metric
// (help requests) are made up. The numbers are hypothetical interval bounds in percentage points,
// typed in by the reader. Nothing here estimates anything: there is no inference, no significance
// test and no sample size. It only turns three bounds into one of four plain decisions.

export type FrameworkValues = {
  /** Lower end of the primary metric's interval, in percentage points. */
  primaryLower: number;
  /** Upper end of the primary metric's interval, in percentage points. */
  primaryUpper: number;
  /** Upper end of the guardrail metric's interval, in percentage points. */
  guardrailUpper: number;
};

export type FrameworkDecision = 'ship' | 'ship-neutral' | 'harm' | 'hold';

/** The guardrail may rise by at most this much (percentage points) and still count as holding. */
export const GUARDRAIL_MARGIN = 2;

export const FRAMEWORK_MIN = -10;
export const FRAMEWORK_MAX = 10;
export const FRAMEWORK_STEP = 0.1;

export const FRAMEWORK_DEFAULTS: FrameworkValues = {
  primaryLower: 1,
  primaryUpper: 4,
  guardrailUpper: 1,
};

// Clamp to the allowed range and snap to the 0.1 step. A value that is not a finite number falls
// back to the given default.
function snap(x: number, fallback: number, min = FRAMEWORK_MIN): number {
  const n = Number.isFinite(x) ? x : fallback;
  const clamped = Math.min(FRAMEWORK_MAX, Math.max(min, n));
  const stepped = Math.round(clamped / FRAMEWORK_STEP) * FRAMEWORK_STEP;
  // Round again to drop floating point dust such as 0.30000000000000004.
  const out = Math.round(stepped * 10) / 10;
  return out === 0 ? 0 : out; // never -0
}

/** Brings any input into range: every value finite, on the 0.1 step, and lower <= upper. */
export function normalizeFramework(v: FrameworkValues): FrameworkValues {
  const primaryLower = snap(v.primaryLower, FRAMEWORK_DEFAULTS.primaryLower);
  // The upper bound can never sit below the lower bound.
  const primaryUpper = snap(v.primaryUpper, FRAMEWORK_DEFAULTS.primaryUpper, primaryLower);
  const guardrailUpper = snap(v.guardrailUpper, FRAMEWORK_DEFAULTS.guardrailUpper);
  return { primaryLower, primaryUpper, guardrailUpper };
}

/**
 * The rule, checked in this order:
 * 1. harm: the whole primary interval is below zero.
 * 2. hold: the guardrail's upper bound is past the margin.
 * 3. ship: the primary interval is entirely above zero.
 * 4. ship-neutral: the primary interval spans or touches zero and the guardrail holds. A neutral
 *    result may still ship when nothing is getting worse.
 */
export function frameworkDecision(v: FrameworkValues): FrameworkDecision {
  if (v.primaryUpper < 0) return 'harm';
  if (v.guardrailUpper > GUARDRAIL_MARGIN) return 'hold';
  if (v.primaryLower > 0) return 'ship';
  return 'ship-neutral';
}
