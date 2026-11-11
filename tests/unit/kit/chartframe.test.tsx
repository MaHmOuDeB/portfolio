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

  it('puts the y tick labels in a left gutter, right-aligned and centred on their gridline, never on the plot', () => {
    const [, wide] = frames(render());
    const grid = find(wide!, (n) => hasAttr(n, 'data-grid')).map((g) => Number(attr(g, 'y1')));
    for (const t of ticks(wide!).filter((n) => attr(n, 'data-tick') === 'y' && !hasAttr(n, 'data-zero-tick'))) {
      expect(attr(t, 'x')).toBe('0');
      expect(Number(attr(t, 'dx'))).toBeLessThan(0);
      expect(attr(t, 'text-anchor')).toBe('end');
      expect(attr(t, 'dominant-baseline')).toBe('middle');
      expect(grid).toContain(Number(attr(t, 'y')));
    }
    // The gutter is the svg's own padding, wide enough for the longest label.
    const style = attr(wide!, 'style')!;
    expect(style).toMatch(/padding-left:\s*\d+px/);
    expect(Number(/padding-left:\s*(\d+)px/.exec(style)![1])).toBeGreaterThanOrEqual('−20'.length * 8);
    expect(attr(wide!, 'class')).toContain('overflow-visible');
  });

  it('snaps the y scale to the middle of a pixel row, so a horizontal 1 px line is sharp', () => {
    const ys: number[] = [];
    renderToStaticMarkup(
      <ChartFrame {...FIXTURE} marks={(ctx) => { ys.push(ctx.yPx(13.37), ctx.yPx(0), ctx.yPx(-20)); return null; }} />,
    );
    for (const y of ys) expect(y % 1).toBe(0.5);
  });

  it('places x ticks at percentages of the width: the first starts, the last ends, the rest centre', () => {
    const [, wide] = frames(render());
    const xs = ticks(wide!).filter((t) => attr(t, 'data-tick') === 'x');
    expect(xs.map((t) => attr(t, 'x'))).toEqual(['0%', '20%', '40%', '60%', '80%', '100%']);
    expect(xs.map((t) => attr(t, 'text-anchor'))).toEqual(['start', 'middle', 'middle', 'middle', 'middle', 'end']);
    expect(xs.map(text)).toEqual(['0', '50', '100', '150', '200', '250']);
  });

  describe('outermost x tick labels inside the domain', () => {
    // A log axis, as the exaggeration chart draws it: the domain runs from 0.02 to 50 and the ticks
    // 0.1, 1 and 10 sit at about 21%, 50% and 79% of the plot, not on its ends.
    const LOG: Partial<ChartFrameProps> = {
      x: {
        domain: [Math.log10(0.02), Math.log10(50)],
        ticks: { narrow: [-1, 0, 1], wide: [-1, 0, 1] },
        format: (v) => formatNumber(10 ** v, 1),
        label: 'Ratio (log scale)',
        refs: ['simulated'],
      },
      annotation: undefined,
    };
    const styles = (props: Partial<ChartFrameProps>) =>
      [...renderToStaticMarkup(<ChartFrame {...FIXTURE} {...props} />).matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]!);
    const xTicks = (props: Partial<ChartFrameProps>, layout = 1) =>
      ticks(frames(render(props))[layout]!).filter((t) => attr(t, 'data-tick') === 'x');

    it('centres each on its tick, as the ticks between them are', () => {
      const xs = xTicks(LOG);
      expect(xs.map(text)).toEqual(['0.1', '1', '10']);
      expect(xs.map((t) => attr(t, 'text-anchor'))).toEqual(['middle', 'middle', 'middle']);
      expect(Number.parseFloat(attr(xs[0]!, 'x')!)).toBeCloseTo((100 * (-1 - Math.log10(0.02))) / (2 * Math.log10(50)), 2);
    });

    it('keeps start and end only for a tick on the end of the domain', () => {
      const ends = xTicks({ ...LOG, x: { ...LOG.x!, ticks: { narrow: [Math.log10(0.02), 0, 1], wide: [Math.log10(0.02), 0, 1] } } });
      expect(ends.map((t) => attr(t, 'text-anchor'))).toEqual(['start', 'middle', 'middle']);
      const one = xTicks({ ...LOG, x: { ...LOG.x!, ticks: { narrow: [Math.log10(50)], wide: [Math.log10(50)] } } });
      expect(one.map((t) => attr(t, 'text-anchor'))).toEqual(['end']);
    });

    describe('never leaves the frame', () => {
      // No zero in the y domain, so no zero-line words and no right margin; y labels one digit wide.
      const Y: ChartFrameProps['y'] = {
        domain: [1, 5],
        ticks: { narrow: [1, 3, 5], wide: [1, 2, 3, 4, 5] },
        format: (v) => formatNumber(v, 0),
        label: 'Count',
        refs: ['simulated'],
      };
      // Long labels close to both ends: 600,000 at 6% and 9,400,000 at 94% of the plot.
      const WIDE_LABELS: Partial<ChartFrameProps> = {
        x: { domain: [0, 10_000_000], ticks: { narrow: [600_000, 9_400_000], wide: [600_000, 9_400_000] }, format: (v) => formatNumber(v, 0), label: 'Visitors', refs: ['simulated'] },
        y: Y,
        annotation: undefined,
      };

      it('below the column width where a centred label would come within 4 px of the frame edge, anchors it at its tick, away from the edge', () => {
        // Worked by hand, at 8.4 px a character. The gutter is 17 px (one digit and the 8 px gap) and
        // there is no right margin.
        // "600,000": half of 58.8 px, plus the 4 px gap, is 33.4 px left of its tick; 17 px of that is
        // gutter, so the plot must give 16.4 px in its first 6%: 274 px of plot, a 291 px column.
        // "9,400,000": half of 75.6 px, plus the gap, is 41.8 px in the last 6%: 697 px, a 714 px column.
        const [narrow, wide] = styles(WIDE_LABELS);
        for (const [rules, layout] of [[narrow, 'narrow'], [wide, 'wide']] as const) {
          expect(rules).toBe(
            `@container (width < 291px){[data-chart="fixture"] svg[data-layout="${layout}"] [data-tick-edge="first"]{text-anchor:start}}` +
              `@container (width < 714px){[data-chart="fixture"] svg[data-layout="${layout}"] [data-tick-edge="last"]{text-anchor:end}}`,
          );
        }
        const xs = xTicks(WIDE_LABELS);
        expect(xs.map((t) => [text(t), attr(t, 'text-anchor'), attr(t, 'data-tick-edge')])).toEqual([
          ['600,000', 'middle', 'first'],
          ['9,400,000', 'middle', 'last'],
        ]);
      });

      it('keeps the gap for a label whose estimate just fits its gutter: a "%" is wider than the digit it is counted as', () => {
        // "300%" is counted as 33.6 px, so its half, 16.8 px, would fit the 17 px gutter; with the
        // 4 px gap it needs 3.8 px in the first 30% of the plot: 13 px, a 30 px column.
        const percent: Partial<ChartFrameProps> = {
          x: { domain: [0, 1000], ticks: { narrow: [300, 1000], wide: [300, 1000] }, format: (v) => `${formatNumber(v, 0)}%`, label: 'Share', refs: ['simulated'] },
          y: Y,
          annotation: undefined,
        };
        expect(styles(percent)[1]).toBe(
          '@container (width < 30px){[data-chart="fixture"] svg[data-layout="wide"] [data-tick-edge="first"]{text-anchor:start}}',
        );
        expect(xTicks(percent).map((t) => [text(t), attr(t, 'text-anchor'), attr(t, 'data-tick-edge')])).toEqual([
          ['300%', 'middle', 'first'],
          ['1,000%', 'end', undefined],
        ]);
      });

      it('needs no rule where the centred label always fits in the gutter', () => {
        // "0.1" is 12.6 px either side of its tick, 16.6 px with the gap; the y gutter of "+40" is 34 px wide.
        const xs = xTicks({ ...LOG, y: FIXTURE.y });
        expect(attr(xs[0]!, 'data-tick-edge')).toBeUndefined();
        expect(styles({ ...LOG, y: FIXTURE.y }).join('')).not.toContain('data-tick-edge="first"');
        // The right margin holds "no difference", so "10" fits on that side too.
        expect(attr(xs[2]!, 'data-tick-edge')).toBeUndefined();
        expect(styles({ ...LOG, y: FIXTURE.y })).toEqual([]);
      });

      it('marks nothing on an axis whose ticks sit on the domain ends', () => {
        expect(render().childNodes!.length).toBeGreaterThan(0);
        expect(find(render(), (n) => hasAttr(n, 'data-tick-edge'))).toHaveLength(0);
      });
    });
  });

  it('draws the zero line in ink, its tick reads "0" and carries the zero label', () => {
    const [, wide] = frames(render());
    const zero = find(wide!, (n) => hasAttr(n, 'data-zero-line'));
    expect(zero).toHaveLength(1);
    expect(attr(zero[0]!, 'class')).toContain('stroke-ink');
    const zeroTick = ticks(wide!).find((t) => hasAttr(t, 'data-zero-tick'))!;
    expect(attr(zeroTick, 'data-derived')).toBe('simulated build');
    expect(text(zeroTick)).toBe('0');
    expect(attr(zeroTick, 'x')).toBe('0');
    expect(attr(zeroTick, 'text-anchor')).toBe('end');
    // The words of the zero line are in the right margin, on the zero line.
    const words = find(wide!, (n) => hasAttr(n, 'data-zero-label'))[0]!;
    expect(text(words)).toBe('no difference');
    expect(Number(attr(words, 'y'))).toBe(Number(attr(zero[0]!, 'y1')));
    expect(attr(words, 'x')).toBe('100%');
    expect(Number(attr(words, 'dx'))).toBeGreaterThan(0);
    // The zero gridline is not drawn twice.
    const grid = find(wide!, (n) => hasAttr(n, 'data-grid'));
    expect(grid).toHaveLength(6);
  });

  it('stacks "B higher", "no difference" and "B lower" in the right margin, clear of the plot', () => {
    const [narrow, wide] = frames(render());
    const zeroY = Number(attr(find(wide!, (n) => hasAttr(n, 'data-zero-line'))[0]!, 'y1'));
    const above = find(wide!, (n) => attr(n, 'data-side') === 'above')[0]!;
    const below = find(wide!, (n) => attr(n, 'data-side') === 'below')[0]!;
    expect(text(above)).toBe('B higher');
    expect(text(below)).toBe('B lower');
    for (const t of [above, below]) {
      // x is the plot's right edge; the 8 px dx puts the text in the margin, off the plot.
      expect(attr(t, 'x')).toBe('100%');
      expect(Number(attr(t, 'dx'))).toBeGreaterThanOrEqual(8);
      expect(attr(t, 'text-anchor')).toBeUndefined();
    }
    // Above and below clear the one-line zero label by at least 4 px.
    expect(zeroY - Number(attr(above, 'y'))).toBeGreaterThanOrEqual(8 + 4);
    expect(attr(below, 'dominant-baseline')).toBe('hanging');
    expect(Number(attr(below, 'y')) - zeroY).toBeGreaterThanOrEqual(8 + 4);
    // The margin is the svg's right padding, as wide as the longest word.
    expect(Number(/padding-right:\s*(\d+)px/.exec(attr(wide!, 'style')!)![1])).toBeGreaterThanOrEqual('no difference'.length * 6);
    // On a phone "no difference" takes two lines to keep the plot wide; the text still reads whole.
    const narrowWords = find(narrow!, (n) => hasAttr(n, 'data-zero-label'))[0]!;
    expect(byTag(narrowWords, 'tspan').map(text)).toEqual(['no ', 'difference']);
    expect(text(narrowWords)).toBe('no difference');
    expect(Number(/padding-right:\s*(\d+)px/.exec(attr(narrow!, 'style')!)![1])).toBeLessThan(
      Number(/padding-right:\s*(\d+)px/.exec(attr(wide!, 'style')!)![1]),
    );
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

  describe('the annotation is guarded against a narrow plot', () => {
    const rules = (props: Partial<ChartFrameProps> = {}) => {
      const html = renderToStaticMarkup(<ChartFrame {...FIXTURE} {...props} />);
      return [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]!);
    };
    const padding = (html: string, layout: string) => {
      const style = new RegExp(`data-layout="${layout}"[^>]*style="padding-left:(\\d+)px;padding-right:(\\d+)px"`).exec(html)!;
      return Number(style[1]) + Number(style[2]);
    };

    it('hides it, per layout, below the container width its text needs', () => {
      const html = renderToStaticMarkup(<ChartFrame {...FIXTURE} />);
      const [narrow, wide] = rules();
      // "The estimate settles" (20 characters), start-anchored at 48% in the narrow layout, end-anchored in the wide one.
      const need = (anchorRoom: number, layout: string) =>
        padding(html, layout) + Math.ceil((20 * 7.9 + 8) / anchorRoom);
      expect(narrow).toBe(
        `@container (width < ${need(1 - 0.48, 'narrow')}px){[data-chart="${FIXTURE.id}"] svg[data-layout="narrow"] [data-annotation]{display:none}}`,
      );
      expect(wide).toBe(
        `@container (width < ${need(0.48, 'wide')}px){[data-chart="${FIXTURE.id}"] svg[data-layout="wide"] [data-annotation]{display:none}}`,
      );
    });

    it('needs a wider column for a longer text, and none at all for a chart without an annotation', () => {
      const min = (text: string) => Number(/width < (\d+)px/.exec(rules({ annotation: () => ({ x: 250, y: 30, text, anchor: 'end' }) })[1]!)![1]);
      expect(min('The interval narrows as views grow')).toBeGreaterThan(min('The interval narrows'));
      expect(rules({ annotation: undefined })).toEqual([]);
    });

    it('hides it always when its anchor leaves no room on its side', () => {
      const [rule] = rules({ annotation: () => ({ x: 0, y: 30, text: 'Nowhere to go', anchor: 'end' }) });
      expect(rule).toBe(`[data-chart="${FIXTURE.id}"] svg[data-layout="narrow"] [data-annotation]{display:none}`);
    });

    it('makes the chart a container, so the query measures its own column', () => {
      const html = renderToStaticMarkup(<ChartFrame {...FIXTURE} />);
      expect(html).toContain('style="container-type:inline-size"');
    });
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
      { layout: 'narrow', height: 200, top: 0.5, bottom: 200.5, mid: 0.5 },
      { layout: 'wide', height: 280, top: 0.5, bottom: 280.5, mid: 0.5 },
    ]);
  });

  it('refuses empty axis refs', () => {
    expect(() => render({ y: { ...FIXTURE.y, refs: [] } })).toThrow(/at least one ref/);
  });

  it('refuses a digit in the accessible name: the finding is said in words, the numbers live in the table', () => {
    expect(() => render({ ariaLabel: 'The interval is 12 points wide' })).toThrow(TypeError);
    expect(() => render({ ariaLabel: 'Settles near zero after 3 looks' })).toThrow(/digit/);
    expect(() => render({ ariaLabel: 'The interval narrows and still includes zero' })).not.toThrow();
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
    expect(text(ticks(wide!).find((t) => hasAttr(t, 'data-zero-tick'))!)).toBe('0');
  });

  it('refuses a tick format too coarse for the step: a false "0" or a repeated label', () => {
    // At 0 digits −0.4, −0.2 and +0.2 would all print "0", next to the real zero tick.
    expect(() =>
      html({ y: { ...FIXTURE.y, domain: [-0.4, 0.3], ticks: { narrow: [-0.4, 0.3], wide: [-0.4, -0.2, 0, 0.2] } } }),
    ).toThrow(TypeError);
    // A non-zero tick that prints like zero is refused even without a zero tick beside it.
    expect(() =>
      html({ y: { ...FIXTURE.y, domain: [0.1, 0.9], ticks: { narrow: [0.2], wide: [0.2, 0.8] } }, annotation: undefined }),
    ).toThrow(/prints like zero/);
    // −1 and −0.5 both print "−1" at 0 digits.
    expect(() =>
      html({ y: { ...FIXTURE.y, domain: [-1.2, 0.9], ticks: { narrow: [-1, 0.5], wide: [-1, -0.5, 0, 0.5] } } }),
    ).toThrow(/twice/);
    // The same on the x axis.
    expect(() => html({ x: { ...FIXTURE.x, ticks: { narrow: [0, 100], wide: [100, 100.2] } } })).toThrow(/twice/);
  });

  it('prints distinct labels at enough digits, a -0 tick as "0", never "+0" or "−0"', () => {
    const root = render({
      y: {
        ...FIXTURE.y,
        domain: [-0.4, 0.3],
        ticks: { narrow: [-0.4, -0, 0.3], wide: [-0.4, -0.2, 0, 0.2] },
        format: (v) => formatSignedPoints(v, 1),
      },
      annotation: undefined,
    });
    const [narrow, wide] = frames(root);
    const labels = (f: Node) => ticks(f).filter((t) => attr(t, 'data-tick') === 'y').map((t) => text(byTag(t, 'tspan')[0] ?? t));
    expect(labels(narrow!)).toEqual(['−0.4', '+0.3', '0']);
    expect(labels(wide!)).toEqual(['−0.4', '−0.2', '+0.2', '0']);
    expect(renderToStaticMarkup(<ChartFrame {...FIXTURE} />)).not.toMatch(/[+−]0(?![.\d])/);
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

describe('ChartFrame with a fixed-decimals axis format', () => {
  const fixed1 = (v: number) => formatNumber(v, 1, { fixed: true });
  const tickText = (f: Node, axis: 'x' | 'y') =>
    ticks(f).filter((t) => attr(t, 'data-tick') === axis).map((t) => text(byTag(t, 'tspan')[0] ?? t));

  it('prints every x tick at one decimal: 0.5 to 1 reads "0.5" to "1.0"', () => {
    const steps = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
    const root = render({
      x: { ...FIXTURE.x, domain: [0.5, 1], ticks: { narrow: steps, wide: steps }, format: fixed1 },
      annotation: undefined,
    });
    for (const f of frames(root)) expect(tickText(f, 'x')).toEqual(['0.5', '0.6', '0.7', '0.8', '0.9', '1.0']);
  });

  it('prints the y ticks and the zero tick at one decimal, with U+2212 and no signed zero', () => {
    const root = render({
      y: { ...FIXTURE.y, domain: [-1, 1], ticks: { narrow: [-1, 0, 1], wide: [-1, -0.5, -0, 0.5, 1] }, format: fixed1 },
      annotation: undefined,
    });
    const [narrow, wide] = frames(root);
    expect(tickText(narrow!, 'y')).toEqual(['−1.0', '1.0', '0.0']);
    expect(tickText(wide!, 'y')).toEqual(['−1.0', '−0.5', '0.5', '1.0', '0.0']);
  });

  it('still refuses a non-zero tick that prints like zero at the chosen decimals', () => {
    expect(() =>
      render({ y: { ...FIXTURE.y, domain: [-0.2, 0.2], ticks: { narrow: [0.04], wide: [-0.04, 0, 0.04] }, format: fixed1 }, annotation: undefined }),
    ).toThrow(/prints like zero/);
  });
});
