import { EXPERIMENT, type ExperimentConfig } from '@/experiment.config';
import { closeIfDecided } from '@/lib/experiment/close';
import { fieldName, keys } from '@/lib/experiment/keys';
import { createMemoryRedis, type MemoryRedis } from '@/lib/experiment/memory-redis';
import { RedisUnavailable, type RedisRest } from '@/lib/experiment/redis-rest';
import { readClosed, writeClosed, type GroupCounts } from '@/lib/experiment/store';

const START = '2026-11-02T00:00:00+01:00';
const CALIBRATION: ExperimentConfig = { ...EXPERIMENT, calibration: { ...EXPERIMENT.calibration, startedOn: START } } as ExperimentConfig;
const AB: ExperimentConfig = {
  ...CALIBRATION,
  phase: 'ab',
  namespace: 'ab-v1',
  ab: { ...EXPERIMENT.ab, startedOn: '2026-12-01T00:00:00+01:00' },
} as ExperimentConfig;

type G = Partial<GroupCounts>;
async function seed(redis: MemoryRedis, ns: string, rows: { day: string; a: G; b: G }[]): Promise<void> {
  for (const r of rows) {
    for (const arm of ['a', 'b'] as const) {
      for (const [metric, n] of Object.entries(r[arm]) as [keyof GroupCounts, number][]) {
        if (n > 0) await redis.command(['HINCRBY', keys.counters(ns), fieldName({ kind: 'day', day: r.day, arm, metric }), n]);
      }
    }
  }
}

// A clear B win on 01.12 (the ship-B fixture of the builder's tests).
const WIN = { day: '2026-12-01', a: { entry: 600, inview: 300, engaged: 420, card: 30 }, b: { entry: 600, inview: 300, engaged: 432, card: 120 } };
const EVEN = { day: '2026-12-01', a: { entry: 120, inview: 60, engaged: 90, card: 6 }, b: { entry: 120, inview: 60, engaged: 90, card: 7 } };

function run(write: RedisRest, o: { config?: ExperimentConfig; now: string; flags?: Parameters<typeof closeIfDecided>[0]['flags'] }) {
  const lines: object[] = [];
  const config = o.config ?? AB;
  const p = closeIfDecided({ write, ns: config.namespace, config, start: START, now: o.now, log: (l) => lines.push(l), flags: o.flags });
  return { p, lines };
}

describe('closeIfDecided', () => {
  it('writes the decision marker once the decided day is a completed look, and a second call leaves it unchanged', async () => {
    const redis = createMemoryRedis();
    await seed(redis, AB.namespace, [WIN]);
    const first = run(redis, { now: '2026-12-02T00:32:00+01:00' });
    await expect(first.p).resolves.toEqual({ kind: 'decision', day: '2026-12-01' });
    expect(first.lines).toEqual([expect.objectContaining({ evt: 'close', outcome: 'closed', kind: 'decision' })]);
    await expect(readClosed(redis, AB.namespace)).resolves.toEqual({ kind: 'decision', day: '2026-12-01' });
    const second = run(redis, { now: '2026-12-03T00:32:00+01:00' });
    await expect(second.p).resolves.toEqual({ kind: 'decision', day: '2026-12-01' });
    expect(second.lines).toEqual([expect.objectContaining({ outcome: 'already-closed' })]);
    await expect(readClosed(redis, AB.namespace)).resolves.toEqual({ kind: 'decision', day: '2026-12-01' });
  });

  it('reads a day only after its views close: nothing at 00:30 Berlin, the marker at 00:32', async () => {
    const redis = createMemoryRedis();
    await seed(redis, AB.namespace, [WIN]);
    await expect(run(redis, { now: '2026-12-02T00:05:00+01:00' }).p).resolves.toBeNull();
    await expect(run(redis, { now: '2026-12-02T00:30:00+01:00' }).p).resolves.toBeNull();
    await expect(readClosed(redis, AB.namespace)).resolves.toBeNull();
    await expect(run(redis, { now: '2026-12-02T00:32:00+01:00' }).p).resolves.toEqual({ kind: 'decision', day: '2026-12-01' });
  });

  it('keeps a marker another writer set first', async () => {
    const redis = createMemoryRedis();
    await seed(redis, AB.namespace, [WIN]);
    await writeClosed(redis, AB.namespace, { kind: 'held', day: '2026-11-30' });
    await expect(run(redis, { now: '2026-12-02T00:32:00+01:00' }).p).resolves.toEqual({ kind: 'held', day: '2026-11-30' });
  });

  it('writes nothing without a decision', async () => {
    const redis = createMemoryRedis();
    await seed(redis, AB.namespace, [EVEN]);
    const r = run(redis, { now: '2026-12-03T12:00:00+01:00' });
    await expect(r.p).resolves.toBeNull();
    expect(r.lines).toEqual([]);
    await expect(readClosed(redis, AB.namespace)).resolves.toBeNull();
    await expect(run(createMemoryRedis(), { now: '2026-12-03T12:00:00+01:00' }).p).resolves.toBeNull();
  });

  it('closes a held A/B (a data fault: the test is stopped, so counting stops too)', async () => {
    const redis = createMemoryRedis();
    await seed(redis, AB.namespace, [
      { day: '2026-12-01', a: { entry: 60, inview: 50, engaged: 50, card: 5 }, b: { entry: 60, inview: 50, engaged: 50, card: 15 } },
      { day: '2026-12-02', a: { entry: 340, inview: 250, engaged: 250, card: 95 }, b: { entry: 340, inview: 250, engaged: 250, card: 10 } },
    ]);
    await expect(run(redis, { now: '2026-12-03T12:00:00+01:00' }).p).resolves.toEqual({ kind: 'held', day: '2026-12-02' });
  });

  it('closes an A/A that failed by rule, and one failed by the flag alone', async () => {
    const redis = createMemoryRedis();
    // 100 against 900 analysed views: the split check fails on 04.11.
    await seed(redis, CALIBRATION.namespace, [{ day: '2026-11-04', a: { entry: 100, inview: 100, engaged: 100 }, b: { entry: 900, inview: 900, engaged: 900 } }]);
    await expect(run(redis, { config: CALIBRATION, now: '2026-11-06T12:00:00+01:00' }).p).resolves.toEqual({ kind: 'aa-failed', day: '2026-11-04' });

    const flagged = createMemoryRedis();
    await seed(flagged, CALIBRATION.namespace, [{ day: '2026-11-04', a: { entry: 10, inview: 10, engaged: 10, card: 1 }, b: { entry: 10, inview: 10, engaged: 10, card: 1 } }]);
    const flags = { paused: null, aaFailed: { on: '2026-11-06T09:00:00+01:00', reason: 'a beacon fault' }, malformed: false };
    await expect(run(flagged, { config: CALIBRATION, now: '2026-11-06T10:00:00+01:00' }).p).resolves.toBeNull();
    await expect(run(flagged, { config: CALIBRATION, now: '2026-11-06T10:00:00+01:00', flags }).p).resolves.toEqual({ kind: 'aa-failed', day: '2026-11-06' });
  });

  it('logs and resolves null when the store throws', async () => {
    const failing: RedisRest = {
      command: async () => {
        throw new RedisUnavailable('command failed (network)');
      },
      pipeline: async () => [],
      transaction: async () => [],
    };
    const r = run(failing, { now: '2026-12-02T00:32:00+01:00' });
    await expect(r.p).resolves.toBeNull();
    expect(r.lines).toEqual([{ evt: 'close', outcome: 'error', reason: 'store-unavailable' }]);
  });

  it('logs and resolves null when the write fails after a decision', async () => {
    const redis = createMemoryRedis();
    await seed(redis, AB.namespace, [WIN]);
    const flaky: RedisRest = {
      command: async (c) => {
        if (c[0] === 'SET') throw new RedisUnavailable('command failed (HTTP 500)');
        return redis.command(c);
      },
      pipeline: (cs) => redis.pipeline(cs),
      transaction: (cs) => redis.transaction(cs),
    };
    const r = run(flaky, { now: '2026-12-02T00:32:00+01:00' });
    await expect(r.p).resolves.toBeNull();
    expect(r.lines).toEqual([{ evt: 'close', outcome: 'error', reason: 'store-unavailable' }]);
  });
});

describe('later (the after-the-response wiring)', () => {
  it('runs the task on its own outside a request scope, and swallows its failure', async () => {
    const { later } = await import('@/lib/experiment/deps');
    const ran = vi.fn(async () => {});
    later(ran);
    await vi.waitFor(() => expect(ran).toHaveBeenCalledTimes(1));
    expect(() => later(async () => Promise.reject(new Error('boom')))).not.toThrow();
  });

  it('the event route wiring skips the check without a write client', async () => {
    const { eventDeps } = await import('@/lib/experiment/deps');
    const deps = eventDeps();
    expect(deps.write).toBeNull();
    expect(() => deps.onNewDay?.('aa-v1', '2026-11-20')).not.toThrow();
  });
});
