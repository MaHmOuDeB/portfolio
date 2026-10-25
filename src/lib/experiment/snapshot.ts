// The snapshot builder: the experiment's counters in, everything the pages and the published data
// show out. Pure: no I/O and no clock (`now` is passed in), and it imports only types from the
// store and the flags, so it runs anywhere the statistics run.
//
// The rules, in the order they apply:
// - Looks. A Berlin day is completed once `now` is on a later Berlin day. Each completed day from
//   the start gives a cumulative look; today's partial row is counted in the current totals but
//   never in a look, so a partial day decides nothing. A look is evaluated once both groups have
//   at least `minPerGroup` analysed views.
// - A day that reached the daily ceiling (a `ceiling` rejection on that day) may hold a flood, so
//   it feeds no look until it has been reviewed: its rows stay in the current totals and the
//   funnel, and are left out of every look.
// - Intervals. The primary (card clicks of analysed views) and the guardrail (quick exits of entry
//   views) each get the mixture confidence sequence, intersected over the evaluated looks. A look
//   that would empty an intersection leaves the band as it was and records the day.
// - SRM on entry and analysed views at every completed look; the first flag is sticky.
// - The A/B decision walks the evaluated looks: an SRM flag stops it; otherwise the first look at
//   which ship B or stop for harm holds is the decision, and the analysis freezes there. Later rows
//   never change the looks, the interval or the counts shown; a later SRM flag is only a note.
// - The A/A fails by rule at the first completed look with an SRM flag, or whose intersected
//   interval excludes 0; the analysis freezes there too.
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
import type { ClosedMarker, CounterRows, DayCounts, GroupCounts } from './store.ts';
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
  failed: { day: string; reason: 'srm' | 'interval-excludes-zero' } | null;
};
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
  source: 'store' | 'local' | 'fixture';
  readAt: string;
  namespace: string;
  /** The configured phase; the state the data puts it in is `live.phase`. */
  phase: ExperimentPhase;
  live: LiveSnapshot;
  /** Completed days from the start day, up to the deciding look. */
  looks: Look[];
  /** Totals now, today's partial row included. */
  current: { a: GroupCounts; b: GroupCounts };
  /** The deciding look's day (a decision or an A/A failure). */
  frozenAt: string | null;
  funnel: Funnel;
  srm: { assignment: SrmResult | null; analysed: SrmResult | null; firstFlaggedOn: string | null; afterDecision: boolean };
  blinded: boolean;
  /** The primary interval, intersected over the evaluated looks. */
  primary: Interval | null;
  guardrail: Interval | null;
  bandConflictOn: string | null;
  /** Card clicks per entry view, descriptive. */
  itt: { a: number; b: number } | null;
  calibration: CalibrationCheck | null;
  detectable: DetectableCurve;
  /** Days that reached the daily ceiling: they feed no look until reviewed. */
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

const AA_WORDS = { srm: 'the split check failed', 'interval-excludes-zero': 'the two identical groups differed' } as const;
const DETECTABLE_STEP = 25;

const zeros = (): GroupCounts => Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as GroupCounts;
const copy = (g: GroupCounts): GroupCounts => ({ ...g });
function add(into: GroupCounts, g: GroupCounts): void {
  for (const t of EVENT_TYPES) into[t] += g[t];
}
const smaller = (c: { a: GroupCounts; b: GroupCounts }) => Math.min(c.a.inview, c.b.inview);

/** The interval of B − A for x of n in each group, or null when a group has no views. */
function cs(xA: number, nA: number, xB: number, nB: number, tau2: number, alpha: number): Interval | null {
  if (nA < 1 || nB < 1) return null;
  // A day boundary can split an event from the one it depends on (a click just after midnight on
  // the start day or after a left-out ceiling day), so a count is never allowed above its base.
  const clip = (x: number, n: number) => Math.min(Math.max(x, 0), n);
  const { estimate, lower, upper } = mixtureCs({ xA: clip(xA, nA), nA, xB: clip(xB, nB), nB }, { tau2, alpha });
  return { estimate, lower, upper };
}

const primaryCs = (c: { a: GroupCounts; b: GroupCounts }, alpha: number) => cs(c.a.card, c.a.inview, c.b.card, c.b.inview, TAU2.primary, alpha);
const guardrailCs = (c: { a: GroupCounts; b: GroupCounts }, alpha: number) =>
  cs(c.a.entry - c.a.engaged, c.a.entry, c.b.entry - c.b.engaged, c.b.entry, TAU2.guardrail, alpha);

/** A running intersection: a look that would empty it keeps the band and reports the conflict. */
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
  assignment: SrmResult | null;
  analysed: SrmResult | null;
  flagged: boolean;
  /** The bands intersected up to and including this look. */
  primary: Interval | null;
  guardrail: Interval | null;
  conflict: boolean;
};

export function buildSnapshot(i: SnapshotInput): ExperimentSnapshot {
  const config = i.config ?? EXPERIMENT;
  const { alpha, minPerGroup } = config;
  const today = berlinDay(i.now);
  const ab = config.phase === 'ab';
  const end = plannedEnd(config, i.start);

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

  const current = { a: zeros(), b: zeros() };
  for (const d of rows) {
    add(current.a, d.a);
    add(current.b, d.b);
  }

  // Every completed look, with its SRM and the bands so far.
  const steps: Step[] = [];
  {
    const cum = { a: zeros(), b: zeros() };
    let primary: Interval | null = null;
    let guardrail: Interval | null = null;
    const completed = rows.filter((d: DayCounts) => d.day < today && (endDay === null || d.day < endDay) && !leftOut.has(d.day));
    for (const d of completed) {
      add(cum.a, d.a);
      add(cum.b, d.b);
      const look: Look = { day: d.day, a: copy(cum.a), b: copy(cum.b) };
      const assignment = srm(look.a.entry, look.b.entry, config.srmFlagP);
      const analysed = srm(look.a.inview, look.b.inview, config.srmFlagP);
      const evaluated = smaller(look) >= minPerGroup;
      let conflict = false;
      if (evaluated) {
        const p = primaryCs(look, alpha);
        if (p !== null) {
          const r = intersect(primary, p);
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
      steps.push({ look, evaluated, assignment, analysed, flagged: !!(assignment?.flagged || analysed?.flagged), primary, guardrail, conflict });
    }
  }

  // The walks: the first decision (A/B) or the first rule failure (A/A) freezes the analysis.
  const margin = config.guardrail.marginPp / 100;
  let frozen: number | null = null;
  let decision: 'ship-b' | 'stop-for-harm' | null = null;
  let failed: CalibrationCheck['failed'] = null;
  let suppressed = false;
  for (const [k, s] of steps.entries()) {
    if (ab) {
      if (s.flagged) {
        suppressed = true;
        break;
      }
      if (!s.evaluated || s.primary === null) continue;
      if (s.primary.lower > 0 && s.guardrail !== null && s.guardrail.upper < margin) decision = 'ship-b';
      else if (s.primary.upper < 0) decision = 'stop-for-harm';
      if (decision !== null) {
        frozen = k;
        break;
      }
    } else {
      if (s.flagged) failed = { day: s.look.day, reason: 'srm' };
      else if (s.evaluated && s.primary !== null && (s.primary.lower > 0 || s.primary.upper < 0)) failed = { day: s.look.day, reason: 'interval-excludes-zero' };
      if (failed !== null) {
        frozen = k;
        break;
      }
    }
  }
  const analysisSteps = frozen === null ? steps : steps.slice(0, frozen + 1);
  const last = analysisSteps[analysisSteps.length - 1];
  const frozenAt = frozen === null ? null : steps[frozen]!.look.day;
  const firstFlagged = steps.find((s) => s.flagged)?.look.day ?? null;

  // The counts the analysis stands on: the deciding look once frozen, else the current totals.
  const basis = frozen === null ? current : steps[frozen]!.look;
  const blinded = smaller(basis) < minPerGroup;
  const primary = blinded ? null : (last?.primary ?? null);
  const guardrail = blinded ? null : (last?.guardrail ?? null);
  const series: CsPoint[] = blinded
    ? []
    : analysisSteps.filter((s) => s.evaluated && s.primary !== null).map((s) => csPointFromInterval({ nA: s.look.a.inview, nB: s.look.b.inview }, s.primary!));
  const conflictStep = analysisSteps.find((s) => s.conflict);

  // The calibration check.
  let calibration: CalibrationCheck | null = null;
  if (!ab) {
    const { minDays, minAnalysedViews } = config.calibration;
    const reached = steps.find((s) => s.look.a.inview + s.look.b.inview >= minAnalysedViews)?.look.day;
    const earliest = dayPlus(berlinDay(i.start), minDays - 1);
    const candidate = reached === undefined ? null : reached > earliest ? reached : earliest;
    const evaluatedOn = candidate !== null && candidate < today ? candidate : null;
    const srmPassed = firstFlagged === null;
    const intervalContainsZero = primary === null ? null : primary.lower <= 0 && primary.upper >= 0;
    calibration = {
      days: berlinDaysBetween(i.start, i.now),
      analysed: basis.a.inview + basis.b.inview,
      srmPassed,
      intervalContainsZero,
      evaluatedOn,
      ready: evaluatedOn !== null && srmPassed && intervalContainsZero === true && failed === null,
      failed,
    };
  }

  // The phase: the first that applies.
  const counted = current.a.entry + current.b.entry > 0;
  const aaFlag = ab ? null : i.flags.aaFailed;
  let phase: LivePhase;
  if (!ab && !counted) phase = 'before-data';
  else if (failed !== null || aaFlag !== null) phase = 'aa-failed';
  else if (suppressed) phase = 'srm-suppressed';
  else if (decision !== null) phase = decision;
  else if (ab && end.kind === 'fixed' && Date.parse(i.now) >= Date.parse(end.at)) phase = 'inconclusive';
  else phase = config.phase;

  const freshness: Freshness = i.flags.paused ? { kind: 'paused', pausedOn: i.flags.paused.on, reason: i.flags.paused.reason } : { kind: 'fresh' };
  const x = Math.round(config.primary.planningBaseline * config.capPerArm);
  const projected = mixtureCs({ xA: x, nA: config.capPerArm, xB: x, nB: config.capPerArm }, { tau2: TAU2.primary, alpha }).halfWidth * 100;

  const live: LiveSnapshot = {
    phase,
    freshness,
    nA: basis.a.inview,
    nB: basis.b.inview,
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
  const points: DetectableCurve['points'] = [];
  for (let n = minPerGroup; n <= config.capPerArm; n += DETECTABLE_STEP) {
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
    phase: config.phase,
    live,
    looks: analysisSteps.map((s) => s.look),
    current,
    frozenAt,
    funnel: { beaconsReceived, botFiltered: beaconsReceived - excluded.bot - excluded.internal, entryViews, analysed: current.a.inview + current.b.inview, excluded },
    srm: {
      assignment: last?.assignment ?? null,
      analysed: last?.analysed ?? null,
      firstFlaggedOn: firstFlagged,
      afterDecision: frozen !== null && steps.slice(frozen + 1).some((s) => s.flagged),
    },
    blinded,
    primary,
    guardrail,
    bandConflictOn: conflictStep?.look.day ?? null,
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

/** The closed marker the counters call for (the first decision or an A/A failure by rule), or null. */
export function closingMarker(s: ExperimentSnapshot): ClosedMarker | null {
  if ((s.live.phase === 'ship-b' || s.live.phase === 'stop-for-harm') && s.frozenAt !== null) return { kind: 'decision', day: s.frozenAt };
  if (s.calibration?.failed) return { kind: 'aa-failed', day: s.calibration.failed.day };
  return null;
}
