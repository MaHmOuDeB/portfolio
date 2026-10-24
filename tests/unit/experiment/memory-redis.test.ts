import { createMemoryRedis } from '@/lib/experiment/memory-redis';
import { RedisUnavailable } from '@/lib/experiment/redis-rest';

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, set: (ms: number) => (t = ms), advance: (ms: number) => (t += ms) };
}

describe('createMemoryRedis', () => {
  it('SET NX returns OK, then null; GET reads the value', async () => {
    const r = createMemoryRedis();
    await expect(r.command(['SET', 'k', 'a', 'NX'])).resolves.toBe('OK');
    await expect(r.command(['SET', 'k', 'b', 'NX'])).resolves.toBeNull();
    await expect(r.command(['GET', 'k'])).resolves.toBe('a');
    await expect(r.command(['GET', 'missing'])).resolves.toBeNull();
  });

  it('command names and options are case-insensitive, and numbers are stored as strings', async () => {
    const r = createMemoryRedis();
    await expect(r.command(['set', 'k', 7, 'nx', 'ex', 10])).resolves.toBe('OK');
    await expect(r.command(['get', 'k'])).resolves.toBe('7');
  });

  it('EX expires when the clock passes it', async () => {
    const c = clock();
    const r = createMemoryRedis({ now: c.now });
    await r.command(['SET', 'k', 'a', 'NX', 'EX', 1800]);
    await expect(r.command(['PTTL', 'k'])).resolves.toBe(1_800_000);
    c.advance(1_799_999);
    await expect(r.command(['GET', 'k'])).resolves.toBe('a');
    c.advance(1);
    await expect(r.command(['GET', 'k'])).resolves.toBeNull();
    await expect(r.command(['SET', 'k', 'b', 'NX'])).resolves.toBe('OK');
  });

  it('PXAT expires at the absolute time', async () => {
    const c = clock();
    const r = createMemoryRedis({ now: c.now });
    await r.command(['SET', 'k', 'a', 'NX', 'PXAT', 1_000_500]);
    await expect(r.command(['PEXPIRETIME', 'k'])).resolves.toBe(1_000_500);
    c.set(1_000_499);
    await expect(r.command(['GET', 'k'])).resolves.toBe('a');
    c.set(1_000_500);
    await expect(r.command(['GET', 'k'])).resolves.toBeNull();
  });

  it('a PXAT in the past stores nothing that can be read', async () => {
    const r = createMemoryRedis({ now: () => 5000 });
    await expect(r.command(['SET', 'k', 'a', 'PXAT', 4000])).resolves.toBe('OK');
    await expect(r.command(['GET', 'k'])).resolves.toBeNull();
    expect(r.entries()).toEqual([]);
  });

  it('SET XX writes only an existing key, and KEEPTTL keeps its expiry', async () => {
    const c = clock(0);
    const r = createMemoryRedis({ now: c.now });
    await expect(r.command(['SET', 'k', 'b', 'XX', 'KEEPTTL'])).resolves.toBeNull();
    await expect(r.command(['GET', 'k'])).resolves.toBeNull();
    await r.command(['SET', 'k', '-', 'NX', 'EX', 1800]);
    c.advance(10_000);
    await expect(r.command(['SET', 'k', 'a', 'XX', 'KEEPTTL'])).resolves.toBe('OK');
    await expect(r.command(['GET', 'k'])).resolves.toBe('a');
    await expect(r.command(['PEXPIRETIME', 'k'])).resolves.toBe(1_800_000);
    await expect(r.command(['SET', 'k', 'c', 'XX'])).resolves.toBe('OK');
    await expect(r.command(['PEXPIRETIME', 'k'])).resolves.toBe(-1);
  });

  it('SET NX with XX, or KEEPTTL with an expiry, is a syntax error', async () => {
    const r = createMemoryRedis();
    await expect(r.command(['SET', 'k', 'a', 'NX', 'XX'])).rejects.toBeInstanceOf(RedisUnavailable);
    await expect(r.command(['SET', 'k', 'a', 'KEEPTTL', 'EX', 1])).rejects.toBeInstanceOf(RedisUnavailable);
    await expect(r.command(['SET', 'k', 'a', 'PXAT', 99_999_999_999, 'KEEPTTL'])).rejects.toBeInstanceOf(RedisUnavailable);
  });

  it('SET with both EX and PXAT, or a non-positive expiry, is a syntax error', async () => {
    const r = createMemoryRedis();
    await expect(r.command(['SET', 'k', 'a', 'EX', 1, 'PXAT', 2])).rejects.toBeInstanceOf(RedisUnavailable);
    await expect(r.command(['SET', 'k', 'a', 'EX', 0])).rejects.toBeInstanceOf(RedisUnavailable);
    await expect(r.command(['SET', 'k', 'a', 'EX', 'x'])).rejects.toBeInstanceOf(RedisUnavailable);
  });

  it('EXPIRE NX keeps the first TTL', async () => {
    const c = clock();
    const r = createMemoryRedis({ now: c.now });
    await expect(r.command(['INCR', 'n'])).resolves.toBe(1);
    await expect(r.command(['PTTL', 'n'])).resolves.toBe(-1);
    await expect(r.command(['EXPIRE', 'n', 120, 'NX'])).resolves.toBe(1);
    c.advance(30_000);
    await expect(r.command(['INCR', 'n'])).resolves.toBe(2);
    await expect(r.command(['EXPIRE', 'n', 120, 'NX'])).resolves.toBe(0);
    await expect(r.command(['PTTL', 'n'])).resolves.toBe(90_000);
    await expect(r.command(['EXPIRE', 'missing', 120, 'NX'])).resolves.toBe(0);
  });

  it('PEXPIRETIME returns the absolute ms, -1 without an expiry, or -2 for a missing key', async () => {
    const r = createMemoryRedis({ now: () => 2000 });
    await r.command(['SET', 'k', 'a', 'EX', 10]);
    await r.command(['SET', 'p', 'a']);
    await expect(r.command(['PEXPIRETIME', 'k'])).resolves.toBe(12_000);
    await expect(r.command(['PEXPIRETIME', 'p'])).resolves.toBe(-1);
    await expect(r.command(['PEXPIRETIME', 'missing'])).resolves.toBe(-2);
    await expect(r.command(['PTTL', 'missing'])).resolves.toBe(-2);
  });

  it('MGET returns a value or null per key', async () => {
    const r = createMemoryRedis();
    await r.command(['SET', 'x', 'a']);
    await r.command(['HINCRBY', 'h', 'f', 1]);
    await expect(r.command(['MGET', 'x', 'missing', 'h'])).resolves.toEqual(['a', null, null]);
  });

  it('HINCRBY returns the new value and HGETALL returns a flat array of strings', async () => {
    const r = createMemoryRedis();
    await expect(r.command(['HINCRBY', 'h', 't:a:entry', 1])).resolves.toBe(1);
    await expect(r.command(['HINCRBY', 'h', 't:a:entry', 1])).resolves.toBe(2);
    await expect(r.command(['HINCRBY', 'h', 'r:bot', 5])).resolves.toBe(5);
    await expect(r.command(['HGETALL', 'h'])).resolves.toEqual(['t:a:entry', '2', 'r:bot', '5']);
    await expect(r.command(['HGETALL', 'missing'])).resolves.toEqual([]);
  });

  it('a type mismatch or a non-integer is an error reply', async () => {
    const r = createMemoryRedis();
    await r.command(['SET', 's', 'x']);
    await r.command(['HINCRBY', 'h', 'f', 1]);
    await expect(r.command(['INCR', 's'])).rejects.toBeInstanceOf(RedisUnavailable);
    await expect(r.command(['HGETALL', 's'])).rejects.toBeInstanceOf(RedisUnavailable);
    await expect(r.command(['GET', 'h'])).rejects.toBeInstanceOf(RedisUnavailable);
    await expect(r.command(['HINCRBY', 'h', 'f', '1.5'])).rejects.toBeInstanceOf(RedisUnavailable);
    await expect(r.command(['INCR'])).rejects.toBeInstanceOf(RedisUnavailable);
  });

  it('an unknown command throws, in a command, a pipeline and a transaction', async () => {
    const r = createMemoryRedis();
    await expect(r.command(['DEL', 'k'])).rejects.toThrow(/unsupported command DEL/);
    await expect(r.command(['EVAL', 'return 1', 0])).rejects.toThrow(/unsupported/);
    await expect(r.pipeline([['INCR', 'n'], ['KEYS', '*']])).rejects.toThrow(/unsupported/);
    await expect(r.transaction([['INCR', 'm'], ['FLUSHALL']])).rejects.toThrow(/unsupported/);
    // A transaction with an unknown command applies nothing.
    await expect(r.command(['GET', 'm'])).resolves.toBeNull();
  });

  it('pipeline and transaction return each result in order', async () => {
    const r = createMemoryRedis();
    await expect(
      r.transaction([
        ['INCR', 'n'],
        ['EXPIRE', 'n', 120, 'NX'],
      ]),
    ).resolves.toEqual([1, 1]);
    await expect(
      r.pipeline([
        ['MGET', 'n'],
        ['PEXPIRETIME', 'none'],
      ]),
    ).resolves.toEqual([['1'], -2]);
  });

  it('entries lists the live keys with their values and expiry, for scanning in tests', async () => {
    const c = clock(0);
    const r = createMemoryRedis({ now: c.now });
    await r.command(['SET', 'k', 'a', 'EX', 1]);
    await r.command(['HINCRBY', 'h', 'f', 3]);
    expect(r.entries()).toEqual([
      { key: 'k', value: 'a', expiresAt: 1000 },
      { key: 'h', value: { f: '3' }, expiresAt: null },
    ]);
    c.set(1000);
    expect(r.entries().map((e) => e.key)).toEqual(['h']);
  });
});
