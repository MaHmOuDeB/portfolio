// The contact form's limit: five messages an hour per address and twenty an hour in all, per server
// instance, counted under a keyed hash that lives only in memory, and dropped once its hour is over by
// one sweep timer.
import { createHash } from 'node:crypto';
import { CONTACT_GLOBAL_LIMIT, CONTACT_MAX_ENTRIES, createContactLimiter } from '@/lib/contact/limiter';

function clock(start = 1_700_000_000_000) {
  let t = start;
  const tasks: { at: number; run: () => void }[] = [];
  return {
    now: () => t,
    schedule: (run: () => void, ms: number) => {
      tasks.push({ at: t + ms, run });
    },
    /** Timers scheduled and not yet run. */
    pending: () => tasks.length,
    advance(ms: number) {
      t += ms;
      for (const task of tasks.filter((x) => x.at <= t)) {
        tasks.splice(tasks.indexOf(task), 1);
        task.run();
      }
    },
  };
}

const HOUR = 60 * 60 * 1000;

describe('the contact limiter', () => {
  it('lets five messages an hour through from one address, and refuses the sixth', () => {
    const c = clock();
    const limiter = createContactLimiter({ now: c.now, schedule: c.schedule });
    for (let i = 0; i < 5; i++) expect(limiter.take('203.0.113.7'), `message ${i + 1}`).toBe('ok');
    expect(limiter.take('203.0.113.7')).toBe('address');
    // Another address has its own count.
    expect(limiter.take('203.0.113.8')).toBe('ok');
  });

  it('counts a sliding hour: the oldest message frees a place once its hour has passed', () => {
    const c = clock();
    const limiter = createContactLimiter({ now: c.now, schedule: c.schedule });
    for (let i = 0; i < 5; i++) {
      expect(limiter.take('203.0.113.7')).toBe('ok');
      c.advance(60_000);
    }
    expect(limiter.take('203.0.113.7')).toBe('address');
    c.advance(HOUR - 5 * 60_000);
    expect(limiter.take('203.0.113.7')).toBe('ok');
    expect(limiter.take('203.0.113.7')).toBe('address');
  });

  it('keeps no entry older than an hour, even when no one writes again', () => {
    const c = clock();
    const limiter = createContactLimiter({ now: c.now, schedule: c.schedule });
    limiter.take('203.0.113.7');
    c.advance(30 * 60_000);
    limiter.take('2001:db8::1');
    expect(limiter.size()).toBe(2);
    c.advance(30 * 60_000 - 1);
    expect(limiter.size()).toBe(2);
    c.advance(1);
    expect(limiter.size()).toBe(1);
    c.advance(30 * 60_000);
    expect(limiter.size()).toBe(0);
    expect(limiter.keys()).toEqual([]);
  });

  it('lets twenty messages an hour through in all, whatever the addresses, and counts no refused one', () => {
    expect(CONTACT_GLOBAL_LIMIT).toBe(20);
    const c = clock();
    const limiter = createContactLimiter({ now: c.now, schedule: c.schedule });
    for (let i = 0; i < 20; i++) {
      expect(limiter.take(`2001:db8:${i.toString(16)}::1`), `message ${i + 1}`).toBe('ok');
      c.advance(60_000);
    }
    // A fresh address is refused by the total, and that refusal takes no place in its own count.
    expect(limiter.take('203.0.113.99')).toBe('total');
    expect(limiter.take('203.0.113.99')).toBe('total');
    expect(limiter.size()).toBe(20);
    // Once the first message's hour has passed, one place is free again.
    c.advance(HOUR - 20 * 60_000);
    expect(limiter.take('203.0.113.99')).toBe('ok');
    expect(limiter.take('203.0.113.100')).toBe('total');
  });

  it('holds at most a bounded number of addresses, refusing a new one when full', () => {
    expect(CONTACT_MAX_ENTRIES).toBeGreaterThanOrEqual(CONTACT_GLOBAL_LIMIT);
    const c = clock();
    const limiter = createContactLimiter({ now: c.now, schedule: c.schedule, globalLimit: 1_000, maxEntries: 3 });
    for (let i = 0; i < 3; i++) expect(limiter.take(`203.0.113.${i + 1}`)).toBe('ok');
    expect(limiter.take('203.0.113.4')).toBe('total');
    expect(limiter.size()).toBe(3);
    // An address already held still has its own count.
    expect(limiter.take('203.0.113.1')).toBe('ok');
    c.advance(HOUR);
    expect(limiter.size()).toBe(0);
    expect(limiter.take('203.0.113.4')).toBe('ok');
  });

  it('runs one sweep timer, armed only while it holds an entry, and set for the oldest entry\'s hour', () => {
    const c = clock();
    const limiter = createContactLimiter({ now: c.now, schedule: c.schedule });
    expect(c.pending()).toBe(0);
    for (let i = 0; i < 10; i++) {
      limiter.take(`203.0.113.${i + 1}`);
      c.advance(60_000);
    }
    expect(c.pending()).toBe(1);
    // The first entry goes exactly when its hour is up, and the timer is set again for the next one.
    c.advance(HOUR - 10 * 60_000 - 1);
    expect(limiter.size()).toBe(10);
    c.advance(1);
    expect(limiter.size()).toBe(9);
    expect(c.pending()).toBe(1);
    c.advance(9 * 60_000);
    expect(limiter.size()).toBe(0);
    expect(c.pending()).toBe(0);
    // A refused message arms nothing.
    const full = createContactLimiter({ now: c.now, schedule: c.schedule, globalLimit: 0 });
    expect(full.take('203.0.113.1')).toBe('total');
    expect(c.pending()).toBe(0);
  });

  it('keys the count by an HMAC-SHA-256 of the address under a random per-instance key, never the address or its plain hash', () => {
    const c = clock();
    const a = createContactLimiter({ now: c.now, schedule: c.schedule });
    const b = createContactLimiter({ now: c.now, schedule: c.schedule });
    a.take('203.0.113.7');
    b.take('203.0.113.7');
    const [ka] = a.keys();
    const [kb] = b.keys();
    expect(ka).toMatch(/^[0-9a-f]{64}$/);
    expect(ka).not.toContain('203.0.113.7');
    expect(ka).not.toBe(createHash('sha256').update('203.0.113.7').digest('hex'));
    // Two instances draw two keys.
    expect(ka).not.toBe(kb);
  });

  it('counts an IPv6 address by its /64 network', () => {
    const c = clock();
    const limiter = createContactLimiter({ now: c.now, schedule: c.schedule });
    for (let i = 0; i < 5; i++) expect(limiter.take(`2001:db8:1:2::${i + 1}`)).toBe('ok');
    expect(limiter.take('2001:db8:1:2:ffff::9')).toBe('address');
    expect(limiter.take('2001:db8:1:3::1')).toBe('ok');
    expect(limiter.keys()).toHaveLength(2);
  });

  it('counts requests without a readable address together, so they are limited too', () => {
    const c = clock();
    const limiter = createContactLimiter({ now: c.now, schedule: c.schedule });
    for (let i = 0; i < 5; i++) expect(limiter.take(null)).toBe('ok');
    expect(limiter.take('not an address')).toBe('address');
  });

  it('draws its key with crypto.randomBytes(32), in memory', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/lib/contact/limiter.ts', 'utf8');
    expect(source).toMatch(/randomBytes\(32\)/);
    expect(source).toMatch(/createHmac\('sha256'/);
    expect(source).not.toMatch(/RATELIMIT_HMAC_KEY|ratelimitHmacKey|console\.|process\.env/);
  });
});
