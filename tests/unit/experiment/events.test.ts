import fc from 'fast-check';
import {
  CLIENT_REJECTS,
  EVENT_TYPES,
  MAX_BODY_BYTES,
  MAX_EVENTS,
  PREREQUISITES,
  REJECT_REASONS,
  isNamespace,
  parseBeaconBatch,
  type BeaconBatch,
} from '@/lib/experiment/events';

const PV = '3f2b8c1e-9a4d-4b6f-8e2a-1c5d7f9b0a3e';
const valid = (over: Record<string, unknown> = {}) => ({ v: 1, ns: 'aa-v1', pv: PV, arm: 'a', events: [{ type: 'entry' }], ...over });
const body = (value: unknown) => JSON.stringify(value);

describe('the event vocabulary', () => {
  it('lists the types, the client rejects in attribution order and every reject reason', () => {
    expect(EVENT_TYPES).toEqual(['entry', 'inview', 'engaged', 'card', 'secondary', 'cv', 'contact']);
    expect(CLIENT_REJECTS).toEqual(['bot', 'forced', 'not_entry']);
    expect(REJECT_REASONS).toEqual(['bot', 'internal', 'self', 'forced', 'not_entry', 'rate_limited', 'ceiling']);
    expect(MAX_BODY_BYTES).toBe(1024);
    expect(MAX_EVENTS).toBe(7);
  });

  it('PREREQUISITES is exactly as pre-registered', () => {
    expect(PREREQUISITES).toEqual({
      entry: [],
      inview: ['entry'],
      engaged: ['entry'],
      cv: ['entry'],
      contact: ['entry'],
      card: ['entry', 'inview'],
      secondary: ['entry', 'inview'],
    });
  });
});

describe('isNamespace', () => {
  it('accepts 1 to 32 of a-z, 0-9, dot and hyphen, except rl', () => {
    expect(isNamespace('aa-v1')).toBe(true);
    expect(isNamespace('aa-v1.1')).toBe(true);
    expect(isNamespace('a'.repeat(32))).toBe(true);
    for (const ns of ['', 'a'.repeat(33), 'AA', 'aa:v1', 'aa v1', 'rl']) expect(isNamespace(ns)).toBe(false);
  });
});

describe('parseBeaconBatch', () => {
  it('parses a valid batch of 1 to 7 events', () => {
    for (let n = 1; n <= 7; n += 1) {
      const events = EVENT_TYPES.slice(0, n).map((type) => ({ type }));
      expect(parseBeaconBatch(body(valid({ events })))).toEqual(valid({ events }));
    }
  });

  it('parses an entry carrying a client reject when it is the only item', () => {
    for (const reject of CLIENT_REJECTS) {
      const events = [{ type: 'entry', reject }];
      expect(parseBeaconBatch(body(valid({ arm: 'b', events })))).toEqual(valid({ arm: 'b', events }));
    }
  });

  it('accepts a namespace of 32 characters and the characters a-z, 0-9, dot and hyphen', () => {
    expect(parseBeaconBatch(body(valid({ ns: 'a'.repeat(32) })))).not.toBeNull();
    expect(parseBeaconBatch(body(valid({ ns: 'ab.v1-1.0' })))).not.toBeNull();
  });

  it('rejects a body over 1,024 bytes (JSON whitespace pads an otherwise valid batch)', () => {
    const padded = (len: number) => body(valid()).replace('"aa-v1"', `"aa-v1"${' '.repeat(len)}`);
    const exact = padded(MAX_BODY_BYTES - body(valid()).length);
    expect(new TextEncoder().encode(exact).length).toBe(1024);
    expect(parseBeaconBatch(exact)).toEqual(valid());
    expect(parseBeaconBatch(padded(MAX_BODY_BYTES - body(valid()).length + 1))).toBeNull();
  });

  it.each([
    ['invalid JSON', '{"v":1,'],
    ['an extra key', body(valid({ extra: true }))],
    ['a missing key', body({ v: 1, ns: 'aa-v1', pv: PV, events: [{ type: 'entry' }] })],
    ['v: 2', body(valid({ v: 2 }))],
    ["arm: 'c'", body(valid({ arm: 'c' }))],
    ['an empty events', body(valid({ events: [] }))],
    ['8 events', body(valid({ events: Array.from({ length: 8 }, () => ({ type: 'inview' })) }))],
    ['an unknown type', body(valid({ events: [{ type: 'click' }] }))],
    ['an extra key on an item', body(valid({ events: [{ type: 'entry', at: 1 }] }))],
    ['events that is not an array', body(valid({ events: { type: 'entry' } }))],
    ['an item that is not an object', body(valid({ events: ['entry'] }))],
    ['an uppercase pv', body(valid({ pv: PV.toUpperCase() }))],
    ['a pv that is UUID v1', body(valid({ pv: '3f2b8c1e-9a4d-1b6f-8e2a-1c5d7f9b0a3e' }))],
    ['a pv with a wrong variant', body(valid({ pv: '3f2b8c1e-9a4d-4b6f-7e2a-1c5d7f9b0a3e' }))],
    ['a pv that is not a string', body(valid({ pv: 7 }))],
    ['an empty ns', body(valid({ ns: '' }))],
    ['an ns over 32 characters', body(valid({ ns: 'a'.repeat(33) }))],
    ['an ns with an uppercase letter', body(valid({ ns: 'AA-v1' }))],
    ['an ns with a colon', body(valid({ ns: 'aa:v1' }))],
    ["the ns 'rl', which would share the rate keys' prefix", body(valid({ ns: 'rl' }))],
    ['an entry that is not first', body(valid({ events: [{ type: 'inview' }, { type: 'entry' }] }))],
    ['a repeated type', body(valid({ events: [{ type: 'entry' }, { type: 'inview' }, { type: 'inview' }] }))],
    ['a repeated entry', body(valid({ events: [{ type: 'entry' }, { type: 'entry' }] }))],
    ['reject on a non-entry item', body(valid({ events: [{ type: 'entry' }, { type: 'inview', reject: 'bot' }] }))],
    ['an unknown reject', body(valid({ events: [{ type: 'entry', reject: 'internal' }] }))],
    ['an entry with reject that is not the only item', body(valid({ events: [{ type: 'entry', reject: 'forced' }, { type: 'inview' }] }))],
    ['a JSON array', body([valid()])],
    ['null', 'null'],
    ['a number', '1'],
  ])('rejects %s', (_name, text) => {
    expect(parseBeaconBatch(text)).toBeNull();
  });

  it('returns a fresh object holding only the known fields (property)', () => {
    const batch = fc.record({
      v: fc.constant(1 as const),
      ns: fc.stringMatching(/^[a-z0-9.-]{1,32}$/),
      pv: fc.uuid({ version: 4 }),
      arm: fc.constantFrom('a' as const, 'b' as const),
      // Each type at most once, and an entry, when present, first: the order the sender writes.
      events: fc
        .shuffledSubarray([...EVENT_TYPES], { minLength: 1 })
        .map((types) => [...types].sort((x, y) => Number(y === 'entry') - Number(x === 'entry')).map((type) => ({ type }))),
    });
    fc.assert(
      fc.property(batch, (b: BeaconBatch) => {
        const parsed = parseBeaconBatch(JSON.stringify(b));
        expect(parsed).toEqual(b);
      }),
    );
  });
});
