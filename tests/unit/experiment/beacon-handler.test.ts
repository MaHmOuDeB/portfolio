import { post } from '@/components/experiment/ExperimentBeacon';
import { EXPERIMENT, type ExperimentConfig } from '@/experiment.config';
import { createSender } from '@/lib/experiment/beacon';
import type { BeaconResponse } from '@/lib/experiment/events';
import { NO_FLAGS } from '@/lib/experiment/flags';
import { handleEvent, type EventDeps } from '@/lib/experiment/handler';
import { keys } from '@/lib/experiment/keys';
import { createMemoryRedis } from '@/lib/experiment/memory-redis';
import { ATOMIC_ENTRY_SCRIPT } from '@/lib/experiment/store';

const now = Date.parse('2026-11-20T10:00:00Z');
const ns = 'aa-v1';
const pv = '00000000-0000-4000-8000-000000000001';
const origin = 'https://portfolio.example';
const entryClaim = keys.claim(ns, pv, 'entry');

afterEach(() => vi.unstubAllGlobals());

describe('entry replay through the event handler', () => {
  it.each([
    ['a', 'committed'], ['b', 'committed'],
    ['a', 'pending'], ['b', 'pending'],
    ['a', 'refused'], ['b', 'refused'],
    ['a', 'lost refusal'], ['b', 'lost refusal'],
  ] as const)('arm %s with an original entry %s', async (arm, state) => {
    const redis = createMemoryRedis({ now: () => now });
    const atPromotion = Promise.withResolvers<void>();
    const releasePromotion = Promise.withResolvers<void>();
    const original = Promise.withResolvers<void>();
    const replay = Promise.withResolvers<BeaconResponse | null>();
    let initialResponse: Promise<BeaconResponse | null> | undefined;
    let claimReads = 0;
    const deps: EventDeps = {
      env: {
        vercelEnv: 'production', fakeStore: false, productionHost: 'portfolio.example',
        ratelimitHmacKey: 'test-ratelimit-key',
      },
      config: {
        ...EXPERIMENT,
        calibration: { ...EXPERIMENT.calibration, startedOn: '2026-11-02T00:00:00+01:00' },
      } as unknown as ExperimentConfig,
      flags: async () => NO_FLAGS,
      now: () => new Date(now),
      log: () => {},
      ownerCookieValid: () => state === 'refused' || state === 'lost refusal',
      write: {
        ...redis,
        async command(command) {
          if (state === 'pending' && command[0] === 'EVAL' && command[1] === ATOMIC_ENTRY_SCRIPT) {
            atPromotion.resolve();
            await releasePromotion.promise;
          }
          return redis.command(command);
        },
        async pipeline(commands) {
          if (state === 'pending' && commands[0]?.[0] === 'GET' && commands[0][1] === entryClaim && ++claimReads === 2) {
            releasePromotion.resolve();
            await original.promise;
          }
          return redis.pipeline(commands);
        },
      },
    };

    let requests = 0;
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
      const first = ++requests === 1;
      const headers = new Headers(init.headers);
      headers.set('origin', origin);
      headers.set('sec-fetch-site', 'same-origin');
      headers.set('x-real-ip', '203.0.113.7');
      headers.set('user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
      const response = await handleEvent(new Request(origin + path, { ...init, headers }), deps);
      if (first) {
        original.resolve();
        if (state === 'committed' || state === 'lost refusal') throw new Error('response lost after handler');
      }
      return response;
    });
    const sender = createSender({
      ns, arm, entry: 'entry', newId: () => pv,
      post: (batch, mode) => {
        const response = post(batch, mode);
        if (mode === 'fetch') initialResponse = response;
        else void response.then(replay.resolve, replay.reject);
        return response;
      },
    });

    try {
      sender.enqueue('inview', 'card');
      if (state === 'pending') {
        await Promise.race([atPromotion.promise, original.promise.then(() => {
          throw new Error('original entry completed before the finalizer was held');
        })]);
      }
      else {
        expect(await initialResponse).toEqual(state === 'refused' ? { ok: false, reason: 'self' } : null);
        await Promise.resolve();
      }
      expect(requests).toBe(1);
      sender.flush();
      sender.flush();
      expect(requests).toBe(state === 'refused' ? 1 : 2);
      const accepted = state === 'committed' || state === 'pending';
      if (state !== 'refused') {
        await expect(replay.promise).resolves.toMatchObject({
          ok: true, arm, results: [
            { type: 'entry', outcome: 'duplicate' },
            { type: 'inview', outcome: accepted ? 'counted' : 'orphan' },
            { type: 'card', outcome: accepted ? 'counted' : 'orphan' },
          ],
        });
      }
      if (state === 'pending') expect(claimReads).toBe(2);
      const other = arm === 'a' ? 'b' : 'a';
      const fields = [arm, other].flatMap((a) => ['entry', 'inview', 'card'].map((metric) => `t:${a}:${metric}`));
      const flat = await redis.command(['HGETALL', keys.counters(ns)]) as string[];
      const totals = new Map(flat.flatMap((field, i) => i % 2 === 0 ? [[field, flat[i + 1]!] as const] : []));
      expect(fields.map((field) => totals.get(field))).toEqual([
        ...Array(3).fill(accepted ? '1' : undefined), undefined, undefined, undefined,
      ]);
    } finally {
      releasePromotion.resolve();
      await original.promise;
    }
  });
});
