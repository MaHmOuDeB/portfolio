// The snapshot builder: the experiment's counters in, everything the pages and the published data
// show out. Pure: no I/O and no clock (`now` is passed in), and it imports only types from the
// store and the flags, so it runs anywhere the statistics run.
//
// The rules, in the order they apply:
// - Looks. A Berlin day is completed `pvTtlSeconds` plus a minute after the following midnight:
//   a view's later events count on its entry's day, so a view opened just before midnight can still
//   add to that day's row until its id expires. (At the A/B's planned end the route stops counting,
//   so the last day is completed at the end itself.) Each completed day from the start gives a
//   cumulative look; a row that is not completed yet is counted in the current totals but never in
//   a look, so a partial day decides nothing. A look is evaluated once both groups have at least
//   `minPerGroup` analysed views.
// - A day that reached the daily ceiling (a `ceiling` rejection on that day) may hold a flood, so
//   it feeds nothing until it has been reviewed: its rows stay in `current` and the funnel, and are
//   left out of every look and of every count shown next to the analysis.
// - Intervals. The primary (card clicks of analysed views) and the guardrail (quick exits of entry
//   views) each get the mixture confidence sequence, intersected over the evaluated looks.
// - Data faults. A look whose cumulative counts break an event's dependency (more card clicks than
//   analysed views, more analysed or engaged views than entries), or whose interval (either one)
//   does not overlap its running band, is a data fault. The analysis stops at the last clean look
//   before it and nothing after it is reported (`held`); there is no resume. In the A/A a fault
//   fails the calibration; in the A/B the test is stopped for a data fault. The event route counts
//   a view's later events on its entry's day, so clean data never trips the count check.
// - SRM on entry and analysed views at every completed look. The first flag is sticky.
// - The A/B decision walks the looks in order. An SRM flag stops it and freezes the analysis there
//   (the verdict is suppressed); a data fault holds it at the last clean look. Otherwise the first
//   look at which ship B or stop for harm holds is the decision, and the analysis freezes there.
//   Later rows never change the looks, the interval or the counts shown; a later SRM flag is only a
//   note. An SRM flag after a fault still suppresses the verdict, so "SRM passed" is never shown
//   next to a flagged split.
// - The A/A fails by rule at the first completed look with an SRM flag, at which either the look's
//   own interval or the running band excludes 0, or at a data fault.
// - Blinding. While the smaller group has fewer than `minPerGroup` analysed views, no interval, no
//   series and no outcome rate is given.
// Zero exposures never reach the statistics: every call below is guarded by its own count check.
import { EXPERIMENT, TAU2, type ExperimentConfig, type ExperimentPhase } from '../../experiment.config.ts';
import { csPointFromInterval, type CsPoint, type LiveSnapshot } from '../figure/cs-band.ts';
import type { Freshness, LivePhase } from '../figure/states.ts';
import { detectableEffectCs } from '../stats/power.ts';
import { srmTest } from '../stats/proportions.ts';
import { mixtureCs } from '../stats/sequential.ts';
import { EVENT_TYPES, REJECT_REASONS, type RejectReason } from './events.ts';
import type { ExperimentFlags } from './flags.ts';
import type { ClosedMarker, CounterRows, GroupCounts } from './store.ts';
import { berlinDay, berlinDaysBetween, berlinStartOfDay, plannedEnd } from './time.ts';

export type SrmResult = { chi2: number; p: number; flagged: boolean };
export type Funnel = {
  /** Counted entries plus bot, internal, self, forced and not_entry rejections. Bots that run no script never appear. */
  beaconsReceived: number;
  /** beaconsReceived minus bot and internal. */
  botFiltered: number;
  entryViews: number;
  /** Exposed (analysed) views. */
  analysed: number;
  /** rate_limited and ceiling count refused events, once per window or day. */
  excluded: Record<RejectReason, number>;
};
/** The cumulative counts at the end of a completed Berlin day. */
export type Look = { day: string; a: GroupCounts; b: GroupCounts };
/** In proportions (not points). */
export type Interval = { estimate: number; lower: number; upper: number };
export type CalibrationCheck = {
  days: number;
  analysed: number;
  srmPassed: boolean;
  intervalContainsZero: boolean | null;
  evaluatedOn: string | null;
  ready: boolean;
  failed: { day: string; reason: 'srm' | 'interval-excludes-zero' | 'data-fault' } | null;
};
export type Held = { on: string; reason: 'band-conflict' | 'inconsistent-counts' };
export type DetectableCurve = {
  baseline: number;
  power: number;
  tau2: number;
  looks: 'one look at n';
  points: { nPerArm: number; effect: number }[];
  atCurrent: number | null;
};
export type ExperimentSnapshot = {
  schema: 1;
  /** Validated durable closure read by the live reader; kind/day only, never a recovered verdict. */
  closed?: ClosedMarker;
  /**
   * 'unavailable': a placeholder with no data, when the experiment has not started in production or
   * a build could not read the store. Its counts are zero and its freshness says why.
   */
  source: 'store' | 'local' | 'fixture' | 'unavailable';
  /** Why a placeholder has no data: set only when `source` is 'unavailable'. */
  unavailable?: 'not-started' | 'unreadable';
  readAt: string;
  namespace: string;
  /** The configured phase (calibration or ab). */
  configPhase: ExperimentPhase;
  /** The state the data puts it in: `live.phase`. */
  status: LivePhase;
  live: LiveSnapshot;
  /** Completed days from the start day, up to the deciding or suppressing look. */
  looks: Look[];
  /** Totals now, today's partial row and left-out days included. */
  current: { a: GroupCounts; b: GroupCounts };
  /** The deciding look's day: a decision, or an A/A failure (by SRM, interval or data fault). */
  frozenAt: string | null;
  funnel: Funnel;
  srm: {
    /** At the flagged look the outcome rests on, else at the last look reported. */
    assignment: SrmResult | null;
    analysed: SrmResult | null;
    /**
     * The flagged look the outcome rests on: the A/B's suppressing look (when held, the first flag
     * at or after the fault), or the A/A's failing look when it failed on the split. A flag after an
     * A/B decision is only `afterDecision`; a flag after an A/A failure is not picked up.
     */
    firstFlaggedOn: string | null;
    /** Which split failed at `firstFlaggedOn`: entry views, analysed views, or both. */
    flaggedBase: 'entry' | 'analysed' | 'both' | null;
    /** The cumulative counts of that look, for the sentence that names the failed split. */
    flaggedLook: Look | null;
    afterDecision: boolean;
  };
  blinded: boolean;
  /** The primary interval, intersected over the evaluated looks. */
  primary: Interval | null;
  guardrail: Interval | null;
  /** The first look whose interval (either one) did not overlap its running band: a data fault. */
  bandConflictOn: string | null;
  /** The first look whose counts broke an event's dependency: a data fault. */
  inconsistentOn: string | null;
  /** The data fault the analysis stopped at, if any: nothing from that look on is reported. */
  held: Held | null;
  /** Card clicks per entry view, descriptive. */
  itt: { a: number; b: number } | null;
  calibration: CalibrationCheck | null;
  detectable: DetectableCurve;
  /** Days that reached the daily ceiling: they feed nothing until reviewed. */
  ceilingDays: string[];
};

export type SnapshotInput = {
  counters: CounterRows;
  flags: ExperimentFlags;
  /** ISO date-time with an offset. */
  now: string;
  /** The calibration start (calibrationStart); the caller refuses null. */
  start: string;
  source: ExperimentSnapshot['source'];
  config?: ExperimentConfig;
};

const AA_WORDS = {
  srm: 'the split check failed',
  'interval-excludes-zero': 'the two identical groups differed',
  'data-fault': 'the counts failed a consistency check',
} as const;
/** After its views' ids expire, a minute of margin before a day's row is read as final. */
const LOOK_MARGIN_MS = 60_000;
const DETECTABLE_STEP = 25;

type Counts2 = { a: GroupCounts; b: GroupCounts };
const zeros = (): GroupCounts => Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as GroupCounts;
const copy = (g: GroupCounts): GroupCounts => ({ ...g });
function add(into: GroupCounts, g: GroupCounts): void {
  for (const t of EVENT_TYPES) into[t] += g[t];
}
const smaller = (c: Counts2) => Math.min(c.a.inview, c.b.inview);
const groupConsistent = (g: GroupCounts) => g.card <= g.inview && g.inview <= g.entry && g.engaged <= g.entry;
const consistent = (c: Counts2) => groupConsistent(c.a) && groupConsistent(c.b);
const excludesZero = (v: Interval) => v.lower > 0 || v.upper < 0;

/** The interval of B − A for x of n in each group; null when a group has no views. Counts must be consistent. */
function cs(xA: number, nA: number, xB: number, nB: number, tau2: number, alpha: number): Interval | null {
  if (nA < 1 || nB < 1) return null;
  const { estimate, lower, upper } = mixtureCs({ xA, nA, xB, nB }, { tau2, alpha });
  return { estimate, lower, upper };
}

const primaryCs = (c: Counts2, alpha: number) => cs(c.a.card, c.a.inview, c.b.card, c.b.inview, TAU2.primary, alpha);
const guardrailCs = (c: Counts2, alpha: number) =>
  cs(c.a.entry - c.a.engaged, c.a.entry, c.b.entry - c.b.engaged, c.b.entry, TAU2.guardrail, alpha);

/**
 * A running intersection; the estimate is always the look's own, which can lie outside the band.
 * A look that would empty it reports a conflict (a data fault: the analysis stops before it).
 */
function intersect(band: Interval | null, next: Interval): { band: Interval; conflict: boolean } {
  if (band === null) return { band: next, conflict: false };
  const lower = Math.max(band.lower, next.lower);
  const upper = Math.min(band.upper, next.upper);
  if (lower >= upper) return { band: { ...band, estimate: next.estimate }, conflict: true };
  return { band: { estimate: next.estimate, lower, upper }, conflict: false };
}

function srm(nA: number, nB: number, flagP: number): SrmResult | null {
  if (nA + nB === 0) return null;
  const { chi2, p } = srmTest(nA, nB);
  return { chi2, p, flagged: p < flagP };
}

function dayPlus(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** One completed look with everything the walks need. */
type Step = {
  look: Look;
  evaluated: boolean;
  consistent: boolean;
  assignment: SrmResult | null;
  analysed: SrmResult | null;
  flagged: boolean;
  /** This look's own primary interval. */
  own: Interval | null;
  /** The bands intersected up to and including this look. */
  primary: Interval | null;
  guardrail: Interval | null;
  conflict: boolean;
};

export function buildSnapshot(i: SnapshotInput): ExperimentSnapshot {
  const config = i.config ?? EXPERIMENT;
  const { alpha, minPerGroup } = config;
  const nowMs = Date.parse(i.now);
  const ab = config.phase === 'ab';
  const end = plannedEnd(config, i.start);
  // The A/B's end as the analysis reads it: a request that passed the route's end check just before
  // the end can still write for a moment after it, so the end gets the same margin as a day.
  const endMs = ab && end.kind === 'fixed' ? Date.parse(end.at) + LOOK_MARGIN_MS : null;
  /** A day is completed once its views can add nothing more to its row. */
  const completedAt = (day: string) => {
    const at = Date.parse(berlinStartOfDay(dayPlus(day, 1))) + config.pvTtlSeconds * 1000 + LOOK_MARGIN_MS;
    return endMs !== null && endMs < at ? endMs : at;
  };
  const isCompleted = (day: string) => nowMs >= completedAt(day);

  // Rows from the start day on; in the A/B, also from the A/B start day on, and before its end.
  let from = berlinDay(i.start);
  if (ab && config.ab.startedOn !== null && berlinDay(config.ab.startedOn) > from) from = berlinDay(config.ab.startedOn);
  const endDay = ab && end.kind === 'fixed' ? berlinDay(end.at) : null;
  const rows = i.counters.days.filter((d) => d.day >= from);
  const rejectionDays = Object.entries(i.counters.rejectionsByDay).filter(([day]) => day >= from);
  const ceilingDays = rejectionDays
    .filter(([, r]) => (r.ceiling ?? 0) >= 1)
    .map(([day]) => day)
    .sort();
  const leftOut = new Set(ceilingDays);

  // `current` is everything counted; `analysable` leaves out the ceiling days.
  const current: Counts2 = { a: zeros(), b: zeros() };
  const analysable: Counts2 = { a: zeros(), b: zeros() };
  for (const d of rows) {
    add(current.a, d.a);
    add(current.b, d.b);
    if (!leftOut.has(d.day)) {
      add(analysable.a, d.a);
      add(analysable.b, d.b);
    }
  }

  // Every completed look, with its SRM and the bands so far.
  const steps: Step[] = [];
  {
    const cum: Counts2 = { a: zeros(), b: zeros() };
    let primary: Interval | null = null;
    let guardrail: Interval | null = null;
    const completed = rows.filter((d) => isCompleted(d.day) && (endDay === null || d.day < endDay) && !leftOut.has(d.day));
    for (const d of completed) {
      add(cum.a, d.a);
      add(cum.b, d.b);
      const look: Look = { day: d.day, a: copy(cum.a), b: copy(cum.b) };
      const assignment = srm(look.a.entry, look.b.entry, config.srmFlagP);
      const analysed = srm(look.a.inview, look.b.inview, config.srmFlagP);
      const ok = consistent(look);
      const evaluated = ok && smaller(look) >= minPerGroup;
      let conflict = false;
      let own: Interval | null = null;
      if (evaluated) {
        own = primaryCs(look, alpha);
        if (own !== null) {
          const r = intersect(primary, own);
          primary = r.band;
          conflict ||= r.conflict;
        }
        const g = guardrailCs(look, alpha);
        if (g !== null) {
          const r = intersect(guardrail, g);
          guardrail = r.band;
          conflict ||= r.conflict;
        }
      }
      const flagged = !!(assignment?.flagged || analysed?.flagged);
      steps.push({ look, evaluated, consistent: ok, assignment, analysed, flagged, own, primary, guardrail, conflict });
    }
  }

  // The walks. A decision or an A/A failure freezes the analysis at its look; in the A/B an SRM
  // flag freezes it too (suppressed). A data fault holds it at the last clean look before the fault,
  // and so does a deciding, failing or suppressing look that is itself faulty: it keeps its outcome,
  // but its counts and intervals are not reported.
  const margin = config.guardrail.marginPp / 100;
  const faulty = (s: Step) => !s.consistent || s.conflict;
  let frozen: number | null = null;
  let suppressedAt: number | null = null;
  let heldAt: number | null = null;
  let held: Held | null = null;
  let decision: 'ship-b' | 'stop-for-harm' | null = null;
  let failed: CalibrationCheck['failed'] = null;
  const faultOf = (s: Step): Held => ({ on: s.look.day, reason: s.consistent ? 'band-conflict' : 'inconsistent-counts' });
  for (const [k, s] of steps.entries()) {
    if (ab) {
      if (s.flagged) suppressedAt = k;
      if (faulty(s)) [heldAt, held] = [k, faultOf(s)];
      if (suppressedAt !== null || heldAt !== null) break;
      if (!s.evaluated || s.primary === null) continue;
      if (s.primary.lower > 0 && s.guardrail !== null && s.guardrail.upper < margin) decision = 'ship-b';
      else if (s.primary.upper < 0) decision = 'stop-for-harm';
      if (decision !== null) {
        frozen = k;
        break;
      }
    } else {
      if (s.flagged) failed = { day: s.look.day, reason: 'srm' };
      else if (!s.consistent) failed = { day: s.look.day, reason: 'data-fault' };
      else if (s.evaluated && ((s.own !== null && excludesZero(s.own)) || (s.primary !== null && excludesZero(s.primary)))) {
        failed = { day: s.look.day, reason: 'interval-excludes-zero' };
      } else if (s.conflict) failed = { day: s.look.day, reason: 'data-fault' }; // the guardrail band alone
      if (failed !== null) {
        frozen = k;
        if (faulty(s)) [heldAt, held] = [k, faultOf(s)];
        break;
      }
    }
  }
  // The analysis reported: up to the deciding, failing or suppressing look, or just before a fault.
  const heldStep = heldAt;
  const stopStep = frozen ?? suppressedAt;
  const analysisSteps = heldStep !== null ? steps.slice(0, heldStep) : stopStep !== null ? steps.slice(0, stopStep + 1) : steps;
  const last = analysisSteps[analysisSteps.length - 1];
  const frozenAt = frozen === null ? null : steps[frozen]!.look.day;
  // The flag the outcome rests on. In the A/B: the suppressing look, or (when held) the first flag
  // at or after the fault, which still suppresses the verdict, so "SRM passed" is never shown beside
  // a flag. In the A/A: the failing look when it failed on the split. Flags after an A/B decision
  // are only `afterDecision`; flags after an A/A failure are not picked up.
  const flaggedStep: Step | undefined = ab
    ? suppressedAt !== null
      ? steps[suppressedAt]
      : heldStep !== null
        ? steps.slice(heldStep).find((s) => s.flagged)
        : undefined
    : failed?.reason === 'srm'
      ? steps[frozen!]
      : undefined;
  const suppressed = ab && flaggedStep !== undefined;
  const firstFlagged = flaggedStep?.look.day ?? null;
  const flaggedBase = flaggedStep
    ? flaggedStep.assignment?.flagged && flaggedStep.analysed?.flagged
      ? 'both'
      : flaggedStep.assignment?.flagged
        ? 'entry'
        : 'analysed'
    : null;
  const faultSteps = steps.slice(0, (heldStep ?? stopStep ?? steps.length - 1) + 1);
  const bandConflictOn = faultSteps.find((s) => s.conflict)?.look.day ?? null;
  const inconsistentOn = faultSteps.find((s) => !s.consistent)?.look.day ?? null;

  // The counts the analysis stands on: the last look reported once it has ended, else the
  // analysable totals.
  const ended = heldStep !== null || stopStep !== null;
  const basis: Counts2 = !ended ? analysable : last !== undefined ? last.look : { a: zeros(), b: zeros() };
  // A suppressed verdict shows the split that failed (its body draws no chart).
  const shown: Counts2 = suppressed ? flaggedStep!.look : basis;
  const blinded = smaller(basis) < minPerGroup;
  const primary = blinded ? null : (last?.primary ?? null);
  const guardrail = blinded ? null : (last?.guardrail ?? null);
  const series: CsPoint[] = blinded
    ? []
    : analysisSteps.filter((s) => s.evaluated && s.primary !== null).map((s) => csPointFromInterval({ nA: s.look.a.inview, nB: s.look.b.inview }, s.primary!));

  // The calibration check.
  let calibration: CalibrationCheck | null = null;
  if (!ab) {
    const { minDays, minAnalysedViews } = config.calibration;
    const reached = steps.find((s) => s.look.a.inview + s.look.b.inview >= minAnalysedViews)?.look.day;
    const earliest = dayPlus(berlinDay(i.start), minDays - 1);
    const candidate = reached === undefined ? null : reached > earliest ? reached : earliest;
    const evaluatedOn = candidate !== null && isCompleted(candidate) ? candidate : null;
    // Up to the end of the calibration: a flag before it would have failed it.
    const srmPassed = firstFlagged === null;
    const intervalContainsZero =
      failed?.reason === 'interval-excludes-zero' ? false : primary === null ? null : !excludesZero(primary);
    const clean = held === null && bandConflictOn === null && inconsistentOn === null;
    calibration = {
      days: berlinDaysBetween(i.start, i.now),
      analysed: basis.a.inview + basis.b.inview,
      srmPassed,
      intervalContainsZero,
      evaluatedOn,
      ready: evaluatedOn !== null && srmPassed && intervalContainsZero === true && failed === null && clean,
      failed,
    };
  }

  // The phase: the first that applies. The aaFailed flag counts only for the calibration it was set
  // in: a flag dated before this calibration's start belongs to an earlier run and is ignored.
  const counted = current.a.entry + current.b.entry > 0;
  const flag = i.flags.aaFailed;
  const aaFlag = !ab && flag !== null && Date.parse(flag.on) >= Date.parse(i.start) ? flag : null;
  let phase: LivePhase;
  if (!ab && !counted) phase = 'before-data';
  else if (failed !== null || aaFlag !== null) phase = 'aa-failed';
  else if (suppressed) phase = 'srm-suppressed';
  else if (decision !== null) phase = decision;
  else if (endMs !== null && nowMs >= endMs) phase = 'inconclusive';
  else phase = config.phase;

  const freshness: Freshness = i.flags.paused ? { kind: 'paused', pausedOn: i.flags.paused.on, reason: i.flags.paused.reason } : { kind: 'fresh' };
  const x = Math.round(config.primary.planningBaseline * config.capPerArm);
  const projected = mixtureCs({ xA: x, nA: config.capPerArm, xB: x, nB: config.capPerArm }, { tau2: TAU2.primary, alpha }).halfWidth * 100;

  const live: LiveSnapshot = {
    phase,
    freshness,
    nA: shown.a.inview,
    nB: shown.b.inview,
    series,
    capPerArm: config.capPerArm,
    projectedHalfWidthAtCap: projected,
    plannedEnd: end.at,
    plannedEndKind: end.kind,
  };
  if (config.ab.startedOn !== null) live.abStartedOn = config.ab.startedOn;
  if (ab && frozenAt !== null) live.decidedOn = berlinStartOfDay(frozenAt);
  if (ab && guardrail !== null) {
    // In points and clamped to ±100 like the series (the views are not used).
    const g = csPointFromInterval({ nA: 0, nB: 0 }, guardrail);
    live.guardrail = { lower: g.lower, upper: g.upper, limit: config.guardrail.marginPp };
  }
  if (phase === 'aa-failed') {
    const base = failed !== null ? { on: berlinStartOfDay(failed.day), reason: AA_WORDS[failed.reason] } : { on: aaFlag!.on, reason: aaFlag!.reason };
    live.aaFailed = aaFlag === null ? base : { ...base, reason: aaFlag.reason, ...(aaFlag.restartsOn ? { restartsOn: aaFlag.restartsOn } : {}) };
  }

  // The funnel: everything counted from the start day on.
  const excluded = Object.fromEntries(REJECT_REASONS.map((r) => [r, 0])) as Record<RejectReason, number>;
  for (const [, byReason] of rejectionDays) for (const r of REJECT_REASONS) excluded[r] += byReason[r] ?? 0;
  const entryViews = current.a.entry + current.b.entry;
  const beaconsReceived = entryViews + excluded.bot + excluded.internal + excluded.self + excluded.forced + excluded.not_entry;

  const itt =
    blinded || basis.a.entry < 1 || basis.b.entry < 1 ? null : { a: basis.a.card / basis.a.entry, b: basis.b.card / basis.b.entry };

  const detect = (n: number) =>
    detectableEffectCs({ nPerArm: n, baseline: config.primary.planningBaseline, tau2: TAU2.primary, alpha, power: config.power });
  const sizes: number[] = [];
  for (let n = minPerGroup; n < config.capPerArm; n += DETECTABLE_STEP) sizes.push(n);
  sizes.push(config.capPerArm);
  const points: DetectableCurve['points'] = [];
  for (const n of sizes) {
    const effect = detect(n);
    if (Number.isFinite(effect)) points.push({ nPerArm: n, effect });
  }
  const n = smaller(basis);
  const atCurrent = n >= 1 ? detect(n) : null;

  return {
    schema: 1,
    source: i.source,
    readAt: i.now,
    namespace: config.namespace,
    configPhase: config.phase,
    status: phase,
    live,
    looks: analysisSteps.map((s) => s.look),
    current,
    frozenAt,
    funnel: { beaconsReceived, botFiltered: beaconsReceived - excluded.bot - excluded.internal, entryViews, analysed: current.a.inview + current.b.inview, excluded },
    srm: {
      assignment: (flaggedStep ?? last)?.assignment ?? null,
      analysed: (flaggedStep ?? last)?.analysed ?? null,
      firstFlaggedOn: firstFlagged,
      flaggedBase,
      flaggedLook: flaggedStep?.look ?? null,
      afterDecision: decision !== null && frozen !== null && steps.slice(frozen + 1).some((s) => s.flagged),
    },
    blinded,
    primary,
    guardrail,
    bandConflictOn,
    inconsistentOn,
    held,
    itt,
    calibration,
    detectable: {
      baseline: config.primary.planningBaseline,
      power: config.power,
      tau2: TAU2.primary,
      looks: 'one look at n',
      points,
      atCurrent: atCurrent !== null && Number.isFinite(atCurrent) ? atCurrent : null,
    },
    ceilingDays,
  };
}

/**
 * The closed marker the snapshot calls for, or null. Each one ends something that never resumes, so
 * counting more would only feed numbers nothing reports:
 * - the first decision;
 * - an A/A failure by rule, at its look;
 * - an A/B held at a data fault (the test is stopped there), at the fault's day;
 * - an A/A failed by the flag alone, on the flag's Berlin day (the calibration restarts in a new
 *   namespace, so this one is finished).
 */
export function closingMarker(s: ExperimentSnapshot): ClosedMarker | null {
  if (s.closed) return s.closed;
  if ((s.status === 'ship-b' || s.status === 'stop-for-harm') && s.frozenAt !== null) return { kind: 'decision', day: s.frozenAt };
  if (s.calibration?.failed) return { kind: 'aa-failed', day: s.calibration.failed.day };
  if (s.configPhase === 'ab' && s.held !== null) return { kind: 'held', day: s.held.on };
  if (s.status === 'aa-failed' && s.live.aaFailed) return { kind: 'aa-failed', day: berlinDay(s.live.aaFailed.on) };
  return null;
}
