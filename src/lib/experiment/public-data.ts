// The published data of the live experiment (/experiment/data.json): what a reader needs to check
// the analysis against the pre-registration, and nothing that could single out a visitor. Pure.
//
// - Cumulative counts: the looks (completed Berlin days, up to the deciding look) and the current
//   totals. The looks are published together, so consecutive looks give each day's aggregate
//   change: the counts carry no identifiers, but they are not anonymous (the file's notes say so).
// - `current` (refreshed every 5 minutes) holds exposures only (entry and inview views), so every
//   outcome comes at the daily resolution of a look.
// - A count from 1 to 4 prints as "<5"; 0 prints as 0, because a zero identifies no one. No sum of
//   published cells is published (the funnel gives only its exclusion reasons, the calibration no
//   analysed total), and no ratio is published beside a small cell, so no identity in the file
//   gives a "<5" cell back. The interval estimate with the analysed views can still imply a small
//   card count; the interval is what the file is for, and the notes say so. Whether the split
//   check failed is published even beside a "<5" count it rests on, so it too can narrow that
//   count; the notes say that as well.
// - Outcomes (engaged, card, secondary) are withheld, key and all, from any look with fewer than 50
//   analysed views in either group, and from the whole file while blinded. The intervals are null
//   and `itt` is left out while blinded. CV and contact clicks (descriptive) are never in a look:
//   they appear only as final totals once the test has ended (`finalDescriptive`).
// - No p-value anywhere. The split check gives its chi-square, which is withheld (null) where a
//   count it rests on is a small cell, since it would give the cell away.
// - The detectable effect at the current size is withheld while the smaller group is a small
//   cell, for the same reason; `atCurrentNote` says why it is null.
// - A placeholder (no data) publishes no decision, and `unavailable` says why.
// - It carries the pre-registration's version, tag, commit and design hash.
// - Every number is finite: a non-finite one throws a TypeError, so Infinity or NaN never reaches
//   the file (JSON would write them as null without saying so).
import { EXPERIMENT, TAU2, type ExperimentConfig, type ExperimentPhase } from '../../experiment.config.ts';
import type { LivePhase } from '../figure/states.ts';
import { REJECT_REASONS, type RejectReason } from './events.ts';
import { preregHash } from './prereg-hash.ts';
import { closingMarker, type CalibrationCheck, type ExperimentSnapshot, type Held, type Interval, type Look, type SrmResult } from './snapshot.ts';
import type { GroupCounts } from './store.ts';

export type Cell = number | '<5';
/** Exposures always; engaged, card and secondary only from 50 analysed views a group. */
export type PublicCounts = Partial<Record<'engaged' | 'card' | 'secondary', Cell>> & { entry: Cell; inview: Cell };
export type PublicExposures = { entry: Cell; inview: Cell };
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
  /** 'fixture' is the no-credentials placeholder, never data; 'unavailable' has no data either. */
  source: ExperimentSnapshot['source'];
  /** Why a placeholder has no data; null for real data and the fixture. */
  unavailable: 'not-started' | 'unreadable' | null;
  /** Plain-language notes on what the counts can and cannot tell. */
  notes: string[];
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
  /** Excluded entry views by reason. The counted views are in `current`; no totals are given. */
  funnel: { excluded: Record<RejectReason, Cell> };
  srm: {
    assignment: PublicSrm | null;
    analysed: PublicSrm | null;
    firstFlaggedOn: string | null;
    flaggedBase: ExperimentSnapshot['srm']['flaggedBase'];
    flaggedLook: PublicLook | null;
    afterDecision: boolean;
  };
  looks: PublicLook[];
  /** Exposures now, today's partial row included. */
  current: { a: PublicExposures; b: PublicExposures };
  /** B − A in proportions, intersected over the evaluated looks; null while blinded. */
  primary: Interval | null;
  guardrail: Interval | null;
  /**
   * Card clicks per entry view at the last look; left out while blinded, and null while a card or
   * entry cell of that look is a small cell.
   */
  itt?: { a: number; b: number } | null;
  /** CV and contact clicks at the last look, once the test has ended; null before. */
  finalDescriptive: { day: string; a: { cv: Cell; contact: Cell }; b: { cv: Cell; contact: Cell } } | null;
  /** The phase when it is an outcome. */
  decision: 'ship-b' | 'stop-for-harm' | 'inconclusive' | null;
  decidedOn: string | null;
  frozenAt: string | null;
  closureMismatch?: true;
  plannedEnd: string;
  plannedEndKind: 'fixed' | 'earliest';
  bandConflictOn: string | null;
  inconsistentOn: string | null;
  held: Held | null;
  /** Days that reached the daily ceiling: they feed no look until reviewed. */
  ceilingDays: string[];
  /** The calibration check, without its analysed total (a sum of published cells). */
  calibration: Omit<CalibrationCheck, 'analysed'> | null;
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

const LOOK_OUTCOMES = ['engaged', 'card', 'secondary'] as const;
const OUTCOME_PHASES = ['ship-b', 'stop-for-harm', 'inconclusive'] as const;

const NOTES = [
  'Counts are totals per Berlin day with no identifiers. They are not anonymous: someone who knows when a person visited could link a change between two days to that visit.',
  'A count from 1 to 4 is shown as "<5", and no total or ratio of shown counts is given that would undo it. The interval estimate, read with the analysed views, can still imply a small card-click count; the interval is what this file is for.',
  'CV and contact clicks are given only as final totals, once the test has ended.',
  'The split check gives its chi-square statistic, not a p-value.',
  'Whether the split check failed is published even when a count it rests on is shown as "<5", so the split-check status itself can narrow such a count, as the interval can.',
];

/** The calibration check without its analysed total, which is the sum of two published cells. */
function withoutAnalysed(c: CalibrationCheck): Omit<CalibrationCheck, 'analysed'> {
  const { days, srmPassed, intervalContainsZero, evaluatedOn, ready, failed } = c;
  return { days, srmPassed, intervalContainsZero, evaluatedOn, ready, failed };
}

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
    const out: PublicCounts = { entry: cell(g.entry), inview: cell(g.inview) };
    if (outcomes) for (const t of LOOK_OUTCOMES) out[t] = cell(g[t]);
    return out;
  };
  const exposures = (g: GroupCounts): PublicExposures => ({ entry: cell(g.entry), inview: cell(g.inview) });
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

  // Outcomes at the last look only, and no ratio beside a small cell.
  const lastLook = s.looks[s.looks.length - 1] ?? null;
  const lastShown = lastLook !== null && outcomesFrom(lastLook.a, lastLook.b);
  const ittSafe = lastShown && [lastLook.a.card, lastLook.a.entry, lastLook.b.card, lastLook.b.entry].every((n) => !isSmall(n) && n > 0);
  const itt = ittSafe ? { a: lastLook.a.card / lastLook.a.entry, b: lastLook.b.card / lastLook.b.entry } : null;
  const ended = s.source !== 'unavailable' && (closingMarker(s) !== null || s.status === 'inconclusive');
  const finalDescriptive =
    ended && lastShown
      ? { day: lastLook.day, a: { cv: cell(lastLook.a.cv), contact: cell(lastLook.a.contact) }, b: { cv: cell(lastLook.b.cv), contact: cell(lastLook.b.contact) } }
      : null;
  const placeholder = s.source === 'unavailable';

  const data: PublicData = {
    schema: 'experiment-data/1',
    namespace: s.namespace,
    configPhase: s.configPhase,
    status: s.status,
    prereg: { version: config.prereg.version, tag: config.prereg.tag, commit: build.commit, configSha256: preregHash() },
    readAt: s.readAt,
    source: s.source,
    unavailable: placeholder ? (s.unavailable ?? 'unreadable') : null,
    notes: [...NOTES],
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
    funnel: { excluded },
    srm: {
      assignment: srm(s.srm.assignment, 'entry'),
      analysed: srm(s.srm.analysed, 'inview'),
      firstFlaggedOn: s.srm.firstFlaggedOn,
      flaggedBase: s.srm.flaggedBase,
      flaggedLook: s.srm.flaggedLook === null ? null : look(s.srm.flaggedLook),
      afterDecision: s.srm.afterDecision,
    },
    looks: s.looks.map(look),
    current: { a: exposures(s.current.a), b: exposures(s.current.b) },
    primary: s.blinded ? null : s.primary,
    guardrail: s.blinded ? null : s.guardrail,
    ...(s.blinded ? {} : { itt }),
    finalDescriptive,
    decision: !placeholder && (OUTCOME_PHASES as readonly string[]).includes(s.status) ? (s.status as PublicData['decision']) : null,
    decidedOn: s.live.decidedOn ?? null,
    frozenAt: s.frozenAt,
    ...(s.closureMismatch ? { closureMismatch: true as const } : {}),
    plannedEnd: s.live.plannedEnd,
    plannedEndKind: s.live.plannedEndKind,
    bandConflictOn: s.bandConflictOn,
    inconsistentOn: s.inconsistentOn,
    held: s.held,
    ceilingDays: [...s.ceilingDays],
    calibration: s.calibration === null ? null : withoutAnalysed(s.calibration),
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
