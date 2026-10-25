// Every pre-registered value of the live experiment: the plain data lives in experiment.values.ts
// (re-exported here), and this file adds what needs the statistics library. A change to the design
// alters the pre-registration hash, which a unit test compares with the hash written in
// docs/experiment/prereg.md. Kit and figure code import experiment.values.ts, never this file.
import type { VercelEnv } from './lib/env.ts';
import { optimalTau2 } from './lib/stats/sequential.ts';
import { EXPERIMENT, type ExperimentConfig } from './experiment.values.ts';

export { ARMS, EXPERIMENT, type Arm, type ExperimentConfig, type ExperimentPhase } from './experiment.values.ts';

/** Keeps pages deterministic outside production before the real calibration start is set. */
export const FIXTURE_START = '2026-11-02T00:00:00+01:00';

// The mixing variance of the confidence sequence, tuned to be narrowest at each cap.
export const TAU2 = {
  primary: optimalTau2({ baseline: EXPERIMENT.primary.planningBaseline, nCapPerArm: EXPERIMENT.capPerArm, alpha: EXPERIMENT.alpha }),
  guardrail: optimalTau2({ baseline: EXPERIMENT.guardrail.planningBaseline, nCapPerArm: EXPERIMENT.entryCapPerArm }),
};

/** The configured calibration start; else FIXTURE_START outside production; else null. */
export function calibrationStart(config: ExperimentConfig, vercelEnv: VercelEnv): string | null {
  return config.calibration.startedOn ?? (vercelEnv === 'production' ? null : FIXTURE_START);
}

/**
 * True while nothing can be counted yet: no calibration start, before the start instant, or, in the
 * A/B, no A/B start or before it. The event route refuses every event as not-started under this
 * rule, and pages say nothing about a running experiment under the same rule.
 */
export function notStartedAt(config: ExperimentConfig, vercelEnv: VercelEnv, nowMs: number): boolean {
  const start = calibrationStart(config, vercelEnv);
  if (start === null || nowMs < Date.parse(start)) return true;
  return config.phase === 'ab' && (config.ab.startedOn === null || nowMs < Date.parse(config.ab.startedOn));
}

