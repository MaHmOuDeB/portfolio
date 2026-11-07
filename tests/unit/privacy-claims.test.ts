// What the privacy page says about the code, checked against the code. Each `describe` names the
// sentence it backs. Browser-side claims (no cookies, no storage, no third-party requests on every
// route) are in tests/e2e/privacy-claims.spec.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXPERIMENT, type ExperimentConfig } from '@/experiment.config';
import type { ServerEnv } from '@/lib/env';
import { CLIENT_REJECTS, EVENT_TYPES, parseBeaconBatch } from '@/lib/experiment/events';
import { NO_FLAGS } from '@/lib/experiment/flags';
import { handleEvent, type EventDeps } from '@/lib/experiment/handler';
import { createMemoryRedis } from '@/lib/experiment/memory-redis';

const ROOT = join(import.meta.dirname, '../..');
const CONFIG = { ...EXPERIMENT, calibration: { ...EXPERIMENT.calibration, startedOn: '2026-11-02T00:00:00+01:00' } } as unknown as ExperimentConfig;
const HOST = 'portfolio.example';
const ENV: ServerEnv = { vercelEnv: 'production', fakeStore: false, productionHost: HOST, deploymentHost: 'portfolio-x.vercel.app', ratelimitHmacKey: 'k' };
const IP = '203.0.113.99';
const IPV6 = '2001:db8:aaaa:bbbb:1:2:3:4';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 PrivacyProbe/9.9';
const REFERRER = 'https://referrer.example/some/page?q=secret';
const PV = '12345678-1234-4123-8123-123456789abc';

function setup() {
  let t = Date.parse('2026-11-20T10:00:00Z');
  const redis = createMemoryRedis({ now: () => t });
  const deps: EventDeps = {
    env: ENV,
    write: redis,
    flags: async () => NO_FLAGS,
    now: () => new Date(t),
    log: () => {},
    config: CONFIG,
    ownerCookieValid: () => false,
  };
  const post = (events: string[], ip = IP) =>
    handleEvent(
      new Request(`https://${HOST}/api/e?from=${encodeURIComponent(REFERRER)}`, {
        method: 'POST',
        headers: {
          origin: `https://${HOST}`,
          'sec-fetch-site': 'same-origin',
          'x-forwarded-for': ip,
          'user-agent': UA,
          referer: REFERRER,
          'content-type': 'text/plain',
        },
        body: JSON.stringify({ v: 1, ns: CONFIG.namespace, pv: PV, arm: 'b', events: events.map((type) => ({ type })) }),
      }),
      deps,
    );
  return { redis, post, advance: (ms: number) => (t += ms), now: () => t };
}

describe('"What is stored is only tallies per day. No URL, referrer, IP address or user agent is stored."', () => {
  it('after a full counted view, from IPv4 and IPv6, nothing in the store holds the address, the browser type, a URL or the referrer', async () => {
    const s = setup();
    expect((await s.post(['entry'])).status).toBe(200);
    expect((await s.post(['inview', 'engaged', 'card', 'secondary', 'cv', 'contact'])).status).toBe(200);
    await s.post(['entry'], IPV6);
    const dump = JSON.stringify(s.redis.entries());
    for (const needle of [IP, '203.0.113', '2001:db8', 'aaaa:bbbb', UA, 'PrivacyProbe', 'Mozilla', REFERRER, 'referrer.example', 'secret', HOST, '/api/e']) {
      expect(dump, needle).not.toContain(needle);
    }
  });

  it('long-lived data is only counter fields: totals and per-day tallies by group and event, and rejection reasons', async () => {
    const s = setup();
    await s.post(['entry']);
    await s.post(['inview', 'card']);
    const lasting = s.redis.entries().filter((e) => e.expiresAt === null);
    expect(lasting.map((e) => e.key)).toEqual([`exp:${CONFIG.namespace}`]);
    const fields = Object.keys(lasting[0]!.value as Record<string, string>);
    for (const f of fields) expect(f, f).toMatch(/^(t:[ab]:[a-z]+|d:\d{4}-\d{2}-\d{2}:[ab]:[a-z]+|r:[a-z_]+|rd:\d{4}-\d{2}-\d{2}:[a-z_]+)$/);
  });
});

describe('"The per-view id is deleted from the database at most 30 minutes after your browser first sent it."', () => {
  it('every key that holds the id expires no later than pvTtlSeconds after the entry', async () => {
    const s = setup();
    const sent = s.now();
    await s.post(['entry']);
    s.advance((EXPERIMENT.pvTtlSeconds - 1) * 1000);
    const later = await s.post(['inview', 'card', 'cv']);
    expect(await later.json()).toMatchObject({
      ok: true,
      results: ['inview', 'card', 'cv'].map(type => ({ type, outcome: 'counted' })),
    });
    const withId = s.redis.entries().filter((e) => e.key.includes(PV));
    expect(withId).toHaveLength(1);
    for (const e of withId) {
      expect(e.expiresAt, e.key).not.toBeNull();
      expect(e.expiresAt! - sent, e.key).toBeLessThanOrEqual(EXPERIMENT.pvTtlSeconds * 1000);
    }
    s.advance(1000);
    expect(s.redis.entries().filter(e => e.key.includes(PV))).toEqual([]);
    // No field of the lasting counters names the id.
    expect(JSON.stringify(s.redis.entries().filter((e) => e.expiresAt === null))).not.toContain(PV);
  });
});

describe('"The server turns your IP address into a keyed hash, which is deleted at most 2 minutes after it is made."', () => {
  it('every rate-limit key expires within keyTtlSeconds and holds the hash, never the address', async () => {
    const s = setup();
    const made = s.now();
    await s.post(['entry']);
    await s.post(['entry'], IPV6);
    const rate = s.redis.entries().filter((e) => e.key.startsWith('exp:rl:'));
    expect(rate.length).toBe(2);
    for (const e of rate) {
      expect(e.key).toMatch(/^exp:rl:[0-9a-f]{64}:\d+$/);
      expect(e.expiresAt! - made).toBeLessThanOrEqual(EXPERIMENT.rateLimit.keyTtlSeconds * 1000);
    }
  });

  it('an IPv6 address is bucketed by its network part: two addresses of one /64 share a key', async () => {
    const s = setup();
    await s.post(['entry'], '2001:db8:aaaa:bbbb::1');
    await s.post(['entry'], '2001:db8:aaaa:bbbb::2');
    expect(s.redis.entries().filter((e) => e.key.startsWith('exp:rl:')).length).toBe(1);
  });
});

describe('"The home page\'s script sends a random id made for that view, the group, and which of these happened."', () => {
  it('a message holds exactly the version, the round, the id, the group and the events', () => {
    const batch = { v: 1, ns: 'aa-v1', pv: PV, arm: 'a', events: [{ type: 'entry' }] };
    expect(parseBeaconBatch(JSON.stringify(batch))).not.toBeNull();
    for (const extra of ['url', 'referrer', 'ua', 'ip', 'href', 'path']) {
      expect(parseBeaconBatch(JSON.stringify({ ...batch, [extra]: 'x' })), extra).toBeNull();
    }
    expect(parseBeaconBatch(JSON.stringify({ ...batch, events: [{ type: 'card', href: '/work/x' }] }))).toBeNull();
  });

  it('the events and the reasons a view cannot count are the ones the page lists (update the page with them)', () => {
    // entry: opened from outside the site; inview: the cards came into view; engaged: interacted or
    // stayed; card, secondary, cv, contact: the clicks.
    expect([...EVENT_TYPES]).toEqual(['entry', 'inview', 'engaged', 'card', 'secondary', 'cv', 'contact']);
    // An automated browser, a group chosen through the page address, not a fresh visit from outside.
    expect([...CLIENT_REJECTS]).toEqual(['bot', 'forced', 'not_entry']);
  });
});

describe('"It notices presses of a mouse button or a finger, scrolling, key presses and touches."', () => {
  it('the beacon listens for exactly those interactions (update the page with them)', () => {
    const beacon = readFileSync(join(ROOT, 'src/components/experiment/ExperimentBeacon.tsx'), 'utf8');
    expect(beacon).toContain("const INTERACTIONS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;");
    // The page's own address (?variant=, the navigation entry) and a clicked link's address are read.
    expect(beacon).toMatch(/window\.location\.search/);
    expect(beacon).toMatch(/clickEvents\(target\.href/);
  });
});

describe('"The site\'s functions run in Frankfurt."', () => {
  it('vercel.json pins every function to fra1', () => {
    const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as { regions?: string[] };
    expect(vercel.regions).toEqual(['fra1']);
  });
});

describe('"Nothing on this site comes from a third party." (no analytics, fonts or scripts from elsewhere)', () => {
  it('the font is self-hosted with next/font/local', () => {
    const fonts = readFileSync(join(ROOT, 'src/app/fonts.ts'), 'utf8');
    expect(fonts).toMatch(/next\/font\/local/);
    expect(fonts).not.toMatch(/next\/font\/google/);
  });
});
