// The experiment as pages read it: the snapshot from the store (or the no-credentials fixture), its
// freshness, and the live view a page renders. Server only.
//
// Reading policy (build and ISR):
// - On Vercel, VERCEL_ENV is always set: a development (or missing) one there is a misconfigured
//   deployment, and it throws rather than show the fixture.
// - No store: in production it throws; elsewhere it is the deterministic "before data" fixture.
// - Production before the calibration start is set: it throws.
// - Otherwise it reads the counters (bounded at 2,000 ms) and the flags. A failed read is logged
//   as a category (never a token, a host or a message) and thrown; it never falls back to the
//   fixture. An error during regeneration keeps the last good page.
// - Reads never set `cache: 'no-store'` (the REST client sets no cache option and page-mode flags
//   use the data cache), so pages that read here stay static and regenerate on their interval.
//
// Pages receive the live view only. The snapshot also holds p-values and exact outcome counts;
// only the published data route reads it, through the blinded toPublicData.
import type { DerivedRef } from '@/components/kit/Derived';
import type { TestNote } from '@/components/kit/PhaseLabel';
import { EXPERIMENT, calibrationStart, type Arm, type ExperimentConfig } from '../../experiment.config.ts';
import { serverEnv, type ServerEnv } from '../env.ts';
import { liveFigureState, type LiveSnapshot } from '../figure/cs-band.ts';
import { resolveFigureBody, type FigureBody, type FigureState, type Freshness } from '../figure/states.ts';
import { storeAccess, type StoreAccess } from './access.ts';
import { closeIfDecided, errorCategory } from './close.ts';
import { later } from './deps.ts';
import { EVENT_TYPES, REJECT_REASONS, type RejectReason } from './events.ts';
import { NO_FLAGS, readFlags, type ExperimentFlags } from './flags.ts';
import { RedisUnavailable, type RedisRest } from './redis-rest.ts';
import { buildSnapshot, closingMarker, type ExperimentSnapshot, type Held } from './snapshot.ts';
import { readCounters, type CounterRows, type GroupCounts } from './store.ts';
import { berlinStartOfDay } from './time.ts';

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
};

export type LiveView = {
  snapshot: LiveSnapshot;
  refs: readonly DerivedRef[];
  state: FigureState;
  body: FigureBody;
  testNote: TestNote;
  /** Rendered into the page for the beacon, so a page open across a phase switch is refused. */
  namespace: string;
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

const REFS: Record<ExperimentSnapshot['source'], readonly DerivedRef[]> = { store: ['live'], local: ['simulated'], fixture: ['build'] };

const zeros = (): GroupCounts => Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as GroupCounts;
const emptyCounters = (): CounterRows => ({
  days: [],
  rejections: Object.fromEntries(REJECT_REASONS.map((r) => [r, 0])) as Record<RejectReason, number>,
  rejectionsByDay: {},
  totals: { a: zeros(), b: zeros() },
});

/** Write clients whose closing check is under way or done, per namespace: one check per process. */
const closing = new WeakMap<RedisRest, Set<string>>();

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RedisUnavailable(`read timed out after ${ms} ms`)), ms);
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
    now: d.now ?? (() => new Date()),
    log: d.log ?? ((l) => console.log(JSON.stringify(l))),
    config: d.config ?? EXPERIMENT,
    schedule: d.schedule ?? later,
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

export async function getExperimentSnapshot(partial: Partial<SnapshotDeps> = {}): Promise<ExperimentSnapshot> {
  const d = resolveDeps(partial);
  const { env, config } = d;
  const started = Date.now();
  const fail = (reason: string, e: unknown): never => {
    try {
      d.log({ evt: 'snapshot', outcome: 'error', reason, ms: Math.max(0, Date.now() - started) });
    } catch {
      // A failing logger never hides the error.
    }
    throw e;
  };

  if (env.onVercel === true && env.vercelEnv === 'development') {
    return fail('misconfigured', new Error('experiment environment misconfigured: VERCEL_ENV is not set on Vercel'));
  }
  if (d.mode === 'none') {
    if (env.vercelEnv === 'production') return fail('not-configured', new Error('experiment store not configured'));
    // Outside production calibrationStart always gives a start (FIXTURE_START at the latest).
    const start = calibrationStart(config, env.vercelEnv)!;
    return buildSnapshot({ counters: emptyCounters(), flags: NO_FLAGS, now: d.now().toISOString(), start, source: 'fixture', config });
  }
  const start = calibrationStart(config, env.vercelEnv);
  if (start === null) return fail('not-started', new Error('experiment calibration start not set'));
  const read = d.read;
  if (read === null) return fail('not-configured', new Error('experiment store not configured'));

  let counters: CounterRows;
  let flags: ExperimentFlags;
  try {
    [counters, flags] = await Promise.all([withTimeout(readCounters(read, config.namespace), READ_TIMEOUT_MS), d.flags()]);
  } catch (e) {
    return fail(errorCategory(e), e);
  }
  const built = buildSnapshot({ counters, flags, now: d.now().toISOString(), start, source: d.mode, config });
  const freshness = stoppedFreshness(built, flags);
  const s: ExperimentSnapshot = freshness === null ? built : { ...built, live: { ...built.live, freshness } };

  // The closing check, once per write client and namespace in this process.
  const write = d.write;
  if (write !== null && closingMarker(s) !== null) {
    const seen = closing.get(write) ?? new Set<string>();
    closing.set(write, seen);
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
export function freshnessAt(s: ExperimentSnapshot, nowIso: string): Freshness {
  if (s.live.freshness.kind === 'paused') return s.live.freshness;
  const age = Date.parse(nowIso) - Date.parse(s.readAt);
  return age > EXPERIMENT.staleAfterMinutes * 60_000 ? { kind: 'stale', updatedAt: s.readAt, renderedAt: nowIso } : { kind: 'fresh' };
}

/** What a page renders for a reader in group `arm`: never the whole snapshot. */
export function liveView(s: ExperimentSnapshot, arm: Arm): LiveView {
  const state = liveFigureState(s.live);
  const testNote: TestNote =
    s.live.freshness.kind === 'paused'
      ? { mode: 'paused' }
      : s.status === 'before-data' || s.status === 'calibration' || s.status === 'aa-failed'
        ? { mode: 'calibration' }
        : { mode: 'ab', arm, nA: s.live.nA, nB: s.live.nB };
  return { snapshot: s.live, refs: REFS[s.source], state, body: resolveFigureBody(state), testNote, namespace: s.namespace };
}

/** The live view of the current snapshot: the one entry point for pages. */
export async function getLiveView(arm: Arm, deps: Partial<SnapshotDeps> = {}): Promise<LiveView> {
  return liveView(await getExperimentSnapshot(deps), arm);
}
