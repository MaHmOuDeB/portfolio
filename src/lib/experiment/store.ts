// The experiment's counters in Redis: per-view claims, the counter hash, the rate limit, the daily
// ceiling and the closed marker. Server only. There is no Lua: each step is ordered so that a crash
// between steps can only lose an event, never count one twice. Every key this module writes has an
// expiry except the counter hash and the closed marker, which hold no per-visitor data.
//
// An entry is claimed BEFORE it is checked, so a re-sent entry records nothing twice. The event
// route (POST /api/e) calls, in this order, for a batch whose first item is the entry:
//   1. claimEntry: SET claim '-' NX EX ttl. 'duplicate' -> stop: record no rejection row, no
//      daily-ceiling increment and no count (the item's outcome is 'duplicate').
//   2. The entry checks: bot, internal, self, a client reject. The first that applies ->
//      recordRejection(reason) and stop.
//   3. countDailyEntry: 'ceiling-first' -> recordRejection('ceiling'); 'ceiling-first' and
//      'ceiling' -> stop.
//   4. countEntry: one MULTI that increments the total and day fields and promotes the claim from
//      '-' to the arm (SET XX KEEPTTL, so it keeps the expiry from step 1).
//   5. recordEvent for each later item, in order.
// A claim left at '-' (a rejected, ceiling-refused or crashed entry) equals no arm, so the view's
// later events are 'orphan' and nothing is counted for a view whose entry was not.
import type { Arm } from '../../experiment.values.ts';
import { EVENT_TYPES, PREREQUISITES, REJECT_REASONS, type EventType, type RejectReason } from './events.ts';
import { fieldName, keys, parseField, type IpBucket } from './keys.ts';
import { RedisUnavailable, type RedisRest } from './redis-rest.ts';

export type RecordResult =
  | { outcome: 'counted'; arm: Arm; total: number; dayTotal: number }
  | { outcome: 'duplicate' }
  | { outcome: 'orphan' };

export type ClosedMarker = { kind: 'decision' | 'aa-failed'; day: string };
export type GroupCounts = Record<EventType, number>;
export type DayCounts = { day: string; a: GroupCounts; b: GroupCounts };
export type CounterRows = {
  days: DayCounts[];
  rejections: Record<RejectReason, number>;
  rejectionsByDay: Record<string, Partial<Record<RejectReason, number>>>;
  totals: { a: GroupCounts; b: GroupCounts };
};

/** The stored data is not what this module writes. Readers fail closed on it. */
export class CorruptCounters extends Error {
  constructor(message: string) {
    super(`corrupt experiment data: ${message}`);
    this.name = 'CorruptCounters';
  }
}

/** A daily-ceiling key outlives its Berlin day, then expires. */
const CEILING_TTL_SECONDS = 172_800;

function int(reply: unknown, what: string): number {
  if (typeof reply !== 'number' || !Number.isSafeInteger(reply)) throw new RedisUnavailable(`${what} returned a non-integer`);
  return reply;
}

async function increment(r: RedisRest, counters: string, fields: [string, string]): Promise<[number, number]> {
  const [first, second] = await r.transaction([
    ['HINCRBY', counters, fields[0], 1],
    ['HINCRBY', counters, fields[1], 1],
  ]);
  return [int(first, 'HINCRBY'), int(second, 'HINCRBY')];
}

/** The value of an entry claim that has not been counted (yet); no arm equals it. */
const PENDING = '-';

/** Claims a view's entry before any check. 'duplicate' means a re-sent entry: record nothing. */
export async function claimEntry(r: RedisRest, i: { ns: string; pv: string; ttlSeconds: number }): Promise<'claimed' | 'duplicate'> {
  const reply = await r.command(['SET', keys.claim(i.ns, i.pv, 'entry'), PENDING, 'NX', 'EX', i.ttlSeconds]);
  if (reply === null) return 'duplicate';
  if (reply !== 'OK') throw new RedisUnavailable('SET returned an unexpected reply');
  return 'claimed';
}

/**
 * Counts a claimed entry and promotes its claim to the arm, in one MULTI/EXEC. KEEPTTL keeps the
 * expiry claimEntry set, so every key of the view still dies at most ttl after the view opened.
 */
export async function countEntry(
  r: RedisRest,
  i: { ns: string; pv: string; arm: Arm; day: string },
): Promise<Extract<RecordResult, { outcome: 'counted' }>> {
  const counters = keys.counters(i.ns);
  const [total, dayTotal, promoted] = await r.transaction([
    ['HINCRBY', counters, fieldName({ kind: 'total', arm: i.arm, metric: 'entry' }), 1],
    ['HINCRBY', counters, fieldName({ kind: 'day', day: i.day, arm: i.arm, metric: 'entry' }), 1],
    ['SET', keys.claim(i.ns, i.pv, 'entry'), i.arm, 'XX', 'KEEPTTL'],
  ]);
  // null: the claim expired between claimEntry and here; the entry still counts, its later events
  // are orphans.
  if (promoted !== 'OK' && promoted !== null) throw new RedisUnavailable('SET returned an unexpected reply');
  return { outcome: 'counted', arm: i.arm, total: int(total, 'HINCRBY'), dayTotal: int(dayTotal, 'HINCRBY') };
}

/**
 * Counts one event of one view, at most once.
 * - An entry is claimEntry then countEntry with no checks between (the event route runs its checks
 *   between the two; see the header).
 * - A later event:
 *   1. reads its prerequisites' claims and the entry claim's absolute expiry. A missing claim, a
 *      pending entry claim ('-') or a claim of another group gives `orphan`. So does an entry claim
 *      without an expiry: a later claim is never written without one.
 *   2. claims with `SET NX PXAT <entry expiry>`, so every key of a view is gone when the entry
 *      claim is (at most ttl after the view opened). A null reply means `duplicate`.
 *   3. increments the total and the day field in one transaction.
 */
export async function recordEvent(
  r: RedisRest,
  i: { ns: string; pv: string; arm: Arm; type: EventType; day: string; ttlSeconds: number },
): Promise<RecordResult> {
  if (i.type === 'entry') {
    if ((await claimEntry(r, i)) === 'duplicate') return { outcome: 'duplicate' };
    return countEntry(r, i);
  }
  const claim = (type: EventType) => keys.claim(i.ns, i.pv, type);
  const prerequisites = PREREQUISITES[i.type];
  const [values, entryExpiry] = await r.pipeline([
    ['MGET', ...prerequisites.map(claim)],
    ['PEXPIRETIME', claim('entry')],
  ]);
  if (!Array.isArray(values) || values.length !== prerequisites.length) throw new RedisUnavailable('MGET returned an unexpected reply');
  // A pending entry claim equals no arm, so a view whose entry was not counted counts nothing.
  if ((i.arm as string) === PENDING || !values.every((v) => v === i.arm)) return { outcome: 'orphan' };
  const at = int(entryExpiry, 'PEXPIRETIME');
  // -2: the entry claim expired since the MGET; -1: it has no expiry.
  if (at <= 0) return { outcome: 'orphan' };
  const set = await r.command(['SET', claim(i.type), i.arm, 'NX', 'PXAT', at]);
  if (set === null) return { outcome: 'duplicate' };
  if (set !== 'OK') throw new RedisUnavailable('SET returned an unexpected reply');
  const [total, dayTotal] = await increment(r, keys.counters(i.ns), [
    fieldName({ kind: 'total', arm: i.arm, metric: i.type }),
    fieldName({ kind: 'day', day: i.day, arm: i.arm, metric: i.type }),
  ]);
  return { outcome: 'counted', arm: i.arm, total, dayTotal };
}

/** Counts one excluded entry view under its reason, in total and for the day. */
export async function recordRejection(r: RedisRest, i: { ns: string; reason: RejectReason; day: string }): Promise<void> {
  await increment(r, keys.counters(i.ns), [
    fieldName({ kind: 'rejection', reason: i.reason }),
    fieldName({ kind: 'rejectionDay', day: i.day, reason: i.reason }),
  ]);
}

/** An HMAC digest in hex. A raw IPv4 address or IPv6 prefix (dots, colons) can never match. */
const BUCKET_HASH = /^[0-9a-f]{32,128}$/;

/**
 * One event against an address bucket's per-minute limit. `INCR` and `EXPIRE NX` run in one
 * transaction, so a rate key can never exist without its expiry. The count `limit + 1` gives
 * `limited-first` (record the rejection once); above that, `limited`.
 */
export async function rateLimit<T extends string>(
  r: RedisRest,
  i: { bucketHash: T extends IpBucket ? never : T; minute: number; limit: number; ttlSeconds: number },
): Promise<'ok' | 'limited-first' | 'limited'> {
  if (!BUCKET_HASH.test(i.bucketHash)) throw new TypeError('rateLimit takes the HMAC of the address bucket, in hex');
  const key = keys.rate(i.bucketHash, i.minute);
  const [count] = await r.transaction([
    ['INCR', key],
    ['EXPIRE', key, i.ttlSeconds, 'NX'],
  ]);
  const n = int(count, 'INCR');
  if (n <= i.limit) return 'ok';
  return n === i.limit + 1 ? 'limited-first' : 'limited';
}

/** One counted entry view against the day's ceiling: `ceiling + 1` gives `ceiling-first`. */
export async function countDailyEntry(
  r: RedisRest,
  i: { ns: string; day: string; ceiling: number },
): Promise<'ok' | 'ceiling-first' | 'ceiling'> {
  const key = keys.ceiling(i.ns, i.day);
  const [count] = await r.transaction([
    ['INCR', key],
    ['EXPIRE', key, CEILING_TTL_SECONDS, 'NX'],
  ]);
  const n = int(count, 'INCR');
  if (n <= i.ceiling) return 'ok';
  return n === i.ceiling + 1 ? 'ceiling-first' : 'ceiling';
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The closed marker, or null. A malformed marker throws: it is never read as "still open". */
export async function readClosed(r: RedisRest, ns: string): Promise<ClosedMarker | null> {
  const raw = await r.command(['GET', keys.closed(ns)]);
  if (raw === null) return null;
  let value: unknown = null;
  try {
    if (typeof raw === 'string') value = JSON.parse(raw);
  } catch {
    // Falls through to CorruptCounters.
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 2) {
    const { kind, day } = value as Record<string, unknown>;
    if ((kind === 'decision' || kind === 'aa-failed') && typeof day === 'string' && DAY.test(day)) return { kind, day };
  }
  throw new CorruptCounters('closed marker');
}

/** Writes the closed marker once (SET NX, no expiry); false when one already exists. */
export async function writeClosed(r: RedisRest, ns: string, m: ClosedMarker): Promise<boolean> {
  const reply = await r.command(['SET', keys.closed(ns), JSON.stringify({ kind: m.kind, day: m.day }), 'NX']);
  if (reply === null) return false;
  if (reply !== 'OK') throw new RedisUnavailable('SET returned an unexpected reply');
  return true;
}

const COUNT = /^(0|[1-9]\d*)$/;

function zeros(): GroupCounts {
  return Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as GroupCounts;
}

/** Every counter of a namespace. Unknown fields are ignored; a malformed count throws. */
export async function readCounters(r: RedisRest, ns: string): Promise<CounterRows> {
  const flat = await r.command(['HGETALL', keys.counters(ns)]);
  if (!Array.isArray(flat) || flat.length % 2 !== 0) throw new CorruptCounters('counter hash reply');
  const totals = { a: zeros(), b: zeros() };
  const days = new Map<string, DayCounts>();
  const rejections = Object.fromEntries(REJECT_REASONS.map((reason) => [reason, 0])) as Record<RejectReason, number>;
  const rejectionsByDay: CounterRows['rejectionsByDay'] = {};
  for (let k = 0; k < flat.length; k += 2) {
    const [name, raw] = [flat[k] as unknown, flat[k + 1] as unknown];
    if (typeof name !== 'string') throw new CorruptCounters('counter field name');
    const field = parseField(name);
    if (field === null) continue;
    const n = typeof raw === 'string' && COUNT.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(n)) throw new CorruptCounters('counter value');
    switch (field.kind) {
      case 'total':
        totals[field.arm][field.metric] = n;
        break;
      case 'day': {
        let row = days.get(field.day);
        if (row === undefined) {
          row = { day: field.day, a: zeros(), b: zeros() };
          days.set(field.day, row);
        }
        row[field.arm][field.metric] = n;
        break;
      }
      case 'rejection':
        rejections[field.reason] = n;
        break;
      case 'rejectionDay':
        (rejectionsByDay[field.day] ??= {})[field.reason] = n;
        break;
    }
  }
  const sorted = [...days.values()].sort((x, y) => (x.day < y.day ? -1 : x.day > y.day ? 1 : 0));
  return { days: sorted, rejections, rejectionsByDay, totals };
}
