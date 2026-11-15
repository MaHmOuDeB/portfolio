// The call to action that ends Work, About and every case study: one set of words, the primary button
// to the contact form and the secondary to the CV page, and no portrait.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AboutPage } from '@/components/about/AboutPage';
import { AudiblePage } from '@/components/audible/AudiblePage';
import { DocproofPage } from '@/components/docproof/DocproofPage';
import { PageCallToAction } from '@/components/shell/PageCallToAction';
import { CONTACT } from '@/lib/site';
import { WorkPage } from '@/components/work/WorkPage';

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('PageCallToAction', () => {
  const html = renderToStaticMarkup(<PageCallToAction />);

  it('says the shared words, with the headline in two tones', () => {
    expect(html).toMatch(/<h2 id="page-cta-title"[^>]*>Find out what I can do <span data-quiet="">for your team\.<\/span><\/h2>/);
    expect(plain(html)).toContain('Open to roles in AI automation, experimentation and product analytics in Germany. Based in Berlin.');
  });

  it('offers "Write to me" (the contact form), "Read my CV" (the CV page) and a quiet LinkedIn link, and no portrait', () => {
    const links = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], plain(m[2]!)]);
    expect(links).toEqual([
      ['/contact', 'Write to me'],
      ['/cv', 'Read my CV'],
      [CONTACT.linkedin, 'LinkedIn'],
    ]);
    expect(html).toMatch(/<a [^>]*rel="noopener"[^>]*data-cta-quiet-link=""[^>]*>LinkedIn<\/a>/);
    expect(html).not.toContain('<img');
  });

  it.each([
    ['Work', () => renderToStaticMarkup(<WorkPage />)],
    ['About', () => renderToStaticMarkup(<AboutPage />)],
    ['a case study', () => renderToStaticMarkup(<AudiblePage />)],
    ['a build note', () => renderToStaticMarkup(<DocproofPage />)],
  ])('ends %s, once, after everything else', (_n, render) => {
    const page = render();
    expect([...page.matchAll(/data-page-cta=""/g)]).toHaveLength(1);
    expect(page.indexOf('data-page-cta')).toBeGreaterThan(page.lastIndexOf('</section>', page.indexOf('data-page-cta') - 1) - 1);
    expect(page.lastIndexOf('<h2')).toBe(page.indexOf('<h2 id="page-cta-title"'));
  });
});
