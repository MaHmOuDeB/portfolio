import { parseFragment } from 'parse5';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChartFrame, MarkLayer, MARK_UNITS, type ChartFrameProps } from '@/components/kit/ChartFrame';
import { formatNumber, formatSignedPoints } from '@/lib/figure/format';

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
const classes = (n: Node) => (attr(n, 'class') ?? '').split(/\s+/);

/** Every element paired with its nearest <svg> ancestor (or undefined outside any svg). */
function withSvgAncestor(node: Node, svg?: Node, out: Array<[Node, Node | undefined]> = []) {
  for (const child of node.childNodes ?? []) {
    out.push([child, svg]);
    withSvgAncestor(child, child.nodeName === 'svg' ? child : svg, out);
  }
  return out;
}

// A fictional difference between two groups, in points, over views per group.
const FIXTURE: ChartFrameProps = {
  id: 'fixture',
  ariaLabel: 'A fictional difference between the groups that settles near zero',
  x: {
    domain: [0, 250],
    ticks: { narrow: [0, 100, 200], wide: [0, 50, 100, 150, 200, 250] },
    format: (v) => formatNumber(v, 0),
    label: 'Views per group',
    refs: ['simulated'],
  },
  y: {
    domain: [-20, 40],
    ticks: { narrow: [-20, 0, 20, 40], wide: [-20, -10, 0, 10, 20, 30, 40] },
    format: (v) => formatSignedPoints(v, 0),
    label: 'B − A (percentage points)',
    refs: ['simulated', 'build'],
    zeroLabel: 'no difference',
    aboveLabel: 'B higher',
    belowLabel: 'B lower',
  },
  height: { narrow: 200, wide: 280 },
  marks: (ctx) => (
    <path
      data-mark=""
      d={`M0 ${ctx.yPx(30)} L${MARK_UNITS} ${ctx.yPx(2)}`}
      fill="none"
      stroke="var(--color-muted)"
    />
  ),
  overlays: (ctx) => (
    <circle data-mark="" cx={`${ctx.xFrac(250) * 100}%`} cy={ctx.yPx(2)} r={4} fill="var(--color-series-2)" />
  ),
  annotation: (ctx) => ({ x: 120, y: -14, text: 'The estimate settles', anchor: ctx.layout === 'narrow' ? 'start' : 'end' }),
};

const render = (props: Partial<ChartFrameProps> = {}) =>
  parse(renderToStaticMarkup(<ChartFrame {...FIXTURE} {...props} />));
const frames = (root: Node) => byTag(root, 'svg').filter((s) => hasAttr(s, 'data-chart-frame'));
const ticks = (root: Node) => byTag(root, 'text').filter((t) => hasAttr(t, 'data-tick'));

describe('ChartFrame', () => {
  it('draws two frames, narrow under sm and wide from sm, each a labelled image without a viewBox', () => {
    const [narrow, wide, ...rest] = frames(render());
    expect(rest).toHaveLength(0);
    expect(attr(narrow!, 'data-layout')).toBe('narrow');
    expect(classes(narrow!)).toContain('sm:hidden');
    expect(attr(wide!, 'data-layout')).toBe('wide');
    expect(classes(wide!)).toContain('max-sm:hidden');
    for (const svg of [narrow!, wide!]) {
      expect(hasAttr(svg, 'viewBox')).toBe(false);
      expect(attr(svg, 'role')).toBe('img');
      expect(attr(svg, 'aria-label')).toBe(FIXTURE.ariaLabel);
      expect(attr(svg, 'width')).toBe('100%');
    }
    // Height = the plot height plus fixed room for the labels, so the two layouts differ by 80 px.
    expect(Number(attr(wide!, 'height')) - Number(attr(narrow!, 'height'))).toBe(80);
  });

  it('renders one layout alone when it is forced, without the responsive classes', () => {
    const only = frames(render({ layout: 'narrow' }));
    expect(only).toHaveLength(1);
    expect(attr(only[0]!, 'data-layout')).toBe('narrow');
    expect(classes(only[0]!)).not.toContain('sm:hidden');
  });

  it('never puts text inside an svg that has a viewBox', () => {
    const pairs = withSvgAncestor(render());
    const texts = pairs.filter(([n]) => n.nodeName === 'text' || n.nodeName === 'tspan');
    expect(texts.length).toBeGreaterThan(0);
    for (const [, svg] of texts) {
      expect(svg).toBeDefined();
      expect(hasAttr(svg!, 'viewBox')).toBe(false);
    }
  });

  it('puts marks in a stretched layer of 1000 units that holds no text', () => {
    const layers = byTag(render(), 'svg').filter((s) => hasAttr(s, 'data-mark-layer'));
    expect(layers).toHaveLength(2);
    for (const layer of layers) {
      expect(attr(layer, 'preserveAspectRatio')).toBe('none');
      expect(attr(layer, 'viewBox')).toMatch(/^0 0 1000 (200|280)$/);
      expect(attr(layer, 'width')).toBe('100%');
      expect(byTag(layer, 'text')).toHaveLength(0);
      // Every stroke inside keeps its width however far the layer is stretched.
      expect(classes(layer)).toContain('**:[vector-effect:non-scaling-stroke]');
      expect(find(layer, (n) => hasAttr(n, 'data-mark'))).toHaveLength(1);
    }
  });

  it('MarkLayer alone is the same stretched layer', () => {
    const root = parse(renderToStaticMarkup(<MarkLayer height={120}>{null}</MarkLayer>));
    const [svg] = byTag(root, 'svg');
    expect(attr(svg!, 'viewBox')).toBe('0 0 1000 120');
    expect(attr(svg!, 'preserveAspectRatio')).toBe('none');
    expect(attr(svg!, 'height')).toBe('120');
  });

  it('marks every tick label with the axis refs, never empty, in text-xs muted', () => {
    const root = render();
    const [narrow, wide] = frames(root);
    const xRefs = 'simulated';
    const yRefs = 'simulated build';
    for (const [frame, xCount, yCount] of [
      [narrow!, 3, 4],
      [wide!, 6, 7],
    ] as const) {
      const xs = ticks(frame).filter((t) => attr(t, 'data-tick') === 'x');
      const ys = ticks(frame).filter((t) => attr(t, 'data-tick') === 'y');
      expect(xs).toHaveLength(xCount);
      expect(ys).toHaveLength(yCount);
      for (const t of xs) expect(attr(t, 'data-derived')).toBe(xRefs);
      for (const t of ys) expect(attr(t, 'data-derived')).toBe(yRefs);
      for (const t of [...xs, ...ys]) {
        expect(classes(t)).toEqual(expect.arrayContaining(['text-xs', 'fill-muted']));
      }
    }
    expect(text(ticks(wide!).find((t) => attr(t, 'data-tick') === 'y')!)).toBe('−20');
  });

  it('gives y tick labels, which sit inside the plot, a 2 px bg halo', () => {
    const [, wide] = frames(render());
    for (const t of ticks(wide!).filter((n) => attr(n, 'data-tick') === 'y')) {
      expect(attr(t, 'paint-order')).toBe('stroke');
      expect(attr(t, 'stroke')).toBe('var(--color-bg)');
      expect(attr(t, 'stroke-width')).toBe('4px');
    }
  });

  it('places x ticks at percentages of the width: the first starts, the last ends, the rest centre', () => {
    const [, wide] = frames(render());
    const xs = ticks(wide!).filter((t) => attr(t, 'data-tick') === 'x');
    expect(xs.map((t) => attr(t, 'x'))).toEqual(['0%', '20%', '40%', '60%', '80%', '100%']);
    expect(xs.map((t) => attr(t, 'text-anchor'))).toEqual(['start', 'middle', 'middle', 'middle', 'middle', 'end']);
    expect(xs.map(text)).toEqual(['0', '50', '100', '150', '200', '250']);
  });

  it('draws the zero line in ink, its tick reads "0" and carries the zero label', () => {
    const [, wide] = frames(render());
    const zero = find(wide!, (n) => hasAttr(n, 'data-zero-line'));
    expect(zero).toHaveLength(1);
    expect(attr(zero[0]!, 'class')).toContain('stroke-ink');
    const zeroTick = ticks(wide!).find((t) => hasAttr(t, 'data-zero-tick'))!;
    expect(attr(zeroTick, 'data-derived')).toBe('simulated build');
    expect(text(zeroTick)).toBe('0no difference');
    expect(text(byTag(zeroTick, 'tspan')[0]!)).toBe('0');
    expect(text(byTag(zeroTick, 'tspan')[1]!)).toBe('no difference');
    // The zero gridline is not drawn twice.
    const grid = find(wide!, (n) => hasAttr(n, 'data-grid'));
    expect(grid).toHaveLength(6);
  });

  it('writes "B higher" and "B lower" right-aligned just above and below the zero line', () => {
    const [, wide] = frames(render());
    const zeroY = Number(attr(find(wide!, (n) => hasAttr(n, 'data-zero-line'))[0]!, 'y1'));
    const above = find(wide!, (n) => attr(n, 'data-side') === 'above')[0]!;
    const below = find(wide!, (n) => attr(n, 'data-side') === 'below')[0]!;
    expect(text(above)).toBe('B higher');
    expect(text(below)).toBe('B lower');
    for (const t of [above, below]) {
      expect(attr(t, 'x')).toBe('100%');
      expect(attr(t, 'text-anchor')).toBe('end');
    }
    expect(Number(attr(above, 'y'))).toBe(zeroY - 4);
    expect(attr(above, 'dominant-baseline')).toBeUndefined();
    expect(Number(attr(below, 'y'))).toBe(zeroY + 4);
    expect(attr(below, 'dominant-baseline')).toBe('hanging');
  });

  it('labels both axes in text-xs muted', () => {
    const [, wide] = frames(render());
    const labels = find(wide!, (n) => hasAttr(n, 'data-axis-label'));
    expect(labels.map(text)).toEqual(['B − A (percentage points)', 'Views per group']);
    for (const l of labels) expect(classes(l)).toEqual(expect.arrayContaining(['text-xs', 'fill-muted']));
  });

  it('draws the annotation semibold in text-sm with a 3 px bg halo painted under the fill', () => {
    const root = render();
    const notes = find(root, (n) => hasAttr(n, 'data-annotation'));
    expect(notes).toHaveLength(2);
    for (const note of notes) {
      expect(text(note)).toBe('The estimate settles');
      expect(classes(note)).toEqual(expect.arrayContaining(['text-sm', 'font-semibold', 'fill-ink']));
      expect(attr(note, 'paint-order')).toBe('stroke');
      expect(attr(note, 'stroke')).toBe('var(--color-bg)');
      expect(attr(note, 'stroke-width')).toBe('6px');
      expect(attr(note, 'x')).toBe('48%');
    }
    expect(notes.map((n) => attr(n, 'text-anchor'))).toEqual(['start', 'end']);
  });

  it('marks a number in the annotation only when given refs', () => {
    const root = render({
      annotation: () => ({ x: 120, y: -14, text: 'A rise of five points', anchor: 'start', refs: ['simulated'] }),
    });
    for (const note of find(root, (n) => hasAttr(n, 'data-annotation'))) {
      expect(attr(note, 'data-derived')).toBe('simulated');
    }
    for (const note of find(render(), (n) => hasAttr(n, 'data-annotation'))) {
      expect(hasAttr(note, 'data-derived')).toBe(false);
    }
  });

  it('gives marks and overlays the same plot coordinates', () => {
    const seen: Array<{ layout: string; height: number; top: number; bottom: number; mid: number }> = [];
    renderToStaticMarkup(
      <ChartFrame
        {...FIXTURE}
        marks={(ctx) => {
          seen.push({ layout: ctx.layout, height: ctx.height, top: ctx.yPx(40), bottom: ctx.yPx(-20), mid: ctx.xFrac(125) });
          return null;
        }}
      />,
    );
    expect(seen).toEqual([
      { layout: 'narrow', height: 200, top: 0, bottom: 200, mid: 0.5 },
      { layout: 'wide', height: 280, top: 0, bottom: 280, mid: 0.5 },
    ]);
  });

  it('refuses empty axis refs', () => {
    expect(() => render({ y: { ...FIXTURE.y, refs: [] } })).toThrow(/at least one ref/);
  });
});

describe('ChartFrame with hostile input', () => {
  const html = (props: Partial<ChartFrameProps>) => renderToStaticMarkup(<ChartFrame {...FIXTURE} {...props} />);

  it('draws a zero-width x domain and an all-equal y domain without NaN', () => {
    const out = html({
      x: { ...FIXTURE.x, domain: [3, 3], ticks: { narrow: [3], wide: [3] } },
      y: { ...FIXTURE.y, domain: [7, 7], ticks: { narrow: [7], wide: [7] } },
      annotation: undefined,
    });
    expect(out).not.toMatch(/NaN|Infinity/);
    const root = parse(out);
    // Zero is outside [7, 7]: no zero line, no zero tick, no above or below labels.
    expect(find(root, (n) => hasAttr(n, 'data-zero-line'))).toHaveLength(0);
    expect(find(root, (n) => hasAttr(n, 'data-side'))).toHaveLength(0);
    const [, wide] = frames(root);
    const ys = ticks(wide!).filter((t) => attr(t, 'data-tick') === 'y');
    expect(ys.map(text)).toEqual(['+7']);
    const xs = ticks(wide!).filter((t) => attr(t, 'data-tick') === 'x');
    expect(xs.map((t) => [attr(t, 'x'), attr(t, 'text-anchor')])).toEqual([['50%', 'middle']]);
  });

  it('draws the zero line for a domain of only zero, its tick "0"', () => {
    const root = parse(
      html({ y: { ...FIXTURE.y, domain: [0, 0], ticks: { narrow: [0], wide: [0] } }, annotation: undefined }),
    );
    const [, wide] = frames(root);
    expect(find(wide!, (n) => hasAttr(n, 'data-zero-line'))).toHaveLength(1);
    expect(text(byTag(ticks(wide!).find((t) => hasAttr(t, 'data-zero-tick'))!, 'tspan')[0]!)).toBe('0');
  });

  it('prints a tick of -0 or one that rounds to zero as "0", never "+0" or "−0"', () => {
    const out = html({
      y: { ...FIXTURE.y, domain: [-0.4, 0.3], ticks: { narrow: [-0.4, -0, 0.3], wide: [-0.4, -0.2, 0, 0.2] } },
    });
    expect(out).not.toMatch(/[+−]0(?![.\d])/);
  });

  it('drops ticks that are not finite or fall outside the domain instead of pinning them to an edge', () => {
    const root = render({
      x: { ...FIXTURE.x, ticks: { narrow: [0, Number.NaN, 300], wide: [-50, 0, Number.POSITIVE_INFINITY, 250] } },
    });
    const [narrow, wide] = frames(root);
    expect(ticks(narrow!).filter((t) => attr(t, 'data-tick') === 'x').map(text)).toEqual(['0']);
    expect(ticks(wide!).filter((t) => attr(t, 'data-tick') === 'x').map(text)).toEqual(['0', '250']);
  });

  it('renders an empty series and no ticks as a calm empty frame', () => {
    const out = html({
      x: { ...FIXTURE.x, ticks: { narrow: [], wide: [] } },
      y: { ...FIXTURE.y, domain: [2, 9], ticks: { narrow: [], wide: [] } },
      marks: () => null,
      overlays: undefined,
      annotation: undefined,
    });
    expect(out).not.toMatch(/NaN|Infinity/);
    expect(frames(parse(out))).toHaveLength(2);
  });

  it('keeps an annotation outside the domain inside the plot', () => {
    const root = render({ annotation: () => ({ x: 900, y: 500, text: 'Far away', anchor: 'end' }) });
    const [, wide] = frames(root);
    const note = find(wide!, (n) => hasAttr(n, 'data-annotation'))[0]!;
    expect(attr(note, 'x')).toBe('100%');
    expect(Number(attr(note, 'y'))).toBeGreaterThanOrEqual(0);
  });

  it('refuses a domain that is not finite', () => {
    expect(() => render({ y: { ...FIXTURE.y, domain: [0, Number.NaN] } })).toThrow(TypeError);
  });
});
