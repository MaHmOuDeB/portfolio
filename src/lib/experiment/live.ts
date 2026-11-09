// The experiment as pages read it: the snapshot from the store (or the no-credentials fixture), its
// freshness, and the live view a page renders. Server only.
//
// Reading policy. Nothing here ever shows fixture numbers in production, and a build never fails on
// experiment data (main deploys on merge, before and after launch):
// - Production before the calibration start is set: the not-started snapshot (a true state: the
//   event route counts nothing before the start), at build and at run time, with no store read.
//   The launch check blocks launch while the start is unset.
// - During `next build` (NEXT_PHASE=phase-production-build), anything that would throw below gives
//   the "unavailable" placeholder instead: zero counts, no fixture date, and a paused freshness that
//   says the counts could not be read. The first regeneration after the build replaces it.
// - At run time (ISR regeneration):
//   - on Vercel, VERCEL_ENV is always set: a development (or missing) one there is a misconfigured
//     deployment, and it throws rather than show the fixture;
//   - no store: in production it throws; elsewhere it is the deterministic "before data" fixture;
//   - otherwise it reads the counters, durable closure and flags (each bounded at 2,000 ms). A failed read is logged
//     as a category (never a token, a host or a message) and thrown; it never falls back to the
//     fixture. An error thrown while revalidating keeps serving the last successfully generated
//     page, and the next request retries (the Next ISR guide, "Handling uncaught exceptions").
// - Reads never set `cache: 'no-store'` (the REST client sets no cache option and page-mode flags
//   use the data cache), so pages that read here stay static and regenerate on their interval.
//
// Pages receive the live view only. The snapshot also holds p-values and exact outcome counts;
// only the published data route reads it, through the blinded toPublicData.
import type { DerivedRef } from '@/components/kit/Derived';
import type { TestNote } from '@/components/kit/PhaseLabel';
import { EXPERIMENT, calibrationStart, notStartedAt, type Arm, type ExperimentConfig } from '../../experiment.config.ts';
import { serverEnv, type ServerEnv } from '../env.ts';
import { liveFigureState, type LiveSnapshot } from '../figure/cs-band.ts';
import { resolveFigureBody, type FigureBody, type FigureState, type Freshness } from '../figure/states.ts';
import { storeAccess, type StoreAccess } from './access.ts';
import { serverNow } from './clock.ts';
import { closeIfDecided, errorCategory } from './close.ts';
import { later } from './deps.ts';
import { EVENT_TYPES, REJECT_REASONS, type RejectReason } from './events.ts';
import { FlagsUnavailable, NO_FLAGS, readFlags, type ExperimentFlags } from './flags.ts';
import { freshnessFrom } from './freshness.ts';
import { RedisUnavailable, type RedisRest } from './redis-rest.ts';
import { buildSnapshot, closingMarker, type ExperimentSnapshot, type Held } from './snapshot.ts';
import { CorruptCounters, readClosed, readCounters, type ClosedMarker, type CounterRows, type GroupCounts } from './store.ts';
import { berlinDay, berlinStartOfDay } from './time.ts';

export type SnapshotDeps = {
  env: ServerEnv;
  read: RedisRest | null;
  mode: StoreAccess['mode'];
  flags: () => Promise<ExperimentFlags>;
  now: () => Date;
  log: (l: object) => void;
  config?: ExperimentConfig;
  /** The client the closing check writes the closed marker with; null: no closing check here. */
  write?: RedisRest | null;
  /** Runs the closing check after the response (`after` in Next). */
  schedule?: (task: () => Promise<unknown>) => void;
  /**
   * The namespaces whose closing check is under way or done in this process. Keyed by namespace,
   * not by client: storeAccess builds a new client on every read.
   */
  closingSeen?: Set<string>;
};

export type LiveView = {
  snapshot: LiveSnapshot;
  refs: readonly DerivedRef[];
  state: FigureState;
  body: FigureBody;
  /** The one-sentence test note; null before the start or after a failed calibration. */
  testNote: TestNote | null;
  /** Rendered into the page for the beacon, so a page open across a phase switch is refused. */
  namespace: string;
  /** When the data was read (ISO), for the stale label at view time (viewFreshnessAt). */
  readAt: string;
};

export const READ_TIMEOUT_MS = 2000;

/**
 * What a paused Figure says when the route stopped counting without a pause flag. Printed after
 * "Paused on dd.mm: ". The kit has no state for a held test yet, so a held A/B shows as paused at
 * its fault: counting has stopped there, and the frozen chart stays.
 */
const MALFORMED_REASON = 'the experiment settings could not be read, so counting is stopped until I fix them';
const HELD_REASON: Record<Held['reason'], string> = {
  'band-conflict': 'the interval failed a consistency check, so the test stopped at the last clean look',
  'inconsistent-counts': 'the counts failed a consistency check, so the test stopped at the last clean look',
};

/** After "Paused on dd.mm: ". A stored stop never resumes in its namespace, so this must not read as a pause. */
const STOPPED_FOR_GOOD_REASON = 'I stopped counting for this run and am checking the stored result before showing it';
/** After "Calibration stopped on dd.mm: ". */
const NO_NOTE_REASON = 'I no longer have the note explaining why';
const NOTE_DISAGREES_REASON = 'the day I stored for this stop does not match what I see now, so I am checking it';

const NOT_STARTED_REASON = 'the experiment has not started yet, so nothing is counted';
const UNAVAILABLE_REASON = 'the live counts could not be read when this page was built, so they show at the next update';

const REFS: Record<ExperimentSnapshot['source'], readonly DerivedRef[]> = {
  store: ['live'],
  local: ['simulated'],
  fixture: ['build'],
  // Zero counts and dates set when the page was built or regenerated, not read from the store.
  unavailable: ['build'],
};

const zeros = (): GroupCounts => Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as GroupCounts;
const emptyCounters = (): CounterRows => ({
  days: [],
  rejections: Object.fromEntries(REJECT_REASONS.map((r) => [r, 0])) as Record<RejectReason, number>,
  rejectionsByDay: {},
  totals: { a: zeros(), b: zeros() },
});

/** The namespaces whose closing check is under way or done: one check per process and namespace. */
const closingSeen = new Set<string>();

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  // A read that loses the race must not surface as an unhandled rejection.
  p.catch(() => {});
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

function resolveDeps(d: Partial<SnapshotDeps>): Required<SnapshotDeps> {
  const env = d.env ?? serverEnv();
  const access = d.read === undefined || d.mode === undefined || d.write === undefined ? storeAccess(env) : null;
  return {
    env,
    read: d.read !== undefined ? d.read : access!.read,
    mode: d.mode ?? access!.mode,
    write: d.write !== undefined ? d.write : access!.write,
    flags: d.flags ?? (() => readFlags(env, 'page')),
    now: d.now ?? (() => serverNow(env)),
    log: d.log ?? ((l) => console.log(JSON.stringify(l))),
    config: d.config ?? EXPERIMENT,
    schedule: d.schedule ?? later,
    closingSeen: d.closingSeen ?? closingSeen,
  };
}

/** The freshness the page shows when the route has stopped counting without a pause flag. */
function stoppedFreshness(s: ExperimentSnapshot, flags: ExperimentFlags): Freshness | null {
  if (s.live.freshness.kind === 'paused') return null;
  if (flags.malformed) return { kind: 'paused', pausedOn: s.readAt, reason: MALFORMED_REASON };
  // A held A/B would otherwise read as still running (or as inconclusive at the cap). A flagged
  // split after the fault keeps its own "SRM failed" body.
  if (s.configPhase === 'ab' && s.held !== null && (s.status === 'ab' || s.status === 'inconclusive')) {
    return { kind: 'paused', pausedOn: berlinStartOfDay(s.held.on), reason: HELD_REASON[s.held.reason] };
  }
  return null;
}

/** A kind/day marker is authority to stop, never authority to invent an A/B verdict. */
function reconcileClosed(
  s: ExperimentSnapshot, closed: ClosedMarker | null, calibrationFlagDay: string | null,
  unavailable: () => ExperimentSnapshot,
): ExperimentSnapshot {
  if (closed === null) return s;
  const derived = closingMarker(s);
  const flagDisagrees = closed.kind === 'aa-failed' && s.configPhase === 'calibration'
    && calibrationFlagDay !== null && calibrationFlagDay !== closed.day;
  if (derived?.kind === closed.kind && derived.day === closed.day && !flagDisagrees) {
    // A matching current explanation is trustworthy, but durable A/A closure is never ready.
    // Use the marker's day for terminal metadata in both matched and reconstructed failures.
    return closed.kind === 'aa-failed' ? {
      ...s, closed, frozenAt: closed.day,
      calibration: s.calibration === null ? null : { ...s.calibration, ready: false },
    } : { ...s, closed };
  }
  const on = berlinStartOfDay(closed.day);
  if (closed.kind !== 'aa-failed' || s.configPhase !== 'calibration') {
    const fallback = unavailable();
    return {
      ...fallback, closed, closureMismatch: true, frozenAt: closed.day,
      live: { ...fallback.live, freshness: { kind: 'paused', pausedOn: on, reason: STOPPED_FOR_GOOD_REASON } },
    };
  }
  // The marker retained neither the original reason nor an instant within its Berlin day.
  // Midnight is the existing day-only display convention, not a recovered closure timestamp.
  return {
    ...s, closed, ...(derived === null && !flagDisagrees ? {} : { closureMismatch: true as const }), status: 'aa-failed', frozenAt: closed.day,
    calibration: s.calibration === null ? null : { ...s.calibration, ready: false },
    live: { ...s.live, phase: 'aa-failed', aaFailed: {
      // No note exists only when neither a flag nor a derived failure does; otherwise one exists
      // and disagrees with the stored stop, which is a different statement.
      on, reason: derived === null && !flagDisagrees ? NO_NOTE_REASON : NOTE_DISAGREES_REASON,
    } },
  };
}

/**
 * A snapshot with no data: zero counts, and a paused freshness that gives the reason. Without a
 * start, its planned end is the earliest end if the calibration started now, a true lower bound.
 */
function placeholder(config: ExperimentConfig, now: Date, start: string | null, why: 'not-started' | 'unreadable'): ExperimentSnapshot {
  const nowIso = now.toISOString();
  const s = buildSnapshot({ counters: emptyCounters(), flags: NO_FLAGS, now: nowIso, start: start ?? nowIso, source: 'unavailable', config });
  const reason = why === 'not-started' ? NOT_STARTED_REASON : UNAVAILABLE_REASON;
  return { ...s, unavailable: why, live: { ...s.live, freshness: { kind: 'paused', pausedOn: nowIso, reason } } };
}

export async function getExperimentSnapshot(partial: Partial<SnapshotDeps> = {}): Promise<ExperimentSnapshot> {
  const d = resolveDeps(partial);
  const { env, config } = d;
  const building = env.buildPhase === true;
  const started = Date.now();
  const logLine = (outcome: 'error' | 'unavailable' | 'warning', reason: string) => {
    try {
      d.log({ evt: 'snapshot', outcome, reason, ms: Math.max(0, Date.now() - started) });
    } catch {
      // A failing logger never hides the outcome.
    }
  };
  const start = calibrationStart(config, env.vercelEnv);
  /** At run time: log and throw. During a build: log and give the placeholder. */
  const fail = (reason: string, e: unknown): ExperimentSnapshot => {
    logLine(building ? 'unavailable' : 'error', reason);
    // The configured start only: never the fixture's stand-in. Before the start is set nothing is
    // counted, so the true placeholder is not-started (no test note), never "could not be read",
    // whose paused freshness would say the experiment is paused before it has ever run.
    if (building) return placeholder(config, d.now(), config.calibration.startedOn, config.calibration.startedOn === null ? 'not-started' : 'unreadable');
    throw e;
  };

  if (env.onVercel === true && env.vercelEnv === 'development') {
    return fail('misconfigured', new Error('experiment environment misconfigured: VERCEL_ENV is not set on Vercel'));
  }
  // Before the start instant (the event route's rule): nothing is counted, so nothing is read. Only
  // production can have no start (elsewhere FIXTURE_START stands in).
  if (start === null || notStartedAt(config, env.vercelEnv, d.now().getTime())) return placeholder(config, d.now(), start, 'not-started');
  if (d.mode === 'none') {
    if (env.vercelEnv === 'production') return fail('not-configured', new Error('experiment store not configured'));
    return buildSnapshot({ counters: emptyCounters(), flags: NO_FLAGS, now: d.now().toISOString(), start, source: 'fixture', config });
  }
  const read = d.read;
  if (read === null) return fail('not-configured', new Error('experiment store not configured'));

  let counters: CounterRows;
  let flags: ExperimentFlags;
  let closed: ClosedMarker | null;
  let built: ExperimentSnapshot;
  try {
    [counters, closed, flags] = await Promise.all([
      withTimeout(readCounters(read, config.namespace), READ_TIMEOUT_MS, () => new RedisUnavailable(`read timed out after ${READ_TIMEOUT_MS} ms`)),
      withTimeout(readClosed(read, config.namespace), READ_TIMEOUT_MS, () => new RedisUnavailable(`read timed out after ${READ_TIMEOUT_MS} ms`)),
      // A hung Edge Config read must not hang the regeneration either.
      withTimeout(d.flags(), READ_TIMEOUT_MS, () => new FlagsUnavailable()),
    ]);
    const now = d.now().toISOString();
    if (closed !== null && (closed.day < berlinDay(start) || closed.day > berlinDay(now))) {
      throw new CorruptCounters('closed marker outside experiment days');
    }
    const failure = flags.aaFailed;
    const flagDay = failure !== null && Date.parse(failure.on) >= Date.parse(start) ? berlinDay(failure.on) : null;
    built = reconcileClosed(buildSnapshot({ counters, flags, now, start, source: d.mode === 'local' ? 'local' : 'store', config }), closed, flagDay,
      () => placeholder(config, new Date(now), start, 'unreadable'));
    if (built.closureMismatch) logLine('warning', 'closure-mismatch');
  } catch (e) {
    return fail(errorCategory(e), e);
  }
  const freshness = stoppedFreshness(built, flags);
  const s: ExperimentSnapshot = freshness === null ? built : { ...built, live: { ...built.live, freshness } };

  // Always read durable closure, even in a warm process. A stored marker needs no closing task;
  // the memo only suppresses duplicate outstanding checks before a marker becomes visible.
  const write = d.write;
  if (closed === null && write !== null && closingMarker(s) !== null) {
    const seen = d.closingSeen;
    if (!seen.has(config.namespace)) {
      seen.add(config.namespace);
      try {
        d.schedule(async () => {
          const m = await closeIfDecided({ write, ns: config.namespace, config, start, now: d.now().toISOString(), log: d.log, flags });
          if (m === null) seen.delete(config.namespace);
        });
      } catch {
        // Never fails the read; the next read tries again.
        seen.delete(config.namespace);
      }
    }
  }
  return s;
}

/** A pause stays; data older than staleAfterMinutes is stale; otherwise fresh. */
export function freshnessAt(s: ExperimentSnapshot, nowIso: string, config: ExperimentConfig = EXPERIMENT): Freshness {
  return freshnessFrom({ readAt: s.readAt, freshness: s.live.freshness }, nowIso, config.staleAfterMinutes);
}

/** What a page renders for a reader in group `arm`: never the whole snapshot. */
export function liveView(s: ExperimentSnapshot, arm: Arm): LiveView {
  const state = liveFigureState(s.live);
  let testNote: TestNote | null;
  if (s.unavailable === 'not-started' || s.status === 'aa-failed') testNote = null;
  else if (s.live.freshness.kind === 'paused') testNote = { mode: 'paused' };
  else if (s.status === 'before-data' || s.status === 'calibration') testNote = { mode: 'calibration' };
  else testNote = { mode: 'ab', arm, nA: s.live.nA, nB: s.live.nB };
  return { snapshot: s.live, refs: REFS[s.source], state, body: resolveFigureBody(state), testNote, namespace: s.namespace, readAt: s.readAt };
}

/** The live view of the current snapshot: the one entry point for pages. */
export async function getLiveView(arm: Arm, deps: Partial<SnapshotDeps> = {}): Promise<LiveView> {
  return liveView(await getExperimentSnapshot(deps), arm);
}
export { viewFreshnessAt } from './freshness.ts';
