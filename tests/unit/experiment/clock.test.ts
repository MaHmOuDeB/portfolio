import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serverNow, testClockOffsetMs } from '@/lib/experiment/clock';
import { eventDeps } from '@/lib/experiment/deps';
import { FIXTURE_START } from '@/experiment.config';
import type { ServerEnv } from '@/lib/env';
import { E2E_CLOCK_AT } from '../../e2e/constants';

const LOOP = 'http://127.0.0.1:8079';
const HOUR = 3_600_000;

function env(over: Partial<ServerEnv>): ServerEnv {
  return { vercelEnv: 'development', fakeStore: true, kvUrl: LOOP, clockOffsetMs: 5 * HOUR, ...over };
}

describe('testClockOffsetMs', () => {
  it('is honoured only for the loopback fake store in development', () => {
    expect(testClockOffsetMs(env({}))).toBe(5 * HOUR);
    expect(testClockOffsetMs(env({ clockOffsetMs: -2 * HOUR }))).toBe(-2 * HOUR);
  });

  it('is ignored in production, on previews and anywhere on Vercel', () => {
    expect(testClockOffsetMs(env({ vercelEnv: 'production' }))).toBe(0);
    expect(testClockOffsetMs(env({ vercelEnv: 'preview' }))).toBe(0);
    expect(testClockOffsetMs(env({ onVercel: true }))).toBe(0);
  });

  it('is ignored without the fake store or with a store that is not on loopback', () => {
    expect(testClockOffsetMs(env({ fakeStore: false }))).toBe(0);
    expect(testClockOffsetMs(env({ kvUrl: undefined }))).toBe(0);
    expect(testClockOffsetMs(env({ kvUrl: 'https://eu1-quiet-otter-12345.upstash.io' }))).toBe(0);
  });

  it('is 0 when unset', () => {
    expect(testClockOffsetMs(env({ clockOffsetMs: undefined }))).toBe(0);
  });
});

describe('serverNow', () => {
  it('adds the honoured offset to the real clock', () => {
    const before = Date.now();
    const t = serverNow(env({})).getTime();
    expect(t).toBeGreaterThanOrEqual(before + 5 * HOUR);
    expect(t).toBeLessThan(Date.now() + 5 * HOUR + 1000);
  });

  it('is the real clock in production even with the variable set', () => {
    const t = serverNow(env({ vercelEnv: 'production' })).getTime();
    expect(Math.abs(t - Date.now())).toBeLessThan(1000);
  });
});

describe('the e2e clock', () => {
  it('lands after the fixture start, at midday Berlin, so a run neither starts before it nor crosses midnight', () => {
    expect(Date.parse(E2E_CLOCK_AT)).toBeGreaterThan(Date.parse(FIXTURE_START));
    expect(E2E_CLOCK_AT).toMatch(/T12:00:00\+0[12]:00$/);
  });
});

describe('the server clock in the wiring', () => {
  const read = (p: string) => readFileSync(join(import.meta.dirname, '../../../src', p), 'utf8');

  it('the event route and the snapshot reader take their time from serverNow, never new Date() directly', () => {
    for (const file of ['lib/experiment/deps.ts', 'lib/experiment/live.ts']) {
      const source = read(file);
      expect(source, file).toContain('serverNow(');
      expect(source, file).not.toMatch(/new Date\(\)/);
    }
  });
});

describe('the event route clock from the environment', () => {
  const VARS = ['VERCEL_ENV', 'VERCEL', 'EXPERIMENT_FAKE_STORE', 'KV_REST_API_URL', 'EXPERIMENT_CLOCK_OFFSET_MS'] as const;
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const name of VARS) saved[name] = process.env[name];
    process.env.EXPERIMENT_FAKE_STORE = '1';
    process.env.KV_REST_API_URL = LOOP;
    process.env.EXPERIMENT_CLOCK_OFFSET_MS = String(2 * 86_400_000);
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
  });
  afterEach(() => {
    for (const name of VARS) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it('runs ahead for the local fake store', () => {
    expect(eventDeps().now().getTime() - Date.now()).toBeGreaterThan(2 * 86_400_000 - 1000);
  });

  it('is the real clock in production with the same variables set', () => {
    process.env.VERCEL_ENV = 'production';
    expect(Math.abs(eventDeps().now().getTime() - Date.now())).toBeLessThan(1000);
  });
});
