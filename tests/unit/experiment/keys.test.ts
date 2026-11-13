import fc from 'fast-check';
import { EXPERIMENT } from '@/experiment.values';
import { EVENT_TYPES, REJECT_REASONS, isNamespace } from '@/lib/experiment/events';
import { fieldName, ipBucket, keys, parseField, type CounterField } from '@/lib/experiment/keys';

/** Every property here runs from this seed, so a failing run can be replayed. */
const PROPERTY_SEED = 20261202;

const PV = '3f2b8c1e-9a4d-4b6f-8e2a-1c5d7f9b0a3e';

describe('keys', () => {
  it('names every Redis key under the namespace', () => {
    expect(keys.counters('aa-v1')).toBe('exp:aa-v1');
    expect(keys.claim('aa-v1', PV, 'card')).toBe(`exp:aa-v1:pv:${PV}:card`);
    expect(keys.rate('0f1e2d', 29_000_000)).toBe('exp:rl:0f1e2d:29000000');
    expect(keys.ceiling('aa-v1', '2026-10-25')).toBe('exp:aa-v1:ceil:2026-10-25');
    expect(keys.closed('aa-v1')).toBe('exp:aa-v1:closed');
  });

  it("the configured namespace is valid and is not 'rl', the rate keys' prefix", () => {
    expect(isNamespace(EXPERIMENT.namespace)).toBe(true);
    expect(EXPERIMENT.namespace).not.toBe('rl');
    expect(keys.counters(EXPERIMENT.namespace).startsWith('exp:rl')).toBe(false);
  });

  it('refuses a raw address bucket as a rate key: the bucket must be hashed first (type check)', () => {
    const bucket = ipBucket('203.0.113.7')!;
    // @ts-expect-error an IpBucket is the raw address; keys.rate takes its HMAC
    expect(keys.rate(bucket, 1)).toBe('exp:rl:203.0.113.7:1');
    expect(keys.rate('0f1e2d' as string, 1)).toBe('exp:rl:0f1e2d:1');
  });
});

describe('fieldName and parseField', () => {
  it.each<[CounterField, string]>([
    [{ kind: 'total', arm: 'a', metric: 'entry' }, 't:a:entry'],
    [{ kind: 'day', day: '2026-10-25', arm: 'b', metric: 'card' }, 'd:2026-10-25:b:card'],
    [{ kind: 'rejection', reason: 'rate_limited' }, 'r:rate_limited'],
    [{ kind: 'rejectionDay', day: '2028-02-29', reason: 'not_entry' }, 'rd:2028-02-29:not_entry'],
  ])('round-trips %j', (field, name) => {
    expect(fieldName(field)).toBe(name);
    expect(parseField(name)).toEqual(field);
  });

  it('round-trips every kind, arm, metric, reason and day (property)', () => {
    const day = fc
      .date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2099-12-31T00:00:00Z'), noInvalidDate: true })
      .map((d) => d.toISOString().slice(0, 10));
    const arm = fc.constantFrom('a' as const, 'b' as const);
    const metric = fc.constantFrom(...EVENT_TYPES);
    const reason = fc.constantFrom(...REJECT_REASONS);
    const field: fc.Arbitrary<CounterField> = fc.oneof(
      fc.record({ kind: fc.constant('total' as const), arm, metric }),
      fc.record({ kind: fc.constant('day' as const), day, arm, metric }),
      fc.record({ kind: fc.constant('rejection' as const), reason }),
      fc.record({ kind: fc.constant('rejectionDay' as const), day, reason }),
    );
    fc.assert(
      fc.property(field, (f) => {
        expect(parseField(fieldName(f))).toEqual(f);
      }),
      { seed: PROPERTY_SEED },
    );
  });

  it.each([
    't:c:entry',
    't:a:clicks',
    't:a',
    't:a:entry:extra',
    'd:2026-13-01:a:entry',
    'd:2026-02-29:a:entry',
    'd:2026-1-01:a:entry',
    'd:2026-10-25:c:entry',
    'r:unknown',
    'r:',
    'rd:2026-10-25:unknown',
    'rd:2026-10-32:bot',
    'x',
    '',
  ])('gives null for %j', (name) => {
    expect(parseField(name)).toBeNull();
  });
});

describe('ipBucket', () => {
  it('uses the pre-registered IPv6 prefix of 64 bits', () => {
    expect(EXPERIMENT.rateLimit.ipv6PrefixBits).toBe(64);
    expect(ipBucket('2001:db8:1:2:3:4:5:6')?.endsWith(`/${EXPERIMENT.rateLimit.ipv6PrefixBits}`)).toBe(true);
  });

  it('keeps an IPv4 address whole', () => {
    expect(ipBucket('203.0.113.7')).toBe('203.0.113.7');
  });

  it('takes the normalised /64 prefix of an IPv6 address', () => {
    expect(ipBucket('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
    expect(ipBucket('2001:db8:1:2:ffff::1')).toBe('2001:db8:1:2::/64');
    expect(ipBucket('2001:0DB8:0001:0002:0:0:0:1')).toBe('2001:db8:1:2::/64');
    expect(ipBucket('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ipBucket('::1')).toBe('0:0:0:0::/64');
    expect(ipBucket('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });

  it('reads an IPv4-mapped IPv6 address as its IPv4 address', () => {
    expect(ipBucket('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(ipBucket('::FFFF:cb00:7107')).toBe('203.0.113.7');
  });

  it.each(['', null, 'x', '203.0.113', '2001:db8:::1', ' 203.0.113.7', '[2001:db8::1]'])('gives null for %j', (ip) => {
    expect(ipBucket(ip)).toBeNull();
  });
});
