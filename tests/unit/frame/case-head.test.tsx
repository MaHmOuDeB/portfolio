// The case head: the chip, the page's h1 with an optional quiet clause, the standfirst, the line on
// my role and an optional row of compact buttons. The old shape (no quiet, no actions) is unchanged.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CaseHead } from '@/components/work/CaseHead';

describe('CaseHead', () => {
  const plain = renderToStaticMarkup(<CaseHead id="t" chip="Case study" title="A title" intro={<p>Standfirst.</p>} role="My role." />);

  it('keeps its old shape when quiet and actions are not given', () => {
    expect(plain).toBe(
      '<div data-page-head="" data-case-head=""><span data-chip="">Case study</span>' +
        '<h1 id="t" class="max-w-[22em] text-h2-sm md:text-h2">A title</h1>' +
        '<div class="mt-4 max-w-text text-lg text-muted"><p>Standfirst.</p></div>' +
        '<p data-note-role="" class="mt-4 max-w-text">My role.</p></div>',
    );
  });

  it('sets a quiet clause inside the h1, which is 32 px or more, never below 24 px', () => {
    const html = renderToStaticMarkup(<CaseHead id="t" chip="C" title="Four ways a test can mislead," quiet="and the check for each." intro="i" />);
    expect(html).toMatch(/<h1 id="t" class="max-w-\[22em\] text-h2-sm md:text-h2">Four ways a test can mislead, <span data-quiet="">and the check for each\.<\/span><\/h1>/);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html.match(/data-quiet/g)).toHaveLength(1);
  });

  it('draws the actions as a row of compact secondary buttons after the standfirst and the role line', () => {
    const html = renderToStaticMarkup(
      <CaseHead
        id="t"
        chip="Build note"
        title="T"
        intro="i"
        role="My role."
        actions={[
          { href: 'https://github.com/example/repo', label: 'See the code on GitHub', icon: 'github', external: true },
          { href: '/lab', label: 'Open the live demo', variant: 'primary' },
        ]}
      />,
    );
    const row = /<div data-case-actions="" class="([^"]*)">([\s\S]*?)<\/div><\/div>$/.exec(html)!;
    expect(row[1]).toContain('flex-wrap');
    expect(html.indexOf('data-note-role')).toBeLessThan(html.indexOf('data-case-actions'));
    const anchors = [...row[2]!.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ attrs: m[1]!, body: m[2]! }));
    expect(anchors).toHaveLength(2);
    expect(anchors[0]!.attrs).toContain('href="https://github.com/example/repo"');
    expect(anchors[0]!.attrs).toContain('rel="noopener"');
    expect(anchors[0]!.attrs).toContain('border-hairline-strong bg-surface');
    expect(anchors[0]!.body).toMatch(/^<svg[\s\S]*<\/svg>See the code on GitHub$/);
    expect(anchors[1]!.attrs).toContain('bg-ink text-surface');
    for (const a of anchors) expect(a.attrs).toContain('min-h-(--size-target)');
  });

  it('draws no empty row', () => {
    expect(plain).not.toContain('data-case-actions');
    expect(renderToStaticMarkup(<CaseHead id="t" chip="C" title="T" intro="i" actions={[]} />)).not.toContain('data-case-actions');
  });
});
