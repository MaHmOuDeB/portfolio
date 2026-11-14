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
    const cv = anchors.find((a) => a.text === 'CV' && a.attrs.includes('border-muted'))!;
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

  it('shows the links and buttons from lg and the Menu under it', () => {
    expect(MARKUP).toMatch(/<nav aria-label="Main" class="hidden lg:block"/);
    expect(MARKUP).toMatch(/<details[^>]*class="[^"]*lg:hidden/);
    expect(MARKUP).not.toMatch(/md:block|md:hidden/);
  });
});
