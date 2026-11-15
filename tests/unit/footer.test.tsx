// The site footer: an ink band with the wordmark, the hero line in two tones, three link columns and
// the one colophon line, pinned word for word.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Footer } from '@/components/shell/Footer';

const MARKUP = renderToStaticMarkup(<Footer />);
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** The links under the column titled `heading`, as [label, href] pairs; the list is labelled by its title. */
function column(heading: string): [string, string][] {
  const m = new RegExp(`<p id="([^"]+)"[^>]*>${heading}</p>\\s*<ul aria-labelledby="([^"]+)"[^>]*>([\\s\\S]*?)</ul>`).exec(MARKUP);
  expect(m, heading).not.toBeNull();
  expect(m![2]).toBe(m![1]);
  const block = m![3]!;
  return [...block.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [text(m[2]!), m[1]!]);
}

describe('Footer', () => {
  it('has no colophon line: the footer says nothing about how the site was built', () => {
    expect(MARKUP).not.toMatch(/pair.?programmer/i);
    expect(MARKUP).not.toMatch(/Built with/);
  });

  it('is an ink band, marked as ink so focus rings turn light', () => {
    expect(MARKUP).toMatch(/^<footer [^>]*data-ink=""[^>]*class="[^"]*bg-ink[^"]*text-on-ink/);
  });

  it('repeats the hero line in two tones', () => {
    expect(MARKUP).toMatch(
      /<p [^>]*>Experimentation and AI automation <span class="text-on-ink-muted">for product and growth teams<\/span><\/p>/,
    );
  });

  it('has the wordmark as a link home', () => {
    expect(MARKUP).toMatch(/<a [^>]*href="\/"[^>]*>[\s\S]*Mahmoud El Bergui<\/span><\/a>/);
  });

  it('lists three columns: Site, Contact and Legal', () => {
    expect(column('Site')).toEqual([
      ['Work', '/work'],
      ['About', '/about'],
      ['Lab', '/lab'],
      ['Live test', '/experiment'],
      ['CV', '/cv'],
    ]);
    expect(column('Contact').map(([label]) => label)).toEqual(['Contact', 'LinkedIn', 'GitHub']);
    expect(column('Contact')[0]![1]).toBe('/contact');
    expect(column('Legal')).toEqual([['Privacy', '/privacy']]);
  });

  it('puts the columns in one nav named "Footer", with plain text titles, never headings', () => {
    expect(MARKUP).not.toMatch(/<h[1-6]/);
    const nav = /<nav aria-label="Footer"[^>]*>([\s\S]*?)<\/nav>/.exec(MARKUP);
    expect(nav).not.toBeNull();
    for (const title of ['Site', 'Contact', 'Legal']) expect(nav![1]).toMatch(new RegExp(`<p id="[^"]+"[^>]*>${title}</p>`));
  });

  it('makes every link a 44 px target, and has no e-mail address', () => {
    const links = [...MARKUP.matchAll(/<a ([^>]*)>/g)].map((m) => m[1]!);
    expect(links.length).toBe(10);
    for (const attrs of links) expect(attrs).toContain('min-h-(--size-target)');
    expect(MARKUP).not.toMatch(/mailto:|>Email</);
  });

  it('gives every column link a scroll margin wider than its 4 px focus ring', () => {
    // Focus moves up from the last Site link to the first Contact link; WebKit aligns the link's box
    // with the top of the screen, so without a margin the top of its ring is cut off.
    const links = [...MARKUP.matchAll(/<li><a ([^>]*)>/g)].map((m) => m[1]!);
    expect(links.length).toBe(9);
    for (const attrs of links) expect(attrs).toMatch(/class="[^"]*\bscroll-my-2\b/);
  });
});
