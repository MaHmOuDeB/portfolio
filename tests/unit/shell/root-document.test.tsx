import { existsSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// next/font only works under Next's compiler, so the test supplies the class name it would add.
vi.mock('@/app/fonts', () => ({ inter: { variable: 'font-inter-variable' } }));
vi.mock('@/components/depth/Lean', () => ({ Lean: () => <i data-test="lean" /> }));
vi.mock('@/components/shell/RegionFocus', () => ({ RegionFocus: () => <i data-test="region-focus" /> }));
vi.mock('@/components/shell/SiteHeader', () => ({ SiteHeader: () => <header data-test="header" /> }));
vi.mock('@/components/shell/Footer', () => ({ Footer: () => <footer data-test="footer" /> }));
vi.mock('@/components/shell/SkipLink', () => ({ SkipLink: () => <a data-test="skip" href="#main" /> }));

const SHELL: Array<[string, string]> = [
  ['Lean', 'data-test="lean"'],
  ['RegionFocus', 'data-test="region-focus"'],
  ['SkipLink', 'data-test="skip"'],
  ['the header', 'data-test="header"'],
  ['the footer', 'data-test="footer"'],
  ['the data-js script', "setAttribute('data-js','')"],
  ['the font variable', 'class="font-inter-variable"'],
  ['the main landmark', '<main id="main"'],
  ['the frame', 'data-frame'],
  ['the language', '<html lang="en"'],
];

function expectShell(html: string): void {
  for (const [name, needle] of SHELL) expect(html, name).toContain(needle);
  expect(html).toContain('BODY-MARK');
}

describe('the English root layout', () => {
  it('draws the whole shell around its children', async () => {
    const { default: Layout } = await import('@/app/(en)/layout');
    expectShell(renderToStaticMarkup(<Layout params={Promise.resolve({})}>BODY-MARK</Layout>));
  });
});

describe('the global not-found page', () => {
  it('draws the whole shell and the 404 body', async () => {
    const { default: GlobalNotFound } = await import('@/app/global-not-found');
    const html = renderToStaticMarkup(<GlobalNotFound />);
    expect(html).toContain('Page not found');
    expect(html).toContain('There is no page at this address.');
    expect(html).toContain('data-test="header"');
    expect(html).toContain('data-test="footer"');
    expect(html).toContain('data-test="lean"');
    expect(html).toContain('data-test="region-focus"');
    expect(html).toContain('data-test="skip"');
    expect(html).toContain("setAttribute('data-js','')");
    expect(html).toContain('<html lang="en"');
  });
});

describe('the shared root document', () => {
  it('takes its language from the locale', async () => {
    const { RootDocument } = await import('@/components/shell/RootDocument');
    expect(renderToStaticMarkup(<RootDocument locale="de">x</RootDocument>)).toContain('<html lang="de"');
  });
});

describe('next.config', () => {
  it('turns on the global not-found page', async () => {
    const config = (await import('../../../next.config.ts')).default;
    expect(config.experimental?.globalNotFound).toBe(true);
    expect(config.experimental?.serverActions).toEqual({ bodySizeLimit: '64kb' });
  });
});

describe('the root metadata', () => {
  it('keeps the icon file at the app root, above every root layout', () => {
    expect(existsSync('src/app/icon.svg')).toBe(true);
    expect(existsSync('src/app/(en)/icon.svg')).toBe(false);
    expect(existsSync('src/app/layout.tsx')).toBe(false);
  });

  it('shares one defaults helper with the English layout', async () => {
    const { rootMetadata } = await import('@/lib/seo/root-metadata');
    const meta = rootMetadata();
    expect(meta.metadataBase).toBeInstanceOf(URL);
    expect(meta.description).toBe('AI automation and experimentation analyst in Berlin.');
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image' });
    const layout = readFileSync('src/app/(en)/layout.tsx', 'utf8');
    expect(layout).toContain('rootMetadata');
  });
});
