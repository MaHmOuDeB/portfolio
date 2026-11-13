// The contact form's server side, given its dependencies: honeypot, validation, minimum fill time,
// the limits and delivery, in that order. It returns what the page shows; the action turns "sent" into
// a redirect. Nothing about the visitor is logged or stored here: a refusal logs one fixed line that
// names its reason and nothing else, so a flood shows in the function logs.
import 'server-only';
import { cleanValues, HONEYPOT_FIELD, readValues, validate, type ContactValues, type FieldErrors } from './fields.ts';
import type { ContactLimiter } from './limiter.ts';
import type { ContactMessage } from './send.ts';

/** A form sent sooner than this after the server issued it is refused as a bot's. */
export const MIN_FILL_MS = 3000;
/** A timestamp this far ahead of the server clock is not one the server issued. */
const CLOCK_SKEW_MS = 5000;
/** The only lines a refusal logs: fixed text, no value, address, hash or count. */
export const REFUSED = {
  honeypot: 'contact form: refused (honeypot)',
  fast: 'contact form: refused (fast)',
  limit: 'contact form: refused (limit)',
  total: 'contact form: refused (total limit)',
} as const;

export type ContactState =
  | { status: 'idle' }
  | { status: 'sent' }
  | { status: 'invalid'; errors: FieldErrors; values: ContactValues; issuedAt: number | null }
  | { status: 'failed'; reason: 'fast' | 'limit' | 'delivery'; values: ContactValues; issuedAt: number | null };

export type ContactContext = {
  now: () => number;
  /** The client address, read from the request; null when there is none. */
  ip: string | null;
  limiter: ContactLimiter;
  deliver: (m: ContactMessage) => Promise<'sent' | 'failed'>;
  /** Takes only the fixed REFUSED lines. */
  log: (line: string) => void;
};

function readIssuedAt(fd: FormData): number | null {
  const raw = fd.get('issuedAt');
  if (typeof raw !== 'string' || !/^\d{1,16}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

export async function handleContact(fd: FormData, ctx: ContactContext): Promise<ContactState> {
  // A person leaves the hidden field empty; a bot is told it worked and learns nothing.
  const trap = fd.get(HONEYPOT_FIELD);
  if (trap !== null && trap !== '') {
    ctx.log(REFUSED.honeypot);
    return { status: 'sent' };
  }

  const values = readValues(fd);
  const issuedAt = readIssuedAt(fd);
  const errors = validate(values);
  if (Object.keys(errors).length > 0) return { status: 'invalid', errors, values, issuedAt };

  const now = ctx.now();
  if (issuedAt === null || issuedAt > now + CLOCK_SKEW_MS || now - issuedAt < MIN_FILL_MS) {
    ctx.log(REFUSED.fast);
    return { status: 'failed', reason: 'fast', values, issuedAt };
  }
  const limit = ctx.limiter.take(ctx.ip);
  if (limit !== 'ok') {
    ctx.log(limit === 'total' ? REFUSED.total : REFUSED.limit);
    return { status: 'failed', reason: 'limit', values, issuedAt };
  }
  const result = await ctx.deliver(cleanValues(values));
  return result === 'sent' ? { status: 'sent' } : { status: 'failed', reason: 'delivery', values, issuedAt };
}
