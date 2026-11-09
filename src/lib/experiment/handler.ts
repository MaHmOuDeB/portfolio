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
//      of any kind is cut off after an atomic expiring increment (the store's free quota is finite).
//   8. The closed marker: entries check before flags. Later batches check inside their write.
//   9. Flags: paused or malformed: paused. A read error is logged and counting goes on.
//     A process that has seen the day's ceiling full answers an entry-only batch with `ceiling` here,
//     before the rate limit, without touching the store. A batch that carries later events still
//     takes the full path: it may be a counted view's re-sent flush, whose later events must land.
//  10. The entry: claimed first (a re-sent entry records nothing), then bot, internal, self and a
//      client reject each record a rejection and stop; then the daily ceiling; then it counts. The
//      day's first granted ceiling slot calls onNewDay.
//  11. The later items, in order, against authoritative claims, counted on their entry's Berlin day.
//  12. A store error at any step: 503 unavailable, nothing retried.
import { createHmac, randomBytes } from 'node:crypto';
import { EXPERIMENT, calibrationStart, notStartedAt, type ExperimentConfig } from '../../experiment.config.ts';
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
  CountingClosed,
  countDailyEntryN,
  finalizeAtomicEntry,
  rateLimit,
  readEntryClaim,
  readClosed,
  recordAtomicLater,
  recordRejection,
  reserveAtomicEntry,
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
  /** Called after finalization is attempted for the first granted ceiling slot of a Berlin day. */
  onNewDay?: (ns: string, day: string) => void;
  /**
   * What this process knows about the daily ceiling. Absent: every refused entry asks the store.
   * The route keeps one for the life of the process; a cold instance simply asks the store once.
   */
  ceilingMemo?: CeilingMemo;
};

/**
 * The newest Berlin day this process has seen the daily ceiling full. One slot, so it never grows.
 * A day's count only goes up (slots are never given back), so a full day stays full until
 * midnight, and a later day is simply a different key.
 */
export type CeilingMemo = { full: string | null };

export function createCeilingMemo(): CeilingMemo {
  return { full: null };
}

const memoKey = (ns: string, day: string) => `${ns}|${day}`;

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

function isPendingEntry(value: string | null): boolean {
  return value === '-' || (value !== null && /^pending:[0-9a-f]{32}$/.test(value));
}

const PENDING_ENTRY_BUDGET_MS = 3_000;
const PENDING_ENTRY_RETRY_DELAY_MS = 100;
const PENDING_ENTRY_MAX_REREADS = 3;

async function rereadPendingEntry(
  read: () => ReturnType<typeof readEntryClaim>,
  pending: Awaited<ReturnType<typeof readEntryClaim>>,
  now: EventDeps['now'],
  started: number,
  ttlSeconds: number,
): ReturnType<typeof readEntryClaim> {
  const createdAt = pending.expiry - ttlSeconds * 1000;
  const age = now().getTime() - createdAt;
  if (pending.expiry <= 0 || age < 0) return pending;

  const deadline = Math.min(started, performance.now() - age) + PENDING_ENTRY_BUDGET_MS;
  const remaining = () => Math.min(
    deadline - performance.now(),
    createdAt + PENDING_ENTRY_BUDGET_MS - now().getTime(),
    pending.expiry - now().getTime(),
  );

  for (let attempt = 0; attempt < PENDING_ENTRY_MAX_REREADS; attempt += 1) {
    if (remaining() <= PENDING_ENTRY_RETRY_DELAY_MS) break;
    await new Promise<void>((resolve) => setTimeout(resolve, PENDING_ENTRY_RETRY_DELAY_MS));
    const budget = remaining();
    if (budget <= 0) break;

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), budget);
      });
      const fresh = await Promise.race([read(), timeout]);
      // A missing or replaced claim cannot promote the pending claim we observed.
      if (fresh === null || remaining() <= 0 || fresh.expiry !== pending.expiry) break;
      if (!isPendingEntry(fresh.value)) return fresh;
    } finally {
      clearTimeout(timer);
    }
  }
  return pending;
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
    if (notStartedAt(config, env.vercelEnv, nowMs)) throw refuse('not-started');
    const start = calibrationStart(config, env.vercelEnv)!;
    if (config.phase === 'ab' && nowMs >= Date.parse(plannedEnd(config, start).at)) throw refuse('ended');

    // 6b. The day is full and this batch is only an entry: nothing to look up or count. (If it were
    // a counted view's re-sent entry the answer would be `duplicate` with no effect either way,
    // and the sender ends on any refusal.) Bot, internal, self and client-reject entries that arrive
    // after the day is full are refused here too, so their rd: rejection rows stop growing on a
    // full day; the analysis excludes ceiling days, so only the published funnel is affected.
    const day = berlinDay(now.toISOString());
    if (batch.events.length === 1 && batch.events[0]!.type === 'entry' && deps.ceilingMemo?.full === memoKey(batch.ns, day)) {
      throw refuse('ceiling');
    }

    // 7. Address and rate limit.
    const production = env.vercelEnv === 'production';
    const bucket = ipBucket(clientAddress(request)) ?? (production ? null : 'local');
    if (bucket === null) throw new Stop(500, { ok: false, reason: 'misconfigured' }, 'error', 'no-address');
    if (production && env.ratelimitHmacKey === undefined) {
      throw new Stop(500, { ok: false, reason: 'misconfigured' }, 'error', 'no-ratelimit-key');
    }
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

    // 8. Entries check closure before reservation. The later script checks it with the claims.
    if (entry !== null && await readClosed(write, batch.ns) !== null) throw refuse('ended');

    // 9. Flags.
    let flags: ExperimentFlags | null = null;
    try {
      flags = await deps.flags();
    } catch {
      flagsError = true;
    }
    if (flags !== null && (flags.paused !== null || flags.malformed)) {
      if (entry === null && await readClosed(write, batch.ns) !== null) throw refuse('ended');
      throw refuse('paused');
    }

    // 10. The entry.
    const results: { type: EventType; outcome: ItemOutcome }[] = [];
    let entryExpiry: number | null = null;
    if (entry !== null) {
      const owner = randomBytes(16).toString('hex');
      const claim = await reserveAtomicEntry(write, { ns: batch.ns, pv: batch.pv, owner, ttlSeconds: config.pvTtlSeconds });
      if (claim === 'duplicate') {
        results.push({ type: 'entry', outcome: 'duplicate' });
        if (later.length > 0) {
          // The snapshot was read before this claim; the original request may have promoted the
          // entry since. Re-read the claim and its expiry together.
          const read = () => readEntryClaim(write, batch);
          let fresh = await read();
          if (isPendingEntry(fresh.value)) {
            fresh = await rereadPendingEntry(read, fresh, deps.now, started, config.pvTtlSeconds);
          }
          // Only a promotion observed within the reread window can admit this duplicate flush.
          entryExpiry = fresh.value === batch.arm ? fresh.expiry : null;
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
        if (ceiling.verdict !== 'ok' && deps.ceilingMemo !== undefined) deps.ceilingMemo.full = memoKey(batch.ns, day);
        if (ceiling.verdict === 'ceiling-first') {
          await recordRejection(write, { ns: batch.ns, reason: 'ceiling', day });
          throw refuse('ceiling', 'rejected');
        }
        if (ceiling.verdict === 'ceiling') throw refuse('ceiling');
        try {
          const c = await finalizeAtomicEntry(write, { ns: batch.ns, pv: batch.pv, arm: batch.arm, day, owner });
          results.push({ type: 'entry', outcome: c.outcome });
          entryExpiry = c.expiresAt ?? null;
        } finally {
          // Slot one triggers the best-effort closing check even if finalization fails.
          if (ceiling.n === 1) {
            try {
              deps.onNewDay?.(batch.ns, day);
            } catch {
              // Scheduling the closing check must not affect the response.
            }
          }
        }
      }
    }

    // 11. Use the counted entry's Berlin day. A recovered or combined batch also supplies the
    // exact deadline it observed, so a replacement reservation cannot admit its events.
    let viewN: number | undefined;
    if (later.length > 0) {
      const recorded = await recordAtomicLater(write, {
        ns: batch.ns,
        pv: batch.pv,
        arm: batch.arm,
        day: entryExpiry === null ? day : berlinDay(new Date(entryExpiry - config.pvTtlSeconds * 1000).toISOString()),
        ttlSeconds: config.pvTtlSeconds,
        ...(entry === null ? {} : { view: { entryExpiry } }),
        items: later,
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
    if (e instanceof CountingClosed) return finish(200, { ok: false, reason: 'ended' }, 'refused', 'ended');
    // 12. The store failed (or a programming error): nothing is retried.
    if (isStoreError(e)) return finish(503, { ok: false, reason: 'unavailable' }, 'error', 'unavailable');
    return finish(500, { ok: false, reason: 'unavailable' }, 'error', 'internal');
  }
}
