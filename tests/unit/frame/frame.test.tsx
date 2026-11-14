// The frame primitives: chips, the quiet clause, the section and page heads, and the decorative
// vignette with the small marks its sketches are drawn from. Markup, aria-hidden, no digits in a
// vignette, and the quiet clause only inside an h1 or h2.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  Chip,
  IntervalMark,
  MiniRow,
  PageHead,
  Quiet,
  SectionHead,
  Tag,
  Tick,
  Vignette,
} from '@/components/frame';

const ROOT = join(import.meta.dirname, '../../..');
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('Chip', () => {
  it('is a plain text label with no dot by default', () => {
    const html = renderToStaticMarkup(<Chip>Experiments and analytics</Chip>);
    expect(html).toBe('<span data-chip="">Experiments and analytics</span>');
  });

  it('draws an ok or live dot as a decorative span before the word', () => {
    const ok = renderToStaticMarkup(<Chip dot="ok">Open to roles in Germany</Chip>);
    expect(ok).toBe('<span data-chip=""><span data-chip-dot="ok" aria-hidden="true"></span>Open to roles in Germany</span>');
    const live = renderToStaticMarkup(<Chip dot="live">Live test</Chip>);
    expect(live).toContain('<span data-chip-dot="live" aria-hidden="true"></span>');
    expect(renderToStaticMarkup(<Chip dot="none">X</Chip>)).not.toContain('data-chip-dot');
  });

  it('marks the inline and on-ink variants', () => {
    expect(renderToStaticMarkup(<Chip inline>Agents</Chip>)).toBe('<span data-chip="" data-inline="">Agents</span>');
    expect(renderToStaticMarkup(<Chip onInk>Live test</Chip>)).toBe('<span data-chip="" data-on-ink="">Live test</span>');
  });

  it('is never a link', () => {
    expect(renderToStaticMarkup(<Chip dot="ok">Word</Chip>)).not.toMatch(/<a |href=/);
  });
});

describe('Quiet', () => {
  it('renders the quiet clause as a marked span', () => {
    expect(renderToStaticMarkup(<Quiet>and automate the rest.</Quiet>)).toBe('<span data-quiet="">and automate the rest.</span>');
  });

  it('is used in source only inside an h1 or h2 (the frame heads pass it through their quiet prop)', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.tsx')) files.push(path);
      }
    };
    walk(join(ROOT, 'src'));
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(/<Quiet[\s>]/g)) {
        const before = source.slice(0, m.index);
        const opened = Math.max(before.lastIndexOf('<h1'), before.lastIndexOf('<h2'));
        const closed = Math.max(before.lastIndexOf('</h1>'), before.lastIndexOf('</h2>'));
        expect(opened, `${file}: <Quiet> outside an h1 or h2`).toBeGreaterThan(closed);
      }
    }
  });
});

describe('SectionHead', () => {
  const html = renderToStaticMarkup(
    <SectionHead id="experiments-title" chip="Experiments and analytics" title="Tests that end" quiet="in a clear recommendation." sub="How I plan a test." />,
  );

  it('stacks the chip, the h2 with its id and quiet clause, and the sub', () => {
    expect(html).toMatch(/^<div data-section-head="" data-align="center"/);
    expect(html).toContain('<span data-chip="">Experiments and analytics</span>');
    expect(html).toMatch(/<h2 id="experiments-title"[^>]*>Tests that end <span data-quiet="">in a clear recommendation\.<\/span><\/h2>/);
    expect(html).toMatch(/<p [^>]*>How I plan a test\.<\/p>/);
    expect(html.indexOf('data-chip')).toBeLessThan(html.indexOf('<h2'));
    expect(html.indexOf('<h2')).toBeLessThan(html.indexOf('<p '));
  });

  it('sets the h2 at the h2 sizes, so the heading weight and tracking apply', () => {
    const h2 = /<h2 [^>]*class="([^"]*)"/.exec(html)![1]!;
    expect(h2).toContain('text-h2-sm');
    expect(h2).toContain('md:text-h2');
  });

  it('can sit left, and drops the quiet clause and the sub when not given', () => {
    const left = renderToStaticMarkup(<SectionHead id="t" chip="C" title="Only a title." align="left" />);
    expect(left).toContain('data-align="left"');
    expect(left).not.toContain('data-quiet');
    expect(left).not.toContain('<p');
  });
});

describe('PageHead', () => {
  const html = renderToStaticMarkup(
    <PageHead id="about-title" chip="About" title="Experimentation and growth analyst" quiet="in Berlin, Germany." sub="A line." />,
  );

  it('stacks the chip, the h1 with its id and quiet clause, and the sub', () => {
    expect(html).toMatch(/^<div data-page-head=""/);
    expect(html).toMatch(/<h1 id="about-title"[^>]*>Experimentation and growth analyst <span data-quiet="">in Berlin, Germany\.<\/span><\/h1>/);
    expect(html).toMatch(/<p [^>]*>A line\.<\/p>/);
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it('works with the title alone', () => {
    const plain = renderToStaticMarkup(<PageHead id="p" chip="Privacy" title="Privacy notice" />);
    expect(plain).toMatch(/<h1 id="p"[^>]*>Privacy notice<\/h1>/);
    expect(plain).not.toContain('data-quiet');
  });
});

describe('Vignette and its marks', () => {
  const html = renderToStaticMarkup(
    <Vignette>
      <MiniRow label="A" tag={<Tag>base</Tag>}>
        <IntervalMark left={8} width={50} dot={30} />
      </MiniRow>
      <MiniRow label="B" tag={<Tag tone="tint">higher</Tag>}>
        <IntervalMark left={34} width={46} dot={58} />
      </MiniRow>
      <Tick />
    </Vignette>,
  );

  it('is hidden from assistive technology and says it is an illustration', () => {
    expect(html).toMatch(/^<div data-vignette="" aria-hidden="true">/);
    expect(html).toContain('<span data-vignette-label="">Illustration</span>');
    expect(html).toContain('<div data-vignette-sheet="">');
  });

  it('prints no digits as text: positions live in custom properties only', () => {
    expect(text(html)).toBe('Illustration A base B higher');
    expect(text(html)).not.toMatch(/\d/);
    expect(text(renderToStaticMarkup(<Vignette>{null}</Vignette>))).toBe('Illustration');
  });

  it('draws the interval mark from three percentages', () => {
    expect(renderToStaticMarkup(<IntervalMark left={8} width={50} dot={30} />)).toBe(
      '<span data-interval-mark="" style="--l:8%;--w:50%;--d:30%"><span data-interval-bar=""></span><span data-interval-dot=""></span></span>',
    );
  });

  it('clamps the percentages to the track', () => {
    expect(renderToStaticMarkup(<IntervalMark left={-5} width={140} dot={120} />)).toContain('--l:0%;--w:100%;--d:100%');
  });

  it('draws a row, a plain or tinted tag and a tick', () => {
    expect(renderToStaticMarkup(<MiniRow label="Guard">{null}</MiniRow>)).toBe(
      '<div data-mini-row=""><span data-mini-label="">Guard</span><span data-mini-track=""></span></div>',
    );
    expect(renderToStaticMarkup(<Tag>intact</Tag>)).toBe('<span data-tag="plain">intact</span>');
    expect(renderToStaticMarkup(<Tag tone="tint">higher</Tag>)).toBe('<span data-tag="tint">higher</span>');
    expect(renderToStaticMarkup(<Tick />)).toBe('<span data-tick=""></span>');
  });
});

describe('frame CSS and the root layout', () => {
  const css = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const layout = readFileSync(join(ROOT, 'src/app/layout.tsx'), 'utf8');

  it('puts the frame on main, with a hairline rail at each side', () => {
    expect(layout).toMatch(/<main [^>]*data-frame/);
    expect(css).toMatch(/\[data-frame\]\s*\{[^}]*border-inline:\s*1px solid var\(--color-hairline\)/);
  });

  it('rules a section off rail to rail with a top hairline', () => {
    expect(css).toMatch(/\[data-rule\]\s*\{[^}]*border-top:\s*1px solid var\(--color-hairline\)/);
    expect(css).toMatch(/\[data-rule\]\s*\{[^}]*margin-inline:\s*calc\(var\(--frame-pad/);
  });

  it('sets the heading weight and tracking on h1 to h3 at the display and h2 sizes', () => {
    expect(css).toMatch(/:is\(h1, h2, h3\):is\(\[class\*="text-display"\], \[class\*="text-h2"\]\)\s*\{[^}]*font-weight:\s*var\(--font-weight-heading\);[^}]*letter-spacing:\s*var\(--tracking-heading\)/);
  });

  it('makes the quiet clause quiet only inside an h1 or h2', () => {
    expect(css).toMatch(/:is\(h1, h2\) \[data-quiet\]\s*\{[^}]*color:\s*var\(--color-quiet\)/);
    // No rule colours a bare quiet span: a selector that starts with it would apply outside headings.
    expect(css).not.toMatch(/(^|[,{}])\s*\[data-quiet\]/m);
  });

  it('styles every frame part it renders', () => {
    for (const part of ['data-chip', 'data-chip-dot', 'data-section-head', 'data-page-head', 'data-vignette', 'data-vignette-label', 'data-vignette-sheet', 'data-mini-row', 'data-mini-label', 'data-mini-track', 'data-interval-mark', 'data-interval-bar', 'data-interval-dot', 'data-tag', 'data-tick']) {
      expect(css, part).toContain(`[${part}`);
    }
  });
});
