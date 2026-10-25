// The server's clock for the experiment: the real time, except in the e2e run. Outside production
// every entry is refused as not-started until the fixture start, so the e2e run moves the clock of
// both servers (Next and the loopback fake store) forward by EXPERIMENT_CLOCK_OFFSET_MS. The offset
// is honoured only where writes go to that fake: development, not on Vercel, the fake-store flag, a
// loopback store URL. In production, on a preview and anywhere on Vercel it is ignored, like the
// fake-store flag. Server only.
import type { ServerEnv } from '../env.ts';
import { isLoopback } from './access.ts';

/** The offset in force: the configured one for the local fake store, else 0. */
export function testClockOffsetMs(env: ServerEnv): number {
  if (env.clockOffsetMs === undefined) return 0;
  if (env.vercelEnv !== 'development' || env.onVercel === true || !env.fakeStore) return 0;
  if (env.kvUrl === undefined || !isLoopback(env.kvUrl)) return 0;
  return env.clockOffsetMs;
}

/** Now, on the experiment's server clock. */
export function serverNow(env: ServerEnv): Date {
  return new Date(Date.now() + testClockOffsetMs(env));
}
