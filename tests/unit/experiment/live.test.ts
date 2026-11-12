import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { EXPERIMENT, FIXTURE_START, type ExperimentConfig } from '@/experiment.config';
import type { ServerEnv } from '@/lib/env';
import { EVENT_TYPES } from '@/lib/experiment/events';
import { FlagsUnavailable, NO_FLAGS, type ExperimentFlags } from '@/lib/experiment/flags';
import { fieldName, keys } from '@/lib/experiment/keys';
import { freshnessAt, getExperimentSnapshot, getLiveView, liveView, viewFreshnessAt, type SnapshotDeps } from '@/lib/experiment/live';
import { toPublicData } from '@/lib/experiment/public-data';
import { createMemoryRedis, type MemoryRedis } from '@/lib/experiment/memory-redis';
import { createRedisRest, RedisUnavailable, type RedisRest } from '@/lib/experiment/redis-rest';
import { buildSnapshot, closingMarker, type ExperimentSnapshot } from '@/lib/experiment/snapshot';
import { CorruptCounters, readClosed, readView, type CounterRows, type GroupCounts } from '@/lib/experiment/store';
import { berlinStartOfDay, plannedEnd } from '@/lib/experiment/time';

const START = '2026-11-02T00:00:00+01:00';
const CALIBRATION: ExperimentConfig = { ...EXPERIMENT, calibration: { ...EXPERIMENT.calibration, startedOn: START } } as ExperimentConfig;
const AB: ExperimentConfig = {
  ...CALIBRATION,
  phase: 'ab',
  namespace: 'ab-v1',
  ab: { ...EXPERIMENT.ab, startedOn: '2026-12-01T00:00:00+01:00' },
} as ExperimentConfig;

const DEV: ServerEnv = { vercelEnv: 'development', fakeStore: false };
const PRODUCTION: ServerEnv = { vercelEnv: 'production', fakeStore: false, kvUrl: 'https://secret-host.upstash.io', kvToken: 'secret-write-token', kvReadOnlyToken: 'secret-read-token' };
const NOW = new Date('2026-11-20T10:00:00Z');

type G = Partial<GroupCounts>;
const counts = (g: G = {}): GroupCounts => ({ ...(Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as GroupCounts), ...g });

/** Writes day rows straight into a namespace's counter hash, as the event route would have. */
async function seed(redis: MemoryRedis, ns: string, rows: { day: string; a: G; b: G }[]): Promise<void> {
  for (const r of rows) {
    for (const arm of ['a', 'b'] as const) {
      for (const [metric, n] of Object.entries(r[arm]) as [keyof GroupCounts, number][]) {
        if (n > 0) await redis.command(['HINCRBY', keys.counters(ns), fieldName({ kind: 'day', day: r.day, arm, metric }), n]);
      }
    }
  }
}

function deps(over: Partial<SnapshotDeps> = {}): Partial<SnapshotDeps> {
  return {
    env: PRODUCTION,
    mode: 'store',
    read: createMemoryRedis({ now: () => NOW.getTime() }),
    write: null,
    flags: async () => NO_FLAGS,
    now: () => NOW,
    log: () => {},
    config: CALIBRATION,
    schedule: () => {},
    ...over,
  };
}

const EMPTY: CounterRows = {
  days: [],
  rejections: { bot: 0, internal: 0, self: 0, forced: 0, not_entry: 0, rate_limited: 0, ceiling: 0 },
  rejectionsByDay: {},
  totals: { a: counts(), b: counts() },
};
const snap = (o: Partial<Parameters<typeof buildSnapshot>[0]> = {}): ExperimentSnapshot =>
  buildSnapshot({ counters: EMPTY, flags: NO_FLAGS, now: NOW.toISOString(), start: START, source: 'store', config: CALIBRATION, ...o });

/** No fixture numbers: no fixture start or end, zero counts, and a freshness that says why. */
function expectHonestPlaceholder(s: ExperimentSnapshot, reason: RegExp, config: ExperimentConfig = EXPERIMENT, note: unknown = { mode: 'paused' }) {
  expect(s.source).toBe('unavailable');
  expect(s.live.plannedEnd).not.toBe(plannedEnd(EXPERIMENT, FIXTURE_START).at);
  expect(s.live.plannedEnd).toBe(plannedEnd(config, config.calibration.startedOn ?? NOW.toISOString()).at);
  expect([s.live.nA, s.live.nB, s.funnel.entryViews, s.funnel.beaconsReceived]).toEqual([0, 0, 0, 0]);
  expect(s.live.series).toEqual([]);
  expect(s.live.freshness).toMatchObject({ kind: 'paused', reason: expect.stringMatching(reason) });
  expect(liveView(s, 'a').refs).toEqual(['build']);
  expect(liveView(s, 'a').testNote).toEqual(note);
}
function expectNotStarted(s: ExperimentSnapshot) {
  // The earliest end if it started now: a true lower bound, not the fixture's date. No test note:
  // there is no running test to describe.
  expectHonestPlaceholder(s, /not started/, EXPERIMENT, null);
  expect(s.status).toBe('before-data');
}

describe('getExperimentSnapshot: during next build', () => {
  const BUILD_PRODUCTION: ServerEnv = { ...PRODUCTION, buildPhase: true };
  // A launch date other than the fixture's, so a fixture date would show.
  const LAUNCHED: ExperimentConfig = { ...EXPERIMENT, calibration: { ...EXPERIMENT.calibration, startedOn: '2026-11-09T00:00:00+01:00' } } as ExperimentConfig;

  it('never throws in production without a store: the honest placeholder, no fixture numbers', async () => {
    const lines: object[] = [];
    const s = await getExperimentSnapshot(deps({ env: BUILD_PRODUCTION, mode: 'none', read: null, config: LAUNCHED, log: (l) => lines.push(l) }));
    expectHonestPlaceholder(s, /could not be read/, LAUNCHED);
    expect(s.status).toBe('before-data');
    expect(lines).toEqual([expect.objectContaining({ evt: 'snapshot', outcome: 'unavailable', reason: 'not-configured' })]);
  });

  it('gives the not-started snapshot in production before the start is set', async () => {
    expectNotStarted(await getExperimentSnapshot(deps({ env: BUILD_PRODUCTION, mode: 'none', read: null, config: EXPERIMENT })));
  });

  it('never throws on a failed read: the placeholder, logged as a category', async () => {
    const lines: object[] = [];
    const failing: RedisRest = {
      command: async () => {
        throw new RedisUnavailable('command failed (network)');
      },
      pipeline: async () => [],
      transaction: async () => [],
    };
    const s = await getExperimentSnapshot(deps({ env: BUILD_PRODUCTION, read: failing, config: LAUNCHED, log: (l) => lines.push(l) }));
    expectHonestPlaceholder(s, /could not be read/, LAUNCHED);
    expect(lines).toEqual([expect.objectContaining({ outcome: 'unavailable', reason: 'store-unavailable' })]);
  });

  it('on Vercel without a VERCEL_ENV gives the placeholder, never the fixture', async () => {
    const env: ServerEnv = { vercelEnv: 'development', fakeStore: false, onVercel: true, buildPhase: true };
    // Before the start is set, a page built here must not say the experiment is paused: the
    // not-started placeholder, with no test note, never the "could not be read" one.
    const lines: object[] = [];
    const s = await getExperimentSnapshot({ env, mode: 'none', read: null, write: null, now: () => NOW, config: EXPERIMENT, log: (l) => lines.push(l) });
    expectNotStarted(s);
    expect(lines).toEqual([expect.objectContaining({ evt: 'snapshot', outcome: 'unavailable', reason: 'misconfigured' })]);
    const launched = await getExperimentSnapshot({ env, mode: 'none', read: null, write: null, now: () => NOW, config: LAUNCHED, log: () => {} });
    expectHonestPlaceholder(launched, /could not be read/, LAUNCHED);
  });

  it('still reads a configured store, so a build after launch carries the real counts', async () => {
    const redis = createMemoryRedis();
    await seed(redis, CALIBRATION.namespace, [{ day: '2026-11-03', a: { entry: 4, inview: 3 }, b: { entry: 5, inview: 2 } }]);
    const s = await getExperimentSnapshot(deps({ env: BUILD_PRODUCTION, read: redis }));
    expect(s.source).toBe('store');
    expect(s.current.a.entry).toBe(4);
  });

  it('leaves development and previews on the fixture', async () => {
    for (const vercelEnv of ['development', 'preview'] as const) {
      const env: ServerEnv = { vercelEnv, fakeStore: false, buildPhase: true };
      const s = await getExperimentSnapshot({ env, mode: 'none', read: null, write: null, now: () => NOW, config: EXPERIMENT });
      expect(s.source).toBe('fixture');
      expect(s.live.plannedEnd).toBe(plannedEnd(EXPERIMENT, FIXTURE_START).at);
    }
  });
});

describe('getExperimentSnapshot: no store', () => {
  it('in development gives the fixture: before data, with the planned end from FIXTURE_START', async () => {
    const s = await getExperimentSnapshot({ env: DEV, mode: 'none', read: null, write: null, now: () => NOW, config: EXPERIMENT });
    expect(s.source).toBe('fixture');
    expect(s.status).toBe('before-data');
    expect(s.live.phase).toBe('before-data');
    expect(s.live.plannedEnd).toBe(plannedEnd(EXPERIMENT, FIXTURE_START).at);
    expect(s.live.plannedEndKind).toBe('earliest');
    expect([s.live.nA, s.live.nB]).toEqual([0, 0]);
    expect(s.readAt).toBe(NOW.toISOString());
  });

  it('never reads the flags for the fixture', async () => {
    const flags = vi.fn(async () => NO_FLAGS);
    await getExperimentSnapshot({ env: { vercelEnv: 'preview', fakeStore: false }, mode: 'none', read: null, write: null, flags, now: () => NOW, config: EXPERIMENT });
    expect(flags).not.toHaveBeenCalled();
  });

  it('in production rejects', async () => {
    await expect(getExperimentSnapshot(deps({ mode: 'none', read: null }))).rejects.toThrow('experiment store not configured');
  });

  it('in production with the store configured but no start gives the not-started snapshot, without reading', async () => {
    const read = createMemoryRedis();
    const command = vi.spyOn(read, 'command');
    const s = await getExperimentSnapshot(deps({ read, config: EXPERIMENT }));
    expect(command).not.toHaveBeenCalled();
    expectNotStarted(s);
  });

  it('in production without credentials and no start gives the same not-started snapshot', async () => {
    expectNotStarted(await getExperimentSnapshot(deps({ mode: 'none', read: null, config: EXPERIMENT })));
  });

  it('on Vercel with VERCEL_ENV missing or development rejects instead of showing the fixture', async () => {
    const env: ServerEnv = { vercelEnv: 'development', fakeStore: false, onVercel: true };
    const lines: object[] = [];
    await expect(getExperimentSnapshot({ env, mode: 'none', read: null, write: null, now: () => NOW, config: EXPERIMENT, log: (l) => lines.push(l) })).rejects.toThrow(
      /misconfigured/,
    );
    expect(lines).toEqual([expect.objectContaining({ evt: 'snapshot', outcome: 'error', reason: 'misconfigured' })]);
    await expect(
      getExperimentSnapshot({ env: { ...env, vercelEnv: 'preview' }, mode: 'none', read: null, write: null, now: () => NOW, config: EXPERIMENT }),
    ).resolves.toMatchObject({ source: 'fixture' });
  });

  it('rejects in store mode without a read client', async () => {
    await expect(getExperimentSnapshot(deps({ read: null }))).rejects.toThrow('experiment store not configured');
  });
});

describe('getExperimentSnapshot: the store', () => {
  it('reads the counters and the flags into a store snapshot', async () => {
    const redis = createMemoryRedis();
    await seed(redis, CALIBRATION.namespace, [{ day: '2026-11-03', a: { entry: 4, inview: 3 }, b: { entry: 5, inview: 2 } }]);
    const s = await getExperimentSnapshot(deps({ read: redis }));
    expect(s.source).toBe('store');
    expect(s.status).toBe('calibration');
    expect(s.current.a.entry).toBe(4);
    expect(s.current.b.entry).toBe(5);
  });

  it('labels the loopback fake as local', async () => {
    const s = await getExperimentSnapshot(deps({ env: { ...DEV, kvUrl: 'http://127.0.0.1:1' }, mode: 'local' }));
    expect(s.source).toBe('local');
  });

  it('rejects on a RedisUnavailable read, and logs one line without the token or the host', async () => {
    const lines: object[] = [];
    const failing: RedisRest = {
      command: async () => {
        throw new RedisUnavailable('command failed (network)');
      },
      pipeline: async () => [],
      transaction: async () => [],
    };
    await expect(getExperimentSnapshot(deps({ read: failing, log: (l) => lines.push(l) }))).rejects.toBeInstanceOf(RedisUnavailable);
    expect(lines).toHaveLength(1);
    const text = JSON.stringify(lines[0]);
    expect(text).toContain('store-unavailable');
    expect(text).not.toMatch(/secret-|upstash|token/);
  });

  it('rejects on a flags error and never falls back to the fixture', async () => {
    const lines: object[] = [];
    const flags = async (): Promise<ExperimentFlags> => {
      throw new Error('flags down');
    };
    await expect(getExperimentSnapshot(deps({ flags, log: (l) => lines.push(l) }))).rejects.toThrow('flags down');
    expect(lines).toHaveLength(1);
  });

  it('rejects a never-settling read after 2,000 ms', async () => {
    vi.useFakeTimers();
    try {
      const hung: RedisRest = { command: () => new Promise(() => {}), pipeline: () => new Promise(() => {}), transaction: () => new Promise(() => {}) };
      const p = getExperimentSnapshot(deps({ read: hung }));
      const settled = vi.fn();
      p.then(settled, settled);
      await vi.advanceTimersByTimeAsync(1999);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await expect(p).rejects.toBeInstanceOf(RedisUnavailable);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a never-settling flags read after 2,000 ms', async () => {
    vi.useFakeTimers();
    try {
      const p = getExperimentSnapshot(deps({ flags: () => new Promise(() => {}) }));
      const settled = vi.fn();
      p.then(settled, settled);
      await vi.advanceTimersByTimeAsync(1999);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await expect(p).rejects.toBeInstanceOf(FlagsUnavailable);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads with a request init that has no cache or next option (the page stays static)', async () => {
    const inits: RequestInit[] = [];
    const fetch = (async (_url: string, init: RequestInit) => {
      inits.push(init);
      return new Response(JSON.stringify({ result: JSON.parse(String(init.body))[0] === 'GET' ? null : [] }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const read = createRedisRest({ url: 'https://store.example', token: 't', fetch });
    await getExperimentSnapshot(deps({ read }));
    expect(inits.length).toBeGreaterThan(0);
    for (const init of inits) {
      expect(init).not.toHaveProperty('cache');
      expect(init).not.toHaveProperty('next');
    }
  });

  it('marks malformed flags as paused: the event route has stopped counting', async () => {
    const s = await getExperimentSnapshot(deps({ flags: async () => ({ paused: null, aaFailed: null, malformed: true }) }));
    expect(s.live.freshness).toMatchObject({ kind: 'paused', pausedOn: NOW.toISOString() });
    expect(liveView(s, 'a').testNote).toEqual({ mode: 'paused' });
    expect(liveView(s, 'a').body).toBe('paused');
  });

  it('keeps a real pause and its reason over a malformed note', async () => {
    const paused = { on: '2026-11-19T08:00:00+01:00', reason: 'checking a deploy' };
    const s = await getExperimentSnapshot(deps({ flags: async () => ({ paused, aaFailed: null, malformed: false }) }));
    expect(s.live.freshness).toEqual({ kind: 'paused', pausedOn: paused.on, reason: paused.reason });
  });

  it('shows a held A/B as stopped (paused at the fault), never as still running', async () => {
    const redis = createMemoryRedis();
    // Day 1: 10% against 30% of 50; day 2 (cumulative 300): 33% against 8%, outside the band.
    await seed(redis, AB.namespace, [
      { day: '2026-12-01', a: { entry: 60, inview: 50, engaged: 50, card: 5 }, b: { entry: 60, inview: 50, engaged: 50, card: 15 } },
      { day: '2026-12-02', a: { entry: 340, inview: 250, engaged: 250, card: 95 }, b: { entry: 340, inview: 250, engaged: 250, card: 10 } },
    ]);
    const s = await getExperimentSnapshot(deps({ read: redis, config: AB, now: () => new Date('2026-12-03T12:00:00+01:00') }));
    expect(s.held).toEqual({ on: '2026-12-02', reason: 'band-conflict' });
    expect(s.status).toBe('ab');
    expect(s.live.freshness).toMatchObject({ kind: 'paused', pausedOn: berlinStartOfDay('2026-12-02') });
    const view = liveView(s, 'b');
    expect(view.body).toBe('paused');
    expect(view.testNote).toEqual({ mode: 'paused' });
  });
});

describe('the closing check on the read path', () => {
  // A clear B win on 01.12: decided once 01.12 is a completed look, at 02.12 00:31 Berlin.
  const WIN = {
    day: '2026-12-01',
    a: { entry: 600, inview: 300, engaged: 420, card: 30 },
    b: { entry: 600, inview: 300, engaged: 432, card: 120 },
  };
  /** Each test its own namespace: the memo is per process and namespace, as in production. */
  const abIn = (namespace: string) => ({ ...AB, namespace }) as ExperimentConfig;

  type Logged = { name: string; args: readonly (string | number)[] }[];
  /** A client over `redis` that records every command; a new object per call, as storeAccess gives. */
  function recording(redis: MemoryRedis, log: Logged): RedisRest {
    return {
      command: (c) => (log.push({ name: String(c[0]), args: c }), redis.command(c)),
      pipeline: (cs) => (cs.forEach((c) => log.push({ name: String(c[0]), args: c })), redis.pipeline(cs)),
      transaction: (cs) => (cs.forEach((c) => log.push({ name: String(c[0]), args: c })), redis.transaction(cs)),
    };
  }

  async function setup(nowIso: string, namespace: string) {
    const config = abIn(namespace);
    const redis = createMemoryRedis();
    await seed(redis, namespace, [WIN]);
    const tasks: (() => Promise<unknown>)[] = [];
    const reads: Logged = [];
    const writes: Logged = [];
    // Like production: storeAccess builds new clients on every read.
    const d = () =>
      deps({ read: recording(redis, reads), write: recording(redis, writes), config, now: () => new Date(nowIso), schedule: (t) => tasks.push(t) });
    return { redis, tasks, d, reads, writes, config };
  }

  it('does nothing before the decided day is a completed look (00:30 Berlin the next day)', async () => {
    const { redis, tasks, d, config } = await setup('2026-12-02T00:30:00+01:00', 'close-a');
    const s = await getExperimentSnapshot(d());
    expect(s.status).toBe('ab');
    expect(tasks).toHaveLength(0);
    await expect(readClosed(redis, config.namespace)).resolves.toBeNull();
  });

  it('schedules the check once the look is completed (00:32); once the marker is stored, reads with new clients never re-run it', async () => {
    const { redis, tasks, d, reads, writes, config } = await setup('2026-12-02T00:32:00+01:00', 'close-b');
    const s = await getExperimentSnapshot(d());
    expect(s.status).toBe('ship-b');
    expect(tasks).toHaveLength(1);
    await tasks[0]!();
    await expect(readClosed(redis, config.namespace)).resolves.toEqual({ kind: 'decision', day: '2026-12-01' });
    const writesAfterClose = writes.length;
    reads.length = 0;
    for (let k = 0; k < 5; k += 1) await getExperimentSnapshot(d());
    expect(tasks).toHaveLength(1);
    expect(writes.length).toBe(writesAfterClose);
    // Each read checks durable closure as well as the counter hash, even with a warm memo.
    expect(reads.map((r) => r.name)).toEqual(Array.from({ length: 5 }, () => ['HGETALL', 'GET']).flat());
  });

  it('runs again after a check that found nothing to write or failed', async () => {
    const { tasks, d, config } = await setup('2026-12-02T00:32:00+01:00', 'close-c');
    const failing: RedisRest = {
      command: async () => {
        throw new RedisUnavailable('command failed (network)');
      },
      pipeline: async () => [],
      transaction: async () => [],
    };
    await getExperimentSnapshot({ ...d(), write: failing });
    expect(tasks).toHaveLength(1);
    await tasks[0]!();
    await getExperimentSnapshot(d());
    expect(tasks).toHaveLength(2);
    expect(config.namespace).toBe('close-c');
  });

  it('writes nothing on the page path but the closed marker, with SET NX', async () => {
    const { d, writes, config } = await setup('2026-12-02T00:32:00+01:00', 'close-d');
    const tasks: (() => Promise<unknown>)[] = [];
    await getExperimentSnapshot({ ...d(), schedule: (t) => tasks.push(t) });
    for (const t of tasks) await t();
    const WRITES = new Set(['SET', 'INCR', 'HINCRBY', 'EXPIRE', 'DEL', 'HSET', 'PEXPIRE']);
    const written = writes.filter((w) => WRITES.has(w.name));
    expect(written).toHaveLength(1);
    expect(written[0]!.args[1]).toBe(keys.closed(config.namespace));
    expect(written[0]!.args).toContain('NX');
  });

  it('never schedules without a write client, and a failing scheduler never fails the read', async () => {
    const { d } = await setup('2026-12-02T00:32:00+01:00', 'close-e');
    await expect(getExperimentSnapshot({ ...d(), write: null })).resolves.toMatchObject({ status: 'ship-b' });
    const throwing = () => {
      throw new Error('outside a request');
    };
    await expect(getExperimentSnapshot({ ...d(), schedule: throwing })).resolves.toMatchObject({ status: 'ship-b' });
  });
});

describe('freshnessAt', () => {
  const s = snap();
  const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

  it('is fresh at 14 minutes after the read and stale at 16', () => {
    expect(freshnessAt(s, at(14))).toEqual({ kind: 'fresh' });
    expect(freshnessAt(s, at(16))).toEqual({ kind: 'stale', updatedAt: s.readAt, renderedAt: at(16) });
  });

  it('can be computed from the live view alone, for a client island', () => {
    const v = liveView(s, 'a');
    expect(v.readAt).toBe(s.readAt);
    expect(viewFreshnessAt(v, at(14))).toEqual({ kind: 'fresh' });
    expect(viewFreshnessAt(v, at(16))).toEqual({ kind: 'stale', updatedAt: s.readAt, renderedAt: at(16) });
    expect(viewFreshnessAt(v, at(16), 30)).toEqual({ kind: 'fresh' });
  });

  it('keeps a pause however old the data is', () => {
    const p = snap({ flags: { paused: { on: '2026-11-19T08:00:00+01:00', reason: 'checking' }, aaFailed: null, malformed: false } });
    expect(freshnessAt(p, at(60))).toEqual({ kind: 'paused', pausedOn: '2026-11-19T08:00:00+01:00', reason: 'checking' });
  });
});

describe('liveView', () => {
  it('gives the refs for each source', () => {
    expect(liveView(snap({ source: 'store' }), 'a').refs).toEqual(['live']);
    expect(liveView(snap({ source: 'local' }), 'a').refs).toEqual(['simulated']);
    expect(liveView(snap({ source: 'fixture' }), 'a').refs).toEqual(['build']);
  });

  it('starts at zero exposures as a deliberate collecting state', () => {
    const v = liveView(snap(), 'a');
    expect(v.snapshot.phase).toBe('before-data');
    expect(v.state).toEqual({ live: { phase: 'before-data', data: 'low-data', freshness: { kind: 'fresh' } } });
    expect(v.body).toBe('low-data');
    expect(v.testNote).toEqual({ mode: 'calibration' });
    expect(v.namespace).toBe(CALIBRATION.namespace);
  });

  it('says calibration only while calibrating', () => {
    const rows = [{ day: '2026-11-03', a: counts({ entry: 4, inview: 3 }), b: counts({ entry: 5, inview: 2 }) }];
    const c = snap({ counters: { ...EMPTY, days: rows } });
    expect(c.status).toBe('calibration');
    expect(liveView(c, 'b').testNote).toEqual({ mode: 'calibration' });
    const failed = snap({
      counters: { ...EMPTY, days: rows },
      flags: { paused: null, aaFailed: { on: '2026-11-04T09:00:00+01:00', reason: 'a beacon fault' }, malformed: false },
    });
    expect(failed.status).toBe('aa-failed');
    expect(liveView(failed, 'b').testNote).toBeNull();
    const pausedFailure = { ...failed, live: { ...failed.live, freshness: { kind: 'paused' as const, pausedOn: NOW.toISOString(), reason: 'checking' } } };
    expect(liveView(pausedFailure, 'b').testNote).toBeNull();
  });

  it('names the group and the counts in the A/B, and says paused under a pause', () => {
    const rows = [{ day: '2026-12-01', a: counts({ entry: 9, inview: 7 }), b: counts({ entry: 8, inview: 6 }) }];
    const ab = snap({ counters: { ...EMPTY, days: rows }, config: AB, now: '2026-12-01T12:00:00+01:00' });
    // The counts are current (today's row included); the kit hides them below 50 a group.
    expect(liveView(ab, 'b').testNote).toEqual({ mode: 'ab', arm: 'b', nA: 7, nB: 6 });
    const done = snap({ counters: { ...EMPTY, days: rows }, config: AB, now: '2026-12-03T12:00:00+01:00' });
    expect(liveView(done, 'a').testNote).toEqual({ mode: 'ab', arm: 'a', nA: 7, nB: 6 });
    const paused = snap({ config: AB, flags: { paused: { on: '2026-12-02T09:00:00+01:00', reason: 'checking' }, aaFailed: null, malformed: false } });
    expect(liveView(paused, 'a').testNote).toEqual({ mode: 'paused' });
  });

  it('carries the namespace for the beacon', () => {
    expect(liveView(snap({ config: AB, now: '2026-12-01T12:00:00+01:00' }), 'a').namespace).toBe('ab-v1');
  });

  it('holds only the page-safe parts: the kit snapshot, never the analysis', () => {
    const v = liveView(snap(), 'a');
    expect(Object.keys(v).sort()).toEqual(['body', 'namespace', 'readAt', 'refs', 'snapshot', 'state', 'testNote']);
    const text = JSON.stringify(v);
    for (const key of ['"p"', '"pValue"', '"chi2"', '"looks"', '"current"', '"funnel"', '"srm"', '"calibration"']) expect(text).not.toContain(`${key}:`);
  });

  it('getLiveView reads and returns the view only', async () => {
    const v = await getLiveView('a', deps());
    expect(Object.keys(v).sort()).toEqual(['body', 'namespace', 'readAt', 'refs', 'snapshot', 'state', 'testNote']);
    expect(v.refs).toEqual(['live']);
  });
});

describe('the source', () => {
  const SRC = resolve(import.meta.dirname, '../../../src');

  it('gives pages the live view only: no page or component reads the whole snapshot', () => {
    // The snapshot holds p-values and exact outcome counts; only the blinded data.json route reads it,
    // and the home page, which projects it at once into the server-only Home model (toHomeModel copies
    // no p-value, chi-square or outcome count; tests/unit/home/page.test.tsx checks the serialized
    // client props). The home page may use it in exactly that one form, and so may the Live test page.
    const HOME = join(SRC, 'app/v/[arm]/page.tsx');
    expect(readFileSync(HOME, 'utf8').match(/\bgetExperimentSnapshot\b|\bExperimentSnapshot\b|\bbuildSnapshot\b|experiment\/snapshot['"]/g)).toEqual([
      'getExperimentSnapshot',
      'getExperimentSnapshot',
    ]);
    expect(readFileSync(HOME, 'utf8')).toContain('toHomeModel(await getExperimentSnapshot(), arm)');
    // The Live test page reads it once and projects it at once, on the server, into the display shape
    // (toLivePageDisplay keeps published cells only; tests/unit/live-page/page.test.tsx checks it).
    const LIVE_TEST = join(SRC, 'app/experiment/page.tsx');
    expect(readFileSync(LIVE_TEST, 'utf8').match(/\bgetExperimentSnapshot\b|\bExperimentSnapshot\b|\bbuildSnapshot\b|experiment\/snapshot['"]/g)).toEqual([
      'getExperimentSnapshot',
      'getExperimentSnapshot',
    ]);
    expect(readFileSync(LIVE_TEST, 'utf8')).toContain('toLivePageDisplay(toLivePageModel(await getExperimentSnapshot()');
    const ALLOWED = new Set([join(SRC, 'app/experiment/data.json/route.ts'), HOME, LIVE_TEST]);
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
      });
    const FORBIDDEN = /\bgetExperimentSnapshot\b|\bExperimentSnapshot\b|\bbuildSnapshot\b|experiment\/snapshot['"]/;
    const hits = [...files(join(SRC, 'app')), ...files(join(SRC, 'components'))]
      .filter((f) => !ALLOWED.has(f) && FORBIDDEN.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(hits).toEqual([]);
    expect(FORBIDDEN.test("import { getExperimentSnapshot } from '@/lib/experiment/live'")).toBe(true);
  });
});

describe('before the start instant (the event route\'s rule)', () => {
  const at = (startedOn: string): ExperimentConfig =>
    ({ ...EXPERIMENT, calibration: { ...EXPERIMENT.calibration, startedOn } }) as ExperimentConfig;
  const read = { command: async () => [], pipeline: async () => [], transaction: async () => [] };

  it('production with no start: no test note', async () => {
    const v = await getLiveView('a', deps({ env: PRODUCTION, mode: 'store', read, config: EXPERIMENT }));
    expect(v.testNote).toBeNull();
  });

  it('production with a start still in the future: the not-started snapshot and no test note, without reading', async () => {
    let reads = 0;
    const counting = { ...read, command: async () => (reads++, []), pipeline: async () => (reads++, []) };
    const config = at('2026-12-01T00:00:00+01:00');
    const s = await getExperimentSnapshot(deps({ env: PRODUCTION, mode: 'store', read: counting, config }));
    expect(s.unavailable).toBe('not-started');
    expect(s.live.plannedEnd).toBe(plannedEnd(config, config.calibration.startedOn!).at);
    expect(liveView(s, 'b').testNote).toBeNull();
    expect(reads).toBe(0);
  });

  it('outside production before the fixture start: the not-started snapshot and no test note', async () => {
    const s = await getExperimentSnapshot(deps({ env: DEV, mode: 'none', read: null, config: EXPERIMENT, now: () => new Date('2026-10-25T12:00:00+02:00') }));
    expect(s.unavailable).toBe('not-started');
    expect(liveView(s, 'a').testNote).toBeNull();
  });

  it('after the start: the calibration note', async () => {
    const v = await getLiveView('a', deps({ env: DEV, mode: 'none', read: null, config: EXPERIMENT }));
    expect(v.testNote).toEqual({ mode: 'calibration' });
  });

  it('the A/B before its own start: not started, no test note', async () => {
    const ab = { ...EXPERIMENT, phase: 'ab', calibration: { ...EXPERIMENT.calibration, startedOn: '2026-11-02T00:00:00+01:00' }, ab: { ...EXPERIMENT.ab, startedOn: '2026-12-01T00:00:00+01:00' } } as ExperimentConfig;
    const s = await getExperimentSnapshot(deps({ env: PRODUCTION, mode: 'store', read, config: ab }));
    expect(s.unavailable).toBe('not-started');
    expect(liveView(s, 'a').testNote).toBeNull();
  });
});



describe('durable terminal state', () => {
  it.each([false, true])('retains flag-only failure after flag removal (empty=%s), warm and cold', async (empty) => {
    const redis = createMemoryRedis();
    if (!empty) await seed(redis, CALIBRATION.namespace, [{ day: '2026-11-04', a: { entry: 1 }, b: { entry: 1 } }]);
    const tasks: (() => Promise<unknown>)[] = [];
    const seen = new Set<string>();
    const d = deps({ read: redis, write: redis, closingSeen: seen, schedule: (t) => tasks.push(t),
      flags: async () => ({ ...NO_FLAGS, aaFailed: { on: '2026-11-06T09:00:00+01:00', reason: 'a beacon fault' } }) });
    // Empty-count closure is seeded directly: the existing closer requires a counted entry.
    if (empty) await redis.command(['SET', keys.closed(CALIBRATION.namespace), JSON.stringify({ kind: 'aa-failed', day: '2026-11-06' })]);
    else {
      expect((await getExperimentSnapshot(d)).status).toBe('aa-failed');
      expect(tasks).toHaveLength(1);
      await tasks[0]!();
    }
    for (const closingSeen of [seen, new Set<string>()]) {
      const s = await getExperimentSnapshot({ ...d, flags: async () => NO_FLAGS, closingSeen, write: null });
      expect(s.status).toBe('aa-failed');
      expect(s.frozenAt).toBe('2026-11-06');
      expect(s.calibration?.ready).toBe(false);
      expect(s.live.aaFailed).toMatchObject({ on: berlinStartOfDay('2026-11-06'), reason: 'I no longer have the note explaining why' });
      expect(s.live.aaFailed?.reason).not.toContain('beacon');
      expect(liveView(s, 'a').body).toBe('aa-failed');
      expect((await getLiveView('a', { ...d, flags: async () => NO_FLAGS, closingSeen, write: null })).testNote).toBeNull();
      expect((await readView(redis, { ns: CALIBRATION.namespace, pv: 'new', closed: true, expiry: false })).closed)
        .toEqual({ kind: 'aa-failed', day: '2026-11-06' });
    }
    expect(tasks).toHaveLength(empty ? 0 : 1);
  });

  it.each([
    { retained: true, warm: true, readOnly: true },
    { retained: true, warm: false, readOnly: true },
    { retained: true, warm: true, readOnly: false },
    { retained: true, warm: false, readOnly: false },
    { retained: false, warm: true, readOnly: true },
    { retained: false, warm: false, readOnly: true },
    { retained: false, warm: true, readOnly: false },
    { retained: false, warm: false, readOnly: false },
  ])('keeps otherwise-ready durable A/A failure terminal: retained=$retained warm=$warm readOnly=$readOnly', async ({ retained, warm, readOnly }) => {
    const redis = createMemoryRedis();
    const group = { entry: 100, inview: 50, engaged: 70, card: 5 };
    await seed(redis, CALIBRATION.namespace, [{ day: '2026-11-04', a: group, b: group }]);
    const tasks: (() => Promise<unknown>)[] = [];
    const seen = new Set<string>();
    const d = deps({ read: redis, write: redis, closingSeen: seen, schedule: (task) => tasks.push(task) });
    // Balanced data and elapsed time would be ready without permanent closure.
    const ready = await getExperimentSnapshot(d);
    expect(ready.calibration).toMatchObject({ ready: true, failed: null });
    const flag = { on: '2026-11-06T09:00:00+01:00', reason: 'a beacon fault' };
    const flags = { ...NO_FLAGS, aaFailed: flag };
    expect((await getExperimentSnapshot({ ...d, flags: async () => flags })).status).toBe('aa-failed');
    expect(tasks).toHaveLength(1);
    await tasks[0]!();
    const closed = { kind: 'aa-failed', day: '2026-11-06' };
    expect(await readClosed(redis, CALIBRATION.namespace)).toEqual(closed);
    const reading = { ...d, flags: async () => retained ? flags : NO_FLAGS,
      closingSeen: warm ? seen : new Set<string>(), write: readOnly ? null : redis };
    const s = await getExperimentSnapshot(reading);
    expect(s.status).toBe('aa-failed');
    expect(s.calibration).toMatchObject({ ready: false, failed: null });
    expect(s.frozenAt).toBe('2026-11-06');
    expect(s.closed).toEqual(closed);
    expect(s.live.aaFailed).toEqual(retained ? flag : {
      on: berlinStartOfDay('2026-11-06'), reason: 'I no longer have the note explaining why',
    });
    const published = toPublicData(s, { commit: null }, CALIBRATION);
    expect(published.calibration).toMatchObject({ ready: false, failed: null });
    expect(published.frozenAt).toBe('2026-11-06');
    expect(published.decision).toBeNull();
    expect(published).not.toHaveProperty('closed');
    const view = await getLiveView('b', reading);
    expect(view.body).toBe('aa-failed');
    // Home renders PhaseLabel only for a non-null note, so this omits its visible and aria copy.
    expect(view.testNote).toBeNull();
    expect(tasks).toHaveLength(1);
  });

  it('keeps the durable calibration stop day when the flag has a conflicting date', async () => {
    const redis = createMemoryRedis();
    const log = vi.fn();
    await redis.command(['SET', keys.closed(CALIBRATION.namespace), JSON.stringify({ kind: 'aa-failed', day: '2026-11-06' })]);
    const s = await getExperimentSnapshot(deps({ read: redis, log,
      flags: async () => ({ ...NO_FLAGS, aaFailed: { on: '2026-11-07T09:00:00+01:00', reason: 'later flag text' } }),
    }));
    expect(s).toMatchObject({ status: 'aa-failed', frozenAt: '2026-11-06', closureMismatch: true });
    // A flag still exists here, so "I no longer have the note" would be false.
    expect(s.live.aaFailed).toEqual({
      on: berlinStartOfDay('2026-11-06'),
      reason: 'the day I stored for this stop does not match what I see now, so I am checking it',
    });
    expect(log).toHaveBeenCalledWith({ evt: 'snapshot', outcome: 'warning', reason: 'closure-mismatch', ms: expect.any(Number) });
    expect(liveView(s, 'b').testNote).toBeNull();
  });

  it.each(['not-json', '{"kind":"other","day":"2026-11-06"}', '{"kind":"aa-failed","day":"2026-02-30"}'])(
    'fails closed for malformed marker %s at runtime and build', async (raw) => {
      const redis = createMemoryRedis();
      await redis.command(['SET', keys.closed(CALIBRATION.namespace), raw]);
      await expect(getExperimentSnapshot(deps({ read: redis }))).rejects.toBeInstanceOf(CorruptCounters);
      const s = await getExperimentSnapshot(deps({ read: redis, env: { ...PRODUCTION, buildPhase: true } }));
      expect(s.source).toBe('unavailable');
      expect(s.unavailable).toBe('unreadable');
      expect(s.live.freshness).toMatchObject({ kind: 'paused', reason: expect.stringMatching(/could not be read/) });
      expect(s.current).toEqual({ a: counts(), b: counts() });
    });

  it.each(['decision', 'held', 'aa-failed'] as const)('never infers an A/B outcome from %s alone', async (kind) => {
    const redis = createMemoryRedis();
    await redis.command(['SET', keys.closed(AB.namespace), JSON.stringify({ kind, day: '2026-12-01' })]);
    const s = await getExperimentSnapshot(deps({ read: redis, config: AB, now: () => new Date('2026-12-03T12:00:00+01:00') }));
    expect(s).toMatchObject({ closed: { kind, day: '2026-12-01' }, closureMismatch: true, frozenAt: '2026-12-01' });
    expect(s.live.freshness).toEqual({
      kind: 'paused',
      pausedOn: berlinStartOfDay('2026-12-01'),
      reason: 'I stopped counting for this run and am checking the stored result before showing it',
    });
    expect(toPublicData(s, { commit: null }, AB)).toMatchObject({ decision: null, closureMismatch: true });
  });

  it.each([
    { kind: 'decision', day: '2026-12-01', rows: [
      { day: '2026-12-01', a: { entry: 600, inview: 300, engaged: 420, card: 30 }, b: { entry: 600, inview: 300, engaged: 432, card: 120 } },
    ], status: 'ship-b' },
    { kind: 'decision', day: '2026-12-01', rows: [
      { day: '2026-12-01', a: { entry: 600, inview: 300, engaged: 432, card: 120 }, b: { entry: 600, inview: 300, engaged: 420, card: 30 } },
    ], status: 'stop-for-harm' },
    { kind: 'held', day: '2026-12-02', rows: [
      { day: '2026-12-01', a: { entry: 60, inview: 50, engaged: 50, card: 5 }, b: { entry: 60, inview: 50, engaged: 50, card: 15 } },
      { day: '2026-12-02', a: { entry: 340, inview: 250, engaged: 250, card: 95 }, b: { entry: 340, inview: 250, engaged: 250, card: 10 } },
    ], status: 'ab' },
  ])('preserves reconstructed $kind/$status and surfaces a conflicting marker day', async ({ kind, day, rows, status }) => {
    const redis = createMemoryRedis();
    await seed(redis, AB.namespace, rows);
    const d = deps({ read: redis, config: AB, now: () => new Date('2026-12-03T12:00:00+01:00') });
    const before = await getExperimentSnapshot(d);
    expect(before.status).toBe(status);
    await redis.command(['SET', keys.closed(AB.namespace), JSON.stringify({ kind, day })]);
    const after = await getExperimentSnapshot(d);
    expect(after).toEqual({ ...before, closed: { kind, day } });
    expect(closingMarker(after)).toEqual({ kind, day });
    await redis.command(['SET', keys.closed(AB.namespace), JSON.stringify({ kind, day: '2026-12-03' })]);
    const log = vi.fn();
    const mismatch = await getExperimentSnapshot({ ...d, log });
    expect(mismatch).toMatchObject({ closed: { kind, day: '2026-12-03' }, closureMismatch: true, frozenAt: '2026-12-03' });
    expect(toPublicData(mismatch, { commit: null }, AB).decision).toBeNull();
    expect(log).toHaveBeenCalledWith({ evt: 'snapshot', outcome: 'warning', reason: 'closure-mismatch', ms: expect.any(Number) });
  });

  it('says nothing a visitor cannot read in the closure sentences: no internal words, first person', async () => {
    const redis = createMemoryRedis();
    await redis.command(['SET', keys.closed(AB.namespace), JSON.stringify({ kind: 'decision', day: '2026-12-01' })]);
    const ab = await getExperimentSnapshot(deps({ read: redis, config: AB, now: () => new Date('2026-12-03T12:00:00+01:00') }));
    const calibration = createMemoryRedis();
    await calibration.command(['SET', keys.closed(CALIBRATION.namespace), JSON.stringify({ kind: 'aa-failed', day: '2026-11-06' })]);
    const cal = await getExperimentSnapshot(deps({ read: calibration,
      flags: async () => ({ ...NO_FLAGS, aaFailed: { on: '2026-11-07T09:00:00+01:00', reason: 'x' } }) }));
    const sentences = [
      ab.live.freshness.kind === 'paused' ? ab.live.freshness.reason : '',
      cal.live.aaFailed?.reason ?? '',
    ];
    expect(sentences.every((t) => t.length > 0)).toBe(true);
    for (const t of sentences) {
      expect(t).not.toMatch(/namespace|persist|marker|flag|closure|arm\b|redis|key\b/i);
      expect(t).toMatch(/\bI\b/);
    }
  });

  it.each(['2026-11-01', '2026-11-21'])('refuses marker day %s outside the namespace lifetime', async (day) => {
    const redis = createMemoryRedis();
    await redis.command(['SET', keys.closed(CALIBRATION.namespace), JSON.stringify({ kind: 'aa-failed', day })]);
    await expect(getExperimentSnapshot(deps({ read: redis }))).rejects.toBeInstanceOf(CorruptCounters);
  });

  it('bounds a hung marker read and rejects a failed marker read even with readable counters', async () => {
    const redis = createMemoryRedis();
    const read: RedisRest = { ...redis, command: (c) => c[0] === 'GET' ? Promise.reject(new RedisUnavailable('marker unavailable')) : redis.command(c) };
    await expect(getExperimentSnapshot(deps({ read }))).rejects.toBeInstanceOf(RedisUnavailable);
    vi.useFakeTimers();
    try {
      const hung: RedisRest = { ...redis, command: (c) => c[0] === 'GET' ? new Promise(() => {}) : redis.command(c) };
      const p = getExperimentSnapshot(deps({ read: hung }));
      const failure = expect(p).rejects.toBeInstanceOf(RedisUnavailable);
      await vi.advanceTimersByTimeAsync(2000);
      await failure;
    } finally { vi.useRealTimers(); }
  });
});
