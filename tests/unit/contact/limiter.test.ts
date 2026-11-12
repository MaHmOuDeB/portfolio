// The contact form's limit: five messages an hour per address, counted under a keyed hash that lives
// only in memory, and dropped once its hour is over.
import { createHash } from 'node:crypto';
import { createContactLimiter } from '@/lib/contact/limiter';

function clock(start = 1_700_000_000_000) {
  let t = start;
  const tasks: { at: number; run: () => void }[] = [];
  return {
    now: () => t,
    schedule: (run: () => void, ms: number) => {
      tasks.push({ at: t + ms, run });
    },
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
    for (let i = 0; i < 5; i++) expect(limiter.take('203.0.113.7'), `message ${i + 1}`).toBe(true);
    expect(limiter.take('203.0.113.7')).toBe(false);
    // Another address has its own count.
    expect(limiter.take('203.0.113.8')).toBe(true);
  });

  it('counts a sliding hour: the oldest message frees a place once its hour has passed', () => {
    const c = clock();
    const limiter = createContactLimiter({ now: c.now, schedule: c.schedule });
    for (let i = 0; i < 5; i++) {
      expect(limiter.take('203.0.113.7')).toBe(true);
      c.advance(60_000);
    }
    expect(limiter.take('203.0.113.7')).toBe(false);
    c.advance(HOUR - 5 * 60_000);
    expect(limiter.take('203.0.113.7')).toBe(true);
    expect(limiter.take('203.0.113.7')).toBe(false);
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
    for (let i = 0; i < 5; i++) expect(limiter.take(`2001:db8:1:2::${i + 1}`)).toBe(true);
    expect(limiter.take('2001:db8:1:2:ffff::9')).toBe(false);
    expect(limiter.take('2001:db8:1:3::1')).toBe(true);
    expect(limiter.keys()).toHaveLength(2);
  });

  it('counts requests without a readable address together, so they are limited too', () => {
    const c = clock();
    const limiter = createContactLimiter({ now: c.now, schedule: c.schedule });
    for (let i = 0; i < 5; i++) expect(limiter.take(null)).toBe(true);
    expect(limiter.take('not an address')).toBe(false);
  });

  it('draws its key with crypto.randomBytes(32), in memory', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/lib/contact/limiter.ts', 'utf8');
    expect(source).toMatch(/randomBytes\(32\)/);
    expect(source).toMatch(/createHmac\('sha256'/);
    expect(source).not.toMatch(/RATELIMIT_HMAC_KEY|ratelimitHmacKey|console\.|process\.env/);
  });
});
