import { parseFragment } from 'parse5';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IntervalGlyph } from '@/components/kit/IntervalGlyph';
import { glyphGeometry } from '@/lib/figure/glyph';

type Node = { nodeName: string; attrs?: Array<{ name: string; value: string }>; childNodes?: Node[] };

function elements(html: string, name: string): Array<Record<string, string>> {
  const found: Array<Record<string, string>> = [];
  const walk = (node: Node): void => {
    if (node.nodeName === name) {
      found.push(Object.fromEntries((node.attrs ?? []).map((a) => [a.name, a.value])));
    }
    node.childNodes?.forEach(walk);
  };
  walk(parseFragment(html) as unknown as Node);
  return found;
}

function first(html: string, name: string): Record<string, string> {
  const [match] = elements(html, name);
  if (!match) throw new Error(`no <${name}> in markup`);
  return match;
}

describe('glyphGeometry', () => {
  it('inline is the specified 10 px mark', () => {
    expect(glyphGeometry('inline')).toEqual({
      height: 10,
      bar: 2,
      capWidth: 1.5,
      capHeight: 8,
      dot: 8,
      halo: 2,
    });
  });

  it('large is the inline mark times 1.6', () => {
    const inline = glyphGeometry('inline');
    const large = glyphGeometry('large');
    for (const key of Object.keys(inline) as Array<keyof typeof inline>) {
      expect(large[key]).toBeCloseTo(inline[key] * 1.6, 9);
    }
  });
});

describe('IntervalGlyph', () => {
  it('draws the filled inline glyph, decorative by default', () => {
    const html = renderToStaticMarkup(<IntervalGlyph />);
    const svg = first(html, 'svg');
    expect(svg).toMatchObject({ width: '48', height: '10', 'aria-hidden': 'true' });
    expect(svg).not.toHaveProperty('role');
    expect(svg).not.toHaveProperty('aria-label');

    const rects = elements(html, 'rect');
    const caps = rects.filter((r) => r.width === '1.5');
    expect(caps).toHaveLength(2);
    for (const cap of caps) {
      expect(cap).toMatchObject({ height: '8', fill: 'var(--color-series-1)' });
    }
    const bars = rects.filter((r) => r.height === '2');
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ fill: 'var(--color-series-1)' });
    expect(rects).toHaveLength(3);

    const dot = first(html, 'circle');
    expect(dot).toMatchObject({
      r: '4',
      fill: 'var(--color-series-2)',
      stroke: 'var(--color-bg)',
      'stroke-width': '2',
      'paint-order': 'stroke',
    });
    expect(Number(dot.cx)).toBeCloseTo(0.62 * 48, 6);
  });

  it('places the dot at estimateAt of the length and scales to the large size', () => {
    const html = renderToStaticMarkup(<IntervalGlyph size="large" length={96} estimateAt={0.25} />);
    const svg = first(html, 'svg');
    expect(svg).toMatchObject({ width: '96', height: '16' });
    const dot = first(html, 'circle');
    expect(Number(dot.cx)).toBeCloseTo(24, 6);
    expect(Number(dot.r)).toBeCloseTo(6.4, 6);
  });

  it('hollow variant: bar and caps in muted (line is 1.2:1), dot outlined in muted with no fill', () => {
    const html = renderToStaticMarkup(<IntervalGlyph variant="hollow" />);
    const bar = elements(html, 'rect').find((r) => r.height === '2');
    expect(bar).toMatchObject({ fill: 'var(--color-muted)' });
    const dot = first(html, 'circle');
    expect(dot).toMatchObject({ fill: 'none', stroke: 'var(--color-muted)' });
  });

  it('with a label it is an image with an accessible name, not hidden', () => {
    const html = renderToStaticMarkup(<IntervalGlyph label="Interval, estimate 0.6" />);
    const svg = first(html, 'svg');
    expect(svg).toMatchObject({ role: 'img', 'aria-label': 'Interval, estimate 0.6' });
    expect(svg).not.toHaveProperty('aria-hidden');
  });
});
