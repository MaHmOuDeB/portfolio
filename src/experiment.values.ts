// The plain data of the pre-registered design: no imports but types, so kit and figure code can read
// it without pulling in the statistics. Every value is pre-registered. A change to anything here
// (other than the two `startedOn` dates) is a change of design: it alters the pre-registration hash,
// which a unit test compares with the hash written in docs/experiment/prereg.md. A phase change is a
// commit and a redeploy, never a runtime flag. src/experiment.config.ts re-exports all of this and
// adds what needs the statistics (TAU2).

export type Arm = 'a' | 'b';
export const ARMS: readonly Arm[] = ['a', 'b'];

export type ExperimentPhase = 'calibration' | 'ab';

export const EXPERIMENT = {
  id: 'card-headlines',
  // The pre-registration version and the git tag that marks it.
  prereg: { version: 'v1', tag: 'prereg-v1' },
  // Both groups see group A while calibrating; the A/B starts with a redeploy tagged prereg-final.
  phase: 'calibration' as ExperimentPhase,
  // The store namespace: a fresh one per phase, so A/A data never enters the A/B analysis.
  namespace: 'aa-v1' as string,
  // At least 2 weeks and at least 100 analysed views before the switch. startedOn is set at launch.
  calibration: { startedOn: null as string | null, minDays: 14, minAnalysedViews: 100 },
  // The A/B runs to a 6-month cap. startedOn is set at the switch.
  ab: { startedOn: null as string | null, capMonths: 6 },
  // Two-sided confidence sequence at 95%, planned at 80% power.
  alpha: 0.05,
  power: 0.8,
  // A sample-ratio-mismatch flag below this p-value suppresses the verdict.
  srmFlagP: 0.001,
  // Results are shown from 50 analysed views per group.
  minPerGroup: 50,
  // Placeholder click rate for the primary metric, replaced by the calibration's measured rate.
  primary: { planningBaseline: 0.15 },
  // Leaving within 5 seconds without interacting; the margin is +10 percentage points.
  guardrail: { quickExitSeconds: 5, marginPp: 10, planningBaseline: 0.5 },
  // Planning sample sizes per group: analysed views for the primary, entry views for the guardrail.
  capPerArm: 225,
  entryCapPerArm: 375,
  // Exposure: half of the cards area visible for 1 second, or a click on a featured card.
  cardsInView: { visibleShare: 0.5, dwellMs: 1000, cardClickCounts: true },
  // A per-view id lives 30 minutes, the window in which a click counts for its view.
  pvTtlSeconds: 1800,
  // 30 events a minute per IPv4 address or IPv6 /64; the key expires after 120 seconds.
  rateLimit: { perMinute: 30, keyTtlSeconds: 120, ipv6PrefixBits: 64 },
  // At most 200 counted entry views per Berlin day.
  dailyEntryCeiling: 200,
  // How long the route caches the pause flag.
  flagsCacheSeconds: 45,
  // Pages regenerate every 5 minutes; the client calls data stale after 15.
  revalidateSeconds: 300,
  staleAfterMinutes: 15,
  // Count cells from 1 up to this value print as "<5" in the published data.
  smallCellBelow: 5,
  // The version of the bot list used to exclude bots.
  botRulesVersion: 'isbot@5.2.2',
} as const;

export type ExperimentConfig = typeof EXPERIMENT;
