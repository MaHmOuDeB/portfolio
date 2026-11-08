import { readFileSync } from 'node:fs';
import { serverEnv } from '@/lib/env';

const VARS = [
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'KV_REST_API_READ_ONLY_TOKEN',
  'GLOBAL_CONFIG',
  'INTERNAL_TRAFFIC_SECRET',
  'EXCLUDE_TOKEN',
  'RATELIMIT_HMAC_KEY',
  'VERCEL_ENV',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_URL',
  'VERCEL_GIT_COMMIT_SHA',
  'EXPERIMENT_FAKE_STORE',
  'VERCEL',
  'NEXT_PHASE',
  'EXPERIMENT_CLOCK_OFFSET_MS',
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of VARS) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of VARS) {
    const value = saved[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('serverEnv', () => {
  it('returns every key undefined and vercelEnv development for an empty env', () => {
    expect(serverEnv()).toEqual({
      kvUrl: undefined,
      kvToken: undefined,
      kvReadOnlyToken: undefined,
      edgeConfig: undefined,
      internalTrafficSecret: undefined,
      excludeToken: undefined,
      ratelimitHmacKey: undefined,
      vercelEnv: 'development',
      productionHost: undefined,
      deploymentHost: undefined,
      gitCommit: undefined,
      fakeStore: false,
      onVercel: false,
      buildPhase: false,
      clockOffsetMs: undefined,
    });
  });

  it('maps each variable to its key', () => {
    process.env.KV_REST_API_URL = 'test-value-url';
    process.env.KV_REST_API_TOKEN = 'test-value-token';
    process.env.KV_REST_API_READ_ONLY_TOKEN = 'test-value-ro';
    process.env.GLOBAL_CONFIG = 'test-value-edge';
    process.env.INTERNAL_TRAFFIC_SECRET = 'test-value-internal';
    process.env.EXCLUDE_TOKEN = 'test-value-exclude';
    process.env.RATELIMIT_HMAC_KEY = 'test-value-hmac';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'test-value-prod-host';
    process.env.VERCEL_URL = 'test-value-deploy-host';
    process.env.VERCEL_GIT_COMMIT_SHA = 'test-value-sha';
    process.env.EXPERIMENT_FAKE_STORE = '1';
    process.env.VERCEL = '1';
    process.env.NEXT_PHASE = 'phase-production-build';
    process.env.EXPERIMENT_CLOCK_OFFSET_MS = '-3600000';
    expect(serverEnv()).toEqual({
      kvUrl: 'test-value-url',
      kvToken: 'test-value-token',
      kvReadOnlyToken: 'test-value-ro',
      edgeConfig: 'test-value-edge',
      internalTrafficSecret: 'test-value-internal',
      excludeToken: 'test-value-exclude',
      ratelimitHmacKey: 'test-value-hmac',
      vercelEnv: 'development',
      productionHost: 'test-value-prod-host',
      deploymentHost: 'test-value-deploy-host',
      gitCommit: 'test-value-sha',
      fakeStore: true,
      onVercel: true,
      buildPhase: true,
      clockOffsetMs: -3_600_000,
    });
  });

  it('reads EXPERIMENT_CLOCK_OFFSET_MS only as a whole number of milliseconds', () => {
    for (const bad of ['1.5', '1e6', 'soon', ' 5', '99999999999999999999']) {
      process.env.EXPERIMENT_CLOCK_OFFSET_MS = bad;
      expect(serverEnv().clockOffsetMs, bad).toBeUndefined();
    }
    process.env.EXPERIMENT_CLOCK_OFFSET_MS = '86400000';
    expect(serverEnv().clockOffsetMs).toBe(86_400_000);
  });

  it('treats empty strings as unset', () => {
    process.env.KV_REST_API_URL = '';
    process.env.VERCEL_ENV = '';
    const env = serverEnv();
    expect(env.kvUrl).toBeUndefined();
    expect(env.vercelEnv).toBe('development');
  });

  it('reads VERCEL_ENV on every call', () => {
    process.env.VERCEL_ENV = 'preview';
    expect(serverEnv().vercelEnv).toBe('preview');
    process.env.VERCEL_ENV = 'production';
    expect(serverEnv().vercelEnv).toBe('production');
    process.env.VERCEL_ENV = 'development';
    expect(serverEnv().vercelEnv).toBe('development');
  });

  it('reads EXPERIMENT_FAKE_STORE as true only for the string 1', () => {
    process.env.EXPERIMENT_FAKE_STORE = '1';
    expect(serverEnv().fakeStore).toBe(true);
    process.env.EXPERIMENT_FAKE_STORE = 'true';
    expect(serverEnv().fakeStore).toBe(false);
    process.env.EXPERIMENT_FAKE_STORE = '0';
    expect(serverEnv().fakeStore).toBe(false);
    process.env.EXPERIMENT_FAKE_STORE = '';
    expect(serverEnv().fakeStore).toBe(false);
  });

  it('no longer reads EDGE_CONFIG', () => {
    process.env.EDGE_CONFIG = 'test-value-old';
    try {
      expect(serverEnv().edgeConfig).toBeUndefined();
    } finally {
      delete process.env.EDGE_CONFIG;
    }
  });

  it('reads VERCEL as onVercel only for the string 1', () => {
    process.env.VERCEL = '1';
    expect(serverEnv().onVercel).toBe(true);
    process.env.VERCEL = 'true';
    expect(serverEnv().onVercel).toBe(false);
    delete process.env.VERCEL;
    expect(serverEnv().onVercel).toBe(false);
  });

  it('reads NEXT_PHASE as the build phase only for phase-production-build', () => {
    process.env.NEXT_PHASE = 'phase-production-build';
    expect(serverEnv().buildPhase).toBe(true);
    process.env.NEXT_PHASE = 'phase-production-server';
    expect(serverEnv().buildPhase).toBe(false);
  });

  it('maps an unknown VERCEL_ENV to development', () => {
    process.env.VERCEL_ENV = 'staging';
    expect(serverEnv().vercelEnv).toBe('development');
  });
});

describe('.env.example', () => {
  const source = readFileSync('src/lib/env.ts', 'utf8');
  const example = readFileSync('.env.example', 'utf8');

  const declared = new Set(
    example
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
      .filter((name): name is string => name !== undefined),
  );
  const read = [...source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]);

  it('finds the variables env.ts reads', () => {
    expect(read.length).toBe(VARS.length);
  });

  it('lists every variable env.ts reads as a NAME= line', () => {
    for (const name of read) expect(declared).toContain(name);
  });

  it('gives every variable an empty value', () => {
    const withValues = example
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#') && /^[A-Z][A-Z0-9_]*=./.test(line));
    expect(withValues).toEqual([]);
  });
});
