import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { EVENT_TYPES } from '@/lib/experiment/events';
import { keys } from '@/lib/experiment/keys';
import { createMemoryRedis } from '@/lib/experiment/memory-redis';
import { RedisUnavailable, type RedisCommand, type RedisRest } from '@/lib/experiment/redis-rest';
import {
  ATOMIC_ENTRY_SCRIPT, ATOMIC_LATER_SCRIPT, countDailyEntryN, finalizeAtomicEntry, rateLimit, readCounters,
  readView, recordAtomicLater, reserveAtomicEntry,
} from '@/lib/experiment/store';

const endpoint = process.env.REDIS_CONFORMANCE_URL;
if (!endpoint) console.info('Standalone Redis conformance skipped. Set REDIS_CONFORMANCE_URL to enable it.');
const exec = promisify(execFile);
const day = '2026-11-01';
const pv = '00000000-0000-4000-8000-000000000001';
const owner = '0123456789abcdef0123456789abcdef';
const another = 'fedcba9876543210fedcba9876543210';
type Fault = 'before-counts' | 'after-counts';

function localArguments(address: string): string[] {
  const url = new URL(address);
  if (url.protocol !== 'redis:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
    || !url.port || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('REDIS_CONFORMANCE_URL must name a disposable loopback Redis instance with an explicit port');
  }
  return ['-h', url.hostname.replace(/^\[|\]$/g, ''), '-p', url.port];
}

async function realCommand(command: RedisCommand): Promise<unknown> {
  const { stdout } = await exec(process.env.REDIS_CONFORMANCE_CLI ?? 'redis-cli',
    [...localArguments(endpoint!), '-2', '--json', ...command.map(String)], { timeout: 3000 });
  const reply = stdout.trim();
  if (reply.startsWith('error:') || reply.startsWith('(error)')) throw new RedisUnavailable('Redis rejected the conformance command');
  return JSON.parse(reply) as unknown;
}

function faultBody(script: string, fault: Fault): string {
  // Redis scripts retain writes made before an error. Inject immediately at the same call
  // boundary as the memory model, leaving the actual operation body intact.
  return `
local call = redis.call
local committed = false
local redis = {call=function(name, ...)
  if ${fault === 'before-counts' ? "name == 'HSET'" : "committed and name == 'SET'"} then error('injected test failure') end
  local reply = call(name, ...)
  if name == 'HSET' then committed = true end
  return reply
end}
${script}`;
}

const settle = async (p: Promise<unknown>) => {
  try { return { value: await p }; }
  catch (e) {
    if (!(e instanceof RedisUnavailable)) throw e;
    return { rejected: true };
  }
};

async function exercise(
  run: (state: Awaited<ReturnType<typeof fixture>>) => Promise<void>,
) {
  const f = await fixture();
  try { await run(f); }
  finally { await realCommand(['DEL', ...f.allKeys, f.rateKey, f.ceilingKey]); }
}

async function fixture() {
  const ns = `conformance-${randomBytes(8).toString('hex')}`;
  const input = { ns, pv, day, owner, arm: 'a' as const, ttlSeconds: 1800 };
  const entryKey = keys.claim(ns, pv, 'entry');
  const bucketHash = randomBytes(32).toString('hex');
  const rateKey = keys.rate(bucketHash, 1);
  const ceilingKey = keys.ceiling(ns, day);
  const allKeys = [keys.counters(ns), keys.closed(ns), ...EVENT_TYPES.map(type => keys.claim(ns, pv, type))];
  const time = await realCommand(['TIME']) as [string, string];
  let now = Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);
  let deadline = now + 1_800_000;
  let fault: Fault | null = null;
  let counted = false;
  const model = createMemoryRedis({ now: () => now, atomicCommand: command => {
    if (fault === 'before-counts' && command[0] === 'HSET') throw new Error('injected test failure');
    if (fault === 'after-counts' && counted && command[0] === 'SET') throw new Error('injected test failure');
    if (command[0] === 'HSET') counted = true;
  } });
  const redis: RedisRest = {
    async command(command) {
      const body = command[1];
      const atomic = command[0] === 'EVAL' && (body === ATOMIC_ENTRY_SCRIPT || body === ATOMIC_LATER_SCRIPT);
      counted = false;
      const actual = fault !== null && atomic ? ['EVAL', faultBody(String(body), fault), ...command.slice(2)] as const : command;
      const expectedReply = command[0] === 'DEL'
        ? Promise.resolve(command.slice(1).filter(key => model.remove(String(key))).length)
        : model.command(command);
      const [expected, received] = await Promise.all([settle(expectedReply), settle(realCommand(actual))]);
      if (command[0] === 'HGETALL' && 'value' in expected && 'value' in received) {
        const entries = (value: unknown) => {
          const flat = value as string[];
          return Object.fromEntries(flat.flatMap((field, i) => i % 2 === 0 ? [[field, flat[i + 1]]] : []));
        };
        expect(entries(received.value)).toEqual(entries(expected.value));
      } else expect(received).toEqual(expected);
      if ('rejected' in received) throw new RedisUnavailable('conformance command failed');
      return received.value;
    },
    pipeline: commands => Promise.all(commands.map(c => redis.command(c))),
    transaction: () => { throw new Error('atomic claim scenarios do not use a transaction'); },
  };
  const reserve = (by = owner) => redis.command(['SET', entryKey, `pending:${by}`, 'NX', 'PXAT', deadline]);
  const enter = async () => {
    expect(await reserve()).toBe('OK');
    expect(await finalizeAtomicEntry(redis, input)).toMatchObject({ outcome: 'counted', expiresAt: deadline });
  };
  const view = () => readView(redis, { ns, pv, closed: false, expiry: true });
  return { ns, pv, input, entryKey, allKeys, redis, model, reserve, enter, view, bucketHash, rateKey, ceilingKey,
    failAt(value: Fault | null) { fault = value; },
    alignReservation: () => redis.command(['SET', entryKey, `pending:${owner}`, 'XX', 'PXAT', deadline]),
    async boundary(offset: number, arm: 'a' | 'b') {
      // Set an expiry relative to Redis' frozen script time. This keeps the 1ms cases
      // deterministic regardless of CLI/process latency. The production script body is unchanged.
      const raw = ['EVAL', ATOMIC_LATER_SCRIPT, 9, ...allKeys, arm, day, '', 'inview'] as const;
      const setup = `local t = redis.call('TIME')
local deadline = tonumber(t[1])*1000 + math.floor(tonumber(t[2])/1000) - ${offset}
redis.call('SET',KEYS[3],ARGV[1]..'|'..ARGV[2]..'|'..string.format('%.0f',deadline)..'|000000','PXAT',deadline)
`;
      now = deadline + offset;
      await model.command(['SET', entryKey, `${arm}|${day}|${deadline}|000000`, 'PXAT', deadline]);
      const actual = await realCommand(['EVAL', setup + ATOMIC_LATER_SCRIPT, ...raw.slice(2)]);
      const expected = await model.command(raw);
      expect(actual).toEqual(expected);
      expect(actual).toEqual(offset < 0 ? [['inview', 'counted', 1, 1]] : [['inview', 'orphan']]);
    },
    async replace() {
      await redis.command(['DEL', entryKey]);
      deadline += 10;
      expect(await reserve(another)).toBe('OK');
    },
  };
}

describe.skipIf(!endpoint)('standalone Redis conformance (set REDIS_CONFORMANCE_URL to enable)', () => {
  it('checks reservation ownership, replacement and duplicates', () => exercise(async f => {
    const native = { ...f.redis, command: realCommand };
    expect(await reserveAtomicEntry(native, f.input)).toBe(await reserveAtomicEntry(f.model, f.input));
    expect(await f.alignReservation()).toBe('OK');
    expect(await f.reserve()).toBeNull();
    expect(await finalizeAtomicEntry(f.redis, { ...f.input, owner: another })).toEqual({ outcome: 'duplicate' });
    await f.replace();
    expect(await finalizeAtomicEntry(f.redis, f.input)).toEqual({ outcome: 'duplicate' });
    expect(await finalizeAtomicEntry(f.redis, { ...f.input, owner: another })).toMatchObject({ outcome: 'counted' });
    expect(await finalizeAtomicEntry(f.redis, { ...f.input, owner: another })).toEqual({ outcome: 'duplicate' });
    expect((await readCounters(f.redis, f.ns)).totals.a.entry).toBe(1);
  }));

  for (const arm of ['a', 'b'] as const) {
    it.each([-1, 0, 1])(`${arm}: expiry boundary %i ms`, offset => exercise(f => f.boundary(offset, arm)));
  }

  it('rejects an older generation after the entry is replaced', () => exercise(async f => {
    await f.enter();
    const previous = await f.view();
    await f.replace();
    expect(await finalizeAtomicEntry(f.redis, { ...f.input, owner: another })).toMatchObject({ outcome: 'counted' });
    expect(await recordAtomicLater(f.redis, { ...f.input, view: previous, items: ['cv'] }))
      .toEqual([{ type: 'cv', result: { outcome: 'orphan' } }]);
  }));

  it('keeps the rate and ceiling expiries across repeated atomic increments', () => exercise(async f => {
    const rate = { bucketHash: f.bucketHash, minute: 1, limit: 1, ttlSeconds: 120 };
    const ceiling = { ns: f.ns, day, ceiling: 1 };
    expect(await rateLimit(f.redis, rate)).toBe('ok');
    expect(await countDailyEntryN(f.redis, ceiling)).toEqual({ n: 1, verdict: 'ok' });
    const expiries = async (run: (c: RedisCommand) => Promise<unknown>) =>
      Promise.all([f.rateKey, f.ceilingKey].map(key => run(['PEXPIRETIME', key])));
    const [actual, expected] = await Promise.all([expiries(realCommand), expiries(f.model.command)]);
    expect(actual.every(expiry => typeof expiry === 'number' && expiry > 0)).toBe(true);
    expect(expected.every(expiry => typeof expiry === 'number' && expiry > 0)).toBe(true);
    expect(await rateLimit(f.redis, rate)).toBe('limited-first');
    expect(await countDailyEntryN(f.redis, ceiling)).toEqual({ n: 2, verdict: 'ceiling-first' });
    expect(await expiries(realCommand)).toEqual(actual);
    expect(await expiries(f.model.command)).toEqual(expected);
  }));

  it('serializes overlapping batches with paired counters and shared expiry', () => exercise(async f => {
    await f.enter();
    const view = await f.view();
    const request = { ...f.input, view, items: ['inview', 'card', 'secondary'] as ('inview' | 'card' | 'secondary')[] };
    // The two requests are identical. Compare the multiset of replies, since either may win.
    const command = ['EVAL', ATOMIC_LATER_SCRIPT, 9, ...f.allKeys, 'a', day, view.entryExpiry!, ...request.items] as const;
    const execute = (run: (c: RedisCommand) => Promise<unknown>) =>
      Promise.all([run(command), run(command)]).then(replies => replies.map(reply => JSON.stringify(reply)).sort());
    expect(await execute(realCommand)).toEqual(await execute(f.model.command));
    const rows = await readCounters(f.redis, f.ns);
    expect(rows.totals.a).toMatchObject({ entry: 1, inview: 1, card: 1, secondary: 1 });
    expect(rows.days[0]?.a).toEqual(rows.totals.a);
    expect((await f.view()).entryExpiry).toBe(view.entryExpiry);
  }));

  it.each(['counter', 'closed', 'entry', ...EVENT_TYPES.slice(1)])('rejects a wrong-type %s without mutation', name => exercise(async f => {
    await f.enter();
    const view = await f.view();
    // Individual later keys are read for in-flight entries created by an older writer.
    if (EVENT_TYPES.slice(1).includes(name as (typeof EVENT_TYPES)[number])) {
      await f.redis.command(['SET', f.entryKey, 'a', 'XX', 'KEEPTTL']);
    }
    const key = name === 'counter' ? keys.counters(f.ns) : name === 'closed' ? keys.closed(f.ns) : keys.claim(f.ns, pv, name as 'entry');
    await f.redis.command(['DEL', key]);
    await f.redis.command(name === 'counter' ? ['SET', key, 'wrong'] : ['HSET', key, 'f', '1']);
    await expect(recordAtomicLater(f.redis, { ...f.input, view, items: ['cv'] })).rejects.toBeInstanceOf(RedisUnavailable);
    expect(await f.redis.command(name === 'counter' ? ['GET', key] : ['HGETALL', key])).toEqual(
      name === 'counter' ? 'wrong' : ['f', '1'],
    );
    if (name !== 'counter') expect((await readCounters(f.redis, f.ns)).totals.a.cv).toBe(0);
  }));

  it.each(['x', '-1', '01', '1.5', '9007199254740991', '9007199254740992'])('preflights invalid counter %s', value => exercise(async f => {
    await f.enter();
    const before = await f.view();
    await f.redis.command(['HSET', keys.counters(f.ns), `d:${day}:a:cv`, value]);
    await expect(recordAtomicLater(f.redis, { ...f.input, view: before, items: ['cv'] })).rejects.toBeInstanceOf(RedisUnavailable);
    expect(await f.view()).toEqual(before);
  }));

  it('keeps a maximum safe counter exact and refuses the next increment', () => exercise(async f => {
    await f.enter();
    const view = await f.view();
    const counter = keys.counters(f.ns);
    await f.redis.command(['HSET', counter, 't:a:cv', '9007199254740990', `d:${day}:a:cv`, '9007199254740990']);
    expect((await recordAtomicLater(f.redis, { ...f.input, view, items: ['cv'] }))[0]?.result)
      .toMatchObject({ total: 9007199254740991, dayTotal: 9007199254740991 });
    const next = await f.view();
    await f.redis.command(['HSET', counter, 't:a:contact', '9007199254740991']);
    await expect(recordAtomicLater(f.redis, { ...f.input, view: next, items: ['contact'] })).rejects.toBeInstanceOf(RedisUnavailable);
    expect(await f.view()).toEqual(next);
  }));

  it('rechecks closure after admission', () => exercise(async f => {
    await f.enter();
    const view = await f.view();
    await f.redis.command(['SET', keys.closed(f.ns), JSON.stringify({ kind: 'decision', day })]);
    expect(await recordAtomicLater(f.redis, { ...f.input, view, items: ['cv'] }))
      .toEqual([{ type: 'cv', result: { outcome: 'orphan' } }]);
    expect((await readCounters(f.redis, f.ns)).totals.a.cv).toBe(0);
  }));

  it('keeps earlier per-event claims readable and aligns new legacy claims to their entry deadline', () => exercise(async f => {
    await f.enter();
    await f.redis.command(['SET', f.entryKey, 'a', 'XX', 'KEEPTTL']);
    const view = await f.view();
    const request = { ...f.input, items: ['inview', 'card'] as ('inview' | 'card')[] };
    expect((await recordAtomicLater(f.redis, request)).map(item => item.result.outcome)).toEqual(['counted', 'counted']);
    expect((await recordAtomicLater(f.redis, request)).map(item => item.result.outcome)).toEqual(['duplicate', 'duplicate']);
    expect(await f.redis.command(['PEXPIRETIME', keys.claim(f.ns, pv, 'card')])).toBe(view.entryExpiry);
  }));

  for (const fault of ['before-counts', 'after-counts'] as const) {
    it(`entry failure ${fault} consumes its owner once`, () => exercise(async f => {
      await f.reserve();
      f.failAt(fault);
      await expect(finalizeAtomicEntry(f.redis, f.input)).rejects.toBeInstanceOf(RedisUnavailable);
      f.failAt(null);
      expect(await finalizeAtomicEntry(f.redis, f.input)).toEqual({ outcome: 'duplicate' });
      expect(await f.redis.command(['GET', f.entryKey])).toBe('-');
      expect((await readCounters(f.redis, f.ns)).totals.a.entry).toBe(fault === 'after-counts' ? 1 : 0);
    }));

    it(`later failure ${fault} leaves an unavailable prerequisite`, () => exercise(async f => {
      await f.enter();
      const view = await f.view();
      const request = { ...f.input, view, items: ['inview', 'card'] as ('inview' | 'card')[] };
      f.failAt(fault);
      await expect(recordAtomicLater(f.redis, request)).rejects.toBeInstanceOf(RedisUnavailable);
      f.failAt(null);
      expect((await recordAtomicLater(f.redis, request)).map(item => item.result.outcome)).toEqual(['duplicate', 'orphan']);
      const rows = await readCounters(f.redis, f.ns);
      expect(rows.totals.a.inview).toBe(fault === 'after-counts' ? 1 : 0);
      expect(rows.totals.a.card).toBe(rows.totals.a.inview);
    }));
  }
});
