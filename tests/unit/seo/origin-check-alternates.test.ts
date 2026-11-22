// seo:origin-check reads hreflang alternates too: in the pages, the RSC payloads and the sitemap.
import { describe, expect, it } from 'vitest';
import { checkedCounts, findOriginProblems, type BuiltFile } from '../../../scripts/seo-origin-check.ts';

const HOST = 'site.example.com';
const ON = `https://${HOST}`;
const OFF = 'https://other.example.org';

const html = (alt: string) =>
  `<html><head><link rel="canonical" href="${ON}/de/work"/><link rel="alternate" hrefLang="en" href="${ON}/work"/><link rel="alternate" hrefLang="de" href="${alt}"/><link rel="alternate" type="application/rss+xml" href="${OFF}/feed"/></head></html>`;
const rsc = (alt: string) => `0:[["$","link",null,{"rel":"alternate","hrefLang":"de","href":"${alt}"}]]`;
const sitemap = (alt: string) =>
  `<urlset xmlns:xhtml="http://www.w3.org/1999/xhtml"><url><loc>${ON}/work</loc><xhtml:link rel="alternate" hreflang="de" href="${alt}"/></url></urlset>`;

const files = (alt: string): BuiltFile[] => [
  { path: 'server/app/de/work.html', text: html(alt) },
  { path: 'server/app/de/work.rsc', text: rsc(alt) },
  { path: 'server/app/sitemap.xml.body', text: sitemap(alt) },
];

describe('hreflang alternates on the canonical origin', () => {
  it('passes alternates on the canonical origin, and ignores an alternate with no hreflang', () => {
    expect(findOriginProblems(files(`${ON}/de/work`), HOST)).toEqual([]);
  });

  it('rejects a mutant: an alternate on another origin in each of the three places', () => {
    const problems = findOriginProblems(files(`${OFF}/de/work`), HOST);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('server/app/de/work.html: hreflang alternate'),
        expect.stringContaining('server/app/de/work.rsc: hreflang alternate'),
        expect.stringContaining('server/app/sitemap.xml.body: sitemap alternate'),
      ]),
    );
    expect(problems).toHaveLength(3);
  });

  it('rejects an alternate on the test origin', () => {
    expect(findOriginProblems(files('https://canonical.invalid/de/work'), HOST).length).toBeGreaterThanOrEqual(3);
  });

  it('counts the alternates it checked', () => {
    expect(checkedCounts(files(`${ON}/de/work`)).alternates).toBe(2 + 1);
  });
});
