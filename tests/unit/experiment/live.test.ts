import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { EXPERIMENT, FIXTURE_START, type ExperimentConfig } from '@/experiment.config';
import type { ServerEnv } from '@/lib/env';
import { EVENT_TYPES } from '@/lib/experiment/events';
import { NO_FLAGS, type ExperimentFlags } from '@/lib/experiment/flags';
import { fieldName, keys } from '@/lib/experiment/keys';
import { freshnessAt, getExperimentSnapshot, getLiveView, liveView, type SnapshotDeps } from '@/lib/experiment/live';
import { createMemoryRedis, type MemoryRedis } from '@/lib/experiment/memory-redis';
import { createRedisRest, RedisUnavailable, type RedisRest } from '@/lib/experiment/redis-rest';
import { buildSnapshot, type ExperimentSnapshot } from '@/lib/experiment/snapshot';
import { readClosed, type CounterRows, type GroupCounts } from '@/lib/experiment/store';
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
function expectHonestPlaceholder(s: ExperimentSnapshot, reason: RegExp, config: ExperimentConfig = EXPERIMENT) {
  expect(s.source).toBe('unavailable');
  expect(s.live.plannedEnd).not.toBe(plannedEnd(EXPERIMENT, FIXTURE_START).at);
  expect(s.live.plannedEnd).toBe(plannedEnd(config, config.calibration.startedOn ?? NOW.toISOString()).at);
  expect([s.live.nA, s.live.nB, s.funnel.entryViews, s.funnel.beaconsReceived]).toEqual([0, 0, 0, 0]);
  expect(s.live.series).toEqual([]);
  expect(s.live.freshness).toMatchObject({ kind: 'paused', reason: expect.stringMatching(reason) });
  expect(liveView(s, 'a').refs).toEqual(['build']);
  expect(liveView(s, 'a').testNote).toEqual({ mode: 'paused' });
}
function expectNotStarted(s: ExperimentSnapshot) {
  // The earliest end if it started now: a true lower bound, not the fixture's date.
  expectHonestPlaceholder(s, /not started/);
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
    const s = await getExperimentSnapshot({ env, mode: 'none', read: null, write: null, now: () => NOW, config: EXPERIMENT, log: () => {} });
    expectHonestPlaceholder(s, /could not be read/);
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

  it('reads with a request init that has no cache or next option (the page stays static)', async () => {
    const inits: RequestInit[] = [];
    const fetch = (async (_url: string, init: RequestInit) => {
      inits.push(init);
      return new Response(JSON.stringify({ result: [] }), { status: 200 });
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

  async function setup(nowIso: string) {
    const redis = createMemoryRedis();
    await seed(redis, AB.namespace, [WIN]);
    const tasks: (() => Promise<unknown>)[] = [];
    const d = deps({ read: redis, write: redis, config: AB, now: () => new Date(nowIso), schedule: (t) => tasks.push(t) });
    return { redis, tasks, d };
  }

  it('does nothing before the decided day is a completed look (00:30 Berlin the next day)', async () => {
    const { redis, tasks, d } = await setup('2026-12-02T00:30:00+01:00');
    const s = await getExperimentSnapshot(d);
    expect(s.status).toBe('ab');
    expect(tasks).toHaveLength(0);
    await expect(readClosed(redis, AB.namespace)).resolves.toBeNull();
  });

  it('schedules the closing check once the look is completed (00:32), and only once per store', async () => {
    const { redis, tasks, d } = await setup('2026-12-02T00:32:00+01:00');
    const s = await getExperimentSnapshot(d);
    expect(s.status).toBe('ship-b');
    expect(tasks).toHaveLength(1);
    await tasks[0]!();
    await expect(readClosed(redis, AB.namespace)).resolves.toEqual({ kind: 'decision', day: '2026-12-01' });
    await getExperimentSnapshot(d);
    expect(tasks).toHaveLength(1);
  });

  it('never schedules without a write client, and a failing scheduler never fails the read', async () => {
    const { d } = await setup('2026-12-02T00:32:00+01:00');
    await expect(getExperimentSnapshot({ ...d, write: null })).resolves.toMatchObject({ status: 'ship-b' });
    const redis = createMemoryRedis();
    await seed(redis, AB.namespace, [WIN]);
    const throwing = () => {
      throw new Error('outside a request');
    };
    await expect(getExperimentSnapshot({ ...d, read: redis, write: redis, schedule: throwing })).resolves.toMatchObject({ status: 'ship-b' });
  });
});

describe('freshnessAt', () => {
  const s = snap();
  const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

  it('is fresh at 14 minutes after the read and stale at 16', () => {
    expect(freshnessAt(s, at(14))).toEqual({ kind: 'fresh' });
    expect(freshnessAt(s, at(16))).toEqual({ kind: 'stale', updatedAt: s.readAt, renderedAt: at(16) });
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

  it('says calibration while calibrating and after a failed calibration', () => {
    const rows = [{ day: '2026-11-03', a: counts({ entry: 4, inview: 3 }), b: counts({ entry: 5, inview: 2 }) }];
    const c = snap({ counters: { ...EMPTY, days: rows } });
    expect(c.status).toBe('calibration');
    expect(liveView(c, 'b').testNote).toEqual({ mode: 'calibration' });
    const failed = snap({
      counters: { ...EMPTY, days: rows },
      flags: { paused: null, aaFailed: { on: '2026-11-04T09:00:00+01:00', reason: 'a beacon fault' }, malformed: false },
    });
    expect(failed.status).toBe('aa-failed');
    expect(liveView(failed, 'b').testNote).toEqual({ mode: 'calibration' });
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
    expect(Object.keys(v).sort()).toEqual(['body', 'namespace', 'refs', 'snapshot', 'state', 'testNote']);
    const text = JSON.stringify(v);
    for (const key of ['"p"', '"pValue"', '"chi2"', '"looks"', '"current"', '"funnel"', '"srm"', '"calibration"']) expect(text).not.toContain(`${key}:`);
  });

  it('getLiveView reads and returns the view only', async () => {
    const v = await getLiveView('a', deps());
    expect(Object.keys(v).sort()).toEqual(['body', 'namespace', 'refs', 'snapshot', 'state', 'testNote']);
    expect(v.refs).toEqual(['live']);
  });
});

describe('the source', () => {
  const SRC = resolve(import.meta.dirname, '../../../src');

  it('of live.ts never names the write token', () => {
    expect(readFileSync(join(SRC, 'lib/experiment/live.ts'), 'utf8')).not.toContain('kvToken');
  });

  it('gives pages the live view only: no page or component reads the whole snapshot', () => {
    // The snapshot holds p-values and exact outcome counts; only the blinded data.json route reads it.
    const ALLOWED = new Set([join(SRC, 'app/experiment/data.json/route.ts')]);
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
