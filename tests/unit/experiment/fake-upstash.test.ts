import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { FAKE_RESEND_FAIL, clockOffsetFrom, fakeUpstashStore, startFakeUpstash } from '../../../scripts/fake-upstash';
import { RedisUnavailable, createRedisRest } from '@/lib/experiment/redis-rest';

const ROOT = join(import.meta.dirname, '../../..');
const TOKEN = 'fake-write-token';
const READ = 'fake-read-token';

let server: Awaited<ReturnType<typeof startFakeUpstash>>;

beforeAll(async () => {
  server = await startFakeUpstash({ port: 0, token: TOKEN, readOnlyToken: READ });
});
afterAll(async () => {
  await server.close();
});

const post = (path: string, body: unknown, token: string | null) =>
  fetch(`${server.url}${path}`, {
    method: 'POST',
    headers: token === null ? {} : { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

describe('startFakeUpstash', () => {
  it('answers the three endpoints through createRedisRest', async () => {
    const k = `k:${randomUUID()}`;
    const redis = createRedisRest({ url: server.url, token: TOKEN });
    await expect(redis.command(['SET', k, 'a', 'NX', 'EX', 1800])).resolves.toBe('OK');
    await expect(redis.command(['SET', k, 'b', 'NX', 'EX', 1800])).resolves.toBeNull();
    await expect(
      redis.pipeline([
        ['MGET', k, `${k}:missing`],
        ['PTTL', `${k}:missing`],
      ]),
    ).resolves.toEqual([['a', null], -2]);
    await expect(
      redis.transaction([
        ['HINCRBY', `${k}:h`, 't:a:entry', 1],
        ['HINCRBY', `${k}:h`, 't:a:entry', 1],
      ]),
    ).resolves.toEqual([1, 2]);
    await expect(redis.command(['HGETALL', `${k}:h`])).resolves.toEqual(['t:a:entry', '2']);
    await expect(redis.command(['SET', k, 'b', 'XX', 'KEEPTTL'])).resolves.toBe('OK');
    await expect(redis.command(['GET', k])).resolves.toBe('b');
    expect((await redis.command(['PTTL', k])) as number).toBeGreaterThan(1_790_000);
  });

  it('keeps its data on the globalThis store, so every server in the process shares it', async () => {
    const k = `k:${randomUUID()}`;
    await createRedisRest({ url: server.url, token: TOKEN }).command(['SET', k, 'shared']);
    expect(fakeUpstashStore()).toBe((globalThis as Record<symbol, unknown>)[Symbol.for('portfolio.fakeUpstash')]);
    await expect(fakeUpstashStore().command(['GET', k])).resolves.toBe('shared');
  });

  it('a wrong or missing token gives 401', async () => {
    for (const token of ['wrong', null, `${TOKEN}x`]) {
      const res = await post('/', ['GET', 'k'], token);
      expect(res.status).toBe(401);
      expect(await res.json()).toHaveProperty('error');
    }
    await expect(createRedisRest({ url: server.url, token: 'wrong' }).command(['GET', 'k'])).rejects.toBeInstanceOf(
      RedisUnavailable,
    );
  });

  it('the read-only token gives 403 for SET, INCR and HINCRBY, and 200 for the read commands', async () => {
    for (const c of [
      ['SET', 'k', 'v'],
      ['INCR', 'n'],
      ['HINCRBY', 'h', 'f', 1],
      ['EXPIRE', 'n', 1],
    ]) {
      expect((await post('/', c, READ)).status).toBe(403);
    }
    expect((await post('/pipeline', [['GET', 'k'], ['INCR', 'n']], READ)).status).toBe(403);
    expect((await post('/multi-exec', [['HINCRBY', 'h', 'f', 1]], READ)).status).toBe(403);
    for (const c of [['HGETALL', 'h'], ['GET', 'k'], ['MGET', 'a', 'b'], ['PTTL', 'k'], ['PEXPIRETIME', 'k']]) {
      expect((await post('/', c, READ)).status).toBe(200);
    }
    // The read-only token wrote nothing.
    await expect(fakeUpstashStore().command(['GET', 'n'])).resolves.toBeNull();
  });

  it('an error reply has the Upstash shape, and a discarded transaction applies nothing', async () => {
    const k = `k:${randomUUID()}`;
    const one = await post('/', ['DEL', k], TOKEN);
    expect(one.status).toBe(400);
    expect(await one.json()).toEqual({ error: expect.any(String) });
    const tx = await post('/multi-exec', [['INCR', k], ['FLUSHALL']], TOKEN);
    expect(tx.status).toBe(400);
    expect(await tx.json()).toEqual({ error: expect.any(String) });
    await expect(fakeUpstashStore().command(['GET', k])).resolves.toBeNull();
    const pipe = await post('/pipeline', [['SET', k, 'x'], ['INCR', k]], TOKEN);
    expect(pipe.status).toBe(200);
    expect(await pipe.json()).toEqual([{ result: 'OK' }, { error: expect.any(String) }]);
    expect((await post('/', 'not an array', TOKEN)).status).toBe(400);
    const bad = await fetch(`${server.url}/`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: '{' });
    expect(bad.status).toBe(400);
  });

  it('GET /health gives 200 without a token; anything else is 404', async () => {
    const health = await fetch(`${server.url}/health`);
    expect(health.status).toBe(200);
    expect((await fetch(`${server.url}/nope`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } })).status).toBe(404);
  });

  it('binds to 127.0.0.1 only', () => {
    expect(new URL(server.url).hostname).toBe('127.0.0.1');
    expect(server.address().address).toBe('127.0.0.1');
  });

  it('refuses equal tokens and empty tokens', async () => {
    await expect(startFakeUpstash({ port: 0, token: 'same', readOnlyToken: 'same' })).rejects.toThrow();
    await expect(startFakeUpstash({ port: 0, token: '', readOnlyToken: 'r' })).rejects.toThrow();
  });
});

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

function run(args: string[], env: Record<string, string | undefined>): ChildProcess {
  return spawn(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/fake-upstash.ts', ...args], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, NODE_ENV: 'test', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const exitCode = (child: ChildProcess) => new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));

describe('the fake Resend endpoint (contact form e2e)', () => {
  const KEY = 'fake-resend-key';
  let resend: Awaited<ReturnType<typeof startFakeUpstash>>;
  beforeAll(async () => {
    resend = await startFakeUpstash({ port: 0, token: TOKEN, readOnlyToken: READ, resendKey: KEY });
  });
  afterAll(async () => {
    await resend.close();
  });

  const email = (over: Record<string, unknown> = {}) => ({
    from: 'Portfolio contact <onboarding@resend.dev>',
    to: 'inbox@example.test',
    reply_to: `sender-${randomUUID()}@example.test`,
    subject: '[Portfolio] Something else: hello',
    text: 'Name: A\n',
    ...over,
  });
  const send = (body: unknown, key: string | null = KEY) =>
    fetch(`${resend.url}/resend/emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key === null ? {} : { Authorization: `Bearer ${key}` }) },
      body: JSON.stringify(body),
    });

  it('accepts the five keys with the bearer key, and reads them back by reply_to', async () => {
    const body = email();
    const res = await send(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: expect.stringMatching(/^fake-/) });
    const sent = await fetch(`${resend.url}/resend/sent?reply_to=${encodeURIComponent(body.reply_to)}`);
    expect(await sent.json()).toEqual([body]);
    expect(resend.emails).toContainEqual(body);
  });

  it('a wrong, missing or unset key gives 401 and records nothing', async () => {
    const body = email();
    for (const key of ['wrong', null]) expect((await send(body, key)).status).toBe(401);
    const unset = await startFakeUpstash({ port: 0, token: TOKEN, readOnlyToken: READ });
    try {
      const res = await fetch(`${unset.url}/resend/emails`, { method: 'POST', headers: { Authorization: 'Bearer ' }, body: JSON.stringify(body) });
      expect(res.status).toBe(401);
    } finally {
      await unset.close();
    }
    expect(resend.emails.filter((e) => e.reply_to === body.reply_to)).toEqual([]);
  });

  it('refuses a payload with a missing, extra or non-string key (422)', async () => {
    const { text: _text, ...missing } = email();
    for (const body of [missing, email({ cc: 'x@example.test' }), email({ subject: 1 }), [], null]) {
      expect((await send(body)).status).toBe(422);
    }
  });

  it('answers 500 for a subject holding the failure marker, and records nothing', async () => {
    // tests/e2e/contact.spec.ts spells the marker out, so it must stay this string.
    expect(FAKE_RESEND_FAIL).toBe('FAKE_RESEND_FAIL');
    const body = email({ subject: `[Portfolio] Something else: ${FAKE_RESEND_FAIL}` });
    expect((await send(body)).status).toBe(500);
    expect(resend.emails.filter((e) => e.reply_to === body.reply_to)).toEqual([]);
  });
});

describe('the fake-upstash CLI (Node type stripping)', () => {
  const tokens = { KV_REST_API_TOKEN: 'cli-write', KV_REST_API_READ_ONLY_TOKEN: 'cli-read' };

  it('--port starts the server and --wait exits 0 once /health answers', async () => {
    const port = await freePort();
    const child = run(['--port', String(port)], tokens);
    try {
      expect(await exitCode(run(['--wait', String(port)], {}))).toBe(0);
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(200);
      const redis = createRedisRest({ url: `http://127.0.0.1:${port}`, token: 'cli-write' });
      await expect(redis.command(['INCR', 'n'])).resolves.toBe(1);
    } finally {
      child.kill();
    }
  }, 20_000);

  it('refuses to start in production or without both tokens', async () => {
    const port = await freePort();
    expect(await exitCode(run(['--port', String(port)], { ...tokens, VERCEL_ENV: 'production' }))).not.toBe(0);
    expect(await exitCode(run(['--port', String(port)], { KV_REST_API_TOKEN: 'cli-write' }))).not.toBe(0);
  }, 20_000);

  it('runs its clock EXPERIMENT_CLOCK_OFFSET_MS ahead, so expiries agree with the e2e server', async () => {
    const port = await freePort();
    const offset = 3 * 86_400_000;
    const child = run(['--port', String(port)], { ...tokens, EXPERIMENT_CLOCK_OFFSET_MS: String(offset) });
    try {
      expect(await exitCode(run(['--wait', String(port)], {}))).toBe(0);
      const redis = createRedisRest({ url: `http://127.0.0.1:${port}`, token: 'cli-write' });
      await redis.command(['SET', 'k', 'v', 'PXAT', Date.now() + offset + 60_000]);
      const ttl = (await redis.command(['PTTL', 'k'])) as number;
      expect(ttl).toBeGreaterThan(50_000);
      expect(ttl).toBeLessThanOrEqual(60_000);
    } finally {
      child.kill();
    }
  }, 20_000);
});

describe('clockOffsetFrom', () => {
  it('reads whole milliseconds, 0 when unset, and throws on anything else', () => {
    expect(clockOffsetFrom(undefined)).toBe(0);
    expect(clockOffsetFrom('')).toBe(0);
    expect(clockOffsetFrom('-5000')).toBe(-5000);
    for (const bad of ['1.5', 'soon', '1e3']) expect(() => clockOffsetFrom(bad), bad).toThrow();
  });
});

it('transports exact atomic contracts as nested REST replies and refuses read-only EVAL', async () => {
  const { reserveAtomicEntry, finalizeAtomicEntry, recordAtomicLater, readView, ATOMIC_ENTRY_SCRIPT } = await import('@/lib/experiment/store');
  const redis = createRedisRest({ url: server.url, token: TOKEN });
  const input = { ns: 'atomic-http', pv: randomUUID(), owner: '0123456789abcdef0123456789abcdef', arm: 'b' as const, day: '2026-11-01', ttlSeconds: 1800 };
  await expect(reserveAtomicEntry(redis, input)).resolves.toBe('claimed');
  await expect(finalizeAtomicEntry(redis, input)).resolves.toMatchObject({ outcome: 'counted', arm: 'b', total: 1, dayTotal: 1 });
  const view = await readView(redis, { ...input, closed: true, expiry: true });
  await expect(recordAtomicLater(redis, { ...input, view, items: ['inview', 'card'] })).resolves.toMatchObject([{ type: 'inview', result: { outcome: 'counted', total: 1 } }, { type: 'card', result: { outcome: 'counted', total: 1 } }]);
  expect((await post('/', ['EVAL', ATOMIC_ENTRY_SCRIPT, 0], READ)).status).toBe(403);
  const before = fakeUpstashStore().entries();
  expect((await post('/', ['EVAL', 'return 1', 0], TOKEN)).status).toBe(400);
  expect(fakeUpstashStore().entries()).toEqual(before);
});
