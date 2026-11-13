// The contact form's limit, per server instance and in memory only: five messages an hour from one
// address, and twenty an hour from all addresses together, so one instance never sends more than that
// however many addresses a flood uses. The address (IPv4, or an IPv6 address's /64 network) is counted
// under its HMAC-SHA-256 with a key drawn once per instance (crypto.randomBytes(32)): the key, the
// address and the hash are never logged, stored or sent anywhere. The map holds at most
// CONTACT_MAX_ENTRIES addresses.
//
// Every entry is dropped once its hour has passed: each take() sweeps first, and one timer, armed only
// while an entry is held, fires when the oldest entry's hour is up, sweeps, and is set again for the
// next one. So no entry outlives its window even if no one writes again (a paused instance runs the
// timer when it resumes). Server only (node:crypto, node:net).
import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';
import { ipBucket } from '../experiment/keys.ts';

export const CONTACT_LIMIT = 5;
export const CONTACT_GLOBAL_LIMIT = 20;
export const CONTACT_MAX_ENTRIES = 5_000;
export const CONTACT_WINDOW_MS = 60 * 60 * 1000;

/** ok: counted, it may go. address: this address has reached its limit. total: all addresses have. */
export type LimitResult = 'ok' | 'address' | 'total';

export type ContactLimiter = {
  /** Counts one message from this address and says whether it may go; a refused one is not counted. */
  take(address: string | null): LimitResult;
  /** How many addresses have a message in the window (for tests). */
  size(): number;
  /** The hashes held now (for tests). */
  keys(): string[];
};

export function createContactLimiter(o: {
  now?: () => number;
  schedule?: (run: () => void, ms: number) => void;
  limit?: number;
  globalLimit?: number;
  maxEntries?: number;
  windowMs?: number;
} = {}): ContactLimiter {
  const now = o.now ?? Date.now;
  const limit = o.limit ?? CONTACT_LIMIT;
  const globalLimit = o.globalLimit ?? CONTACT_GLOBAL_LIMIT;
  const maxEntries = o.maxEntries ?? CONTACT_MAX_ENTRIES;
  const windowMs = o.windowMs ?? CONTACT_WINDOW_MS;
  const schedule =
    o.schedule ??
    ((run: () => void, ms: number) => {
      // unref: a pending sweep never keeps the process alive.
      setTimeout(run, ms).unref?.();
    });
  const key = randomBytes(32);
  const entries = new Map<string, number[]>();
  // The send times of every accepted message: no address and no hash, only for the total.
  let recent: number[] = [];
  let armed = false;

  const sweep = () => {
    const cutoff = now() - windowMs;
    recent = recent.filter((t) => t > cutoff);
    for (const [hash, times] of entries) {
      const kept = times.filter((t) => t > cutoff);
      if (kept.length === 0) entries.delete(hash);
      else entries.set(hash, kept);
    }
  };

  // One timer at a time, set for the moment the oldest entry's hour is up.
  const arm = () => {
    if (armed || entries.size === 0) return;
    let oldest = Infinity;
    for (const times of entries.values()) oldest = Math.min(oldest, times[0]!);
    armed = true;
    schedule(() => {
      armed = false;
      sweep();
      arm();
    }, Math.max(0, oldest + windowMs - now()));
  };

  return {
    take(address) {
      sweep();
      if (recent.length >= globalLimit) return 'total';
      // Requests without a readable address share one count, so they are limited too.
      const bucket = ipBucket(address) ?? 'unknown';
      const hash = createHmac('sha256', key).update(bucket).digest('hex');
      const times = entries.get(hash);
      if (times === undefined && entries.size >= maxEntries) return 'total';
      if ((times?.length ?? 0) >= limit) return 'address';
      const t = now();
      entries.set(hash, [...(times ?? []), t]);
      recent.push(t);
      arm();
      return 'ok';
    },
    size: () => entries.size,
    keys: () => [...entries.keys()],
  };
}
