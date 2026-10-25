// Who may read and who may write the experiment store. Server only.
// - Writes happen only in production with the write token. The one exception is the loopback fake
//   (EXPERIMENT_FAKE_STORE=1 and a 127.0.0.1 or localhost URL) in development, which is what
//   `next dev`, `next start` and CI run as (VERCEL_ENV unset); a preview deployment never writes.
//   In production the fake flag is ignored: production is never "local", and production without
//   credentials gets no client at all (the callers then fail closed).
// - Reads (build and ISR) use the read-only token wherever it exists.
import type { ServerEnv } from '../env.ts';
import { createRedisRest, type RedisRest } from './redis-rest.ts';

export type StoreAccess = { mode: 'store' | 'local' | 'none'; read: RedisRest | null; write: RedisRest | null };

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost'];

/** True only when the URL's host is exactly 127.0.0.1 or localhost. */
export function isLoopback(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && LOOPBACK_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

export function storeAccess(env: ServerEnv): StoreAccess {
  const url = env.kvUrl;
  if (url === undefined) return { mode: 'none', read: null, write: null };
  const production = env.vercelEnv === 'production';
  const loopback = isLoopback(url);

  const localFake = env.vercelEnv === 'development' && env.fakeStore && loopback;
  const mayWrite = env.kvToken !== undefined && (production || localFake);
  const write = mayWrite ? createRedisRest({ url, token: env.kvToken! }) : null;
  const read = env.kvReadOnlyToken !== undefined ? createRedisRest({ url, token: env.kvReadOnlyToken }) : null;

  if (read === null && write === null) return { mode: 'none', read, write };
  return { mode: !production && loopback ? 'local' : 'store', read, write };
}
