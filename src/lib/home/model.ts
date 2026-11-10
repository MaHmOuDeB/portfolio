// The Home page's view of the live experiment: one snapshot projected into the facts the note and
// the narrative need. Server only: the model keeps the exact group counts, so it is never passed
// whole to a client component. Every printed count goes through `counts` (publishedCount); no
// p-value, chi-square or outcome count is copied in.
//
// The mode, in order of precedence (the first that applies):
//   not-started, closure-check (a stored stop that the current analysis does not confirm),
//   unavailable, settings-unreadable, held (A/B), aa-failed, srm-suppressed, paused, then the
//   outcome (ship-b, stop-for-harm, inconclusive) or the phase (before-data, calibration, ab).
// Closure is computed once and independently of the mode: `countingClosed` (a stored stop, a final
// outcome, or the A/B past its planned end at the snapshot's own read time) and `closedConfirmed`
// (a stored stop, or the A/B past its planned end). A derived decision whose stop is not stored yet
// is closed but not confirmed: the event route may still count for a moment.
import type { DerivedRef } from '@/components/kit/Derived';
import type { TestNote } from '@/components/kit/PhaseLabel';
import type { Arm } from '@/experiment.values';
import { viewFreshnessAt } from '@/lib/experiment/freshness';
import { MALFORMED_REASON, liveView } from '@/lib/experiment/live';
import type { ExperimentSnapshot, SrmResult } from '@/lib/experiment/snapshot';
import type { ClosedMarker } from '@/lib/experiment/store';
import type { LiveSnapshot } from '@/lib/figure/cs-band';
import { MIN_PER_GROUP, type Freshness } from '@/lib/figure/states';
import { publishedCount, type PublishedCount } from './counts';

export type HomeMode =
  | 'not-started'
  | 'closure-check'
  | 'unavailable'
  | 'settings-unreadable'
  | 'held'
  | 'srm-suppressed'
  | 'aa-failed'
  | 'paused'
  | 'before-data'
  | 'calibration'
  | 'ab'
  | 'ship-b'
  | 'stop-for-harm'
  | 'inconclusive';

export type CheckStatus = 'not-evaluated' | 'passed' | 'failed';
export type HomeOutcome = 'ship-b' | 'stop-for-harm' | 'inconclusive';

export type HomeModel = {
  hasCeilingDay: boolean;
  countingClosed: boolean;
  closedConfirmed: boolean;
  closed: ClosedMarker | null;
  closureMismatch: boolean;
  mode: HomeMode;
  /** The reader's assigned group. */
  arm: Arm;
  /** The headlines the reader saw: A in the calibration, the assigned group in the A/B. */
  headlineArm: Arm;
  namespace: string;
  readAt: string;
  refs: readonly DerivedRef[];
  /** Exact counts (server only); series looks below the minimum per group are dropped. */
  live: LiveSnapshot;
  counts: { a: PublishedCount; b: PublishedCount; smaller: PublishedCount };
  testNote: TestNote | null;
  calibration: null | { ready: boolean; evaluatedOn: string | null };
  splitStatus: { entry: CheckStatus; analysed: CheckStatus };
  split: null | {
    base: 'entry' | 'analysed' | 'both';
    day: string;
    entry: { a: number; b: number };
    analysed: { a: number; b: number };
  };
  held: null | { on: string; reason: 'band-conflict' | 'inconsistent-counts' };
  /** The stop's own reason (a failed calibration or a pause); the note never prints a pause reason. */
  reason: string | null;
  outcome: HomeOutcome | null;
  /** A split check failed after a final decision; the decision stands. */
  afterDecisionSrm: boolean;
};

const OUTCOMES: readonly string[] = ['ship-b', 'stop-for-harm', 'inconclusive'];
const isOutcome = (status: string): status is HomeOutcome => OUTCOMES.includes(status);

function modeOf(s: ExperimentSnapshot): HomeMode {
  const f = s.live.freshness;
  if (s.unavailable === 'not-started') return 'not-started';
  if (s.closureMismatch === true && s.unavailable === 'unreadable') return 'closure-check';
  if (s.unavailable === 'unreadable') return 'unavailable';
  // The reader states unreadable settings only through this reason; no second read of the flags.
  if (f.kind === 'paused' && f.reason === MALFORMED_REASON) return 'settings-unreadable';
  if (s.configPhase === 'ab' && s.held !== null) return 'held';
  if (s.status === 'aa-failed') return 'aa-failed';
  if (s.status === 'srm-suppressed') return 'srm-suppressed';
  if (f.kind === 'paused') return 'paused';
  return s.status;
}

const check = (r: SrmResult | null): CheckStatus => (r === null ? 'not-evaluated' : r.flagged ? 'failed' : 'passed');

export function toHomeModel(snapshot: ExperimentSnapshot, arm: Arm): HomeModel {
  const s = snapshot;
  const mode = modeOf(s);
  const view = liveView(s, arm);
  const end = Date.parse(s.live.plannedEnd);
  const readAt = Date.parse(s.readAt);
  // The snapshot's own clock, never render time. In the calibration the planned end is only the
  // earliest end, and counting goes on past it.
  const endReached = s.configPhase === 'ab' && Number.isFinite(end) && Number.isFinite(readAt) && readAt >= end;
  const closed = s.closed ?? null;
  const outcome = isOutcome(mode) ? mode : null;
  const live: LiveSnapshot = {
    ...s.live,
    series: s.live.series.filter((p) => p.nA >= MIN_PER_GROUP && p.nB >= MIN_PER_GROUP),
  };
  const look = s.srm.flaggedLook;
  const split =
    s.srm.firstFlaggedOn !== null && s.srm.flaggedBase !== null && look !== null
      ? {
          base: s.srm.flaggedBase,
          day: s.srm.firstFlaggedOn,
          entry: { a: look.a.entry, b: look.b.entry },
          analysed: { a: look.a.inview, b: look.b.inview },
        }
      : null;
  const f = s.live.freshness;
  const reason = mode === 'aa-failed' ? (s.live.aaFailed?.reason ?? null) : mode === 'paused' && f.kind === 'paused' ? f.reason : null;
  const active = mode === 'paused' || mode === 'before-data' || mode === 'calibration' || mode === 'ab';
  return {
    hasCeilingDay: s.ceilingDays.length > 0,
    countingClosed: closed !== null || isOutcome(s.status) || endReached,
    closedConfirmed: closed !== null || endReached,
    closed,
    closureMismatch: s.closureMismatch === true,
    mode,
    arm,
    headlineArm: s.configPhase === 'ab' ? arm : 'a',
    namespace: s.namespace,
    readAt: s.readAt,
    refs: view.refs,
    live,
    counts: {
      a: publishedCount(s.live.nA),
      b: publishedCount(s.live.nB),
      smaller: publishedCount(Math.min(s.live.nA, s.live.nB)),
    },
    testNote: active ? view.testNote : null,
    calibration: s.calibration === null ? null : { ready: s.calibration.ready, evaluatedOn: s.calibration.evaluatedOn },
    splitStatus: { entry: check(s.srm.assignment), analysed: check(s.srm.analysed) },
    split,
    held: mode === 'held' && s.held !== null ? { on: s.held.on, reason: s.held.reason } : null,
    reason,
    outcome,
    afterDecisionSrm: s.srm.afterDecision && (outcome === 'ship-b' || outcome === 'stop-for-harm'),
  };
}

/** The model's freshness at `nowIso`, by the same client-safe rule the page uses at view time. */
export function homeFreshnessAt(model: HomeModel, nowIso: string): Freshness {
  return viewFreshnessAt({ readAt: model.readAt, snapshot: { freshness: model.live.freshness } }, nowIso);
}
