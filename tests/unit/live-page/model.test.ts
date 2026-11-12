// The Live test page's server projection: the server-only model (toLivePageModel) and the allowlisted
// display shape (toLivePageDisplay) that every Figure and island of the page receives. Every count
// the display holds is the published cell of the same count (publishedCount, the data.json rule),
// the kit is offered the exact snapshot only when every count it would print is 0 or at least 5, and
// nothing raw (p-values, chi-square, outcome counts) reaches the display.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { ExperimentConfig } from '@/experiment.config';
import { liveView, type LiveView } from '@/lib/experiment/live';
import { createMemoryRedis } from '@/lib/experiment/memory-redis';
import { toPublicData, type Cell, type PublicData } from '@/lib/experiment/public-data';
import type { ExperimentSnapshot } from '@/lib/experiment/snapshot';
import * as power from '@/lib/stats/power';
import { publishedCount } from '@/lib/home/counts';
import { FIXTURE_AB, FIXTURE_CALIBRATION, buildFixture, snapshotFixture, type FixtureRow } from '@/lib/home/fixtures';
import { toHomeModel, type HomeMode } from '@/lib/home/model';
import { NARRATIVE_FIXTURES, narrativeFixture } from '@/lib/home/narrative-fixtures';
import { toLivePageDisplay, toLivePageModel, type LivePageDisplay } from '@/lib/live-page/model';
import { AB_NOW, CAL_NOW } from './reader';

vi.mock('@/lib/stats/power', async (original) => {
  const actual = await original<typeof import('@/lib/stats/power')>();
  return { ...actual, detectableEffectCs: vi.fn(actual.detectableEffectCs) };
});

const ROOT = path.resolve(import.meta.dirname, '../../..');
const source = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

const MODES: readonly HomeMode[] = [
  'not-started', 'closure-check', 'unavailable', 'settings-unreadable', 'held', 'srm-suppressed', 'aa-failed',
  'paused', 'before-data', 'calibration', 'ab', 'ship-b', 'stop-for-harm', 'inconclusive',
];
const BUILD = { commit: 'abc1234' };
const configOf = (s: ExperimentSnapshot): ExperimentConfig => (s.configPhase === 'ab' ? FIXTURE_AB : FIXTURE_CALIBRATION);
const project = (s: ExperimentSnapshot) => toLivePageModel(s, BUILD, configOf(s));
const display = (s: ExperimentSnapshot) => toLivePageDisplay(project(s));
const ALL: [string, ExperimentSnapshot][] = [
  ...MODES.map((m) => [m, snapshotFixture(m)] as [string, ExperimentSnapshot]),
  ...NARRATIVE_FIXTURES.map((n) => [n, narrativeFixture(n)] as [string, ExperimentSnapshot]),
];

/** A snapshot in the A/B whose current counts are nA and nB (one day row, not yet a completed look). */
const abAt = (nA: number, nB: number) =>
  buildFixture({ config: FIXTURE_AB, now: AB_NOW, rows: [{ day: '2026-12-03', a: { entry: nA, inview: nA, engaged: nA }, b: { entry: nB, inview: nB, engaged: nB } }] });

/** Every count field of the display, by name. */
function countFields(d: LivePageDisplay): [string, Cell][] {
  const out: [string, Cell][] = [
    ['counts.a', d.counts.a],
    ['counts.b', d.counts.b],
    ['counts.smaller', d.counts.smaller],
  ];
  if (d.split) for (const b of ['entry', 'analysed'] as const) out.push([`split.${b}.a`, d.split[b].a], [`split.${b}.b`, d.split[b].b]);
  d.series.forEach((p, i) => out.push([`series.${i}.nA`, p.nA], [`series.${i}.nB`, p.nB]));
  for (const g of ['a', 'b'] as const) out.push([`public.current.${g}.entry`, d.public.current[g].entry], [`public.current.${g}.inview`, d.public.current[g].inview]);
  d.public.looks.forEach((l, i) => {
    for (const g of ['a', 'b'] as const) out.push([`public.looks.${i}.${g}.entry`, l[g].entry], [`public.looks.${i}.${g}.inview`, l[g].inview]);
  });
  for (const [r, c] of Object.entries(d.public.funnel.excluded)) out.push([`public.funnel.excluded.${r}`, c]);
  if (d.kitSnapshot) {
    const k = d.kitSnapshot;
    out.push(['kit.nA', k.nA], ['kit.nB', k.nB]);
    k.series.forEach((p, i) => out.push([`kit.series.${i}.nA`, p.nA], [`kit.series.${i}.nB`, p.nB]));
    if (k.yourViewN !== undefined) out.push(['kit.yourViewN', k.yourViewN]);
  }
  return out;
}

/** The published cell the shown counts rest on (the snapshot's `live.nA`/`nB`), found in the data. */
function shownCells(data: PublicData): { a: Cell; b: Cell } {
  const last = data.looks[data.looks.length - 1];
  if (data.configPhase === 'ab' && data.srm.flaggedLook !== null) return { a: data.srm.flaggedLook.a.inview, b: data.srm.flaggedLook.b.inview };
  const ended = data.held !== null || data.frozenAt !== null;
  if (ended) return last ? { a: last.a.inview, b: last.b.inview } : { a: 0, b: 0 };
  return { a: data.current.a.inview, b: data.current.b.inview };
}
const smallerOf = (a: Cell, b: Cell): Cell => (a === 0 || b === 0 ? 0 : a === '<5' || b === '<5' ? '<5' : Math.min(a, b));

/** A seeded pseudo-random generator, so a failure names its case. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const SIZES = [0, 1, 2, 3, 4, 5, 6, 20, 49, 50, 51, 60, 120, 300];
function randomRows(r: () => number, days: readonly string[]): FixtureRow[] {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const group = () => {
    const inview = pick(SIZES);
    const entry = inview + pick([0, 1, 3, 20]);
    const card = r() < 0.08 ? inview + 5 : Math.min(inview, pick([0, 1, 3, 10, 40]));
    return { entry, inview, engaged: Math.min(entry, inview + pick([0, 2])), card, cv: pick([0, 1, 6]), contact: pick([0, 2, 7]) };
  };
  return days.filter(() => r() < 0.8).map((day) => ({ day, a: group(), b: group() }));
}
function randomSnapshot(seed: number): ExperimentSnapshot {
  const r = rng(seed);
  if (r() < 0.5) {
    const days = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-19', '2026-11-20'];
    return buildFixture({ config: FIXTURE_CALIBRATION, now: CAL_NOW, rows: randomRows(r, days) });
  }
  const now = r() < 0.8 ? AB_NOW : '2027-06-02T12:00:00+02:00';
  return buildFixture({ config: FIXTURE_AB, now, rows: randomRows(r, ['2026-12-01', '2026-12-02', '2026-12-03']) });
}

/** Every key anywhere in a JSON value. */
const keysIn = (v: unknown): string[] => [...JSON.stringify(v).matchAll(/"([^"]+)":/g)].map((m) => m[1]!);

describe('the server-only model', () => {
  it('is guarded by server-only, imported first', () => {
    const src = source('src/lib/live-page/model.ts');
    const firstImport = src.match(/^import\s[^\n]*$/m)?.[0];
    expect(firstImport).toBe("import 'server-only';");
  });

  it('is never a value import of a client module', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
        const f = `${d}/${e.name}`;
        if (e.isDirectory()) walk(f);
        else if (/\.tsx?$/.test(e.name)) files.push(f);
      }
    };
    walk('src');
    const client = files.filter((f) => /^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*['"]use client['"]/.test(source(f)));
    expect(client.length).toBeGreaterThan(0);
    for (const f of client) {
      for (const m of source(f).matchAll(/^\s*import\s+(type\s+)?[^;'"]*?from\s*['"]([^'"]+)['"]/gm)) {
        if (/live-page\/(model|next-step)$/.test(m[2]!)) expect(m[1], `${f} imports ${m[2]}`).toBeDefined();
      }
    }
  });

  it('calls toHomeModel, liveView and toPublicData for group A, refs preserved', () => {
    for (const [, s] of ALL) {
      const m = project(s);
      expect(m.home).toEqual(toHomeModel(s, 'a'));
      expect(m.view).toEqual(liveView(s, 'a'));
      expect(m.data).toEqual(toPublicData(s, BUILD, configOf(s)));
      expect(m.home.refs).toEqual(m.view.refs);
    }
  });

  it('builds on the actual LiveView, whose keys are exactly these', () => {
    expectTypeOf<keyof LiveView>().toEqualTypeOf<'snapshot' | 'refs' | 'state' | 'body' | 'testNote' | 'namespace' | 'readAt'>();
    expect(Object.keys(project(snapshotFixture('ab')).view).sort()).toEqual(['body', 'namespace', 'readAt', 'refs', 'snapshot', 'state', 'testNote']);
  });

  it('gives no test note before the start, and keeps unavailable apart from paused', () => {
    const notStarted = project(snapshotFixture('not-started'));
    expect(notStarted.view.testNote).toBeNull();
    expect(notStarted.home.testNote).toBeNull();
    const unavailable = toLivePageDisplay(project(snapshotFixture('unavailable')));
    expect(unavailable).toMatchObject({ mode: 'unavailable', paused: null });
    expect(toLivePageDisplay(project(snapshotFixture('paused')))).toMatchObject({ mode: 'paused', paused: { reason: 'I am updating the page' } });
  });
});

describe('small counts: one rule, the published cell', () => {
  it('uses publishedCount from the Home counts module, and no other small-count mapping exists here', () => {
    expect(source('src/lib/live-page/model.ts')).toMatch(/import \{[^}]*\bpublishedCount\b[^}]*\} from '@\/lib\/home\/counts';/);
    for (const f of readdirSync(path.join(ROOT, 'src/lib/live-page'))) {
      const src = source(`src/lib/live-page/${f}`).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
      expect(src, f).not.toMatch(/['"]<5['"]|smallCellBelow|[<>]=?\s*5\b|\b5\s*[<>]/);
    }
  });

  it.each([0, 1, 4, 5, 49, 50])('the fixed case %i matches its published cell', (n) => {
    const d = display(abAt(n, n));
    const data = project(abAt(n, n)).data;
    expect(d.counts).toEqual({ a: publishedCount(n), b: publishedCount(n), smaller: publishedCount(n) });
    expect([d.counts.a, d.counts.b]).toEqual([data.current.a.inview, data.current.b.inview]);
  });

  it('every count of the display equals the matching published cell (random snapshots)', () => {
    let checked = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const s = randomSnapshot(seed);
      const m = project(s);
      const d = toLivePageDisplay(m);
      const data = m.data;
      const shown = shownCells(data);
      expect([d.counts.a, d.counts.b], `seed ${seed}`).toEqual([shown.a, shown.b]);
      expect(d.counts.smaller, `seed ${seed}`).toEqual(smallerOf(shown.a, shown.b));
      if (d.split) {
        const f = data.srm.flaggedLook!;
        expect(d.split.entry, `seed ${seed}`).toEqual({ a: f.a.entry, b: f.b.entry });
        expect(d.split.analysed, `seed ${seed}`).toEqual({ a: f.a.inview, b: f.b.inview });
      }
      for (const p of d.series) {
        expect(data.looks.some((l) => l.a.inview === p.nA && l.b.inview === p.nB), `seed ${seed}`).toBe(true);
      }
      expect(d.public.current).toEqual(data.current);
      expect(d.public.funnel).toEqual(data.funnel);
      expect(d.public.looks).toEqual(data.looks.map((l) => ({ day: l.day, a: { entry: l.a.entry, inview: l.a.inview }, b: { entry: l.b.entry, inview: l.b.inview } })));
      for (const [name, c] of countFields(d)) {
        expect(typeof c === 'number' && c >= 1 && c <= 4, `seed ${seed}: ${name} = ${String(c)}`).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(3000);
  });

  it('(1, 4): kit not safe, and no 1 or 4 in any count field', () => {
    const d = display(abAt(1, 4));
    expect(d.kitSafe).toBe(false);
    expect(d.kitSnapshot).toBeNull();
    expect(d.counts).toEqual({ a: '<5', b: '<5', smaller: '<5' });
    for (const [name, c] of countFields(d)) expect([1, 2, 3, 4], name).not.toContain(c);
    expect(JSON.stringify(d)).not.toMatch(/"(nA|nB)":[1-4]\b/);
  });

  it.each([
    [0, 5],
    [49, 50],
  ])('(%i, %i): the kit is safe and gets the exact snapshot', (a, b) => {
    const m = project(abAt(a, b));
    const d = toLivePageDisplay(m);
    expect(d.kitSafe).toBe(true);
    expect(d.kitSnapshot).toEqual(m.view.snapshot);
    expect([d.kitSnapshot!.nA, d.kitSnapshot!.nB]).toEqual([a, b]);
  });

  it('a series whose first look had 3 views is not safe for the kit', () => {
    const s = snapshotFixture('ab');
    const point = (nA: number, nB: number) => ({ n: Math.min(nA, nB), nA, nB, lower: -10, upper: 10, estimate: 0 });
    const d = display({ ...s, live: { ...s.live, nA: 60, nB: 70, series: [point(3, 60), point(60, 70)] } });
    expect(d.kitSafe).toBe(false);
    expect(d.kitSnapshot).toBeNull();
    expect(d.series.map((p) => [p.nA, p.nB])).toEqual([[60, 70]]);
  });

  it('a visitor tick of 1 to 4 views is not safe for the kit', () => {
    const s = abAt(60, 70);
    expect(display({ ...s, live: { ...s.live, yourViewN: 3 } }).kitSafe).toBe(false);
    expect(display({ ...s, live: { ...s.live, yourViewN: 61 } }).kitSafe).toBe(true);
  });

  it('a failed split prints its published cells, small ones as "<5"', () => {
    const s = buildFixture({ config: FIXTURE_AB, now: AB_NOW, rows: [{ day: '2026-12-01', a: { entry: 60, inview: 3, engaged: 3 }, b: { entry: 4, inview: 2, engaged: 2 } }] });
    const d = display(s);
    expect(d.mode).toBe('srm-suppressed');
    expect(d.split).toEqual({ base: 'entry', day: '2026-12-01', entry: { a: 60, b: '<5' }, analysed: { a: '<5', b: '<5' } });
  });
});

describe('check facts are copied, never inferred', () => {
  it('calibration readiness comes from the check, not from the interval or the evaluation day', () => {
    const cal = snapshotFixture('calibration');
    const variants: [boolean, string | null][] = [
      [false, null],
      [false, '2026-11-16'],
      [true, '2026-11-16'],
    ];
    for (const [ready, evaluatedOn] of variants) {
      const s = { ...cal, primary: { estimate: 0, lower: -0.05, upper: 0.05 }, calibration: { ...cal.calibration!, ready, evaluatedOn } };
      expect(display(s).calibration).toEqual({ ready, evaluatedOn });
    }
    expect(display(snapshotFixture('ab')).calibration).toBeNull();
  });

  it('maps each split result: null not evaluated, unflagged passed, flagged failed', () => {
    const cal = snapshotFixture('calibration');
    const r = (flagged: boolean) => ({ chi2: 1, p: 0.5, flagged });
    expect(display({ ...cal, srm: { ...cal.srm, assignment: null, analysed: null } }).splitStatus).toEqual({ entry: 'not-evaluated', analysed: 'not-evaluated' });
    expect(display({ ...cal, srm: { ...cal.srm, assignment: r(false), analysed: r(false) } }).splitStatus).toEqual({ entry: 'passed', analysed: 'passed' });
    expect(display({ ...cal, srm: { ...cal.srm, assignment: r(true), analysed: r(false) } }).splitStatus).toEqual({ entry: 'failed', analysed: 'passed' });
  });

  it.each(ALL)('%s: the display carries no p-value, chi-square or raw outcome count', (_name, s) => {
    const k = keysIn(display(s));
    for (const bad of ['p', 'chi2', 'card', 'engaged', 'secondary', 'cv', 'contact', 'itt', 'finalDescriptive', 'botFiltered', 'beaconsReceived', 'analysed_total']) {
      expect(k, bad).not.toContain(bad);
    }
    expect(k).not.toContain('namespace');
  });
});

describe('statistics and finiteness', () => {
  it('a snapshot with no views never asks for the detectable effect at zero, and the projection asks for none', () => {
    const spy = vi.mocked(power.detectableEffectCs);
    spy.mockClear();
    const s = buildFixture({ config: FIXTURE_CALIBRATION, now: CAL_NOW, rows: [] });
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    for (const [args] of spy.mock.calls) expect(args.nPerArm).toBeGreaterThanOrEqual(FIXTURE_CALIBRATION.minPerGroup);
    spy.mockClear();
    const d = display(s);
    expect(spy).not.toHaveBeenCalled();
    expect(d.public.detectable).toMatchObject({ atCurrent: null, atCurrentNote: 'no-views' });
  });

  it('rejects a non-finite curve, interval or series before anything is displayed', () => {
    const s = snapshotFixture('ab');
    const curve = { ...s, detectable: { ...s.detectable, points: [{ nPerArm: 50, effect: Number.POSITIVE_INFINITY }] } };
    expect(() => display(curve)).toThrow(TypeError);
    const at = { ...s, live: { ...s.live, nA: 60, nB: 60 }, detectable: { ...s.detectable, atCurrent: Number.NaN } };
    expect(() => display(at)).toThrow(TypeError);
    const series = { ...s, live: { ...s.live, series: [{ n: 60, nA: 60, nB: 60, lower: Number.NaN, upper: 1, estimate: 0 }] } };
    expect(() => display(series)).toThrow(TypeError);
  });
});

describe('closure facts', () => {
  it('copies closedConfirmed and the stored stop day of a closure check (the real reader)', async () => {
    const { mark, read } = await import('./reader');
    const redis = createMemoryRedis();
    await mark(redis, FIXTURE_AB.namespace, 'decision', '2026-12-02');
    const d = display(await read(redis, { config: FIXTURE_AB, now: AB_NOW }));
    expect(d).toMatchObject({ mode: 'closure-check', closedOn: '2026-12-02', closedConfirmed: true, outcome: null });
    expect(display(snapshotFixture('ab')).closedOn).toBeNull();
  });
});
