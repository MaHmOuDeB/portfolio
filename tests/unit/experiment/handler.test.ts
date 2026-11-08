import { readView } from '@/lib/experiment/store';
import { COMMANDS_PER_FULL_VIEW } from './budget';
import { createHmac } from 'node:crypto';
import type { ServerEnv } from '@/lib/env';
import { EXPERIMENT, type ExperimentConfig } from '@/experiment.config';
import type { BeaconItem, EventType } from '@/lib/experiment/events';
import { NO_FLAGS, readFlags, type ExperimentFlags } from '@/lib/experiment/flags';
import { handleEvent, type EventDeps, type LogLine } from '@/lib/experiment/handler';
import { INTERNAL_MESSAGE } from '@/lib/experiment/internal';
import { keys } from '@/lib/experiment/keys';
import { createMemoryRedis, type MemoryRedis } from '@/lib/experiment/memory-redis';
import { RedisUnavailable, type RedisCommand, type RedisRest } from '@/lib/experiment/redis-rest';
import { buildSnapshot } from '@/lib/experiment/snapshot';
import { ATOMIC_ENTRY_SCRIPT, ATOMIC_LATER_SCRIPT, readCounters, writeClosed } from '@/lib/experiment/store';

const sdk = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@vercel/edge-config', () => ({
  createClient: () => ({ get: (key: string) => sdk.get(key) }),
}));

const NOW = '2026-11-20T10:00:00Z';
const DAY = '2026-11-20';
const NS = 'aa-v1';
const PRODUCTION_HOST = 'portfolio.example';
const DEPLOYMENT_HOST = 'portfolio-abc123.vercel.app';
const CANONICAL = `https://${PRODUCTION_HOST}`;
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const INTERNAL_SECRET = 'test-internal-secret';
const IP = '203.0.113.7';

const CONFIG = {
  ...EXPERIMENT,
  calibration: { ...EXPERIMENT.calibration, startedOn: '2026-11-02T00:00:00+01:00' },
} as unknown as ExperimentConfig;

function config(over: Record<string, unknown>): ExperimentConfig {
  return { ...CONFIG, ...over } as unknown as ExperimentConfig;
}

const PRODUCTION: ServerEnv = {
  vercelEnv: 'production',
  fakeStore: false,
  productionHost: PRODUCTION_HOST,
  deploymentHost: DEPLOYMENT_HOST,
  ratelimitHmacKey: 'test-ratelimit-key',
  internalTrafficSecret: INTERNAL_SECRET,
  edgeConfig: 'https://edge-config.example/ecfg_handler?token=t',
};

/** A valid UUID v4 per view number. */
const pvOf = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const PV = pvOf(1);

type Items = (EventType | BeaconItem)[];
const body = (events: Items, o: { pv?: string; ns?: string; arm?: 'a' | 'b' } = {}) =>
  JSON.stringify({
    v: 1,
    ns: o.ns ?? NS,
    pv: o.pv ?? PV,
    arm: o.arm ?? 'a',
    events: events.map((e) => (typeof e === 'string' ? { type: e } : e)),
  });

type Setup = {
  env?: ServerEnv;
  config?: ExperimentConfig;
  now?: string;
  flags?: () => Promise<ExperimentFlags>;
  write?: (redis: MemoryRedis) => RedisRest | null;
  owner?: (cookie: string | null) => boolean;
  atomicCommand?: (c: RedisCommand) => void;
};

function setup(o: Setup = {}) {
  let t = Date.parse(o.now ?? NOW);
  const redis = createMemoryRedis({ now: () => t, atomicCommand: o.atomicCommand });
  const logs: LogLine[] = [];
  const newDays: [string, string][] = [];
  let flagCalls = 0;
  const flags =
    o.flags ??
    (async () => {
      flagCalls += 1;
      return NO_FLAGS;
    });
  const deps: EventDeps = {
    env: o.env ?? PRODUCTION,
    write: o.write ? o.write(redis) : redis,
    flags,
    now: () => new Date(t),
    log: (l) => logs.push(l),
    config: o.config ?? CONFIG,
    ownerCookieValid: o.owner ?? (() => false),
    onNewDay: (ns, day) => newDays.push([ns, day]),
  };
  async function post(payload: string | BodyInit, headers: Record<string, string | null> = {}, url = `${CANONICAL}/api/e`) {
    const h = new Headers({ origin: CANONICAL, 'sec-fetch-site': 'same-origin', 'x-real-ip': IP, 'user-agent': CHROME, 'content-type': 'text/plain;charset=UTF-8' });
    for (const [k, v] of Object.entries(headers)) {
      if (v === null) h.delete(k);
      else h.set(k, v);
    }
    const init: RequestInit & { duplex?: 'half' } = { method: 'POST', headers: h, body: payload };
    if (payload instanceof ReadableStream) init.duplex = 'half';
    const res = await handleEvent(new Request(url, init), deps);
    const text = await res.text();
    return { status: res.status, cacheControl: res.headers.get('cache-control'), json: text === '' ? null : (JSON.parse(text) as unknown), text };
  }
  async function hash(ns = NS): Promise<Record<string, string>> {
    const flat = (await redis.command(['HGETALL', keys.counters(ns)])) as string[];
    return Object.fromEntries(flat.flatMap((v, i) => (i % 2 === 0 ? [[v, flat[i + 1]!]] : [])));
  }
  return { redis, deps, logs, newDays, post, hash, flagCalls: () => flagCalls, advance: (ms: number) => (t += ms) };
}

const ok = (results: [EventType, string][], extra: Record<string, unknown> = {}) => ({
  ok: true,
  arm: 'a',
  results: results.map(([type, outcome]) => ({ type, outcome })),
  ...extra,
});
const refused = (reason: string) => ({ ok: false, reason });

beforeEach(() => {
  sdk.get.mockReset();
  sdk.get.mockResolvedValue(undefined);
});

describe('1. body', () => {
  it('a Content-Length over 1,024 gives 413 with no body and no write', async () => {
    const s = setup();
    const r = await s.post('x'.repeat(1025), { 'content-length': '1025' });
    expect(r).toMatchObject({ status: 413, text: '', cacheControl: 'no-store' });
    expect(await s.hash()).toEqual({});
    expect(s.redis.entries()).toEqual([]);
    expect(s.logs).toEqual([expect.objectContaining({ evt: 'e', outcome: 'refused', reason: 'too-large', status: 413 })]);
  });

  it('a streamed body over 1,024 bytes without Content-Length gives 413 with no write', async () => {
    const s = setup();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(body(['entry']).padEnd(2000, ' ')));
        c.close();
      },
    });
    const r = await s.post(stream);
    expect(r).toMatchObject({ status: 413, text: '' });
    expect(s.redis.entries()).toEqual([]);
  });

  it('Content-Type text/plain (sendBeacon), application/json and none all count', async () => {
    for (const [n, type] of [
      [1, 'text/plain;charset=UTF-8'],
      [2, 'application/json'],
      [3, null],
    ] as const) {
      const s = setup();
      const r = await s.post(body(['entry'], { pv: pvOf(n) }), { 'content-type': type });
      expect(r.json, String(type)).toEqual(ok([['entry', 'counted']]));
    }
  });

  it('any other Content-Type gives 415 with no write', async () => {
    const s = setup();
    for (const type of ['application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'text/html']) {
      const r = await s.post(body(['entry']), { 'content-type': type });
      expect(r).toMatchObject({ status: 415, text: '' });
    }
    expect(s.redis.entries()).toEqual([]);
  });
});

describe('2. origin', () => {
  it('a foreign Origin gives 403, logged as foreign', async () => {
    const s = setup();
    const r = await s.post(body(['entry']), { origin: 'https://evil.example' });
    expect(r).toMatchObject({ status: 403, text: '', cacheControl: 'no-store' });
    expect(s.redis.entries()).toEqual([]);
    expect(s.logs).toEqual([expect.objectContaining({ outcome: 'refused', reason: 'origin', originKind: 'foreign', status: 403 })]);
  });

  it('a missing Origin gives 403, logged as missing', async () => {
    const s = setup();
    const r = await s.post(body(['entry']), { origin: null });
    expect(r.status).toBe(403);
    expect(s.logs[0]).toMatchObject({ originKind: 'missing', status: 403 });
    expect(s.redis.entries()).toEqual([]);
  });

  it('Sec-Fetch-Site other than same-origin gives 403', async () => {
    const s = setup();
    for (const site of ['cross-site', 'same-site', 'none']) {
      expect((await s.post(body(['entry']), { 'sec-fetch-site': site })).status).toBe(403);
    }
    expect(s.redis.entries()).toEqual([]);
  });

  it('production without productionHost gives 403 for every origin', async () => {
    const s = setup({ env: { ...PRODUCTION, productionHost: undefined } });
    expect((await s.post(body(['entry']))).status).toBe(403);
    expect((await s.post(body(['entry']), { origin: `https://${DEPLOYMENT_HOST}` })).status).toBe(403);
    expect(s.redis.entries()).toEqual([]);
  });

  it('an absent Sec-Fetch-Site with the canonical Origin counts', async () => {
    const s = setup();
    const r = await s.post(body(['entry']), { 'sec-fetch-site': null });
    expect(r).toMatchObject({ status: 200, json: ok([['entry', 'counted']]) });
  });

  it('an Origin equal to the deployment host counts, logged as deployment', async () => {
    const s = setup();
    const r = await s.post(body(['entry']), { origin: `https://${DEPLOYMENT_HOST}` });
    expect(r.json).toEqual(ok([['entry', 'counted']]));
    expect(s.logs[0]).toMatchObject({ outcome: 'counted', originKind: 'deployment', status: 200 });
  });

  it('outside production the allowed origin is the request URL’s own origin', async () => {
    const s = setup({ env: { vercelEnv: 'development', fakeStore: true } });
    const local = 'http://localhost:3123';
    const r = await s.post(body(['entry']), { origin: local }, `${local}/api/e`);
    expect(r.json).toEqual(ok([['entry', 'counted']]));
    expect((await s.post(body(['entry'], { pv: pvOf(2) }), { origin: CANONICAL }, `${local}/api/e`)).status).toBe(403);
  });

  it('outside production the Host header names the own origin (next start builds request.url on localhost)', async () => {
    const s = setup({ env: { vercelEnv: 'development', fakeStore: true } });
    const r = await s.post(body(['entry']), { origin: 'http://127.0.0.1:3123', host: '127.0.0.1:3123' }, 'http://localhost:3123/api/e');
    expect(r.json).toEqual(ok([['entry', 'counted']]));
    const other = await s.post(body(['entry'], { pv: pvOf(2) }), { origin: 'http://localhost:3123', host: '127.0.0.1:3123' }, 'http://localhost:3123/api/e');
    expect(other.status).toBe(403);
  });

  it('in production the Host header changes nothing', async () => {
    const s = setup();
    const r = await s.post(body(['entry']), { origin: 'https://evil.example', host: 'evil.example' }, 'https://evil.example/api/e');
    expect(r.status).toBe(403);
  });
});

describe('3. parse', () => {
  it.each([
    ['invalid JSON', '{'],
    ['an unknown field', JSON.stringify({ ...JSON.parse(body(['entry'])), extra: 1 })],
    ['an entry after another event', body(['inview', 'entry'])],
    ['a repeated type', body(['inview', 'inview'])],
  ])('%s gives 400 with no write', async (_, payload) => {
    const s = setup();
    const r = await s.post(payload);
    expect(r).toMatchObject({ status: 400, text: '', cacheControl: 'no-store' });
    expect(s.redis.entries()).toEqual([]);
    expect(s.logs[0]).toMatchObject({ outcome: 'refused', reason: 'invalid', status: 400 });
  });
});

describe('4 to 6. store, namespace, start and end', () => {
  it('no write client (a preview) gives not-production', async () => {
    const s = setup({ write: () => null, env: { ...PRODUCTION, vercelEnv: 'preview' } });
    const r = await s.post(body(['entry']));
    expect(r).toMatchObject({ status: 200, json: refused('not-production'), cacheControl: 'no-store' });
    expect(s.logs[0]).toMatchObject({ outcome: 'refused', reason: 'not-production' });
  });

  it('a page from before the namespace switch gives stale-namespace', async () => {
    const s = setup();
    const r = await s.post(body(['entry'], { ns: 'aa-v0' }));
    expect(r.json).toEqual(refused('stale-namespace'));
    expect(s.redis.entries()).toEqual([]);
    expect(await s.hash('aa-v0')).toEqual({});
  });

  it('startedOn null in production gives not-started', async () => {
    const s = setup({ config: config({ calibration: { ...CONFIG.calibration, startedOn: null } }) });
    expect((await s.post(body(['entry']))).json).toEqual(refused('not-started'));
    expect(s.redis.entries()).toEqual([]);
  });

  it('one minute before startedOn gives not-started', async () => {
    const s = setup({ now: '2026-11-01T22:59:00Z' });
    expect((await s.post(body(['entry']))).json).toEqual(refused('not-started'));
    expect(s.redis.entries()).toEqual([]);
  });

  it('at startedOn it counts', async () => {
    const s = setup({ now: '2026-11-01T23:00:00Z' });
    expect((await s.post(body(['entry']))).json).toEqual(ok([['entry', 'counted']]));
  });

  it('the A/B before its own startedOn gives not-started', async () => {
    const ab = config({ phase: 'ab', namespace: 'ab-v1', ab: { startedOn: '2026-11-21T00:00:00+01:00', capMonths: 6 } });
    const s = setup({ config: ab });
    expect((await s.post(body(['entry'], { ns: 'ab-v1' }))).json).toEqual(refused('not-started'));
  });

  it('the A/B at its planned end gives ended', async () => {
    const ab = config({ phase: 'ab', namespace: 'ab-v1', ab: { startedOn: '2026-05-20T00:00:00+02:00', capMonths: 6 } });
    const s = setup({ config: ab });
    expect((await s.post(body(['entry'], { ns: 'ab-v1' }))).json).toEqual(refused('ended'));
    expect(await s.hash('ab-v1')).toEqual({});
    const before = setup({ config: ab, now: '2026-11-19T22:59:00Z' });
    expect((await before.post(body(['entry'], { ns: 'ab-v1' }))).json).toEqual(ok([['entry', 'counted']]));
  });

  it('a closed marker gives ended, and nothing is claimed or counted', async () => {
    const s = setup();
    await writeClosed(s.redis, NS, { kind: 'decision', day: '2026-11-19' });
    const r = await s.post(body(['entry']));
    expect(r.json).toEqual(refused('ended'));
    expect(await s.hash()).toEqual({});
    expect(s.redis.entries().filter((e) => e.key.includes(':pv:'))).toEqual([]);
  });

  it('a corrupt closed marker fails closed with unavailable', async () => {
    const s = setup();
    await s.redis.command(['SET', keys.closed(NS), 'open']);
    const r = await s.post(body(['entry']));
    expect(r).toMatchObject({ status: 503, json: refused('unavailable') });
    expect(await s.hash()).toEqual({});
  });
});

describe('7. address and rate limit', () => {
  it('31 requests from one IPv4 address in a minute: the 31st is 429 and records rate_limited once; the flags are read at most once', async () => {
    const s = setup({ flags: () => readFlags(PRODUCTION, 'route', () => Date.parse(NOW)) });
    for (let n = 1; n <= 30; n++) {
      expect((await s.post(body(['entry'], { pv: pvOf(n) }))).status, `request ${n}`).toBe(200);
    }
    const r31 = await s.post(body(['entry'], { pv: pvOf(31) }));
    expect(r31).toMatchObject({ status: 429, text: '', cacheControl: 'no-store' });
    expect(await s.hash()).toMatchObject({ 'r:rate_limited': '1', [`rd:${DAY}:rate_limited`]: '1', 't:a:entry': '30' });
    const r32 = await s.post(body(['entry'], { pv: pvOf(32) }));
    expect(r32.status).toBe(429);
    expect((await s.hash())['r:rate_limited']).toBe('1');
    expect(sdk.get.mock.calls.length).toBeLessThanOrEqual(1);
    expect(s.logs.at(-2)).toMatchObject({ outcome: 'rejected', reason: 'rate_limited', status: 429 });
    expect(s.logs.at(-1)).toMatchObject({ outcome: 'refused', reason: 'rate_limited', status: 429 });
  });

  it('a new minute resets the limit', async () => {
    const s = setup();
    for (let n = 1; n <= 31; n++) await s.post(body(['entry'], { pv: pvOf(n) }));
    s.advance(60_000);
    expect((await s.post(body(['entry'], { pv: pvOf(40) }))).status).toBe(200);
  });

  it('31 addresses of one IPv6 /64 share a bucket: the 31st is 429', async () => {
    const s = setup();
    for (let n = 1; n <= 30; n++) {
      expect((await s.post(body(['entry'], { pv: pvOf(n) }), { 'x-real-ip': `2001:db8:1:2::${n.toString(16)}` })).status).toBe(200);
    }
    expect((await s.post(body(['entry'], { pv: pvOf(31) }), { 'x-real-ip': '2001:db8:1:2::1f' })).status).toBe(429);
    expect((await s.post(body(['entry'], { pv: pvOf(32) }), { 'x-real-ip': '2001:db8:1:3::1' })).status).toBe(200);
  });

  it('without x-real-ip, the first x-forwarded-for entry is the address', async () => {
    const s = setup();
    for (let n = 1; n <= 30; n++) {
      await s.post(body(['entry'], { pv: pvOf(n) }), { 'x-real-ip': null, 'x-forwarded-for': `198.51.100.9, 10.0.0.${n}` });
    }
    const r = await s.post(body(['entry'], { pv: pvOf(31) }), { 'x-real-ip': null, 'x-forwarded-for': '198.51.100.9' });
    expect(r.status).toBe(429);
  });

  it('every batch is rate limited, later batches too: one past the limit is 429 and writes nothing', async () => {
    const s = setup();
    await s.post(body(['entry'], { pv: pvOf(1) }));
    for (let n = 2; n <= 30; n++) await s.post(body(['entry'], { pv: pvOf(n) }));
    const r = await s.post(body(['inview'], { pv: pvOf(1) }));
    expect(r).toMatchObject({ status: 429, text: '' });
    expect((await s.hash())['t:a:inview']).toBeUndefined();
    // rate_limited counts excluded entry views, so a limited later batch records no rejection.
    expect((await s.hash())['r:rate_limited']).toBeUndefined();
    s.advance(60_000);
    expect((await s.post(body(['inview'], { pv: pvOf(1) }))).json).toEqual(ok([['inview', 'counted']], { viewN: 1 }));
  });

  it('the first x-forwarded-for entry is read before x-real-ip: rotating a fake x-real-ip does not escape the limit', async () => {
    const s = setup();
    for (let n = 1; n <= 30; n++) {
      expect((await s.post(body(['entry'], { pv: pvOf(n) }), { 'x-forwarded-for': IP, 'x-real-ip': `198.51.100.${n}` })).status).toBe(200);
    }
    expect((await s.post(body(['entry'], { pv: pvOf(31) }), { 'x-forwarded-for': IP, 'x-real-ip': '198.51.100.31' })).status).toBe(429);
  });

  it('the rate limit runs before the flags read: 30 accepted and 2 limited requests read the flags 30 times', async () => {
    const s = setup();
    for (let n = 1; n <= 32; n++) await s.post(body(['entry'], { pv: pvOf(n) }));
    expect(s.flagCalls()).toBe(30);
  });

  it('production with no address header gives misconfigured, with no write', async () => {
    const s = setup();
    for (const headers of [{ 'x-real-ip': null }, { 'x-real-ip': 'not-an-address' }]) {
      const r = await s.post(body(['entry']), headers);
      expect(r).toMatchObject({ status: 500, json: refused('misconfigured'), cacheControl: 'no-store' });
    }
    expect(s.redis.entries()).toEqual([]);
    expect(s.logs[0]).toMatchObject({ outcome: 'error', reason: 'no-address', status: 500 });
  });

  it('production without RATELIMIT_HMAC_KEY gives misconfigured; development without it counts', async () => {
    const s = setup({ env: { ...PRODUCTION, ratelimitHmacKey: undefined } });
    expect((await s.post(body(['entry']))).json).toEqual(refused('misconfigured'));
    expect(s.redis.entries()).toEqual([]);
    expect(s.logs[0]).toMatchObject({ outcome: 'error', reason: 'no-ratelimit-key' });

    const dev = setup({ env: { vercelEnv: 'development', fakeStore: true } });
    expect((await dev.post(body(['entry']))).json).toEqual(ok([['entry', 'counted']]));
  });

  it('outside production a request without an address uses one local bucket', async () => {
    const s = setup({ env: { vercelEnv: 'development', fakeStore: true } });
    for (let n = 1; n <= 30; n++) await s.post(body(['entry'], { pv: pvOf(n) }), { 'x-real-ip': null });
    expect((await s.post(body(['entry'], { pv: pvOf(31) }), { 'x-real-ip': null })).status).toBe(429);
  });

  it('after rate-limited requests no key, field or value in the store contains the address', async () => {
    const s = setup();
    for (let n = 1; n <= 32; n++) await s.post(body(['entry'], { pv: pvOf(n) }));
    for (let n = 1; n <= 32; n++) await s.post(body(['entry'], { pv: pvOf(100 + n) }), { 'x-real-ip': `2001:db8:1:2::${n.toString(16)}` });
    const dev = setup({ env: { vercelEnv: 'development', fakeStore: true } });
    for (let n = 1; n <= 32; n++) await dev.post(body(['entry'], { pv: pvOf(n) }), { 'x-real-ip': null });
    const dump = JSON.stringify([...s.redis.entries(), ...dev.redis.entries()]);
    for (const needle of [IP, '203.0.113', '2001:db8', '2001:db8:1:2', 'local']) expect(dump).not.toContain(needle);
    expect(s.redis.entries().some((e) => e.key.startsWith('exp:rl:'))).toBe(true);
  });
});

describe('8 and 9. closed and flags', () => {
  it('paused flags give paused, with no write beyond the rate limit', async () => {
    const s = setup({ flags: async () => ({ paused: { on: NOW, reason: 'a fault' }, aaFailed: null, malformed: false }) });
    expect((await s.post(body(['entry']))).json).toEqual(refused('paused'));
    expect(await s.hash()).toEqual({});
    expect(s.redis.entries().every((e) => e.key.startsWith('exp:rl:'))).toBe(true);
  });

  it('malformed flags give paused', async () => {
    const s = setup({ flags: async () => ({ paused: null, aaFailed: null, malformed: true }) });
    expect((await s.post(body(['entry']))).json).toEqual(refused('paused'));
    expect(await s.hash()).toEqual({});
  });

  it('paused flags stop later events too', async () => {
    let paused = false;
    const s = setup({ flags: async () => (paused ? { paused: { on: NOW, reason: 'a fault' }, aaFailed: null, malformed: false } : NO_FLAGS) });
    await s.post(body(['entry']));
    paused = true;
    expect((await s.post(body(['inview']))).json).toEqual(refused('paused'));
    expect((await s.hash())['t:a:inview']).toBeUndefined();
  });

  it('a throwing flags reader is logged and the request still counts', async () => {
    const s = setup({
      flags: async () => {
        throw new Error('edge config down');
      },
    });
    expect((await s.post(body(['entry']))).json).toEqual(ok([['entry', 'counted']]));
    expect(s.logs[0]).toMatchObject({ outcome: 'counted', flagsError: true, status: 200 });
    expect(JSON.stringify(s.logs)).not.toContain('edge config down');
  });

  it('an aaFailed flag alone does not stop counting (the closed marker does)', async () => {
    const s = setup({ flags: async () => ({ paused: null, aaFailed: { on: NOW, reason: 'split check failed' }, malformed: false }) });
    expect((await s.post(body(['entry']))).json).toEqual(ok([['entry', 'counted']]));
  });
});

describe('10. the entry', () => {
  it.each(['LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)', 'Googlebot/2.1 (+http://www.google.com/bot.html)', 'Mozilla/5.0 HeadlessChrome/131.0.0.0'])(
    'the user agent %s records bot',
    async (ua) => {
      const s = setup();
      const r = await s.post(body(['entry']), { 'user-agent': ua });
      expect(r).toMatchObject({ status: 200, json: refused('bot') });
      expect(await s.hash()).toEqual({ 'r:bot': '1', [`rd:${DAY}:bot`]: '1' });
      expect(s.logs[0]).toMatchObject({ outcome: 'rejected', reason: 'bot' });
    },
  );

  it('a valid x-internal records internal; an invalid one counts', async () => {
    const s = setup();
    const header = createHmac('sha256', INTERNAL_SECRET).update(INTERNAL_MESSAGE).digest('hex');
    expect((await s.post(body(['entry']), { 'x-internal': header })).json).toEqual(refused('internal'));
    expect((await s.post(body(['entry'], { pv: pvOf(2) }), { 'x-internal': 'abc' })).json).toEqual(ok([['entry', 'counted']]));
    expect(await s.hash()).toMatchObject({ 'r:internal': '1', [`rd:${DAY}:internal`]: '1', 't:a:entry': '1' });
  });

  it('a valid owner cookie records self, and the cookie header reaches the check', async () => {
    const seen: (string | null)[] = [];
    const s = setup({ owner: (c) => (seen.push(c), c === 'exp-self=ok') });
    expect((await s.post(body(['entry']), { cookie: 'exp-self=ok' })).json).toEqual(refused('self'));
    expect(await s.hash()).toEqual({ 'r:self': '1', [`rd:${DAY}:self`]: '1' });
    expect(seen).toEqual(['exp-self=ok']);
  });

  it.each(['forced', 'not_entry', 'bot'] as const)('the client reject %s records its reason', async (reject) => {
    const s = setup();
    const r = await s.post(body([{ type: 'entry', reject }]));
    expect(r.json).toEqual(refused(reject));
    expect(await s.hash()).toEqual({ [`r:${reject}`]: '1', [`rd:${DAY}:${reject}`]: '1' });
  });

  it('a clean entry counts t:a:entry and the day field, and only the day’s first entry calls onNewDay', async () => {
    const s = setup();
    const r = await s.post(body(['entry']));
    expect(r).toMatchObject({ status: 200, json: ok([['entry', 'counted']]), cacheControl: 'no-store' });
    expect(await s.hash()).toEqual({ 't:a:entry': '1', [`d:${DAY}:a:entry`]: '1' });
    expect(s.newDays).toEqual([[NS, DAY]]);
    await s.post(body(['entry'], { pv: pvOf(2), arm: 'b' }));
    await s.post(body(['entry'], { pv: pvOf(3) }));
    expect(s.newDays).toEqual([[NS, DAY]]);
    expect(s.logs[0]).toMatchObject({ evt: 'e', outcome: 'counted', originKind: 'canonical', status: 200 });
  });

  it('a repeated entry is duplicate and counts nothing more', async () => {
    const s = setup();
    await s.post(body(['entry']));
    const r = await s.post(body(['entry']));
    expect(r.json).toEqual(ok([['entry', 'duplicate']]));
    expect(await s.hash()).toEqual({ 't:a:entry': '1', [`d:${DAY}:a:entry`]: '1' });
    expect(s.logs[1]).toMatchObject({ outcome: 'partial' });
  });

  it('the same view with a bot user agent sent twice records r:bot once', async () => {
    const s = setup();
    await s.post(body(['entry']), { 'user-agent': 'Googlebot/2.1' });
    const r = await s.post(body(['entry']), { 'user-agent': 'Googlebot/2.1' });
    expect(r.json).toEqual(ok([['entry', 'duplicate']]));
    expect(await s.hash()).toEqual({ 'r:bot': '1', [`rd:${DAY}:bot`]: '1' });
  });

  it('a counted entry sent twice increments the daily ceiling once', async () => {
    const s = setup();
    await s.post(body(['entry']));
    await s.post(body(['entry']));
    await expect(s.redis.command(['GET', keys.ceiling(NS, DAY)])).resolves.toBe('1');
  });

  it('with dailyEntryCeiling 2, the third clean entry records ceiling once and is refused', async () => {
    const s = setup({ config: config({ dailyEntryCeiling: 2 }) });
    await s.post(body(['entry'], { pv: pvOf(1) }));
    await s.post(body(['entry'], { pv: pvOf(2) }));
    expect((await s.post(body(['entry'], { pv: pvOf(3) }))).json).toEqual(refused('ceiling'));
    expect((await s.post(body(['entry'], { pv: pvOf(4) }))).json).toEqual(refused('ceiling'));
    expect(await s.hash()).toEqual({ 't:a:entry': '2', [`d:${DAY}:a:entry`]: '2', 'r:ceiling': '1', [`rd:${DAY}:ceiling`]: '1' });
    expect(s.logs[2]).toMatchObject({ outcome: 'rejected', reason: 'ceiling' });
    expect(s.logs[3]).toMatchObject({ outcome: 'refused', reason: 'ceiling' });
  });

  it('a bot-refused entry and a ceiling-refused entry leave their later events orphans', async () => {
    const s = setup({ config: config({ dailyEntryCeiling: 1 }) });
    await s.post(body(['entry'], { pv: pvOf(1) }), { 'user-agent': 'Googlebot/2.1' });
    expect((await s.post(body(['inview'], { pv: pvOf(1) }))).json).toEqual(ok([['inview', 'orphan']]));
    await s.post(body(['entry'], { pv: pvOf(2) }));
    await s.post(body(['entry'], { pv: pvOf(3) }));
    expect((await s.post(body(['inview', 'card'], { pv: pvOf(3) }))).json).toEqual(
      ok([
        ['inview', 'orphan'],
        ['card', 'orphan'],
      ]),
    );
    expect((await s.hash())['t:a:inview']).toBeUndefined();
  });
});

describe('11. record', () => {
  it('returns orphans when the entry reservation expires before finalization of a flush', async () => {
    let expireFirst = true;
    const s = setup({
      write: (redis) => ({
        ...redis,
        async command(c) {
          const result = await redis.command(c);
          if (expireFirst && c[0] === 'EVAL' && c[3] === keys.ceiling(NS, DAY)) s.advance(CONFIG.pvTtlSeconds * 1000);
          return result;
        },
      }),
    });
    const r = await s.post(body(['entry', 'inview', 'card']));
    expect(r.json).toEqual(ok([['entry', 'orphan'], ['inview', 'orphan'], ['card', 'orphan']]));
    expect(await s.hash()).toEqual({});
    expect(s.newDays).toEqual([[NS, DAY]]);
    expireFirst = false;
    expect((await s.post(body(['entry'], { pv: pvOf(2) }))).json).toEqual(ok([['entry', 'counted']]));
    expect(await s.hash()).toEqual({ 't:a:entry': '1', [`d:${DAY}:a:entry`]: '1' });
    expect(s.newDays).toEqual([[NS, DAY]]);
  });

  it.each(['entry', 'later'] as const)('replays a live batch after the %s EVAL commits but its reply is lost', async (lost) => {
    let dropReply = true;
    const s = setup({
      write: (redis) => ({
        ...redis,
        async command(c) {
          const result = await redis.command(c);
          if (dropReply && c[0] === 'EVAL' && c[1] === (lost === 'entry' ? ATOMIC_ENTRY_SCRIPT : ATOMIC_LATER_SCRIPT)) {
            dropReply = false;
            throw new RedisUnavailable('lost reply');
          }
          return result;
        },
      }),
    });
    const pairs = (...events: EventType[]) => Object.fromEntries(
      events.flatMap(type => [[`t:a:${type}`, '1'], [`d:${DAY}:a:${type}`, '1']]),
    );
    const flush = body(['entry', 'inview', 'card']);

    expect(await s.post(flush)).toMatchObject({ status: 503, json: refused('unavailable') });
    expect(await s.hash()).toEqual(lost === 'entry' ? pairs('entry') : pairs('entry', 'inview', 'card'));
    const { claims } = await readView(s.redis, { ns: NS, pv: PV, closed: false, expiry: false });
    expect(claims.entry).toBe('a');
    expect(claims.inview).toBe(lost === 'entry' ? undefined : 'a');

    const replay = lost === 'entry' ? 'counted' : 'duplicate';
    expect((await s.post(flush)).json).toEqual(ok(
      [['entry', 'duplicate'], ['inview', replay], ['card', replay]],
      lost === 'entry' ? { viewN: 1 } : {},
    ));
    expect(await s.hash()).toEqual(pairs('entry', 'inview', 'card'));
    expect((await s.post(body(['secondary']))).json).toEqual(ok([['secondary', 'counted']]));
    expect(await s.hash()).toEqual(pairs('entry', 'inview', 'card', 'secondary'));
    expect((await s.post(body(['entry'], { pv: pvOf(2) }))).json).toEqual(ok([['entry', 'counted']]));
    expect(s.newDays).toEqual([[NS, DAY]]);
  });

  it.each([-1, 0, 1])('checks later expiry at execution at offset %i ms', async (offset) => {
    const s = setup({
      write: (redis) => ({
        ...redis,
        async command(c) {
          if (c[0] === 'EVAL' && c[1] === ATOMIC_LATER_SCRIPT) s.advance(2);
          return redis.command(c);
        },
      }),
    });
    await s.post(body(['entry']));
    s.advance(CONFIG.pvTtlSeconds * 1000 + offset - 2);
    const outcome = offset < 0 ? 'counted' : 'orphan';
    expect((await s.post(body(['inview', 'card']))).json).toEqual(
      ok([['inview', outcome], ['card', outcome]], offset < 0 ? { viewN: 1 } : {}),
    );
    const hash = await s.hash();
    expect(hash['t:a:entry']).toBe('1');
    for (const type of ['inview', 'card']) expect(hash[`t:a:${type}`]).toBe(offset < 0 ? '1' : undefined);
  });

  it('a batch [inview, card] after the entry counts both, in order, with viewN 1', async () => {
    const s = setup();
    await s.post(body(['entry']));
    const r = await s.post(body(['inview', 'card']));
    expect(r.json).toEqual(
      ok(
        [
          ['inview', 'counted'],
          ['card', 'counted'],
        ],
        { viewN: 1 },
      ),
    );
    expect(await s.hash()).toMatchObject({ 't:a:inview': '1', 't:a:card': '1', [`d:${DAY}:a:card`]: '1' });
  });

  it('viewN is the inview total of the group', async () => {
    const s = setup();
    await s.post(body(['entry'], { pv: pvOf(1) }));
    await s.post(body(['inview'], { pv: pvOf(1) }));
    await s.post(body(['entry'], { pv: pvOf(2) }));
    expect((await s.post(body(['inview'], { pv: pvOf(2) }))).json).toMatchObject({ viewN: 2 });
    expect((await s.post(body(['engaged'], { pv: pvOf(2) }))).json).not.toHaveProperty('viewN');
  });

  it('a batch [card] without inview gives orphan', async () => {
    const s = setup();
    await s.post(body(['entry']));
    const r = await s.post(body(['card']));
    expect(r.json).toEqual(ok([['card', 'orphan']]));
    expect((await s.hash())['t:a:card']).toBeUndefined();
  });

  it('a whole view in one batch (a flush) counts every event in order', async () => {
    const s = setup();
    const all: EventType[] = ['entry', 'inview', 'engaged', 'card', 'secondary', 'cv', 'contact'];
    const r = await s.post(body(all));
    expect(r.json).toEqual(ok(all.map((t) => [t, 'counted']), { viewN: 1 }));
    expect(await s.hash()).toMatchObject(Object.fromEntries(all.map((t) => [`t:a:${t}`, '1'])));
    expect(s.newDays).toEqual([[NS, DAY]]);
  });

  it('a re-sent batch (entry already counted) counts only what is new', async () => {
    const s = setup();
    await s.post(body(['entry', 'inview']));
    const r = await s.post(body(['entry', 'inview', 'card']));
    expect(r.json).toEqual(
      ok(
        [
          ['entry', 'duplicate'],
          ['inview', 'duplicate'],
          ['card', 'counted'],
        ],
      ),
    );
    expect(await s.hash()).toMatchObject({ 't:a:entry': '1', 't:a:inview': '1', 't:a:card': '1' });
  });

  it('a later event of another group is an orphan', async () => {
    const s = setup();
    await s.post(body(['entry']));
    expect((await s.post(body(['inview'], { arm: 'b' }))).json).toEqual({ ok: true, arm: 'b', results: [{ type: 'inview', outcome: 'orphan' }] });
  });

  it('every claim of a view expires with its entry claim', async () => {
    const s = setup();
    await s.post(body(['entry']));
    s.advance(29 * 60_000);
    await s.post(body(['inview', 'card']));
    const claims = s.redis.entries().filter((e) => e.key.includes(':pv:'));
    expect(claims).toHaveLength(1);
    expect((await readView(s.redis, { ns: NS, pv: PV, closed: false, expiry: false })).claims)
      .toEqual({ entry: 'a', inview: 'a', card: 'a' });
    const entryExpiry = claims.find((e) => e.key.endsWith(':entry'))!.expiresAt;
    expect(entryExpiry).toBe(Date.parse(NOW) + 1_800_000);
    for (const c of claims) expect(c.expiresAt).toBe(entryExpiry);
  });

  it('at 2026-10-25T00:30:00Z (the clocks-back night) the day field is d:2026-10-25', async () => {
    const s = setup({ now: '2026-10-25T00:30:00Z', config: config({ calibration: { ...CONFIG.calibration, startedOn: '2026-10-01T00:00:00+02:00' } }) });
    await s.post(body(['entry']));
    expect(await s.hash()).toEqual({ 't:a:entry': '1', 'd:2026-10-25:a:entry': '1' });
  });

  it('a later event counts on its entry\'s Berlin day, not on the day it arrives', async () => {
    // 23:50 in Berlin on 20 November; the clicks arrive at 00:10 on the 21st.
    const s = setup({ now: '2026-11-20T22:50:00Z' });
    await s.post(body(['entry']));
    s.advance(20 * 60_000);
    await s.post(body(['inview', 'card']));
    expect(await s.hash()).toEqual({
      't:a:entry': '1',
      'd:2026-11-20:a:entry': '1',
      't:a:inview': '1',
      'd:2026-11-20:a:inview': '1',
      't:a:card': '1',
      'd:2026-11-20:a:card': '1',
    });
  });

  it('forged B views that fill a day\'s ceiling cannot carry their clicks past midnight into the analysis', async () => {
    const s = setup({ now: '2026-11-20T22:50:00Z', config: config({ dailyEntryCeiling: 3 }) });
    for (let n = 1; n <= 4; n += 1) await s.post(body(['entry', 'inview'], { pv: pvOf(n), arm: 'b' }));
    s.advance(20 * 60_000);
    for (let n = 1; n <= 3; n += 1) await s.post(body(['card'], { pv: pvOf(n), arm: 'b' }));
    const h = await s.hash();
    expect(h['d:2026-11-20:b:card']).toBe('3');
    expect(h['rd:2026-11-20:ceiling']).toBe('1');
    expect(Object.keys(h).some((k) => k.startsWith('d:2026-11-21:'))).toBe(false);
    const snap = buildSnapshot({
      counters: await readCounters(s.redis, NS),
      flags: NO_FLAGS,
      now: '2026-11-22T12:00:00+01:00',
      start: '2026-11-02T00:00:00+01:00',
      source: 'local',
    });
    expect(snap.ceilingDays).toEqual(['2026-11-20']);
    expect(snap.looks).toEqual([]);
    expect(snap.inconsistentOn).toBeNull();
    expect([snap.live.nA, snap.live.nB]).toEqual([0, 0]);
  });
});

describe('a prerequisite is never satisfied by a claim that was not counted', () => {
  function failCounterCommit(failing: { on: boolean }) {
    return (command: RedisCommand) => {
      if (failing.on && command[0] === 'HSET') throw new RedisUnavailable('counter commit failed');
    };
  }

  it('[inview] fails before its counter commit (503); the flush re-sends [inview, card]: card is not counted without inview', async () => {
    const failing = { on: false };
    const s = setup({ atomicCommand: failCounterCommit(failing) });
    await s.post(body(['entry']));
    failing.on = true;
    expect((await s.post(body(['inview']))).status).toBe(503);
    failing.on = false;
    const r = await s.post(body(['inview', 'card']));
    expect(r.json).toEqual(
      ok([
        ['inview', 'duplicate'],
        ['card', 'orphan'],
      ]),
    );
    const hash = await s.hash();
    expect(hash['t:a:card']).toBeUndefined();
    expect(hash['t:a:inview']).toBeUndefined();
  });

  it('[inview, card] failing together counts neither; the re-sent pair counts neither either (lost, never wrong)', async () => {
    const failing = { on: false };
    const s = setup({ atomicCommand: failCounterCommit(failing) });
    await s.post(body(['entry']));
    failing.on = true;
    expect((await s.post(body(['inview', 'card', 'secondary']))).status).toBe(503);
    failing.on = false;
    await s.post(body(['inview', 'card', 'secondary']));
    const hash = await s.hash();
    for (const t of ['inview', 'card', 'secondary']) expect(hash[`t:a:${t}`]).toBeUndefined();
  });

  it('a counted inview is promoted to the arm after its counter commit and keeps the entry expiry', async () => {
    const s = setup();
    await s.post(body(['entry']));
    await s.post(body(['inview']));
    await expect(readView(s.redis, { ns: NS, pv: PV, closed: false, expiry: true })).resolves.toMatchObject({
      claims: { entry: 'a', inview: 'a' }, entryExpiry: Date.parse(NOW) + 1_800_000,
    });
    expect((await s.post(body(['card']))).json).toEqual(ok([['card', 'counted']]));
  });

  it('a re-sent [entry, inview] whose entry was promoted after the snapshot reads the fresh entry claim', async () => {
    // The original [entry] completes between this request's snapshot and its claim.
    let promoted = false;
    const s = setup({
      write: (redis) => ({
        command: async (c) => {
          if (!promoted && c[0] === 'SET' && c[1] === keys.claim(NS, PV, 'entry')) {
            promoted = true;
            await redis.command(['SET', keys.claim(NS, PV, 'entry'), '-', 'NX', 'EX', 1800]);
            await redis.command(['SET', keys.claim(NS, PV, 'entry'), 'a', 'XX', 'KEEPTTL']);
          }
          return redis.command(c);
        },
        pipeline: (cs) => redis.pipeline(cs),
        transaction: (cs) => redis.transaction(cs),
      }),
    });
    const r = await s.post(body(['entry', 'inview']));
    expect(r.json).toEqual(
      ok(
        [
          ['entry', 'duplicate'],
          ['inview', 'counted'],
        ],
        { viewN: 1 },
      ),
    );
  });
});

describe('bounded rereads of a duplicate pending entry', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
  afterEach(() => vi.useRealTimers());

  it.each(['a', 'b'] as const)('recovers an in-flight entry for arm %s', async (arm) => {
    const atCeiling = Promise.withResolvers<void>();
    const releaseEntry = Promise.withResolvers<void>();
    const firstRead = Promise.withResolvers<void>();
    const rereadTimes: number[] = [];
    const s = setup({
      write: (redis) => ({
        ...redis,
        async command(c) {
          if (c[0] === 'EVAL' && c[3] === keys.ceiling(NS, DAY)) {
            atCeiling.resolve();
            await releaseEntry.promise;
          }
          return redis.command(c);
        },
        async pipeline(cs) {
          const values = await redis.pipeline(cs);
          if (cs[0]?.[0] === 'GET' && cs[0][1] === keys.claim(NS, PV, 'entry')) {
            rereadTimes.push(performance.now());
            firstRead.resolve();
          }
          return values;
        },
      }),
    });
    const original = s.post(body(['entry'], { arm }));
    await atCeiling.promise;
    const flush = s.post(body(['entry', 'inview', 'card'], { arm }));
    try {
      await firstRead.promise;
      await vi.advanceTimersByTimeAsync(99);
      expect(rereadTimes).toEqual([0]);
      releaseEntry.resolve();
      expect((await original).json).toEqual(ok([['entry', 'counted']], { arm }));
      s.advance(100);
      await vi.advanceTimersByTimeAsync(1);
      expect((await flush).json).toEqual(
        ok([['entry', 'duplicate'], ['inview', 'counted'], ['card', 'counted']], { arm, viewN: 1 }),
      );
      expect(rereadTimes).toEqual([0, 100]);
      await expect(readView(s.redis, { ns: NS, pv: PV, closed: false, expiry: false })).resolves.toMatchObject({
        claims: { entry: arm, inview: arm, card: arm },
      });
      expect(await s.hash()).toMatchObject({
        [`t:${arm}:entry`]: '1',
        [`t:${arm}:inview`]: '1',
        [`t:${arm}:card`]: '1',
      });
    } finally {
      releaseEntry.resolve();
      await original;
    }
  });

  it('does not poll a young pending claim when pre-poll work uses the request budget', async () => {
    const atFlags = Promise.withResolvers<void>();
    const releaseFlags = Promise.withResolvers<void>();
    const claim = keys.claim(NS, PV, 'entry');
    const readTimes: number[] = [];
    const s = setup({
      flags: async () => {
        atFlags.resolve();
        await releaseFlags.promise;
        return NO_FLAGS;
      },
      write: (redis) => ({
        ...redis,
        pipeline(cs) {
          if (cs[0]?.[0] === 'GET' && cs[0][1] === claim) readTimes.push(performance.now());
          return redis.pipeline(cs);
        },
      }),
    });
    const flush = s.post(body(['entry', 'inview', 'card']));
    await atFlags.promise;
    await vi.advanceTimersByTimeAsync(3_000);
    s.advance(3_000);
    await s.redis.command(['SET', claim, '-', 'NX', 'EX', CONFIG.pvTtlSeconds]);
    releaseFlags.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await s.redis.command(['SET', claim, 'a', 'XX', 'KEEPTTL']);
    s.advance(300);
    await vi.advanceTimersByTimeAsync(300);

    expect((await flush).json).toEqual(ok([['entry', 'duplicate'], ['inview', 'orphan'], ['card', 'orphan']]));
    expect(readTimes).toEqual([3_000]);
    await expect(s.redis.command(['GET', keys.claim(NS, PV, 'card')])).resolves.toBeNull();
  });

  it.each([
    ['recent refusal', 0, 3],
    ['stale refusal', 3_000, 0],
    ['insufficient claim age budget', 2_900, 0],
    ['expired claim', 0, 1],
    ['other arm', 0, 1],
    ['slow reread', 0, 1],
  ] as const)('keeps later items orphaned for %s', async (scenario, age, retries) => {
    const firstRead = Promise.withResolvers<void>();
    const delayedRead = Promise.withResolvers<void>();
    const readTimes: number[] = [];
    const s = setup({
      write: (redis) => ({
        ...redis,
        async pipeline(cs) {
          if (cs[0]?.[0] === 'GET' && cs[0][1] === keys.claim(NS, PV, 'entry')) {
            readTimes.push(performance.now());
            firstRead.resolve();
            if (readTimes.length === 2 && (scenario === 'slow reread' || scenario === 'expired claim')) await delayedRead.promise;
          }
          return redis.pipeline(cs);
        },
      }),
    });
    const claim = keys.claim(NS, PV, 'entry');
    expect((await s.post(body(['entry']), { 'user-agent': 'Googlebot/2.1' })).json)
      .toEqual({ ok: false, reason: 'bot' });
    s.advance(age);
    const flush = s.post(body(['entry', 'inview', 'card']));
    await firstRead.promise;
    await vi.advanceTimersByTimeAsync(0);
    if (scenario === 'expired claim') {
      await vi.advanceTimersByTimeAsync(100);
      s.advance(CONFIG.pvTtlSeconds * 1000);
      delayedRead.resolve();
    }
    if (scenario === 'other arm') await s.redis.command(['SET', claim, 'b', 'XX', 'KEEPTTL']);
    await vi.advanceTimersByTimeAsync(scenario === 'slow reread' ? 3_000 : 300);
    expect((await flush).json).toEqual(ok([['entry', 'duplicate'], ['inview', 'orphan'], ['card', 'orphan']]));
    expect(readTimes).toEqual(Array.from({ length: retries + 1 }, (_, n) => n * 100));
    if (scenario === 'slow reread') {
      await s.redis.command(['SET', claim, 'a', 'XX', 'KEEPTTL']);
      delayedRead.resolve();
    }
    await expect(s.redis.command(['GET', keys.claim(NS, PV, 'inview')])).resolves.toBeNull();
    await expect(s.redis.command(['GET', keys.claim(NS, PV, 'card')])).resolves.toBeNull();
  });
});

describe('12. errors', () => {
  it('a store whose rate script throws gives 503 unavailable, logged, nothing retried', async () => {
    let calls = 0;
    const s = setup({
      write: (redis) => ({
        transaction: (cs) => redis.transaction(cs),
        pipeline: (cs) => redis.pipeline(cs),
        command: async () => {
          calls += 1;
          throw new RedisUnavailable('rate script failed (network)');
        },
      }),
    });
    const r = await s.post(body(['entry']));
    expect(r).toMatchObject({ status: 503, json: refused('unavailable'), cacheControl: 'no-store' });
    expect(calls).toBe(1);
    expect(s.logs[0]).toMatchObject({ outcome: 'error', reason: 'unavailable', status: 503 });
  });

  it('a store failing after the rate limit also gives 503', async () => {
    const s = setup({
      write: (redis) => ({
        command: async () => {
          throw new RedisUnavailable('command failed (HTTP 500)');
        },
        pipeline: async () => {
          throw new RedisUnavailable('pipeline failed (HTTP 500)');
        },
        transaction: (cs) => redis.transaction(cs),
      }),
    });
    expect((await s.post(body(['entry']))).status).toBe(503);
  });
});

describe('logs', () => {
  it('no log line contains the per-view id, the address, the user agent or the origin', async () => {
    const s = setup({ config: config({ dailyEntryCeiling: 1 }) });
    await s.post(body(['entry']));
    await s.post(body(['entry'], { pv: pvOf(2) }));
    await s.post(body(['inview']));
    await s.post(body(['entry'], { pv: pvOf(3) }), { 'user-agent': 'Googlebot/2.1' });
    await s.post(body(['entry'], { pv: pvOf(4) }), { origin: 'https://evil.example' });
    await s.post('{', {});
    await s.post(body(['entry'], { pv: pvOf(5) }), { 'x-real-ip': null });
    for (let n = 10; n < 45; n++) await s.post(body(['entry'], { pv: pvOf(n) }));
    expect(s.logs.length).toBeGreaterThan(40);
    const text = JSON.stringify(s.logs);
    for (const needle of [PV, pvOf(2), '00000000-0000-4000', IP, '203.0.113', 'Mozilla', 'Googlebot', PRODUCTION_HOST, 'evil.example', 'https://']) {
      expect(text).not.toContain(needle);
    }
    for (const line of s.logs) {
      expect(Object.keys(line).every((k) => ['evt', 'outcome', 'reason', 'originKind', 'status', 'ms', 'flagsError'].includes(k))).toBe(true);
      expect(line.ms).toBeGreaterThanOrEqual(0);
    }
  });
});

/** Counts the Redis commands sent, including MULTI and EXEC. */
function counting(redis: RedisRest) {
  let n = 0;
  return {
    count: () => n,
    reset: () => (n = 0),
    client: {
      command: (c) => ((n += 1), redis.command(c)),
      pipeline: (cs) => ((n += cs.length), redis.pipeline(cs)),
      transaction: (cs) => ((n += cs.length + 2), redis.transaction(cs)),
    } satisfies RedisRest,
  };
}

describe('the command budget', () => {
  async function measure(batches: { events: EventType[] | Items; headers?: Record<string, string | null> }[], o: Setup = {}) {
    let meter: ReturnType<typeof counting> | undefined;
    let inner = 0;
    const s = setup({
      ...o,
      atomicCommand: () => { inner += 1; },
      write: (redis) => {
        meter = counting(redis);
        return meter.client;
      },
    });
    const each: number[] = [];
    const innerEach: number[] = [];
    for (const b of batches) {
      meter!.reset();
      inner = 0;
      await s.post(body(b.events), b.headers);
      each.push(meter!.count());
      innerEach.push(inner);
    }
    return { each, innerEach, total: each.reduce((a, b) => a + b, 0), s };
  }

  it('meters outer and inner commands separately for a full 7-event view in 4 requests', async () => {
    const { each, innerEach, total } = await measure([{ events: ['entry'] }, { events: ['inview'] }, { events: ['engaged'] }, { events: ['card', 'secondary', 'cv', 'contact'] }]);
    const cost = total + innerEach.reduce((a, b) => a + b, 0);
    expect(each).toEqual([5, 2, 2, 2]);
    expect(innerEach).toEqual([12, 9, 8, 8]);
    expect(cost).toBe(COMMANDS_PER_FULL_VIEW);
  });

  it('meters a full view in one flush and in seven single requests', async () => {
    const all: EventType[] = ['entry', 'inview', 'engaged', 'card', 'secondary', 'cv', 'contact'];
    const flush = await measure([{ events: all }]);
    const fragmented = await measure(all.map((t) => ({ events: [t] })));
    expect(flush.total + flush.innerEach.reduce((a, b) => a + b, 0)).toBe(25);
    expect(fragmented.total + fragmented.innerEach.reduce((a, b) => a + b, 0)).toBe(78);
  });

  it('meters a bot-refused entry, its repeat and its later orphan', async () => {
    const bot = { 'user-agent': 'Googlebot/2.1' };
    const { each, innerEach } = await measure([{ events: ['entry'], headers: bot }, { events: ['entry'], headers: bot }, { events: ['inview', 'card'] }]);
    expect(each.map((n, i) => n + innerEach[i]!)).toEqual([9, 5, 12]);
  });

  it('counts rate-limited requests, including the first rejection write, and pre-store refusals', async () => {
    const batches = Array.from({ length: 32 }, (_, i) => ({ events: [{ type: 'entry' as const, reject: 'not_entry' as const }], n: i }));
    let meter: ReturnType<typeof counting> | undefined;
    const s = setup({
      write: (redis) => {
        meter = counting(redis);
        return meter.client;
      },
    });
    const each: number[] = [];
    for (const [i] of batches.entries()) {
      meter!.reset();
      await s.post(body([{ type: 'entry', reject: 'not_entry' }], { pv: pvOf(i + 1) }));
      each.push(meter!.count());
    }
    expect(each.slice(0, 30).every((n) => n === 7)).toBe(true);
    expect(each.slice(30)).toEqual([5, 1]);
    meter!.reset();
    await s.post(body(['entry']), { origin: 'https://evil.example' });
    await s.post(body(['entry'], { ns: 'aa-v0' }));
    expect(meter!.count()).toBe(0);
  });
});
