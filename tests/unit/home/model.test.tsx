// The Home page's live note: the server-side projection of a snapshot (toHomeModel), the one
// small-count rule (publishedCount and PublishedCountText), and the exact note each mode prints.
// Closure and unreadable cases run the real reader (getExperimentSnapshot) over an in-memory store,
// so the note is checked against what the reader really returns, not against a hand-made snapshot.
import { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS } from '../../../src/lib/facts/facts.generated.ts';
import { LiveNote } from '@/components/home/LiveNote';
import { NoteFreshness, NoteFreshnessView, asOfAt } from '@/components/home/NoteFreshness';
import { PublishedCountText } from '@/components/home/PublishedCountText';
import { UpdatedLabel } from '@/components/kit/LiveLabels';
import { PhaseLabel } from '@/components/kit/PhaseLabel';
import { FIXTURE_START, type ExperimentConfig } from '@/experiment.config';
import type { ServerEnv } from '@/lib/env';
import { EVENT_TYPES } from '@/lib/experiment/events';
import { NO_FLAGS, parseFlags, type ExperimentFlags } from '@/lib/experiment/flags';
import { fieldName, keys } from '@/lib/experiment/keys';
import {
  HELD_REASON,
  MALFORMED_REASON,
  NOT_STARTED_REASON,
  UNAVAILABLE_REASON,
  getExperimentSnapshot,
  type SnapshotDeps,
} from '@/lib/experiment/live';
import { createMemoryRedis, type MemoryRedis } from '@/lib/experiment/memory-redis';
import type { ExperimentSnapshot } from '@/lib/experiment/snapshot';
import type { GroupCounts } from '@/lib/experiment/store';
import { plannedEnd } from '@/lib/experiment/time';
import { publishedCount } from '@/lib/home/counts';
import { FIXTURE_AB, FIXTURE_CALIBRATION, buildFixture, snapshotFixture } from '@/lib/home/fixtures';
import { homeFreshnessAt, toHomeModel, type HomeMode, type HomeModel } from '@/lib/home/model';

// ---------------------------------------------------------------------------------------------
// Helpers

const MODES: readonly HomeMode[] = [
  'not-started', 'closure-check', 'unavailable', 'settings-unreadable', 'held', 'srm-suppressed', 'aa-failed',
  'paused', 'before-data', 'calibration', 'ab', 'ship-b', 'stop-for-harm', 'inconclusive',
];
const EXCEPTIONAL: readonly HomeMode[] = ['closure-check', 'unavailable', 'settings-unreadable', 'held', 'srm-suppressed', 'aa-failed'];
const AB_NOW = '2026-12-03T12:00:00+01:00';
const CAL_NOW = '2026-11-20T10:00:00Z';
const END = plannedEnd(FIXTURE_AB, FIXTURE_START).at;
const endPlus = (ms: number) => new Date(Date.parse(END) + ms).toISOString();

const PRODUCTION: ServerEnv = { vercelEnv: 'production', fakeStore: false, kvUrl: 'https://store.example', kvToken: 'w', kvReadOnlyToken: 'r' };
const BUILD_PRODUCTION: ServerEnv = { ...PRODUCTION, buildPhase: true };

type G = Partial<GroupCounts>;
const counts = (g: G = {}): GroupCounts => ({ ...(Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as GroupCounts), ...g });

async function seed(redis: MemoryRedis, ns: string, rows: { day: string; a: G; b: G }[]): Promise<void> {
  for (const r of rows) {
    for (const arm of ['a', 'b'] as const) {
      for (const [metric, n] of Object.entries(counts(r[arm])) as [keyof GroupCounts, number][]) {
        if (n > 0) await redis.command(['HINCRBY', keys.counters(ns), fieldName({ kind: 'day', day: r.day, arm, metric }), n]);
      }
    }
  }
}
async function mark(redis: MemoryRedis, ns: string, kind: 'decision' | 'aa-failed' | 'held', day: string) {
  await redis.command(['SET', keys.closed(ns), JSON.stringify({ kind, day })]);
}

/** The real reader over an in-memory store, with no closing writes. */
function read(redis: MemoryRedis, o: { config: ExperimentConfig; now: string; flags?: ExperimentFlags; env?: ServerEnv }): Promise<ExperimentSnapshot> {
  const deps: Partial<SnapshotDeps> = {
    env: o.env ?? PRODUCTION,
    mode: 'store',
    read: redis,
    write: null,
    flags: async () => o.flags ?? NO_FLAGS,
    now: () => new Date(o.now),
    log: () => {},
    config: o.config,
    schedule: () => {},
    closingSeen: new Set<string>(),
  };
  return getExperimentSnapshot(deps);
}

const SHIP_B = [{ day: '2026-12-01', a: { entry: 600, inview: 300, engaged: 420, card: 30 }, b: { entry: 600, inview: 300, engaged: 432, card: 120 } }];
const BALANCED = [{ day: '2026-12-01', a: { entry: 80, inview: 60, engaged: 60, card: 9 }, b: { entry: 80, inview: 60, engaged: 60, card: 10 } }];
/** A clean first day, then a day whose card clicks outnumber its analysed views: held on 02.12. */
const INCONSISTENT = [
  { day: '2026-12-01', a: { entry: 60, inview: 50, engaged: 50, card: 5 }, b: { entry: 60, inview: 50, engaged: 50, card: 6 } },
  { day: '2026-12-02', a: { entry: 10, inview: 5, engaged: 5, card: 100 }, b: { entry: 10, inview: 5, engaged: 5, card: 1 } },
];

const html = (model: HomeModel) => renderToStaticMarkup(<LiveNote model={model} />);
const doc = (h: string) => parse(h);
function elements(node: T.ParentNode, out: T.Element[] = []): T.Element[] {
  for (const child of node.childNodes) {
    if ('tagName' in child) {
      out.push(child as T.Element);
      elements(child as T.Element, out);
    }
  }
  return out;
}
function text(node: T.ParentNode): string {
  return node.childNodes.map((c) => (c.nodeName === '#text' ? (c as T.TextNode).value : 'childNodes' in c ? text(c as T.ParentNode) : '')).join('');
}
const attr = (el: T.Element, name: string) => el.attrs.find((a) => a.name === name)?.value;
/** The note's sentence: the text of its first paragraph. */
const sentence = (h: string) => {
  const p = elements(doc(h)).find((el) => el.tagName === 'p');
  return p ? text(p) : '';
};
/** Everything a reader or a screen reader gets: text nodes and labelling attributes. */
const everything = (h: string) =>
  [text(doc(h)), ...elements(doc(h)).flatMap((el) => ['aria-label', 'title', 'aria-description'].map((n) => attr(el, n) ?? ''))].join(' ');
const links = (h: string) => elements(doc(h)).filter((el) => el.tagName === 'a').map((a) => ({ href: attr(a, 'href'), name: attr(a, 'aria-label') ?? text(a) }));

/** Exact counts from 1 to 4 in the count-bearing nodes: live-derived elements, progress bars and table cells. */
function exactSmallCounts(h: string): string[] {
  const hits: string[] = [];
  for (const el of elements(doc(h))) {
    const live = (attr(el, 'data-derived') ?? '').split(' ').includes('live');
    if (!live && el.tagName !== 'progress' && el.tagName !== 'td') continue;
    const values = [text(el), attr(el, 'value') ?? '', attr(el, 'max') ?? ''];
    for (const v of values) for (const token of v.match(/\d+(?:[.,:]\d+)*/g) ?? []) if (/^[1-4]$/.test(token)) hits.push(token);
  }
  return hits;
}

/** The props LiveNote hands to its client island: the only data of the note that is serialised. */
function clientProps(model: HomeModel): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (n: ReactNode): void => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (isValidElement(n)) {
      const props = n.props as Record<string, unknown> & { children?: ReactNode };
      if (n.type === NoteFreshness) out.push(props);
      else walk(props.children);
    }
  };
  walk(LiveNote({ model }) as ReactNode);
  return out;
}

const audit = (h: string) => auditHtml(h, { route: '/v/a', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] });

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------------------------

describe('publishedCount: the one small-count rule', () => {
  it('prints 0 as 0, 1 to 4 as "<5", and 5 and above exactly', () => {
    expect(publishedCount(0)).toBe(0);
    expect(publishedCount(1)).toBe('<5');
    expect(publishedCount(4)).toBe('<5');
    expect(publishedCount(5)).toBe(5);
    expect(publishedCount(60)).toBe(60);
  });

  it('refuses a count that is not a whole number of views', () => {
    for (const n of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => publishedCount(n)).toThrow(TypeError);
  });

  it('gives the smaller group through the same rule', () => {
    const at = (nA: number, nB: number) => toHomeModel({ ...snapshotFixture('ab'), live: { ...snapshotFixture('ab').live, nA, nB } }, 'a').counts;
    expect(at(1, 4)).toEqual({ a: '<5', b: '<5', smaller: '<5' });
    expect(at(0, 60)).toEqual({ a: 0, b: 60, smaller: 0 });
    expect(at(49, 60)).toEqual({ a: 49, b: 60, smaller: 49 });
  });
});

describe('PublishedCountText', () => {
  it('prints a number through Derived and "<5" as a marked span', () => {
    expect(renderToStaticMarkup(<PublishedCountText value={0} refs={['live']} />)).toBe('<data value="0" data-derived="live">0</data>');
    expect(renderToStaticMarkup(<PublishedCountText value={4} refs={['live']} />)).toBe('<data value="4" data-derived="live">4</data>');
    expect(renderToStaticMarkup(<PublishedCountText value={5} refs={['live']} />)).toBe('<data value="5" data-derived="live">5</data>');
    expect(renderToStaticMarkup(<PublishedCountText value="<5" refs={['live']} />)).toBe('<span data-num="" data-derived="live">&lt;5</span>');
  });

  it('needs a ref', () => {
    expect(() => renderToStaticMarkup(<PublishedCountText value="<5" refs={[]} />)).toThrow();
  });
});

describe('toHomeModel: modes and precedence', () => {
  it('renders nothing before the start', () => {
    expect(renderToStaticMarkup(<LiveNote model={toHomeModel(snapshotFixture('not-started'), 'b')} />)).toBe('');
  });

  it('renders nothing before a configured future start (the real reader)', async () => {
    const s = await read(createMemoryRedis(), { config: FIXTURE_CALIBRATION, now: '2026-11-01T12:00:00+01:00' });
    expect(s.unavailable).toBe('not-started');
    expect(html(toHomeModel(s, 'a'))).toBe('');
  });

  it.each(MODES)('the %s fixture is in its mode', (mode) => {
    expect(toHomeModel(snapshotFixture(mode), 'b').mode).toBe(mode);
  });

  it('puts the closure check before the unavailable causes, and never reads reason text for it', () => {
    expect(toHomeModel(snapshotFixture('unavailable', { closureMismatch: true }), 'a').mode).toBe('closure-check');
    const base = snapshotFixture('closure-check');
    const other = { ...base, live: { ...base.live, freshness: { kind: 'paused' as const, pausedOn: base.readAt, reason: UNAVAILABLE_REASON } } };
    expect(toHomeModel(other, 'a').mode).toBe('closure-check');
    const plain = { ...base, live: { ...base.live, freshness: { kind: 'fresh' as const } } };
    expect(toHomeModel(plain, 'a').mode).toBe('closure-check');
    // A mismatch without the unreadable fallback (a calibration A/A mismatch) keeps its own mode.
    expect(toHomeModel(snapshotFixture('aa-failed', { closureMismatch: true }), 'a').mode).toBe('aa-failed');
  });

  it('orders settings, held, A/A, split, paused and final as the page reads them', () => {
    const held = snapshotFixture('held');
    const malformedHeld = { ...held, live: { ...held.live, freshness: { kind: 'paused' as const, pausedOn: held.readAt, reason: MALFORMED_REASON } } };
    expect(toHomeModel(malformedHeld, 'a').mode).toBe('settings-unreadable');
    const srm = snapshotFixture('srm-suppressed');
    const pausedSrm = { ...srm, live: { ...srm.live, freshness: { kind: 'paused' as const, pausedOn: srm.readAt, reason: 'I am fixing a page' } } };
    expect(toHomeModel(pausedSrm, 'a').mode).toBe('srm-suppressed');
    const ship = snapshotFixture('ship-b');
    const pausedShip = { ...ship, live: { ...ship.live, freshness: { kind: 'paused' as const, pausedOn: ship.readAt, reason: 'I am fixing a page' } } };
    expect(toHomeModel(pausedShip, 'a')).toMatchObject({ mode: 'paused', outcome: null });
    const aa = snapshotFixture('aa-failed');
    const pausedAa = { ...aa, live: { ...aa.live, freshness: { kind: 'paused' as const, pausedOn: aa.readAt, reason: 'I am fixing a page' } } };
    expect(toHomeModel(pausedAa, 'a').mode).toBe('aa-failed');
  });

  it('uses the A headlines in the calibration and the assigned group in the A/B', () => {
    expect(toHomeModel(snapshotFixture('calibration'), 'b')).toMatchObject({ arm: 'b', headlineArm: 'a' });
    expect(toHomeModel(snapshotFixture('ab'), 'b')).toMatchObject({ arm: 'b', headlineArm: 'b' });
    expect(toHomeModel(snapshotFixture('ship-b'), 'a')).toMatchObject({ arm: 'a', headlineArm: 'a' });
  });

  it('flags a ceiling day', () => {
    expect(toHomeModel(snapshotFixture('ab', { ceilingDays: ['2026-12-02'] }), 'a').hasCeilingDay).toBe(true);
    expect(toHomeModel(snapshotFixture('ab', { ceilingDays: [] }), 'a').hasCeilingDay).toBe(false);
  });

  it('copies the calibration check and the split results, never inferring them', () => {
    const cal = snapshotFixture('calibration');
    const notReady = { ...cal, calibration: { ...cal.calibration!, ready: false, evaluatedOn: null } };
    const ready = { ...cal, calibration: { ...cal.calibration!, ready: true, evaluatedOn: '2026-11-16' } };
    expect(toHomeModel(notReady, 'a').calibration).toEqual({ ready: false, evaluatedOn: null });
    expect(toHomeModel(ready, 'a').calibration).toEqual({ ready: true, evaluatedOn: '2026-11-16' });
    expect(toHomeModel(snapshotFixture('ab'), 'a').calibration).toBeNull();

    const absent = { ...notReady, srm: { ...notReady.srm, assignment: null, analysed: null } };
    expect(toHomeModel(absent, 'a').splitStatus).toEqual({ entry: 'not-evaluated', analysed: 'not-evaluated' });
    const passed = { ...notReady, srm: { ...notReady.srm, assignment: { chi2: 0.1, p: 0.7, flagged: false }, analysed: { chi2: 0.2, p: 0.6, flagged: false } } };
    expect(toHomeModel(passed, 'a').splitStatus).toEqual({ entry: 'passed', analysed: 'passed' });
    expect(toHomeModel(snapshotFixture('srm-suppressed'), 'a').splitStatus).toEqual({ entry: 'failed', analysed: 'passed' });

    // Neither a not-ready calibration nor an unevaluated split ever prints ready or passed.
    for (const s of [notReady, absent]) expect(everything(html(toHomeModel(s, 'a')))).not.toMatch(/ready|passed/i);
  });

  it('carries no p-value, chi-square or raw outcome count, and drops looks below the minimum', () => {
    for (const mode of MODES) {
      const json = JSON.stringify(toHomeModel(snapshotFixture(mode), 'a'));
      const keysIn = [...json.matchAll(/"([^"]+)":/g)].map((m) => m[1]);
      for (const k of ['p', 'chi2', 'card', 'engaged', 'secondary', 'cv', 'contact', 'itt', 'funnel', 'looks', 'current', 'detectable']) {
        expect(keysIn, `${mode}: ${k}`).not.toContain(k);
      }
    }
    const ab = snapshotFixture('ab');
    const point = (n: number) => ({ n, nA: n, nB: n + 1, lower: -10, upper: 10, estimate: 0 });
    const m = toHomeModel({ ...ab, live: { ...ab.live, series: [point(3), point(49), point(50), point(70)] } }, 'a');
    expect(m.live.series.map((p) => p.n)).toEqual([50, 70]);
  });

  it('keeps the exact counts server-side only', () => {
    const ab = snapshotFixture('ab');
    const m = toHomeModel({ ...ab, live: { ...ab.live, nA: 1, nB: 4 } }, 'a');
    expect([m.live.nA, m.live.nB]).toEqual([1, 4]);
    expect(m.counts).toEqual({ a: '<5', b: '<5', smaller: '<5' });
  });
});

describe('LiveNote: the exact notes', () => {
  it('reuses PhaseLabel for the active notes', () => {
    for (const mode of ['before-data', 'calibration'] as const) {
      const m = toHomeModel(snapshotFixture(mode), 'b');
      expect(html(m)).toBe(renderToStaticMarkup(<PhaseLabel note={{ mode: 'calibration' }} href="/experiment" refs={m.refs} />));
    }
    const ab = toHomeModel(snapshotFixture('ab'), 'b');
    expect(ab.testNote).toEqual({ mode: 'ab', arm: 'b', nA: ab.live.nA, nB: ab.live.nB });
    expect(html(ab)).toBe(renderToStaticMarkup(<PhaseLabel note={ab.testNote!} href="/experiment" refs={ab.refs} />));
    const paused = toHomeModel(snapshotFixture('paused'), 'a');
    expect(html(paused)).toBe(renderToStaticMarkup(<PhaseLabel note={{ mode: 'paused' }} href="/experiment" refs={paused.refs} />));
    // The flag's own date and reason belong to the explanation page.
    expect(everything(html(paused))).not.toContain('updating');
  });

  it.each(EXCEPTIONAL)('%s links the explanation with its accessible name', (mode) => {
    expect(links(html(toHomeModel(snapshotFixture(mode), 'a')))).toEqual([{ href: '/experiment', name: 'Read the live test explanation' }]);
  });

  it('says settings could not be read, with no stop date (the real reader)', async () => {
    const redis = createMemoryRedis();
    await seed(redis, FIXTURE_CALIBRATION.namespace, [{ day: '2026-11-03', a: { entry: 70, inview: 60 }, b: { entry: 70, inview: 60 } }]);
    const s = await read(redis, { config: FIXTURE_CALIBRATION, now: CAL_NOW, flags: parseFlags({ unexpected: true }) });
    const m = toHomeModel(s, 'a');
    expect(m.mode).toBe('settings-unreadable');
    const h = html(m);
    expect(sentence(h)).toBe('Counting is stopped because the experiment settings could not be read.');
    expect(h).not.toContain('<time');
    expect(text(doc(h))).not.toMatch(/\d/);
  });

  it('says why a held test stopped, before and at the cap, and never that it runs, passed or was inconclusive', async () => {
    for (const now of [AB_NOW, endPlus(86_400_000)]) {
      const redis = createMemoryRedis();
      await seed(redis, FIXTURE_AB.namespace, INCONSISTENT);
      const s = await read(redis, { config: FIXTURE_AB, now });
      expect(s.held).toEqual({ on: '2026-12-02', reason: 'inconsistent-counts' });
      const m = toHomeModel(s, 'b');
      expect(m).toMatchObject({ mode: 'held', held: { on: '2026-12-02', reason: 'inconsistent-counts' }, outcome: null });
      const h = html(m);
      expect(sentence(h)).toBe(
        'The test stopped because the counts failed a consistency check. Results use only the data up to the last check that passed. The check failed on 02.12.',
      );
      expect(everything(h)).not.toMatch(/resum|running|inconclusive|paused|will/i);
      expect(everything(h).replace('the last check that passed', '')).not.toMatch(/passed/i);
    }
  });

  it('names the band check without blaming the counts', () => {
    const s = snapshotFixture('held', { held: { on: '2026-12-02', reason: 'band-conflict' } });
    expect(sentence(html(toHomeModel(s, 'a')))).toBe(
      'The test stopped because a consistency check failed. Results use only the data up to the last check that passed. The check failed on 02.12.',
    );
  });

  it('keeps the split warning on a held test (the real reader)', async () => {
    const redis = createMemoryRedis();
    await seed(redis, FIXTURE_AB.namespace, [
      INCONSISTENT[0]!,
      { day: '2026-12-02', a: { entry: 300, inview: 5, engaged: 5, card: 100 }, b: { entry: 20, inview: 5, engaged: 5, card: 1 } },
    ]);
    const s = await read(redis, { config: FIXTURE_AB, now: AB_NOW });
    expect(s.status).toBe('srm-suppressed');
    const m = toHomeModel(s, 'a');
    expect(m.mode).toBe('held');
    expect(m.split).toMatchObject({ base: 'entry', day: '2026-12-02' });
    expect(sentence(html(m))).toBe(
      'The test stopped because the counts failed a consistency check. Results use only the data up to the last check that passed. The check failed on 02.12. The split check also failed on 02.12, on entry views.',
    );
  });

  it('names the failed split, its day and only safe counts', async () => {
    const at = async (a: G, b: G) => {
      const redis = createMemoryRedis();
      await seed(redis, FIXTURE_AB.namespace, [{ day: '2026-12-01', a, b }]);
      return toHomeModel(await read(redis, { config: FIXTURE_AB, now: AB_NOW }), 'a');
    };
    const flagged = await at({ entry: 120, inview: 50, engaged: 120 }, { entry: 60, inview: 50, engaged: 60 });
    expect(flagged).toMatchObject({ mode: 'srm-suppressed', split: { base: 'entry', day: '2026-12-01', entry: { a: 120, b: 60 }, analysed: { a: 50, b: 50 } } });
    expect(sentence(html(flagged))).toBe(
      'The split check failed, so no result is shown. It failed on 01.12, on entry views. Entry views at that check: 120 in group A and 60 in group B.',
    );
    const small = await at({ entry: 120, inview: 50, engaged: 120 }, { entry: 40, inview: 40, engaged: 40 });
    expect(small.mode).toBe('srm-suppressed');
    expect(sentence(html(small))).toBe('The split check failed, so no result is shown. It failed on 01.12, on entry views.');
  });

  it('says when and why the calibration stopped, with a future restart only', () => {
    const on = '2026-11-06T09:00:00+01:00';
    const flags = (restartsOn?: string): ExperimentFlags => ({ ...NO_FLAGS, aaFailed: { on, reason: 'a script error dropped some views', ...(restartsOn ? { restartsOn } : {}) } });
    const rows = [{ day: '2026-11-03', a: { entry: 30, inview: 20 }, b: { entry: 30, inview: 20 } }];
    const build = (f: ExperimentFlags) => toHomeModel(buildFixture({ config: FIXTURE_CALIBRATION, now: CAL_NOW, flags: f, rows }), 'a');
    expect(sentence(html(build(flags())))).toBe('Calibration stopped on 06.11: a script error dropped some views.');
    expect(sentence(html(build(flags('2026-12-01T00:00:00+01:00'))))).toBe(
      'Calibration stopped on 06.11: a script error dropped some views. Calibration restarts on 01.12.',
    );
    expect(sentence(html(build(flags('2026-11-15T00:00:00+01:00'))))).toBe('Calibration stopped on 06.11: a script error dropped some views.');
    for (const f of [flags(), flags('2026-12-01T00:00:00+01:00')]) expect(everything(html(build(f)))).not.toMatch(/calibrating/i);
  });

  it('does not double the full stop when the stored reason already ends in one', () => {
    const f: ExperimentFlags = { ...NO_FLAGS, aaFailed: { on: '2026-11-06T09:00:00+01:00', reason: 'a script error dropped some views.' } };
    const rows = [{ day: '2026-11-03', a: { entry: 30, inview: 20 }, b: { entry: 30, inview: 20 } }];
    const text = sentence(html(toHomeModel(buildFixture({ config: FIXTURE_CALIBRATION, now: CAL_NOW, flags: f, rows }), 'a')));
    expect(text).toBe('Calibration stopped on 06.11: a script error dropped some views.');
  });

  it('keeps the split warning on a failed calibration (A/A plus SRM)', () => {
    const s = buildFixture({ config: FIXTURE_CALIBRATION, now: CAL_NOW, rows: [{ day: '2026-11-03', a: { entry: 120, inview: 50, engaged: 50 }, b: { entry: 60, inview: 50, engaged: 50 } }] });
    const m = toHomeModel(s, 'a');
    expect(m.mode).toBe('aa-failed');
    expect(sentence(html(m))).toBe(
      'Calibration stopped on 03.11: the split check failed. It failed on 03.11, on entry views. Entry views at that check: 120 in group A and 60 in group B.',
    );
  });
});

describe('LiveNote: closure', () => {
  const ENDED = 'The A/B test on this site has ended and counting has closed. You saw group B’s headlines.';
  const CONFIRMING = 'The A/B test on this site has reached its decision; I am confirming the result. You saw group B’s headlines.';
  const NOT_AFTER_CLOSE = /views so far|There have been|next update|paused|will appear|runs an A\/B test/i;

  it('a matching decision marker: ended, counting closed, no view count', async () => {
    const redis = createMemoryRedis();
    await seed(redis, FIXTURE_AB.namespace, SHIP_B);
    await mark(redis, FIXTURE_AB.namespace, 'decision', '2026-12-01');
    const m = toHomeModel(await read(redis, { config: FIXTURE_AB, now: AB_NOW }), 'b');
    expect(m).toMatchObject({ mode: 'ship-b', outcome: 'ship-b', closed: { kind: 'decision', day: '2026-12-01' }, closedConfirmed: true, countingClosed: true, closureMismatch: false });
    expect(sentence(html(m))).toBe(ENDED);
    expect(everything(html(m))).not.toMatch(NOT_AFTER_CLOSE);
    expect(links(html(m))).toEqual([{ href: '/experiment', name: 'Read the live test explanation' }]);
  });

  it('a mismatching decision marker: the closure check, no verdict, no next update, no paused note', async () => {
    const redis = createMemoryRedis();
    await seed(redis, FIXTURE_AB.namespace, SHIP_B);
    await mark(redis, FIXTURE_AB.namespace, 'decision', '2026-12-03');
    const m = toHomeModel(await read(redis, { config: FIXTURE_AB, now: AB_NOW }), 'b');
    expect(m).toMatchObject({ mode: 'closure-check', closureMismatch: true, outcome: null });
    const h = html(m);
    expect(sentence(h)).toBe('Counting has stopped for this run. I am checking the stored result before showing it.');
    expect(everything(h)).not.toMatch(/next update|paused|ship|harm|decision|views so far|There have been/i);
    expect(h).not.toContain('data-derived');
  });

  it('an A/A flag-only marker: the stopped calibration, with the note I still have', async () => {
    const redis = createMemoryRedis();
    await mark(redis, FIXTURE_CALIBRATION.namespace, 'aa-failed', '2026-11-06');
    const m = toHomeModel(await read(redis, { config: FIXTURE_CALIBRATION, now: CAL_NOW }), 'a');
    expect(m.mode).toBe('aa-failed');
    expect(sentence(html(m))).toBe('Calibration stopped on 06.11: I no longer have the note explaining why.');
  });

  it('a calibration A/A mismatch keeps the reader reason', async () => {
    const redis = createMemoryRedis();
    await mark(redis, FIXTURE_CALIBRATION.namespace, 'aa-failed', '2026-11-06');
    const flags = { ...NO_FLAGS, aaFailed: { on: '2026-11-07T09:00:00+01:00', reason: 'later text' } };
    const m = toHomeModel(await read(redis, { config: FIXTURE_CALIBRATION, now: CAL_NOW, flags }), 'a');
    expect(m).toMatchObject({ mode: 'aa-failed', closureMismatch: true });
    expect(sentence(html(m))).toBe('Calibration stopped on 06.11: the day I stored for this stop does not match what I see now, so I am checking it.');
  });

  it('a derived decision with no marker yet: being confirmed, never "counting has closed"', async () => {
    const redis = createMemoryRedis();
    await seed(redis, FIXTURE_AB.namespace, SHIP_B);
    const m = toHomeModel(await read(redis, { config: FIXTURE_AB, now: AB_NOW }), 'b');
    expect(m).toMatchObject({ mode: 'ship-b', outcome: 'ship-b', closed: null, closedConfirmed: false, countingClosed: true });
    expect(sentence(html(m))).toBe(CONFIRMING);
    expect(everything(html(m))).not.toMatch(/has closed|has ended/i);
    expect(everything(html(m))).not.toMatch(NOT_AFTER_CLOSE);
  });

  it.each(['ship-b', 'stop-for-harm', 'inconclusive'] as const)('%s: past tense, counting closed, no view count', (mode) => {
    const m = toHomeModel(snapshotFixture(mode, { closed: { kind: 'decision', day: '2026-12-01' } }), 'b');
    expect(m.mode).toBe(mode);
    expect(sentence(html(m))).toBe(ENDED);
    expect(everything(html(m))).not.toMatch(NOT_AFTER_CLOSE);
  });

  it('the planned end reached with no recorded decision: closed, no outcome invented', () => {
    const before = toHomeModel(buildFixture({ config: FIXTURE_AB, now: endPlus(-1), rows: BALANCED }), 'b');
    expect(before).toMatchObject({ mode: 'ab', countingClosed: false, closedConfirmed: false, outcome: null });
    expect(sentence(html(before))).toBe('This site runs an A/B test on its visitors, and you are in group B. There have been 120 views so far.');
    for (const now of [END, endPlus(30_000)]) {
      const at = toHomeModel(buildFixture({ config: FIXTURE_AB, now, rows: BALANCED }), 'b');
      // The analysis margin: no outcome yet, but counting has closed at the planned end.
      expect(at).toMatchObject({ countingClosed: true, closedConfirmed: true, outcome: null });
      expect(sentence(html(at))).toBe(ENDED);
      expect(everything(html(at))).not.toMatch(/inconclusive|ship|harm|views so far/i);
    }
    const after = toHomeModel(buildFixture({ config: FIXTURE_AB, now: endPlus(86_400_000), rows: BALANCED }), 'b');
    expect(after).toMatchObject({ mode: 'inconclusive', outcome: 'inconclusive', closedConfirmed: true });
    expect(sentence(html(after))).toBe(ENDED);
  });

  it('a final decision with a later failed split keeps the decision and says so', () => {
    const s = snapshotFixture('ship-b', { closed: { kind: 'decision', day: '2026-12-01' } });
    const m = toHomeModel({ ...s, srm: { ...s.srm, afterDecision: true } }, 'b');
    expect(m.afterDecisionSrm).toBe(true);
    expect(sentence(html(m))).toBe(`${ENDED} A later split check failed; the recorded decision is unchanged.`);
  });

  it('the unreadable placeholder before, at and after the planned end (the real reader)', async () => {
    const at = async (now: string) => {
      const s = await getExperimentSnapshot({ env: BUILD_PRODUCTION, mode: 'none', read: null, write: null, now: () => new Date(now), config: FIXTURE_AB, log: () => {} });
      expect(s.unavailable).toBe('unreadable');
      return toHomeModel(s, 'a');
    };
    const before = await at(endPlus(-1));
    expect(before).toMatchObject({ mode: 'unavailable', countingClosed: false, closedConfirmed: false });
    expect(sentence(html(before))).toBe('The live counts could not be loaded. They will appear at the next update.');
    for (const now of [END, endPlus(1), endPlus(86_400_000)]) {
      const m = await at(now);
      expect(m).toMatchObject({ mode: 'unavailable', closedConfirmed: true, outcome: null });
      expect(sentence(html(m))).toBe('The live counts could not be loaded, and counting has closed.');
    }
    for (const m of [before, await at(END), await at(endPlus(86_400_000))]) {
      const h = html(m);
      expect(everything(h)).not.toMatch(/paused|inconclusive|ship|harm|decision|views/i);
      expect(h).not.toContain('data-derived');
    }
  });

  it('the unavailable note without confirmed closure promises nothing', () => {
    const m = toHomeModel(snapshotFixture('unavailable', { status: 'ship-b', live: { ...snapshotFixture('unavailable').live, phase: 'ship-b' } }), 'a');
    expect(m).toMatchObject({ mode: 'unavailable', countingClosed: true, closedConfirmed: false, outcome: null });
    expect(sentence(html(m))).toBe('The live counts could not be loaded.');
  });

  it('an unreadable placeholder in the calibration never closes at the earliest end', () => {
    const s = snapshotFixture('unavailable');
    const late = { ...s, readAt: new Date(Date.parse(s.live.plannedEnd) + 1000).toISOString() };
    expect(toHomeModel(late, 'a')).toMatchObject({ countingClosed: false, closedConfirmed: false });
  });
});

describe('LiveNote: small counts', () => {
  const ab = (nA: number, nB: number) =>
    buildFixture({ config: FIXTURE_AB, now: AB_NOW, rows: [{ day: '2026-12-03', a: { entry: nA, inview: nA, engaged: nA }, b: { entry: nB, inview: nB, engaged: nB } }] });
  const cases: [string, ExperimentSnapshot][] = [
    ['(1, 4)', ab(1, 4)],
    ['(0, 60)', ab(0, 60)],
    ['(49, 60)', ab(49, 60)],
    ['a one-sided flagged split', buildFixture({ config: FIXTURE_AB, now: AB_NOW, rows: [{ day: '2026-12-01', a: { entry: 40, inview: 2, engaged: 2 }, b: { entry: 3, inview: 3, engaged: 3 } }] })],
    ['a paused low-data snapshot', buildFixture({ config: FIXTURE_CALIBRATION, now: CAL_NOW, flags: { ...NO_FLAGS, paused: { on: '2026-11-10T09:00:00+01:00', reason: 'I am fixing a page' } }, rows: [{ day: '2026-11-03', a: { entry: 2, inview: 2 }, b: { entry: 3, inview: 3 } }] })],
  ];

  it.each(cases)('%s: no exact count from 1 to 4 in any count-bearing node or client prop', (_name, s) => {
    for (const arm of ['a', 'b'] as const) {
      const m = toHomeModel(s, arm);
      const h = html(m);
      expect(exactSmallCounts(h)).toEqual([]);
      for (const props of clientProps(m)) {
        expect(Object.keys(props).sort()).toEqual(['freshness', 'plannedEnd', 'readAt', 'refs']);
        expect(JSON.stringify(props)).not.toMatch(/"(nA|nB|series|counts)"/);
      }
      // No zero is shown as an observation, and split counts only from 50 a group.
      expect(text(doc(h))).not.toMatch(/\bviews so far\b|in group A and/);
    }
  });

  it('keeps the one-sided split exact server-side and masked in the counts', () => {
    const m = toHomeModel(cases[3]![1], 'a');
    expect(m.mode).toBe('srm-suppressed');
    expect([m.live.nA, m.live.nB]).toEqual([2, 3]);
    expect(m.counts).toEqual({ a: '<5', b: '<5', smaller: '<5' });
  });
});

describe('LiveNote: stale view time', () => {
  it('carries the "as of" time on the server when the data is already stale', () => {
    const m = toHomeModel(snapshotFixture('ab'), 'b');
    const renderedAt = new Date(Date.parse(m.readAt) + 20 * 60_000).toISOString();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(renderedAt));
    expect(homeFreshnessAt(m, renderedAt)).toEqual({ kind: 'stale', updatedAt: m.readAt, renderedAt });
    const h = html(m);
    expect(h).toContain(renderToStaticMarkup(<UpdatedLabel updatedAt={m.readAt} renderedAt={renderedAt} refs={m.refs} />));
    expect(clientProps(m)).toEqual([]);
  });

  it('hands the client island only named props while fresh, and it adds the time past the planned end', () => {
    const m = toHomeModel(buildFixture({ config: FIXTURE_AB, now: endPlus(-60_000), rows: BALANCED }), 'b');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.parse(m.readAt) + 1000));
    expect(homeFreshnessAt(m, new Date().toISOString())).toEqual({ kind: 'fresh' });
    const props = clientProps(m);
    expect(props).toEqual([{ readAt: m.readAt, freshness: m.live.freshness, plannedEnd: m.live.plannedEnd, refs: m.refs }]);
    // On the server (and before hydration) the island renders nothing.
    expect(renderToStaticMarkup(<NoteFreshness readAt={m.readAt} freshness={m.live.freshness} plannedEnd={m.live.plannedEnd} refs={m.refs} />)).toBe('');
    // The hydrated client clock.
    const p = { readAt: m.readAt, freshness: m.live.freshness, plannedEnd: m.live.plannedEnd };
    const early = new Date(Date.parse(m.readAt) + 30_000).toISOString();
    const past = endPlus(60_000);
    expect(asOfAt(p, early)).toBe(false);
    expect(asOfAt(p, END)).toBe(true);
    expect(asOfAt(p, past)).toBe(true);
    expect(asOfAt({ ...p, plannedEnd: endPlus(86_400_000 * 30) }, new Date(Date.parse(m.readAt) + 16 * 60_000).toISOString())).toBe(true);
    expect(renderToStaticMarkup(<NoteFreshnessView {...p} refs={m.refs} nowIso={early} />)).toBe('');
    const shown = renderToStaticMarkup(<NoteFreshnessView {...p} refs={m.refs} nowIso={past} />);
    expect(shown).toContain(renderToStaticMarkup(<UpdatedLabel updatedAt={m.readAt} renderedAt={past} refs={m.refs} />));
    expect(renderToStaticMarkup(<NoteFreshnessView {...p} refs={m.refs} nowIso={null} />)).toBe('');
  });

  it('adapts the model to the client-safe freshness rule', () => {
    const m = toHomeModel(snapshotFixture('paused'), 'a');
    expect(homeFreshnessAt(m, '2030-01-01T00:00:00Z')).toEqual(m.live.freshness);
  });
});

describe('LiveNote: the truth audit over every mode', () => {
  it('finds nothing in the visible, hidden or aria text of any note', async () => {
    const pages: string[] = [];
    for (const mode of MODES) for (const arm of ['a', 'b'] as const) pages.push(html(toHomeModel(snapshotFixture(mode), arm)));
    pages.push(html(toHomeModel(snapshotFixture('ship-b', { closed: { kind: 'decision', day: '2026-12-01' } }), 'b')));
    pages.push(html(toHomeModel(snapshotFixture('ab', { live: { ...snapshotFixture('ab').live, nA: 1, nB: 4 } }), 'b')));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.parse(snapshotFixture('ab').readAt) + 20 * 60_000));
    pages.push(html(toHomeModel(snapshotFixture('ab'), 'b')));
    vi.useRealTimers();
    expect(pages.filter((p) => p !== '')).toHaveLength(pages.length - 2);
    for (const p of pages) {
      expect(audit(p)).toEqual([]);
      expect(p).not.toMatch(/[←-⇿·]/);
      expect(everything(p)).not.toMatch(/\barm\b/i);
    }
  });

  it('exports the reader reasons unchanged', () => {
    expect(MALFORMED_REASON).toBe('the experiment settings could not be read, so counting is stopped until I fix them');
    expect(NOT_STARTED_REASON).toBe('the experiment has not started yet, so nothing is counted');
    expect(UNAVAILABLE_REASON).toBe('the live counts could not be read when this page was built, so they show at the next update');
    expect(HELD_REASON).toEqual({
      'band-conflict': 'the interval failed a consistency check, so the test stopped at the last clean look',
      'inconsistent-counts': 'the counts failed a consistency check, so the test stopped at the last clean look',
    });
  });
});
