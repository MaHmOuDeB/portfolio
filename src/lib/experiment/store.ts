// The experiment's counters in Redis: per-view claims, the counter hash, the rate limit, the daily
// ceiling and the closed marker. Server only. There is no Lua: each step is ordered so that a crash
// between steps can only lose an event, never count one twice. Every key this module writes has an
// expiry except the counter hash and the closed marker, which hold no per-visitor data.
//
// An entry is claimed BEFORE it is checked, so a re-sent entry records nothing twice. The event
// route (POST /api/e) calls, in this order, for one batch (one view's events, entry first):
//   1. rateLimit, for every batch.
//   2. readView: one MGET of the closed marker and every claim of the view (plus, for a batch
//      without an entry, PEXPIRETIME of the entry claim in the same pipeline). A closed marker
//      stops the batch.
//   3. For the entry: claimEntry: SET claim '-' NX EX ttl. 'duplicate' -> record no rejection
//      row, no daily-ceiling increment and no count (the item's outcome is 'duplicate').
//   4. The entry checks: bot, internal, self, a client reject. The first that applies ->
//      recordRejection(reason) and stop.
//   5. countDailyEntry: 'ceiling-first' -> recordRejection('ceiling'); 'ceiling-first' and
//      'ceiling' -> stop.
//   6. countEntry: one MULTI that increments the total and day fields and promotes the claim from
//      '-' to the arm (SET XX KEEPTTL, so it keeps the expiry from step 3).
//   7. recordLater for the batch's later items, in order: their claims in one pipeline, their
//      counts in one transaction.
// A claim that other events depend on (the entry, and inview for card and secondary) is written as
// '-' and promoted to the arm only inside the transaction that counts it. A claim left at '-' (a
// rejected, ceiling-refused or failed event) equals no arm, so an event that needs it is 'orphan':
// nothing is ever counted on top of an event that was not.
import type { Arm } from '../../experiment.values.ts';
import { EVENT_TYPES, PREREQUISITES, REJECT_REASONS, type EventType, type RejectReason } from './events.ts';
import { fieldName, keys, parseField, type IpBucket } from './keys.ts';
import { RedisUnavailable, type RedisCommand, type RedisRest } from './redis-rest.ts';

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
 * With `withExpiry` the same transaction also reads the claim's absolute expiry (PEXPIRETIME), for
 * the batch's later items.
 */
export async function countEntry(
  r: RedisRest,
  i: { ns: string; pv: string; arm: Arm; day: string; withExpiry?: boolean },
): Promise<Extract<RecordResult, { outcome: 'counted' }> & { expiresAt?: number }> {
  const counters = keys.counters(i.ns);
  const claim = keys.claim(i.ns, i.pv, 'entry');
  const replies = await r.transaction([
    ['HINCRBY', counters, fieldName({ kind: 'total', arm: i.arm, metric: 'entry' }), 1],
    ['HINCRBY', counters, fieldName({ kind: 'day', day: i.day, arm: i.arm, metric: 'entry' }), 1],
    ['SET', claim, i.arm, 'XX', 'KEEPTTL'],
    ...(i.withExpiry ? [['PEXPIRETIME', claim] as const] : []),
  ]);
  const [total, dayTotal, promoted] = replies;
  // null: the claim expired between claimEntry and here; the entry still counts, its later events
  // are orphans.
  if (promoted !== 'OK' && promoted !== null) throw new RedisUnavailable('SET returned an unexpected reply');
  const counted = { outcome: 'counted' as const, arm: i.arm, total: int(total, 'HINCRBY'), dayTotal: int(dayTotal, 'HINCRBY') };
  return i.withExpiry ? { ...counted, expiresAt: promoted === null ? -2 : int(replies[3], 'PEXPIRETIME') } : counted;
}

/**
 * What the store holds for one view, read once per batch: the closed marker (when asked), the raw
 * value of each existing claim, and (when asked) the entry claim's absolute expiry in ms (-2: no
 * claim, -1: no expiry; null: not read).
 */
export type ViewSnapshot = {
  closed: ClosedMarker | null;
  claims: Partial<Record<EventType, string>>;
  entryExpiry: number | null;
};

/** One MGET of the closed marker and the view's claims; with `expiry`, plus PEXPIRETIME in one pipeline. */
export async function readView(r: RedisRest, i: { ns: string; pv: string; closed: boolean; expiry: boolean }): Promise<ViewSnapshot> {
  const claimKeys = EVENT_TYPES.map((t) => keys.claim(i.ns, i.pv, t));
  const mget: RedisCommand = ['MGET', ...(i.closed ? [keys.closed(i.ns)] : []), ...claimKeys];
  let values: unknown;
  let expiry: unknown = null;
  if (i.expiry) [values, expiry] = await r.pipeline([mget, ['PEXPIRETIME', keys.claim(i.ns, i.pv, 'entry')]]);
  else values = await r.command(mget);
  const expected = claimKeys.length + (i.closed ? 1 : 0);
  if (!Array.isArray(values) || values.length !== expected) throw new RedisUnavailable('MGET returned an unexpected reply');
  const rest = i.closed ? values.slice(1) : values;
  const claims: ViewSnapshot['claims'] = {};
  EVENT_TYPES.forEach((t, k) => {
    const v: unknown = rest[k];
    if (v === null) return;
    if (typeof v !== 'string') throw new RedisUnavailable('MGET returned an unexpected reply');
    claims[t] = v;
  });
  return {
    closed: i.closed ? parseClosed(values[0]) : null,
    claims,
    entryExpiry: i.expiry ? int(expiry, 'PEXPIRETIME') : null,
  };
}

/**
 * The entry claim's current value and absolute expiry, in one pipeline: for a re-sent entry whose
 * snapshot was read before the original request promoted it.
 */
export async function readEntryClaim(r: RedisRest, i: { ns: string; pv: string }): Promise<{ value: string | null; expiry: number }> {
  const claim = keys.claim(i.ns, i.pv, 'entry');
  const [value, expiry] = await r.pipeline([
    ['GET', claim],
    ['PEXPIRETIME', claim],
  ]);
  if (value !== null && typeof value !== 'string') throw new RedisUnavailable('GET returned an unexpected reply');
  return { value, expiry: int(expiry, 'PEXPIRETIME') };
}

/** The later types other events depend on (inview): claimed as '-', promoted when counted. */
const PREREQUISITE_TYPES: ReadonlySet<EventType> = new Set(
  Object.values(PREREQUISITES)
    .flat()
    .filter((t) => t !== 'entry'),
);

/**
 * Counts a batch's later items (not the entry) against one snapshot, in order, each at most once.
 * - An item is an orphan unless the entry claim holds this arm (a pending '-', a missing claim or
 *   another group's claim never does), the entry claim has an expiry, and each prerequisite is
 *   claimed for this arm in the snapshot or is an earlier item of this batch that counts now.
 * - An item already claimed in the snapshot is a duplicate, with no write.
 * - The rest are claimed in one pipeline (`SET NX PXAT <entry expiry>`, so every key of a view is
 *   gone when the entry claim is); a null reply is a duplicate. A prerequisite type is claimed as
 *   '-'. An item whose in-batch prerequisite got a null reply is an orphan (its own claim stays,
 *   so it is lost, never counted on an uncounted prerequisite).
 * - The items that count are counted (total and day field) in one transaction, which also promotes
 *   each prerequisite claim from '-' to the arm (SET XX KEEPTTL). If that transaction fails, every
 *   prerequisite claim stays '-': its dependents can never count, and the events are lost, never
 *   wrong.
 * `counted` names items counted earlier in this request (the batch's entry).
 */
export async function recordLater(
  r: RedisRest,
  i: { ns: string; pv: string; arm: Arm; day: string; view: ViewSnapshot; items: EventType[]; counted?: readonly EventType[] },
): Promise<{ type: EventType; result: RecordResult }[]> {
  const stored = new Set<EventType>(i.counted ?? []);
  for (const [type, value] of Object.entries(i.view.claims) as [EventType, string][]) {
    if (value === i.arm) stored.add(type);
  }
  const expiry = i.view.entryExpiry;
  // A pending entry claim equals no arm, so a view whose entry was not counted counts nothing.
  const live = (i.arm as string) !== PENDING && stored.has('entry') && expiry !== null && expiry > 0;
  const results = new Map<EventType, RecordResult>();
  const planned = new Set<EventType>();
  const toClaim: EventType[] = [];
  for (const type of i.items) {
    if (!live || !PREREQUISITES[type].every((p) => stored.has(p) || planned.has(p))) {
      results.set(type, { outcome: 'orphan' });
    } else if (i.view.claims[type] !== undefined) {
      results.set(type, { outcome: 'duplicate' });
    } else {
      toClaim.push(type);
      planned.add(type);
    }
  }
  if (toClaim.length === 0) return i.items.map((type) => ({ type, result: results.get(type)! }));

  const claimValue = (type: EventType) => (PREREQUISITE_TYPES.has(type) ? PENDING : i.arm);
  const sets = await r.pipeline(toClaim.map((type) => ['SET', keys.claim(i.ns, i.pv, type), claimValue(type), 'NX', 'PXAT', expiry!]));
  const counting: EventType[] = [];
  toClaim.forEach((type, k) => {
    if (sets[k] !== null && sets[k] !== 'OK') throw new RedisUnavailable('SET returned an unexpected reply');
    if (!PREREQUISITES[type].every((p) => stored.has(p) || counting.includes(p))) {
      results.set(type, { outcome: 'orphan' });
    } else if (sets[k] === null) {
      results.set(type, { outcome: 'duplicate' });
    } else {
      counting.push(type);
    }
  });
  if (counting.length > 0) {
    const counters = keys.counters(i.ns);
    const commands: RedisCommand[] = [];
    const at = new Map<EventType, number>();
    for (const type of counting) {
      at.set(type, commands.length);
      commands.push(
        ['HINCRBY', counters, fieldName({ kind: 'total', arm: i.arm, metric: type }), 1],
        ['HINCRBY', counters, fieldName({ kind: 'day', day: i.day, arm: i.arm, metric: type }), 1],
      );
      if (PREREQUISITE_TYPES.has(type)) commands.push(['SET', keys.claim(i.ns, i.pv, type), i.arm, 'XX', 'KEEPTTL']);
    }
    const replies = await r.transaction(commands);
    for (const type of counting) {
      const k = at.get(type)!;
      if (PREREQUISITE_TYPES.has(type) && replies[k + 2] !== 'OK' && replies[k + 2] !== null) {
        throw new RedisUnavailable('SET returned an unexpected reply');
      }
      results.set(type, { outcome: 'counted', arm: i.arm, total: int(replies[k], 'HINCRBY'), dayTotal: int(replies[k + 1], 'HINCRBY') });
    }
  }
  return i.items.map((type) => ({ type, result: results.get(type)! }));
}

/**
 * Counts one event of one view, at most once: an entry is claimEntry then countEntry with no checks
 * between (the event route runs its checks between the two; see the header); a later event is
 * readView then recordLater for that one item.
 */
export async function recordEvent(
  r: RedisRest,
  i: { ns: string; pv: string; arm: Arm; type: EventType; day: string; ttlSeconds: number },
): Promise<RecordResult> {
  if (i.type === 'entry') {
    if ((await claimEntry(r, i)) === 'duplicate') return { outcome: 'duplicate' };
    const { outcome, arm, total, dayTotal } = await countEntry(r, i);
    return { outcome, arm, total, dayTotal };
  }
  const view = await readView(r, { ns: i.ns, pv: i.pv, closed: false, expiry: true });
  const [only] = await recordLater(r, { ns: i.ns, pv: i.pv, arm: i.arm, day: i.day, view, items: [i.type] });
  return only!.result;
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

/**
 * One entry view, past its checks, against the day's ceiling: `ceiling + 1` gives `ceiling-first`.
 * `n` is the day's count across both groups, so `n === 1` marks the day's first entry.
 */
export async function countDailyEntryN(
  r: RedisRest,
  i: { ns: string; day: string; ceiling: number },
): Promise<{ verdict: 'ok' | 'ceiling-first' | 'ceiling'; n: number }> {
  const key = keys.ceiling(i.ns, i.day);
  const [count] = await r.transaction([
    ['INCR', key],
    ['EXPIRE', key, CEILING_TTL_SECONDS, 'NX'],
  ]);
  const n = int(count, 'INCR');
  const verdict = n <= i.ceiling ? 'ok' : n === i.ceiling + 1 ? 'ceiling-first' : 'ceiling';
  return { verdict, n };
}

/** countDailyEntryN's verdict alone. */
export async function countDailyEntry(
  r: RedisRest,
  i: { ns: string; day: string; ceiling: number },
): Promise<'ok' | 'ceiling-first' | 'ceiling'> {
  return (await countDailyEntryN(r, i)).verdict;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A raw closed-marker value (a GET or MGET reply), or null. A malformed marker throws. */
function parseClosed(raw: unknown): ClosedMarker | null {
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

/** The closed marker, or null. A malformed marker throws: it is never read as "still open". */
export async function readClosed(r: RedisRest, ns: string): Promise<ClosedMarker | null> {
  return parseClosed(await r.command(['GET', keys.closed(ns)]));
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
