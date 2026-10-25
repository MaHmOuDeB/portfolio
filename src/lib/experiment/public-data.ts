// The published data of the live experiment (/experiment/data.json): what a reader needs to check
// the analysis against the pre-registration, and nothing that could single out a visitor. Pure.
//
// - Cumulative counts only: the looks (completed Berlin days, up to the deciding look) and the
//   current totals. No per-day rows.
// - A count from 1 to 4 prints as "<5"; 0 prints as 0, because a zero identifies no one.
// - Outcomes (engaged, card, secondary, cv, contact) are withheld, key and all, while either group
//   has fewer than 50 analysed views: in the whole file while blinded, and in any look or total
//   below 50 a group after that. The intervals are null and `itt` is left out while blinded.
// - No p-value anywhere. The split check gives its chi-square, which is withheld (null) where a
//   count it rests on is a small cell, since it would give the cell away.
// - The detectable effect at the current size is withheld while the smaller group is a small
//   cell, for the same reason; `atCurrentNote` says why it is null.
// - It carries the pre-registration's version, tag, commit and design hash.
// - Every number is finite: a non-finite one throws a TypeError, so Infinity or NaN never reaches
//   the file (JSON would write them as null without saying so).
import { EXPERIMENT, TAU2, type ExperimentConfig, type ExperimentPhase } from '../../experiment.config.ts';
import type { LivePhase } from '../figure/states.ts';
import { EVENT_TYPES, REJECT_REASONS, type EventType, type RejectReason } from './events.ts';
import { preregHash } from './prereg-hash.ts';
import type { CalibrationCheck, ExperimentSnapshot, Held, Interval, Look, SrmResult } from './snapshot.ts';
import type { GroupCounts } from './store.ts';

export type Cell = number | '<5';
/** Exposures always; outcomes only from 50 analysed views a group. */
export type PublicCounts = Partial<Record<EventType, Cell>> & { entry: Cell; inview: Cell };
export type PublicLook = { day: string; a: PublicCounts; b: PublicCounts };
export type PublicSrm = { chi2: number | null; flagged: boolean };

export type PublicData = {
  schema: 'experiment-data/1';
  namespace: string;
  /** The configured phase, and the state the data puts it in. */
  configPhase: ExperimentPhase;
  status: LivePhase;
  prereg: { version: string; tag: string; commit: string | null; configSha256: string };
  readAt: string;
  /** 'fixture' is the no-credentials placeholder, never data. */
  source: ExperimentSnapshot['source'];
  config: {
    alpha: number;
    power: number;
    srmFlagP: number;
    minPerGroup: number;
    capPerArm: number;
    entryCapPerArm: number;
    ab: { capMonths: number };
    calibration: { minDays: number; minAnalysedViews: number };
    guardrail: { quickExitSeconds: number; marginPp: number };
    cardsInView: ExperimentConfig['cardsInView'];
    dailyEntryCeiling: number;
    planningBaselines: { primary: number; guardrail: number };
    TAU2: { primary: number; guardrail: number };
  };
  blinded: boolean;
  funnel: { beaconsReceived: Cell; botFiltered: Cell; entryViews: Cell; analysed: Cell; excluded: Record<RejectReason, Cell> };
  srm: {
    assignment: PublicSrm | null;
    analysed: PublicSrm | null;
    firstFlaggedOn: string | null;
    flaggedBase: ExperimentSnapshot['srm']['flaggedBase'];
    flaggedLook: PublicLook | null;
    afterDecision: boolean;
  };
  looks: PublicLook[];
  current: { a: PublicCounts; b: PublicCounts };
  /** B − A in proportions, intersected over the evaluated looks; null while blinded. */
  primary: Interval | null;
  guardrail: Interval | null;
  /** Card clicks per entry view; left out while blinded. */
  itt?: { a: number; b: number } | null;
  /** The phase when it is an outcome. */
  decision: 'ship-b' | 'stop-for-harm' | 'inconclusive' | null;
  decidedOn: string | null;
  frozenAt: string | null;
  plannedEnd: string;
  plannedEndKind: 'fixed' | 'earliest';
  bandConflictOn: string | null;
  inconsistentOn: string | null;
  held: Held | null;
  /** Days that reached the daily ceiling: they feed no look until reviewed. */
  ceilingDays: string[];
  calibration: (Omit<CalibrationCheck, 'analysed'> & { analysed: Cell }) | null;
  detectable: {
    baseline: number;
    power: number;
    tau2: number;
    looks: 'one look at n';
    points: { nPerArm: number; effect: number }[];
    atCurrent: number | null;
    atCurrentNote: 'no-views' | 'small-cell' | 'beyond-range' | null;
  };
};

const EXPOSURES: readonly EventType[] = ['entry', 'inview'];
const OUTCOME_PHASES = ['ship-b', 'stop-for-harm', 'inconclusive'] as const;

/** Throws on a non-finite number anywhere in the value. */
function finiteOnly(_key: string, value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('published data holds a non-finite number');
  return value;
}

export function toPublicData(s: ExperimentSnapshot, build: { commit: string | null }, config: ExperimentConfig = EXPERIMENT): PublicData {
  const below = config.smallCellBelow;
  if (below !== 5) throw new TypeError('the published small-cell label is "<5"');
  const isSmall = (n: number) => n >= 1 && n < below;
  const cell = (n: number): Cell => (isSmall(n) ? '<5' : n);
  const outcomesFrom = (a: GroupCounts, b: GroupCounts) => !s.blinded && Math.min(a.inview, b.inview) >= config.minPerGroup;
  const counts = (g: GroupCounts, outcomes: boolean): PublicCounts => {
    const out: Partial<Record<EventType, Cell>> = {};
    for (const t of EVENT_TYPES) if (outcomes || EXPOSURES.includes(t)) out[t] = cell(g[t]);
    return out as PublicCounts;
  };
  const look = (l: Look): PublicLook => {
    const shown = outcomesFrom(l.a, l.b);
    return { day: l.day, a: counts(l.a, shown), b: counts(l.b, shown) };
  };

  // The split check rests on the flagged look, else on the last look reported.
  const srmLook = s.srm.flaggedLook ?? s.looks[s.looks.length - 1] ?? null;
  const srm = (r: SrmResult | null, base: 'entry' | 'inview'): PublicSrm | null => {
    if (r === null) return null;
    const small = srmLook === null || isSmall(srmLook.a[base]) || isSmall(srmLook.b[base]);
    return { chi2: small ? null : r.chi2, flagged: r.flagged };
  };

  const smaller = Math.min(s.live.nA, s.live.nB);
  const atCurrentNote: PublicData['detectable']['atCurrentNote'] =
    smaller < 1 ? 'no-views' : isSmall(smaller) ? 'small-cell' : s.detectable.atCurrent === null ? 'beyond-range' : null;

  const excluded = Object.fromEntries(REJECT_REASONS.map((r) => [r, cell(s.funnel.excluded[r])])) as Record<RejectReason, Cell>;
  const currentOutcomes = outcomesFrom(s.current.a, s.current.b);

  const data: PublicData = {
    schema: 'experiment-data/1',
    namespace: s.namespace,
    configPhase: s.configPhase,
    status: s.status,
    prereg: { version: config.prereg.version, tag: config.prereg.tag, commit: build.commit, configSha256: preregHash() },
    readAt: s.readAt,
    source: s.source,
    config: {
      alpha: config.alpha,
      power: config.power,
      srmFlagP: config.srmFlagP,
      minPerGroup: config.minPerGroup,
      capPerArm: config.capPerArm,
      entryCapPerArm: config.entryCapPerArm,
      ab: { capMonths: config.ab.capMonths },
      calibration: { minDays: config.calibration.minDays, minAnalysedViews: config.calibration.minAnalysedViews },
      guardrail: { quickExitSeconds: config.guardrail.quickExitSeconds, marginPp: config.guardrail.marginPp },
      cardsInView: config.cardsInView,
      dailyEntryCeiling: config.dailyEntryCeiling,
      planningBaselines: { primary: config.primary.planningBaseline, guardrail: config.guardrail.planningBaseline },
      TAU2,
    },
    blinded: s.blinded,
    funnel: {
      beaconsReceived: cell(s.funnel.beaconsReceived),
      botFiltered: cell(s.funnel.botFiltered),
      entryViews: cell(s.funnel.entryViews),
      analysed: cell(s.funnel.analysed),
      excluded,
    },
    srm: {
      assignment: srm(s.srm.assignment, 'entry'),
      analysed: srm(s.srm.analysed, 'inview'),
      firstFlaggedOn: s.srm.firstFlaggedOn,
      flaggedBase: s.srm.flaggedBase,
      flaggedLook: s.srm.flaggedLook === null ? null : look(s.srm.flaggedLook),
      afterDecision: s.srm.afterDecision,
    },
    looks: s.looks.map(look),
    current: { a: counts(s.current.a, currentOutcomes), b: counts(s.current.b, currentOutcomes) },
    primary: s.blinded ? null : s.primary,
    guardrail: s.blinded ? null : s.guardrail,
    ...(s.blinded ? {} : { itt: s.itt }),
    decision: (OUTCOME_PHASES as readonly string[]).includes(s.status) ? (s.status as PublicData['decision']) : null,
    decidedOn: s.live.decidedOn ?? null,
    frozenAt: s.frozenAt,
    plannedEnd: s.live.plannedEnd,
    plannedEndKind: s.live.plannedEndKind,
    bandConflictOn: s.bandConflictOn,
    inconsistentOn: s.inconsistentOn,
    held: s.held,
    ceilingDays: [...s.ceilingDays],
    calibration: s.calibration === null ? null : { ...s.calibration, analysed: cell(s.calibration.analysed) },
    detectable: {
      baseline: s.detectable.baseline,
      power: s.detectable.power,
      tau2: s.detectable.tau2,
      looks: s.detectable.looks,
      points: s.detectable.points,
      atCurrent: atCurrentNote === null ? s.detectable.atCurrent : null,
      atCurrentNote,
    },
  };
  // Through JSON once with the finiteness check: the result is exactly what the route sends.
  return JSON.parse(JSON.stringify(data, finiteOnly)) as PublicData;
}
