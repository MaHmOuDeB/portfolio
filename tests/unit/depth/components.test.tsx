import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EvidenceField } from '@/components/depth/EvidenceField';
import { GlanceBlock } from '@/components/depth/GlanceBlock';
import { LeanCard } from '@/components/depth/LeanCard';
import { Ribbon } from '@/components/depth/Ribbon';
import { ProofFigure } from '@/components/depth/ProofFigure';
import { Tile } from '@/components/depth/Tile';

const text = (html: string) => html.replace(/<[^>]*>/g, ' ');

describe('EvidenceField', () => {
  const html = renderToStaticMarkup(<EvidenceField />);
  it('is hidden from assistive technology and has the contract structure', () => {
    expect(html).toMatch(/^<div data-depth-field="" aria-hidden="true">/);
    expect(html.match(/data-depth-plane/g)).toHaveLength(1);
    expect(html.match(/data-depth-zero/g)).toHaveLength(1);
    expect(html.match(/data-depth-row/g)).toHaveLength(26);
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<text');
  });
  it('has the three axis words and nothing else as text', () => {
    expect(text(html).split(/\s{1,}/).filter(Boolean).join(' ')).toBe('B lower no difference B higher');
  });
  it('gives each row its index, top, width, shift and estimate position', () => {
    expect(html).toContain('style="--i:0;top:0.0px;width:527.0px;margin-left:13.5px;--e:50%"');
    expect(html).toContain('--i:25;top:500.0px;width:103.4px;margin-left:33.6px;--e:50%');
  });
});

describe('ProofFigure', () => {
  const html = renderToStaticMarkup(
    <ProofFigure side="Experiments" figure={<data value="x" data-fact="x">F</data>}>
      Caption words.
    </ProofFigure>,
  );
  it('renders the side, the figure as passed, a hidden mark and the caption', () => {
    expect(html).toContain('<div data-proof="">');
    expect(html).toContain('<span data-proof-side="">Experiments</span>');
    expect(html).toContain('<div data-proof-figure=""><data value="x" data-fact="x">F</data></div>');
    expect(html).toContain('<div data-proof-mark="" aria-hidden="true"><s></s><i></i><b></b></div>');
    expect(html).toContain('<p data-proof-caption="">Caption words.</p>');
  });
  it('types no numeral itself', () => {
    expect(text(html)).not.toMatch(/\d/);
  });
});

describe('LeanCard', () => {
  const html = renderToStaticMarkup(
    <LeanCard href="/work/x" title="A title" meta="Meta line" titleMinLines={3} prefetch={false} data-track="card" data-card-id="one">
      Describes it.
    </LeanCard>,
  );
  it('is a link with the lean, rise and tile attributes', () => {
    expect(html).toMatch(/^<a /);
    expect(html).toContain('href="/work/x"');
    for (const a of ['data-depth-lean=""', 'data-depth-rise=""', 'data-tile=""', 'data-size="lg"']) expect(html).toContain(a);
  });
  it('spreads extra data attributes', () => {
    expect(html).toContain('data-track="card"');
    expect(html).toContain('data-card-id="one"');
  });
  it('has an h3 with a fixed minimum height, the description, the meta and a hidden disc', () => {
    expect(html).toContain('<h3 style="min-height:3lh">A title</h3>');
    expect(html).toContain('<p>Describes it.</p>');
    expect(html).toContain('<span data-depth-meta="">Meta line</span>');
    expect(html).toContain('<span data-depth-go="" aria-hidden="true">+</span>');
  });
  it('omits the minimum height without the prop and takes the md size', () => {
    const plain = renderToStaticMarkup(<LeanCard href="/a" title="T" meta="M" size="md">D</LeanCard>);
    expect(plain).toContain('<h3>T</h3>');
    expect(plain).toContain('data-size="md"');
  });
});

describe('Tile', () => {
  it('marks the surface and ink tones', () => {
    expect(renderToStaticMarkup(<Tile>x</Tile>)).toBe('<div data-tile="">x</div>');
    expect(renderToStaticMarkup(<Tile tone="ink">x</Tile>)).toBe('<div data-tile="ink">x</div>');
  });
});

describe('GlanceBlock', () => {
  const html = renderToStaticMarkup(<GlanceBlock outcome="The outcome." role="R" methods="M" tools="T" when="W" />);
  it('is a labelled section with the outcome and four terms', () => {
    expect(html).toContain('<section aria-label="At a glance" data-glance="">');
    expect(html).toContain('<p data-glance-outcome="">The outcome.</p>');
    expect([...html.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1])).toEqual(['Role', 'Methods', 'Tools', 'When']);
    expect([...html.matchAll(/<dd>([^<]*)<\/dd>/g)].map((m) => m[1])).toEqual(['R', 'M', 'T', 'W']);
    expect(text(html)).not.toMatch(/\d/);
  });
  it('draws two hidden hairlines, one above and one below the facts', () => {
    const rule = '<span data-glance-rule="" data-depth-draw="" aria-hidden="true"></span>';
    expect(html.split(rule)).toHaveLength(3);
    expect(html.indexOf(rule)).toBeLessThan(html.indexOf('<dl'));
    expect(html.lastIndexOf(rule)).toBeGreaterThan(html.indexOf('</dl>'));
  });
});

describe('Ribbon', () => {
  const html = renderToStaticMarkup(<Ribbon items={['SQL', 'Python', 'n8n']} label="Tools" data-depth-scale="x" />);
  it('is a labelled list inside the track, each item once', () => {
    expect(html).toBe('<div data-depth-ribbon="" data-depth-scale="x"><ul aria-label="Tools"><li>SQL</li><li>Python</li><li>n8n</li></ul></div>');
  });
});

describe('data-* pass-through', () => {
  it('reaches the root of Tile, GlanceBlock and LeanCard (and may replace the rise value)', () => {
    expect(renderToStaticMarkup(<Tile data-depth-book="left">x</Tile>)).toBe('<div data-tile="" data-depth-book="left">x</div>');
    expect(renderToStaticMarkup(<GlanceBlock outcome="o" role="r" methods="m" tools="t" when="w" data-depth-rise="" />)).toContain('<section aria-label="At a glance" data-glance="" data-depth-rise="">');
    expect(renderToStaticMarkup(<LeanCard href="/a" title="T" meta="M" data-depth-rise="heading">D</LeanCard>)).toContain('data-depth-rise="heading"');
  });
});
