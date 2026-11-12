// Shared helpers for the Live test page tests (not a test file): the real reader over an in-memory
// store, so the closure and unreadable cases are what the reader really returns, and the fictional
// fixture configurations of the Home tests.
import type { ExperimentConfig } from '@/experiment.config';
import type { ServerEnv } from '@/lib/env';
import { EVENT_TYPES } from '@/lib/experiment/events';
import { NO_FLAGS, type ExperimentFlags } from '@/lib/experiment/flags';
import { fieldName, keys } from '@/lib/experiment/keys';
import { getExperimentSnapshot, type SnapshotDeps } from '@/lib/experiment/live';
import type { MemoryRedis } from '@/lib/experiment/memory-redis';
import type { ExperimentSnapshot } from '@/lib/experiment/snapshot';
import type { GroupCounts } from '@/lib/experiment/store';

export const AB_NOW = '2026-12-03T12:00:00+01:00';
export const CAL_NOW = '2026-11-20T10:00:00Z';
export const PRODUCTION: ServerEnv = { vercelEnv: 'production', fakeStore: false, kvUrl: 'https://store.example', kvToken: 'w', kvReadOnlyToken: 'r' };
export const BUILD_PRODUCTION: ServerEnv = { ...PRODUCTION, buildPhase: true };

export type G = Partial<GroupCounts>;
export const counts = (g: G = {}): GroupCounts => ({ ...(Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as GroupCounts), ...g });

export async function seed(redis: MemoryRedis, ns: string, rows: readonly { day: string; a: G; b: G }[]): Promise<void> {
  for (const r of rows) {
    for (const arm of ['a', 'b'] as const) {
      for (const [metric, n] of Object.entries(counts(r[arm])) as [keyof GroupCounts, number][]) {
        if (n > 0) await redis.command(['HINCRBY', keys.counters(ns), fieldName({ kind: 'day', day: r.day, arm, metric }), n]);
      }
    }
  }
}

export async function mark(redis: MemoryRedis, ns: string, kind: 'decision' | 'aa-failed' | 'held', day: string): Promise<void> {
  await redis.command(['SET', keys.closed(ns), JSON.stringify({ kind, day })]);
}

/** The real reader over an in-memory store, with no closing writes. */
export function read(
  redis: MemoryRedis,
  o: { config: ExperimentConfig; now: string; flags?: ExperimentFlags; env?: ServerEnv },
): Promise<ExperimentSnapshot> {
  const deps: Partial<SnapshotDeps> = {
    env: o.env ?? PRODUCTION,
    mode: 'store',
    read: redis,
    write: null,
    flags: async () => o.flags ?? NO_FLAGS,
    now: () => new Date(o.now),
    log: () => {},
    config: o.config,
    schedule: () => {},
    closingSeen: new Set<string>(),
  };
  return getExperimentSnapshot(deps);
}

/** A ship-B day: B's card rate is far above A's, the guardrail holds, the split is even. */
export const SHIP_B = [{ day: '2026-12-01', a: { entry: 600, inview: 300, engaged: 420, card: 30 }, b: { entry: 600, inview: 300, engaged: 432, card: 120 } }];
/** A clean first day, then a day whose card clicks outnumber its analysed views: held on 02.12. */
export const INCONSISTENT = [
  { day: '2026-12-01', a: { entry: 60, inview: 50, engaged: 50, card: 5 }, b: { entry: 60, inview: 50, engaged: 50, card: 6 } },
  { day: '2026-12-02', a: { entry: 10, inview: 5, engaged: 5, card: 100 }, b: { entry: 10, inview: 5, engaged: 5, card: 1 } },
];
