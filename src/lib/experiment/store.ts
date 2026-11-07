// The handler rate-limits first, checks closure and flags, then reserves an entry with NX.
// Exclusions and the daily ceiling run before the owner-checked entry EVAL. The later EVAL
// checks closure, the live entry and prerequisites. Each view's claims share the entry TTL.
// The counter hash and closed marker hold no per-visitor data.
import { randomBytes } from 'node:crypto';
import type { Arm } from '../../experiment.values.ts';
import { EVENT_TYPES, REJECT_REASONS, type EventType, type RejectReason } from './events.ts';
import { fieldName, keys, parseField, type IpBucket } from './keys.ts';
import { berlinDay } from './time.ts';
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

// Positions follow EVENT_TYPES excluding entry. A pending in-view claim cannot admit a click.
const PACKED = /^([ab])\|(\d{4}-\d{2}-\d{2})\|([1-9]\d*)\|([01-]{6})$/;
function packedEntry(value: string) {
  const match = PACKED.exec(value);
  if (match === null) {
    if (value.includes('|')) throw new RedisUnavailable('invalid view claim');
    return null;
  }
  return { arm: match[1]!, expiry: Number(match[3]), mask: match[4]! };
}

/** Logical claims in either storage format, with the marker and absolute expiry when requested. */
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
  const packed = claims.entry === undefined ? null : packedEntry(claims.entry);
  if (packed !== null) {
    claims.entry = packed.arm;
    EVENT_TYPES.slice(1).forEach((type, index) => {
      const state = packed.mask[index];
      if (state === '0') delete claims[type];
      else claims[type] = state === '1' ? packed.arm : '-';
    });
  }
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
  const deadline = int(expiry, 'PEXPIRETIME');
  const packed = value === null ? null : packedEntry(value);
  return { value: packed === null ? value : packed.expiry === deadline ? packed.arm : null, expiry: deadline };
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
  const [only] = await recordAtomicLater(r, { ...i, items: [i.type] });
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

// Both counters always acquire a TTL within the same atomic operation.
export const INCREMENT_EXPIRING_SCRIPT = `local n = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[1], 'NX')
return n`;

async function incrementExpiring(r: RedisRest, key: string, ttlSeconds: number): Promise<number> {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) throw new TypeError('invalid increment TTL');
  return int(await r.command(['EVAL', INCREMENT_EXPIRING_SCRIPT, 1, key, ttlSeconds]), 'expiring increment');
}

/**
 * One event against an address bucket's per-minute limit. `INCR` and `EXPIRE NX` run in one
 * script, so a rate key can never exist without its expiry. The count `limit + 1` gives
 * `limited-first` (record the rejection once); above that, `limited`.
 */
export async function rateLimit<T extends string>(
  r: RedisRest,
  i: { bucketHash: T extends IpBucket ? never : T; minute: number; limit: number; ttlSeconds: number },
): Promise<'ok' | 'limited-first' | 'limited'> {
  if (!BUCKET_HASH.test(i.bucketHash)) throw new TypeError('rateLimit takes the HMAC of the address bucket, in hex');
  const key = keys.rate(i.bucketHash, i.minute);
  const n = await incrementExpiring(r, key, i.ttlSeconds);
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
  const n = await incrementExpiring(r, key, CEILING_TTL_SECONDS);
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
local closed = redis.call('GET',KEYS[2])
local entry = redis.call('GET',KEYS[3])
local function pack(expiry, mask)
  return arm..'|'..day..'|'..string.format('%.0f',expiry)..'|'..mask
end
local function fields(t)
  return 't:'..arm..':'..t, 'd:'..day..':'..arm..':'..t
end
local function prepare(planned)
  local names = {}
  for _,t in ipairs(planned) do
    local total, daily = fields(t)
    names[#names+1] = total
    names[#names+1] = daily
  end
  if #names == 0 then return {}, {} end
  local old = redis.call('HMGET',KEYS[1],unpack(names))
  local write, counts = {}, {}
  for i,t in ipairs(planned) do
    local total = safe(old[i*2-1],true)+1
    local daily = safe(old[i*2],true)+1
    write[#write+1] = names[i*2-1]
    write[#write+1] = string.format('%.0f',total)
    write[#write+1] = names[i*2]
    write[#write+1] = string.format('%.0f',daily)
    counts[t] = {total,daily}
  end
  return write,counts
end
`;

/** Exact script identities exported solely so the local fake can recognize the two contracts. */
export const ATOMIC_ENTRY_SCRIPT = `-- portfolio-atomic-entry-v1\n${ATOMIC_PREFLIGHT}
if #ARGV ~= 3 or not string.match(ARGV[3] or '', '^pending:[0-9a-f]+$') or #ARGV[3] ~= 40 then fail() end
local expiry = redis.call('PEXPIRETIME',KEYS[3])
if closed ~= false or expiry <= 0 or expiry > 9007199254740991 or redis.call('PTTL',KEYS[3]) <= 0 then return {'orphan'} end
if entry ~= ARGV[3] then return {'duplicate'} end
local write,counts = prepare({'entry'})
if not redis.call('SET',KEYS[3],'-','XX','KEEPTTL') then return {'orphan'} end
redis.call('HSET',KEYS[1],unpack(write))
if not redis.call('SET',KEYS[3],pack(expiry,'000000'),'XX','KEEPTTL') then error('ERR atomic store promotion') end
return {'counted',counts.entry[1],counts.entry[2],expiry}
`;

export const ATOMIC_LATER_SCRIPT = `-- portfolio-atomic-later-v1\n${ATOMIC_PREFLIGHT}
if #ARGV < 4 or #ARGV > 9 then fail() end
local expected = ARGV[3] ~= '' and safe(ARGV[3],false) or nil
if closed ~= false and not expected then return {'closed',closed} end
local storedArm, storedDay, storedExpiry, mask
if entry then storedArm, storedDay, storedExpiry, mask = string.match(entry, '^([ab])|(%d%d%d%d%-%d%d%-%d%d)|([1-9]%d*)|([01%-]+)$') end
if entry and string.find(entry,'|',1,true) and (not mask or #mask ~= 6) then fail() end
local expiry, valid = nil, false
local values = {entry}
if mask then
  expiry = safe(storedExpiry,false)
  day = storedDay
  valid = closed == false and storedArm == arm and (not expected or expected == expiry) and redis.call('PTTL',KEYS[3]) > 0
  values[1] = storedArm
  for i=2,#types do
    local state = string.sub(mask,i-1,i-1)
    if state == '1' then values[i] = storedArm elseif state == '-' then values[i] = '-' else values[i] = false end
  end
else
  -- Earlier writers used independent keys. An admission without a deadline requests one
  -- before attempting a legacy write, so the caller can derive the Berlin entry day.
  if entry == arm and closed == false then
    expiry = redis.call('PEXPIRETIME',KEYS[3])
    if expiry > 0 and expiry <= 9007199254740991 and redis.call('PTTL',KEYS[3]) > 0 then
      if not expected then return {'legacy',expiry} end
      valid = expiry == expected
    end
  end
  for i=2,#types do values[i] = redis.call('GET',KEYS[i+2]) end
end
local outcomes, planned, ready, seen = {}, {}, {}, {}
for i,t in ipairs(types) do ready[t] = values[i] == arm end
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
if #write > 0 then
  if mask then
    local function mark(t, state)
      local i = index[t]-1
      mask = string.sub(mask,1,i-1)..state..string.sub(mask,i+1)
    end
    local promote = false
    for _,t in ipairs(planned) do
      mark(t, t == 'inview' and '-' or '1')
      if t == 'inview' then promote = true end
    end
    if not redis.call('SET',KEYS[3],pack(expiry,mask),'XX','KEEPTTL') then error('ERR atomic store ownership') end
    redis.call('HSET',KEYS[1],unpack(write))
    if promote then
      mark('inview','1')
      if not redis.call('SET',KEYS[3],pack(expiry,mask),'XX','KEEPTTL') then error('ERR atomic store promotion') end
    end
  else
    for _,t in ipairs(planned) do
      if not redis.call('SET',KEYS[index[t]+2],'-','NX','PXAT',expiry) then error('ERR atomic store ownership') end
    end
    redis.call('HSET',KEYS[1],unpack(write))
    for _,t in ipairs(planned) do
      if not redis.call('SET',KEYS[index[t]+2],arm,'XX','KEEPTTL') then error('ERR atomic store promotion') end
    end
  end
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

export class CountingClosed extends Error {}

/** An optional deadline binds a recovered batch to the entry generation it observed. */
export async function recordAtomicLater(r: RedisRest, i: { ns: string; pv: string; arm: Arm; day: string; view?: Pick<ViewSnapshot, 'entryExpiry'>; items: EventType[]; ttlSeconds?: number }): Promise<{ type: EventType; result: RecordResult }[]> {
  atomicInput(i);
  if (i.items.length > 6 || new Set(i.items).size !== i.items.length || i.items.some(t => t === 'entry' || !EVENT_TYPES.includes(t))) throw new TypeError('invalid atomic batch');
  if (i.items.length === 0) return [];
  const deadline = i.view?.entryExpiry;
  if (i.view !== undefined && (deadline == null || !Number.isSafeInteger(deadline) || deadline <= 0)) {
    return i.items.map(type => ({ type, result: { outcome: 'orphan' } }));
  }
  const run = (day: string, expiry: number | '') =>
    r.command(['EVAL', ATOMIC_LATER_SCRIPT, 9, ...atomicKeys(i), i.arm, day, expiry, ...i.items]);
  let reply = await run(i.day, deadline ?? '');
  if (Array.isArray(reply) && reply[0] === 'closed') {
    if (parseClosed(reply[1]) !== null) throw new CountingClosed();
    throw new RedisUnavailable('atomic batch returned an unexpected marker');
  }
  if (Array.isArray(reply) && reply[0] === 'legacy') {
    const expiry = int(reply[1], 'legacy claim expiry');
    if (deadline !== undefined || i.ttlSeconds === undefined || expiry <= 0) throw new RedisUnavailable('unexpected legacy claim expiry');
    reply = await run(berlinDay(new Date(expiry - i.ttlSeconds * 1000).toISOString()), expiry);
  }
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
