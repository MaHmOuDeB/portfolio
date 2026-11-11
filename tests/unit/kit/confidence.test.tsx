import { createHash } from 'node:crypto';
import type { ComponentProps } from 'react';
import fc from 'fast-check';
import { parseFragment } from 'parse5';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { liveFixture, FRESHNESS_KINDS, pausedAbAboveZeroFixture } from '@/app/kitchen-sink/_parts/live-fixtures';
import { ConfidenceChart } from '@/components/kit/ConfidenceChart';
import { LiveStateBody } from '@/components/kit/LiveStateBody';
import { NowRow } from '@/components/kit/NowRow';
import { FACTS, FACT_DISPLAYS } from '@/lib/facts';
import { liveFigureState, type CsPoint, type LiveSnapshot } from '@/lib/figure/cs-band';
import type { Layout } from '@/lib/figure/scales';
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
    expect(squash(text(root))).toContain('Estimates appear at 50 views per group, as the pre-registration says.');
    expect(frames(root)).toHaveLength(0);
    // The hollow glyph on the difference axis: zero tick, B lower and B higher, the bar and the
    // outlined dot in muted (a bar in line would be 1.2:1 against the page).
    const row = withAttr(root, 'data-now-row')[0]!;
    expect(attr(row, 'data-now-row')).toBe('collecting');
    const glyph = withAttr(root, 'data-now-glyph')[0]!;
    const bar = byTag(glyph, 'rect').find((r) => attr(r, 'height') === '3.2')!;
    expect(attr(bar, 'fill')).toBe('var(--color-muted)');
    const dot = byTag(glyph, 'circle')[0]!;
    expect(attr(dot, 'stroke')).toBe('var(--color-muted)');
    const svg = byTag(row, 'svg')[0]!;
    expect(withAttr(svg, 'data-now-zero')).toHaveLength(1);
    expect(byTag(svg, 'text').map(text).map((t) => t.trim())).toEqual(['0', 'B lower', 'B higher']);
    // The progress bar spans its container, not a fixed 256 px.
    const progress = byTag(root, 'progress')[0]!;
    expect(attr(progress, 'class')).toContain('w-full');
    expect(attr(progress, 'class')).not.toContain('w-64');
    // The empty track is visible: a muted border, not a line-coloured fill (1.2:1).
    expect(attr(progress, 'class')).toContain('border-muted');
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
    expect(text(zero)).toBe('0');
    expect(withAttr(frame!, 'data-zero-label').map(text)).toEqual(['no difference']);
    const sides = withAttr(frame!, 'data-side').map(text);
    expect(sides).toEqual(['B higher', 'B lower']);
  });

  it('keeps "B higher", "B lower" and "no difference" in the margin, so no look can sit under them', () => {
    const atCap = liveFixture('inconclusive', 'enough-data', 'fresh');
    const near = { ...atCap, series: [{ n: 176, nA: 176, nB: 176, lower: -3, upper: 8, estimate: 0.4 }] };
    for (const snapshot of [atCap, near]) {
      for (const frame of frames(chart(snapshot))) {
        expect(withAttr(frame, 'data-side').map(text)).toEqual(['B higher', 'B lower']);
        // Every word of the zero line starts right of the plot (x 100% plus a positive dx).
        for (const t of [...withAttr(frame, 'data-side'), ...withAttr(frame, 'data-zero-label')]) {
          expect(attr(t, 'x')).toBe('100%');
          expect(Number(attr(t, 'dx'))).toBeGreaterThan(0);
        }
        // The dot keeps a sliver of room at the end of the axis.
        const dot = byTag(frame, 'circle').find((c) => attr(c, 'fill') === 'var(--color-series-2)')!;
        expect(parseFloat(attr(dot, 'cx')!)).toBeLessThan(99);
      }
    }
  });

  it('marks the visitor\'s view as a muted x-axis tick labelled "your view"', () => {
    const [frame] = frames(chart({ ...AB, yourViewN: 120 }));
    const view = withAttr(frame!, 'data-your-view')[0]!;
    expect(attr(byTag(view, 'line')[0]!, 'stroke')).toBe('var(--color-muted)');
    expect(text(byTag(view, 'text')[0]!)).toBe('your view');
    expect(withAttr(frames(chart({ ...AB, yourViewN: undefined }))[0]!, 'data-your-view')).toHaveLength(0);
  });

  it('draws the visitor\'s own view beyond the last look, and clamps one past the axis to the edge with its label inside', () => {
    // The fixture's own view (184) is just after the last look (176): to its right, inside the cap.
    const [frame] = frames(chart(AB));
    const x = (f: Node) => parseFloat(attr(byTag(withAttr(f, 'data-your-view')[0]!, 'line')[0]!, 'x1')!);
    const lastLook = parseFloat(attr(byTag(frame!, 'circle').find((c) => attr(c, 'fill') === 'var(--color-series-2)')!, 'cx')!);
    expect(x(frame!)).toBeGreaterThan(lastLook);
    // Far past the end of the axis: drawn at the right edge, its label anchored to end there.
    const [far] = frames(chart({ ...AB, yourViewN: 100_000 }));
    const view = withAttr(far!, 'data-your-view')[0]!;
    expect(attr(byTag(view, 'line')[0]!, 'x1')).toBe('100%');
    expect(attr(byTag(view, 'text')[0]!, 'text-anchor')).toBe('end');
  });

  it('states the current interval in words, without a digit, and whether it includes zero', () => {
    const label = (s: LiveSnapshot) => attr(frames(chart(s))[0]!, 'aria-label')!;
    expect(label(AB)).toMatch(/includes zero/);
    expect(label(AB)).not.toMatch(/\d/);
    expect(label(liveFixture('ship-b', 'enough-data', 'fresh'))).toMatch(/above zero/);
    expect(label(liveFixture('stop-for-harm', 'enough-data', 'fresh'))).toMatch(/below zero/);
    // The final state is not "yet"; calibration (A/A) names no group as higher.
    const inconclusive = label(liveFixture('inconclusive', 'enough-data', 'fresh'));
    expect(inconclusive).toMatch(/final interval includes zero/);
    expect(inconclusive).not.toMatch(/\byet\b/);
    const aa = label(liveFixture('calibration', 'enough-data', 'fresh'));
    expect(aa).toMatch(/identical groups/);
    expect(aa).not.toMatch(/B higher|B lower|\byet\b/);
    expect(label({ ...liveFixture('calibration', 'enough-data', 'fresh'), series: [{ n: 100, nA: 100, nB: 100, lower: 2, upper: 9, estimate: 5 }] })).toMatch(
      /does not include zero/,
    );
    for (const s of [inconclusive, aa]) expect(s).not.toMatch(/\d/);
  });

  it('draws the Now row under the chart with the current interval', () => {
    const root = chart(AB);
    const row = withAttr(root, 'data-now-row')[0]!;
    expect(attr(row, 'data-now-row')).toBe('interval');
    expect(squash(text(byTag(row, 'p')[0]!))).toBe('now: −12 to +31');
  });

  it('shows nothing that could leak a hidden verdict when the split check failed', () => {
    expect(renderToStaticMarkup(<ConfidenceChart id="f" snapshot={AB} body="srm-suppressed" refs={['simulated']} />)).toBe('');
  });

  it('never throws for any valid live input, in any state', () => {
    let charts = 0;
    const wild = fc.oneof(fc.double(), fc.constantFrom(Number.NaN, Infinity, -Infinity, -0, 0, 49, 50, 1e9));
    // Mostly plausible values, so most runs draw a chart; the rest is anything a broken store sends.
    const views = fc.oneof({ arbitrary: fc.integer({ min: 50, max: 5000 }), weight: 6 }, fc.double({ min: 49, max: 51 }), wild);
    const points = fc.oneof(fc.double({ min: -150, max: 150, noNaN: true }), fc.double({ min: -0.05, max: 0.05, noNaN: true }), wild);
    const point = fc.record({ n: views, nA: views, nB: views, lower: points, upper: points, estimate: points });
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
              <ConfidenceChart id="any" snapshot={s} body={body} refs={['simulated']} />
              <LiveStateBody id="any" snapshot={s} body={body} refs={['simulated']} />
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

describe('ConfidenceChart overrides', () => {
  // The markup the chart produced before it took a height or label override, one short hash per
  // fixture (generated from the unextended component, main 96d4470: every phase, amount of data and
  // freshness of the sink, plus the paused interval above zero; each in the responsive, narrow and
  // wide forms). Absent overrides must keep reproducing it. Regenerated once since, when the frame
  // began centring an outermost x tick label that is not on an end of the domain: in the 16 fixtures
  // with a chart, the last x tick's text-anchor went from "end" to "middle", and nothing else changed.
  const SEED_HASHES: Record<string, string> = {
  "before-data/low-data/fresh": "30124f32e9ff7b52",
  "before-data/low-data/stale": "30124f32e9ff7b52",
  "before-data/low-data/paused": "30124f32e9ff7b52",
  "before-data/enough-data/fresh": "30124f32e9ff7b52",
  "before-data/enough-data/stale": "30124f32e9ff7b52",
  "before-data/enough-data/paused": "30124f32e9ff7b52",
  "calibration/low-data/fresh": "c34d2d16c21e1347",
  "calibration/low-data/stale": "c34d2d16c21e1347",
  "calibration/low-data/paused": "c34d2d16c21e1347",
  "calibration/enough-data/fresh": "47dd3b1333a825d1",
  "calibration/enough-data/stale": "47dd3b1333a825d1",
  "calibration/enough-data/paused": "31b74a46e3105b1e",
  "aa-failed/low-data/fresh": "75a11da44c802486",
  "aa-failed/low-data/stale": "75a11da44c802486",
  "aa-failed/low-data/paused": "75a11da44c802486",
  "aa-failed/enough-data/fresh": "75a11da44c802486",
  "aa-failed/enough-data/stale": "75a11da44c802486",
  "aa-failed/enough-data/paused": "75a11da44c802486",
  "ab/low-data/fresh": "877007dd3baa8be7",
  "ab/low-data/stale": "877007dd3baa8be7",
  "ab/low-data/paused": "877007dd3baa8be7",
  "ab/enough-data/fresh": "42be55503ac0ccd4",
  "ab/enough-data/stale": "42be55503ac0ccd4",
  "ab/enough-data/paused": "56a7df87c6c60eeb",
  "inconclusive/low-data/fresh": "75a11da44c802486",
  "inconclusive/low-data/stale": "75a11da44c802486",
  "inconclusive/low-data/paused": "75a11da44c802486",
  "inconclusive/enough-data/fresh": "b683e14eb33ff06d",
  "inconclusive/enough-data/stale": "b683e14eb33ff06d",
  "inconclusive/enough-data/paused": "4d815e03f0e62f54",
  "ship-b/low-data/fresh": "75a11da44c802486",
  "ship-b/low-data/stale": "75a11da44c802486",
  "ship-b/low-data/paused": "75a11da44c802486",
  "ship-b/enough-data/fresh": "4c403699ce6592eb",
  "ship-b/enough-data/stale": "4c403699ce6592eb",
  "ship-b/enough-data/paused": "a16156cc55a39126",
  "stop-for-harm/low-data/fresh": "75a11da44c802486",
  "stop-for-harm/low-data/stale": "75a11da44c802486",
  "stop-for-harm/low-data/paused": "75a11da44c802486",
  "stop-for-harm/enough-data/fresh": "f5dc7b51a94a0e0f",
  "stop-for-harm/enough-data/stale": "f5dc7b51a94a0e0f",
  "stop-for-harm/enough-data/paused": "03d5146e77690d7a",
  "srm-suppressed/low-data/fresh": "75a11da44c802486",
  "srm-suppressed/low-data/stale": "75a11da44c802486",
  "srm-suppressed/low-data/paused": "75a11da44c802486",
  "srm-suppressed/enough-data/fresh": "75a11da44c802486",
  "srm-suppressed/enough-data/stale": "75a11da44c802486",
  "srm-suppressed/enough-data/paused": "75a11da44c802486",
  "paused-above-zero": "ac55a40a84ea86e8",
  };
  const fixtures: Array<[string, LiveSnapshot]> = [];
  for (const p of LIVE_PHASES) {
    for (const d of DATA_AMOUNTS) for (const f of FRESHNESS_KINDS) fixtures.push([`${p}/${d}/${f}`, liveFixture(p, d, f)]);
  }
  fixtures.push(['paused-above-zero', pausedAbAboveZeroFixture()]);
  const render = (s: LiveSnapshot, extra: Partial<ComponentProps<typeof ConfidenceChart>> = {}) =>
    renderToStaticMarkup(<ConfidenceChart id="fixture" snapshot={s} body={bodyOf(s)} refs={['simulated']} {...extra} />);
  const hashOf = (s: LiveSnapshot, extra: Partial<ComponentProps<typeof ConfidenceChart>> = {}) =>
    createHash('sha256')
      .update([undefined, 'narrow', 'wide'].map((layout) => render(s, { layout: layout as Layout | undefined, ...extra })).join('\n'))
      .digest('hex')
      .slice(0, 16);
  const plotHeights = (html: string) =>
    Object.fromEntries(
      frames(parse(html)).map((f) => [attr(f, 'data-layout')!, Number(attr(byTag(f, 'svg').find((s) => hasAttr(s, 'data-mark-layer'))!, 'height'))]),
    );
  const frameHeights = (html: string) => Object.fromEntries(frames(parse(html)).map((f) => [attr(f, 'data-layout')!, Number(attr(f, 'height'))]));
  const labels = (html: string) => frames(parse(html)).map((f) => attr(f, 'aria-label')!);

  it('seed: the default rendering equals the rendering from before the extension, for every fixture', () => {
    expect(fixtures.map(([id]) => id).sort()).toEqual(Object.keys(SEED_HASHES).sort());
    for (const [id, s] of fixtures) expect(hashOf(s), id).toBe(SEED_HASHES[id]);
  });

  it('passing the defaults, or leaving the overrides undefined, changes nothing', () => {
    for (const [id, s] of fixtures) {
      const plain = render(s);
      expect(render(s, { height: { narrow: 220, wide: 280 } }), id).toBe(plain);
      expect(render(s, { height: undefined, ariaLabel: undefined }), id).toBe(plain);
    }
  });

  it('keeps the geometry of the default: 220 narrow and 280 wide', () => {
    expect(plotHeights(render(AB))).toEqual({ narrow: 220, wide: 280 });
  });

  it('an explicit height sets the plot height of each layout, narrow and wide', () => {
    const html = render(AB, { height: { narrow: 160, wide: 340 } });
    expect(plotHeights(html)).toEqual({ narrow: 160, wide: 340 });
    // The frame grows by exactly the same amount: the labels and axes around the plot do not move.
    const base = frameHeights(render(AB));
    const taller = frameHeights(html);
    expect(taller.narrow! - base.narrow!).toBe(160 - 220);
    expect(taller.wide! - base.wide!).toBe(340 - 280);
    // One layout alone takes its own override.
    expect(plotHeights(render(AB, { layout: 'narrow', height: { narrow: 175.5, wide: 300 } }))).toEqual({ narrow: 175.5 });
    expect(plotHeights(render(AB, { layout: 'wide', height: { narrow: 100, wide: 410 } }))).toEqual({ wide: 410 });
  });

  it('a height override keeps the marks and scales of the default: only the vertical plot size differs', () => {
    const strip = (html: string) => html.replace(/ height="[\d.]+"/g, '').replace(/viewBox="0 0 1000 [\d.]+"/g, '').replace(/ (?:y|y1|y2|cy)="[-\d.]+"/g, '').replace(/ d="[^"]*"/g, '');
    expect(strip(render(AB, { height: { narrow: 180, wide: 360 } }))).toBe(strip(render(AB)));
  });

  it('any positive finite height draws at exactly that height', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 2000, noNaN: true }), fc.double({ min: 1, max: 2000, noNaN: true }), (narrow, wide) => {
        expect(plotHeights(render(AB, { height: { narrow, wide } }))).toEqual({ narrow, wide });
      }),
      { numRuns: 100 },
    );
  });

  it('rejects an invalid height, in every state, drawn or not', () => {
    const bad: unknown[] = [
      { narrow: 0, wide: 280 },
      { narrow: 220, wide: 0 },
      { narrow: -1, wide: 280 },
      { narrow: 220, wide: -280 },
      { narrow: Number.NaN, wide: 280 },
      { narrow: 220, wide: Infinity },
      { narrow: -Infinity, wide: 280 },
      { narrow: '220', wide: 280 },
      { narrow: 220 },
      { wide: 280 },
      {},
      null,
      220,
      [220, 280],
    ];
    for (const [id, s] of fixtures) {
      for (const height of bad) {
        expect(() => render(s, { height: height as never }), `${id} ${JSON.stringify(height)}`).toThrow(TypeError);
      }
    }
    // Including the collecting state, which draws no frame and so would otherwise ignore it.
    expect(() => render({ ...AB, nA: 0, nB: 0 }, { height: { narrow: 0, wide: 0 } })).toThrow(TypeError);
  });

  it('rejects any non-positive or non-finite height (property)', () => {
    const invalid = fc.oneof(fc.double({ max: 0 }), fc.constantFrom(Number.NaN, Infinity, -Infinity, -0));
    fc.assert(
      fc.property(invalid, fc.boolean(), (value, onNarrow) => {
        const height = onNarrow ? { narrow: value, wide: 280 } : { narrow: 220, wide: value };
        expect(() => render(AB, { height })).toThrow(TypeError);
      }),
      { numRuns: 100 },
    );
  });

  it('an explicit label replaces the generated one in both layouts, and nothing else changes', () => {
    const html = render(AB, { ariaLabel: 'The two groups, compared as views accumulate' });
    expect(labels(html)).toEqual(['The two groups, compared as views accumulate', 'The two groups, compared as views accumulate']);
    expect(html.replaceAll('The two groups, compared as views accumulate', labels(render(AB))[0]!)).toBe(render(AB));
  });

  it('an explicit label also replaces the pause wording', () => {
    for (const s of [liveFixture('ab', 'enough-data', 'paused'), pausedAbAboveZeroFixture(), liveFixture('calibration', 'enough-data', 'paused')]) {
      expect(labels(render(s)).every((l) => /until the pause/.test(l))).toBe(true);
      const own = labels(render(s, { ariaLabel: 'The chart is held at its last interval' }));
      expect(own).toEqual(['The chart is held at its last interval', 'The chart is held at its last interval']);
      expect(own.join(' ')).not.toMatch(/until the pause/);
    }
  });

  it('keeps the generated label when none is given, and with an explicit height too', () => {
    expect(labels(render(AB, { height: { narrow: 200, wide: 300 } }))).toEqual(labels(render(AB)));
  });

  it('rejects a label with a digit, in every state, drawn or not', () => {
    for (const label of ['Interval of 12 points', '1', 'Chart 2 of 3', 'B − A: +3', 'half of 50']) {
      for (const [id, s] of fixtures) expect(() => render(s, { ariaLabel: label }), `${id} ${label}`).toThrow(TypeError);
    }
    expect(() => render({ ...AB, nA: 0, nB: 0 }, { ariaLabel: 'Chart 2' })).toThrow(TypeError);
  });

  it('rejects a label that is empty, blank or not a string', () => {
    for (const label of ['', ' ', '\n\t', null, 7, {}, ['a']]) {
      expect(() => render(AB, { ariaLabel: label as never }), JSON.stringify(label)).toThrow(TypeError);
    }
  });

  it('with both overrides set the truth audit finds nothing', () => {
    const page = (body: string) => `<!DOCTYPE html><html lang="en"><head><title>Page</title></head><body>${body}</body></html>`;
    const ctx = { route: '/live', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] };
    for (const [id, s] of fixtures) {
      const html = render(s, { height: { narrow: 190, wide: 310 }, ariaLabel: 'The groups compared as views accumulate' });
      expect(auditHtml(page(html), ctx), id).toEqual([]);
    }
  });
});

describe('NowRow', () => {
  it('draws the large glyph on a difference axis with a zero tick, placed by percentage', () => {
    const root = parse(renderToStaticMarkup(<NowRow domain={[-40, 60]} interval={{ lower: -12, upper: 31, estimate: 9 }} refs={['live']} />));
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

  it('paints the zero tick after the dot and reaches past the dot and its ring', () => {
    const root = parse(renderToStaticMarkup(<NowRow domain={[-40, 60]} interval={{ lower: -12, upper: 31, estimate: 0 }} refs={['live']} />));
    const svg = byTag(root, 'svg')[0]!;
    const order = svg.childNodes!.filter((n) => n.nodeName !== '#text').map((n) => (hasAttr(n, 'data-now-zero') ? 'zero' : n.nodeName));
    expect(order.indexOf('zero')).toBeGreaterThan(order.indexOf('circle'));
    const zero = withAttr(svg, 'data-now-zero')[0]!;
    const dot = byTag(svg, 'circle')[0]!;
    const reach = Number(attr(dot, 'r')) + 2; // the 4 px ring shows 2 px outside the fill
    const cy = Number(attr(dot, 'cy'));
    expect(cy - Number(attr(zero, 'y1'))).toBeGreaterThan(reach);
    expect(Number(attr(zero, 'y2')) - cy).toBeGreaterThan(reach);
  });

  it('gives a small interval the decimals its bounds need, never "−0 to +0"', () => {
    const html = renderToStaticMarkup(<NowRow domain={[-1, 1]} interval={{ lower: -0.04, upper: 0.03 }} refs={['live']} />);
    expect(squash(text(parse(html)))).toContain('now: −0.04 to +0.03');
    // Below the display floor a bound reads "0": the row claims no sign.
    const floor = renderToStaticMarkup(<NowRow domain={[-1, 1]} interval={{ lower: -0.0001, upper: 0.0002 }} refs={['live']} />);
    expect(squash(text(parse(floor)))).toContain('now: 0 to 0');
    expect(floor).not.toMatch(/−0 |\+0</);
  });

  it('never prints a count above the target: both groups at 50 with no look yet', () => {
    const paras = (root: Node) => byTag(root, 'p').map((p) => squash(text(p)));
    const row = (due?: boolean) =>
      parse(renderToStaticMarkup(<NowRow domain={[-1, 1]} collecting={{ nSmaller: 180, plannedEnd: '2026-12-01T10:00:00Z', plannedEndKind: 'fixed', due }} refs={['simulated']} />));
    // A running test: the first estimate is due.
    expect(paras(row(true))).toEqual(['50 views per group are in; the first estimate appears at the next look.']);
    // Otherwise (before data, which never has these counts) no promise of a look and no count.
    expect(paras(row())).toEqual(['Estimates appear at 50 views per group, as the pre-registration says.']);
    for (const root of [row(true), row()]) expect(byTag(root, 'progress')).toHaveLength(0);
    // Both draw the collecting axis.
    for (const root of [row(true), row()]) expect(withAttr(root, 'data-now-glyph')).toHaveLength(1);
  });
});

describe('LiveStateBody', () => {
  const body = (phase: LivePhase, data: 'low-data' | 'enough-data', fresh: 'fresh' | 'stale' | 'paused' = 'fresh') =>
    stateBody(liveFixture(phase, data, fresh));
  const paragraphs = (root: Node) => byTag(root, 'p').map((p) => squash(text(p)));

  it('low data in the A/B phase: "A/B started" first, then the collecting row and no chart', () => {
    const root = body('ab', 'low-data');
    expect(paragraphs(root)[0]).toBe('A/B started 15.09.');
    // The six-month cap after the start: 15.03, not two months later.
    expect(squash(text(root))).toContain('Progress: 12 of 50 in the smaller group. Planned end: 15.03.');
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

  it('the A/B phase with enough data says when it started and that no difference is ruled out yet', () => {
    const p = paragraphs(body('ab', 'enough-data'));
    expect(p[0]).toBe('A/B started 15.09. The interval still includes zero, so no difference is ruled out yet.');
    // An interval away from zero in a running test does not claim that.
    const away = { ...liveFixture('ab', 'enough-data', 'fresh'), series: [{ n: 176, nA: 176, nB: 176, lower: 3, upper: 40, estimate: 20 }] };
    expect(paragraphs(stateBody(away))[0]).toBe('A/B started 15.09. The test is still running.');
  });

  it('labels the interval by what it is: now while running, final once decided, last under a pause', () => {
    const label = (s: LiveSnapshot) => squash(text(byTag(stateBody(s), 'p').find((p) => /^(now|final|last):/.test(squash(text(p))))!)).split(':')[0];
    expect(label(liveFixture('ab', 'enough-data', 'fresh'))).toBe('now');
    expect(label(liveFixture('calibration', 'enough-data', 'fresh'))).toBe('now');
    for (const phase of ['ship-b', 'stop-for-harm', 'inconclusive'] as const) expect(label(liveFixture(phase, 'enough-data', 'fresh')), phase).toBe('final');
    expect(label(liveFixture('ab', 'enough-data', 'paused'))).toBe('last');
  });

  it('under a pause nothing says the test is running, even with an interval away from zero', () => {
    const root = stateBody(pausedAbAboveZeroFixture());
    const all = squash(text(root));
    expect(paragraphs(root)[0]).toBe('Paused on 14.10: a fictional tracking fault is being fixed.');
    expect(all).not.toMatch(/still running|still includes zero|ruled out yet|A\/B started/);
    // The interval is not a verdict either: no sentence claims the lower end is above zero.
    expect(all).not.toMatch(/Ship B|above zero/);
    expect(all).toContain('last: +3 to +37');
    // The same snapshot running (not paused) does say it.
    const running = stateBody({ ...pausedAbAboveZeroFixture(), freshness: { kind: 'fresh' } });
    expect(paragraphs(running)[0]).toBe('A/B started 15.09. The test is still running.');
  });

  it('under a pause a calibration does not say it is running either', () => {
    for (const data of ['low-data', 'enough-data'] as const) {
      const root = body('calibration', data, 'paused');
      expect(paragraphs(root)[0], data).toMatch(/^Paused on 14\.10: /);
      expect(squash(text(root)), data).not.toContain('Calibrating');
      // Running, the same snapshot does say it.
      expect(paragraphs(body('calibration', data, 'fresh'))[0], data).toBe('Calibrating: both groups see the same page.');
    }
  });

  it('under a pause the chart is named by its last interval, with no running claim and no digit', () => {
    const label = (s: LiveSnapshot) => attr(frames(chart(s))[0]!, 'aria-label')!;
    for (const s of [liveFixture('ab', 'enough-data', 'paused'), pausedAbAboveZeroFixture(), liveFixture('ship-b', 'enough-data', 'paused'), liveFixture('calibration', 'enough-data', 'paused')]) {
      const l = label(s);
      expect(l, l).toMatch(/the last interval (includes zero|lies above zero|lies below zero)$/);
      expect(l).not.toMatch(/\d|still|ruled out|current|final|B higher|B lower/);
    }
    expect(label(pausedAbAboveZeroFixture())).toContain('lies above zero');
    expect(label(liveFixture('calibration', 'enough-data', 'paused'))).toContain('the two identical groups');
    // Running, the wording is unchanged.
    expect(label(liveFixture('ab', 'enough-data', 'fresh'))).toContain('the current interval still includes zero');
  });

  it('under a pause the pause is said first, in warn, with no verdict under it', () => {
    const root = body('ship-b', 'enough-data', 'paused');
    const warn = find(root, (n) => (attr(n, 'class') ?? '').includes('text-warn'))[0]!;
    expect(text(warn)).toBe('Paused');
    expect(paragraphs(root)[0]).toBe('Paused on 14.10: a fictional tracking fault is being fixed.');
    expect(squash(text(root))).not.toContain('Ship B.');
  });

  it('semibold leads for the verdicts', () => {
    for (const phase of ['ship-b', 'stop-for-harm', 'inconclusive'] as const) {
      const root = body(phase, 'enough-data');
      const lead = find(root, (n) => n.nodeName === 'span' && (attr(n, 'class') ?? '') === 'font-semibold')[0]!;
      expect(text(lead), phase).toMatch(/^(Ship B\.|Stopped: B did worse\.|Inconclusive at the six-month limit:)$/);
    }
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

  it('inconclusive without 50 views per group says so, with no interval', () => {
    const root = body('inconclusive', 'low-data');
    expect(paragraphs(root)[0]).toBe(
      "Inconclusive at the six-month limit: fewer than 50 views per group arrived, so no interval is shown. What I'll do now: keep page A and test a bolder change.",
    );
    expect(frames(root)).toHaveLength(0);
  });

  it('ship-b or stop-for-harm without 50 views per group (the rules never produce it) claims no verdict', () => {
    for (const phase of ['ship-b', 'stop-for-harm'] as const) {
      const root = body(phase, 'low-data');
      expect(paragraphs(root)).toEqual(['The interval for this look is not available.']);
      expect(frames(root)).toHaveLength(0);
    }
  });

  describe('a decided state never reads as running and is never empty', () => {
    const DECIDED = ['inconclusive', 'ship-b', 'stop-for-harm'] as const;
    const NAN = { n: Number.NaN, nA: Number.NaN, nB: Number.NaN, lower: Number.NaN, upper: Number.NaN, estimate: Number.NaN };
    const seriesKinds = { valid: undefined, empty: [], 'all-NaN': [NAN, { ...NAN, n: 100 }, { ...NAN, n: 176, lower: 1 }] };
    const counts = { below: [12, 14], at: [50, 50], above: [180, 176] } as const;
    const NEXT = "What I'll do now: keep page A and test a bolder change.";
    const running = /next look|Progress:|Planned end|Estimates appear|A\/B started|Calibrating/;
    for (const phase of DECIDED) {
      for (const [kind, series] of Object.entries(seriesKinds)) {
        for (const [amount, [nA, nB]] of Object.entries(counts)) {
          for (const fresh of ['fresh', 'paused'] as const) {
            it(`${phase}, ${kind} series, counts ${amount} 50, ${fresh}`, () => {
              const base = liveFixture(phase, 'enough-data', fresh);
              const s: LiveSnapshot = { ...base, nA, nB, series: series ?? base.series };
              const root = stateBody(s);
              const all = squash(text(root));
              const p = paragraphs(root).filter(
                (t) => !t.startsWith('Paused on') && !t.startsWith('now:') && !t.startsWith('final:') && !t.startsWith('last:') && !t.startsWith('Leaving'),
              );
              expect(all).not.toMatch(running);
              const interval = kind === 'valid' && amount !== 'below';
              if (fresh === 'paused') {
                // The pause is the state: it is said first, and no verdict stands under it.
                expect(paragraphs(root)[0], all).toMatch(/^Paused on \d\d\.\d\d: /);
                expect(p, all).toEqual([]);
                expect(all).not.toMatch(/Ship B\.|Stopped: B did worse|Inconclusive at the six-month limit/);
                expect(frames(root)).toHaveLength(interval ? 2 : 0);
                if (interval) expect(squash(text(root))).toContain('last:');
                else expect(withAttr(root, 'data-now-row')).toHaveLength(0);
                return;
              }
              expect(p.length, all).toBeGreaterThan(0);
              if (interval) {
                expect(frames(root)).toHaveLength(2);
                expect(p[0]).toMatch(/^(Ship B\.|Stopped: B did worse\.|Inconclusive at the six-month limit: the difference runs from)/);
              } else {
                expect(frames(root)).toHaveLength(0);
                // No Now row of any kind: no interval, and no collecting or due row.
                expect(withAttr(root, 'data-now-row')).toHaveLength(0);
                const expected =
                  phase !== 'inconclusive'
                    ? 'The interval for this look is not available.'
                    : amount === 'below'
                      ? `Inconclusive at the six-month limit: fewer than 50 views per group arrived, so no interval is shown. ${NEXT}`
                      : `Inconclusive at the six-month limit. ${NEXT}`;
                expect(p).toEqual([expected]);
              }
            });
          }
        }
      }
    }

    it('inconclusive without a next step ends at its first sentence', () => {
      const s = { ...liveFixture('inconclusive', 'enough-data', 'fresh'), series: [], nextStep: undefined };
      expect(paragraphs(stateBody(s))).toEqual(['Inconclusive at the six-month limit.']);
    });
  });

  it('both groups at 50 or more with no look yet: the first estimate is due, never "180 of 50"', () => {
    const s = { ...liveFixture('ab', 'enough-data', 'fresh'), series: [] };
    const all = squash(text(stateBody(s)));
    expect(all).toContain('50 views per group are in; the first estimate appears at the next look.');
    expect(all).not.toMatch(/\d+ of 50/);
    expect(byTag(chart(s), 'p').map((p) => squash(text(p)))).toEqual(['50 views per group are in; the first estimate appears at the next look.']);
  });

  it('a verdict never prints a bound it calls above or below zero as "0"', () => {
    const ship = { ...liveFixture('ship-b', 'enough-data', 'fresh'), series: [{ n: 176, nA: 176, nB: 176, lower: 0.3, upper: 26.3, estimate: 13 }] };
    expect(paragraphs(stateBody(ship))[0]).toContain('(+0.3 to +26.3 points)');
    const harm = { ...liveFixture('stop-for-harm', 'enough-data', 'fresh'), series: [{ n: 176, nA: 176, nB: 176, lower: -26.3, upper: -0.4, estimate: -13 }] };
    expect(paragraphs(stateBody(harm))[0]).toContain('(−26.3 to −0.4 points)');
    const tiny = { ...ship, series: [{ n: 176, nA: 176, nB: 176, lower: 0.0001, upper: 20, estimate: 10 }] };
    expect(paragraphs(stateBody(tiny))[0]).toContain('(+0.001 to +20.000 points)');
  });

  it('inconclusive rules out only what the interval rules out, rounded up', () => {
    const base = liveFixture('inconclusive', 'enough-data', 'fresh');
    const first = (s: LiveSnapshot) => paragraphs(stateBody(s))[0];
    // A caller's smaller number would be false: the interval still reaches +22.
    expect(first({ ...base, ruledOutAbove: 5 })).toContain('an effect larger than 22 points is ruled out');
    expect(first({ ...base, ruledOutAbove: 30 })).toContain('an effect larger than 30 points is ruled out');
    // 22.4 must not print 22: an effect of 22.2 is not ruled out.
    const reach = { ...base, series: [{ n: 176, nA: 176, nB: 176, lower: -14, upper: 22.4, estimate: 4 }] };
    expect(first(reach)).toContain('from −14 to +22 points, so an effect larger than 23 points is ruled out');
  });

  it('SRM failed: the status in warn, the counts and no interval', () => {
    const root = body('srm-suppressed', 'enough-data');
    const warn = find(root, (n) => (attr(n, 'class') ?? '').includes('text-warn'))[0]!;
    expect(text(warn)).toBe('SRM failed');
    expect(paragraphs(root)).toEqual([
      'SRM failed. The split check failed, so no verdict is shown.',
      'Views so far: 212 in A, 148 in B, where the design expects an even split.',
    ]);
    expect(squash(text(root))).not.toContain('now:');
    expect(frames(root)).toHaveLength(0);
  });

  it('A/A failed: its sentence with both dates', () => {
    expect(paragraphs(body('aa-failed', 'enough-data'))).toEqual([
      'Calibration stopped on 13.10: the split check failed. Calibration restarts on 20.10.',
      'Views when it stopped: 212 in A, 148 in B.',
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
