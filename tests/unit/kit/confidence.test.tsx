import fc from 'fast-check';
import { parseFragment } from 'parse5';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { liveFixture, FRESHNESS_KINDS } from '@/app/kitchen-sink/_parts/live-fixtures';
import { ConfidenceChart } from '@/components/kit/ConfidenceChart';
import { LiveStateBody } from '@/components/kit/LiveStateBody';
import { NowRow } from '@/components/kit/NowRow';
import { FACTS, FACT_DISPLAYS } from '@/lib/facts';
import { liveFigureState, type CsPoint, type LiveSnapshot } from '@/lib/figure/cs-band';
import {
  DATA_AMOUNTS,
  LIVE_PHASES,
  RUNTIMES,
  resolveFigureBody,
  type FigureBody,
  type Freshness,
  type LivePhase,
} from '@/lib/figure/states';

type Node = {
  nodeName: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: Node[];
};

const parse = (html: string) => parseFragment(html) as unknown as Node;
const text = (node: Node): string =>
  node.nodeName === '#text' ? (node.value ?? '') : (node.childNodes ?? []).map(text).join('');
const find = (node: Node, test: (n: Node) => boolean): Node[] =>
  (test(node) ? [node] : []).concat((node.childNodes ?? []).flatMap((c) => find(c, test)));
const attr = (n: Node, name: string) => n.attrs?.find((a) => a.name === name)?.value;
const hasAttr = (n: Node, name: string) => n.attrs?.some((a) => a.name === name) ?? false;
const byTag = (root: Node, tag: string) => find(root, (n) => n.nodeName === tag);
const withAttr = (root: Node, name: string) => find(root, (n) => hasAttr(n, name));
const frames = (root: Node) => byTag(root, 'svg').filter((s) => hasAttr(s, 'data-chart-frame'));
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

const AB = liveFixture('ab', 'enough-data', 'fresh');
const bodyOf = (s: LiveSnapshot) => resolveFigureBody(liveFigureState(s));
const chart = (s: LiveSnapshot, body: FigureBody = bodyOf(s)) =>
  parse(renderToStaticMarkup(<ConfidenceChart id="fixture" snapshot={s} body={body} refs={['simulated']} />));
const stateBody = (s: LiveSnapshot, body: FigureBody = bodyOf(s)) =>
  parse(renderToStaticMarkup(<LiveStateBody id="fixture" snapshot={s} body={body} refs={['simulated']} />));

describe('ConfidenceChart', () => {
  it('in collecting states shows progress, never a chart: zero views in both groups', () => {
    const root = chart({ ...AB, nA: 0, nB: 0 });
    expect(squash(text(root))).toContain('Progress: 0 of 50 in the smaller group');
    expect(squash(text(root))).toContain('Estimate appears at 50 per group.');
    expect(frames(root)).toHaveLength(0);
    // The hollow glyph: the bar in line, a hollow muted dot.
    const dot = byTag(root, 'circle')[0]!;
    expect(attr(dot, 'fill')).toBe('none');
    expect(attr(dot, 'stroke')).toBe('var(--color-muted)');
  });

  it('draws the band, its bounds, the running estimate and one ringed current estimate per frame', () => {
    const root = chart(AB);
    const all = frames(root);
    expect(all.map((f) => attr(f, 'data-layout'))).toEqual(['narrow', 'wide']);
    for (const frame of all) {
      const dots = byTag(frame, 'circle').filter((c) => attr(c, 'fill') === 'var(--color-series-2)');
      expect(dots).toHaveLength(1);
      expect(attr(dots[0]!, 'stroke')).toBe('var(--color-bg)');
      expect(attr(dots[0]!, 'stroke-width')).toBe('4');
      expect(attr(dots[0]!, 'paint-order')).toBe('stroke');
      expect(attr(dots[0]!, 'r')).toBe('4');
      const marks = withAttr(frame, 'data-cs');
      const kinds = marks.map((m) => attr(m, 'data-cs'));
      expect(kinds).toEqual(expect.arrayContaining(['band', 'projection', 'lower', 'upper', 'estimate']));
      const bound = marks.find((m) => attr(m, 'data-cs') === 'lower')!;
      expect(attr(bound, 'stroke')).toBe('var(--color-series-1)');
      expect(attr(bound, 'stroke-width')).toBe('1');
      expect(attr(marks.find((m) => attr(m, 'data-cs') === 'estimate')!, 'stroke')).toBe('var(--color-muted)');
      expect(attr(marks.find((m) => attr(m, 'data-cs') === 'band')!, 'fill')).toBe('var(--color-series-ghost)');
      expect(attr(marks.find((m) => attr(m, 'data-cs') === 'projection')!, 'fill')).toBe('var(--color-series-ghost)');
    }
  });

  it('projects the band to the cap only while the test runs, never once it is decided or paused', () => {
    const projected = (s: LiveSnapshot, body?: FigureBody) =>
      frames(chart(s, body)).flatMap((f) => withAttr(f, 'data-cs')).some((m) => attr(m, 'data-cs') === 'projection');
    expect(projected(AB)).toBe(true);
    expect(projected(liveFixture('calibration', 'enough-data', 'fresh'))).toBe(true);
    expect(projected(liveFixture('ab', 'enough-data', 'paused'))).toBe(false);
    expect(projected(liveFixture('ship-b', 'enough-data', 'fresh'))).toBe(false);
    expect(projected(liveFixture('stop-for-harm', 'enough-data', 'fresh'))).toBe(false);
  });

  it('labels the axes: B − A with U+2212, B higher and B lower, a zero tick "0" named "no difference"', () => {
    const [frame] = frames(chart(AB));
    const labels = withAttr(frame!, 'data-axis-label').map(text);
    expect(labels).toEqual(['B − A (percentage points)', 'Views per group']);
    const zero = withAttr(frame!, 'data-zero-tick')[0]!;
    expect(text(byTag(zero, 'tspan')[0]!)).toBe('0');
    expect(text(byTag(zero, 'tspan')[1]!)).toBe('no difference');
    const sides = withAttr(frame!, 'data-side').map(text);
    expect(sides).toEqual(['B higher', 'B lower']);
  });

  it('never hides the current estimate under "B higher" or "B lower": a look at the cap near zero drops them', () => {
    const atCap = liveFixture('inconclusive', 'enough-data', 'fresh');
    for (const frame of frames(chart(atCap))) {
      expect(withAttr(frame, 'data-side')).toHaveLength(0);
      // The dot keeps a sliver of room at the end of the axis.
      const dot = byTag(frame, 'circle').find((c) => attr(c, 'fill') === 'var(--color-series-2)')!;
      expect(parseFloat(attr(dot, 'cx')!)).toBeLessThan(99);
    }
    // Far from zero, the dot leaves room for both.
    const high = { ...atCap, series: [{ n: 176, lower: 20, upper: 60, estimate: 40 }] };
    expect(withAttr(frames(chart(high, 'inconclusive'))[0]!, 'data-side').map(text)).toEqual(['B higher', 'B lower']);
  });

  it('marks the visitor\'s view as a muted x-axis tick labelled "your view"', () => {
    const [frame] = frames(chart({ ...AB, yourViewN: 120 }));
    const view = withAttr(frame!, 'data-your-view')[0]!;
    expect(attr(byTag(view, 'line')[0]!, 'stroke')).toBe('var(--color-muted)');
    expect(text(byTag(view, 'text')[0]!)).toBe('your view');
    expect(withAttr(frames(chart({ ...AB, yourViewN: undefined }))[0]!, 'data-your-view')).toHaveLength(0);
  });

  it('states the current interval in words, without a digit, and whether it includes zero', () => {
    const label = (s: LiveSnapshot) => attr(frames(chart(s))[0]!, 'aria-label')!;
    expect(label(AB)).toMatch(/includes zero/);
    expect(label(AB)).not.toMatch(/\d/);
    expect(label(liveFixture('ship-b', 'enough-data', 'fresh'))).toMatch(/above zero/);
    expect(label(liveFixture('stop-for-harm', 'enough-data', 'fresh'))).toMatch(/below zero/);
  });

  it('draws the Now row under the chart with the current interval', () => {
    const root = chart(AB);
    const row = withAttr(root, 'data-now-row')[0]!;
    expect(attr(row, 'data-now-row')).toBe('interval');
    expect(squash(text(byTag(row, 'p')[0]!))).toBe('now: −12 to +31');
  });

  it('shows nothing that could leak a hidden verdict when the split check failed', () => {
    expect(renderToStaticMarkup(<ConfidenceChart id="f" snapshot={AB} body="srm-suppressed" />)).toBe('');
  });

  it('never throws for any valid live input, in any state', () => {
    let charts = 0;
    const wild = fc.oneof(fc.double(), fc.constantFrom(Number.NaN, Infinity, -Infinity, -0, 0, 49, 50, 1e9));
    // Mostly plausible values, so most runs draw a chart; the rest is anything a broken store sends.
    const views = fc.oneof({ arbitrary: fc.integer({ min: 50, max: 5000 }), weight: 6 }, fc.double({ min: 49, max: 51 }), wild);
    const points = fc.oneof(fc.double({ min: -150, max: 150, noNaN: true }), fc.double({ min: -0.05, max: 0.05, noNaN: true }), wild);
    const point = fc.record({ n: views, lower: points, upper: points, estimate: points });
    const freshness = fc.constantFrom<Freshness>(
      { kind: 'fresh' },
      { kind: 'stale', updatedAt: '2026-10-15T21:40:00Z', renderedAt: '2026-10-16T08:00:00Z' },
      { kind: 'paused', pausedOn: '2026-10-14T09:00:00Z', reason: 'a fictional fault' },
    );
    fc.assert(
      fc.property(
        fc.record({
          phase: fc.constantFrom<LivePhase>(...LIVE_PHASES),
          freshness,
          nA: views,
          nB: views,
          series: fc.array(point, { maxLength: 10 }),
          capPerArm: views,
          projectedHalfWidthAtCap: points,
          yourViewN: fc.option(views, { nil: undefined }),
          guardrail: fc.option(fc.record({ lower: points, upper: points, limit: points }), { nil: undefined }),
          ruledOutAbove: fc.option(points, { nil: undefined }),
        }),
        fc.constantFrom(...RUNTIMES),
        (raw, runtime) => {
          const s: LiveSnapshot = { ...AB, ...raw, series: raw.series as CsPoint[] };
          const body = resolveFigureBody(liveFigureState(s, runtime));
          const html = renderToStaticMarkup(
            <>
              <ConfidenceChart id="any" snapshot={s} body={body} />
              <LiveStateBody id="any" snapshot={s} body={body} />
            </>,
          );
          expect(html).not.toMatch(/NaN|Infinity|−0(?![.\d])|\+0(?![.\d])/);
          if (html.includes('data-chart-frame')) charts += 1;
        },
      ),
      { numRuns: 400 },
    );
    expect(charts).toBeGreaterThan(100);
    // Hundreds of full renders: room for a loaded machine.
  }, 30_000);
});

describe('NowRow', () => {
  it('draws the large glyph on a difference axis with a zero tick, placed by percentage', () => {
    const root = parse(renderToStaticMarkup(<NowRow domain={[-40, 60]} interval={{ lower: -12, upper: 31, estimate: 9 }} />));
    const svg = byTag(root, 'svg')[0]!;
    expect(attr(svg, 'aria-hidden')).toBe('true');
    expect(hasAttr(svg, 'viewBox')).toBe(false);
    const bar = withAttr(svg, 'data-now-bar')[0]!;
    expect(attr(bar, 'x')).toBe('28%');
    expect(attr(bar, 'width')).toBe('43%');
    const zero = withAttr(svg, 'data-now-zero')[0]!;
    expect(attr(zero, 'x1')).toBe('40%');
    const zeroLabel = byTag(svg, 'text')[0]!;
    expect(text(zeroLabel)).toBe('0');
    expect(attr(zeroLabel, 'data-derived')).toBe('live');
    const dot = byTag(svg, 'circle')[0]!;
    expect(attr(dot, 'cx')).toBe('49%');
    expect(attr(dot, 'fill')).toBe('var(--color-series-2)');
    expect(attr(dot, 'stroke')).toBe('var(--color-bg)');
  });

  it('never prints "−0 to +0" for an interval that rounds to zero', () => {
    const html = renderToStaticMarkup(<NowRow domain={[-1, 1]} interval={{ lower: -0.04, upper: 0.03 }} />);
    expect(squash(text(parse(html)))).toContain('now: 0 to 0');
    expect(html).not.toMatch(/−0 |\+0</);
  });
});

describe('LiveStateBody', () => {
  const body = (phase: LivePhase, data: 'low-data' | 'enough-data', fresh: 'fresh' | 'stale' | 'paused' = 'fresh') =>
    stateBody(liveFixture(phase, data, fresh));
  const paragraphs = (root: Node) => byTag(root, 'p').map((p) => squash(text(p)));

  it('low data in the A/B phase: "A/B started" first, then the collecting row and no chart', () => {
    const root = body('ab', 'low-data');
    expect(paragraphs(root)[0]).toBe('A/B started 01.10.');
    expect(squash(text(root))).toContain('Progress: 12 of 50 in the smaller group. Planned end: 01.12.');
    expect(frames(root)).toHaveLength(0);
  });

  it('low data in calibration says both groups see the same page', () => {
    expect(paragraphs(body('calibration', 'low-data'))[0]).toBe('Calibrating: both groups see the same page.');
  });

  it('the A/B phase with enough data: SRM passed in ok, the chart, the Now row and the guardrail interval', () => {
    const root = body('ab', 'enough-data');
    const ok = find(root, (n) => (attr(n, 'class') ?? '').includes('text-ok'))[0]!;
    expect(text(ok)).toBe('SRM passed');
    expect(frames(root)).toHaveLength(2);
    expect(paragraphs(root)).toContain('Leaving within 5 seconds, B − A: −3.2 to +6.4 points; limit +10.');
  });

  it('calibration with enough data names the phase and the passed split check', () => {
    const p = paragraphs(body('calibration', 'enough-data'));
    expect(p[0]).toBe('Calibrating: both groups see the same page.');
    expect(p).toContain('SRM passed');
  });

  it('the outcomes say their sentence over the chart', () => {
    expect(paragraphs(body('ship-b', 'enough-data'))[0]).toBe(
      'Ship B. The lower end of the interval is above zero (+2 to +46 points), the quick-exit guardrail is within its limit, and the split check passed.',
    );
    expect(paragraphs(body('stop-for-harm', 'enough-data'))[0]).toBe(
      'Stopped: B did worse. The upper end of the interval is below zero (−46 to −2 points).',
    );
    const inconclusive = body('inconclusive', 'enough-data');
    expect(paragraphs(inconclusive)[0]).toBe(
      "Inconclusive at the six-month limit: the difference runs from −14 to +22 points, so an effect larger than 22 points is ruled out. What I'll do now: keep page A and test a bolder change.",
    );
    expect(frames(inconclusive)).toHaveLength(2);
  });

  it('an outcome without 50 views per group gives no verdict and keeps collecting', () => {
    const root = body('ship-b', 'low-data');
    expect(paragraphs(root)[0]).toBe('The rules need 50 views per group, so no verdict is shown.');
    expect(frames(root)).toHaveLength(0);
  });

  it('SRM failed: the status in warn, the counts and no interval', () => {
    const root = body('srm-suppressed', 'enough-data');
    const warn = find(root, (n) => (attr(n, 'class') ?? '').includes('text-warn'))[0]!;
    expect(text(warn)).toBe('SRM failed');
    expect(paragraphs(root)).toEqual([
      'SRM failed. The split check failed, so no verdict is shown.',
      'Views so far: 180 in A, 176 in B.',
    ]);
    expect(squash(text(root))).not.toContain('now:');
    expect(frames(root)).toHaveLength(0);
  });

  it('A/A failed: its sentence with both dates', () => {
    expect(paragraphs(body('aa-failed', 'enough-data'))).toEqual([
      'Calibration stopped on 20.09: the split check failed. Calibration restarts on 27.09.',
    ]);
  });

  it('paused: the date and reason above the last chart, or above the collecting row', () => {
    const root = body('ab', 'enough-data', 'paused');
    expect(paragraphs(root)[0]).toBe('Paused on 14.10: a fictional tracking fault is being fixed.');
    expect(frames(root)).toHaveLength(2);
    const low = body('ab', 'low-data', 'paused');
    expect(paragraphs(low)[0]).toBe('Paused on 14.10: a fictional tracking fault is being fixed.');
    expect(squash(text(low))).toContain('Progress: 12 of 50');
    // A pause never reveals a verdict the split check hid.
    const srm = body('srm-suppressed', 'enough-data', 'paused');
    expect(squash(text(srm))).toContain('SRM failed');
    expect(squash(text(srm))).not.toContain('now:');
  });

  it('marks every number it prints, in every fixture (the truth audit finds nothing)', () => {
    const page = (b: string) => `<!DOCTYPE html><html lang="en"><head><title>Page</title></head><body>${b}</body></html>`;
    const ctx = { route: '/live', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] };
    for (const phase of LIVE_PHASES) {
      for (const data of DATA_AMOUNTS) {
        for (const fresh of FRESHNESS_KINDS) {
          const s = liveFixture(phase, data, fresh);
          const html = renderToStaticMarkup(<LiveStateBody id="audit" snapshot={s} body={bodyOf(s)} refs={['simulated']} />);
          expect(auditHtml(page(html), ctx), `${phase} ${data} ${fresh}`).toEqual([]);
        }
      }
    }
  });

  it('ringed series-2 dots only, and no "arm" in visitor copy', () => {
    for (const phase of LIVE_PHASES) {
      const s = liveFixture(phase, 'enough-data', 'fresh');
      const root = stateBody(s);
      for (const dot of byTag(root, 'circle').filter((c) => attr(c, 'fill') === 'var(--color-series-2)')) {
        expect(attr(dot, 'stroke')).toBe('var(--color-bg)');
      }
      expect(text(root)).not.toMatch(/\barms?\b/i);
    }
  });
});
