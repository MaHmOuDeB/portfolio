// POST /api/e: one view's ordered batch of events. Server only. The steps run in a fixed order and
// the first that refuses ends the request. Every response has `Cache-Control: no-store`; a 4xx has
// no body, every other response is a JSON BeaconResponse. Log lines name a category, never a
// per-view id, an address, a user agent, an origin value or a secret.
//
//   1. Body: Content-Length over the cap, or a longer streamed body: 413. A Content-Type other than
//      none, text/plain (what sendBeacon sends) or application/json: 415.
//   2. Origin: in production `https://{productionHost}` or `https://{deploymentHost}`; elsewhere
//      the request's own origin. A present Sec-Fetch-Site must be same-origin. Otherwise 403.
//   3. Parse: an invalid batch is 400.
//   4. No write client (previews, development without the local fake): not-production.
//   5. A page from another namespace (open across a phase switch): stale-namespace.
//   6. Before the calibration (or A/B) start: not-started; the A/B at its planned end: ended.
//   7. Address and rate limit, before any Edge Config read: the bucket is the HMAC of the IPv4
//      address or IPv6 /64, never the address. Every batch counts against the limit, so a flood
//      of any kind is cut off at 2 commands a request (the store's free quota is finite).
//   8. The closed marker (read with the view's claims): ended.
//   9. Flags: paused or malformed: paused. A read error is logged and counting goes on.
//  10. The entry: claimed first (a re-sent entry records nothing), then bot, internal, self and a
//      client reject each record a rejection and stop; then the daily ceiling; then it counts. The
//      day's first counted entry calls onNewDay.
//  11. The later items, in order, against the same snapshot, counted on their entry's Berlin day.
//  12. A store error at any step: 503 unavailable, nothing retried.
import { createHmac, randomBytes } from 'node:crypto';
import { EXPERIMENT, calibrationStart, type ExperimentConfig } from '../../experiment.config.ts';
import type { ServerEnv } from '../env.ts';
import { isBotUserAgent } from './assign.ts';
import { readCapped } from './body.ts';
import { MAX_BODY_BYTES, parseBeaconBatch, type BeaconResponse, type EventType, type ItemOutcome, type RejectReason } from './events.ts';
import type { ExperimentFlags } from './flags.ts';
import { isInternal } from './internal.ts';
import { ipBucket } from './keys.ts';
import { RedisUnavailable, type RedisRest } from './redis-rest.ts';
import {
  CorruptCounters,
  claimEntry,
  countDailyEntryN,
  countEntry,
  rateLimit,
  readEntryClaim,
  readView,
  recordLater,
  recordRejection,
} from './store.ts';
import { berlinDay, plannedEnd } from './time.ts';

export type OriginKind = 'canonical' | 'deployment' | 'foreign' | 'missing';

export type LogLine = {
  evt: 'e';
  outcome: 'counted' | 'partial' | 'rejected' | 'refused' | 'error';
  reason?: string;
  originKind?: OriginKind;
  /** The flags could not be read; the request went on as if no flag were set. */
  flagsError?: true;
  status: number;
  ms: number;
};

export type EventDeps = {
  env: ServerEnv;
  write: RedisRest | null;
  flags: () => Promise<ExperimentFlags>;
  now: () => Date;
  log: (l: LogLine) => void;
  config?: ExperimentConfig;
  /** True for the owner's exclusion cookie. */
  ownerCookieValid: (cookieHeader: string | null) => boolean;
  /** Called after the first counted entry of a Berlin day. */
  onNewDay?: (ns: string, day: string) => void;
};

const ALLOWED_CONTENT_TYPES = ['', 'text/plain', 'application/json'];

/** Outside production, a key that lives as long as the process: buckets still never hold an address. */
let localKey: Buffer | undefined;

type Outcome = LogLine['outcome'];

/** Ends the request early with a status, an optional body and a log category. */
class Stop {
  constructor(
    readonly status: number,
    readonly body: BeaconResponse | null,
    readonly outcome: Outcome,
    readonly reason: string,
  ) {}
}

const refuse = (reason: Extract<BeaconResponse, { ok: false }>['reason'], outcome: Outcome = 'refused') =>
  new Stop(200, { ok: false, reason }, outcome, reason);

function contentTypeOf(header: string | null): string {
  return (header ?? '').split(';')[0]!.trim().toLowerCase();
}

function httpsOrigin(host: string | undefined): string | null {
  return host === undefined ? null : `https://${host.toLowerCase()}`;
}

function classifyOrigin(request: Request, env: ServerEnv): { kind: OriginKind; allowed: boolean } {
  const origin = request.headers.get('origin');
  if (origin === null || origin === '') return { kind: 'missing', allowed: false };
  if (env.vercelEnv === 'production') {
    const canonical = httpsOrigin(env.productionHost);
    const deployment = httpsOrigin(env.deploymentHost);
    if (canonical !== null && origin === canonical) return { kind: 'canonical', allowed: true };
    if (deployment !== null && origin === deployment) return { kind: 'deployment', allowed: canonical !== null };
    return { kind: 'foreign', allowed: false };
  }
  return origin === ownOrigin(request) ? { kind: 'canonical', allowed: true } : { kind: 'foreign', allowed: false };
}

/**
 * The origin the request was sent to, outside production only: the Host header (what the browser
 * used), else the request URL. `next start` builds request.url on its own hostname (localhost), so
 * the URL alone would refuse a page opened on 127.0.0.1.
 */
function ownOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get('host');
  return host ? `${url.protocol}//${host.toLowerCase()}` : url.origin;
}

/**
 * The first x-forwarded-for entry, else x-real-ip. Vercel documents that its edge overwrites
 * x-forwarded-for with the client's address, so it is read first. That x-real-ip always carries
 * the same address on Vercel is assumed, not verified, so it is only a fallback. Under
 * `next start` both are client-controlled, which matters only outside production, where nothing is
 * written except to the loopback fake.
 */
function clientAddress(request: Request): string | null {
  const first = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (first) return first;
  const real = request.headers.get('x-real-ip')?.trim();
  return real ? real : null;
}

function isStoreError(e: unknown): boolean {
  return e instanceof RedisUnavailable || e instanceof CorruptCounters;
}

export async function handleEvent(request: Request, deps: EventDeps): Promise<Response> {
  const started = performance.now();
  const config = deps.config ?? EXPERIMENT;
  const { env } = deps;
  let originKind: OriginKind | undefined;
  let flagsError = false;

  const finish = (status: number, body: BeaconResponse | null, outcome: Outcome, reason?: string): Response => {
    const line: LogLine = { evt: 'e', outcome, status, ms: Math.max(0, Math.round(performance.now() - started)) };
    if (reason !== undefined) line.reason = reason;
    if (originKind !== undefined) line.originKind = originKind;
    if (flagsError) line.flagsError = true;
    try {
      deps.log(line);
    } catch {
      // A failing logger never changes the answer.
    }
    const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
    if (body !== null) headers['Content-Type'] = 'application/json';
    return new Response(body === null ? null : JSON.stringify(body), { status, headers });
  };

  try {
    // 1. Body.
    const length = request.headers.get('content-length');
    if (length !== null && /^\d+$/.test(length.trim()) && Number(length) > MAX_BODY_BYTES) throw new Stop(413, null, 'refused', 'too-large');
    if (!ALLOWED_CONTENT_TYPES.includes(contentTypeOf(request.headers.get('content-type')))) {
      throw new Stop(415, null, 'refused', 'content-type');
    }
    const text = await readCapped(request, MAX_BODY_BYTES);
    if (text === null) throw new Stop(413, null, 'refused', 'too-large');

    // 2. Origin.
    const origin = classifyOrigin(request, env);
    originKind = origin.kind;
    const site = request.headers.get('sec-fetch-site');
    if (!origin.allowed || (site !== null && site !== 'same-origin')) throw new Stop(403, null, 'refused', 'origin');

    // 3. Parse.
    const batch = parseBeaconBatch(text);
    if (batch === null) throw new Stop(400, null, 'refused', 'invalid');

    // 4. No store.
    const write = deps.write;
    if (write === null) throw refuse('not-production');

    // 5. Namespace.
    if (batch.ns !== config.namespace) throw refuse('stale-namespace');

    // 6. Start and end.
    const now = deps.now();
    const nowMs = now.getTime();
    const start = calibrationStart(config, env.vercelEnv);
    if (start === null || nowMs < Date.parse(start)) throw refuse('not-started');
    if (config.phase === 'ab') {
      if (config.ab.startedOn === null || nowMs < Date.parse(config.ab.startedOn)) throw refuse('not-started');
      if (nowMs >= Date.parse(plannedEnd(config, start).at)) throw refuse('ended');
    }

    // 7. Address and rate limit.
    const production = env.vercelEnv === 'production';
    const bucket = ipBucket(clientAddress(request)) ?? (production ? null : 'local');
    if (bucket === null) throw new Stop(500, { ok: false, reason: 'misconfigured' }, 'error', 'no-address');
    if (production && env.ratelimitHmacKey === undefined) {
      throw new Stop(500, { ok: false, reason: 'misconfigured' }, 'error', 'no-ratelimit-key');
    }
    const day = berlinDay(now.toISOString());
    const [first, ...rest] = batch.events;
    const entry = first!.type === 'entry' ? first! : null;
    const later: EventType[] = (entry === null ? batch.events : rest).map((e) => e.type);
    const key = env.ratelimitHmacKey ?? (localKey ??= randomBytes(32));
    const bucketHash = createHmac('sha256', key).update(bucket).digest('hex');
    const limit = await rateLimit(write, {
      bucketHash,
      minute: Math.floor(nowMs / 60_000),
      limit: config.rateLimit.perMinute,
      ttlSeconds: config.rateLimit.keyTtlSeconds,
    });
    // rate_limited is recorded once per bucket-minute, and only when the first limited batch of that
    // minute carries an entry: it counts those batches, not every limited entry, and says nothing
    // about a flood that sends its excess as later batches. The firewall rule and the rd: rows of
    // the other reasons are the flood signals.
    if (limit === 'limited-first' && entry !== null) {
      await recordRejection(write, { ns: batch.ns, reason: 'rate_limited', day });
      throw new Stop(429, null, 'rejected', 'rate_limited');
    }
    if (limit !== 'ok') throw new Stop(429, null, 'refused', 'rate_limited');

    // 8. Closed (read together with the view's claims).
    const view = await readView(write, { ns: batch.ns, pv: batch.pv, closed: true, expiry: entry === null });
    if (view.closed !== null) throw refuse('ended');

    // 9. Flags.
    let flags: ExperimentFlags | null = null;
    try {
      flags = await deps.flags();
    } catch {
      flagsError = true;
    }
    if (flags !== null && (flags.paused !== null || flags.malformed)) throw refuse('paused');

    // 10. The entry.
    const results: { type: EventType; outcome: ItemOutcome }[] = [];
    const counted: EventType[] = [];
    let entryExpiry = view.entryExpiry;
    let entryClaim = view.claims.entry ?? null;
    if (entry !== null) {
      const claim = await claimEntry(write, { ns: batch.ns, pv: batch.pv, ttlSeconds: config.pvTtlSeconds });
      if (claim === 'duplicate') {
        results.push({ type: 'entry', outcome: 'duplicate' });
        if (later.length > 0) {
          // The snapshot was read before this claim; the original request may have promoted the
          // entry since. Re-read the claim and its expiry together.
          const fresh = await readEntryClaim(write, batch);
          entryClaim = fresh.value;
          entryExpiry = fresh.expiry;
        }
      } else {
        const reason: RejectReason | null = isBotUserAgent(request.headers.get('user-agent'))
          ? 'bot'
          : isInternal(request.headers.get('x-internal'), env.internalTrafficSecret)
            ? 'internal'
            : deps.ownerCookieValid(request.headers.get('cookie'))
              ? 'self'
              : (entry.reject ?? null);
        if (reason !== null) {
          await recordRejection(write, { ns: batch.ns, reason, day });
          throw refuse(reason, 'rejected');
        }
        const ceiling = await countDailyEntryN(write, { ns: batch.ns, day, ceiling: config.dailyEntryCeiling });
        if (ceiling.verdict === 'ceiling-first') {
          await recordRejection(write, { ns: batch.ns, reason: 'ceiling', day });
          throw refuse('ceiling', 'rejected');
        }
        if (ceiling.verdict === 'ceiling') throw refuse('ceiling');
        const c = await countEntry(write, { ns: batch.ns, pv: batch.pv, arm: batch.arm, day, withExpiry: later.length > 0 });
        results.push({ type: 'entry', outcome: 'counted' });
        counted.push('entry');
        if (c.expiresAt !== undefined) entryExpiry = c.expiresAt;
        // The day's first entry across both groups (the ceiling key counts both).
        if (ceiling.n === 1) {
          try {
            deps.onNewDay?.(batch.ns, day);
          } catch {
            // The closing check runs on its own; it never fails the count.
          }
        }
      }
    }

    // 11. Record the later items, on their entry's Berlin day: the entry claim was set pvTtlSeconds
    // before it expires, so its expiry dates it. Each day row then holds a click only with its own
    // view, and an analysis that leaves out a day (one that reached the ceiling) leaves out all of
    // that day's views' events. The expiry is read in the same requests as before: no extra command.
    let viewN: number | undefined;
    if (later.length > 0) {
      const entryDay =
        counted.includes('entry') || entryExpiry === null || entryExpiry <= 0
          ? day
          : berlinDay(new Date(entryExpiry - config.pvTtlSeconds * 1000).toISOString());
      const recorded = await recordLater(write, {
        ns: batch.ns,
        pv: batch.pv,
        arm: batch.arm,
        day: entryDay,
        view: { ...view, claims: { ...view.claims, entry: entryClaim ?? undefined }, entryExpiry },
        items: later,
        counted,
      });
      for (const { type, result } of recorded) {
        results.push({ type, outcome: result.outcome });
        if (type === 'inview' && result.outcome === 'counted') viewN = result.total;
      }
    }
    const body: BeaconResponse = { ok: true, arm: batch.arm, results };
    if (viewN !== undefined) body.viewN = viewN;
    return finish(200, body, results.every((r) => r.outcome === 'counted') ? 'counted' : 'partial');
  } catch (e) {
    if (e instanceof Stop) return finish(e.status, e.body, e.outcome, e.reason);
    // 12. The store failed (or a programming error): nothing is retried.
    if (isStoreError(e)) return finish(503, { ok: false, reason: 'unavailable' }, 'error', 'unavailable');
    return finish(500, { ok: false, reason: 'unavailable' }, 'error', 'internal');
  }
}
