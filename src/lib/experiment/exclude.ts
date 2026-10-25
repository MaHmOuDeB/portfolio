// The owner's exclusion cookie. Server only.
//
// Mahmoud opens /exclude#t=<EXCLUDE_TOKEN> once on each of his own browsers. The page reads the
// fragment (which the browser never sends to a server), clears it from the address bar and POSTs
// the token here. A right token sets an HttpOnly cookie whose value is an HMAC of the token, so the
// cookie proves nothing about the token and cannot be forged without it. The cookie is scoped to
// /api/e, so the event endpoint is the only place the browser sends it. Visitors never get one.
import { createHmac } from 'node:crypto';
import type { ServerEnv } from '../env.ts';
import { safeEqual } from './internal.ts';

export const OWNER_COOKIE = 'exp-self';

const MAX_AGE = 31_536_000; // one year, in seconds
const MAX_BODY_BYTES = 1024;
const COOKIE_ATTRIBUTES = 'Path=/api/e; HttpOnly; Secure; SameSite=Strict';

/** HMAC-SHA256 of the message 'self' under the exclusion token, in hex. */
export function ownerCookieValue(excludeToken: string): string {
  return createHmac('sha256', excludeToken).update('self').digest('hex');
}

/** True only for a cookie header that carries the exact owner cookie. Never throws. */
export function ownerCookieValid(cookieHeader: string | null, excludeToken: string | undefined): boolean {
  if (excludeToken === undefined || excludeToken === '' || cookieHeader === null || cookieHeader === '') return false;
  const expected = ownerCookieValue(excludeToken);
  let valid = false;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1 || part.slice(0, eq).trim() !== OWNER_COOKIE) continue;
    // No early exit: every owner-named cookie is compared, whatever the first one said.
    if (safeEqual(part.slice(eq + 1).trim(), expected)) valid = true;
  }
  return valid;
}

function respond(status: number, setCookie?: string): Response {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  if (setCookie !== undefined) headers.append('Set-Cookie', setCookie);
  return new Response(null, { status, headers });
}

/** The token from a `{ "t": string }` body of at most MAX_BODY_BYTES, or a status to answer with. */
async function readToken(request: Request): Promise<{ token: string } | { status: 400 | 413 }> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { status: 413 };
  const reader = request.body?.getReader();
  if (!reader) return { status: 400 };
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return { status: 413 };
    }
    chunks.push(value);
  }
  try {
    const text = new TextDecoder().decode(Buffer.concat(chunks));
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const t = (parsed as { t?: unknown }).t;
      if (typeof t === 'string') return { token: t };
    }
  } catch {
    // fall through: not JSON
  }
  return { status: 400 };
}

/**
 * POST { t }: the right token sets the cookie. DELETE expires it. Nothing here logs, and no
 * response carries the token.
 */
export async function handleExclude(request: Request, env: ServerEnv): Promise<Response> {
  const token = env.excludeToken;
  if (token === undefined || token === '') return respond(404);

  // Only this site's own page may ask. A browser that sends the header must say same-origin.
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin') return respond(403);

  if (request.method === 'DELETE') return respond(204, `${OWNER_COOKIE}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`);
  if (request.method !== 'POST') return respond(405);

  const body = await readToken(request);
  if ('status' in body) return respond(body.status);
  if (!safeEqual(body.token, token)) return respond(403);
  return respond(204, `${OWNER_COOKIE}=${ownerCookieValue(token)}; ${COOKIE_ATTRIBUTES}; Max-Age=${MAX_AGE}`);
}
