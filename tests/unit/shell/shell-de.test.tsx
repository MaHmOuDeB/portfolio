// The shell in German: the navigation words, the links through localHref and the language menu.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/de/work' }));
vi.mock('@/lib/i18n/pages', () => ({
  DE_PAGES: ['/', '/work', '/about', '/lab', '/experiment', '/cv', '/contact', '/privacy'],
}));

import { SHELL_EN } from '../../../content/shell';
import { SHELL_DE } from '../../../content/de/shell';
import { Footer } from '@/components/shell/Footer';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { SkipLink } from '@/components/shell/SkipLink';
import { NAV } from '@/lib/site';

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const anchors = (html: string) =>
  [...html.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    attrs: m[1]!,
    href: /href="([^"]*)"/.exec(m[1]!)![1]!,
    text: text(m[2]!),
  }));

describe('the shell copy', () => {
  it('keeps the English labels the site always had', () => {
    expect(NAV.map((i) => i.label)).toEqual([SHELL_EN.nav.work, SHELL_EN.nav.about, SHELL_EN.nav.lab, SHELL_EN.nav.live]);
  });

  it('uses the German navigation words, exactly', () => {
    expect([SHELL_DE.nav.work, SHELL_DE.nav.about, SHELL_DE.nav.lab, SHELL_DE.nav.live, SHELL_DE.cv, SHELL_DE.contact, SHELL_DE.menu]).toEqual([
      'Projekte',
      'Über mich',
      'Lab',
      'Live-Test',
      'Lebenslauf',
      'Kontakt',
      'Menü',
    ]);
  });
});

describe('SiteHeader in German', () => {
  const html = renderToStaticMarkup(<SiteHeader locale="de" />);

  it('prints the German labels in the main nav and the Menu', () => {
    const main = /<nav aria-label="[^"]*" class="hidden lg:block"[\s\S]*?<\/nav>/.exec(html)![0];
    expect(anchors(main).map((a) => a.text)).toEqual(['Projekte', 'Über mich', 'Lab', 'Live-Test']);
    const menu = /<nav aria-label="Menü"[\s\S]*?<\/nav>/.exec(html)![0];
    expect(anchors(menu).map((a) => a.text)).toEqual(['Projekte', 'Über mich', 'Lab', 'Live-Test', 'Lebenslauf', 'Kontakt', 'English', 'Deutsch']);
    expect(html).toContain('>Menü</summary>');
  });

  it('sends every shell link through the German twin', () => {
    const hrefs = anchors(html).map((a) => a.href);
    expect(hrefs).toContain('/de');
    expect(hrefs).toEqual(expect.arrayContaining(['/de/work', '/de/about', '/de/lab', '/de/experiment', '/de/cv', '/de/contact']));
    // Only the "English" link leaves the German tree.
    const english = anchors(html).filter((a) => a.text === 'English').length;
    expect(hrefs.filter((h) => h === '/work')).toHaveLength(english);
    expect(hrefs).not.toContain('/cv');
  });

  it('marks the current page in the main nav and the current language', () => {
    expect(html.match(/aria-current="page"/g)).toHaveLength(2);
    expect(anchors(html).find((a) => a.attrs.includes('aria-current="page"'))!.href).toBe('/de/work');
    const german = anchors(html).filter((a) => a.text === 'Deutsch');
    expect(german.length).toBeGreaterThan(0);
    for (const a of german) expect(a.attrs).toContain('aria-current="true"');
    for (const a of anchors(html).filter((a) => a.text === 'English')) expect(a.attrs).not.toContain('aria-current');
  });

  it('draws two plain language links with hreflang and lang, each in its own language', () => {
    const en = anchors(html).filter((a) => a.text === 'English');
    const de = anchors(html).filter((a) => a.text === 'Deutsch');
    expect(en.map((a) => a.href)).toEqual(['/work', '/work']);
    expect(de.map((a) => a.href)).toEqual(['/de/work', '/de/work']);
    for (const a of en) expect(a.attrs).toMatch(/hreflang="en"[^>]*lang="en"/i);
    for (const a of de) expect(a.attrs).toMatch(/hreflang="de"[^>]*lang="de"/i);
    for (const a of [...en, ...de]) expect(a.attrs).toMatch(/min-h-(12|\(--size-target\))/);
  });

  it('keeps the language menu a details from lg and plain rows in the Menu, with data-menu on the Menu only', () => {
    expect(html).toMatch(/<details[^>]*data-menu=""/);
    expect(html.match(/data-menu=/g)).toHaveLength(1);
    expect(html).toMatch(/<details[^>]*data-language-menu[^>]*class="[^"]*hidden lg:block/);
    const menu = /<nav aria-label="Menü"[\s\S]*?<\/nav>/.exec(html)![0];
    expect(menu).not.toContain('<details');
  });
});

describe('SiteHeader in English', () => {
  const html = renderToStaticMarkup(<SiteHeader />);

  it('adds only the language menu: English first, current, and Deutsch pointing at the twin or /de', () => {
    expect(html).toMatch(/<details[^>]*data-menu=""/);
    const links = anchors(html).filter((a) => a.text === 'English' || a.text === 'Deutsch');
    expect(links.map((a) => `${a.text}:${a.href}`)).toEqual(['English:/work', 'Deutsch:/de/work', 'English:/work', 'Deutsch:/de/work']);
    expect(html).not.toContain('Projekte');
  });
});

describe('Footer and SkipLink in German', () => {
  const footer = renderToStaticMarkup(<Footer locale="de" />);

  it('prints German column titles and labels', () => {
    expect(footer).toContain('aria-label="Fußzeile"');
    expect(text(footer)).toContain('Lebenslauf');
    expect(text(footer)).toContain('Kontakt');
    expect(text(footer)).toContain('Datenschutz');
    expect(footer).toContain('id="footer-site"');
  });

  it('sends the site links through the German twin and leaves external links alone', () => {
    const links = anchors(footer);
    expect(links.find((a) => a.text === 'Projekte')!.href).toBe('/de/work');
    expect(links.find((a) => a.text === 'Datenschutz')!.href).toBe('/de/privacy');
    expect(links.find((a) => a.text === 'LinkedIn')!.href).toBe('https://www.linkedin.com/in/melbergui');
    expect(links[0]!.href).toBe('/de');
  });

  it('says skip to content in German', () => {
    expect(renderToStaticMarkup(<SkipLink locale="de" />)).toContain('Zum Inhalt springen');
    expect(renderToStaticMarkup(<SkipLink />)).toContain('Skip to content');
  });
});
