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
import { scrollMomentProps, SCROLL_STATES } from '@/app/kitchen-sink/home/fixtures';
import { HomeChart, chartLayout, plotHeight } from '@/components/home/HomeChart';
import { ScrollMoment } from '@/components/home/ScrollMoment';
import { snapshotFixture } from '@/lib/home/fixtures';
import { toHomeModel, type HomeMode, type HomeModel } from '@/lib/home/model';
import { narrativeFixture } from '@/lib/home/narrative-fixtures';
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
    // T5 draws a live chart in the Evidence step only, so there is one stacked frame, in step 3.
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

describe('the client modules', () => {
  const read = (f: string) => readFileSync(new URL(`../../../src/components/home/${f}`, import.meta.url), 'utf8');
  it.each(['HomeChart.tsx', 'ScrollMoment.tsx'])('%s is a client module that sizes from its box, never the window', (f) => {
    const src = read(f);
    expect(src.startsWith("'use client';")).toBe(true);
    expect(src).not.toMatch(/innerHeight|outerHeight|visualViewport|addEventListener\(\s*['"]resize/);
    // No server-only model or reader reaches the browser: types only, never the reader.
    expect(src).not.toMatch(/from '@\/lib\/experiment\/live'/);
    expect(src).not.toMatch(/^import (?!type)[^;]*from '@\/lib\/home\/(model|scroll)'/m);
  });

  it('every scroll-moment state of the dev host renders through the truth audit with no finding', () => {
    for (const s of SCROLL_STATES) expect(audit(html(s.model())), s.id).toEqual([]);
  });
});

function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
function contains(root: El, target: El): boolean {
  return all(root, (el) => el === target).length > 0;
}
