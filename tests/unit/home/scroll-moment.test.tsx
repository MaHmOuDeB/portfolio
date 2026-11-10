// The Home scroll moment's server-rendered shell (ScrollMoment) and its chart wrapper (HomeChart):
// the markup both layouts share before any script runs. The sticky shell and the stacked frames are
// in the HTML together; CSS alone picks one (globals.css), so this checks what CSS chooses from:
// one stage with one canvas chart, one stacked frame per step that has a chart, one chart Figure
// whose title, caption and badge sit outside the canvas, one set of tables, no repeated id, the
// step bodies once each, and the chart drawn at its fixed size until the browser measures it.
// The layouts themselves, the sizing in the browser and the layout-shift bounds are in
// tests/e2e/home-scroll.spec.ts.
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import { describe, expect, it } from 'vitest';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS } from '../../../src/lib/facts/facts.generated.ts';
import { BROKEN_LABEL } from '@/app/kitchen-sink/home/ChartErrorMoment';
import { CHART_ERROR_STATE, scrollMomentProps, SCROLL_STATES } from '@/app/kitchen-sink/home/fixtures';
import { HomeChart, chartLayout, plotHeight } from '@/components/home/HomeChart';
import { ScrollMoment, ScrollMomentView, type ScrollMomentProps } from '@/components/home/ScrollMoment';
import type { ScrollShellProps } from '@/components/home/ScrollShell';
import { snapshotFixture } from '@/lib/home/fixtures';
import { toHomeModel, type HomeMode, type HomeModel } from '@/lib/home/model';
import { narrativeFixture, type NarrativeFixture } from '@/lib/home/narrative-fixtures';
import { homeChartTable } from '@/lib/home/scroll';

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
function text(node: T.ParentNode): string {
  return node.childNodes.map((c) => (c.nodeName === '#text' ? (c as T.TextNode).value : 'childNodes' in c ? text(c as T.ParentNode) : '')).join('');
}
const within = (root: El, test: (el: El) => boolean) => all(root, test);

const simulated = (m: HomeModel): HomeModel => ({ ...m, refs: ['simulated'] });
const mode = (m: HomeMode) => simulated(toHomeModel(snapshotFixture(m), 'b'));
const html = (m: HomeModel) => renderToStaticMarkup(<ScrollMoment {...scrollMomentProps(m)} />);
const audit = (h: string) => auditHtml(h, { route: '/v/b', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] });

/** The states with a chart the kit may draw: the enough-data A/B and calibration, the kit's collecting row, a stopped chart. */
const WITH_CHART: readonly HomeModel[] = [mode('ab'), mode('calibration'), mode('before-data'), mode('ship-b'), mode('held')];
/** States whose Evidence step draws no kit chart: small counts, a placeholder, a failed split, a stopped test with no look. */
const WITHOUT_CHART: readonly HomeModel[] = [
  simulated(toHomeModel(narrativeFixture('ab-tiny'), 'b')),
  mode('not-started'),
  mode('srm-suppressed'),
  simulated(toHomeModel(narrativeFixture('held-under-50'), 'b')),
];

describe('ScrollMoment: the server markup both layouts share', () => {
  it.each(WITH_CHART.map((m) => [m.mode, m] as const))('%s: one stage, one canvas chart and one stacked frame per chart step', (_, m) => {
    const d = doc(html(m));
    const [moment, ...more] = all(d, has('data-scroll-moment'));
    expect(more).toHaveLength(0);
    expect(attr(moment!, 'data-scroll-moment')).toBe('sticky');
    const stages = all(d, has('data-scroll-stage'));
    expect(stages).toHaveLength(1);
    const canvases = within(stages[0]!, has('data-scroll-canvas'));
    expect(canvases).toHaveLength(1);
    expect(within(canvases[0]!, has('data-home-chart'))).toHaveLength(1);
    // The step navigation sits in the stage, after the canvas, never inside it.
    expect(within(stages[0]!, has('data-step-nav'))).toHaveLength(1);
    expect(within(canvases[0]!, has('data-step-nav'))).toHaveLength(0);
    // Only the Evidence step draws a live chart, so there is one stacked frame, in step 3.
    const frames = all(d, has('data-stacked-frame'));
    expect(frames.map((f) => attr(f, 'data-stacked-frame'))).toEqual(['3']);
    expect(attr(frames[0]!, 'id')).toBe('home-frame-3');
    expect(within(frames[0]!, has('data-home-chart'))).toHaveLength(1);
    const step3 = all(d, has('data-scroll-step', '3'))[0]!;
    expect(within(step3, has('data-stacked-frame'))).toHaveLength(1);
  });

  it.each(WITH_CHART.map((m) => [m.mode, m] as const))('%s: one chart Figure, its title, caption and badge outside the canvas', (_, m) => {
    const d = doc(html(m));
    const figures = all(d, has('data-figure', 'home-chart'));
    expect(figures).toHaveLength(1);
    const figure = figures[0]!;
    // The Figure frames the whole shell: its title comes before the stage and the steps, its caption
    // (with the badge and the table) after the last step.
    const title = all(figure, (el) => attr(el, 'id') === 'home-chart-title')[0]!;
    expect(squash(text(title))).toBe('The difference between the groups.');
    const canvas = all(d, has('data-scroll-canvas'))[0]!;
    expect(within(canvas, (el) => el.tagName === 'figcaption' || /^h[1-6]$/.test(el.tagName))).toHaveLength(0);
    expect(squash(text(canvas))).not.toMatch(/Simulated|Live from this site/);
    expect(within(canvas, (el) => el.tagName === 'table' || el.tagName === 'details')).toHaveLength(0);
    // Its own caption is its last child; the step diagrams nested in its body have their own.
    const caption = figure.childNodes.filter((c): c is El => 'tagName' in c && c.tagName === 'figcaption');
    expect(caption).toHaveLength(1);
    expect(squash(text(caption[0]!))).toContain('confidence sequence of B − A in percentage points');
    // The band is the running intersection: a look can leave it as it was (no new views), never wider.
    expect(squash(text(caption[0]!))).toContain('confidence sequence of B − A in percentage points, never widened at a look.');
    expect(squash(text(caption[0]!))).not.toContain('narrowed at each look');
    expect(squash(text(caption[0]!))).toContain('Simulated');
    // The live chart's numbers: one open table (no-JS) and one folded table (JS), both in the caption;
    // CSS shows one. No other table in the moment carries the chart's caption.
    const captionOf = (t: El) => attr(all(t, (el) => el.tagName === 'caption')[0]!, 'id') ?? '';
    const tables = all(d, (el) => el.tagName === 'table' && captionOf(el).startsWith('home-chart-'));
    expect(tables.map(captionOf).sort()).toEqual(['home-chart-table-caption', 'home-chart-table-open-caption']);
    const chartCaption = squash(text(all(tables[0]!, (el) => el.tagName === 'caption')[0]!));
    const sameCaption = all(d, (el) => el.tagName === 'caption' && squash(text(el)) === chartCaption);
    expect(sameCaption).toHaveLength(2);
    for (const t of tables) expect(contains(caption[0]!, t)).toBe(true);
  });

  it.each(WITHOUT_CHART.map((m) => [m.mode, m] as const))('%s: no kit chart, so no stage, no chart Figure and the stacked layout only', (_, m) => {
    const d = doc(html(m));
    expect(attr(all(d, has('data-scroll-moment'))[0]!, 'data-scroll-moment')).toBe('stacked');
    expect(all(d, has('data-scroll-stage'))).toHaveLength(0);
    expect(all(d, has('data-stacked-frame'))).toHaveLength(0);
    expect(all(d, has('data-figure', 'home-chart'))).toHaveLength(0);
    expect(all(d, has('data-home-chart'))).toHaveLength(0);
  });

  it.each([...WITH_CHART, ...WITHOUT_CHART].map((m) => [m.mode, m] as const))('%s: five steps in order, each body once, no repeated id', (_, m) => {
    const h = html(m);
    const d = doc(h);
    const steps = all(d, has('data-scroll-step'));
    expect(steps.map((s) => attr(s, 'data-scroll-step'))).toEqual(['1', '2', '3', '4', '5']);
    expect(steps.map((s) => attr(s, 'id'))).toEqual(['home-step-1', 'home-step-2', 'home-step-3', 'home-step-4', 'home-step-5']);
    expect(steps.map((s) => squash(text(all(s, (el) => el.tagName === 'h3')[0]!)))).toEqual(['Hypothesis', 'Split', 'Evidence', 'Guardrails', 'Decision']);
    // The static first step is the current one until the scroll controller moves it.
    expect(steps.map((s) => attr(s, 'aria-current'))).toEqual(['step', undefined, undefined, undefined, undefined]);
    // Every body is drawn once: its diagram ids appear once.
    expect(all(d, (el) => attr(el, 'id') === 'home-hypothesis')).toHaveLength(1);
    const ids = all(d, has('id')).map((el) => attr(el, 'id')!);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(audit(h)).toEqual([]);
  });

  it('refuses chart entries that would share one Figure with different tables', () => {
    const p = scrollMomentProps(mode('ab'));
    const other = scrollMomentProps(mode('calibration')).charts[2]!;
    const charts = p.charts.map((c, i) => (i === 4 ? other : c));
    expect(() => renderToStaticMarkup(<ScrollMoment {...p} charts={charts} />)).toThrow(/one table/);
  });
});

describe('what the client components receive', () => {
  // The props the server serializes for the two client components (the step bodies are server output
  // and print counts by the small-count rule themselves). Small counts, a flagged one-sided split and a
  // paused test with little data: no count from 1 to 4 and no visitor tick may travel to the browser.
  const SMALL: readonly NarrativeFixture[] = ['ab-tiny', 'calibration-tiny', 'ab-zero-sixty', 'ab-asymmetric', 'calibration-asymmetric', 'srm-one-sided-small', 'paused-tiny', 'paused-under-50'];
  const COUNT_KEYS = new Set(['nA', 'nB', 'n', 'nSmaller', 'smaller', 'a', 'b', 'yourViewN']);

  function smallCounts(value: unknown, key = '', out: string[] = []): string[] {
    if (typeof value === 'number' && COUNT_KEYS.has(key) && value >= 1 && value <= 4) out.push(`${key}=${value}`);
    if (Array.isArray(value)) value.forEach((v) => smallCounts(v, key, out));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) smallCounts(v, k, out);
    return out;
  }

  it.each(SMALL)('%s: the chart entries hold no count from 1 to 4 and no visitor tick', (name) => {
    const p = scrollMomentProps(simulated(toHomeModel(narrativeFixture(name), 'b')));
    const sent = JSON.parse(JSON.stringify({ arm: p.arm, charts: p.charts, refs: p.refs })) as unknown;
    expect(smallCounts(sent)).toEqual([]);
    expect(JSON.stringify(sent)).not.toContain('yourViewN');
    // The table cells too: a count from 1 to 4 prints as "<5".
    for (const c of p.charts) for (const row of c?.table.rows ?? []) for (const cell of row.slice(0, 2)) expect(cell).not.toSatisfy((v) => typeof v === 'number' && v >= 1 && v <= 4);
  });

  it('the scan finds a small count where one is planted', () => {
    expect(smallCounts({ charts: [{ snapshot: { nA: 3, series: [{ n: 60, nB: 2 }] } }] })).toEqual(['nA=3', 'nB=2']);
  });
});

describe('the chart-error dev state', () => {
  it('is drawn whole on the server, and the name it gives the chart in the browser makes the kit throw', () => {
    const state = SCROLL_STATES.find((s) => s.id === CHART_ERROR_STATE)!;
    const p = scrollMomentProps(state.model());
    expect(all(doc(renderToStaticMarkup(<ScrollMoment {...p} />)), has('data-figure-fallback'))).toHaveLength(0);
    const chart = p.charts[2]!;
    expect(() => renderToStaticMarkup(<HomeChart snapshot={chart.snapshot} table={chart.table} refs={p.refs} ariaLabel={BROKEN_LABEL} />)).toThrow(/no digit/);
  });
});

describe('the fallback rules in globals.css', () => {
  const css = readFileSync(new URL('../../../src/app/globals.css', import.meta.url), 'utf8');
  it("hide a Figure's lead, controls, result and tables only for its own fallback", () => {
    // A descendant fallback (a nested Figure's, or the scroll moment's chart's) must not reach them.
    expect(css).not.toMatch(/\[data-figure\]:has\(\[data-figure-fallback\]\)/);
    expect(css).toContain('[data-figure]:has(> [data-figure-body] > [data-figure-fallback])');
  });
  it('drop the scroll moment to its stacked frames when a live chart fails', () => {
    expect(css).toContain(':has([data-home-chart] > [data-figure-fallback]) [data-scroll-canvas]');
    expect(css).toContain(':has([data-home-chart] > [data-figure-fallback]) [data-stacked-frame]');
  });
});

describe('HomeChart: the chart before the browser measures it', () => {
  it('draws the fixed 280 px plot in both layouts, with the caller label, until measured', () => {
    const m = mode('held');
    const p = scrollMomentProps(m);
    const chart = p.charts[2]!;
    const d = doc(renderToStaticMarkup(<HomeChart snapshot={chart.snapshot} table={chart.table} refs={p.refs} ariaLabel={chart.ariaLabel} />));
    const root = all(d, has('data-home-chart'))[0]!;
    expect(attr(root, 'data-plot')).toBe('280');
    expect(attr(root, 'data-measured')).toBeUndefined();
    expect(all(d, has('data-home-chart-sizer'))).toHaveLength(1);
    const frames = all(d, has('data-chart-frame'));
    expect(frames.map((f) => attr(f, 'data-layout')).sort()).toEqual(['narrow', 'wide']);
    for (const f of frames) {
      expect(attr(f, 'height')).toBe(String(280 + 88));
      expect(attr(f, 'aria-label')).toBe(chart.ariaLabel);
    }
    expect(chart.ariaLabel).toMatch(/until counting stopped/);
  });

  it('keeps the table it is given for its own fallback, not printed while the chart draws', () => {
    const m = mode('ab');
    const snap = scrollMomentProps(m).charts[2]!.snapshot;
    const h = renderToStaticMarkup(<HomeChart snapshot={snap} table={homeChartTable(snap, m.refs)} refs={m.refs} />);
    expect(all(doc(h), (el) => el.tagName === 'table')).toHaveLength(0);
  });
});

describe('the sizing rule', () => {
  it('fills the measured box less 88 px for the axes, never below 80 px, and 280 px where no box is set', () => {
    expect(plotHeight(0)).toBe(280);
    expect(plotHeight(267)).toBe(179);
    expect(plotHeight(338)).toBe(250);
    expect(plotHeight(168)).toBe(80);
    expect(plotHeight(120)).toBe(80);
    expect(plotHeight(Number.NaN)).toBe(280);
  });

  it('draws the narrow layout below a 640 px container', () => {
    expect(chartLayout(0)).toBe('narrow');
    expect(chartLayout(639.5)).toBe('narrow');
    expect(chartLayout(640)).toBe('wide');
    expect(chartLayout(960)).toBe('wide');
  });
});

describe('the client and server modules', () => {
  const read = (f: string) => readFileSync(new URL(`../../../src/components/home/${f}`, import.meta.url), 'utf8');
  // ScrollMoment is the server half (it draws each chart on the server, so the chart's code can load
  // after the first load); ScrollShell is the client half, HomeChart the chart loaded later.
  it.each(['HomeChart.tsx', 'ScrollShell.tsx'])('%s is a client module that sizes from its box, never the window', (f) => {
    const src = read(f);
    expect(src.startsWith("'use client';")).toBe(true);
    expect(src).not.toMatch(/innerHeight|outerHeight|visualViewport|addEventListener\(\s*['"]resize/);
    // No server-only model or reader reaches the browser: types only, never the reader.
    expect(src).not.toMatch(/from '@\/lib\/experiment\/live'/);
    expect(src).not.toMatch(/^import (?!type)[^;]*from '@\/lib\/home\/(model|scroll)'/m);
  });

  it.each(['ScrollMoment.tsx', 'HomeChartView.tsx'])('%s is server-safe: no client directive, no hooks, no reader', (f) => {
    const src = read(f);
    expect(src).not.toMatch(/^'use client';/m);
    expect(src).not.toMatch(/\buse(State|Effect|LayoutEffect|Ref|Id|SyncExternalStore)\b/);
    expect(src).not.toMatch(/innerHeight|outerHeight|visualViewport/);
    expect(src).not.toMatch(/from '@\/lib\/experiment\/live'/);
    expect(src).not.toMatch(/^import (?!type)[^;]*from '@\/lib\/home\/(model|scroll)'/m);
  });

  // One test per state: all of them in one test came close to the 5 s default and timed out under load.
  it.each(SCROLL_STATES.map((s) => [s.id, s] as const))('%s renders through the truth audit with no finding', (id, s) => {
    const m = s.model();
    const props = s.props?.(m) ?? scrollMomentProps(m);
    expect(audit(renderToStaticMarkup(<ScrollMoment {...props} />)), id).toEqual([]);
  });
});

describe('the canvas layers', () => {
  const layers = (props: ScrollMomentProps) => {
    const d = doc(renderToStaticMarkup(<ScrollMoment {...props} />));
    const canvas = all(d, has('data-scroll-canvas'))[0]!;
    return within(canvas, has('data-canvas-layer')).map((l) => ({
      entry: attr(l, 'data-canvas-layer'),
      active: attr(l, 'data-active') !== undefined,
      hidden: attr(l, 'aria-hidden'),
      inert: attr(l, 'inert') !== undefined,
      charts: within(l, has('data-home-chart')).length,
    }));
  };

  it('one layer per distinct chart: the Evidence chart alone is one shown layer', () => {
    expect(layers(scrollMomentProps(mode('ab')))).toEqual([{ entry: '2', active: true, hidden: undefined, inert: false, charts: 1 }]);
  });

  it('two different charts are two layers; the first step shows the nearest, the other is hidden and inert', () => {
    const state = SCROLL_STATES.find((s) => s.id === 'ab-two-charts')!;
    const m = state.model();
    expect(layers(state.props!(m))).toEqual([
      { entry: '2', active: true, hidden: undefined, inert: false, charts: 1 },
      { entry: '4', active: false, hidden: 'true', inert: true, charts: 1 },
    ]);
  });

  it('equal entries share one layer', () => {
    const p = scrollMomentProps(mode('ab'));
    const same = p.charts.map((c, i) => (i === 4 ? { ...p.charts[2]! } : c));
    expect(layers({ ...p, charts: same }).map((l) => l.entry)).toEqual(['2']);
  });
});

describe('what the client half receives', () => {
  /** The props ScrollMoment hands its client half (the ones serialized for the browser). */
  function shellProps(props: ScrollMomentProps): ScrollShellProps {
    let seen: ScrollShellProps | null = null;
    const Spy = (p: ScrollShellProps) => {
      seen = p;
      return null;
    };
    renderToStaticMarkup(<ScrollMomentView {...props} Shell={Spy} />);
    return seen!;
  }

  it('carries no visitor tick, and a tick start only where the server allowed it', () => {
    const m = mode('ab');
    expect(shellProps(scrollMomentProps(m)).charts.map((c) => c?.tickFrom ?? null)).toEqual([null, null, null, null, null]);
    const allowed = shellProps(scrollMomentProps(m, { tickAllowed: true })).charts[2]!;
    expect(allowed.tickFrom).toBeGreaterThanOrEqual(50);
    for (const p of [scrollMomentProps(m), scrollMomentProps(m, { tickAllowed: true })]) {
      expect(JSON.stringify(shellProps(p).charts)).not.toContain('yourViewN');
    }
  });

  // The small-count rule on what the browser receives: the client half's chart entries, for the small
  // fixtures and the drawable states, hold no count from 1 to 4 and no visitor count.
  it.each([
    ...(['ab-tiny', 'calibration-tiny', 'ab-zero-sixty', 'ab-asymmetric', 'calibration-asymmetric', 'srm-one-sided-small', 'paused-tiny', 'paused-under-50'] as const).map(
      (n) => [n, simulated(toHomeModel(narrativeFixture(n), 'b'))] as const,
    ),
    ...WITH_CHART.map((m) => [m.mode, m] as const),
  ])('%s: the client half receives no count from 1 to 4 and no visitor count', (_, m) => {
    const sent = JSON.parse(JSON.stringify(shellProps(scrollMomentProps(m, { tickAllowed: true })).charts)) as unknown;
    const small: string[] = [];
    const scan = (v: unknown, key = ''): void => {
      if (typeof v === 'number' && ['nA', 'nB', 'n', 'nSmaller', 'smaller', 'a', 'b', 'tickFrom'].includes(key) && v >= 1 && v <= 4) small.push(`${key}=${v}`);
      if (Array.isArray(v)) v.forEach((x) => scan(x, key));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) scan(x, k);
    };
    scan(sent);
    expect(small).toEqual([]);
    expect(JSON.stringify(sent)).not.toContain('yourViewN');
  });

  it('a held chart gets no tick start even if the server allowed one', () => {
    expect(shellProps(scrollMomentProps(mode('held'), { tickAllowed: true })).charts[2]!.tickFrom).toBeNull();
  });
});

function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
function contains(root: El, target: El): boolean {
  return all(root, (el) => el === target).length > 0;
}
