// The shared build-note frame: the intro is the note's own block (the frame adds no paragraph, so a
// note's intro paragraph never nests in another), the role line is optional, and a section a note
// leaves out is neither drawn nor linked. Every note renders through the frame with one diagram step
// style.
import { renderToStaticMarkup } from 'react-dom/server';
import { withoutCta } from '../page-cta';
import { describe, expect, it } from 'vitest';
import { BUILD_NOTE_SECTIONS, BuildNote, DiagramConnector, DiagramStep } from '@/components/build-notes/BuildNote';
import { DocproofPage } from '@/components/docproof/DocproofPage';
import { MarketingwsPage } from '@/components/marketingws/MarketingwsPage';
import { N8nPage } from '@/components/n8n/N8nPage';
import { WeatherPage } from '@/components/weather/WeatherPage';
import { outline, sectionLinks } from './helpers';

const PAGES = {
  weather: withoutCta(renderToStaticMarkup(<WeatherPage />)),
  n8n: withoutCta(renderToStaticMarkup(<N8nPage />)),
  marketingws: withoutCta(renderToStaticMarkup(<MarketingwsPage />)),
  docproof: withoutCta(renderToStaticMarkup(<DocproofPage />)),
};

/** True when a <p> opens before the previous <p> has closed. */
const nestsParagraphs = (markup: string) => {
  let depth = 0;
  for (const m of markup.matchAll(/<(\/?)p[\s>]/g)) {
    depth += m[1] ? -1 : 1;
    if (depth > 1) return true;
  }
  return false;
};

describe('the frame', () => {
  it('draws the intro as given, without a paragraph of its own', () => {
    const html = renderToStaticMarkup(
      <BuildNote slug="t" title="T" intro={<p>One line.</p>} sections={{ problem: <p>Body.</p> }} />,
    );
    expect(html).toContain('<div class="mt-4 max-w-text text-lg text-muted"><p>One line.</p></div>');
    expect(nestsParagraphs(html)).toBe(false);
  });

  it('draws the role line only when a note has one', () => {
    const without = renderToStaticMarkup(<BuildNote slug="t" title="T" intro={<p>I.</p>} sections={{ problem: 'P' }} />);
    expect(without).not.toContain('data-note-role');
    const withRole = renderToStaticMarkup(
      <BuildNote slug="t" title="T" intro={<p>I.</p>} role="My role." sections={{ problem: 'P' }} />,
    );
    expect(withRole).toMatch(/<p data-note-role=""[^>]*>My role\.<\/p>/);
  });

  it('draws and links only the sections a note has, in the shared order and under the shared names', () => {
    const html = renderToStaticMarkup(
      <BuildNote slug="t" title="T" intro={<p>I.</p>} sections={{ sources: 'S', problem: 'P', limits: 'L' }} />,
    );
    expect(outline(html).map(([id, , , title]) => [id, title])).toEqual([
      ['problem', 'The problem'],
      ['limits', 'Limits'],
      ['sources', 'Sources and links'],
    ]);
    expect(sectionLinks(html)).toEqual([
      ['#problem', 'Problem'],
      ['#limits', 'Limits'],
      ['#sources', 'Sources'],
    ]);
  });

  it('draws no heading, link or role line for a body that renders nothing', () => {
    for (const empty of [null, false, true, '']) {
      const html = renderToStaticMarkup(
        <BuildNote slug="t" title="T" intro={<p>I.</p>} role={empty} sections={{ problem: 'P', limits: empty }} />,
      );
      expect(outline(html).map(([id]) => id), String(empty)).toEqual(['problem']);
      expect(sectionLinks(html), String(empty)).toEqual([['#problem', 'Problem']]);
      expect(html, String(empty)).not.toContain('id="limits"');
      expect(html, String(empty)).not.toContain('data-note-role');
    }
  });

  it('draws one diagram step style and a hidden connector', () => {
    const step = renderToStaticMarkup(<DiagramStep name="Name" detail="Detail." />);
    expect(step).toBe(
      '<div class="min-w-0 rounded-md border border-hairline-strong bg-surface p-4"><p class="text-sm font-semibold">Name</p><p class="mt-1 text-sm text-muted">Detail.</p></div>',
    );
    expect(renderToStaticMarkup(<DiagramConnector />)).toBe(
      '<span aria-hidden="true" data-connector="" class="ml-6 block h-4 w-px bg-muted"></span>',
    );
  });
});

/** The section each note leads with, its best exhibit; the others keep the shared order. */
const LEAD: Record<keyof typeof PAGES, string | null> = { weather: null, n8n: null, marketingws: null, docproof: 'how-i-checked-this' };
const orderOf = (name: keyof typeof PAGES) => {
  const ids = BUILD_NOTE_SECTIONS.map((s) => s.id as string);
  const lead = LEAD[name];
  return lead ? [lead, ...ids.filter((id) => id !== lead)] : ids;
};

describe('the frame, in the reading model', () => {
  it('leads with the section a note names and keeps the shared order for the rest', () => {
    const html = renderToStaticMarkup(
      <BuildNote slug="t" title="T" intro={<p>I.</p>} lead="limits" sections={{ problem: 'P', limits: 'L', sources: 'S' }} />,
    );
    expect(outline(html).map(([id]) => id)).toEqual(['limits', 'problem', 'sources']);
    expect(sectionLinks(html).map(([href]) => href)).toEqual(['#limits', '#problem', '#sources']);
  });

  it('draws the quiet clause, the actions, the close and previous and next', () => {
    const html = renderToStaticMarkup(
      <BuildNote
        slug="weather"
        title="A name,"
        quiet="and a clause."
        intro={<p>I.</p>}
        actions={[{ href: 'https://example.com', label: 'See the code', external: true }]}
        sections={{ limits: 'L' }}
        close={{ body: <p>How I work.</p>, links: [{ href: '/lab', label: 'The Lab' }] }}
      />,
    );
    expect(html).toContain('and a clause.');
    expect(html).toContain('data-case-actions');
    expect(html).toMatch(/<h2 id="weather-shows"[^>]*>What this shows about how I work<\/h2>/);
    expect(html).toMatch(/href="\/work\/marketingws"[\s\S]*href="\/experiment"/);
    expect(html.indexOf('data-page-close')).toBeLessThan(html.indexOf('data-next-row'));
    // section headings at the inner section size
    expect(html).toMatch(/<h2 id="limits-title" class="max-w-text text-h2-xs md:text-h2-sm"/);
  });

  it('chains the four notes: Pulse, Docproof, n8n, MarketingWS, Weather, then the live test', () => {
    const hrefs = (slug: string) =>
      [...renderToStaticMarkup(<BuildNote slug={slug} title="T" intro={<p>I.</p>} sections={{ limits: 'L' }} />).matchAll(/<a data-next="(prev|next)"[^>]*href="([^"]+)"/g)].map((m) => m[2]);
    expect(hrefs('docproof')).toEqual(['/work/pulse', '/work/n8n']);
    expect(hrefs('n8n')).toEqual(['/work/docproof', '/work/marketingws']);
    expect(hrefs('marketingws')).toEqual(['/work/n8n', '/work/weather']);
    expect(hrefs('weather')).toEqual(['/work/marketingws', '/experiment']);
  });
});

describe.each(Object.keys(PAGES) as (keyof typeof PAGES)[])('the %s note', (name) => {
  const html = PAGES[name];
  it('renders through the frame: all six shared sections, its lead first, linked in order', () => {
    expect(outline(html).map(([id]) => id)).toEqual(orderOf(name));
    expect(sectionLinks(html).map(([href]) => href)).toEqual(orderOf(name).map((id) => `#${id}`));
  });

  it('never nests a paragraph in a paragraph', () => {
    expect(nestsParagraphs(html)).toBe(false);
  });

  it('draws every diagram step in the one step style', () => {
    const figure = html.slice(html.indexOf('<figure'), html.indexOf('</figure>'));
    const boxes = [...figure.matchAll(/<div class="([^"]*rounded-md[^"]*)"/g)].map((m) => m[1]!);
    expect(boxes.length).toBeGreaterThan(3);
    // One style; a branch node may add only its narrow-layout indent.
    for (const box of boxes) expect(box).toMatch(/^min-w-0 rounded-md border border-hairline-strong bg-surface p-4( h-full| max-xs:ml-6)?$/);
    expect(figure).not.toContain('border-line');
  });
});
