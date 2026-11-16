// The site header: page links in order, then the CV and Contact buttons, repeated inside the Menu.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/about' }));

import { SiteHeader } from '@/components/shell/SiteHeader';

const MARKUP = renderToStaticMarkup(<SiteHeader />);
const anchors = [...MARKUP.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)].map((m) => ({
  attrs: m[1]!,
  href: /href="([^"]*)"/.exec(m[1]!)![1]!,
  text: m[2]!.replace(/<[^>]*>/g, ''),
}));

describe('SiteHeader', () => {
  it('lists the page links in order: Work, About, Lab, Live test', () => {
    const main = /<nav aria-label="Main"[\s\S]*?<\/nav>/.exec(MARKUP)![0];
    const labels = [...main.matchAll(/<a [^>]*><span[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(labels).toEqual(['Work', 'About', 'Lab', 'Live test']);
  });

  it('marks the current page with aria-current', () => {
    expect(MARKUP.match(/aria-current="page"/g)).toHaveLength(2); // the Main list and the Menu list
    expect(anchors.find((a) => a.attrs.includes('aria-current'))!.href).toBe('/about');
  });

  it('has a secondary CV button and a primary Contact button after the page links', () => {
    const main = MARKUP.indexOf('aria-label="Main"');
    const cv = anchors.find((a) => a.text === 'CV' && a.attrs.includes('border-hairline-strong'))!;
    const contact = anchors.find((a) => a.text === 'Contact' && a.attrs.includes('bg-ink'))!;
    expect(cv.href).toBe('/cv');
    expect(contact.href).toBe('/contact');
    expect(MARKUP.indexOf(contact.attrs)).toBeGreaterThan(MARKUP.indexOf(cv.attrs));
    expect(MARKUP.indexOf(cv.attrs)).toBeGreaterThan(main);
  });

  it('puts the four links, CV and Contact in the Menu, in that order', () => {
    const menu = /<nav aria-label="Menu"[\s\S]*?<\/nav>/.exec(MARKUP)![0];
    const texts = [...menu.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map((m) => m[1]!.replace(/<[^>]*>/g, ''));
    expect(texts).toEqual(['Work', 'About', 'Lab', 'Live test', 'CV', 'Contact']);
    expect(menu).toMatch(/href="\/contact"[^>]*>/);
  });

  it('centres the four links between the wordmark and the buttons from lg, with compact buttons', () => {
    expect(MARKUP).toMatch(/<div class="[^"]*lg:grid lg:grid-cols-\[1fr_auto_1fr\][^"]*">\s*<a [^>]*href="\/"/);
    const main = MARKUP.indexOf('aria-label="Main"');
    const buttons = MARKUP.indexOf('lg:justify-self-end');
    expect(main).toBeGreaterThan(-1);
    expect(buttons).toBeGreaterThan(main);
    const cv = anchors.find((a) => a.text === 'CV' && a.attrs.includes('border-hairline-strong'))!;
    expect(cv.attrs).toContain('px-3');
    expect(cv.attrs).not.toContain('px-3.5');
  });

  it('opens the Menu as a full-width sheet under the header, placed against the header itself', () => {
    const details = /<details[^>]*class="([^"]*)"/.exec(MARKUP)![1]!.split(' ');
    // Not positioned: the header (relative, or sticky from md) is the panel's containing block.
    expect(details).toEqual(['group', 'lg:hidden']);
    const menu = /<nav aria-label="Menu" class="([^"]*)"/.exec(MARKUP)![1]!.split(' ');
    expect(menu).toEqual(
      expect.arrayContaining(['absolute', 'inset-x-0', 'top-full', 'mt-px', 'z-(--z-menu)', 'border-b', 'border-hairline', 'bg-bg', 'px-4', 'md:px-8']),
    );
    expect(menu.some((c) => /^(w-|max-w-|right-|rounded)/.test(c))).toBe(false);
  });

  it('draws the Menu rows full width and at least 48 px, ruled by hairlines, with CV and Contact side by side', () => {
    const menu = /<nav aria-label="Menu"[\s\S]*?<\/nav>/.exec(MARKUP)![0];
    const list = /<ul class="([^"]*)"/.exec(menu)![1]!.replaceAll('&amp;', '&').split(' ');
    expect(list).toEqual(
      expect.arrayContaining(['flex', 'flex-col', '[&_a]:flex', '[&_a]:w-full', '[&_a]:min-h-12', '[&_a]:text-lg', '[&_li]:border-b', '[&_li]:border-hairline']),
    );
    const buttons = /<\/ul><div class="([^"]*)">/.exec(menu)![1]!.split(' ');
    expect(buttons).toEqual(expect.arrayContaining(['grid', 'grid-cols-2']));
  });

  it('draws Menu as a bordered button that shows when it is open, with a 44 px target', () => {
    const summary = /<summary[^>]*class="([^"]*)"/.exec(MARKUP)![1]!.split(' ');
    expect(summary).toEqual(
      expect.arrayContaining(['min-h-(--size-target)', 'min-w-(--size-target)', 'rounded-md', 'border', 'border-hairline-strong', 'bg-surface', 'group-open:border-ink']),
    );
    // The icon still shows from xs only, so the 320 px header keeps its layout.
    expect(MARKUP).toMatch(/<summary[^>]*>\s*<span class="hidden xs:inline-flex">/);
  });

  it('shows the links and buttons from lg and the Menu under it', () => {
    expect(MARKUP).toMatch(/<nav aria-label="Main" class="hidden lg:block"/);
    expect(MARKUP).toMatch(/<details[^>]*class="[^"]*lg:hidden/);
    expect(MARKUP).not.toMatch(/md:block|md:hidden/);
  });
});
