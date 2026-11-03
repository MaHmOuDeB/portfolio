// Server-side experiment counters and expiring per-view claims. The handler reserves the
// entry before exclusion and ceiling checks, then finalizes with an owner-checked EVAL.
// Later batches recheck live claims inside EVAL. The counter hash and closed marker hold
// no per-visitor data.
import { randomBytes } from 'node:crypto';
import type { Arm } from '../../experiment.values.ts';
import { EVENT_TYPES, PREREQUISITES, REJECT_REASONS, type EventType, type RejectReason } from './events.ts';
import { fieldName, keys, parseField, type IpBucket } from './keys.ts';
import { RedisUnavailable, type RedisCommand, type RedisRest } from './redis-rest.ts';

export type RecordResult =
  | { outcome: 'counted'; arm: Arm; total: number; dayTotal: number }
  | { outcome: 'duplicate' }
  | { outcome: 'orphan' };

/**
 * Why counting stopped: the first decision, a failed calibration (by rule or by the flag), or an
 * A/B held at a data fault (it is stopped there and never resumed).
 */
export type ClosedMarker = { kind: 'decision' | 'aa-failed' | 'held'; day: string };
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

/** Counts one event using the same ownership and expiry rules as the handler. */
export async function recordEvent(
  r: RedisRest,
  i: { ns: string; pv: string; arm: Arm; type: EventType; day: string; ttlSeconds: number },
): Promise<RecordResult> {
  if (i.type === 'entry') {
    const owner = randomBytes(16).toString('hex');
    if ((await reserveAtomicEntry(r, { ...i, owner })) === 'duplicate') return { outcome: 'duplicate' };
    const result = await finalizeAtomicEntry(r, { ...i, owner });
    if (result.outcome !== 'counted') return { outcome: result.outcome };
    return { outcome: result.outcome, arm: result.arm, total: result.total, dayTotal: result.dayTotal };
  }
  if (i.arm !== 'a' && i.arm !== 'b') return { outcome: 'orphan' };
  const view = await readView(r, { ns: i.ns, pv: i.pv, closed: false, expiry: true });
  const [only] = await recordAtomicLater(r, { ns: i.ns, pv: i.pv, arm: i.arm, day: i.day, view, items: [i.type] });
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
    if ((kind === 'decision' || kind === 'aa-failed' || kind === 'held') && typeof day === 'string' && DAY.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day) return { kind, day };
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

// No runtime-error rollback is promised: pending claims are consumed before a single paired HSET.
const ATOMIC_PREFLIGHT = `
local types = {'entry','inview','engaged','card','secondary','cv','contact'}
local index = {entry=1,inview=2,engaged=3,card=4,secondary=5,cv=6,contact=7}
local arm, day = ARGV[1], ARGV[2]
local function fail() error('ERR atomic store preflight') end
if #KEYS ~= 9 or (arm ~= 'a' and arm ~= 'b') or not string.match(day or '', '^%d%d%d%d%-%d%d%-%d%d$') then fail() end
local seenKeys = {}
for _,k in ipairs(KEYS) do
  if seenKeys[k] then fail() end
  seenKeys[k] = true
end
local function safe(raw, increment)
  if raw == false then raw = '0' end
  if type(raw) ~= 'string' or not (raw == '0' or string.match(raw, '^[1-9]%d*$')) then fail() end
  if #raw > 16 or (#raw == 16 and raw > '9007199254740991') then fail() end
  local n = tonumber(raw)
  if increment and n >= 9007199254740991 then fail() end
  return n
end
local expiry = redis.call('PEXPIRETIME', KEYS[3])
local clock = redis.call('TIME')
local now = tonumber(clock[1])*1000 + math.floor(tonumber(clock[2])/1000)
local closed = redis.call('GET',KEYS[2])
local entry = redis.call('GET',KEYS[3])
local live = expiry > now and expiry <= 9007199254740991 and closed == false
local function fields(t)
  return 't:'..arm..':'..t, 'd:'..day..':'..arm..':'..t
end
local function prepare(planned)
  local names = {}
  for _,t in ipairs(planned) do
    local total, daily = fields(t)
    names[#names+1], names[#names+2] = total, daily
  end
  if #names == 0 then return {}, {} end
  local old = redis.call('HMGET',KEYS[1],unpack(names))
  local write, counts = {}, {}
  for i,t in ipairs(planned) do
    local total = safe(old[i*2-1],true)+1
    local daily = safe(old[i*2],true)+1
    write[#write+1], write[#write+2] = names[i*2-1], string.format('%.0f',total)
    write[#write+1], write[#write+2] = names[i*2], string.format('%.0f',daily)
    counts[t] = {total,daily}
  end
  return write,counts
end
`;

/** Exact script identities exported solely so the local fake can recognize the two contracts. */
export const ATOMIC_ENTRY_SCRIPT = `-- portfolio-atomic-entry-v1\n${ATOMIC_PREFLIGHT}
if #ARGV ~= 3 or not string.match(ARGV[3] or '', '^pending:[0-9a-f]+$') or #ARGV[3] ~= 40 then fail() end
if not live then return {'orphan'} end
if entry ~= ARGV[3] then return {'duplicate'} end
local write,counts = prepare({'entry'})
if not redis.call('SET',KEYS[3],'-','XX','KEEPTTL') then return {'orphan'} end
redis.call('HSET',KEYS[1],unpack(write))
if not redis.call('SET',KEYS[3],arm,'XX','KEEPTTL') then error('ERR atomic store promotion') end
return {'counted',counts.entry[1],counts.entry[2],expiry}
`;

export const ATOMIC_LATER_SCRIPT = `-- portfolio-atomic-later-v1\n${ATOMIC_PREFLIGHT}
if #ARGV < 4 or #ARGV > 9 then fail() end
local expected = safe(ARGV[3],false)
-- GET preserves WRONGTYPE for claims that MGET would report as missing.
local values = {entry}
for i=2,#types do values[i] = redis.call('GET',KEYS[i+2]) end
local outcomes, planned, ready, seen = {}, {}, {}, {}
for i,t in ipairs(types) do ready[t] = values[i] == arm end
local valid = live and expiry == expected and entry == arm
for i=4,#ARGV do
  local t = ARGV[i]
  if not index[t] or t == 'entry' or seen[t] then fail() end
  seen[t] = true
  if not valid or not ready.entry or ((t == 'card' or t == 'secondary') and not ready.inview) then
    outcomes[#outcomes+1] = {t,'orphan'}
  elseif values[index[t]] ~= false then
    outcomes[#outcomes+1] = {t,'duplicate'}
  else
    outcomes[#outcomes+1] = {t,'counted'}
    planned[#planned+1] = t
    ready[t] = true
  end
end
local write,counts = prepare(planned)
for _,t in ipairs(planned) do
  if not redis.call('SET',KEYS[index[t]+2],'-','NX','PXAT',expiry) then error('ERR atomic store ownership') end
end
if #write > 0 then redis.call('HSET',KEYS[1],unpack(write)) end
for _,t in ipairs(planned) do
  if not redis.call('SET',KEYS[index[t]+2],arm,'XX','KEEPTTL') then error('ERR atomic store promotion') end
end
for _,out in ipairs(outcomes) do
  if out[2] == 'counted' then out[3],out[4] = counts[out[1]][1],counts[out[1]][2] end
end
return outcomes
`;

function atomicKeys(i: { ns: string; pv: string }): string[] {
  return [keys.counters(i.ns), keys.closed(i.ns), ...EVENT_TYPES.map(t => keys.claim(i.ns, i.pv, t))];
}
function atomicInput(i: { arm: Arm; day: string }): void {
  if ((i.arm !== 'a' && i.arm !== 'b') || !/^\d{4}-\d{2}-\d{2}$/.test(i.day)) throw new TypeError('invalid atomic input');
}
function ownerValue(owner: string): string {
  if (!/^[0-9a-f]{32}$/.test(owner)) throw new TypeError('atomic reservation needs a 128-bit owner token');
  return `pending:${owner}`;
}

/** Caller supplies a fresh random owner; never expose it in browser responses or logs. */
export async function reserveAtomicEntry(r: RedisRest, i: { ns: string; pv: string; owner: string; ttlSeconds: number }): Promise<'claimed' | 'duplicate'> {
  if (!Number.isSafeInteger(i.ttlSeconds) || i.ttlSeconds <= 0) throw new TypeError('invalid reservation TTL');
  const reply = await r.command(['SET', keys.claim(i.ns, i.pv, 'entry'), ownerValue(i.owner), 'NX', 'EX', i.ttlSeconds]);
  if (reply === 'OK') return 'claimed';
  if (reply === null) return 'duplicate';
  throw new RedisUnavailable('atomic reservation returned an unexpected reply');
}

/** No automatic retry on a timeout or unknown result. */
export async function finalizeAtomicEntry(r: RedisRest, i: { ns: string; pv: string; arm: Arm; day: string; owner: string }): Promise<RecordResult & { expiresAt?: number }> {
  atomicInput(i);
  const reply = await r.command(['EVAL', ATOMIC_ENTRY_SCRIPT, 9, ...atomicKeys(i), i.arm, i.day, ownerValue(i.owner)]);
  if (Array.isArray(reply)) {
    if (reply.length === 1 && (reply[0] === 'orphan' || reply[0] === 'duplicate')) return { outcome: reply[0] };
    if (reply.length === 4 && reply[0] === 'counted') {
      const total = int(reply[1], 'atomic total'), dayTotal = int(reply[2], 'atomic day'), expiresAt = int(reply[3], 'atomic expiry');
      if (total > 0 && dayTotal > 0 && expiresAt > 0) return { outcome: 'counted', arm: i.arm, total, dayTotal, expiresAt };
    }
  }
  throw new RedisUnavailable('atomic entry returned an unexpected reply');
}

/** Snapshot expiry is a generation comparison only; Redis rechecks all liveness and ownership. */
export async function recordAtomicLater(r: RedisRest, i: { ns: string; pv: string; arm: Arm; day: string; view: ViewSnapshot; items: EventType[] }): Promise<{ type: EventType; result: RecordResult }[]> {
  atomicInput(i);
  if (i.items.length > 6 || new Set(i.items).size !== i.items.length || i.items.some(t => t === 'entry' || !EVENT_TYPES.includes(t))) throw new TypeError('invalid atomic batch');
  if (i.items.length === 0) return [];
  if (!Number.isSafeInteger(i.view.entryExpiry) || i.view.entryExpiry! <= 0) return i.items.map(type => ({ type, result: { outcome: 'orphan' } }));
  const reply = await r.command(['EVAL', ATOMIC_LATER_SCRIPT, 9, ...atomicKeys(i), i.arm, i.day, i.view.entryExpiry!, ...i.items]);
  if (!Array.isArray(reply) || reply.length !== i.items.length) throw new RedisUnavailable('atomic batch returned an unexpected reply');
  return reply.map((raw: unknown, k: number) => {
    const type = i.items[k]!;
    if (Array.isArray(raw) && raw[0] === type) {
      if (raw.length === 2 && (raw[1] === 'orphan' || raw[1] === 'duplicate')) return { type, result: { outcome: raw[1] } as RecordResult };
      if (raw.length === 4 && raw[1] === 'counted') {
        const total = int(raw[2], 'atomic total'), dayTotal = int(raw[3], 'atomic day');
        if (total > 0 && dayTotal > 0) return { type, result: { outcome: 'counted', arm: i.arm, total, dayTotal } as RecordResult };
      }
    }
    throw new RedisUnavailable('atomic batch returned an unexpected item');
  });
}
