// The Live test page's view of the experiment: one snapshot projected on the server, and the
// allowlisted display shape every Figure, island and sentence of the page receives.
//
// - `LivePageModel` is server only (the guard above): its Home model and live view keep the exact
//   counts, so it is never passed to a client component. It is built from the same three projections
//   the rest of the site uses (`toHomeModel`, `liveView`, `toPublicData`), for group A, because this
//   route assigns no group; its refs are the reader's.
// - `LivePageDisplay` is what the page renders from. Every per-group count in it is the published
//   cell of that count (`publishedCount`, the rule `data.json` uses), so no count from 1 to 4 is in
//   it. The kit's live components print exact counts, so they are offered the snapshot only when
//   every count they would print is 0 or at least 5 (`kitSafe`); otherwise the page draws its own.
//   The published data comes along without its chi-square statistics, outcome counts, ratios or
//   final click totals, and the display carries no p-value anywhere.
// - Every number in the display is finite: a non-finite one throws a TypeError before anything is
//   displayed (the regeneration fails and the last good page stays).
import 'server-only';
import type { DerivedRef } from '@/components/kit/Derived';
import { EXPERIMENT, type ExperimentConfig } from '@/experiment.config';
import { liveView, type LiveView } from '@/lib/experiment/live';
import { toPublicData, type PublicData, type PublicExposures } from '@/lib/experiment/public-data';
import type { ExperimentSnapshot } from '@/lib/experiment/snapshot';
import type { LiveSnapshot } from '@/lib/figure/cs-band';
import { publishedCount, type PublishedCount } from '@/lib/home/counts';
import { toHomeModel, type HomeMode, type HomeModel, type HomeOutcome } from '@/lib/home/model';
import { nextStepFor, type NextStep } from './next-step';

export type LivePageModel = { home: HomeModel; view: LiveView; data: PublicData };

export type PublishedPair = { a: PublishedCount; b: PublishedCount };
/** A drawn look: its published views per group and its interval, B − A in percentage points. */
export type DisplayPoint = { nA: PublishedCount; nB: PublishedCount; lower: number; upper: number; estimate: number };
export type PublicLookExposures = { day: string; a: PublicExposures; b: PublicExposures };
type PublicSrmFlag = { flagged: boolean } | null;

/** The published data the page shows, without chi-square, outcome counts, ratios or final click totals. */
export type LivePagePublic = {
  prereg: PublicData['prereg'];
  source: PublicData['source'];
  unavailable: PublicData['unavailable'];
  config: PublicData['config'];
  blinded: boolean;
  funnel: PublicData['funnel'];
  current: PublicData['current'];
  looks: PublicLookExposures[];
  primary: PublicData['primary'];
  guardrail: PublicData['guardrail'];
  decision: PublicData['decision'];
  decidedOn: string | null;
  frozenAt: string | null;
  plannedEnd: string;
  plannedEndKind: PublicData['plannedEndKind'];
  bandConflictOn: string | null;
  inconsistentOn: string | null;
  held: PublicData['held'];
  ceilingDays: string[];
  calibration: PublicData['calibration'];
  srm: {
    assignment: PublicSrmFlag;
    analysed: PublicSrmFlag;
    firstFlaggedOn: string | null;
    flaggedBase: PublicData['srm']['flaggedBase'];
    afterDecision: boolean;
  };
  detectable: PublicData['detectable'];
};

export type LivePageDisplay = {
  mode: HomeMode;
  configPhase: 'calibration' | 'ab';
  /** Where every live number comes from (the reader's refs). */
  refs: readonly DerivedRef[];
  readAt: string;
  countingClosed: boolean;
  closedConfirmed: boolean;
  /** The stored stop day of a stored-stop check (mode closure-check); null otherwise. */
  closedOn: string | null;
  calibration: HomeModel['calibration'];
  splitStatus: HomeModel['splitStatus'];
  split: null | { base: 'entry' | 'analysed' | 'both'; day: string; entry: PublishedPair; analysed: PublishedPair };
  held: HomeModel['held'];
  aaFailed: null | { on: string; reason: string };
  paused: null | { on: string; reason: string };
  outcome: HomeOutcome | null;
  afterDecisionSrm: boolean;
  decidedOn: string | null;
  plannedEnd: string;
  plannedEndKind: 'fixed' | 'earliest';
  abStartedOn: string | null;
  counts: { a: PublishedCount; b: PublishedCount; smaller: PublishedCount };
  /** The drawn looks (50 views a group and more). */
  series: DisplayPoint[];
  guardrail: LiveSnapshot['guardrail'] | null;
  nextStep: NextStep | null;
  public: LivePagePublic;
} & ({ kitSafe: true; kitSnapshot: LiveSnapshot } | { kitSafe: false; kitSnapshot: null });

/** The page's model of one snapshot. `config` is the pre-registered one unless a test passes its own. */
export function toLivePageModel(snapshot: ExperimentSnapshot, build: { commit: string | null }, config: ExperimentConfig = EXPERIMENT): LivePageModel {
  return { home: toHomeModel(snapshot, 'a'), view: liveView(snapshot, 'a'), data: toPublicData(snapshot, build, config) };
}

const pair = (p: { a: number; b: number }): PublishedPair => ({ a: publishedCount(p.a), b: publishedCount(p.b) });
/** A count the kit may print as it is: the published cell is the count itself. */
const exact = (n: number) => publishedCount(n) === n;

/** True when every count the kit's live components would print is 0 or at least 5. */
function kitSafe(s: LiveSnapshot): boolean {
  const all = [s.nA, s.nB, ...s.series.flatMap((p) => [p.nA, p.nB]), ...(s.yourViewN === undefined ? [] : [s.yourViewN])];
  return all.every(exact);
}

function publicPart(d: PublicData): LivePagePublic {
  const flag = (r: PublicData['srm']['assignment']): PublicSrmFlag => (r === null ? null : { flagged: r.flagged });
  return {
    prereg: d.prereg,
    source: d.source,
    unavailable: d.unavailable,
    config: d.config,
    blinded: d.blinded,
    funnel: d.funnel,
    current: d.current,
    looks: d.looks.map((l) => ({ day: l.day, a: { entry: l.a.entry, inview: l.a.inview }, b: { entry: l.b.entry, inview: l.b.inview } })),
    primary: d.primary,
    guardrail: d.guardrail,
    decision: d.decision,
    decidedOn: d.decidedOn,
    frozenAt: d.frozenAt,
    plannedEnd: d.plannedEnd,
    plannedEndKind: d.plannedEndKind,
    bandConflictOn: d.bandConflictOn,
    inconsistentOn: d.inconsistentOn,
    held: d.held,
    ceilingDays: d.ceilingDays,
    calibration: d.calibration,
    srm: {
      assignment: flag(d.srm.assignment),
      analysed: flag(d.srm.analysed),
      firstFlaggedOn: d.srm.firstFlaggedOn,
      flaggedBase: d.srm.flaggedBase,
      afterDecision: d.srm.afterDecision,
    },
    detectable: d.detectable,
  };
}

/** Throws on a non-finite number anywhere in the value. */
function assertFinite(value: unknown): void {
  JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new TypeError('the live page display holds a non-finite number');
    return v;
  });
}

export function toLivePageDisplay(model: LivePageModel): LivePageDisplay {
  const { home: m, view, data } = model;
  const f = m.live.freshness;
  const aa = m.live.aaFailed;
  const base = {
    mode: m.mode,
    configPhase: data.configPhase,
    refs: m.refs,
    readAt: m.readAt,
    countingClosed: m.countingClosed,
    closedConfirmed: m.closedConfirmed,
    closedOn: m.mode === 'closure-check' ? (m.closed?.day ?? null) : null,
    calibration: m.calibration,
    splitStatus: m.splitStatus,
    split: m.split === null ? null : { base: m.split.base, day: m.split.day, entry: pair(m.split.entry), analysed: pair(m.split.analysed) },
    held: m.held,
    aaFailed: m.mode === 'aa-failed' && aa ? { on: aa.on, reason: aa.reason } : null,
    paused: m.mode === 'paused' && f.kind === 'paused' ? { on: f.pausedOn, reason: f.reason } : null,
    outcome: m.outcome,
    afterDecisionSrm: m.afterDecisionSrm,
    decidedOn: m.live.decidedOn ?? null,
    plannedEnd: m.live.plannedEnd,
    plannedEndKind: m.live.plannedEndKind,
    abStartedOn: m.live.abStartedOn ?? null,
    counts: m.counts,
    series: m.live.series.map((p) => ({ nA: publishedCount(p.nA), nB: publishedCount(p.nB), lower: p.lower, upper: p.upper, estimate: p.estimate })),
    guardrail: m.live.guardrail ?? null,
    nextStep: nextStepFor(model),
    public: publicPart(data),
  };
  const out: LivePageDisplay = kitSafe(view.snapshot)
    ? { ...base, kitSafe: true, kitSnapshot: view.snapshot }
    : { ...base, kitSafe: false, kitSnapshot: null };
  assertFinite(out);
  return out;
}
