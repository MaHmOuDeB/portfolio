// Fictional snapshots of the live experiment for the kitchen sink and the tests: one per phase,
// amount of data and freshness. Not this site's experiment and not real visitors. Every difference
// is B − A in percentage points, a 95% confidence sequence.
// - Counts: low data 12 in A and 14 in B; enough data 180 in A and 176 in B.
// - Stale data was last updated on the Berlin day before the render.
import type { CsPoint, LiveSnapshot } from '@/lib/figure/cs-band';
import type { DataAmount, Freshness, LivePhase } from '@/lib/figure/states';

export const SINK_REFS = ['simulated'] as const;

export const FRESHNESS_KINDS = ['fresh', 'stale', 'paused'] as const;
export type FreshnessKind = (typeof FRESHNESS_KINDS)[number];

// Fixed instants, so the baselines never change.
const RENDERED_AT = '2026-10-16T08:00:00Z';
export const FRESHNESS: Record<FreshnessKind, Freshness> = {
  fresh: { kind: 'fresh' },
  // 23:40 on 15.10 in Berlin, rendered on 16.10.
  stale: { kind: 'stale', updatedAt: '2026-10-15T21:40:00Z', renderedAt: RENDERED_AT },
  paused: { kind: 'paused', pausedOn: '2026-10-14T09:00:00Z', reason: 'a fictional tracking fault is being fixed' },
};

const COUNTS: Record<DataAmount, { nA: number; nB: number }> = {
  'low-data': { nA: 12, nB: 14 },
  'enough-data': { nA: 180, nB: 176 },
};

// Looks at 50, 80, 110, 140 and 176 views per group. The interval narrows from about ±80 points;
// at 140 it would grow back, and the running intersection keeps the band from widening.
const LOOKS = [50, 80, 110, 140, 176];
const HALF_WIDTHS = [80, 45, 30, 31, 21.6];

function looks(estimates: readonly number[], halfWidths: readonly number[] = HALF_WIDTHS): CsPoint[] {
  return LOOKS.map((n, i) => ({
    n,
    estimate: estimates[i]!,
    lower: estimates[i]! - halfWidths[i]!,
    upper: estimates[i]! + halfWidths[i]!,
  }));
}

// The A/B run ends at −12 to +31, around +9.4. Calibration (A/A) hovers around zero.
const SERIES: Record<'aa' | 'ab' | 'ship' | 'harm' | 'inconclusive', CsPoint[]> = {
  aa: looks([-3, 2, -1, 1, 0.6]),
  ab: looks([4, 12, 7, 11, 9.4]),
  ship: looks([10, 18, 20, 22, 24]),
  harm: looks([-10, -18, -20, -22, -24]),
  inconclusive: looks([2, 6, 3, 5, 4], [80, 45, 30, 31, 18]),
};

const SERIES_BY_PHASE: Record<LivePhase, CsPoint[]> = {
  'before-data': [],
  calibration: SERIES.aa,
  'aa-failed': SERIES.aa,
  ab: SERIES.ab,
  inconclusive: SERIES.inconclusive,
  'ship-b': SERIES.ship,
  'stop-for-harm': SERIES.harm,
  'srm-suppressed': SERIES.ab,
};

// While collecting, the one look so far is below 50 per group, so it is never shown.
const BLINDED: CsPoint[] = [{ n: 12, lower: -90, upper: 88, estimate: -1 }];

export function liveFixture(phase: LivePhase, data: DataAmount, freshness: FreshnessKind): LiveSnapshot {
  return {
    phase,
    freshness: FRESHNESS[freshness],
    ...COUNTS[data],
    series: data === 'low-data' ? BLINDED : SERIES_BY_PHASE[phase],
    // The inconclusive run stopped at the cap.
    capPerArm: phase === 'inconclusive' && data === 'enough-data' ? 176 : 230,
    projectedHalfWidthAtCap: 12,
    plannedEnd: '2026-12-01T10:00:00Z',
    abStartedOn: phase === 'ab' ? '2026-10-01T08:00:00Z' : undefined,
    yourViewN: phase === 'ab' && data === 'enough-data' ? 120 : undefined,
    guardrail: phase === 'calibration' || phase === 'before-data' ? undefined : { lower: -3.2, upper: 6.4, limit: 10 },
    aaFailed:
      phase === 'aa-failed'
        ? { on: '2026-09-20T10:00:00Z', reason: 'the split check failed', restartsOn: '2026-09-27T10:00:00Z' }
        : undefined,
    nextStep: phase === 'inconclusive' ? 'keep page A and test a bolder change' : undefined,
  };
}
