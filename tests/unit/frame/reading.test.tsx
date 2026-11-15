// The parts of the reading model: key points, the sentences around an exhibit, the method row, the
// figure sheet, the in-page links, the page's close and the previous and next row. Rendered markup,
// accessible names, no heading-level jumps, no script, and the CSS each part needs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  FigureSheet,
  KeyPoints,
  LeadIn,
  MethodDetails,
  NextRow,
  PageClose,
  SECTION_H2,
  SectionNav,
  Takeaway,
} from '@/components/frame';

const ROOT = join(import.meta.dirname, '../../..');
const css = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const headings = (html: string) => [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));

/** The body of the first block that starts with `head` (balanced braces). */
function block(head: string): string {
  const start = css.indexOf(head);
  expect(start, head).toBeGreaterThan(-1);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unclosed block ${head}`);
}

describe('KeyPoints', () => {
  const items = [
    { id: 'a', kicker: 'First', title: <data value="1">one</data>, body: 'A statement.' },
    { id: 'b', title: 'A title', body: 'Another statement.' },
    { id: 'c', body: 'A statement with no title.' },
  ];
  const html = renderToStaticMarkup(<KeyPoints items={items} />);

  it('is a labelled list with one card per item, counted for the grid', () => {
    expect(html).toMatch(/^<ul role="list" data-key-points="" data-count="3" aria-label="Key points">/);
    expect(html.match(/<li data-key-point="">/g)).toHaveLength(3);
    expect(renderToStaticMarkup(<KeyPoints items={items} label="What the study found" />)).toContain('aria-label="What the study found"');
    expect(renderToStaticMarkup(<KeyPoints items={[...items, { id: 'd', body: 'Four.' }]} />)).toContain('data-count="4"');
  });

  it('stacks the kicker, the title and the body, and takes a node as the title so a figure can be a Fact', () => {
    const [first, second, third] = html.split('<li data-key-point="">').slice(1) as [string, string, string];
    expect(first).toBe('<p data-key-kicker="">First</p><p data-key-title=""><data value="1">one</data></p><p data-key-body="">A statement.</p></li>');
    expect(second).toBe('<p data-key-title="">A title</p><p data-key-body="">Another statement.</p></li>');
    // With no title the body is the statement, so it is set larger (data-lead).
    expect(third).toBe('<p data-key-body="" data-lead="">A statement with no title.</p></li></ul>');
  });

  it('has no heading, no link and no script: statements, not sections', () => {
    expect(headings(html)).toEqual([]);
    expect(html).not.toMatch(/<a |<script|onclick/i);
  });

  it('is one column on a phone, two from sm, and as many columns as items from lg', () => {
    expect(css).toMatch(/\[data-key-points\]\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(block('@media (width >= 40rem) and (width < 64rem)')).toMatch(/\[data-key-points\]\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
    const lg = css.slice(css.indexOf('[data-key-points][data-count="4"]') - 400, css.indexOf('[data-key-points][data-count="4"]') + 200);
    expect(lg).toMatch(/\[data-key-points\]\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
    expect(lg).toMatch(/\[data-key-points\]\[data-count="4"\]\s*\{[^}]*repeat\(4, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\[data-key-point\]\s*\{[^}]*border:\s*1px solid var\(--color-hairline\);[^}]*border-radius:\s*var\(--radius-xl\);[^}]*background:\s*var\(--color-surface\)/);
  });
});

describe('LeadIn and Takeaway', () => {
  const lead = renderToStaticMarkup(<LeadIn>Compare the two bars.</LeadIn>);
  const take = renderToStaticMarkup(<Takeaway>The larger group is not the better one.</Takeaway>);

  it('are a small label and one paragraph, with the default labels', () => {
    expect(lead).toBe('<div data-lead-in=""><p data-exhibit-label="">What to look at</p><p data-exhibit-text="">Compare the two bars.</p></div>');
    expect(take).toBe('<div data-takeaway=""><p data-exhibit-label="">What it means</p><p data-exhibit-text="">The larger group is not the better one.</p></div>');
  });

  it('take another label and a node as the sentence', () => {
    expect(renderToStaticMarkup(<LeadIn label="Look at">x</LeadIn>)).toContain('<p data-exhibit-label="">Look at</p>');
    expect(renderToStaticMarkup(<Takeaway label="For a team">A <data value="2">two</data>.</Takeaway>)).toBe(
      '<div data-takeaway=""><p data-exhibit-label="">For a team</p><p data-exhibit-text="">A <data value="2">two</data>.</p></div>',
    );
  });

  it('add no heading and no script', () => {
    expect(headings(lead + take)).toEqual([]);
    expect(lead + take).not.toMatch(/<script|onclick/i);
  });

  it('sit in the readable column, and the takeaway is the point by weight and a mark, not by colour alone', () => {
    expect(css).toMatch(/\[data-lead-in\],\s*\[data-takeaway\]\s*\{[^}]*max-width:\s*var\(--container-text\)/);
    expect(css).toMatch(/\[data-takeaway\] \[data-exhibit-text\]\s*\{[^}]*font-weight:\s*var\(--font-weight-medium\)/);
    expect(css).toMatch(/\[data-takeaway\] \[data-exhibit-label\]::before\s*\{[^}]*content:\s*""/);
    // Not the Callout's look (a rule at the left): that one is for limits.
    expect(css).not.toMatch(/\[data-takeaway\][^{]*\{[^}]*border-(left|inline-start)/);
  });
});

describe('MethodDetails', () => {
  const html = renderToStaticMarkup(
    <MethodDetails>
      <p>The derivation.</p>
    </MethodDetails>,
  );

  it('is a native details row, closed, that needs no script', () => {
    expect(html).toMatch(/^<details data-method="">/);
    expect(html).not.toMatch(/ open/);
    expect(html).not.toMatch(/<script|onclick/i);
    expect(html).toContain('<div data-method-body=""><p>The derivation.</p></div></details>');
    expect(headings(html)).toEqual([]);
  });

  it('has a 44 px summary with the default words and a decorative chevron', () => {
    const summary = /<summary ([^>]*)>([\s\S]*?)<\/summary>/.exec(html)!;
    expect(summary[1]).toContain('min-h-(--size-target)');
    expect(summary[1]).toContain('data-touch-target');
    expect(text(summary[2]!)).toBe('The method, for the curious');
    expect(summary[2]).toMatch(/<span data-method-chevron="" aria-hidden="true"><svg/);
  });

  it('takes its own summary, and can start open', () => {
    const own = renderToStaticMarkup(<MethodDetails summary="How the interval is computed" open>x</MethodDetails>);
    expect(text(/<summary[^>]*>([\s\S]*?)<\/summary>/.exec(own)![1]!)).toBe('How the interval is computed');
    expect(own).toMatch(/^<details data-method="" open="">/);
  });

  it('turns the chevron when open, with no transition, and never clips the summary\'s focus ring', () => {
    expect(css).toMatch(/\[data-method\]\[open\] \[data-method-chevron\]\s*\{[^}]*rotate:\s*180deg/);
    for (const m of css.matchAll(/\[data-method[^{]*\{([^}]*)\}/g)) {
      expect(m[1]).not.toMatch(/transition|animation|overflow:\s*(hidden|clip)/);
    }
  });

  it('shows its content in print, open or not', () => {
    expect(css).toMatch(/@media print\s*\{[\s\S]*?\[data-method\]::details-content\s*\{[^}]*content-visibility:\s*visible/);
  });
});

describe('FigureSheet', () => {
  it('is the white card around a figure, marked for the CSS', () => {
    expect(renderToStaticMarkup(<FigureSheet><figure>f</figure></FigureSheet>)).toBe('<div data-figure-sheet=""><figure>f</figure></div>');
  });

  it('prints an optional label before the figure', () => {
    expect(renderToStaticMarkup(<FigureSheet label="Screenshot"><figure>a page</figure></FigureSheet>)).toBe(
      '<div data-figure-sheet=""><p data-figure-sheet-label="">Screenshot</p><figure>a page</figure></div>',
    );
  });

  it('runs edge to edge under 640 px and is a hairline card with the card radius from 640 px', () => {
    const base = /\n\s*\[data-figure-sheet\]\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(base).toMatch(/margin-inline:\s*calc\(\(var\(--frame-pad, 0px\) \+ 1px\) \* -1\)/);
    expect(base).toMatch(/border-block:\s*1px solid var\(--color-hairline\)/);
    expect(base).toMatch(/background:\s*var\(--color-surface\)/);
    expect(base).not.toMatch(/border-radius|overflow/);
    const sm = block('@media (width >= 40rem) {\n    [data-figure-sheet]');
    expect(sm).toMatch(/\[data-figure-sheet\]\s*\{[^}]*margin-inline:\s*0;[^}]*border:\s*1px solid var\(--color-hairline\);[^}]*border-radius:\s*var\(--radius-xl\)/);
  });
});

describe('SectionNav', () => {
  const html = renderToStaticMarkup(
    <SectionNav
      items={[
        { href: '#sample-size', label: 'Sample size' },
        { href: '#limits', label: 'Limits' },
      ]}
    />,
  );

  it('is a navigation landmark named "On this page" holding a list of links', () => {
    expect(html).toMatch(/^<nav aria-label="On this page" data-section-nav=""><ul role="list">/);
    const links = [...html.matchAll(/<li><a ([^>]*)><span>([^<]*)<\/span><\/a><\/li>/g)];
    expect(links.map((m) => m[2])).toEqual(['Sample size', 'Limits']);
    expect(links.map((m) => /href="([^"]*)"/.exec(m[1]!)![1])).toEqual(['#sample-size', '#limits']);
    for (const m of links) expect(m[1]).toContain('data-touch-target');
    expect(headings(html)).toEqual([]);
  });

  it('takes another name', () => {
    expect(renderToStaticMarkup(<SectionNav label="Sections" items={[{ href: '#a', label: 'A' }]} />)).toContain('<nav aria-label="Sections"');
  });

  it('wraps, never scrolls sideways, has 44 px targets and no underline', () => {
    expect(css).toMatch(/\[data-section-nav\] ul\s*\{[^}]*flex-wrap:\s*wrap/);
    for (const m of css.matchAll(/\[data-section-nav\][^{]*\{([^}]*)\}/g)) expect(m[1]).not.toMatch(/overflow(-x|-y|-inline|-block)?:/);
    expect(css).toMatch(/\[data-section-nav\] a\s*\{[^}]*min-height:\s*var\(--size-target\);[^}]*min-width:\s*var\(--size-target\);[^}]*text-decoration:\s*none/);
  });
});

describe('PageClose', () => {
  const html = renderToStaticMarkup(
    <PageClose links={[{ href: '/lab', label: 'Try the Lab' }, { href: 'https://example.com/', label: 'Another site', external: true }]}>
      <p>One short paragraph.</p>
    </PageClose>,
  );

  it('is a ruled section labelled by its h2, with the default title', () => {
    expect(html).toMatch(/^<section data-page-close="" data-rule="" aria-labelledby="what-this-shows"/);
    expect(html).toMatch(/<h2 id="what-this-shows" class="[^"]*">What this shows about how I work<\/h2>/);
    expect(headings(html)).toEqual([2]);
    expect(html).toContain('<div data-page-close-body=""><p>One short paragraph.</p></div>');
  });

  it('sets the h2 with the section headline classes', () => {
    expect(/<h2 [^>]*class="([^"]*)"/.exec(html)![1]).toBe(SECTION_H2);
  });

  it('draws its onward links as the secondary buttons of the system, in order', () => {
    const anchors = [...html.matchAll(/<a ([^>]*)>([^<]*)<\/a>/g)].map((m) => ({ attrs: m[1]!, label: m[2]! }));
    expect(anchors.map((a) => a.label)).toEqual(['Try the Lab', 'Another site']);
    expect(anchors[0]!.attrs).toContain('href="/lab"');
    expect(anchors[1]!.attrs).toContain('rel="noopener"');
    for (const a of anchors) {
      expect(a.attrs).toContain('border-hairline-strong bg-surface');
      expect(a.attrs).toContain('min-h-(--size-target)');
    }
  });

  it('takes its own title and id', () => {
    const own = renderToStaticMarkup(<PageClose id="close" title="What I would do next" links={[{ href: '/work', label: 'All work' }]}>x</PageClose>);
    expect(own).toMatch(/aria-labelledby="close"/);
    expect(own).toMatch(/<h2 id="close"[^>]*>What I would do next<\/h2>/);
  });
});

describe('NextRow', () => {
  const html = renderToStaticMarkup(
    <NextRow prev={{ href: '/work/audible', label: 'Audible' }} next={{ href: '/work/pulse', label: 'Pulse', kicker: 'Next build note' }} />,
  );

  it('is a navigation landmark named "More work" with the previous and the next link', () => {
    expect(html).toMatch(/^<nav aria-label="More work" data-next-row="">/);
    const links = [...html.matchAll(/<a ([^>]*)><span data-next-kicker="">([^<]*)<\/span><span data-next-label="">([^<]*)<\/span><\/a>/g)];
    expect(links.map((m) => [m[2], m[3]])).toEqual([['Previous', 'Audible'], ['Next build note', 'Pulse']]);
    expect(links[0]![1]).toContain('data-next="prev"');
    expect(links[0]![1]).toContain('href="/work/audible"');
    expect(links[1]![1]).toContain('data-next="next"');
    expect(headings(html)).toEqual([]);
  });

  it('keeps the next link in the second column when it stands alone, and is nothing with neither', () => {
    const only = renderToStaticMarkup(<NextRow next={{ href: '/work/retention', label: 'Retention' }} />);
    expect(only.match(/<a /g)).toHaveLength(1);
    expect(only).toContain('<span data-next-kicker="">Next</span>');
    expect(css).toMatch(/\[data-next="next"\]\s*\{[^}]*grid-column:\s*2/);
    expect(renderToStaticMarkup(<NextRow />)).toBe('');
  });

  it('is stacked on a phone and two columns from sm, with a hover that changes the border only', () => {
    expect(css).toMatch(/\[data-next-row\]\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    const hover = /\[data-next\]:hover[^{]*\{([^}]*)\}/.exec(css)![1]!;
    expect(hover).toMatch(/border-color/);
    expect(hover).not.toMatch(/transform|translate|scale|rotate/);
  });
});

describe('SECTION_H2', () => {
  it('is 28 px, then 32 px from md: clearly above a 24 px figure title, below the page headline', () => {
    expect(SECTION_H2).toBe('text-h2-xs md:text-h2-sm');
    const tokens = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
    expect(tokens).toMatch(/--text-h2-xs:\s*1\.75rem;/);
    expect(tokens).toMatch(/--text-h2-sm:\s*2rem;/);
    expect(tokens).toMatch(/--text-xl:\s*1\.5rem;/);
  });

  it('carries the heading weight and tracking of the system (the rule keys on the class name)', () => {
    expect(SECTION_H2).toMatch(/text-h2/);
    expect(css).toMatch(/:is\(h1, h2, h3\):is\(\[class\*="text-display"\], \[class\*="text-h2"\]\)/);
  });
});

describe('the reading parts in print and at rest', () => {
  it('have no motion of their own: no animation and no transition but a colour', () => {
    const own = [...css.matchAll(/\[data-(?:key-|lead-in|takeaway|exhibit|method|figure-sheet|section-nav|page-close|next)[^{]*\{([^}]*)\}/g)].map((m) => m[1]!);
    expect(own.length).toBeGreaterThan(20);
    for (const body of own) {
      expect(body).not.toMatch(/animation/);
      for (const t of body.matchAll(/transition:\s*([^;]*);/g)) expect(t[1]).toMatch(/^(border-color|color|background-color)\b/);
    }
  });

  it('drop the in-page links and the previous and next row from a printed page', () => {
    expect(css).toMatch(/@media print\s*\{[\s\S]*?\[data-section-nav\],\s*\[data-next-row\]\s*\{[^}]*display:\s*none/);
  });
});
