import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StackBand } from '@/components/depth/StackBand';
import { GlanceBlock } from '@/components/depth/GlanceBlock';
import { LeanCard } from '@/components/depth/LeanCard';
import { Ribbon } from '@/components/depth/Ribbon';
import { ProofFigure } from '@/components/depth/ProofFigure';
import { Tile } from '@/components/depth/Tile';
import { Vignette } from '@/components/frame';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const text = (html: string) => html.replace(/<[^>]*>/g, ' ');

describe('StackBand', () => {
  const html = renderToStaticMarkup(<StackBand />);
  it('hides the stack from assistive technology and keeps the caption outside it', () => {
    expect(html).toMatch(/^<div data-depth-band=""><div data-depth-pin=""><div data-depth-stack="" aria-hidden="true">/);
    expect(html.match(/data-depth-sheet="/g)).toHaveLength(3);
    expect(html.match(/data-depth-link="/g)).toHaveLength(2);
    expect(html.match(/data-depth-arrive=""/g)).toHaveLength(3);
    expect(html).toMatch(/<\/div><\/div><\/div><p data-depth-caption="">An illustration: a test, the agents that check the work, and the recommendation\.<\/p><\/div><\/div>$/);
  });
  it('has no digits, no SVG and no control', () => {
    expect(text(html)).not.toMatch(/\d/);
    expect(html).not.toMatch(/<svg|<a |<button/);
  });
  it('arrives in turn, the recommendation first', () => {
    expect([...html.matchAll(/data-depth-arrive="" style="--n:(\d)"/g)].map((m) => m[1])).toEqual(['2', '1', '0']);
  });
});

describe('ProofFigure', () => {
  const html = renderToStaticMarkup(
    <ProofFigure side="Experiments" figure={<data value="x" data-fact="x">F</data>}>
      Caption words.
    </ProofFigure>,
  );
  it('renders the side, the figure as passed and the caption, with no decorative mark', () => {
    expect(html).toContain('<div data-proof="">');
    expect(html).toContain('<span data-proof-side="">Experiments</span>');
    expect(html).toContain('<div data-proof-figure=""><data value="x" data-fact="x">F</data></div>');
    expect(html).not.toContain('data-proof-mark');
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
    expect(html).toMatch(/<h3 id="[^"]+" style="min-height:3lh">A title<\/h3>/);
    expect(html).toMatch(/<p id="[^"]+">Describes it\.<\/p>/);
    expect(html).toContain('<span data-depth-meta="">Meta line</span>');
    expect(html).toContain('<span data-depth-go="" aria-hidden="true">+</span>');
  });
  it('omits the minimum height without the prop and takes the md size', () => {
    const plain = renderToStaticMarkup(<LeanCard href="/a" title="T" meta="M" size="md">D</LeanCard>);
    expect(plain).toMatch(/<h3 id="[^"]+">T<\/h3>/);
    expect(plain).toContain('data-size="md"');
  });
});

describe('LeanCard with a vignette', () => {
  const html = renderToStaticMarkup(
    <LeanCard href="/work/x" title="A title" meta="Meta line" vignette={<Vignette>sketch</Vignette>}>
      Describes it.
    </LeanCard>,
  );
  it('renders the vignette at the bottom, after the meta line, hidden from assistive technology', () => {
    expect(html.indexOf('data-depth-meta')).toBeLessThan(html.indexOf('data-vignette'));
    expect(html).toContain('<div data-vignette="" aria-hidden="true">');
  });
  it('keeps the link named by the h3 and described by the paragraph', () => {
    const labelled = /<a [^>]*aria-labelledby="([^"]+)"/.exec(html)![1];
    const described = /<a [^>]*aria-describedby="([^"]+)"/.exec(html)![1];
    expect(html).toContain(`<h3 id="${labelled}">A title</h3>`);
    expect(html).toContain(`<p id="${described}">Describes it.</p>`);
  });
  it('renders no vignette without the prop', () => {
    expect(renderToStaticMarkup(<LeanCard href="/a" title="T" meta="M">D</LeanCard>)).not.toContain('data-vignette');
  });
});

describe('card and tile CSS (the framed look)', () => {
  const css = readFileSync(join(__dirname, '..', '..', '..', 'src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (selector: string) => {
    const at = css.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf('}', at));
  };
  it('draws a tile white, with a hairline and the card radius; the ink tile keeps ink', () => {
    expect(rule('[data-tile]')).toMatch(/border: 1px solid var\(--color-hairline\)/);
    expect(rule('[data-tile]')).toMatch(/border-radius: var\(--radius-xl\)/);
    expect(rule('[data-tile]')).toMatch(/background: var\(--color-surface\)/);
    expect(rule('[data-tile="ink"]')).toMatch(/background: var\(--color-ink\)/);
  });
  it('sets the card title at 1.125rem and 600, the body and meta muted', () => {
    expect(rule('[data-depth-lean] h3')).toMatch(/font-size: 1\.125rem;[\s\S]*font-weight: 600/);
    expect(rule('[data-depth-lean] p')).toMatch(/color: var\(--color-muted\)/);
    expect(rule('[data-depth-meta]')).toMatch(/color: var\(--color-muted\)/);
  });
  it('draws the "+" as a small bordered square at the top right', () => {
    const go = rule('[data-depth-go]');
    expect(go).toMatch(/top: /);
    expect(go).toMatch(/right: /);
    expect(go).toMatch(/border: 1px solid var\(--color-hairline-strong\)/);
    expect(go).toMatch(/border-radius: var\(--radius-md\)/);
    expect(go).not.toMatch(/bottom:/);
  });
});

describe('LeanCard accessible name', () => {
  const html = renderToStaticMarkup(
    <LeanCard href="/work/x" title="A title" meta="Meta line">
      Describes it.
    </LeanCard>,
  );
  it('is named by the h3 alone and described by the paragraph', () => {
    const labelled = /<a [^>]*aria-labelledby="([^"]+)"/.exec(html)?.[1];
    const described = /<a [^>]*aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(labelled).toBeTruthy();
    expect(described).toBeTruthy();
    expect(labelled).not.toBe(described);
    expect(html).toContain(`<h3 id="${labelled}"`);
    expect(html).toContain(`<p id="${described}"`);
    // the meta line is in neither
    expect(html).not.toMatch(/id="[^"]*"[^>]*>Meta line/);
  });
  it('gives two cards on one page different ids', () => {
    const two = renderToStaticMarkup(
      <>
        <LeanCard href="/a" title="A" meta="m">a</LeanCard>
        <LeanCard href="/b" title="B" meta="m">b</LeanCard>
      </>,
    );
    const ids = [...two.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(4);
  });
  it('takes a node as the meta line', () => {
    const node = renderToStaticMarkup(
      <LeanCard href="/a" title="T" meta={<>Browser automation, <data value="11">11</data> markets</>}>d</LeanCard>,
    );
    expect(node).toContain('<span data-depth-meta="">Browser automation, <data value="11">11</data> markets</span>');
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
    // It lifts once on load (the hinge), so it no longer rises with the scroll.
    expect(html).toMatch(/<section aria-label="At a glance" data-glance="" class="[^"]*rounded-xl border border-hairline bg-surface[^"]*" data-depth-hinge="load">/);
    expect(html).toContain('<p data-glance-outcome="">The outcome.</p>');
    // "When" is first: it is one short line, and the reader places the work in time before the rest.
    expect([...html.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1])).toEqual(['When', 'Role', 'Methods', 'Tools']);
    expect([...html.matchAll(/<dd>([^<]*)<\/dd>/g)].map((m) => m[1])).toEqual(['W', 'R', 'M', 'T']);
    expect(text(html)).not.toMatch(/\d/);
  });
  it('is unchanged without points and scope: the outcome first, four facts, no list of figures', () => {
    expect(html).toMatch(/data-depth-hinge="load"><p data-glance-outcome="">/);
    expect(html).not.toContain('data-glance-points');
    expect(html).toContain('<dl data-glance-facts="" data-count="4">');
  });
  it('draws two hidden hairlines, one above and one below the facts', () => {
    const rule = '<span data-glance-rule="" data-depth-draw="" aria-hidden="true"></span>';
    expect(html.split(rule)).toHaveLength(3);
    expect(html.indexOf(rule)).toBeLessThan(html.indexOf('<dl'));
    expect(html.lastIndexOf(rule)).toBeGreaterThan(html.indexOf('</dl>'));
  });
});

describe('GlanceBlock with pull figures and a scope', () => {
  const html = renderToStaticMarkup(
    <GlanceBlock
      points={[
        { id: 'a', figure: <data value="1">one</data>, label: 'first label' },
        { id: 'b', figure: <data value="2">two</data>, label: 'second label' },
        { id: 'c', figure: <data value="3">three</data>, label: 'third label' },
      ]}
      outcome="One sentence."
      role="R"
      methods="M"
      tools="T"
      when="W"
      scope="S"
    />,
  );
  it('puts up to three figures first, each large with one short label, as a labelled list', () => {
    expect(html).toMatch(/data-depth-hinge="load"><ul role="list" data-glance-points="" data-count="3" aria-label="Key figures">/);
    const cells = [...html.matchAll(/<li data-glance-point=""><p data-glance-figure="">([\s\S]*?)<\/p><p data-glance-label="">([^<]*)<\/p><\/li>/g)];
    expect(cells.map((m) => m[2])).toEqual(['first label', 'second label', 'third label']);
    expect(cells[0]![1]).toBe('<data value="1">one</data>');
    const four = renderToStaticMarkup(
      <GlanceBlock points={[1, 2, 3, 4].map((n) => ({ id: `p${n}`, figure: 'f', label: 'l' }))} outcome="o" role="r" methods="m" tools="t" when="w" />,
    );
    expect(four.match(/data-glance-figure/g)).toHaveLength(3);
  });
  it('sets the outcome as one sentence under the figures, then the facts with the scope last', () => {
    expect(html.indexOf('</ul>')).toBeLessThan(html.indexOf('<p data-glance-outcome="">One sentence.</p>'));
    expect(html.indexOf('data-glance-outcome')).toBeLessThan(html.indexOf('<dl'));
    expect(html).toContain('<dl data-glance-facts="" data-count="5">');
    expect([...html.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1])).toEqual(['When', 'Role', 'Methods', 'Tools', 'Scope']);
    expect([...html.matchAll(/<dd>([^<]*)<\/dd>/g)].map((m) => m[1])).toEqual(['W', 'R', 'M', 'T', 'S']);
  });
  it('is the same card with the same once-on-load hinge, and adds no heading', () => {
    expect(html).toMatch(/^<section aria-label="At a glance" data-glance="" class="[^"]*rounded-xl border border-hairline bg-surface[^"]*" data-depth-hinge="load">/);
    expect(html).not.toMatch(/<h[1-6]/);
    expect(html.split('<span data-glance-rule="" data-depth-draw="" aria-hidden="true"></span>')).toHaveLength(3);
  });
  it('draws no empty list of figures', () => {
    expect(renderToStaticMarkup(<GlanceBlock points={[]} outcome="o" role="r" methods="m" tools="t" when="w" />)).not.toContain('data-glance-points');
  });

  const css = readFileSync(join(__dirname, '..', '..', '..', 'src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  it('sets the sentence under the figures at text-lg and the figures large, and never fades the figures', () => {
    expect(css).toMatch(/\[data-glance-points\] \+ \[data-glance-outcome\]\s*\{[^}]*font-size:\s*var\(--text-lg\)/);
    expect(css).toMatch(/\[data-glance-figure\]\s*\{[^}]*font-size:\s*var\(--text-2xl\)/);
    for (const m of css.matchAll(/\[data-glance-(?:points|point|figure|label)\][^{]*\{([^}]*)\}/g)) expect(m[1]).not.toMatch(/opacity|animation|transition/);
  });
  it('settles a fifth fact in turn after the fourth, and stills it with the others', () => {
    expect(css).toMatch(/\[data-depth-hinge="load"\] \[data-glance-facts\] > div:nth-child\(5\)\s*\{[^}]*animation-delay:\s*600ms/);
    expect(css).toMatch(/\[data-depth-hinge\] \[data-glance-facts\] > div,/);
  });
});

describe('Ribbon', () => {
  const html = renderToStaticMarkup(<Ribbon items={['SQL', 'Python', 'n8n']} label="Tools" data-depth-scale="x" />);
  it('is a labelled list inside the track, each item once', () => {
    // role="list" keeps the list semantics in Safari, which drops them under list-style: none.
    expect(html).toBe('<div data-depth-ribbon="" data-depth-scale="x"><ul role="list" aria-label="Tools"><li>SQL</li><li>Python</li><li>n8n</li></ul></div>');
  });
});

describe('data-* pass-through', () => {
  it('reaches the root of Tile, GlanceBlock and LeanCard (and may replace the rise value)', () => {
    expect(renderToStaticMarkup(<Tile data-depth-book="left">x</Tile>)).toBe('<div data-tile="" data-depth-book="left">x</div>');
    expect(renderToStaticMarkup(<GlanceBlock outcome="o" role="r" methods="m" tools="t" when="w" data-depth-rise="" />)).toMatch(/<section aria-label="At a glance" data-glance="" class="[^"]*" data-depth-hinge="load" data-depth-rise="">/);
    expect(renderToStaticMarkup(<LeanCard href="/a" title="T" meta="M" data-depth-rise="heading">D</LeanCard>)).toContain('data-depth-rise="heading"');
  });
});
