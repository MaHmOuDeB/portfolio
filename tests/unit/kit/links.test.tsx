import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { TextLink } from '@/components/kit/TextLink';

describe('ButtonLink', () => {
  it('is a 44 px touch target with the primary fill', () => {
    const html = renderToStaticMarkup(
      <ButtonLink href="/lab" variant="primary">
        Try the lab
      </ButtonLink>,
    );
    expect(html).toContain('href="/lab"');
    expect(html).toContain('min-h-(--size-target)');
    expect(html).toContain('data-touch-target');
    expect(html).toContain('bg-ink text-bg');
    expect(html).toContain('Try the lab');
  });

  it('secondary has a 1 px muted border with ink text', () => {
    const html = renderToStaticMarkup(
      <ButtonLink href="/lab" variant="secondary">
        Lab
      </ButtonLink>,
    );
    expect(html).toContain('border border-muted');
    expect(html).toContain('text-ink');
  });

  it('a download is a plain anchor with the download attribute and an optional icon', () => {
    const html = renderToStaticMarkup(
      <ButtonLink href="/cv.pdf" variant="secondary" icon="download" download>
        CV (PDF)
      </ButtonLink>,
    );
    expect(html).toMatch(/<a [^>]*download=""/);
    expect(html).toContain('<svg');
  });

  it('an external link gets rel="noopener"', () => {
    const html = renderToStaticMarkup(
      <ButtonLink href="https://example.org" variant="primary" external>
        Elsewhere
      </ButtonLink>,
    );
    expect(html).toContain('rel="noopener"');
  });
});

describe('TextLink', () => {
  it('is muted with a muted underline, ink on hover and focus', () => {
    const html = renderToStaticMarkup(<TextLink href="/privacy">Privacy</TextLink>);
    expect(html).toContain('text-muted underline decoration-muted');
    expect(html).toContain('hover:text-ink focus-visible:text-ink');
    expect(html).not.toContain('data-touch-target');
  });

  it('standalone is a 44 px target', () => {
    const html = renderToStaticMarkup(
      <TextLink href="/privacy" standalone>
        Privacy
      </TextLink>,
    );
    expect(html).toContain('inline-flex min-h-(--size-target) items-center');
    expect(html).toContain('data-touch-target');
  });

  it('external adds rel="noopener" and the external icon; mailto is a plain anchor', () => {
    const external = renderToStaticMarkup(
      <TextLink href="https://example.org" external>
        Elsewhere
      </TextLink>,
    );
    expect(external).toContain('rel="noopener"');
    expect(external).toContain('<svg');
    const mail = renderToStaticMarkup(<TextLink href="mailto:a@b.c">Email</TextLink>);
    expect(mail).toContain('href="mailto:a@b.c"');
    expect(mail).not.toContain('rel=');
  });
});
