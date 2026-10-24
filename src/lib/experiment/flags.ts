// The operational flags in Edge Config, item key 'experiment': the pause switch and the human note
// on a failed calibration. A phase change is never a flag (it is a commit and a redeploy). Server
// only. A missing item means "not paused"; an item this module cannot read is `malformed`, which
// stops counting (fail closed). A read error is the caller's to handle: the event route counts on
// and logs it, a page render throws.
import { createClient } from '@vercel/edge-config';
import { EXPERIMENT } from '../../experiment.values.ts';
import type { ServerEnv } from '../env.ts';

export type ExperimentFlags = {
  /** `reason` is 1 to 140 characters, is shown on the site, and never names a person. */
  paused: { on: string; reason: string } | null;
  aaFailed: { on: string; reason: string; restartsOn?: string } | null;
  malformed: boolean;
};

export const NO_FLAGS: ExperimentFlags = Object.freeze({ paused: null, aaFailed: null, malformed: false }) as ExperimentFlags;
const MALFORMED: ExperimentFlags = Object.freeze({ paused: null, aaFailed: null, malformed: true }) as ExperimentFlags;

const ITEM_KEY = 'experiment';
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const MAX_REASON = 140;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isInstant = (v: unknown): v is string => typeof v === 'string' && ISO_WITH_OFFSET.test(v) && !Number.isNaN(Date.parse(v));

function isReason(v: unknown): v is string {
  if (typeof v !== 'string' || v.trim() === '') return false;
  const length = [...v].length;
  // No control characters: the reason is printed on the page.
  return length <= MAX_REASON && !/[\u0000-\u001f\u007f]/.test(v);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.every((k) => allowed.includes(k)) && required.every((k) => own.includes(k));
}

/** Undefined (no item) gives NO_FLAGS; anything this module could not have been given is malformed. */
export function parseFlags(item: unknown): ExperimentFlags {
  if (item === undefined) return NO_FLAGS;
  if (!isRecord(item) || !hasOnlyKeys(item, ['paused', 'aaFailed'], [])) return MALFORMED;
  let paused: ExperimentFlags['paused'] = null;
  let aaFailed: ExperimentFlags['aaFailed'] = null;
  const p = item.paused;
  if (p !== undefined && p !== null) {
    if (!isRecord(p) || !hasOnlyKeys(p, ['on', 'reason'], ['on', 'reason']) || !isInstant(p.on) || !isReason(p.reason)) return MALFORMED;
    paused = { on: p.on, reason: p.reason };
  }
  const a = item.aaFailed;
  if (a !== undefined && a !== null) {
    if (!isRecord(a) || !hasOnlyKeys(a, ['on', 'reason', 'restartsOn'], ['on', 'reason']) || !isInstant(a.on) || !isReason(a.reason)) {
      return MALFORMED;
    }
    if (a.restartsOn !== undefined && !isInstant(a.restartsOn)) return MALFORMED;
    aaFailed = a.restartsOn === undefined ? { on: a.on, reason: a.reason } : { on: a.on, reason: a.reason, restartsOn: a.restartsOn };
  }
  return { paused, aaFailed, malformed: false };
}

/** The Edge Config could not be read. The message never names the connection string. */
export class FlagsUnavailable extends Error {
  constructor() {
    super('experiment flags unavailable');
    this.name = 'FlagsUnavailable';
  }
}

/** Route mode: the last good read per connection string, kept for flagsCacheSeconds. */
const routeCache = new Map<string, { at: number; flags: ExperimentFlags }>();

/**
 * The flags. Without GLOBAL_CONFIG: NO_FLAGS, and the SDK is never called.
 * - 'page' (build and ISR): `{ cache: 'force-cache' }`, so the read joins the page's data cache.
 * - 'route' (the event route): the SDK's default no-store fetch, behind an in-process cache of
 *   flagsCacheSeconds. Read errors are not cached.
 */
export async function readFlags(env: ServerEnv, mode: 'page' | 'route', now: () => number = Date.now): Promise<ExperimentFlags> {
  if (env.edgeConfig === undefined) return NO_FLAGS;
  const key = env.edgeConfig;
  if (mode === 'route') {
    const hit = routeCache.get(key);
    if (hit !== undefined && now() - hit.at < EXPERIMENT.flagsCacheSeconds * 1000) return hit.flags;
  }
  let item: unknown;
  try {
    const client = createClient(env.edgeConfig, mode === 'page' ? { cache: 'force-cache' } : undefined);
    item = await client.get(ITEM_KEY);
  } catch {
    // The cause is dropped on purpose: it can carry the connection string and its token.
    throw new FlagsUnavailable();
  }
  const flags = parseFlags(item);
  if (mode === 'route') routeCache.set(key, { at: now(), flags });
  return flags;
}
