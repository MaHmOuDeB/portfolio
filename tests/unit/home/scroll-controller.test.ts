// The scroll moment's interaction, as pure parts: the controller that joins the step navigation and
// the step observer (the navigation sets the step at once and scrolls; the observer is ignored until
// that scroll settles), the observer's trigger band, the counted-view event filter and the "your view"
// tick's gate. The browser half (real keys, focus, the sticky stage, the cross-fade, the lazy chart) is
// in tests/e2e/home-scroll.spec.ts.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scrollMomentProps } from '@/app/kitchen-sink/home/fixtures';
import { tickFrom, type ScrollChart } from '@/components/home/ScrollMoment';
import { confidenceModel } from '@/lib/figure/cs-band';
import { snapshotFixture } from '@/lib/home/fixtures';
import { toHomeModel, type HomeMode, type HomeModel } from '@/lib/home/model';
import { NARRATIVE_FIXTURES, narrativeFixture, type NarrativeFixture } from '@/lib/home/narrative-fixtures';
import {
  BAND,
  SETTLE_FALLBACK_MS,
  acceptedViewN,
  bandMargin,
  createScrollController,
  withYourView,
} from '@/lib/home/scroll-controller';

function recorder() {
  const log: string[] = [];
  const controller = createScrollController({
    setCurrent: (step) => log.push(`set:${step}`),
    scrollTo: (step, instant) => log.push(instant ? `scroll:${step}:instant` : `scroll:${step}`),
  });
  return { log, controller };
}

describe('createScrollController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sets the step at once and scrolls; the observer is ignored until the scroll settles', () => {
    const { log, controller } = recorder();
    controller.fromNav(2, false);
    controller.fromObserver(1);
    expect(log).toEqual(['set:2', 'scroll:2']);
    controller.settled();
    controller.fromObserver(3);
    expect(log).toEqual(['set:2', 'scroll:2', 'set:3']);
    controller.dispose();
  });

  it('sets the step before it asks for the scroll, inside the same call', () => {
    const order: string[] = [];
    const controller = createScrollController({
      setCurrent: () => order.push('set'),
      scrollTo: () => order.push('scroll'),
    });
    controller.fromNav(4, false);
    expect(order).toEqual(['set', 'scroll']);
    controller.dispose();
  });

  it('passes an instant scroll through (reduced motion)', () => {
    const { log, controller } = recorder();
    controller.fromNav(5, true);
    expect(log).toEqual(['set:5', 'scroll:5:instant']);
    controller.dispose();
  });

  it('only the step navigation scrolls: the observer never does', () => {
    const { log, controller } = recorder();
    for (const step of [1, 2, 3, 4, 5, 4]) controller.fromObserver(step);
    expect(log).toEqual(['set:1', 'set:2', 'set:3', 'set:4', 'set:5', 'set:4']);
    controller.dispose();
  });

  it(`stops ignoring the observer ${SETTLE_FALLBACK_MS} ms after the navigation when no scrollend comes`, () => {
    expect(SETTLE_FALLBACK_MS).toBe(1000);
    const { log, controller } = recorder();
    controller.fromNav(4, false);
    vi.advanceTimersByTime(SETTLE_FALLBACK_MS - 1);
    controller.fromObserver(2);
    expect(log).toEqual(['set:4', 'scroll:4']);
    vi.advanceTimersByTime(1);
    controller.fromObserver(2);
    expect(log).toEqual(['set:4', 'scroll:4', 'set:2']);
    controller.dispose();
  });

  it('a second navigation during the scroll starts a fresh wait and leaves one timer', () => {
    const { log, controller } = recorder();
    controller.fromNav(2, false);
    vi.advanceTimersByTime(800);
    controller.fromNav(3, false);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(800);
    controller.fromObserver(1);
    expect(log).toEqual(['set:2', 'scroll:2', 'set:3', 'scroll:3']);
    vi.advanceTimersByTime(200);
    controller.fromObserver(1);
    expect(log.at(-1)).toBe('set:1');
    controller.dispose();
  });

  it('settling clears the fallback timer', () => {
    const { controller } = recorder();
    controller.fromNav(2, false);
    expect(vi.getTimerCount()).toBe(1);
    controller.settled();
    expect(vi.getTimerCount()).toBe(0);
    controller.dispose();
  });

  it('dispose clears its timer and ignores every later call', () => {
    const { log, controller } = recorder();
    controller.fromNav(2, false);
    controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
    controller.fromNav(3, false);
    controller.fromObserver(4);
    controller.settled();
    vi.advanceTimersByTime(SETTLE_FALLBACK_MS * 2);
    expect(log).toEqual(['set:2', 'scroll:2']);
  });

  it.each([Number.NaN, 0, -1, 2.5, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('ignores a step that is not a whole number from 1 (%s)', (bad) => {
    const { log, controller } = recorder();
    controller.fromNav(bad, false);
    controller.fromObserver(bad);
    expect(log).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    controller.dispose();
  });
});

describe('the trigger band', () => {
  it('is the band 45% to 50% down the screen when the stage sits beside the steps', () => {
    expect(BAND).toBe('-45% 0px -50% 0px');
    expect(bandMargin({ kind: 'beside' }, 768)).toBe(BAND);
  });

  // The phone's stage (40svh and about 163 px) covers the top of the screen: the same band, taken
  // from the part the stage leaves visible, so the current step is always one the reader can see.
  it.each([
    { vh: 667, stuckBottom: 430 },
    { vh: 800, stuckBottom: 483 },
    { vh: 1024, stuckBottom: 636 },
    { vh: 640, stuckBottom: 419 },
  ])('lies below a stage above the steps ($vh px screen, stage ends at $stuckBottom px)', ({ vh, stuckBottom }) => {
    const margin = bandMargin({ kind: 'above', stuckBottom }, vh);
    const m = /^-(\d+(?:\.\d+)?)px 0px -(\d+(?:\.\d+)?)px 0px$/.exec(margin);
    expect(m, margin).not.toBeNull();
    const top = Number(m![1]);
    const bottom = vh - Number(m![2]);
    expect(top).toBeGreaterThanOrEqual(stuckBottom);
    expect(bottom).toBeGreaterThan(top);
    expect(bottom).toBeLessThanOrEqual(vh);
    const room = vh - stuckBottom;
    expect(top).toBeCloseTo(stuckBottom + 0.45 * room, 1);
    expect(bottom).toBeCloseTo(stuckBottom + 0.5 * room, 1);
  });

  it('never gives a band of no height, even with no room under the stage', () => {
    for (const stuckBottom of [667, 700, Number.NaN]) {
      const margin = bandMargin({ kind: 'above', stuckBottom }, 667);
      const m = /^-(\d+(?:\.\d+)?)px 0px -(\d+(?:\.\d+)?)px 0px$/.exec(margin)!;
      expect(667 - Number(m[2]) - Number(m[1])).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('the counted-view event', () => {
  it('gives the views of a counted view of this group: a finite, positive number', () => {
    expect(acceptedViewN({ arm: 'b', viewN: 312 }, 'b')).toBe(312);
    expect(acceptedViewN({ arm: 'a', viewN: 1 }, 'a')).toBe(1);
  });

  it.each([
    [{ arm: 'a', viewN: 312 }, 'another group'],
    [{ arm: 'b' }, 'no count'],
    [{ arm: 'b', viewN: 0 }, 'zero'],
    [{ arm: 'b', viewN: -4 }, 'negative'],
    [{ arm: 'b', viewN: Number.NaN }, 'NaN'],
    [{ arm: 'b', viewN: Number.POSITIVE_INFINITY }, 'infinite'],
    [{ arm: 'b', viewN: '312' }, 'a string'],
    [null, 'no detail'],
    ['b', 'not an object'],
  ] as [unknown, string][])('refuses %j (%s)', (detail) => {
    expect(acceptedViewN(detail, 'b')).toBeNull();
  });
});

// Fixtures as the Home page composes them, with the tick allowed by the server unless stated.
const simulated = (m: HomeModel): HomeModel => ({ ...m, refs: ['simulated'] });
const model = (m: HomeMode | NarrativeFixture): HomeModel =>
  simulated(toHomeModel((NARRATIVE_FIXTURES as readonly string[]).includes(m) ? narrativeFixture(m as NarrativeFixture) : snapshotFixture(m as HomeMode), 'b'));
const evidence = (m: HomeModel, tickAllowed = true): ScrollChart | null => {
  const c = scrollMomentProps(m).charts[2];
  return c ? { ...c, tickAllowed } : null;
};

describe('tickFrom: where the server lets the tick start', () => {
  it('a running chart with enough data and the tick allowed: from the last look drawn', () => {
    for (const mode of ['ab', 'calibration'] as const) {
      const chart = evidence(model(mode))!;
      const cm = confidenceModel(chart.snapshot)!;
      expect(tickFrom(chart), mode).toBe(cm.current.n);
      expect(cm.current.n).toBeGreaterThanOrEqual(50);
    }
  });

  it('nowhere when the server did not allow it (a ceiling day, a stale page)', () => {
    expect(tickFrom(evidence(model('ab'), false)!)).toBeNull();
  });

  // Even if the server allowed it by mistake: a stopped chart (held, paused, closed), a stale one, a
  // decided one, low data and a hidden verdict get no tick.
  it.each(['held', 'paused', 'before-data', 'ship-b', 'stop-for-harm', 'inconclusive', 'ab-under-50', 'calibration-under-50', 'ab-asymmetric', 'paused-ship-b', 'held-srm', 'stale'] as const)('%s: no tick', (mode) => {
    const chart = evidence(model(mode));
    if (chart !== null) expect(tickFrom(chart)).toBeNull();
  });

  it('nowhere when any count the chart prints is under 50', () => {
    const chart = evidence(model('ab'))!;
    const s = chart.snapshot;
    const low = { ...chart, snapshot: { ...s, series: s.series.map((p, i) => (i === 0 ? { ...p, nA: 49 } : p)) } };
    expect(tickFrom(low)).toBeNull();
    expect(tickFrom({ ...chart, snapshot: { ...s, nB: 49 } })).toBeNull();
  });
});

describe('withYourView: the snapshot the chart draws', () => {
  const chart = evidence(model('ab'))!;
  const from = tickFrom(chart)!;

  it('carries the views only with a start and a count at or past it', () => {
    expect(withYourView(chart.snapshot, from, from).yourViewN).toBe(from);
    expect(withYourView(chart.snapshot, from, from + 7).yourViewN).toBe(from + 7);
  });

  it('never before the last look drawn, and never without a start: the same snapshot, with no views key', () => {
    for (const [start, viewN] of [[from, from - 1], [from, 1], [null, from + 7], [from, null], [null, null]] as const) {
      const out = withYourView(chart.snapshot, start, viewN);
      expect(out).toBe(chart.snapshot);
      expect('yourViewN' in out).toBe(false);
    }
  });

  it('the kit then draws the tick at min(views, end of the axis)', () => {
    const cm = confidenceModel(chart.snapshot)!;
    const xMax = cm.x.domain[1];
    for (const viewN of [from, Math.floor((from + xMax) / 2), Math.ceil(xMax) + 500, 1e9]) {
      expect(confidenceModel(withYourView(chart.snapshot, from, viewN))!.yourViewN, String(viewN)).toBe(Math.min(viewN, xMax));
    }
  });

  it('leaves the counts as they are', () => {
    const before = JSON.stringify(chart.snapshot);
    withYourView(chart.snapshot, from, from + 3);
    expect(JSON.stringify(chart.snapshot)).toBe(before);
  });
});

describe('the interaction sources', () => {
  const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
  const code = (path: string) => read(path).replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const CLIENT = ['src/lib/home/scroll-controller.ts', 'src/components/home/ScrollShell.tsx'];

  it.each(CLIENT)('%s keeps nothing: no storage, no cookie', (path) => {
    const src = code(path);
    for (const api of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'caches.', 'cookieStore']) expect(src, api).not.toContain(api);
  });

  it.each(CLIENT)('%s imports no server-only model or reader, and no chart code', (path) => {
    const src = code(path);
    expect(src).not.toMatch(/from '@\/lib\/experiment\/live'/);
    expect(src).not.toMatch(/^import (?!type)[^;]*from '@\/lib\/home\/(model|scroll)'/m);
    expect(src).not.toMatch(/^import (?!type)[^;]*from '@\/(lib\/figure\/cs-band|components\/kit\/ConfidenceChart)'/m);
    expect(src).not.toMatch(/^import (?!type)[^;]*from '(\.\/HomeChart|@\/components\/home\/HomeChart)'/m);
    expect(src).not.toMatch(/innerHeight|outerHeight|visualViewport/);
  });

  it('the shell listens for the counted view in a layout effect, which runs before any page effect posts the view', () => {
    const src = code('src/components/home/ScrollShell.tsx');
    expect(src).toMatch(/useLayoutEffect\([\s\S]{0,400}addEventListener\('experiment:counted'/);
    expect(src).toMatch(/removeEventListener\('experiment:counted'/);
  });

  it('the held-key guard wraps the step navigation in the capture phase', () => {
    const src = code('src/components/home/ScrollShell.tsx');
    expect(src).toMatch(/onKeyDownCapture=/);
    expect(src).toMatch(/e\.repeat/);
  });

  it('the chart code reaches the shell only through a dynamic import', () => {
    const src = code('src/components/home/ScrollShell.tsx');
    expect(src).toMatch(/import\('\.\/HomeChart'\)/);
  });
});
