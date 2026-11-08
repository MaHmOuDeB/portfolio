// Recognises the site's own automated traffic (CI and Lighthouse runs), which sends
// `x-internal: HMAC-SHA256(INTERNAL_TRAFFIC_SECRET, INTERNAL_MESSAGE)` in hex. Server only.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** The signed message; tests/e2e/fixtures.ts signs the same string. */
export const INTERNAL_MESSAGE = 'portfolio-internal-traffic';

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();

/** Constant-time equality of two strings of any length: timingSafeEqual on their SHA-256 digests. */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/** True only for the exact HMAC under a configured, non-empty secret. Never throws. */
export function isInternal(headerValue: string | null, secret: string | undefined): boolean {
  if (secret === undefined || secret === '' || headerValue === null || headerValue === '') return false;
  const expected = createHmac('sha256', secret).update(INTERNAL_MESSAGE).digest('hex');
  return safeEqual(headerValue, expected);
}
