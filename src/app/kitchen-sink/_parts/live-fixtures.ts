// Fictional snapshots of the live experiment for the kitchen sink and the tests: one per phase,
// amount of data and freshness. Not this site's experiment and not real visitors. Every difference
// is B − A in percentage points, a 95% confidence sequence.
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

// Counts. Most states have an even split. The states that follow a failed split check have a split
// that really fails it (srmTest p < 0.001): 212 against 148, or 3 against 27 while collecting.
// Before data there are no views at all.
type Counts = { nA: number; nB: number };
const EVEN: Record<DataAmount, Counts> = {
  'low-data': { nA: 12, nB: 14 },
  'enough-data': { nA: 180, nB: 176 },
};
const SKEWED: Record<DataAmount, Counts> = {
  'low-data': { nA: 3, nB: 27 },
  'enough-data': { nA: 212, nB: 148 },
};
const NONE: Counts = { nA: 0, nB: 0 };

function countsFor(phase: LivePhase, data: DataAmount): Counts {
  if (phase === 'before-data') return NONE;
  return phase === 'srm-suppressed' || phase === 'aa-failed' ? SKEWED[data] : EVEN[data];
}

// Looks at 50, 80, 110, 140 and 176 views per group (the smaller group). The interval narrows from
// about ±80 points; at 140 it would grow back, and the running intersection keeps the band from
// widening. A skewed run has the same looks, but stops at the 148 views its smaller group has.
const LOOKS = [50, 80, 110, 140, 176];
const SKEWED_LOOKS = [50, 80, 110, 130, 148];
const HALF_WIDTHS = [80, 45, 30, 31, 21.6];
// Group A is a few views ahead of group B at each look; the last look matches the counts above.
const A_AHEAD = [2, 3, 3, 3, 4];

function looks(estimates: readonly number[], halfWidths: readonly number[] = HALF_WIDTHS, skewed = false): CsPoint[] {
  const ns = skewed ? SKEWED_LOOKS : LOOKS;
  return ns.map((n, i) => ({
    n,
    nA: skewed ? Math.round((n * SKEWED['enough-data'].nA) / SKEWED['enough-data'].nB) : n + A_AHEAD[i]!,
    nB: n,
    estimate: estimates[i]!,
    lower: estimates[i]! - halfWidths[i]!,
    upper: estimates[i]! + halfWidths[i]!,
  }));
}

// The A/B run ends at −12 to +31, around +9.4. Calibration (A/A) hovers around zero.
const SERIES: Record<'aa' | 'aaSkewed' | 'ab' | 'abSkewed' | 'ship' | 'harm' | 'inconclusive', CsPoint[]> = {
  aa: looks([-3, 2, -1, 1, 0.6]),
  aaSkewed: looks([-3, 2, -1, 1, 0.6], HALF_WIDTHS, true),
  ab: looks([4, 12, 7, 11, 9.4]),
  abSkewed: looks([4, 12, 7, 11, 9.4], HALF_WIDTHS, true),
  ship: looks([10, 18, 20, 22, 24]),
  harm: looks([-10, -18, -20, -22, -24]),
  inconclusive: looks([2, 6, 3, 5, 4], [80, 45, 30, 31, 18]),
};

const SERIES_BY_PHASE: Record<LivePhase, CsPoint[]> = {
  'before-data': [],
  calibration: SERIES.aa,
  'aa-failed': SERIES.aaSkewed,
  ab: SERIES.ab,
  inconclusive: SERIES.inconclusive,
  'ship-b': SERIES.ship,
  'stop-for-harm': SERIES.harm,
  'srm-suppressed': SERIES.abSkewed,
};

// The timeline, as seen on 16.10. The A/A phase runs at least two weeks (31.08 to 14.09), the A/B
// run starts the day after and ends at the six-month cap (15.03). The stale data is from 15.10 and
// the pause started on 14.10, inside the run. A failed A/A stopped on 13.10, before the pause, and
// restarts on 20.10. Before data, the planned end is the end of the first A/A phase.
const PLANNED_END: Record<LivePhase, string> = {
  'before-data': '2026-10-30T10:00:00Z',
  calibration: '2026-10-19T10:00:00Z',
  'aa-failed': '2026-11-03T10:00:00Z',
  ab: '2027-03-15T10:00:00Z',
  inconclusive: '2027-03-15T10:00:00Z',
  'ship-b': '2027-03-15T10:00:00Z',
  'stop-for-harm': '2027-03-15T10:00:00Z',
  'srm-suppressed': '2027-03-15T10:00:00Z',
};

// While collecting, the one look so far is below 50 per group, so it is never shown.
const BLINDED = (c: Counts): CsPoint[] => [
  { n: Math.min(c.nA, c.nB), nA: c.nA, nB: c.nB, lower: -90, upper: 88, estimate: -1 },
];

/**
 * A paused A/B run whose interval lies above zero (+3 to +40) while its quick-exit guardrail is
 * breached (the interval of B − A is +8 to +14 against a limit of +10), so no rule has held. Not part
 * of the sink's 144 specimens: the tests use it to check that a pause never says the run goes on.
 */
export function pausedAbAboveZeroFixture(): LiveSnapshot {
  const base = liveFixture('ab', 'enough-data', 'paused');
  const last = base.series[base.series.length - 1]!;
  return {
    ...base,
    series: [...base.series.slice(0, -1), { ...last, lower: 3, upper: 40, estimate: 21 }],
    guardrail: { lower: 8, upper: 14, limit: 10 },
  };
}

export function liveFixture(phase: LivePhase, data: DataAmount, freshness: FreshnessKind): LiveSnapshot {
  const counts = countsFor(phase, data);
  return {
    phase,
    freshness: FRESHNESS[freshness],
    ...counts,
    series: phase === 'before-data' ? [] : data === 'low-data' ? BLINDED(counts) : SERIES_BY_PHASE[phase],
    // The inconclusive run stopped at the cap.
    capPerArm: phase === 'inconclusive' && data === 'enough-data' ? 176 : 230,
    projectedHalfWidthAtCap: 12,
    plannedEnd: PLANNED_END[phase],
    abStartedOn: phase === 'ab' ? '2026-09-15T08:00:00Z' : undefined,
    yourViewN: phase === 'ab' && data === 'enough-data' ? 120 : undefined,
    guardrail: phase === 'calibration' || phase === 'before-data' ? undefined : { lower: -3.2, upper: 6.4, limit: 10 },
    aaFailed:
      phase === 'aa-failed'
        ? { on: '2026-10-13T10:00:00Z', reason: 'the split check failed', restartsOn: '2026-10-20T10:00:00Z' }
        : undefined,
    nextStep: phase === 'inconclusive' ? 'keep page A and test a bolder change' : undefined,
  };
}
