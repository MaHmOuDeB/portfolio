// The contact form's limit: five messages an hour from one address, per server instance, in memory
// only. The address (IPv4, or an IPv6 address's /64 network) is counted under its HMAC-SHA-256 with a
// key drawn once per instance (crypto.randomBytes(32)): the key, the address and the hash are never
// logged, stored or sent anywhere. Every entry is dropped once its hour has passed: a sweep is
// scheduled an hour after each message, so no entry outlives its window even if no one writes again.
// Server only (node:crypto, node:net).
import { createHmac, randomBytes } from 'node:crypto';
import { ipBucket } from '../experiment/keys.ts';

export const CONTACT_LIMIT = 5;
export const CONTACT_WINDOW_MS = 60 * 60 * 1000;

export type ContactLimiter = {
  /** Counts one message from this address and says whether it may go; a refused one is not counted. */
  take(address: string | null): boolean;
  /** How many addresses have a message in the window (for tests). */
  size(): number;
  /** The hashes held now (for tests). */
  keys(): string[];
};

export function createContactLimiter(o: {
  now?: () => number;
  schedule?: (run: () => void, ms: number) => void;
  limit?: number;
  windowMs?: number;
} = {}): ContactLimiter {
  const now = o.now ?? Date.now;
  const limit = o.limit ?? CONTACT_LIMIT;
  const windowMs = o.windowMs ?? CONTACT_WINDOW_MS;
  const schedule =
    o.schedule ??
    ((run: () => void, ms: number) => {
      // unref: a pending sweep never keeps the process alive.
      setTimeout(run, ms).unref?.();
    });
  const key = randomBytes(32);
  const entries = new Map<string, number[]>();

  const sweep = () => {
    const cutoff = now() - windowMs;
    for (const [hash, times] of entries) {
      const kept = times.filter((t) => t > cutoff);
      if (kept.length === 0) entries.delete(hash);
      else entries.set(hash, kept);
    }
  };

  return {
    take(address) {
      sweep();
      // Requests without a readable address share one count, so they are limited too.
      const bucket = ipBucket(address) ?? 'unknown';
      const hash = createHmac('sha256', key).update(bucket).digest('hex');
      const times = entries.get(hash) ?? [];
      if (times.length >= limit) return false;
      entries.set(hash, [...times, now()]);
      schedule(sweep, windowMs);
      return true;
    },
    size: () => entries.size,
    keys: () => [...entries.keys()],
  };
}
