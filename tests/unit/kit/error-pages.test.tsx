import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import GlobalError from '@/app/global-error';
import ErrorPage from '@/app/error';
import NotFound, { metadata } from '@/app/not-found';
import { CONTACT } from '@/lib/site';

// next/font only works under Next's compiler, so the test supplies the class name it would add.
vi.mock('@/app/fonts', () => ({ inter: { variable: 'font-inter-variable' } }));

const HEADING = 'This page could not load';
const BODY =
  'An error stopped this page from loading. Try again. If it happens again, send me the page address on LinkedIn.';
const STATUS_CODE = /\b(404|500)\b/;

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

function expectLinks(html: string): void {
  expect(html).toMatch(/<a [^>]*href="\/work"[^>]*>Work<\/a>/);
  expect(html).toMatch(/<a [^>]*href="\/lab"[^>]*>Lab<\/a>/);
  expect(html).toMatch(new RegExp(`<a [^>]*href="${CONTACT.linkedin}"[^>]*rel="noopener"[^>]*>LinkedIn<`));
  expect(html).not.toContain('mailto:');
}

describe('error boundary page', () => {
  const error = new Error('secret failure detail');
  const html = render(<ErrorPage error={error} retry={vi.fn()} reset={vi.fn()} />);

  it('states what happened in one heading and one body sentence group', () => {
    expect(html).toMatch(new RegExp(`<h1[^>]*>${HEADING}</h1>`));
    expect(html).toContain(BODY);
  });

  it('offers Try again as a real 44 px button', () => {
    expect(html).toMatch(/<button [^>]*data-touch-target[^>]*>Try again<\/button>/);
    expect(html).toMatch(/<button [^>]*type="button"/);
    expect(html).toContain('min-h-(--size-target)');
  });

  it('links to Work, Lab and Email', () => {
    expectLinks(html);
  });

  it('shows no status code and never the error message', () => {
    expect(html).not.toMatch(STATUS_CODE);
    expect(html).not.toContain('secret failure detail');
  });
});

describe('global error page', () => {
  const html = render(
    <GlobalError error={new Error('secret failure detail')} retry={vi.fn()} reset={vi.fn()} />,
  );

  it('is a full document with its own title, lang and body', () => {
    expect(html).toMatch(/<html [^>]*lang="en"/);
    expect(html).toContain('class="font-inter-variable"');
    expect(html).toContain('<body');
    expect(html).toContain(`<title>${HEADING}</title>`);
  });

  it('has the same copy, actions and rules as the error boundary page', () => {
    expect(html).toMatch(new RegExp(`<h1[^>]*>${HEADING}</h1>`));
    expect(html).toContain(BODY);
    expect(html).toMatch(/<button [^>]*data-touch-target[^>]*>Try again<\/button>/);
    expectLinks(html);
    expect(html).not.toMatch(STATUS_CODE);
    expect(html).not.toContain('secret failure detail');
  });
});

describe('not-found page', () => {
  const html = render(<NotFound />);

  it('has the approved title, heading and body', () => {
    expect(metadata.title).toBe('Page not found');
    expect(html).toMatch(/<h1[^>]*>Page not found<\/h1>/);
    expect(html).toContain(
      'There is no page at this address. Check the address, or start from one of these pages.',
    );
  });

  it('offers Work as the primary button, then Lab and Email as text links', () => {
    expect(html).toMatch(/<a [^>]*bg-ink[^>]*href="\/work"[^>]*>Work<\/a>/);
    expectLinks(html);
    expect(html).not.toContain('<button');
  });

  it('shows no status code', () => {
    expect(html).not.toMatch(STATUS_CODE);
  });
});
