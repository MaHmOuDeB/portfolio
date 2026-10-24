import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { storeAccess } from '@/lib/experiment/access';
import type { ServerEnv } from '@/lib/env';

const REAL = 'https://eu1-quiet-otter-12345.upstash.io';
const LOOP = 'http://127.0.0.1:8079';

function env(over: Partial<ServerEnv>): ServerEnv {
  return { vercelEnv: 'development', fakeStore: false, ...over };
}

const creds = { kvToken: 'write-token', kvReadOnlyToken: 'read-token' };

/** Which token a client sends, observed through its fetch. */
async function tokenOf(client: { command(c: readonly (string | number)[]): Promise<unknown> }): Promise<string | null> {
  let auth: string | null = null;
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    auth = new Headers(init?.headers).get('Authorization');
    return new Response(JSON.stringify({ result: null }));
  });
  try {
    await client.command(['GET', 'k']);
  } finally {
    spy.mockRestore();
  }
  return auth;
}

describe('storeAccess', () => {
  it('production with url, write and read tokens: both clients, mode store, each with its own token', async () => {
    const a = storeAccess(env({ vercelEnv: 'production', kvUrl: REAL, ...creds }));
    expect(a.mode).toBe('store');
    expect(a.write).not.toBeNull();
    expect(a.read).not.toBeNull();
    expect(await tokenOf(a.write!)).toBe('Bearer write-token');
    expect(await tokenOf(a.read!)).toBe('Bearer read-token');
  });

  it('preview with url, write and read tokens (stray credentials): write is null, read is not', () => {
    const a = storeAccess(env({ vercelEnv: 'preview', kvUrl: REAL, ...creds }));
    expect(a.write).toBeNull();
    expect(a.read).not.toBeNull();
    expect(a.mode).toBe('store');
  });

  it('preview with fakeStore and a loopback url: still no write (the fake is for development and CI only)', () => {
    const a = storeAccess(env({ vercelEnv: 'preview', fakeStore: true, kvUrl: LOOP, ...creds }));
    expect(a.write).toBeNull();
  });

  it('production with fakeStore and a loopback url: write is the real client, mode store, never local', async () => {
    const a = storeAccess(env({ vercelEnv: 'production', fakeStore: true, kvUrl: LOOP, ...creds }));
    expect(a.mode).toBe('store');
    expect(a.write).not.toBeNull();
    expect(await tokenOf(a.write!)).toBe('Bearer write-token');
  });

  it('EXPERIMENT_FAKE_STORE=1 in production without credentials is ignored: mode none, no client (fail closed)', () => {
    for (const kvUrl of [undefined, LOOP, REAL]) {
      const a = storeAccess(env({ vercelEnv: 'production', fakeStore: true, kvUrl }));
      expect(a).toEqual({ mode: 'none', read: null, write: null });
    }
  });

  it('development with fakeStore and a real Upstash url: write is null (the fake is allowed only on loopback)', () => {
    const a = storeAccess(env({ fakeStore: true, kvUrl: 'https://x.upstash.io', ...creds }));
    expect(a.write).toBeNull();
  });

  it.each(['http://127.0.0.1:8079', 'http://localhost:8079', 'http://127.0.0.1:8079/'])(
    'development with fakeStore and %s: mode local, both clients',
    (kvUrl) => {
      const a = storeAccess(env({ fakeStore: true, kvUrl, ...creds }));
      expect(a.mode).toBe('local');
      expect(a.write).not.toBeNull();
      expect(a.read).not.toBeNull();
    },
  );

  it.each([
    'http://localhost.evil.example:8079',
    'http://127.0.0.1.nip.io:8079',
    'http://evil.example/?h=127.0.0.1',
    'http://user@evil.example#127.0.0.1',
    'not a url',
  ])('a url that only looks like loopback (%s) is not loopback', (kvUrl) => {
    const a = storeAccess(env({ fakeStore: true, kvUrl, ...creds }));
    expect(a.write).toBeNull();
  });

  it('development without fakeStore: write is null; a loopback read is mode local', () => {
    const a = storeAccess(env({ kvUrl: LOOP, ...creds }));
    expect(a.write).toBeNull();
    expect(a.read).not.toBeNull();
    expect(a.mode).toBe('local');
  });

  it('production with a url but no write token: write is null', () => {
    const a = storeAccess(env({ vercelEnv: 'production', kvUrl: REAL, kvReadOnlyToken: 'read-token' }));
    expect(a.write).toBeNull();
    expect(a.read).not.toBeNull();
    expect(a.mode).toBe('store');
  });

  it('a write token without a read token gives no read client', () => {
    const a = storeAccess(env({ vercelEnv: 'production', kvUrl: REAL, kvToken: 'write-token' }));
    expect(a.read).toBeNull();
    expect(a.write).not.toBeNull();
  });

  it('no url, or no tokens: mode none', () => {
    expect(storeAccess(env({}))).toEqual({ mode: 'none', read: null, write: null });
    expect(storeAccess(env({ vercelEnv: 'production', ...creds }))).toEqual({ mode: 'none', read: null, write: null });
    expect(storeAccess(env({ fakeStore: true, kvUrl: LOOP }))).toEqual({ mode: 'none', read: null, write: null });
  });

  it("the guard in the source is VERCEL_ENV === 'production' with the write token", () => {
    const src = readFileSync(join(import.meta.dirname, '../../../src/lib/experiment/access.ts'), 'utf8');
    expect(src).toContain("env.vercelEnv === 'production'");
    expect(src).not.toMatch(/createMemoryRedis|memory-redis/);
  });
});
