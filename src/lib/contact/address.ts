// The visitor's address for the contact form's rate limit only: the first x-forwarded-for entry,
// else x-real-ip, read the same way as the experiment's routes. Vercel's edge overwrites
// x-forwarded-for with the client's address; under `next start` both headers are client-controlled,
// which matters only outside production. The address is never logged or stored: the limiter keeps
// only a keyed hash of its bucket, in memory.
import 'server-only';

/** The client address from the request headers, or null when neither header carries one. */
export function addressFrom(headers: Pick<Headers, 'get'>): string | null {
  const first = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (first) return first;
  const real = headers.get('x-real-ip')?.trim();
  return real ? real : null;
}
