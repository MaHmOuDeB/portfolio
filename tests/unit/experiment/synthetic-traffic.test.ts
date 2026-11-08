// Synthetic traffic through the whole server path: the real event handler, the in-memory store and
// the snapshot builder, with a seeded random. Honest traffic must give no split flag and exact
// counts; an attack must be cut off and left out of the analysis.
import { createHmac } from 'node:crypto';
import { EXPERIMENT, type Arm, type ExperimentConfig } from '@/experiment.config';
import type { ServerEnv } from '@/lib/env';
import { assignArm, isBotUserAgent } from '@/lib/experiment/assign';
import { closeIfDecided } from '@/lib/experiment/close';
import { EVENT_TYPES, REJECT_REASONS, type BeaconItem, type EventType, type RejectReason } from '@/lib/experiment/events';
import { NO_FLAGS } from '@/lib/experiment/flags';
import { handleEvent, type EventDeps } from '@/lib/experiment/handler';
import { INTERNAL_MESSAGE } from '@/lib/experiment/internal';
import { createMemoryRedis } from '@/lib/experiment/memory-redis';
import { buildSnapshot, type ExperimentSnapshot } from '@/lib/experiment/snapshot';
import { readCounters } from '@/lib/experiment/store';
import { berlinStartOfDay } from '@/lib/experiment/time';
import { binomial, sfc32, srmTest, type Rng } from '@/lib/stats';
import type { DayCounts, GroupCounts } from '@/lib/experiment/store';

const sdk = vi.hoisted(() => ({ get: vi.fn(async () => undefined) }));
vi.mock('@vercel/edge-config', () => ({ createClient: () => ({ get: sdk.get }) }));

const PRODUCTION_HOST = 'portfolio.example';
const CANONICAL = `https://${PRODUCTION_HOST}`;
const INTERNAL_SECRET = 'test-internal-secret';
const INTERNAL = createHmac('sha256', INTERNAL_SECRET).update(INTERNAL_MESSAGE).digest('hex');
const OWNER_COOKIE = 'owner=1';
const PRODUCTION: ServerEnv = {
  vercelEnv: 'production',
  fakeStore: false,
  productionHost: PRODUCTION_HOST,
  deploymentHost: 'portfolio-abc123.vercel.app',
  ratelimitHmacKey: 'test-ratelimit-key',
  internalTrafficSecret: INTERNAL_SECRET,
};
const BROWSERS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
];
const BOTS = [
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  'curl/8.4.0',
  'python-requests/2.31.0',
];

/** The pre-registered config with a start, and the daily ceiling raised for 500 visits a day. */
function cfg(over: Partial<Record<keyof ExperimentConfig, unknown>>): ExperimentConfig {
  return { ...EXPERIMENT, dailyEntryCeiling: 10_000, ...over } as unknown as ExperimentConfig;
}
const AA = cfg({ calibration: { ...EXPERIMENT.calibration, startedOn: '2026-10-22T00:00:00+02:00' } });
const AB = cfg({
  phase: 'ab',
  namespace: 'ab-v1',
  calibration: { ...EXPERIMENT.calibration, startedOn: '2026-11-02T00:00:00+01:00' },
  ab: { ...EXPERIMENT.ab, startedOn: '2026-12-01T00:00:00+01:00' },
});

type Kind = 'bot' | 'internal' | 'self' | 'forced' | 'not_entry' | 'optout' | 'clean';
const MIX: [Kind, number][] = [
  ['bot', 0.06],
  ['internal', 0.03],
  ['self', 0.02],
  ['forced', 0.04],
  ['not_entry', 0.1],
  ['optout', 0.05],
];

function pick(u: number): Kind {
  let acc = 0;
  for (const [kind, share] of MIX) {
    acc += share;
    if (u < acc) return kind;
  }
  return 'clean';
}

const pvOf = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
/** Half IPv4, half IPv6, each IPv6 visit in its own /64. */
const ipOf = (n: number) =>
  n % 2 === 0 ? `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}` : `2001:db8:${((n >> 16) & 0xffff).toString(16)}:${(n & 0xffff).toString(16)}::1`;
function dayPlus(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

type Tally = { entry: number; inview: number; engaged: number; card: number; secondary: number; pairs: number; reordered: number; orphans: number };
const tally = (): Tally => ({ entry: 0, inview: 0, engaged: 0, card: 0, secondary: 0, pairs: 0, reordered: 0, orphans: 0 });

function harness(config: ExperimentConfig) {
  let t = 0;
  const redis = createMemoryRedis({ now: () => t });
  const deps: EventDeps = {
    env: PRODUCTION,
    write: redis,
    flags: async () => NO_FLAGS,
    now: () => new Date(t),
    log: () => {},
    config,
    ownerCookieValid: (cookie) => cookie === OWNER_COOKIE,
  };
  type Reply = { status: number; json: { ok: boolean; reason?: string; results?: { type: EventType; outcome: string }[] } | null };
  async function post(o: { pv: string; arm: Arm; items: (EventType | BeaconItem)[]; ip: string; ua: string; headers?: Record<string, string> }): Promise<Reply> {
    const body = JSON.stringify({ v: 1, ns: config.namespace, pv: o.pv, arm: o.arm, events: o.items.map((e) => (typeof e === 'string' ? { type: e } : e)) });
    const headers = new Headers({ origin: CANONICAL, 'sec-fetch-site': 'same-origin', 'x-real-ip': o.ip, 'user-agent': o.ua, 'content-type': 'text/plain;charset=UTF-8', ...o.headers });
    const res = await handleEvent(new Request(`${CANONICAL}/api/e`, { method: 'POST', headers, body }), deps);
    const text = await res.text();
    return { status: res.status, json: text === '' ? null : JSON.parse(text) };
  }
  return { redis, post, at: (ms: number) => (t = Math.max(t, ms)), now: () => t };
}

type Run = {
  snapshot: ExperimentSnapshot;
  injected: Record<Kind, number>;
  expected: Record<Arm, Tally>;
  clickBeforeDwell: { inview: string; card: string; secondary: string }[];
  harness: ReturnType<typeof harness>;
};

/**
 * 500 visits a Berlin day for six days. Each visit is assigned by assignArm with the seeded random,
 * gets its own address, and sends what its kind sends.
 */
async function simulate(config: ExperimentConfig, o: { firstDay: string; seed: number; cardRate: Record<Arm, number> }): Promise<Run> {
  const rng: Rng = sfc32(o.seed);
  const h = harness(config);
  const injected = Object.fromEntries([...MIX.map(([k]) => k), 'clean'].map((k) => [k, 0])) as Record<Kind, number>;
  const expected: Record<Arm, Tally> = { a: tally(), b: tally() };
  const clickBeforeDwell: Run['clickBeforeDwell'] = [];
  const DAYS = 6;
  const PER_DAY = 500;
  const spacing = Math.floor((22 * 3_600_000) / PER_DAY);
  let n = 0;
  for (let day = 0; day < DAYS; day += 1) {
    const dayStart = Date.parse(berlinStartOfDay(dayPlus(o.firstDay, day)));
    for (let k = 0; k < PER_DAY; k += 1, n += 1) {
      let t = dayStart + 120_000 + k * spacing;
      h.at(t);
      const kind = pick(rng.uniform());
      injected[kind] += 1;
      const bot = kind === 'bot';
      const ua = bot ? BOTS[n % BOTS.length]! : BROWSERS[n % BROWSERS.length]!;
      const search = new URLSearchParams(kind === 'forced' ? { variant: rng.uniform() < 0.5 ? 'a' : 'b' } : {});
      const { arm } = assignArm({ search, userAgent: ua, random: () => rng.uniform() });
      const pv = pvOf(n);
      const ip = ipOf(n);
      const headers: Record<string, string> = kind === 'internal' ? { 'x-internal': INTERNAL } : kind === 'self' ? { cookie: OWNER_COOKIE } : {};
      /** One batch, and with probability 0.05 the same batch again. */
      const send = async (items: (EventType | BeaconItem)[], afterMs: number) => {
        t += afterMs;
        h.at(t);
        const first = await h.post({ pv, arm, items, ip, ua, headers });
        if (rng.uniform() < 0.05) {
          h.at((t += 100));
          await h.post({ pv, arm, items, ip, ua, headers });
        }
        return first;
      };
      if (kind === 'optout') continue;
      if (kind === 'forced' || kind === 'not_entry') {
        await send([{ type: 'entry', reject: kind }], 0);
        continue;
      }
      if (kind !== 'clean') {
        await send(['entry'], 0);
        continue;
      }
      const e = expected[arm];
      const entry = await send(['entry'], 0);
      expect(entry.json?.results?.[0]?.outcome, 'a clean entry counts').toBe('counted');
      e.entry += 1;
      const x = rng.uniform();
      if (x < 0.1) {
        // A click before the dwell: the beacon sends inview before card, in one batch.
        const r = await send(['inview', 'card', 'secondary'], 400);
        const outcome = (type: EventType) => r.json?.results?.find((i) => i.type === type)?.outcome ?? 'missing';
        clickBeforeDwell.push({ inview: outcome('inview'), card: outcome('card'), secondary: outcome('secondary') });
        e.inview += 1;
        e.card += 1;
        e.secondary += 1;
      } else if (x < 0.6) {
        e.inview += 1;
        if (rng.uniform() < o.cardRate[arm]) {
          e.pairs += 1;
          if (rng.uniform() < 0.03) {
            // The pair arrives reordered, as two single-item posts: the card first, then inview.
            e.reordered += 1;
            const card = await send(['card'], 1500);
            if (card.json?.results?.[0]?.outcome === 'orphan') e.orphans += 1;
            await send(['inview'], 50);
          } else {
            await send(['inview'], 1100);
            await send(['card'], 2000);
            e.card += 1;
          }
        } else {
          await send(['inview'], 1100);
        }
      }
      if (rng.uniform() < 0.7) {
        await send(['engaged'], 5000);
        e.engaged += 1;
      }
    }
  }
  const lastDay = dayPlus(o.firstDay, DAYS - 1);
  const now = new Date(Date.parse(berlinStartOfDay(dayPlus(lastDay, 1))) + 2 * 3_600_000).toISOString();
  h.at(Date.parse(now));
  const counters = await readCounters(h.redis, config.namespace);
  const snapshot = buildSnapshot({ counters, flags: NO_FLAGS, now, start: config.calibration.startedOn!, source: 'store', config });
  return { snapshot, injected, expected, clickBeforeDwell, harness: h };
}

/** |z| of a two-proportion test; the order loss must not depend on the group. */
function twoProportionZ(x1: number, n1: number, x2: number, n2: number): number {
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se === 0 ? 0 : Math.abs(x1 / n1 - x2 / n2) / se;
}

function honestChecks(get: () => Run) {
  const excludedReasons: Partial<Record<RejectReason, Kind>> = { bot: 'bot', internal: 'internal', self: 'self', forced: 'forced', not_entry: 'not_entry' };

  it('sends 3,000 visits with the planned mixture', () => {
    const { injected } = get();
    const total = Object.values(injected).reduce((x, y) => x + y, 0);
    expect(total).toBe(3000);
    for (const [kind, share] of MIX) expect(Math.abs(injected[kind] / total - share), kind).toBeLessThan(0.02);
    for (const ua of BOTS) expect(isBotUserAgent(ua)).toBe(true);
    for (const ua of BROWSERS) expect(isBotUserAgent(ua)).toBe(false);
  });

  it('flags no split on entry or analysed views', () => {
    const s = get().snapshot;
    expect(s.srm.assignment?.flagged).toBe(false);
    expect(s.srm.analysed?.flagged).toBe(false);
    expect(s.srm.firstFlaggedOn).toBeNull();
    expect(s.looks.length).toBeGreaterThan(0);
  });

  it('counts each exclusion exactly as injected, and the opt-outs nowhere', () => {
    const { snapshot: s, injected } = get();
    for (const reason of REJECT_REASONS) {
      const kind = excludedReasons[reason];
      expect(s.funnel.excluded[reason], reason).toBe(kind === undefined ? 0 : injected[kind]);
    }
    expect(s.funnel.entryViews).toBe(injected.clean);
    const sent = injected.clean + injected.bot + injected.internal + injected.self + injected.forced + injected.not_entry;
    expect(s.funnel.beaconsReceived).toBe(sent);
    expect(s.funnel.beaconsReceived).toBe(3000 - injected.optout);
  });

  it('counts every event exactly once per view, re-sent batches included', () => {
    const { snapshot: s, expected } = get();
    for (const arm of ['a', 'b'] as const) {
      const e = expected[arm];
      const c = s.current[arm];
      expect([c.entry, c.inview, c.engaged, c.card, c.secondary], arm).toEqual([e.entry, e.inview, e.engaged, e.card, e.secondary]);
      expect([c.cv, c.contact]).toEqual([0, 0]);
    }
    expect(s.funnel.analysed).toBe(expected.a.inview + expected.b.inview);
  });

  it('counts every click before the dwell as an analysed view and a card click', () => {
    const run = get();
    expect(run.clickBeforeDwell.length).toBeGreaterThan(100);
    for (const v of run.clickBeforeDwell) expect(v).toEqual({ inview: 'counted', card: 'counted', secondary: 'counted' });
  });

  it('loses the card of a reordered pair as an orphan, at the same rate in both groups', () => {
    const { a, b } = get().expected;
    expect(a.orphans).toBe(a.reordered);
    expect(b.orphans).toBe(b.reordered);
    expect(a.reordered + b.reordered).toBeGreaterThan(0);
    const share = (g: Tally) => (g.pairs === 0 ? 0 : g.orphans / g.pairs);
    // The share is part of the result: the order loss stays symmetric between the groups.
    console.info(`reordered card pairs lost as orphans: A ${a.orphans}/${a.pairs} (${share(a).toFixed(3)}), B ${b.orphans}/${b.pairs} (${share(b).toFixed(3)})`);
    expect(twoProportionZ(a.orphans, a.pairs, b.orphans, b.pairs)).toBeLessThan(3.29);
  });
}

describe('honest A/A traffic across the clocks-back night', () => {
  let run: Run;
  beforeAll(async () => {
    run = await simulate(AA, { firstDay: '2026-10-22', seed: 2026, cardRate: { a: 0.12, b: 0.12 } });
  }, 120_000);
  honestChecks(() => run);

  it('calibrates over six completed days and does not fail the identical groups', () => {
    expect(run.snapshot.looks.map((l) => l.day)).toEqual(['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
    expect(run.snapshot.status).toBe('calibration');
    expect(run.snapshot.calibration?.failed).toBeNull();
    expect(run.snapshot.held).toBeNull();
  });
});

describe('honest A/B traffic with a real lift in B', () => {
  let run: Run;
  beforeAll(async () => {
    run = await simulate(AB, { firstDay: '2026-12-01', seed: 2026, cardRate: { a: 0.12, b: 0.3 } });
  }, 120_000);
  honestChecks(() => run);

  it('decides on a completed look, and the closing check then stops the route', async () => {
    const s = run.snapshot;
    expect(s.status).toBe('ship-b');
    expect(s.frozenAt).not.toBeNull();
    const now = new Date(run.harness.now()).toISOString();
    const marker = await closeIfDecided({ write: run.harness.redis, ns: AB.namespace, config: AB, start: AB.calibration.startedOn!, now, log: () => {} });
    expect(marker).toEqual({ kind: 'decision', day: s.frozenAt });
    const late = await run.harness.post({ pv: pvOf(999_999), arm: 'a', items: ['entry'], ip: '192.0.2.1', ua: BROWSERS[0]! });
    expect(late.json).toEqual({ ok: false, reason: 'ended' });
  });
});

describe('an attack: one address flooding, then a forged-group flood over the daily ceiling', () => {
  // The pre-registered ceiling scaled to this traffic: about 350 clean entries a day, ceiling 600.
  const config = cfg({ dailyEntryCeiling: 600, calibration: { ...EXPERIMENT.calibration, startedOn: '2026-11-02T00:00:00+01:00' } });
  let s: ExperimentSnapshot;
  let counted = 0;
  let limited = 0;
  let ceilingRefused = 0;

  beforeAll(async () => {
    const rng = sfc32(2026);
    const h = harness(config);
    const ua = BROWSERS[0]!;
    let n = 0;
    const FLOOD_DAY = '2026-11-05';
    for (let day = 0; day < 6; day += 1) {
      const dayKey = dayPlus('2026-11-02', day);
      const dayStart = Date.parse(berlinStartOfDay(dayKey));
      for (let k = 0; k < 500; k += 1, n += 1) {
        const t = dayStart + 120_000 + k * 158_000;
        h.at(t);
        if (dayKey === FLOOD_DAY && k === 200) {
          // 60 entries within one minute from one address, all claiming group B.
          const minute = Math.ceil(t / 60_000) * 60_000;
          for (let j = 0; j < 60; j += 1) {
            h.at(minute + j * 500);
            const r = await h.post({ pv: pvOf(1_000_000 + j), arm: 'b', items: ['entry'], ip: '198.51.100.9', ua });
            if (r.status === 429) limited += 1;
            else if (r.json?.results?.[0]?.outcome === 'counted') counted += 1;
          }
          // Then 700 forged group-B entries, each from its own /64.
          for (let j = 0; j < 700; j += 1) {
            h.at(minute + 31_000 + j * 10);
            const r = await h.post({ pv: pvOf(2_000_000 + j), arm: 'b', items: ['entry'], ip: `2001:db8:ff:${j.toString(16)}::1`, ua });
            if (r.json?.reason === 'ceiling') ceilingRefused += 1;
            else if (r.json?.results?.[0]?.outcome === 'counted') counted += 1;
          }
        }
        if (rng.uniform() < 0.3) continue; // rejected or silent visits are covered by the honest runs
        const { arm } = assignArm({ search: new URLSearchParams(), userAgent: ua, random: () => rng.uniform() });
        const r = await h.post({ pv: pvOf(n), arm, items: ['entry'], ip: ipOf(n), ua });
        if (r.json?.reason === 'ceiling') ceilingRefused += 1;
        else if (r.json?.results?.[0]?.outcome === 'counted') {
          counted += 1;
          if (rng.uniform() < 0.6) await h.post({ pv: pvOf(n), arm, items: ['inview'], ip: ipOf(n), ua });
        }
      }
    }
    const now = '2026-11-08T02:00:00+01:00';
    h.at(Date.parse(now));
    s = buildSnapshot({ counters: await readCounters(h.redis, config.namespace), flags: NO_FLAGS, now, start: config.calibration.startedOn!, source: 'store', config });
  }, 120_000);

  it('cuts the single address off at 30 a minute and records it once', () => {
    expect(limited).toBe(30);
    expect(s.funnel.excluded.rate_limited).toBe(1);
  });

  it('stops counting at the daily ceiling and records it once', () => {
    expect(ceilingRefused).toBeGreaterThan(0);
    expect(s.funnel.excluded.ceiling).toBe(1);
    expect(s.funnel.entryViews).toBe(counted);
    expect(s.ceilingDays).toEqual(['2026-11-05']);
  });

  it('leaves the flooded day out of every look, so the split check stays clean', () => {
    expect(s.looks.map((l) => l.day)).not.toContain('2026-11-05');
    expect(s.looks).toHaveLength(5);
    expect(s.srm.assignment?.flagged).toBe(false);
    expect(s.srm.analysed?.flagged).toBe(false);
    expect(s.status).toBe('calibration');
    // The flood is still in the current totals, where it would have failed the split check.
    expect(srmTest(s.current.a.entry, s.current.b.entry).p).toBeLessThan(EXPERIMENT.srmFlagP);
  });
});

describe('the A/A rule on identical groups, over 200 seeds (the builder alone)', () => {
  it('fails few of them: at most alpha plus three standard errors', () => {
    // 14 completed days of about 30 entry views a day, every view split 50/50 and both groups with
    // the same rates. A failure is any rule failure: the split check, the interval, or a data fault.
    const config = cfg({ calibration: { ...EXPERIMENT.calibration, startedOn: '2026-11-02T00:00:00+01:00' } });
    const runs = 200;
    let failed = 0;
    for (let seed = 1; seed <= runs; seed += 1) {
      const rng = sfc32(seed);
      const days: DayCounts[] = [];
      for (let k = 0; k < 14; k += 1) {
        const entries = binomial(rng, 60, 0.5);
        const a = binomial(rng, entries, 0.5);
        const group = (entry: number): GroupCounts => {
          const inview = binomial(rng, entry, 0.6);
          return { entry, inview, engaged: binomial(rng, entry, 0.7), card: binomial(rng, inview, 0.15), secondary: 0, cv: 0, contact: 0 };
        };
        days.push({ day: dayPlus('2026-11-02', k), a: group(a), b: group(entries - a) });
      }
      const sum = (arm: Arm) => Object.fromEntries(EVENT_TYPES.map((t) => [t, days.reduce((x, d) => x + d[arm][t], 0)])) as GroupCounts;
      const totals = { a: sum('a'), b: sum('b') };
      const rejections = Object.fromEntries(REJECT_REASONS.map((r) => [r, 0])) as Record<RejectReason, number>;
      const s = buildSnapshot({
        counters: { days, rejections, rejectionsByDay: {}, totals },
        flags: NO_FLAGS,
        now: '2026-11-17T12:00:00+01:00',
        start: config.calibration.startedOn!,
        source: 'store',
        config,
      });
      if (s.calibration?.failed) failed += 1;
    }
    const share = failed / runs;
    const bound = EXPERIMENT.alpha + 3 * Math.sqrt((EXPERIMENT.alpha * (1 - EXPERIMENT.alpha)) / runs);
    console.info(`A/A false-fail rate over ${runs} seeds: ${failed}/${runs} (${share.toFixed(3)}), bound ${bound.toFixed(3)}`);
    expect(share).toBeLessThanOrEqual(bound);
  });
});
