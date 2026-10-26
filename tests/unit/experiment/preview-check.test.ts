import { spawnSync } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { main, shareable } from '../../../scripts/preview-check.ts';

const SECRET = 'bypass-value-that-must-never-be-printed-7f3a';

type Behaviour = {
  /** Which arm `/` serves on request i. */
  arm: (i: number) => 'a' | 'b';
  /** x-vercel-cache of `/` on request i. */
  cache: (i: number, arm: 'a' | 'b') => string;
  /** readAt of data.json on call k (0-based). */
  readAt: (k: number) => string;
  /** Status of a direct /v/a. */
  directStatus: number;
  /** HSTS header on `/`, or none. */
  hsts: string | null;
  /** Status of the k-th POST to /api/e (1-based). */
  post: (k: number) => { status: number; body?: unknown };
  /** Cache-Control of `/`. */
  cacheControl: string;
  /** Status, age and (optionally) x-vercel-cache of `/` for the k-th request of a group after the 310 s wait (0-based). */
  afterWait: (arm: 'a' | 'b', k: number) => { status: number; age: number; cache?: string };
  /** A redirect for every request, or none. */
  redirectTo: string | null;
};

const GOOD: Behaviour = {
  arm: (i) => (i % 2 === 0 ? 'a' : 'b'),
  cache: (i) => (i < 2 ? 'MISS' : 'HIT'),
  readAt: (k) => new Date(Date.UTC(2026, 10, 3, 11, 0, 0) + k * 60_000).toISOString(),
  directStatus: 404,
  hsts: 'max-age=63072000',
  post: (k) => (k <= 30 ? { status: 200, body: { ok: true, arm: 'a', results: [{ type: 'inview', outcome: 'orphan' }] } } : { status: 429 }),
  cacheControl: 'public, max-age=0, must-revalidate',
  // The first copy after the wait is stale (and starts the regeneration); the next ones are new.
  afterWait: (_arm, k) => ({ status: 200, age: k === 0 ? 340 : 3 }),
  redirectTo: null,
};

const SECURITY = {
  'content-security-policy': "default-src 'self'; connect-src 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
};

let server: Server;
let base: string;
let behaviour: Behaviour = GOOD;
let seenBypass: (string | undefined)[] = [];
let counters = { root: 0, data: 0, post: 0 };
let waited = false;
let afterWaitByArm = { a: 0, b: 0 };

function handle(req: IncomingMessage, res: ServerResponse): void {
  seenBypass.push(req.headers['x-vercel-protection-bypass'] as string | undefined);
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  if (behaviour.redirectTo !== null) {
    res.writeHead(307, { location: behaviour.redirectTo });
    res.end();
    return;
  }
  if (req.method === 'GET' && path === '/') {
    const i = counters.root++;
    const arm = behaviour.arm(i);
    const headers: Record<string, string> = {
      ...SECURITY,
      'x-arm': arm,
      'x-vercel-cache': behaviour.cache(i, arm),
      'content-type': 'text/html',
      'cache-control': behaviour.cacheControl,
      age: '120',
    };
    if (behaviour.hsts !== null) headers['strict-transport-security'] = behaviour.hsts;
    let status = 200;
    if (waited) {
      const after = behaviour.afterWait(arm, afterWaitByArm[arm]++);
      status = after.status;
      headers.age = String(after.age);
      if (after.cache !== undefined) headers['x-vercel-cache'] = after.cache;
    }
    res.writeHead(status, headers);
    res.end('<h1>Mahmoud El Bergui</h1>');
    return;
  }
  if (req.method === 'GET' && path === '/experiment/data.json') {
    const k = counters.data++;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ schema: 'experiment-data/1', namespace: 'aa-v1', readAt: behaviour.readAt(k) }));
    return;
  }
  if (req.method === 'GET' && path === '/v/a') {
    res.writeHead(behaviour.directStatus, { 'content-type': 'text/html' });
    res.end('<h1>Page not found</h1>');
    return;
  }
  if (req.method === 'POST' && path === '/api/e') {
    const r = behaviour.post(++counters.post);
    res.writeHead(r.status, r.body === undefined ? {} : { 'content-type': 'application/json' });
    res.end(r.body === undefined ? undefined : JSON.stringify(r.body));
    return;
  }
  res.writeHead(404);
  res.end();
}

beforeAll(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  behaviour = GOOD;
  seenBypass = [];
  counters = { root: 0, data: 0, post: 0 };
  waited = false;
  afterWaitByArm = { a: 0, b: 0 };
});

async function run(argv: string[], env: Record<string, string | undefined> = { VERCEL_AUTOMATION_BYPASS_SECRET: SECRET }) {
  const lines: string[] = [];
  const slept: number[] = [];
  const code = await main(argv, {
    env,
    out: (l) => lines.push(l),
    sleep: async (ms) => {
      slept.push(ms);
      if (ms >= 310_000) waited = true;
    },
    now: () => Date.UTC(2026, 10, 3, 11, 0, 5),
  });
  return { code, out: lines.join('\n'), slept };
}

describe('preview-check', () => {
  it('passes split, isr and headers on good data, and waits more than 300 s between the isr reads', async () => {
    const r = await run([base]);
    expect(r.out).toMatch(/^split: PASS/m);
    expect(r.out).toMatch(/^isr: PASS/m);
    expect(r.out).toMatch(/^headers: PASS/m);
    expect(r.code).toBe(0);
    expect(r.slept.some((ms) => ms >= 310_000)).toBe(true);
    expect(counters.root).toBeGreaterThanOrEqual(200);
  });

  it('fails split when every response is one group', async () => {
    behaviour = { ...GOOD, arm: () => 'a' };
    const r = await run([base, '--only', 'split']);
    expect(r.out).toMatch(/^split: FAIL/m);
    expect(r.code).not.toBe(0);
  });

  it('fails split when one group takes every cache hit', async () => {
    behaviour = { ...GOOD, cache: (_i, arm) => (arm === 'a' ? 'HIT' : 'MISS') };
    const r = await run([base, '--only', 'split']);
    expect(r.out).toMatch(/^split: FAIL.*HIT/m);
    expect(r.code).not.toBe(0);
  });

  it('fails isr when readAt never advances', async () => {
    behaviour = { ...GOOD, readAt: () => '2026-11-03T11:00:00.000Z' };
    const r = await run([base, '--only', 'isr']);
    expect(r.out).toMatch(/^isr: FAIL/m);
    expect(r.code).not.toBe(0);
  });

  it('fails isr when a direct /v/a is not a 404', async () => {
    behaviour = { ...GOOD, directStatus: 200 };
    const r = await run([base, '--only', 'isr']);
    expect(r.out).toMatch(/^isr: FAIL.*\/v\/a/m);
  });

  it('fails headers without HSTS', async () => {
    behaviour = { ...GOOD, hsts: null };
    const r = await run([base, '--only', 'headers']);
    expect(r.out).toMatch(/^headers: FAIL.*strict-transport-security/m);
  });

  it('sends the bypass secret on every request and never prints it', async () => {
    const r = await run([base]);
    expect(seenBypass.length).toBeGreaterThan(200);
    expect(seenBypass.every((v) => v === SECRET)).toBe(true);
    expect(r.out).not.toContain(SECRET);
  });

  it('still never prints the secret when every check fails', async () => {
    behaviour = { ...GOOD, arm: () => 'b', readAt: () => '2026-11-03T11:00:00.000Z', hsts: null, directStatus: 500 };
    const r = await run([base]);
    expect(r.code).not.toBe(0);
    expect(r.out).not.toContain(SECRET);
  });

  it('says the secret is missing, and sends no bypass header then', async () => {
    const r = await run([base, '--only', 'headers'], {});
    expect(r.out).toMatch(/VERCEL_AUTOMATION_BYPASS_SECRET is not set/);
    expect(seenBypass.every((v) => v === undefined)).toBe(true);
  });

  it('refuses a missing or non-http url', async () => {
    expect((await run([])).code).toBe(2);
    expect((await run(['ftp://example.com'])).code).toBe(2);
    expect((await run([base, '--only', 'nope'])).code).toBe(2);
  });

  it('spoof (production only): passes when the 31st request with a rotated address is limited', async () => {
    const r = await run([base, '--only', 'spoof']);
    expect(r.out).toMatch(/^spoof: PASS/m);
    expect(counters.post).toBe(31);
  });

  it('spoof fails when a rotated address escapes the limit', async () => {
    behaviour = { ...GOOD, post: () => ({ status: 200, body: { ok: true, arm: 'a', results: [] } }) };
    const r = await run([base, '--only', 'spoof']);
    expect(r.out).toMatch(/^spoof: FAIL/m);
  });

  it('pause passes once the route answers paused within a minute, and fails when it never does', async () => {
    behaviour = { ...GOOD, post: (k) => (k < 3 ? { status: 200, body: { ok: true, arm: 'a', results: [] } } : { status: 200, body: { ok: false, reason: 'paused' } }) };
    expect((await run([base, '--only', 'pause'])).out).toMatch(/^pause: PASS/m);
    counters.post = 0;
    behaviour = { ...GOOD, post: () => ({ status: 200, body: { ok: true, arm: 'a', results: [] } }) };
    expect((await run([base, '--only', 'pause'])).out).toMatch(/^pause: FAIL/m);
  });

  it('fails split on a Cache-Control a shared cache may store', async () => {
    for (const cacheControl of ['s-maxage=300, stale-while-revalidate=31535700', 'public, max-age=60']) {
      behaviour = { ...GOOD, cacheControl };
      const r = await run([base, '--only', 'split']);
      expect(r.out, cacheControl).toMatch(/^split: FAIL.*shared cache/m);
    }
    behaviour = { ...GOOD, cacheControl: 'private, max-age=60' };
    expect((await run([base, '--only', 'split'])).out).toMatch(/^split: PASS/m);
  });

  it('fails isr when one group page never serves a copy younger than 300 s after the wait', async () => {
    behaviour = { ...GOOD, afterWait: (arm, k) => ({ status: 200, age: arm === 'b' ? 340 + k : k === 0 ? 340 : 3 }) };
    const r = await run([base, '--only', 'isr']);
    expect(r.out).toMatch(/^isr: FAIL.*group b never served a copy younger than 300 s/m);
  });

  it('fails isr when / is a 404 after the wait', async () => {
    behaviour = { ...GOOD, afterWait: () => ({ status: 404, age: 0 }) };
    const r = await run([base, '--only', 'isr']);
    expect(r.out).toMatch(/^isr: FAIL.*\/ answered 404 after the wait/m);
  });

  it('isr counts a young copy only when x-vercel-cache is HIT or REVALIDATED', async () => {
    // A MISS or PRERENDER copy can have a fresh age without the ISR entry having regenerated.
    for (const cache of ['MISS', 'PRERENDER', 'BYPASS']) {
      afterWaitByArm = { a: 0, b: 0 };
      waited = false;
      behaviour = { ...GOOD, afterWait: (_arm, k) => ({ status: 200, age: k === 0 ? 340 : 3, cache }) };
      const r = await run([base, '--only', 'isr']);
      expect(r.out, cache).toMatch(/^isr: FAIL.*never served a copy younger than 300 s/m);
    }
    for (const cache of ['HIT', 'REVALIDATED']) {
      afterWaitByArm = { a: 0, b: 0 };
      waited = false;
      counters = { root: 0, data: 0, post: 0 };
      behaviour = { ...GOOD, afterWait: (_arm, k) => ({ status: 200, age: k === 0 ? 340 : 3, cache: k === 0 ? 'STALE' : cache }) };
      const r = await run([base, '--only', 'isr']);
      expect(r.out, cache).toMatch(/^isr: PASS/m);
    }
  });

  it('isr sees both groups through / before the 310 s wait, and fails when one never appears', async () => {
    const r = await run([base, '--only', 'isr']);
    expect(r.out).toMatch(/^isr: PASS/m);
    // The requests of / made before the wait reached both groups.
    expect(counters.root).toBeGreaterThanOrEqual(2);
    behaviour = { ...GOOD, arm: (i) => (waited && i % 2 === 1 ? 'b' : 'a') };
    counters = { root: 0, data: 0, post: 0 };
    waited = false;
    afterWaitByArm = { a: 0, b: 0 };
    const one = await run([base, '--only', 'isr']);
    expect(one.out).toMatch(/^isr: FAIL.*before the wait.*group b/m);
    expect(one.slept.some((ms) => ms >= 310_000)).toBe(false);
  });

  it('sends the bypass secret only over https or to a loopback host', async () => {
    const seen: { url: string; bypass: string | null }[] = [];
    const fake: typeof fetch = async (input, init) => {
      seen.push({ url: String(input), bypass: new Headers(init?.headers).get('x-vercel-protection-bypass') });
      return new Response('', { status: 200, headers: SECURITY });
    };
    const lines: string[] = [];
    const deps = { env: { VERCEL_AUTOMATION_BYPASS_SECRET: SECRET }, out: (l: string) => lines.push(l), sleep: async () => {}, now: () => 0, fetch: fake };
    await main(['http://portfolio.example', '--only', 'headers'], deps);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s.bypass === null)).toBe(true);
    expect(lines.join('\n')).toMatch(/not sending the bypass secret over plain http/);
    expect(lines.join('\n')).not.toContain(SECRET);
    seen.length = 0;
    await main(['https://portfolio.example', '--only', 'headers'], deps);
    expect(seen.every((s) => s.bypass === SECRET)).toBe(true);
    for (const local of ['http://localhost:3123', 'http://127.0.0.1:3123', 'http://[::1]:3123']) {
      seen.length = 0;
      await main([local, '--only', 'headers'], deps);
      expect(seen.every((s) => s.bypass === SECRET), local).toBe(true);
    }
  });

  it('never follows a redirect, so the secret stays on the deployment', async () => {
    behaviour = { ...GOOD, redirectTo: 'http://127.0.0.1:9/login' };
    const r = await run([base, '--only', 'headers']);
    expect(r.out).toMatch(/^headers: FAIL.*redirected \(307\)/m);
    expect(r.out).not.toContain(SECRET);
  });
});


describe('preview-check CLI (Node type stripping)', () => {
  it('runs as a script and exits 2 without a URL', () => {
    const r = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/preview-check.ts'], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stdout).toMatch(/a deployment URL is required/);
  });
});

describe('shareable', () => {
  it('is true for anything a shared cache may store and reuse', () => {
    for (const cc of ['s-maxage=300', 'public, max-age=60', 'max-age=60', 'public', 'public, must-revalidate']) {
      expect(shareable(cc), cc).toBe(true);
    }
  });

  it('is false for what a shared cache may not reuse without asking', () => {
    for (const cc of [null, '', 'public, max-age=0, must-revalidate', 'private, max-age=60', 'no-store', 'public, no-store', 'no-cache', 'max-age=0', 'public, max-age=60, private']) {
      expect(shareable(cc), String(cc)).toBe(false);
    }
  });
});
