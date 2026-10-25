import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ServerEnv } from '@/lib/env';

const sdk = vi.hoisted(() => ({
  createClient: vi.fn(),
  get: vi.fn(),
}));

vi.mock('@vercel/edge-config', () => ({
  createClient: (connection: string | undefined, options?: unknown) => {
    sdk.createClient(connection, options);
    return { get: (key: string) => sdk.get(key) };
  },
}));

const { FlagsUnavailable, NO_FLAGS, parseFlags, readFlags } = await import('@/lib/experiment/flags');

const PAUSED = { on: '2026-11-20T09:00:00+01:00', reason: 'a tracking fault is being fixed' };

let connection = 0;
/** A production env with a fresh connection string, so each test starts with an empty route cache. */
function env(over: Partial<ServerEnv> = {}): ServerEnv {
  connection += 1;
  return { vercelEnv: 'production', fakeStore: false, edgeConfig: `https://edge-config.example/ecfg_test${connection}?token=t`, ...over };
}

beforeEach(() => {
  sdk.createClient.mockClear();
  sdk.get.mockReset();
});

describe('parseFlags', () => {
  it('a missing item (undefined) is NO_FLAGS', () => {
    expect(parseFlags(undefined)).toEqual(NO_FLAGS);
    expect(NO_FLAGS).toEqual({ paused: null, aaFailed: null, malformed: false });
  });

  it('an empty object is NO_FLAGS', () => {
    expect(parseFlags({})).toEqual(NO_FLAGS);
  });

  it('reads a pause', () => {
    expect(parseFlags({ paused: PAUSED })).toEqual({ paused: PAUSED, aaFailed: null, malformed: false });
  });

  it('reads aaFailed with and without restartsOn', () => {
    const failed = { on: '2026-11-20T09:00:00+01:00', reason: 'the split check failed' };
    expect(parseFlags({ aaFailed: failed })).toEqual({ paused: null, aaFailed: failed, malformed: false });
    const restarting = { ...failed, restartsOn: '2026-11-27T00:00:00+01:00' };
    expect(parseFlags({ aaFailed: restarting })).toEqual({ paused: null, aaFailed: restarting, malformed: false });
  });

  it('null flags are the same as absent ones', () => {
    expect(parseFlags({ paused: null, aaFailed: null })).toEqual(NO_FLAGS);
  });

  const malformed: [string, unknown][] = [
    ['a reason of 0 characters', { paused: { ...PAUSED, reason: '' } }],
    ['a reason over 140 characters', { paused: { ...PAUSED, reason: 'x'.repeat(141) } }],
    ['a blank reason', { paused: { ...PAUSED, reason: '   ' } }],
    ['an on without an offset', { paused: { ...PAUSED, on: '2026-11-20T09:00:00' } }],
    ['an on that is not a date', { paused: { ...PAUSED, on: 'soon' } }],
    ['a restartsOn without an offset', { aaFailed: { ...PAUSED, restartsOn: '2026-11-27' } }],
    ['an unknown key in a flag', { paused: { ...PAUSED, by: 'someone' } }],
    ['an unknown top-level key', { paused: PAUSED, extra: true }],
    ['a string', 'paused'],
    ['a number', 1],
    ['null', null],
    ['an array', [PAUSED]],
    ['a flag that is a string', { paused: 'yes' }],
  ];
  it.each(malformed)('%s is malformed, with both flags null', (_, item) => {
    expect(parseFlags(item)).toEqual({ paused: null, aaFailed: null, malformed: true });
  });

  it('a reason of exactly 140 characters is valid', () => {
    expect(parseFlags({ paused: { ...PAUSED, reason: 'x'.repeat(140) } }).malformed).toBe(false);
  });
});

describe('readFlags', () => {
  it('without GLOBAL_CONFIG resolves NO_FLAGS without calling the SDK', async () => {
    await expect(readFlags(env({ edgeConfig: undefined }), 'route')).resolves.toEqual(NO_FLAGS);
    await expect(readFlags(env({ edgeConfig: undefined }), 'page')).resolves.toEqual(NO_FLAGS);
    expect(sdk.createClient).not.toHaveBeenCalled();
    expect(sdk.get).not.toHaveBeenCalled();
  });

  it("reads the 'experiment' item and parses it", async () => {
    sdk.get.mockResolvedValue({ paused: PAUSED });
    const e = env();
    await expect(readFlags(e, 'route')).resolves.toEqual({ paused: PAUSED, aaFailed: null, malformed: false });
    expect(sdk.get).toHaveBeenCalledWith('experiment');
    expect(sdk.createClient).toHaveBeenCalledWith(e.edgeConfig, undefined);
  });

  it("page mode passes { cache: 'force-cache' } and keeps no in-process cache", async () => {
    sdk.get.mockResolvedValue(undefined);
    const e = env();
    await readFlags(e, 'page');
    await readFlags(e, 'page');
    expect(sdk.createClient).toHaveBeenCalledWith(e.edgeConfig, { cache: 'force-cache' });
    expect(sdk.get).toHaveBeenCalledTimes(2);
  });

  it('route mode: two reads 30 s apart call the SDK once; 50 s apart, twice', async () => {
    sdk.get.mockResolvedValue(undefined);
    let t = 1_000_000;
    const now = () => t;
    const e = env();
    await readFlags(e, 'route', now);
    t += 30_000;
    await readFlags(e, 'route', now);
    expect(sdk.get).toHaveBeenCalledTimes(1);

    const f = env();
    await readFlags(f, 'route', now);
    t += 50_000;
    await readFlags(f, 'route', now);
    expect(sdk.get).toHaveBeenCalledTimes(3);
  });

  it('route mode caches a malformed item too (it stops counting until fixed)', async () => {
    sdk.get.mockResolvedValue('paused');
    const e = env();
    let t = 0;
    await expect(readFlags(e, 'route', () => t)).resolves.toMatchObject({ malformed: true });
    t += 10_000;
    await expect(readFlags(e, 'route', () => t)).resolves.toMatchObject({ malformed: true });
    expect(sdk.get).toHaveBeenCalledTimes(1);
  });

  it('a read error rejects and is not cached; the next read tries again', async () => {
    sdk.get.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined);
    const e = env();
    await expect(readFlags(e, 'route', () => 0)).rejects.toThrow();
    await expect(readFlags(e, 'route', () => 1)).resolves.toEqual(NO_FLAGS);
  });

  it('the error message names no connection string or token', async () => {
    sdk.get.mockRejectedValueOnce(new Error('failed https://edge-config.example/ecfg?token=secret'));
    const e = env();
    const error = await readFlags(e, 'route').catch((x: unknown) => x);
    expect(String(error)).not.toContain('token');
    expect(String(error)).not.toContain('edge-config.example');
  });

  it('the source creates the client from env.edgeConfig', () => {
    const source = readFileSync(join(import.meta.dirname, '../../../src/lib/experiment/flags.ts'), 'utf8');
    expect(source).toContain('createClient(env.edgeConfig');
  });
});

describe('readFlags timeout', () => {
  afterEach(() => vi.useRealTimers());

  it('route mode treats an Edge Config read that takes over 500 ms as a read error, and does not cache it', async () => {
    vi.useFakeTimers();
    sdk.get.mockImplementationOnce(() => new Promise(() => {})).mockResolvedValueOnce(undefined);
    const e = env();
    const pending = readFlags(e, 'route', () => 0);
    const settled = expect(pending).rejects.toBeInstanceOf(FlagsUnavailable);
    await vi.advanceTimersByTimeAsync(499);
    let done = false;
    void pending.catch(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await settled;
    await expect(readFlags(e, 'route', () => 1)).resolves.toEqual(NO_FLAGS);
  });
});
