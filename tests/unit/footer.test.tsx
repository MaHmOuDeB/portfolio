// The site footer: its links, and the one colophon line, pinned word for word.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Footer } from '@/components/shell/Footer';

const MARKUP = renderToStaticMarkup(<Footer />);

describe('Footer', () => {
  it('prints the colophon line exactly, once, as plain text', () => {
    expect(MARKUP.split('Built with Claude Code as pair-programmer.').length - 1).toBe(1);
    expect(MARKUP).toMatch(/<p [^>]*>Built with Claude Code as pair-programmer\.<\/p>/);
  });

  it('sets the line in the small text style, muted, with no link, number or motion', () => {
    const p = /<p ([^>]*)>Built with Claude Code as pair-programmer\.<\/p>/.exec(MARKUP)![1]!;
    expect(p).toContain('text-sm');
    expect(p).toContain('text-muted');
    expect(p).not.toMatch(/animate|transition|shadow|uppercase/);
  });

  it('keeps the four links', () => {
    for (const label of ['Email', 'LinkedIn', 'GitHub', 'Privacy']) expect(MARKUP).toContain(label);
  });
});
