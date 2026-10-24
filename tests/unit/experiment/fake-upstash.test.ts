import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fakeUpstashStore, startFakeUpstash } from '../../../scripts/fake-upstash';
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
});
