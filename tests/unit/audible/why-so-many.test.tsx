// The Audible page gives its adoption figure the "Why so many?" link twice in running text: in the
// glance outcome and in the summary's result. The link never breaks across two lines, so it is the same
// line-height target at every width (a link split over two lines has a box of 44 px or more and would
// leave the touch-target check's inline list one short on a phone or tablet).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AudiblePage } from '@/components/audible/AudiblePage';

const html = renderToStaticMarkup(<AudiblePage />);

describe('the "Why so many?" links on /work/audible', () => {
  // the section links row has a standalone "Why so many?" link too (a 44 px target): not in a sentence
  const inline = [...html.matchAll(/(<[^<]*)<a ([^>]*)>Why so many\?<\/a>/g)].filter(([, , attrs]) => attrs!.includes('href="#why-so-many"') && !attrs!.includes('data-touch-target'));

  it('appear twice in running text', () => {
    expect(inline).toHaveLength(2);
  });

  it('each sits in a span that keeps it on one line', () => {
    for (const [, before] of inline) expect(before).toMatch(/^<span class="whitespace-nowrap">$/);
  });
});
