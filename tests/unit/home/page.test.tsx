// The Home page as one server composition (HomeSections) and the per-group route that serves it
// (src/app/v/[arm]/page.tsx). Every mode and the narrative states are rendered whole, in both
// groups, and read as a visitor and a screen reader get them, hidden markup included: the note,
// the cards, the five steps, the chart's labels and the props serialized for the browser's client
// components (the RSC payload). The route is checked for its static-generation settings, its one
// snapshot read, the beacon first, and metadata that reads no snapshot.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Link from 'next/link';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { HEADLINES, headlineText } from '../../../content/home.ts';
import { FACTS, FACT_DISPLAYS } from '../../../src/lib/facts/facts.generated.ts';
import { EXPERIMENT, FIXTURE_START, type ExperimentConfig } from '@/experiment.config';
import type { Arm } from '@/experiment.values';
import type { ServerEnv } from '@/lib/env';
import { EVENT_TYPES } from '@/lib/experiment/events';
import { NO_FLAGS, type ExperimentFlags } from '@/lib/experiment/flags';
import { fieldName, keys } from '@/lib/experiment/keys';
import type { SnapshotDeps } from '@/lib/experiment/live';
import { createMemoryRedis, type MemoryRedis } from '@/lib/experiment/memory-redis';
import type { ExperimentSnapshot } from '@/lib/experiment/snapshot';
import type { GroupCounts } from '@/lib/experiment/store';
import { plannedEnd } from '@/lib/experiment/time';
import { FIXTURE_AB, FIXTURE_CALIBRATION, buildFixture, snapshotFixture } from '@/lib/home/fixtures';
import { toHomeModel, type HomeMode, type HomeModel } from '@/lib/home/model';
import { NARRATIVE_FIXTURES, narrativeFixture, type NarrativeFixture } from '@/lib/home/narrative-fixtures';
import { SITE } from '@/lib/site';

// The planner island reads the URL with next/navigation, which has no router in a unit test; its own
// tests cover it. Here it is a marked stand-in.
vi.mock('@/components/home/HeroSimulator', () => ({
  HERO_PLANNER_ID: 'hero-planner',
  HeroSimulator: () => createElement('div', { 'data-hero-simulator': '' }),
}));
// The route's one store read, counted. Everything else in the module is the real reader.
vi.mock('@/lib/experiment/live', async (original) => {
  const real = await original<typeof import('@/lib/experiment/live')>();
  return { ...real, getExperimentSnapshot: vi.fn(real.getExperimentSnapshot) };
});

const live = await import('@/lib/experiment/live');
const { HomeSections, homeScrollProps, homeTickAllowed } = await import('@/components/home/HomeSections');
const route = await import('@/app/v/[arm]/page');
const { ExperimentBeacon } = await import('@/components/experiment/ExperimentBeacon');
const { homeMetadata } = await import('@/lib/home/metadata');

const ROOT = path.resolve(import.meta.dirname, '../../..');

// ---------------------------------------------------------------------------------------------
// Fixtures

const MODES: readonly HomeMode[] = [
  'not-started', 'closure-check', 'unavailable', 'settings-unreadable', 'held', 'srm-suppressed', 'aa-failed',
  'paused', 'before-data', 'calibration', 'ab', 'ship-b', 'stop-for-harm', 'inconclusive',
];
const ARMS: readonly Arm[] = ['a', 'b'];
const mode = (m: HomeMode, arm: Arm = 'b') => toHomeModel(snapshotFixture(m), arm);
const named = (n: NarrativeFixture, arm: Arm = 'b') => toHomeModel(narrativeFixture(n), arm);

const AB_NOW = '2026-12-03T12:00:00+01:00';
const CAL_NOW = '2026-11-20T10:00:00Z';
const END = plannedEnd(FIXTURE_AB, FIXTURE_START).at;
const endPlus = (ms: number) => new Date(Date.parse(END) + ms).toISOString();
const plusMinutes = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString();

const PRODUCTION: ServerEnv = { vercelEnv: 'production', fakeStore: false, kvUrl: 'https://store.example', kvToken: 'w', kvReadOnlyToken: 'r' };
const BUILD_PRODUCTION: ServerEnv = { ...PRODUCTION, buildPhase: true };
type G = Partial<GroupCounts>;
const SHIP_B = [{ day: '2026-12-01', a: { entry: 600, inview: 300, engaged: 420, card: 30 }, b: { entry: 600, inview: 300, engaged: 432, card: 120 } }];
const BALANCED = [{ day: '2026-12-01', a: { entry: 80, inview: 60, engaged: 60, card: 9 }, b: { entry: 80, inview: 60, engaged: 60, card: 10 } }];

async function seed(redis: MemoryRedis, ns: string, rows: { day: string; a: G; b: G }[]): Promise<void> {
  for (const r of rows) {
    for (const arm of ARMS) {
      const counts = { ...(Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as GroupCounts), ...r[arm] };
      for (const [metric, n] of Object.entries(counts) as [keyof GroupCounts, number][]) {
        if (n > 0) await redis.command(['HINCRBY', keys.counters(ns), fieldName({ kind: 'day', day: r.day, arm, metric }), n]);
      }
    }
  }
}
const mark = (redis: MemoryRedis, ns: string, kind: 'decision' | 'aa-failed' | 'held', day: string) =>
  redis.command(['SET', keys.closed(ns), JSON.stringify({ kind, day })]);
/** The real reader over an in-memory store, with no closing writes. */
function read(redis: MemoryRedis, o: { config: ExperimentConfig; now: string; flags?: ExperimentFlags; env?: ServerEnv }): Promise<ExperimentSnapshot> {
  const deps: Partial<SnapshotDeps> = {
    env: o.env ?? PRODUCTION, mode: 'store', read: redis, write: null, flags: async () => o.flags ?? NO_FLAGS,
    now: () => new Date(o.now), log: () => {}, config: o.config, schedule: () => {}, closingSeen: new Set<string>(),
  };
  return live.getExperimentSnapshot(deps);
}
/** The reader's placeholder when a production build cannot read the store, at `now`. */
const placeholderAt = async (now: string, arm: Arm = 'b') =>
  toHomeModel(await live.getExperimentSnapshot({ env: BUILD_PRODUCTION, mode: 'none', read: null, write: null, now: () => new Date(now), config: FIXTURE_AB, log: () => {} }), arm);

// ---------------------------------------------------------------------------------------------
// Rendering, at a fixed server clock (the note and the tick read the render time)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});

/** The whole page for a model, rendered at `at` (default: the moment the data was read). */
function page(m: HomeModel, at: string = m.readAt): string {
  vi.setSystemTime(new Date(at));
  return renderToStaticMarkup(<HomeSections model={m} />);
}

type El = T.Element;
const doc = (h: string) => parse(`<body>${h}</body>`);
function all(node: T.ParentNode, test: (el: El) => boolean = () => true, out: El[] = []): El[] {
  for (const child of node.childNodes) {
    if ('tagName' in child) {
      const el = child as El;
      if (test(el)) out.push(el);
      all(el, test, out);
    }
  }
  return out;
}
const attr = (el: El, name: string) => el.attrs.find((a) => a.name === name)?.value;
const has = (name: string, value?: string) => (el: El) => (value === undefined ? attr(el, name) !== undefined : attr(el, name) === value);
function text(node: T.ParentNode, skip: (el: El) => boolean = () => false): string {
  return node.childNodes
    .map((c) => (c.nodeName === '#text' ? (c as T.TextNode).value : 'tagName' in c && skip(c as El) ? '' : 'childNodes' in c ? text(c as T.ParentNode, skip) : ''))
    .join('');
}
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const LABELS = ['aria-label', 'title', 'aria-description', 'alt'];
/** Everything a reader or a screen reader can get: every text node (hidden ones too) and labelling attribute. */
const everything = (h: string) => squash([text(doc(h)), ...all(doc(h)).flatMap((el) => LABELS.map((n) => attr(el, n) ?? ''))].join(' '));
/** The text a sighted reader sees: without aria-hidden or visibility-hidden subtrees. */
const hiddenTwin = (el: El) => attr(el, 'aria-hidden') === 'true' || (attr(el, 'class') ?? '').split(' ').includes('invisible');
const visibleText = (h: string) => squash(text(doc(h), hiddenTwin));
const section = (h: string, test: (el: El) => boolean) => all(doc(h), test)[0];
const noteText = (h: string) => {
  const n = section(h, has('data-home-note'));
  return n ? squash(text(n)) : null;
};
const stepText = (h: string, n: number) => squash(text(section(h, has('data-scroll-step', String(n)))!));
const ariaLabels = (h: string) => all(doc(h)).flatMap((el) => (attr(el, 'aria-label') ? [attr(el, 'aria-label')!] : []));

const audit = (h: string) => auditHtml(h, { route: '/v/a', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] });

/**
 * Exact counts from 1 to 4 in the count-bearing nodes: live-derived elements, progress bars and table
 * cells. A count is never signed, so a signed difference ("+1", "−2" points) is not read as one.
 */
function exactSmallCounts(h: string): string[] {
  const hits: string[] = [];
  for (const el of all(doc(h))) {
    const isLive = (attr(el, 'data-derived') ?? '').split(' ').includes('live');
    if (!isLive && el.tagName !== 'progress' && el.tagName !== 'td') continue;
    for (const v of [text(el), attr(el, 'value') ?? '', attr(el, 'max') ?? '']) {
      for (const token of v.match(/(?<![+−\-\d.,:])\d+(?:[.,:]\d+)*/g) ?? []) if (/^[1-4]$/.test(token)) hits.push(token);
    }
  }
  return hits;
}

const STOPPED_PROMISES = /next look|first estimate|estimates appear|next daily look|next update|will appear|\bgrow:/i;
const VERDICTS = /Ship B\.|Stop for harm\.|Inconclusive at the limit/;

// ---------------------------------------------------------------------------------------------
// The RSC payload: the props the server serializes for each client component

/** Every export of every client module in src/components (and next/link), by identity. */
const CLIENT = new Map<unknown, string>([[Link, 'Link']]);
for (const dir of ['kit', 'home', 'figures', 'experiment', 'shell']) {
  for (const file of readdirSync(path.join(ROOT, 'src/components', dir))) {
    if (!/\.tsx?$/.test(file)) continue;
    const source = readFileSync(path.join(ROOT, 'src/components', dir, file), 'utf8');
    if (!/^\s*(?:\/\/[^\n]*\n\s*)*['"]use client['"]/.test(source)) continue;
    const mod = (await import(`@/components/${dir}/${file.replace(/\.tsx?$/, '')}`)) as Record<string, unknown>;
    for (const [name, value] of Object.entries(mod)) if (typeof value === 'function' || (typeof value === 'object' && value !== null)) CLIENT.set(value, name);
  }
}
/** Server components that call useId (allowed on the server) and hold no client component: rendered, not walked. */
const { UpdatedLabel, ProgressLine } = await import('@/components/kit/LiveLabels');
const LEAVES = new Set<unknown>([UpdatedLabel, ProgressLine]);

type Sent = { name: string; props: Record<string, unknown> };
function elementsIn(v: unknown, out: ReactNode[] = []): ReactNode[] {
  if (isValidElement(v)) out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => elementsIn(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => elementsIn(x, out));
  return out;
}
/** Walks the server tree as the RSC renderer does: server components run, client components are serialized with their props. */
async function payload(node: unknown, out: Sent[] = []): Promise<Sent[]> {
  if (node instanceof Promise) return payload(await node, out);
  if (Array.isArray(node)) {
    for (const n of node) await payload(n, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  const type = node.type as unknown;
  const props = node.props as Record<string, unknown>;
  if (CLIENT.has(type)) {
    out.push({ name: CLIENT.get(type)!, props: JSON.parse(JSON.stringify(props, (_, v: unknown) => (isValidElement(v) ? '[element]' : v))) as Record<string, unknown> });
    for (const el of elementsIn(props)) await payload(el, out);
    return out;
  }
  if (LEAVES.has(type)) return out;
  if (typeof type === 'function') return payload((type as (p: unknown) => unknown)(props), out);
  return payload(props.children, out);
}
async function pagePayload(m: HomeModel, at: string = m.readAt): Promise<Sent[]> {
  vi.setSystemTime(new Date(at));
  return payload(<HomeSections model={m} />);
}
/** Counts from 1 to 4 under the count keys of the serialized props. */
function smallPayloadCounts(sent: Sent[]): string[] {
  const small: string[] = [];
  const scan = (v: unknown, key = ''): void => {
    if (typeof v === 'number' && ['nA', 'nB', 'n', 'smaller', 'a', 'b', 'tickFrom', 'viewN'].includes(key) && v >= 1 && v <= 4) small.push(`${key}=${v}`);
    if (Array.isArray(v)) v.forEach((x) => scan(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) scan(x, k);
  };
  scan(sent.map((s) => s.props));
  return small;
}
/**
 * The scroll moment's client half as serialized. The Figure hands the same shell to its error boundary
 * twice (as the content and as the fallback's preview), so it appears twice, always with equal props.
 */
function shellCharts(sent: Sent[]): ({ tickFrom: number | null } | null)[] {
  const shells = sent.filter((s) => s.name === 'ScrollShell').map((s) => JSON.stringify(s.props));
  expect(new Set(shells).size, 'one scroll moment').toBe(1);
  return (JSON.parse(shells[0]!) as { charts: ({ tickFrom: number | null } | null)[] }).charts;
}
/** Keys that only the raw snapshot or the server-only model hold. */
const RAW_KEYS = ['chi2', 'p', 'funnel', 'itt', 'looks', 'current', 'beaconsReceived', 'flaggedLook', 'detectable', 'ceilingDays', 'srm', 'testNote', 'counts', 'splitStatus', 'hasCeilingDay', 'closureMismatch', 'afterDecisionSrm', 'yourViewN'];
function rawKeys(sent: Sent[]): string[] {
  const found = new Set<string>();
  const scan = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(scan);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
      if (RAW_KEYS.includes(k)) found.add(k);
      scan(x);
    }
  };
  scan(sent.map((s) => s.props));
  return [...found];
}

// ---------------------------------------------------------------------------------------------

describe('the route: static per-group pages', () => {
  it('regenerates every 300 s, knows only groups a and b, and builds both', () => {
    expect(route.revalidate).toBe(300);
    expect(route.revalidate).toBe(EXPERIMENT.revalidateSeconds);
    expect(route.dynamicParams).toBe(false);
    expect(route.generateStaticParams()).toEqual([{ arm: 'a' }, { arm: 'b' }]);
  });

  it('reads the snapshot once, renders the beacon first, then the Home sections from the same model', async () => {
    const read = vi.mocked(live.getExperimentSnapshot);
    for (const arm of ARMS) {
      const snapshot = snapshotFixture('calibration');
      read.mockReset();
      read.mockResolvedValueOnce(snapshot);
      vi.setSystemTime(new Date(snapshot.readAt));
      const el = (await route.default({ params: Promise.resolve({ arm }) } as never)) as ReactNode;
      expect(read).toHaveBeenCalledTimes(1);
      const top = (el as { props: { children: ReactNode[] } }).props.children;
      const [first, ...rest] = (Array.isArray(top) ? top : [top]).filter(isValidElement);
      expect(first!.type).toBe(ExperimentBeacon);
      expect(first!.props).toEqual({ arm, ns: snapshot.namespace });
      const found: unknown[] = [];
      const find = (n: unknown): void => {
        if (Array.isArray(n)) n.forEach(find);
        else if (isValidElement(n)) {
          if (n.type === HomeSections) found.push((n.props as { model: HomeModel }).model);
          else find((n.props as { children?: ReactNode }).children);
        }
      };
      find(rest);
      expect(found).toEqual([toHomeModel(snapshot, arm)]);
      // And it renders: one h1 (the hero's), the beacon draws nothing.
      const h = renderToStaticMarkup(<>{el}</>);
      expect(all(doc(h), (e) => e.tagName === 'h1')).toHaveLength(1);
    }
  });

  it('answers any other group with the 404 page, before reading anything', async () => {
    const read = vi.mocked(live.getExperimentSnapshot);
    read.mockClear();
    await expect(route.default({ params: Promise.resolve({ arm: 'zz' }) } as never)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });

  it('has static metadata from the site constants: no noindex, no snapshot read; a canonical only when it can be absolute', () => {
    expect(typeof route.metadata).toBe('object');
    expect('generateMetadata' in route).toBe(false);
    const m = route.metadata;
    expect(m.title).toBe(SITE.name);
    expect(m.description).toBe(`${SITE.role} in ${SITE.city}.`);
    expect(m.robots).toBeUndefined();
    expect(JSON.stringify(m)).not.toMatch(/noindex/i);
    // On the production host the canonical is "/" resolved against it: https://<host>/.
    const known = homeMetadata({ ...PRODUCTION, productionHost: 'example.com' });
    expect(String(known.metadataBase)).toBe('https://example.com/');
    expect(known.alternates?.canonical).toBe('/');
    // Without a production host (a local, test or Lighthouse build) there is no absolute address to
    // name, and a relative canonical is invalid (Lighthouse SEO: "Is not an absolute URL (/)"), so
    // there is none.
    const unknown = homeMetadata({ ...PRODUCTION, productionHost: undefined });
    expect(unknown.metadataBase).toBeUndefined();
    expect(unknown.alternates).toBeUndefined();
  });

  it('uses no request-time API, no persistent layout beacon and no cache components', () => {
    const source = readFileSync(path.join(ROOT, 'src/app/v/[arm]/page.tsx'), 'utf8');
    expect(source).not.toMatch(/searchParams|next\/headers|cookies\(|headers\(|connection\(|draftMode|export const dynamic\b|noindex|'use cache'/);
    expect(source.match(/getExperimentSnapshot\(/g)).toHaveLength(1);
    expect(source).not.toMatch(/getLiveView/);
    // The beacon lives in the page segment only: no layout or template keeps one across pages.
    expect(readFileSync(path.join(ROOT, 'src/app/layout.tsx'), 'utf8')).not.toMatch(/ExperimentBeacon/);
    for (const f of ['src/app/v/layout.tsx', 'src/app/v/[arm]/layout.tsx', 'src/app/v/template.tsx', 'src/app/v/[arm]/template.tsx', 'src/app/template.tsx']) {
      expect(existsSync(path.join(ROOT, f)), f).toBe(false);
    }
    expect(readFileSync(path.join(ROOT, 'next.config.ts'), 'utf8')).not.toMatch(/cacheComponents/);
  });

  it('the test build host uses the same composition, without a beacon', () => {
    const host = readFileSync(path.join(ROOT, 'src/app/kitchen-sink/home/HostHome.tsx'), 'utf8');
    expect(host).toMatch(/HomeSectionsView/);
    expect(host).not.toMatch(/ExperimentBeacon|<Hero|<LiveNote|<FeaturedCases|<Tools/);
  });
});

describe('HomeSections: the whole page in every mode and both groups', () => {
  const MODELS: readonly [string, HomeModel][] = [
    ...MODES.flatMap((m) => ARMS.map((arm) => [`${m}/${arm}`, mode(m, arm)] as [string, HomeModel])),
    ...NARRATIVE_FIXTURES.map((n) => [n, named(n)] as [string, HomeModel]),
  ];

  it.each(MODELS)('%s: hero and note, cards, scroll moment, tools, in that order', (_, m) => {
    const h = page(m);
    const order = all(doc(h), (el) => ['data-hero', 'data-home-note', 'data-experiment', 'data-scroll-moment', 'data-home-tools'].some((a) => attr(el, a) !== undefined)).map(
      (el) => ['data-hero', 'data-home-note', 'data-experiment', 'data-scroll-moment', 'data-home-tools'].find((a) => attr(el, a) !== undefined),
    );
    const expected = ['data-hero', 'data-home-note', 'data-experiment', 'data-scroll-moment', 'data-home-tools'].filter((a) => a !== 'data-home-note' || m.mode !== 'not-started');
    expect(order).toEqual(expected);
    expect(all(doc(h), (el) => el.tagName === 'h1')).toHaveLength(1);
  });

  it.each(MODELS)('%s: the truth audit finds nothing, hidden markup included', (_, m) => {
    expect(audit(page(m))).toEqual([]);
  });

  it.each(MODELS)('%s: no repeated id', (_, m) => {
    const ids = all(doc(page(m)), has('id')).map((el) => attr(el, 'id')!);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it.each(MODELS)('%s: the reader sees only their headlines; both strings stay in the markup for sizing', (_, m) => {
    const h = page(m);
    const shown = m.headlineArm;
    const other: Arm = shown === 'a' ? 'b' : 'a';
    const seen = visibleText(h);
    for (const hl of HEADLINES) {
      expect(seen).toContain(squash(headlineText(hl[shown])));
      if (headlineText(hl.a) !== headlineText(hl.b)) expect(seen).not.toContain(squash(headlineText(hl[other])));
      expect(squash(text(doc(h)))).toContain(squash(headlineText(hl[other])));
    }
    for (const twin of all(doc(h), has('data-headline-twin'))) {
      const isShown = attr(twin, 'data-headline-twin') === shown;
      expect(attr(twin, 'aria-hidden'), 'only the selected twin is announced').toBe(isShown ? undefined : 'true');
    }
    // Calibration: group A's headlines in both groups; the A/B: the assigned group's.
    expect(shown).toBe(m.calibration !== null || m.mode === 'not-started' ? 'a' : m.arm);
  });

  it.each(MODELS)('%s: the RSC payload holds no raw statistic, no model field and no small count', async (_, m) => {
    const sent = await pagePayload(m);
    expect(sent.map((s) => s.name)).not.toContain('HomeSections');
    expect(rawKeys(sent)).toEqual([]);
    expect(smallPayloadCounts(sent)).toEqual([]);
    expect(exactSmallCounts(page(m))).toEqual([]);
  });
});

describe('the payload walker', () => {
  it('sees what a leak would look like: a model field, a raw statistic, a small count', async () => {
    const { NoteFreshness } = await import('@/components/home/NoteFreshness');
    const m = mode('ab');
    const props = { readAt: m.readAt, freshness: m.live.freshness, plannedEnd: m.live.plannedEnd, refs: m.refs, model: m, srm: { chi2: 1, p: 0.5 }, nA: 3 };
    const leak = await payload(<div>{createElement(NoteFreshness as unknown as (p: typeof props) => null, props)}</div>);
    expect(leak.map((s) => s.name)).toEqual(['NoteFreshness']);
    expect(rawKeys(leak)).toEqual(expect.arrayContaining(['testNote', 'counts', 'srm', 'chi2', 'p']));
    expect(smallPayloadCounts(leak)).toContain('nA=3');
  });
});

describe('the note is absent before the start', () => {
  it('with no start configured (production) and with a future start', async () => {
    const none = toHomeModel(await live.getExperimentSnapshot({ env: PRODUCTION, mode: 'none', read: null, write: null, now: () => new Date(CAL_NOW), config: EXPERIMENT, log: () => {} }), 'a');
    const future = toHomeModel(await read(createMemoryRedis(), { config: FIXTURE_CALIBRATION, now: '2026-11-01T12:00:00+01:00' }), 'b');
    for (const m of [none, future]) {
      expect(m.mode).toBe('not-started');
      const h = page(m);
      expect(noteText(h)).toBeNull();
      expect(everything(h)).not.toMatch(/paused|could not be loaded|calibrating first|views so far|A\/B test on this site|See the live results/i);
      expect(all(doc(h), (el) => (attr(el, 'data-derived') ?? '').split(' ').includes('live'))).toEqual([]);
    }
  });
});

describe('the five false-copy gates, whole page', () => {
  it('(a) never started: no note, nothing counted, nothing paused', () => {
    const h = page(mode('not-started'));
    expect(noteText(h)).toBeNull();
    expect(stepText(h, 3)).toContain('The experiment has not started yet, so nothing is counted.');
    expect(everything(h)).not.toMatch(/paused|running|views so far|could not be loaded/i);
  });

  it('(b) unreadable at build: "could not be loaded" in the note and the steps, never paused', async () => {
    const m = await placeholderAt(endPlus(-86_400_000));
    expect(m.mode).toBe('unavailable');
    const h = page(m);
    expect(noteText(h)).toContain('The live counts could not be loaded. They will appear at the next update.');
    for (const n of [2, 3, 5]) expect(stepText(h, n)).toContain('The live counts could not be loaded. They will appear at the next update.');
    expect(everything(h)).not.toMatch(/paused/i);
    expect(everything(h)).not.toMatch(VERDICTS);
  });

  it('(c) unreadable settings: stopped, with no date that would move with each regeneration', () => {
    const m = mode('settings-unreadable');
    const h = page(m);
    expect(noteText(h)).toContain('Counting is stopped because the experiment settings could not be read.');
    expect(all(section(h, has('data-home-note'))!, (el) => el.tagName === 'time')).toEqual([]);
    expect(all(doc(h), (el) => el.tagName === 'time' && attr(el, 'datetime') === m.readAt)).toEqual([]);
    expect(everything(h)).not.toMatch(/paused on/i);
  });

  it('(d) held, before and at the cap: stopped, never running, resumed, paused or decided', () => {
    const rows = [
      { day: '2026-12-01', a: { entry: 60, inview: 50, engaged: 50, card: 5 }, b: { entry: 60, inview: 50, engaged: 50, card: 6 } },
      { day: '2026-12-02', a: { entry: 10, inview: 5, engaged: 5, card: 100 }, b: { entry: 10, inview: 5, engaged: 5, card: 1 } },
    ];
    for (const now of [AB_NOW, endPlus(86_400_000)]) {
      const m = toHomeModel(buildFixture({ config: FIXTURE_AB, now, rows }), 'b');
      expect(m.mode).toBe('held');
      const h = page(m);
      expect(noteText(h)).toMatch(/^The test stopped because the counts failed a consistency check\./);
      expect(everything(h)).not.toMatch(/resum|running|views so far|pause/i);
      expect(everything(h)).not.toMatch(VERDICTS);
      expect(everything(h)).not.toMatch(STOPPED_PROMISES);
    }
  });

  it('(e) a stopped calibration: its date and reason, never running or calibrating', () => {
    const h = page(mode('aa-failed'));
    expect(noteText(h)).toContain('Calibration stopped on 06.11: a script error dropped some views.');
    expect(everything(h)).not.toMatch(/calibrating first|paused|running|views so far/i);
    expect(everything(h)).not.toMatch(STOPPED_PROMISES);
  });
});

describe('closure: the note, the five steps, hidden markup and labels agree', () => {
  /** The whole page on a closed test: past tense, nothing projected or promised, "closed" only when confirmed. */
  function expectClosed(m: HomeModel) {
    const h = page(m);
    const all_ = everything(h);
    expect(all_).not.toMatch(STOPPED_PROMISES);
    expect(all_).not.toMatch(/views so far|has fewer than|are the test|is assigned|calibrating first/i);
    expect(h).not.toContain('data-cs="projection"');
    expect(stepText(h, 1)).toContain('The case-study cards above were the test.');
    if (!m.closedConfirmed) expect(all_).not.toMatch(/counting has closed|has ended|counting stopped/i);
    for (const label of ariaLabels(h)) {
      expect(label).not.toMatch(/pause/i);
      if (m.held === null && !m.closedConfirmed) expect(label).not.toMatch(/counting stopped/i);
    }
    return h;
  }

  it('runs right up to the planned end and closes at it, in the margin before a decision', () => {
    const before = toHomeModel(buildFixture({ config: FIXTURE_AB, now: endPlus(-1), rows: BALANCED }), 'b');
    const hb = page(before);
    expect(hb).toContain('data-cs="projection"');
    expect(stepText(hb, 1)).toContain('The case-study cards above are the test.');
    expect(noteText(hb)).toContain('This site runs an A/B test on its visitors, and you are in group B.');
    for (const now of [END, endPlus(30_000)]) {
      const m = toHomeModel(buildFixture({ config: FIXTURE_AB, now, rows: BALANCED }), 'b');
      expect(m).toMatchObject({ mode: 'ab', countingClosed: true, closedConfirmed: true, outcome: null });
      const h = expectClosed(m);
      expect(noteText(h)).toContain('The A/B test on this site has ended and counting has closed.');
      expect(stepText(h, 5)).toContain('Counting has closed; no decision is recorded in this snapshot.');
    }
  });

  it('a final result: its own wording in the note and the Decision step', () => {
    const m = named('ship-b-confirmed');
    const h = expectClosed(m);
    expect(noteText(h)).toContain('The A/B test on this site has ended and counting has closed.');
    expect(stepText(h, 5)).toMatch(/Ship B\. .* Counting has closed\./);
  });

  it('a matching decision marker (the real reader)', async () => {
    const redis = createMemoryRedis();
    await seed(redis, FIXTURE_AB.namespace, SHIP_B);
    await mark(redis, FIXTURE_AB.namespace, 'decision', '2026-12-01');
    const m = toHomeModel(await read(redis, { config: FIXTURE_AB, now: AB_NOW }), 'b');
    expect(m).toMatchObject({ mode: 'ship-b', closedConfirmed: true });
    const h = expectClosed(m);
    expect(noteText(h)).toContain('has ended and counting has closed');
    expect(ariaLabels(h).some((l) => /until counting stopped/.test(l))).toBe(true);
  });

  it('a mismatching decision marker (the real reader): the closure check everywhere, no verdict', async () => {
    const redis = createMemoryRedis();
    await seed(redis, FIXTURE_AB.namespace, SHIP_B);
    await mark(redis, FIXTURE_AB.namespace, 'decision', '2026-12-03');
    const m = toHomeModel(await read(redis, { config: FIXTURE_AB, now: AB_NOW }), 'b');
    expect(m.mode).toBe('closure-check');
    const h = expectClosed(m);
    const sentence = 'Counting has stopped for this run. I am checking the stored result before showing it.';
    expect(noteText(h)).toContain(sentence);
    for (const n of [2, 3, 5]) expect(stepText(h, n)).toContain(sentence);
    expect(everything(h)).not.toMatch(VERDICTS);
    expect(everything(h)).not.toMatch(/paused|views counted/i);
  });

  it('an A/A flag-only marker (the real reader): the stopped calibration, no chart, no promise', async () => {
    const redis = createMemoryRedis();
    await mark(redis, FIXTURE_CALIBRATION.namespace, 'aa-failed', '2026-11-06');
    const m = toHomeModel(await read(redis, { config: FIXTURE_CALIBRATION, now: CAL_NOW }), 'a');
    expect(m.mode).toBe('aa-failed');
    const h = page(m);
    expect(noteText(h)).toContain('Calibration stopped on 06.11: I no longer have the note explaining why.');
    expect(stepText(h, 3)).toContain('Calibration stopped on 06.11: I no longer have the note explaining why.');
    expect(h).not.toContain('data-home-chart');
    expect(everything(h)).not.toMatch(STOPPED_PROMISES);
  });

  it('a derived decision with no marker yet (the real reader): being confirmed everywhere, never closed', async () => {
    const redis = createMemoryRedis();
    await seed(redis, FIXTURE_AB.namespace, SHIP_B);
    const m = toHomeModel(await read(redis, { config: FIXTURE_AB, now: AB_NOW }), 'b');
    expect(m).toMatchObject({ mode: 'ship-b', closed: null, closedConfirmed: false, countingClosed: true });
    const h = expectClosed(m);
    expect(noteText(h)).toContain('I am confirming the result.');
    expect(stepText(h, 5)).toMatch(/The result is being confirmed\./);
  });

  it('an unreadable snapshot before, at and after the planned end: note and steps agree, no update promised at the end, no result', async () => {
    const before = await placeholderAt(endPlus(-1));
    expect(before).toMatchObject({ mode: 'unavailable', countingClosed: false });
    const hb = page(before);
    const promise = 'The live counts could not be loaded. They will appear at the next update.';
    expect(noteText(hb)).toContain(promise);
    for (const n of [2, 3, 5]) expect(stepText(hb, n)).toContain(promise);
    for (const now of [END, endPlus(1), endPlus(86_400_000)]) {
      const m = await placeholderAt(now);
      expect(m).toMatchObject({ mode: 'unavailable', closedConfirmed: true, outcome: null });
      const h = expectClosed(m);
      const closed = 'The live counts could not be loaded, and counting has closed.';
      expect(noteText(h)).toContain(closed);
      for (const n of [2, 3, 5]) expect(stepText(h, n)).toContain(closed);
      expect(everything(h)).not.toMatch(/next update/i);
      expect(everything(h)).not.toMatch(VERDICTS);
      expect(h).not.toContain('data-home-chart');
    }
  });

  it('a held or closed drawn chart is named without "pause"; "counting stopped" only when held or confirmed', () => {
    for (const m of [mode('held'), mode('ship-b'), named('ship-b-confirmed'), named('paused-ship-b'), toHomeModel(buildFixture({ config: FIXTURE_AB, now: END, rows: BALANCED }), 'b')]) {
      const h = page(m);
      expect(h).toContain('data-home-chart');
      const chartLabels = all(doc(h), (el) => el.tagName === 'svg' && attr(el, 'aria-label') !== undefined).map((el) => attr(el, 'aria-label')!);
      expect(chartLabels.length).toBeGreaterThan(0);
      for (const l of chartLabels) {
        expect(l).not.toMatch(/pause/i);
        if (m.held === null && !m.closedConfirmed) expect(l).not.toMatch(/counting stopped/i);
      }
    }
  });
});

describe('small counts and stopped tests with little data', () => {
  const SMALL: readonly NarrativeFixture[] = ['ab-tiny', 'calibration-tiny', 'paused-tiny', 'srm-one-sided-small'];
  it.each(SMALL)('%s: "<5", never an exact 1 to 4, in the HTML or the payload', async (n) => {
    for (const arm of ARMS) {
      const m = named(n, arm);
      const h = page(m);
      expect(exactSmallCounts(h)).toEqual([]);
      expect(smallPayloadCounts(await pagePayload(m))).toEqual([]);
    }
  });

  it.each(['ab-tiny', 'calibration-tiny'] as const)('%s: the smaller group prints as "<5"', (n) => {
    expect(everything(page(named(n)))).toContain('<5');
  });

  it.each(['held-under-50', 'paused-under-50', 'closed-under-50', 'final-low', 'paused-tiny', 'held-enough-no-look'] as const)(
    '%s: no next look or first estimate is promised',
    (n) => {
      expect(everything(page(named(n)))).not.toMatch(/next look|first estimate/i);
    },
  );
});

describe('the "your view" tick: allowed only on a fresh running chart with no ceiling day', () => {
  const ticks = async (m: HomeModel, at: string = m.readAt) => shellCharts(await pagePayload(m, at)).map((c) => c?.tickFrom ?? null);

  it('a fresh A/B with enough data and no ceiling day: allowed, and the payload carries where the tick may start', async () => {
    const m = mode('ab');
    expect(homeTickAllowed(m, m.readAt)).toBe(true);
    expect(homeScrollProps(m, { tickAllowed: true }).charts[2]!.tickAllowed).toBe(true);
    const t = await ticks(m);
    expect(t.filter((x) => x !== null)).toHaveLength(1);
    expect(t[2]).toBeGreaterThanOrEqual(50);
  });

  it('a ceiling day: not allowed, and nothing in the payload lets the browser draw it', async () => {
    const m = toHomeModel(snapshotFixture('ab', { ceilingDays: ['2026-12-02'] }), 'b');
    expect(m.hasCeilingDay).toBe(true);
    expect(homeTickAllowed(m, m.readAt)).toBe(false);
    expect(await ticks(m)).toEqual([null, null, null, null, null]);
  });

  it('stale when rendered (enough data, no ceiling day otherwise): not allowed', async () => {
    const m = mode('ab');
    const late = plusMinutes(m.readAt, EXPERIMENT.staleAfterMinutes + 1);
    expect(homeTickAllowed(m, late)).toBe(false);
    expect(await ticks(m, late)).toEqual([null, null, null, null, null]);
    // The note says how old the data is.
    expect(noteText(page(m, late))).toMatch(/Updated/);
  });

  it.each([
    ['held', mode('held')],
    ['paused', mode('paused')],
    ['paused-ship-b', named('paused-ship-b')],
    ['ship-b (counting closed)', mode('ship-b')],
    ['inconclusive (counting closed)', mode('inconclusive')],
    ['the planned end reached', toHomeModel(buildFixture({ config: FIXTURE_AB, now: END, rows: BALANCED }), 'b')],
    ['before-data (low data)', mode('before-data')],
    ['ab-under-50 (low data)', named('ab-under-50')],
    ['calibration-under-50 (low data)', named('calibration-under-50')],
  ] as const)('%s: not allowed, and no tick start in the payload', async (_, m) => {
    expect(homeTickAllowed(m, m.readAt)).toBe(false);
    for (const c of homeScrollProps(m, { tickAllowed: homeTickAllowed(m, m.readAt) }).charts) if (c) expect(c.tickAllowed).toBe(false);
    expect((await ticks(m)).every((x) => x === null)).toBe(true);
  });

  it('each chart entry comes from the narrative helpers, with the label override and the published table', () => {
    const m = mode('held');
    const p = homeScrollProps(m, { tickAllowed: false });
    expect(p.arm).toBe(m.arm);
    expect(p.refs).toBe(m.refs);
    expect(p.steps.map((s) => s.heading)).toEqual(['Hypothesis', 'Split', 'Evidence', 'Guardrails', 'Decision']);
    expect(p.charts.map((c) => c !== null)).toEqual([false, false, true, false, false]);
    expect(p.charts[2]!.ariaLabel).toMatch(/until counting stopped/);
  });
});
