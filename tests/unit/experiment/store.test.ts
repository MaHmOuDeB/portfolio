import { createHmac } from 'node:crypto';
import { EVENT_TYPES, REJECT_REASONS, type EventType } from '@/lib/experiment/events';
import { ipBucket, keys } from '@/lib/experiment/keys';
import { createMemoryRedis } from '@/lib/experiment/memory-redis';
import { RedisUnavailable } from '@/lib/experiment/redis-rest';
import {
  CorruptCounters,
  claimEntry,
  countDailyEntry,
  countDailyEntryN,
  countEntry,
  rateLimit,
  readClosed,
  readCounters,
  readView,
  recordEvent,
  recordLater,
  recordRejection,
  writeClosed,
} from '@/lib/experiment/store';

const NS = 'aa-v1';
const PV = '3f2b8c1e-9a4d-4b6f-8e2a-1c5d7f9b0a3e';
const PV2 = '7c1d2e3f-4a5b-4c6d-9e7f-8a9b0c1d2e3f';
const DAY = '2026-11-20';
const TTL = 1800;

function setup(start = 0) {
  let t = start;
  const redis = createMemoryRedis({ now: () => t });
  return { redis, at: (seconds: number) => (t = start + seconds * 1000) };
}

const ev = (type: EventType, pv = PV, arm: 'a' | 'b' = 'a', day = DAY) => ({ ns: NS, pv, arm, type, day, ttlSeconds: TTL });

describe('recordEvent', () => {
  it('an entry counts once; the same view again is a duplicate; a second view gives total 2', async () => {
    const { redis } = setup();
    await expect(recordEvent(redis, ev('entry'))).resolves.toEqual({ outcome: 'counted', arm: 'a', total: 1, dayTotal: 1 });
    await expect(recordEvent(redis, ev('entry'))).resolves.toEqual({ outcome: 'duplicate' });
    await expect(recordEvent(redis, ev('entry', PV2))).resolves.toEqual({ outcome: 'counted', arm: 'a', total: 2, dayTotal: 2 });
    const hash = await redis.command(['HGETALL', keys.counters(NS)]);
    expect(hash).toEqual(['t:a:entry', '2', `d:${DAY}:a:entry`, '2']);
  });

  it('dayTotal counts per day while total counts across days', async () => {
    const { redis } = setup();
    await recordEvent(redis, ev('entry', PV, 'b', '2026-11-20'));
    await expect(recordEvent(redis, ev('entry', PV2, 'b', '2026-11-21'))).resolves.toEqual({
      outcome: 'counted',
      arm: 'b',
      total: 2,
      dayTotal: 1,
    });
  });

  it('inview without an entry is an orphan, and counts after the entry', async () => {
    const { redis } = setup();
    await expect(recordEvent(redis, ev('inview'))).resolves.toEqual({ outcome: 'orphan' });
    await recordEvent(redis, ev('entry'));
    await expect(recordEvent(redis, ev('inview'))).resolves.toEqual({ outcome: 'counted', arm: 'a', total: 1, dayTotal: 1 });
    await expect(recordEvent(redis, ev('inview'))).resolves.toEqual({ outcome: 'duplicate' });
  });

  it('an orphan writes no claim, so the event can still count once its prerequisite arrives', async () => {
    const { redis } = setup();
    await recordEvent(redis, ev('inview'));
    expect(redis.entries()).toEqual([]);
  });

  it('card without inview is an orphan', async () => {
    const { redis } = setup();
    await recordEvent(redis, ev('entry'));
    await expect(recordEvent(redis, ev('card'))).resolves.toEqual({ outcome: 'orphan' });
    await recordEvent(redis, ev('inview'));
    await expect(recordEvent(redis, ev('card'))).resolves.toMatchObject({ outcome: 'counted', total: 1 });
  });

  it('card with an arm other than the entry arm is an orphan', async () => {
    const { redis } = setup();
    await recordEvent(redis, ev('entry', PV, 'a'));
    await recordEvent(redis, ev('inview', PV, 'a'));
    await expect(recordEvent(redis, ev('card', PV, 'b'))).resolves.toEqual({ outcome: 'orphan' });
    await expect(recordEvent(redis, ev('inview', PV, 'b'))).resolves.toEqual({ outcome: 'orphan' });
  });

  it('every claim of a view expires no later than 1,800 s after its entry claim was written', async () => {
    const { redis, at } = setup(1_763_629_200_000);
    at(0);
    await recordEvent(redis, ev('entry'));
    at(1799);
    await expect(recordEvent(redis, ev('inview'))).resolves.toMatchObject({ outcome: 'counted' });
    at(1799.9);
    await expect(recordEvent(redis, ev('card'))).resolves.toMatchObject({ outcome: 'counted' });
    const claims = redis.entries().filter((e) => e.key.includes(PV));
    expect(claims.map((e) => e.key).sort()).toEqual(
      [keys.claim(NS, PV, 'card'), keys.claim(NS, PV, 'entry'), keys.claim(NS, PV, 'inview')].sort(),
    );
    for (const c of claims) expect(c.expiresAt).toBe(1_763_629_200_000 + 1_800_000);
    at(1800.001);
    expect(redis.entries().filter((e) => e.key.includes(PV))).toEqual([]);
  });

  it('after 1,801 s a late card is an orphan', async () => {
    const { redis, at } = setup();
    at(0);
    await recordEvent(redis, ev('entry'));
    at(10);
    await recordEvent(redis, ev('inview'));
    at(1801);
    await expect(recordEvent(redis, ev('card'))).resolves.toEqual({ outcome: 'orphan' });
    expect(redis.entries().filter((e) => e.key.includes(PV))).toEqual([]);
  });

  it('an entry claim without an expiry makes later events orphans, so no claim is ever written without one', async () => {
    const { redis } = setup();
    await redis.command(['SET', keys.claim(NS, PV, 'entry'), 'a']);
    await expect(recordEvent(redis, ev('inview'))).resolves.toEqual({ outcome: 'orphan' });
    expect(redis.entries().map((e) => e.key)).toEqual([keys.claim(NS, PV, 'entry')]);
  });

  it('every key a view writes has an expiry', async () => {
    const { redis } = setup();
    for (const type of ['entry', 'inview', 'engaged', 'card', 'secondary', 'cv', 'contact'] as const) {
      await recordEvent(redis, ev(type));
    }
    const claims = redis.entries().filter((e) => e.key !== keys.counters(NS));
    expect(claims).toHaveLength(EVENT_TYPES.length);
    for (const c of claims) expect(c.expiresAt).toBe(1_800_000);
  });
});

describe('claimEntry and countEntry (claim first, then check, then count)', () => {
  const claimInput = (pv = PV) => ({ ns: NS, pv, ttlSeconds: TTL });

  /** The order the event route uses for one entry: claim; stop on duplicate; checks; a rejection row or countEntry. */
  async function handleEntry(
    redis: ReturnType<typeof createMemoryRedis>,
    o: { pv?: string; bot?: boolean; ceiling?: number } = {},
  ): Promise<string> {
    const pv = o.pv ?? PV;
    if ((await claimEntry(redis, claimInput(pv))) === 'duplicate') return 'duplicate';
    if (o.bot === true) {
      await recordRejection(redis, { ns: NS, reason: 'bot', day: DAY });
      return 'bot';
    }
    const ceiling = await countDailyEntry(redis, { ns: NS, day: DAY, ceiling: o.ceiling ?? 200 });
    if (ceiling !== 'ok') {
      if (ceiling === 'ceiling-first') await recordRejection(redis, { ns: NS, reason: 'ceiling', day: DAY });
      return 'ceiling';
    }
    const counted = await countEntry(redis, { ns: NS, pv, arm: 'a', day: DAY });
    return counted.outcome;
  }

  const hash = async (redis: ReturnType<typeof createMemoryRedis>) =>
    Object.fromEntries(
      ((await redis.command(['HGETALL', keys.counters(NS)])) as string[]).flatMap((v, i, a) => (i % 2 === 0 ? [[v, a[i + 1]]] : [])),
    ) as Record<string, string>;

  it('claimEntry writes a pending claim with the view TTL, then gives duplicate', async () => {
    const { redis } = setup();
    await expect(claimEntry(redis, claimInput())).resolves.toBe('claimed');
    await expect(claimEntry(redis, claimInput())).resolves.toBe('duplicate');
    expect(redis.entries()).toEqual([{ key: keys.claim(NS, PV, 'entry'), value: '-', expiresAt: 1_800_000 }]);
  });

  it('a bot entry sent twice records r:bot once', async () => {
    const { redis } = setup();
    await expect(handleEntry(redis, { bot: true })).resolves.toBe('bot');
    await expect(handleEntry(redis, { bot: true })).resolves.toBe('duplicate');
    expect(await hash(redis)).toEqual({ 'r:bot': '1', [`rd:${DAY}:bot`]: '1' });
  });

  it('a counted entry sent twice increments the daily ceiling once', async () => {
    const { redis } = setup();
    await expect(handleEntry(redis)).resolves.toBe('counted');
    await expect(handleEntry(redis)).resolves.toBe('duplicate');
    await expect(redis.command(['GET', keys.ceiling(NS, DAY)])).resolves.toBe('1');
    expect(await hash(redis)).toEqual({ 't:a:entry': '1', [`d:${DAY}:a:entry`]: '1' });
  });

  it('a bot entry followed by inview is an orphan', async () => {
    const { redis } = setup();
    await handleEntry(redis, { bot: true });
    await expect(recordEvent(redis, ev('inview'))).resolves.toEqual({ outcome: 'orphan' });
    await expect(recordEvent(redis, ev('engaged'))).resolves.toEqual({ outcome: 'orphan' });
  });

  it('a ceiling-refused entry followed by inview is an orphan', async () => {
    const { redis } = setup();
    await expect(handleEntry(redis, { pv: PV2, ceiling: 1 })).resolves.toBe('counted');
    await expect(handleEntry(redis, { ceiling: 1 })).resolves.toBe('ceiling');
    await expect(recordEvent(redis, ev('inview'))).resolves.toEqual({ outcome: 'orphan' });
    await expect(recordEvent(redis, ev('inview', PV2))).resolves.toMatchObject({ outcome: 'counted' });
  });

  it('a claimed entry that never got counted (a crash) leaves its later events orphans', async () => {
    const { redis } = setup();
    await claimEntry(redis, claimInput());
    await expect(recordEvent(redis, ev('inview'))).resolves.toEqual({ outcome: 'orphan' });
    // A pending claim with arm '-' can never satisfy the arm check, whatever the batch arm.
    await expect(recordEvent(redis, { ...ev('inview'), arm: '-' as 'a' })).resolves.toEqual({ outcome: 'orphan' });
    expect(redis.entries().map((e) => e.key)).toEqual([keys.claim(NS, PV, 'entry')]);
  });

  it('the promoted claim holds the arm and keeps its original PEXPIRETIME', async () => {
    const { redis, at } = setup();
    at(0);
    await claimEntry(redis, claimInput());
    at(10);
    await expect(countEntry(redis, { ns: NS, pv: PV, arm: 'b', day: DAY })).resolves.toEqual({
      outcome: 'counted',
      arm: 'b',
      total: 1,
      dayTotal: 1,
    });
    await expect(redis.command(['GET', keys.claim(NS, PV, 'entry')])).resolves.toBe('b');
    await expect(redis.command(['PEXPIRETIME', keys.claim(NS, PV, 'entry')])).resolves.toBe(1_800_000);
    at(20);
    await expect(recordEvent(redis, { ...ev('inview'), arm: 'b' })).resolves.toMatchObject({ outcome: 'counted' });
  });

  it('countEntry counts and promotes in one transaction', async () => {
    const { redis } = setup();
    await claimEntry(redis, claimInput());
    const transaction = vi.spyOn(redis, 'transaction');
    const command = vi.spyOn(redis, 'command');
    await countEntry(redis, { ns: NS, pv: PV, arm: 'a', day: DAY });
    expect(transaction).toHaveBeenCalledWith([
      ['HINCRBY', keys.counters(NS), 't:a:entry', 1],
      ['HINCRBY', keys.counters(NS), `d:${DAY}:a:entry`, 1],
      ['SET', keys.claim(NS, PV, 'entry'), 'a', 'XX', 'KEEPTTL'],
    ]);
    expect(command).not.toHaveBeenCalled();
  });

  it('an unexpected reply to the claim throws RedisUnavailable', async () => {
    const r = { command: async () => 'QUEUED', pipeline: async () => [], transaction: async () => [] };
    await expect(claimEntry(r, claimInput())).rejects.toBeInstanceOf(RedisUnavailable);
  });
});

describe('readCounters', () => {
  it('returns the day rows ascending and the totals, and the day sums equal the totals', async () => {
    const { redis } = setup();
    let n = 0;
    const view = async (arm: 'a' | 'b', day: string, types: EventType[]) => {
      const pv = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
      for (const type of ['entry' as const, ...types]) await recordEvent(redis, ev(type, pv, arm, day));
    };
    await view('b', '2026-11-21', ['inview', 'card']);
    await view('a', '2026-11-20', ['inview']);
    await view('a', '2026-11-21', ['engaged', 'cv']);
    await view('b', '2026-11-20', ['inview', 'secondary', 'contact']);
    await recordRejection(redis, { ns: NS, reason: 'bot', day: '2026-11-20' });
    await recordRejection(redis, { ns: NS, reason: 'bot', day: '2026-11-21' });
    await recordRejection(redis, { ns: NS, reason: 'not_entry', day: '2026-11-21' });

    const rows = await readCounters(redis, NS);
    expect(rows.days.map((d) => d.day)).toEqual(['2026-11-20', '2026-11-21']);
    expect(rows.totals.a.entry).toBe(2);
    expect(rows.totals.b).toEqual({ entry: 2, inview: 2, engaged: 0, card: 1, secondary: 1, cv: 0, contact: 1 });
    for (const arm of ['a', 'b'] as const) {
      for (const type of EVENT_TYPES) {
        expect(rows.days.reduce((s, d) => s + d[arm][type], 0)).toBe(rows.totals[arm][type]);
      }
    }
    expect(rows.rejections.bot).toBe(2);
    expect(rows.rejectionsByDay).toEqual({ '2026-11-20': { bot: 1 }, '2026-11-21': { bot: 1, not_entry: 1 } });
  });

  it('rejections has every reason, 0 when unset; an empty namespace reads as zeros', async () => {
    const { redis } = setup();
    const rows = await readCounters(redis, NS);
    expect(Object.keys(rows.rejections).sort()).toEqual([...REJECT_REASONS].sort());
    expect(Object.values(rows.rejections).every((v) => v === 0)).toBe(true);
    expect(rows.days).toEqual([]);
    expect(rows.rejectionsByDay).toEqual({});
    expect(Object.values(rows.totals.a).every((v) => v === 0)).toBe(true);
  });

  it.each(['x', '-1', '1.5', '', '01', '1e3', '9007199254740993'])('a counter holding %j throws CorruptCounters', async (value) => {
    const r = { command: async () => ['t:a:entry', value], pipeline: async () => [], transaction: async () => [] };
    await expect(readCounters(r, NS)).rejects.toBeInstanceOf(CorruptCounters);
  });

  it.each([
    ['not an array', { a: 1 }],
    ['an odd-length array', ['t:a:entry']],
    ['a non-string field', [1, '1']],
  ])('a reply that is %s throws CorruptCounters', async (_name, reply) => {
    const r = { command: async () => reply, pipeline: async () => [], transaction: async () => [] };
    await expect(readCounters(r, NS)).rejects.toBeInstanceOf(CorruptCounters);
  });

  it('an unknown field is ignored', async () => {
    const { redis } = setup();
    await redis.command(['HINCRBY', keys.counters(NS), 't:a:entry', 3]);
    await redis.command(['HINCRBY', keys.counters(NS), 'weird:field', 9]);
    await redis.command(['HINCRBY', keys.counters(NS), 't:c:entry', 9]);
    const rows = await readCounters(redis, NS);
    expect(rows.totals.a.entry).toBe(3);
  });
});

describe('rateLimit', () => {
  const HASH = createHmac('sha256', 'test-hmac-key').update('203.0.113.7').digest('hex');
  const input = (minute: number) => ({ bucketHash: HASH, minute, limit: 30, ttlSeconds: 120 });

  async function everyRateKeyHasAShortTtl(redis: ReturnType<typeof createMemoryRedis>) {
    const rateKeys = redis.entries().filter((e) => e.key.startsWith('exp:rl:'));
    expect(rateKeys.length).toBeGreaterThan(0);
    for (const e of rateKeys) {
      const pttl = (await redis.command(['PTTL', e.key])) as number;
      expect(pttl).toBeGreaterThanOrEqual(1);
      expect(pttl).toBeLessThanOrEqual(120_000);
    }
  }

  it('calls 1 to 30 are ok, 31 is limited-first, 32 limited; a new minute resets; every rate key has a TTL', async () => {
    const { redis, at } = setup();
    for (let i = 1; i <= 30; i++) {
      at(i);
      await expect(rateLimit(redis, input(1))).resolves.toBe('ok');
      await everyRateKeyHasAShortTtl(redis);
    }
    await expect(rateLimit(redis, input(1))).resolves.toBe('limited-first');
    await everyRateKeyHasAShortTtl(redis);
    await expect(rateLimit(redis, input(1))).resolves.toBe('limited');
    await everyRateKeyHasAShortTtl(redis);
    at(60);
    await expect(rateLimit(redis, input(2))).resolves.toBe('ok');
    await everyRateKeyHasAShortTtl(redis);
  });

  it('runs INCR and EXPIRE NX in one transaction (atomic), never as separate commands', async () => {
    const { redis } = setup();
    const transaction = vi.spyOn(redis, 'transaction');
    const command = vi.spyOn(redis, 'command');
    const pipeline = vi.spyOn(redis, 'pipeline');
    await rateLimit(redis, input(1));
    expect(transaction).toHaveBeenCalledWith([
      ['INCR', keys.rate(HASH, 1)],
      ['EXPIRE', keys.rate(HASH, 1), 120, 'NX'],
    ]);
    expect(command).not.toHaveBeenCalled();
    expect(pipeline).not.toHaveBeenCalled();
  });

  it('refuses a raw address bucket at run time (and at the type level)', async () => {
    const { redis } = setup();
    for (const ip of ['203.0.113.7', '2001:db8:1:2::1']) {
      const bucket = ipBucket(ip)!;
      // @ts-expect-error an IpBucket is the raw address; rateLimit takes its HMAC
      await expect(rateLimit(redis, { ...input(1), bucketHash: bucket })).rejects.toBeInstanceOf(TypeError);
    }
    await expect(rateLimit(redis, { ...input(1), bucketHash: 'local' })).rejects.toBeInstanceOf(TypeError);
    expect(redis.entries()).toEqual([]);
  });

  it('after a rate-limited request, no key, field or value in the store contains the address', async () => {
    const { redis } = setup();
    const ips = ['203.0.113.7', '2001:db8:1:2::1'];
    for (const ip of ips) {
      const bucketHash = createHmac('sha256', 'test-hmac-key').update(ipBucket(ip)!).digest('hex');
      let outcome = 'ok';
      while (outcome !== 'limited-first') outcome = await rateLimit(redis, { bucketHash, minute: 1, limit: 30, ttlSeconds: 120 });
      await recordRejection(redis, { ns: NS, reason: 'rate_limited', day: DAY });
    }
    const dump = JSON.stringify(redis.entries());
    for (const ip of ips) {
      expect(dump).not.toContain(ip);
      expect(dump).not.toContain(ipBucket(ip)!);
    }
    expect(dump).not.toContain('2001:db8');
    expect(dump).not.toContain('203.0.113');
  });
});

describe('countDailyEntry', () => {
  it('with ceiling 3 gives ok, ok, ok, ceiling-first, ceiling, and the day key expires after 2 days', async () => {
    const { redis } = setup();
    const out = [];
    for (let i = 0; i < 5; i++) out.push(await countDailyEntry(redis, { ns: NS, day: DAY, ceiling: 3 }));
    expect(out).toEqual(['ok', 'ok', 'ok', 'ceiling-first', 'ceiling']);
    await expect(redis.command(['PTTL', keys.ceiling(NS, DAY)])).resolves.toBe(172_800_000);
  });

  it('a new day starts at 0', async () => {
    const { redis } = setup();
    await countDailyEntry(redis, { ns: NS, day: DAY, ceiling: 1 });
    await expect(countDailyEntry(redis, { ns: NS, day: DAY, ceiling: 1 })).resolves.toBe('ceiling-first');
    await expect(countDailyEntry(redis, { ns: NS, day: '2026-11-21', ceiling: 1 })).resolves.toBe('ok');
  });
});

describe('recordRejection', () => {
  it('increments the total and the day field', async () => {
    const { redis } = setup();
    await recordRejection(redis, { ns: NS, reason: 'ceiling', day: DAY });
    await recordRejection(redis, { ns: NS, reason: 'ceiling', day: DAY });
    await expect(redis.command(['HGETALL', keys.counters(NS)])).resolves.toEqual(['r:ceiling', '2', `rd:${DAY}:ceiling`, '2']);
  });
});

describe('the closed marker', () => {
  it('writeClosed succeeds once with no expiry, and readClosed returns the marker', async () => {
    const { redis } = setup();
    await expect(readClosed(redis, NS)).resolves.toBeNull();
    await expect(writeClosed(redis, NS, { kind: 'decision', day: DAY })).resolves.toBe(true);
    await expect(writeClosed(redis, NS, { kind: 'aa-failed', day: '2026-11-21' })).resolves.toBe(false);
    await expect(readClosed(redis, NS)).resolves.toEqual({ kind: 'decision', day: DAY });
    await expect(redis.command(['PTTL', keys.closed(NS)])).resolves.toBe(-1);
  });

  it('reads a held marker (an A/B stopped at a data fault)', async () => {
    const { redis } = setup();
    await expect(writeClosed(redis, NS, { kind: 'held', day: DAY })).resolves.toBe(true);
    await expect(readClosed(redis, NS)).resolves.toEqual({ kind: 'held', day: DAY });
  });

  it('writeClosed throws RedisUnavailable on a reply that is neither OK nor null', async () => {
    for (const reply of ['QUEUED', 1, undefined, { result: 'OK' }]) {
      const r = { command: async () => reply, pipeline: async () => [], transaction: async () => [] };
      await expect(writeClosed(r, NS, { kind: 'decision', day: DAY })).rejects.toBeInstanceOf(RedisUnavailable);
    }
  });

  it.each(['not json', '{"kind":"other","day":"2026-11-20"}', '{"kind":"decision","day":"20.11"}', '[]'])(
    'a malformed marker %j throws CorruptCounters (fail closed: never read as "open")',
    async (value) => {
      const { redis } = setup();
      await redis.command(['SET', keys.closed(NS), value]);
      await expect(readClosed(redis, NS)).rejects.toBeInstanceOf(CorruptCounters);
    },
  );
});

describe('readView and recordLater (one snapshot read per batch)', () => {
  it('readView reads the closed marker and every claim of the view in one MGET', async () => {
    const { redis } = setup();
    await recordEvent(redis, ev('entry'));
    await recordEvent(redis, ev('inview'));
    const command = vi.spyOn(redis, 'command');
    const pipeline = vi.spyOn(redis, 'pipeline');
    const view = await readView(redis, { ns: NS, pv: PV, closed: true, expiry: false });
    expect(view).toEqual({ closed: null, claims: { entry: 'a', inview: 'a' }, entryExpiry: null });
    expect(command).toHaveBeenCalledTimes(1);
    expect(command.mock.calls[0]![0]).toEqual(['MGET', keys.closed(NS), ...EVENT_TYPES.map((t) => keys.claim(NS, PV, t))]);
    expect(pipeline).not.toHaveBeenCalled();
  });

  it('readView with expiry adds PEXPIRETIME of the entry claim in the same pipeline', async () => {
    const { redis } = setup();
    await recordEvent(redis, ev('entry'));
    const pipeline = vi.spyOn(redis, 'pipeline');
    await expect(readView(redis, { ns: NS, pv: PV, closed: false, expiry: true })).resolves.toEqual({
      closed: null,
      claims: { entry: 'a' },
      entryExpiry: 1_800_000,
    });
    expect(pipeline).toHaveBeenCalledTimes(1);
    expect(pipeline.mock.calls[0]![0]).toHaveLength(2);
  });

  it('readView parses the closed marker and fails closed on a corrupt one', async () => {
    const { redis } = setup();
    await writeClosed(redis, NS, { kind: 'decision', day: DAY });
    await expect(readView(redis, { ns: NS, pv: PV, closed: true, expiry: false })).resolves.toMatchObject({ closed: { kind: 'decision', day: DAY } });
    const other = setup().redis;
    await other.command(['SET', keys.closed(NS), 'open']);
    await expect(readView(other, { ns: NS, pv: PV, closed: true, expiry: false })).rejects.toBeInstanceOf(CorruptCounters);
  });

  it('recordLater counts a batch in order: claims in one pipeline, counts in one transaction', async () => {
    const { redis } = setup();
    await recordEvent(redis, ev('entry'));
    const view = await readView(redis, { ns: NS, pv: PV, closed: false, expiry: true });
    const pipeline = vi.spyOn(redis, 'pipeline');
    const transaction = vi.spyOn(redis, 'transaction');
    const results = await recordLater(redis, { ns: NS, pv: PV, arm: 'a', day: DAY, view, items: ['inview', 'card', 'cv'] });
    expect(results).toEqual([
      { type: 'inview', result: { outcome: 'counted', arm: 'a', total: 1, dayTotal: 1 } },
      { type: 'card', result: { outcome: 'counted', arm: 'a', total: 1, dayTotal: 1 } },
      { type: 'cv', result: { outcome: 'counted', arm: 'a', total: 1, dayTotal: 1 } },
    ]);
    expect(pipeline).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    // Two HINCRBY per item, plus the inview claim's promotion from '-' to the arm.
    expect(transaction.mock.calls[0]![0]).toHaveLength(7);
    expect(transaction.mock.calls[0]![0]).toContainEqual(['SET', keys.claim(NS, PV, 'inview'), 'a', 'XX', 'KEEPTTL']);
    expect(pipeline.mock.calls[0]![0]).toContainEqual(['SET', keys.claim(NS, PV, 'inview'), '-', 'NX', 'PXAT', 1_800_000]);
    expect(pipeline.mock.calls[0]![0]).toContainEqual(['SET', keys.claim(NS, PV, 'card'), 'a', 'NX', 'PXAT', 1_800_000]);
  });

  it('a pending inview claim (claimed, never counted) is not a prerequisite: card is an orphan', async () => {
    const { redis } = setup();
    await recordEvent(redis, ev('entry'));
    await redis.command(['SET', keys.claim(NS, PV, 'inview'), '-', 'NX', 'EX', 100]);
    const view = await readView(redis, { ns: NS, pv: PV, closed: false, expiry: true });
    const results = await recordLater(redis, { ns: NS, pv: PV, arm: 'a', day: DAY, view, items: ['inview', 'card'] });
    expect(results.map((r) => [r.type, r.result.outcome])).toEqual([
      ['inview', 'duplicate'],
      ['card', 'orphan'],
    ]);
  });

  it('an in-batch prerequisite whose claim is taken by another request makes its dependents orphans', async () => {
    const { redis } = setup();
    await recordEvent(redis, ev('entry'));
    const view = await readView(redis, { ns: NS, pv: PV, closed: false, expiry: true });
    // A concurrent request claims inview after this snapshot and has not counted it yet.
    await redis.command(['SET', keys.claim(NS, PV, 'inview'), '-', 'NX', 'EX', 100]);
    const results = await recordLater(redis, { ns: NS, pv: PV, arm: 'a', day: DAY, view, items: ['inview', 'card'] });
    expect(results.map((r) => [r.type, r.result.outcome])).toEqual([
      ['inview', 'duplicate'],
      ['card', 'orphan'],
    ]);
    expect((await redis.command(['HGETALL', keys.counters(NS)])) as string[]).not.toContain('t:a:card');
  });

  it('an item whose prerequisite is neither claimed nor earlier in the batch is an orphan and writes nothing', async () => {
    const { redis } = setup();
    await recordEvent(redis, ev('entry'));
    const view = await readView(redis, { ns: NS, pv: PV, closed: false, expiry: true });
    const results = await recordLater(redis, { ns: NS, pv: PV, arm: 'a', day: DAY, view, items: ['card', 'engaged'] });
    expect(results.map((r) => [r.type, r.result.outcome])).toEqual([
      ['card', 'orphan'],
      ['engaged', 'counted'],
    ]);
    expect(redis.entries().some((e) => e.key === keys.claim(NS, PV, 'card'))).toBe(false);
  });

  it('an item already claimed in the snapshot is a duplicate without a write', async () => {
    const { redis } = setup();
    await recordEvent(redis, ev('entry'));
    await recordEvent(redis, ev('inview'));
    const view = await readView(redis, { ns: NS, pv: PV, closed: false, expiry: true });
    const pipeline = vi.spyOn(redis, 'pipeline');
    const results = await recordLater(redis, { ns: NS, pv: PV, arm: 'a', day: DAY, view, items: ['inview'] });
    expect(results).toEqual([{ type: 'inview', result: { outcome: 'duplicate' } }]);
    expect(pipeline).not.toHaveBeenCalled();
  });

  it('a pending, missing, foreign or expiry-less entry claim makes every item an orphan', async () => {
    for (const claims of [{}, { entry: '-' }, { entry: 'b' }] as const) {
      const { redis } = setup();
      const results = await recordLater(redis, {
        ns: NS, pv: PV, arm: 'a', day: DAY, view: { closed: null, claims, entryExpiry: 1_800_000 }, items: ['inview'],
      });
      expect(results).toEqual([{ type: 'inview', result: { outcome: 'orphan' } }]);
      expect(redis.entries()).toEqual([]);
    }
    const { redis } = setup();
    for (const entryExpiry of [null, -1, -2]) {
      const results = await recordLater(redis, {
        ns: NS, pv: PV, arm: 'a', day: DAY, view: { closed: null, claims: { entry: 'a' }, entryExpiry }, items: ['inview'],
      });
      expect(results).toEqual([{ type: 'inview', result: { outcome: 'orphan' } }]);
    }
  });

  it('countEntry with expiry returns the entry claim’s absolute expiry in the same transaction', async () => {
    const { redis } = setup();
    await claimEntry(redis, { ns: NS, pv: PV, ttlSeconds: TTL });
    const transaction = vi.spyOn(redis, 'transaction');
    await expect(countEntry(redis, { ns: NS, pv: PV, arm: 'a', day: DAY, withExpiry: true })).resolves.toEqual({
      outcome: 'counted', arm: 'a', total: 1, dayTotal: 1, expiresAt: 1_800_000,
    });
    expect(transaction.mock.calls[0]![0]).toHaveLength(4);
  });
});

describe('countDailyEntryN', () => {
  it('gives the day count across groups with the verdict', async () => {
    const { redis } = setup();
    await expect(countDailyEntryN(redis, { ns: NS, day: DAY, ceiling: 1 })).resolves.toEqual({ verdict: 'ok', n: 1 });
    await expect(countDailyEntryN(redis, { ns: NS, day: DAY, ceiling: 1 })).resolves.toEqual({ verdict: 'ceiling-first', n: 2 });
    await expect(countDailyEntryN(redis, { ns: NS, day: DAY, ceiling: 1 })).resolves.toEqual({ verdict: 'ceiling', n: 3 });
  });
});
