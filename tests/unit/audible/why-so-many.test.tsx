// The Audible page gives its adoption figure the "Why so many?" link once near the top: in the glance
// card, on a line of its own under the figure's label. A link that stands alone is not in running
// text, so it is a full 44 px touch target, and the page needs no exemption for a small inline link.
// The in-page links have their own "Why so many?" chip, also a 44 px target.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AudiblePage } from '@/components/audible/AudiblePage';

const html = renderToStaticMarkup(<AudiblePage />);

describe('the "Why so many?" links on /work/audible', () => {
  const links = [...html.matchAll(/<a ([^>]*)>(?:<span>)?Why so many\?(?:<\/span>)?<\/a>/g)].map((m) => m[1]!);

  it('are two: the glance card and the in-page links, both to the section that gives the context', () => {
    expect(links).toHaveLength(2);
    for (const attrs of links) expect(attrs).toContain('href="#why-so-many"');
    expect(html).toContain('<section id="why-so-many"');
  });

  it('are each a full touch target: none is a small link inside a sentence', () => {
    for (const attrs of links) expect(attrs).toContain('data-touch-target=""');
  });

  it('puts the glance card link on its own small line under the label', () => {
    expect(html).toMatch(/recommendations adopted <span class="block text-sm"><a [^>]*href="#why-so-many"/);
  });
});
