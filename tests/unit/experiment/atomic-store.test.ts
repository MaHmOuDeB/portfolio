// Atomic store contract. The memory backend is a model, not a Lua interpreter.
import { createMemoryRedis } from '@/lib/experiment/memory-redis';
import { keys } from '@/lib/experiment/keys';
import { RedisUnavailable, type RedisRest } from '@/lib/experiment/redis-rest';
import { reserveAtomicEntry, finalizeAtomicEntry, recordAtomicLater, recordEvent, readView, readCounters } from '@/lib/experiment/store';

const ns = 'atomic-probe';
const pv = '00000000-0000-4000-8000-000000000001';
const day = '2026-11-01';
const owner = '0123456789abcdef0123456789abcdef';
const other = 'fedcba9876543210fedcba9876543210';
const input = { ns, pv, day, owner, arm: 'a' as const, ttlSeconds: 1800 };
function setup() {
  let time = 1_000_000;
  const r = createMemoryRedis({ now: () => time });
  return { r, at: (t: number) => { time = t; } };
}
async function seeded(r: RedisRest, arm: 'a' | 'b' = 'a') {
  await recordEvent(r, { ...input, arm, type: 'entry' });
  return readView(r, { ns, pv, closed: true, expiry: true });
}

// Breaks caught: trusting an elapsed snapshot, unconditional increments, accepting a stolen
// owner, exposing an uncounted prerequisite, or validating corruption after the first write.
describe('atomic view claims', () => {
  for (const arm of ['a', 'b'] as const) for (const type of ['cv', 'inview'] as const) {
    it.each([-1, 0, 1])(`${arm}/${type}: authoritative expiry offset %i`, async offset => {
      const { r, at } = setup(); const view = await seeded(r, arm);
      at(2_800_000 + offset);
      const a = await recordAtomicLater(r, { ...input, arm, view, items: [type] });
      const b = await recordAtomicLater(r, { ...input, arm, view, items: [type] });
      expect([a[0]!.result.outcome, b[0]!.result.outcome]).toEqual(offset < 0 ? ['counted', 'duplicate'] : ['orphan', 'orphan']);
      const rows = await readCounters(r, ns);
      expect(rows.totals[arm][type]).toBe(offset < 0 ? 1 : 0);
      if (offset >= 0) expect(r.entries().some(e => e.key.includes(':pv:'))).toBe(false);
    });
  }
  it('entry finalization at expiry writes no counter', async () => {
    const { r, at } = setup(); await reserveAtomicEntry(r, input); at(2_800_000);
    expect(await finalizeAtomicEntry(r, input)).toEqual({ outcome: 'orphan' });
    expect((await readCounters(r, ns)).totals.a.entry).toBe(0);
  });
  it('the owner must match and can finalize only once', async () => {
    const { r } = setup(); await reserveAtomicEntry(r, input);
    expect(await finalizeAtomicEntry(r, { ...input, owner: other })).toEqual({ outcome: 'duplicate' });
    expect(await finalizeAtomicEntry(r, input)).toMatchObject({ outcome: 'counted', total: 1, dayTotal: 1 });
    expect(await finalizeAtomicEntry(r, input)).toEqual({ outcome: 'duplicate' });
    expect((await readCounters(r, ns)).totals.a.entry).toBe(1);
  });
  it('an old finalizer cannot consume a replacement reservation', async () => {
    const { r, at } = setup(); await reserveAtomicEntry(r, input); at(2_800_001);
    await reserveAtomicEntry(r, { ...input, owner: other });
    expect(await finalizeAtomicEntry(r, input)).toEqual({ outcome: 'duplicate' });
    expect(await finalizeAtomicEntry(r, { ...input, owner: other })).toMatchObject({ outcome: 'counted', total: 1 });
  });
  it('a stale later snapshot cannot attach to a replacement entry deadline', async () => {
    const { r, at } = setup(); const view = await seeded(r); at(2_800_001);
    await recordEvent(r, { ...input, type: 'entry' });
    expect((await recordAtomicLater(r, { ...input, view, items: ['cv'] }))[0]!.result.outcome).toBe('orphan');
  });
  it('pending prerequisites cannot satisfy card even when the supplied snapshot says otherwise', async () => {
    const { r } = setup(); const view = await seeded(r);
    view.claims.inview = 'a';
    await r.command(['SET', keys.claim(ns, pv, 'entry'), `a|${day}|2800000|-00000`, 'XX', 'KEEPTTL']);
    expect((await recordAtomicLater(r, { ...input, view, items: ['card'] }))[0]!.result.outcome).toBe('orphan');
  });
  it('two overlapping ordered batches commit each event once with paired totals', async () => {
    const { r } = setup(); const view = await seeded(r);
    const results = await Promise.all([0, 1].map(() => recordAtomicLater(r, { ...input, view, items: ['inview', 'card', 'secondary'] })));
    expect(results.map(b => b.map(x => x.result.outcome))).toEqual([['counted', 'counted', 'counted'], ['duplicate', 'duplicate', 'duplicate']]);
    const rows = await readCounters(r, ns);
    expect(rows.totals.a).toMatchObject({ entry: 1, inview: 1, card: 1, secondary: 1 });
    expect(rows.days[0]!.a).toEqual(rows.totals.a);
    expect(r.entries().filter(e => e.key.includes(':pv:')).every(e => e.expiresAt === 2_800_000)).toBe(true);
  });
  it('expiry while the atomic request is in transit is refused', async () => {
    const { r, at } = setup(); const view = await seeded(r);
    const delayed: RedisRest = {
      command: async c => { at(2_800_000); return r.command(c); },
      pipeline: async cs => { at(2_800_000); return r.pipeline(cs); },
      transaction: cs => r.transaction(cs),
    };
    expect((await recordAtomicLater(delayed, { ...input, view, items: ['cv'] }))[0]!.result.outcome).toBe('orphan');
  });
  it.each(['x', '-1', '01', '1.5', '9007199254740991', '9007199254740992'])('preflights bad counter %s before any claim mutation', async value => {
    const { r } = setup(); const view = await seeded(r);
    await r.command(['HSET', keys.counters(ns), `d:${day}:a:cv`, value]);
    const before = r.entries();
    await expect(recordAtomicLater(r, { ...input, view, items: ['cv'] })).rejects.toBeInstanceOf(RedisUnavailable);
    expect(r.entries()).toEqual(before);
  });
  it('entry preflight rejects a wrong-type counter before spending its owner', async () => {
    const { r } = setup(); await reserveAtomicEntry(r, input);
    await r.command(['SET', keys.counters(ns), 'corrupt']); const before = r.entries();
    await expect(finalizeAtomicEntry(r, input)).rejects.toBeInstanceOf(RedisUnavailable);
    expect(r.entries()).toEqual(before);
  });
  it('a closed marker written after admission prevents both atomic operations', async () => {
    const { r } = setup(); const view = await seeded(r);
    await r.command(['SET', keys.closed(ns), 'closed']);
    expect((await recordAtomicLater(r, { ...input, view, items: ['cv'] }))[0]!.result.outcome).toBe('orphan');
    await reserveAtomicEntry(r, { ...input, pv: 'another' });
    expect(await finalizeAtomicEntry(r, { ...input, pv: 'another' })).toEqual({ outcome: 'orphan' });
  });
});

describe('atomic preflight and unknown outcomes', () => {
  it.each(['counter', 'closed', 'entry', 'inview', 'engaged', 'card', 'secondary', 'cv', 'contact'])('wrong type at %s is rejected with zero mutation', async name => {
    const { r } = setup(); const view = await seeded(r);
    if (name !== 'entry' && name !== 'closed' && name !== 'counter') {
      await r.command(['SET', keys.claim(ns, pv, 'entry'), 'a', 'XX', 'KEEPTTL']);
    }
    if (name === 'counter') await r.command(['SET', keys.counters(ns), 'wrong']);
    else {
      const key = name === 'closed' ? keys.closed(ns) : keys.claim(ns, pv, name as 'entry');
      // Existing entry is a string; give this invalid key a new hash by using a fresh view.
      if (name === 'entry') {
        const broken = { ...input, pv: 'wrong-entry' };
        await r.command(['HSET', keys.claim(ns, broken.pv, 'entry'), 'f', '1']);
        const before = r.entries();
        await expect(finalizeAtomicEntry(r, broken)).rejects.toBeInstanceOf(RedisUnavailable);
        expect(r.entries()).toEqual(before); return;
      }
      await r.command(['HSET', key, 'f', '1']);
    }
    const before = r.entries();
    await expect(recordAtomicLater(r, { ...input, view, items: ['cv'] })).rejects.toBeInstanceOf(RedisUnavailable);
    expect(r.entries()).toEqual(before);
  });
  for (const commit of ['before', 'after'] as const) {
    it(`entry failure ${commit} counter commit spends owner and never recounts`, async () => {
      let fault = false;
      const r = createMemoryRedis({
        now: () => 1_000_000, atomicCommand: c => {
          if (fault && (commit === 'before' ? c[0] === 'HSET' : c[0] === 'SET' && typeof c[2] === 'string' && /^a\|.*\|[01]+$/.test(c[2]))) { fault = false; throw new Error('injected'); }
        }
      });
      await reserveAtomicEntry(r, input); fault = true;
      await expect(finalizeAtomicEntry(r, input)).rejects.toBeInstanceOf(RedisUnavailable);
      expect(await finalizeAtomicEntry(r, input)).toEqual({ outcome: 'duplicate' });
      const rows = await readCounters(r, ns);
      expect(rows.totals.a.entry).toBe(commit === 'before' ? 0 : 1);
      expect(await r.command(['GET', keys.claim(ns, pv, 'entry')])).toBe('-');
    });
    it(`later failure ${commit} counter commit leaves pending ownership and never recounts`, async () => {
      let fault = false;
      const r = createMemoryRedis({
        now: () => 1_000_000, atomicCommand: c => {
          if (fault && (commit === 'before' ? c[0] === 'HSET' : c[0] === 'SET' && typeof c[2] === 'string' && /^a\|.*\|[01]+$/.test(c[2]))) { fault = false; throw new Error('injected'); }
        }
      });
      const view = await seeded(r); fault = true;
      await expect(recordAtomicLater(r, { ...input, view, items: ['inview', 'card'] })).rejects.toBeInstanceOf(RedisUnavailable);
      const result = await recordAtomicLater(r, { ...input, view, items: ['inview', 'card'] });
      expect(result.map(x => x.result.outcome)).toEqual(['duplicate', 'orphan']);
      const rows = await readCounters(r, ns);
      expect(rows.totals.a.inview).toBe(commit === 'before' ? 0 : 1);
      expect(rows.totals.a.card).toBe(commit === 'before' ? 0 : 1);
      if (commit === 'after') expect(rows.days[0]!.a).toEqual(rows.totals.a);
    });
  }
  it('a lost response can be resent safely without an automatic mutating retry', async () => {
    const { r } = setup(); const view = await seeded(r); let requests = 0;
    const transport: RedisRest = { ...r, command: async c => { requests++; await r.command(c); throw new RedisUnavailable('unknown outcome'); } };
    await expect(recordAtomicLater(transport, { ...input, view, items: ['cv'] })).rejects.toBeInstanceOf(RedisUnavailable);
    expect(requests).toBe(1);
    expect((await recordAtomicLater(r, { ...input, view, items: ['cv'] }))[0]!.result.outcome).toBe('duplicate');
    expect((await readCounters(r, ns)).totals.a.cv).toBe(1);
  });
  it('a counted duplicate prerequisite permits a dependent in a fresh authoritative operation', async () => {
    const { r } = setup(); const view = await seeded(r);
    await recordAtomicLater(r, { ...input, view, items: ['inview'] });
    expect((await recordAtomicLater(r, { ...input, view, items: ['inview', 'card'] })).map(x => x.result.outcome)).toEqual(['duplicate', 'counted']);
  });
  it('an accepted maximum-safe count remains exact and the next attempt is refused before acquiring a claim', async () => {
    const { r } = setup(); const view = await seeded(r);
    await r.command(['HSET', keys.counters(ns), 't:a:cv', '9007199254740990', `d:${day}:a:cv`, '9007199254740990']);
    expect((await recordAtomicLater(r, { ...input, view, items: ['cv'] }))[0]!.result).toMatchObject({ total: 9007199254740991, dayTotal: 9007199254740991 });
    await recordEvent(r, { ...input, pv: 'second', type: 'entry' });
    const second = await readView(r, { ns, pv: 'second', closed: true, expiry: true }); const before = r.entries();
    await expect(recordAtomicLater(r, { ...input, pv: 'second', view: second, items: ['cv'] })).rejects.toBeInstanceOf(RedisUnavailable);
    expect(r.entries()).toEqual(before);
  });
  it('the model refuses unknown or modified Lua bodies instead of interpreting them', async () => {
    const { r } = setup(); const before = r.entries();
    await expect(r.command(['EVAL', 'return 1', 0])).rejects.toThrow(/unsupported/);
    expect(r.entries()).toEqual(before);
  });
});

it('meters internal commands separately from EVAL requests for both arms', async () => {
  for (const arm of ['a', 'b'] as const) {
    const calls: string[] = [];
    const r = createMemoryRedis({ now: () => 1_000_000, atomicCommand: c => calls.push(String(c[0])) });
    await reserveAtomicEntry(r, input);
    await finalizeAtomicEntry(r, { ...input, arm });
    expect(calls).toHaveLength(8); calls.length = 0;
    const view = await readView(r, { ns, pv, closed: true, expiry: true });
    const perBatch: number[] = [];
    for (const items of [['inview'], ['engaged'], ['card', 'secondary', 'cv', 'contact']] as const) {
      calls.length = 0;
      await recordAtomicLater(r, { ...input, arm, view, items: [...items] });
      perBatch.push(calls.length);
    }
    expect(perBatch).toEqual([7, 6, 6]);
  }
});
