// The production wiring of the event route and of the closing check. Server only. Writes go
// through storeAccess, which gives a write client only in production with the write token (or the
// loopback fake in development), so anything else fails closed as not-production.
import { after } from 'next/server';
import { EXPERIMENT, calibrationStart } from '../../experiment.config.ts';
import { serverEnv } from '../env.ts';
import { storeAccess } from './access.ts';
import { serverNow } from './clock.ts';
import { closeIfDecided } from './close.ts';
import { ownerCookieValid } from './exclude.ts';
import { NO_FLAGS, readFlags } from './flags.ts';
import { createCeilingMemo, type EventDeps } from './handler.ts';

const log = (line: object) => console.log(JSON.stringify(line));

/** Lives as long as the server process: a full daily ceiling is remembered across requests. */
const ceilingMemo = createCeilingMemo();

/**
 * Runs a task after the response (or the prerender) is finished. Outside a request scope, where
 * `after` throws, the task runs on its own; a task here never throws and is safe to repeat.
 */
export function later(task: () => Promise<unknown>): void {
  const safe = () => task().catch(() => {});
  try {
    after(safe);
  } catch {
    void safe();
  }
}

export function eventDeps(): EventDeps {
  const env = serverEnv();
  const write = storeAccess(env).write;
  const start = calibrationStart(EXPERIMENT, env.vercelEnv);
  return {
    env,
    write,
    flags: () => readFlags(env, 'route'),
    now: () => serverNow(env),
    // One JSON line per request; LogLine holds categories only.
    log,
    ceilingMemo,
    // The owner's exclusion cookie (set through /exclude) marks a view as self.
    ownerCookieValid: (cookieHeader) => ownerCookieValid(cookieHeader, env.excludeToken),
    // The day's first granted ceiling slot schedules the closing check after the response.
    // The snapshot determines which looks are complete when the check runs (see close.ts).
    onNewDay: (ns) => {
      if (write === null || start === null) return;
      later(async () => {
        const flags = await readFlags(env, 'route').catch(() => NO_FLAGS);
        await closeIfDecided({ write, ns, config: EXPERIMENT, start, now: serverNow(env).toISOString(), log, flags });
      });
    },
  };
}
