// The event route's production wiring. Server only. Writes go through storeAccess, which gives a
// write client only in production with the write token (or the loopback fake in development), so
// anything else fails closed as not-production.
import { serverEnv } from '../env.ts';
import { storeAccess } from './access.ts';
import { readFlags } from './flags.ts';
import type { EventDeps } from './handler.ts';

export function eventDeps(): EventDeps {
  const env = serverEnv();
  return {
    env,
    write: storeAccess(env).write,
    flags: () => readFlags(env, 'route'),
    now: () => new Date(),
    // One JSON line per request; LogLine holds categories only.
    log: (line) => console.log(JSON.stringify(line)),
    // The owner's exclusion cookie is not wired yet: nobody is excluded as self.
    ownerCookieValid: () => false,
  };
}
